/**
 * SAML 2.0 Strategy
 *
 * Passport.js strategy wrapper for SAML authentication.
 * Handles authentication, JIT provisioning, and role mapping.
 *
 * Related: Epic #19 (SAML SSO)
 */

import {
  Strategy as SAMLStrategy,
  type VerifiedCallback,
  type Profile,
} from '@node-saml/passport-saml';
import type { Request } from 'express';
import { samlProvidersModel } from '../../../storage/models/saml-providers.js';
import { provisionSAMLUser } from './provisioning.js';
import { extractAttributes } from './attributes.js';
import { validateAssertionId, validateConditions, storeAssertion } from './validation.js';
import logger from '../../../logging/logger.js';
import { sanitizeString } from '../../../logging/sanitizer.js';

/**
 * Create SAML strategy for a provider
 *
 * @param providerName - SAML provider name
 * @returns Passport SAML strategy
 */
export function createSAMLStrategy(providerName: string): SAMLStrategy {
  logger.info('Creating SAML strategy', { provider: sanitizeString(providerName) });

  // Load provider config upfront (for static config)
  const provider = samlProvidersModel.findByName(providerName);

  if (!provider) {
    throw new Error(`SAML provider not found: ${providerName}`);
  }

  if (!provider.enabled) {
    throw new Error(`SAML provider disabled: ${providerName}`);
  }

  // Build SAML options
  const options = {
    // IdP configuration
    entryPoint: provider.sso_url,
    issuer: provider.sp_entity_id,
    callbackUrl: provider.acs_url,
    cert: formatCertificate(provider.certificate),

    // Signature validation
    wantAssertionsSigned: provider.want_assertions_signed,
    wantAuthnResponseSigned: provider.want_response_signed,

    // Authentication
    forceAuthn: provider.force_authn,

    // Logout (optional)
    logoutUrl: provider.slo_url || undefined,

    // Audience validation
    audience: provider.sp_entity_id,

    // Identifier format
    identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',

    // Accept clock skew (5 minutes)
    acceptedClockSkewMs: 5 * 60 * 1000,

    // Decrypt assertions (disabled for now)
    decryptionPvk: undefined,

    // Pass request to verify callback
    passReqToCallback: true,
  };

  // Verify callback
  const verifyCallback = async (req: Request, profile: Profile | null, done: VerifiedCallback) => {
    try {
      if (!profile) {
        return done(new Error('No SAML profile received'));
      }

      logger.info('SAML assertion received', {
        provider: sanitizeString(providerName),
        nameId: sanitizeString(profile.nameID || ''),
        issuer: sanitizeString(profile.issuer || ''),
      });

      // Validate assertion ID (replay protection)
      const assertionId = profile.ID || profile.sessionIndex || `${Date.now()}`;
      if (!validateAssertionId(assertionId)) {
        logger.warn('SAML assertion replay detected', {
          provider: sanitizeString(providerName),
          assertionId: sanitizeString(assertionId),
        });
        return done(new Error('SAML assertion replay detected'));
      }

      // Validate conditions (NotBefore, NotOnOrAfter)
      const conditions = {
        notBefore: (profile as { notBefore?: string }).notBefore,
        notOnOrAfter: (profile as { notOnOrAfter?: string }).notOnOrAfter,
      };

      if (!validateConditions(conditions)) {
        logger.warn('SAML assertion conditions invalid', {
          provider: sanitizeString(providerName),
          conditions,
        });
        return done(new Error('SAML assertion conditions invalid'));
      }

      // Extract attributes using attribute mapping
      const attributes = extractAttributes(
        profile as unknown as Record<string, unknown>,
        provider.attribute_map
      );

      logger.debug('SAML attributes extracted', {
        provider: sanitizeString(providerName),
        email: sanitizeString(attributes.email || ''),
        username: sanitizeString(attributes.username || ''),
        groups: attributes.groups,
      });

      // Provision user (JIT)
      const user = await provisionSAMLUser(
        {
          provider: providerName,
          nameId: profile.nameID || '',
          sessionIndex: profile.sessionIndex,
          attributes,
        },
        provider
      );

      // Store assertion for audit
      await storeAssertion({
        id: assertionId,
        userId: user.id,
        providerName,
        nameId: profile.nameID || '',
        sessionIndex: profile.sessionIndex,
        attributes: attributes as unknown as Record<string, unknown>,
        notBefore: conditions.notBefore || new Date().toISOString(),
        notOnOrAfter: conditions.notOnOrAfter || new Date(Date.now() + 3600000).toISOString(),
        ipAddress: (req as any).ip,
        userAgent: (req as any).get?.('User-Agent'),
      });

      logger.info('SAML authentication successful', {
        provider: sanitizeString(providerName),
        userId: sanitizeString(user.id),
        username: sanitizeString(user.username),
      });

      // Return user to Passport (cast to satisfy passport type requirements)
      done(null, user as unknown as Record<string, unknown>);
    } catch (error) {
      const err = error as Error;
      logger.error('SAML authentication failed', {
        provider: sanitizeString(providerName),
        error: sanitizeString(err.message),
      });
      done(err);
    }
  };

  return new SAMLStrategy(options, verifyCallback, verifyCallback);
}

/**
 * Format certificate for passport-saml
 *
 * Adds PEM headers/footers if missing and ensures proper line breaks
 */
function formatCertificate(cert: string): string {
  // Remove existing PEM headers/footers and whitespace
  const cleaned = cert
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');

  // Add line breaks every 64 characters
  const lines: string[] = [];
  for (let i = 0; i < cleaned.length; i += 64) {
    lines.push(cleaned.slice(i, i + 64));
  }

  // Add PEM headers/footers
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
}

/**
 * Register SAML strategies for all enabled providers
 *
 * @param passport - Passport instance
 */
export function registerSAMLStrategies(passport: any): void {
  try {
    const providers = samlProvidersModel.list({ enabled: true });

    for (const provider of providers) {
      const strategyName = `saml-${provider.name}`;
      const strategy = createSAMLStrategy(provider.name);

      passport.use(strategyName, strategy);

      logger.info('SAML strategy registered', {
        provider: sanitizeString(provider.name),
        strategyName: sanitizeString(strategyName),
      });
    }

    logger.info('All SAML strategies registered', { count: providers.length });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to register SAML strategies', {
      error: sanitizeString(err.message),
    });
  }
}

export default { createSAMLStrategy, registerSAMLStrategies };
