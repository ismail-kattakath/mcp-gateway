/**
 * SAML Assertion Validation
 *
 * Validates SAML assertions and prevents replay attacks.
 * Tracks assertion IDs to ensure single-use.
 *
 * Related: Epic #19 (SAML SSO)
 */

import logger from '../../../logging/logger.js';
import { sanitizeString } from '../../../logging/sanitizer.js';

/**
 * Store assertion IDs in memory (with TTL)
 * In production, use Redis or database for distributed systems
 */
const assertionCache = new Map<string, number>();

/**
 * Cleanup interval (5 minutes)
 */
const CLEANUP_INTERVAL = 5 * 60 * 1000;

/**
 * Assertion TTL (24 hours)
 */
const ASSERTION_TTL = 24 * 60 * 60 * 1000;

/**
 * Start cleanup timer
 */
let cleanupTimer: NodeJS.Timeout | null = null;

/**
 * Initialize assertion validation
 */
export function initializeValidation(): void {
  if (!cleanupTimer) {
    cleanupTimer = setInterval(cleanupExpiredAssertions, CLEANUP_INTERVAL);
    logger.info('SAML assertion validation initialized');
  }
}

/**
 * Stop validation (for testing)
 */
export function stopValidation(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
    assertionCache.clear();
    logger.info('SAML assertion validation stopped');
  }
}

/**
 * Check if assertion ID has been used before (replay protection)
 *
 * @param assertionId - SAML assertion ID
 * @returns true if assertion is new (valid), false if already used (replay)
 */
export function validateAssertionId(assertionId: string): boolean {
  // Check if assertion ID already exists
  if (assertionCache.has(assertionId)) {
    logger.warn('SAML assertion replay detected', {
      assertionId: sanitizeString(assertionId),
    });
    return false;
  }

  // Store assertion ID with current timestamp
  const now = Date.now();
  assertionCache.set(assertionId, now);

  logger.debug('SAML assertion ID validated and cached', {
    assertionId: sanitizeString(assertionId),
    cacheSize: assertionCache.size,
  });

  return true;
}

/**
 * Store assertion in database for audit
 *
 * @param assertion - Assertion data
 */
export async function storeAssertion(assertion: {
  id: string;
  userId: string;
  providerName: string;
  nameId: string;
  sessionIndex?: string;
  attributes: Record<string, unknown>;
  notBefore: string;
  notOnOrAfter: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    const { getDatabase } = await import('../../../storage/database.js');
    const db = getDatabase();

    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO saml_assertions
       (id, user_id, provider_name, nameid, session_index, attributes, not_before, not_on_or_after, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      assertion.id,
      assertion.userId,
      assertion.providerName,
      assertion.nameId,
      assertion.sessionIndex || null,
      JSON.stringify(assertion.attributes),
      assertion.notBefore,
      assertion.notOnOrAfter,
      assertion.ipAddress || null,
      assertion.userAgent || null,
      now
    );

    logger.info('SAML assertion stored for audit', {
      assertionId: sanitizeString(assertion.id),
      userId: sanitizeString(assertion.userId),
      providerName: sanitizeString(assertion.providerName),
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to store SAML assertion', {
      assertionId: sanitizeString(assertion.id),
      error: sanitizeString(err.message),
    });
    // Don't throw - this is audit only, shouldn't block login
  }
}

/**
 * Cleanup expired assertions from cache
 */
function cleanupExpiredAssertions(): void {
  const now = Date.now();
  const expired: string[] = [];

  for (const [id, timestamp] of assertionCache.entries()) {
    if (now - timestamp > ASSERTION_TTL) {
      expired.push(id);
    }
  }

  for (const id of expired) {
    assertionCache.delete(id);
  }

  if (expired.length > 0) {
    logger.debug('Cleaned up expired SAML assertions', {
      count: expired.length,
      remaining: assertionCache.size,
    });
  }
}

/**
 * Cleanup expired assertions from database
 *
 * Should be called by a cron job (e.g., daily)
 */
export async function cleanupExpiredAssertionsFromDB(): Promise<void> {
  try {
    const { getDatabase } = await import('../../../storage/database.js');
    const db = getDatabase();

    // Delete assertions older than 90 days
    const result = db
      .prepare("DELETE FROM saml_assertions WHERE created_at < datetime('now', '-90 days')")
      .run();

    logger.info('Cleaned up expired SAML assertions from database', {
      deleted: result.changes,
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to cleanup SAML assertions from database', {
      error: sanitizeString(err.message),
    });
  }
}

/**
 * Validate SAML conditions (NotBefore, NotOnOrAfter)
 *
 * @param conditions - SAML conditions
 * @returns true if valid, false otherwise
 */
export function validateConditions(conditions: {
  notBefore?: string;
  notOnOrAfter?: string;
}): boolean {
  const now = new Date();

  // Check NotBefore
  if (conditions.notBefore) {
    const notBefore = new Date(conditions.notBefore);
    if (now < notBefore) {
      logger.warn('SAML assertion not yet valid', {
        notBefore: conditions.notBefore,
        now: now.toISOString(),
      });
      return false;
    }
  }

  // Check NotOnOrAfter
  if (conditions.notOnOrAfter) {
    const notOnOrAfter = new Date(conditions.notOnOrAfter);
    if (now >= notOnOrAfter) {
      logger.warn('SAML assertion expired', {
        notOnOrAfter: conditions.notOnOrAfter,
        now: now.toISOString(),
      });
      return false;
    }
  }

  return true;
}

/**
 * Get cached assertion count (for monitoring)
 */
export function getCachedAssertionCount(): number {
  return assertionCache.size;
}

export default {
  initializeValidation,
  stopValidation,
  validateAssertionId,
  storeAssertion,
  cleanupExpiredAssertionsFromDB,
  validateConditions,
  getCachedAssertionCount,
};
