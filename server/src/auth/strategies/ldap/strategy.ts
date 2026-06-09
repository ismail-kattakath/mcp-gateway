/**
 * LDAP/Active Directory Strategy
 *
 * Passport.js strategy wrapper for LDAP authentication.
 * Handles authentication, JIT provisioning, and role mapping.
 *
 * Related: Epic #20 (LDAP/AD Integration)
 */

import { Strategy as CustomStrategy } from 'passport-custom';
import type { Request } from 'express';
import { ldapProvidersModel } from '../../../storage/models/ldap-providers.js';
import { LDAPClient } from './client.js';
import { provisionLDAPUser, logAuthenticationAttempt } from './provisioning.js';
import { extractGroupNames } from './groups.js';
import logger from '../../../logging/logger.js';
import { sanitizeString } from '../../../logging/sanitizer.js';

/**
 * Cache for LDAP clients (one per provider)
 */
const clientCache = new Map<string, LDAPClient>();

/**
 * Create LDAP strategy for a provider
 *
 * @param providerName - LDAP provider name
 * @returns Passport Custom strategy
 */
export function createLDAPStrategy(providerName: string): CustomStrategy {
  logger.info('Creating LDAP strategy', { provider: sanitizeString(providerName) });

  return new CustomStrategy(async (req: Request, done) => {
    try {
      // Load provider config
      const provider = ldapProvidersModel.findByName(providerName);

      if (!provider) {
        logger.error('LDAP provider not found', { provider: sanitizeString(providerName) });
        return done(new Error(`LDAP provider not found: ${providerName}`));
      }

      if (!provider.enabled) {
        logger.error('LDAP provider disabled', { provider: sanitizeString(providerName) });
        return done(new Error(`LDAP provider disabled: ${providerName}`));
      }

      // Extract credentials from request body
      const { username, password } = req.body;

      if (!username || !password) {
        logger.warn('Missing credentials in LDAP authentication', {
          provider: sanitizeString(providerName),
        });
        return done(new Error('Missing username or password'));
      }

      // Get or create LDAP client
      let client = clientCache.get(providerName);

      if (!client) {
        client = new LDAPClient(provider);
        await client.initialize();
        clientCache.set(providerName, client);

        logger.info('LDAP client initialized and cached', {
          provider: sanitizeString(providerName),
        });
      }

      // Authenticate user
      logger.info('Attempting LDAP authentication', {
        provider: sanitizeString(providerName),
        username: sanitizeString(username),
      });

      const authResult = await client.authenticate(username, password);

      // Extract groups
      const groups = authResult.attributes.groups
        ? Array.isArray(authResult.attributes.groups)
          ? authResult.attributes.groups
          : [authResult.attributes.groups]
        : [];

      logger.info('LDAP authentication successful', {
        provider: sanitizeString(providerName),
        username: sanitizeString(username),
        dn: sanitizeString(authResult.dn),
        groupCount: groups.length,
      });

      // Log successful authentication
      await logAuthenticationAttempt(
        provider.id,
        providerName,
        username,
        true,
        authResult.dn,
        groups,
        undefined,
        (req as any).ip,
        (req as any).get?.('User-Agent')
      );

      // Provision user (JIT)
      const user = await provisionLDAPUser(
        {
          provider: providerName,
          dn: authResult.dn,
          attributes: authResult.attributes,
        },
        provider
      );

      logger.info('LDAP user provisioned', {
        provider: sanitizeString(providerName),
        userId: sanitizeString(user.id),
        username: sanitizeString(user.username),
        role: sanitizeString(user.role),
      });

      // Return user to Passport
      done(null, user);
    } catch (error) {
      const err = error as Error;
      logger.error('LDAP authentication failed', {
        provider: sanitizeString(providerName),
        error: sanitizeString(err.message),
      });

      // Log failed authentication
      try {
        const provider = ldapProvidersModel.findByName(providerName);
        if (provider) {
          await logAuthenticationAttempt(
            provider.id,
            providerName,
            (req.body as any).username || 'unknown',
            false,
            undefined,
            undefined,
            err.message,
            (req as any).ip,
            (req as any).get?.('User-Agent')
          );
        }
      } catch (logError) {
        // Ignore logging errors
      }

      done(err);
    }
  });
}

/**
 * Register LDAP strategies for all enabled providers
 *
 * @param passport - Passport instance
 */
export function registerLDAPStrategies(passport: any): void {
  try {
    const providers = ldapProvidersModel.list({ enabled: true });

    for (const provider of providers) {
      const strategyName = `ldap-${provider.name}`;
      const strategy = createLDAPStrategy(provider.name);

      passport.use(strategyName, strategy);

      logger.info('LDAP strategy registered', {
        provider: sanitizeString(provider.name),
        strategyName: sanitizeString(strategyName),
      });
    }

    logger.info('All LDAP strategies registered', { count: providers.length });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to register LDAP strategies', {
      error: sanitizeString(err.message),
    });
  }
}

/**
 * Destroy LDAP client for a provider
 *
 * Useful for cleanup or when provider config changes
 */
export async function destroyLDAPClient(providerName: string): Promise<void> {
  const client = clientCache.get(providerName);

  if (client) {
    await client.destroy();
    clientCache.delete(providerName);

    logger.info('LDAP client destroyed', { provider: sanitizeString(providerName) });
  }
}

/**
 * Destroy all LDAP clients
 */
export async function destroyAllLDAPClients(): Promise<void> {
  const providers = Array.from(clientCache.keys());

  for (const providerName of providers) {
    await destroyLDAPClient(providerName);
  }

  logger.info('All LDAP clients destroyed', { count: providers.length });
}

/**
 * Health check for LDAP provider
 */
export async function healthCheckLDAPProvider(providerName: string): Promise<boolean> {
  const client = clientCache.get(providerName);

  if (!client) {
    // Client not initialized - try to initialize
    const provider = ldapProvidersModel.findByName(providerName);

    if (!provider || !provider.enabled) {
      return false;
    }

    const newClient = new LDAPClient(provider);
    await newClient.initialize();
    clientCache.set(providerName, newClient);

    return newClient.healthCheck();
  }

  return client.healthCheck();
}

export default { createLDAPStrategy, registerLDAPStrategies, destroyLDAPClient, destroyAllLDAPClients, healthCheckLDAPProvider };
