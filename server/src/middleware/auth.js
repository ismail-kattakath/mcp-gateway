/**
 * Gateway authentication + IP allowlist middleware.
 *
 * Behaviour:
 *   - If `gateway.security.enableAuth` is false (default), every request passes.
 *   - If enabled, every request must have `Authorization: Bearer <apiKey>` —
 *     OR, only for browser-based clients that can't set custom headers on
 *     `new EventSource(...)`, an `?access_token=<apiKey>` query param.
 *   - If `gateway.security.allowedIPs` is non-empty, the client IP (as resolved
 *     by Express with `trust proxy` set) must match at least one CIDR entry.
 *   - `/health` is always exempt so external uptime monitors can probe it.
 *
 * Failures use generic messages to avoid leaking config.
 */

import { createRequire } from 'module';
import crypto from 'crypto';
import logger from '../logging/logger.js';

const require = createRequire(import.meta.url);
const ipaddr = require('ipaddr.js');

const HEALTH_PATH = '/health';

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function parseCidrs(entries, name) {
  const parsed = [];
  for (const entry of entries) {
    try {
      // ipaddr.parseCIDR throws on plain IPs — fall back to /32 (or /128 for v6).
      if (entry.includes('/')) {
        parsed.push(ipaddr.parseCIDR(entry));
      } else {
        const addr = ipaddr.parse(entry);
        const bits = addr.kind() === 'ipv6' ? 128 : 32;
        parsed.push([addr, bits]);
      }
    } catch (error) {
      logger.warn(`Invalid CIDR entry in ${name}: "${entry}" (${error.message})`);
    }
  }
  return parsed;
}

function ipMatches(clientIp, cidrs) {
  if (!cidrs.length) return true;
  try {
    let addr = ipaddr.parse(clientIp);
    // Normalise IPv4-mapped-in-IPv6 (::ffff:127.0.0.1) to plain IPv4 so the
    // CIDR list can use familiar v4 notation.
    if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) {
      addr = addr.toIPv4Address();
    }
    for (const [net, bits] of cidrs) {
      if (addr.kind() !== net.kind()) continue;
      if (addr.match(net, bits)) return true;
    }
  } catch (error) {
    logger.warn(`Unparseable client IP: ${clientIp}`);
  }
  return false;
}

/**
 * Build the auth middleware from the resolved gateway.security block.
 * Returns an Express middleware function.
 */
export function createAuthMiddleware(security = {}) {
  const enabled = !!security.enableAuth;
  const apiKey = security.apiKey || '';
  const allowedCidrs = parseCidrs(security.allowedIPs || [], 'gateway.security.allowedIPs');

  if (enabled && !apiKey) {
    throw new Error(
      'gateway.security.enableAuth is true but gateway.security.apiKey is empty. ' +
      'Set GATEWAY_API_KEY in .env and reference it as ${GATEWAY_API_KEY}.'
    );
  }

  if (enabled) {
    logger.info('Gateway auth enabled', {
      apiKeyLength: apiKey.length,
      allowedIPCount: allowedCidrs.length
    });
  } else {
    logger.info('Gateway auth disabled (gateway.security.enableAuth is false)');
  }

  return function authMiddleware(req, res, next) {
    if (req.path === HEALTH_PATH) return next();
    if (!enabled && !allowedCidrs.length) return next();

    // IP allowlist applies even when bearer auth is off — defence in depth.
    if (allowedCidrs.length && !ipMatches(req.ip, allowedCidrs)) {
      logger.warn('Rejected request: client IP not in allowlist', { ip: req.ip, path: req.path });
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!enabled) return next();

    const presented = extractToken(req);
    if (!presented || !constantTimeEqual(presented, apiKey)) {
      logger.warn('Rejected request: missing or invalid auth token', { ip: req.ip, path: req.path });
      // Hint clients with the standard WWW-Authenticate header.
      res.set('WWW-Authenticate', 'Bearer realm="mcp-gateway"');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    return next();
  };
}

function extractToken(req) {
  const header = req.get('Authorization') || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1].trim();
  // EventSource in browsers can't set headers — accept ?access_token= for /sse only.
  if (req.path === '/sse' && typeof req.query.access_token === 'string') {
    return req.query.access_token;
  }
  return null;
}

export default { createAuthMiddleware };
