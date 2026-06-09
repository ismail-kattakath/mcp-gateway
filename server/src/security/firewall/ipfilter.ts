/**
 * express-ipfilter wrapper for application-level IP filtering
 *
 * Provides IP allow/deny list functionality with CIDR support
 * Uses express-ipfilter for battle-tested IP filtering
 *
 * Related: Epic #23 (Network Security)
 */

import type { Request, Response, NextFunction } from 'express';
import { IpFilter, IpDeniedError } from 'express-ipfilter';
import { listFirewallRules } from '../../storage/models/firewall-rules.js';
import { loadFirewallConfig, type FirewallMode } from './config.js';
import logger, { sanitizeString } from '../../logging/logger.js';

/**
 * Create express-ipfilter middleware with rules from database
 */
export function createIpFilterMiddleware(tenant?: string | null) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    const config = await loadFirewallConfig(tenant ?? null);

    // If firewall disabled, allow all traffic
    if (!config.enabled) {
      return next();
    }

    // Load rules from database
    const rules = listFirewallRules({
      enabled: true,
      tenant: tenant ?? undefined,
    });

    // If no rules, apply mode default
    if (rules.length === 0) {
      if (config.mode === 'whitelist') {
        // Whitelist mode with no rules = deny all
        logger.warn('Firewall in whitelist mode with no rules - denying all traffic', {
          ip: sanitizeString(req.ip ?? 'unknown'),
          path: req.path,
        });
        res.set('X-Blocked-By', 'MCP-Gateway-Firewall');
        res.set('X-Block-Reason', 'No whitelist rules configured');
        return res.status(403).json({
          error: 'Forbidden',
          message: 'No firewall rules configured',
        });
      } else {
        // Blacklist mode with no rules = allow all
        return next();
      }
    }

    // Separate allow and deny rules
    const allowRules = rules.filter((r) => r.rule_type === 'allow').map((r) => r.ip_range);
    const denyRules = rules.filter((r) => r.rule_type === 'deny').map((r) => r.ip_range);

    // Apply rules based on mode
    if (config.mode === 'whitelist') {
      // Whitelist mode: Use allow rules
      if (allowRules.length === 0) {
        logger.warn('Firewall in whitelist mode with no allow rules - denying all traffic', {
          ip: sanitizeString(req.ip ?? 'unknown'),
          path: req.path,
        });
        res.set('X-Blocked-By', 'MCP-Gateway-Firewall');
        res.set('X-Block-Reason', 'No allow rules in whitelist mode');
        return res.status(403).json({
          error: 'Forbidden',
          message: 'IP not in allowlist',
        });
      }

      const filter = IpFilter(allowRules, {
        mode: 'allow',
        logLevel: 'deny',
        trustProxy: true,
        detectIp: (req) => req.ip ?? req.socket.remoteAddress ?? '',
      });

      return filter(req, res, (err) => {
        if (err instanceof IpDeniedError) {
          logger.warn('Firewall blocked request (whitelist mode)', {
            ip: sanitizeString(req.ip ?? 'unknown'),
            path: req.path,
            allowRules: allowRules.length,
          });
          res.set('X-Blocked-By', 'MCP-Gateway-Firewall');
          res.set('X-Block-Reason', 'IP not in allowlist');
          return res.status(403).json({
            error: 'Forbidden',
            message: 'IP not in allowlist',
          });
        }
        return next();
      });
    } else {
      // Blacklist mode: Use deny rules
      if (denyRules.length === 0) {
        // No deny rules, allow all
        return next();
      }

      const filter = IpFilter(denyRules, {
        mode: 'deny',
        logLevel: 'deny',
        trustProxy: true,
        detectIp: (req) => req.ip ?? req.socket.remoteAddress ?? '',
      });

      return filter(req, res, (err) => {
        if (err instanceof IpDeniedError) {
          logger.warn('Firewall blocked request (blacklist mode)', {
            ip: sanitizeString(req.ip ?? 'unknown'),
            path: req.path,
            denyRules: denyRules.length,
          });
          res.set('X-Blocked-By', 'MCP-Gateway-Firewall');
          res.set('X-Block-Reason', 'IP in denylist');
          return res.status(403).json({
            error: 'Forbidden',
            message: 'IP blocked',
          });
        }
        return next();
      });
    }
  };
}

/**
 * Test if an IP would be allowed/denied by firewall rules
 * (for CLI testing, no actual request)
 */
export async function testIpAgainstRules(
  ip: string,
  tenant?: string | null
): Promise<{ allowed: boolean; reason: string }> {
  const config = await loadFirewallConfig(tenant ?? null);

  if (!config.enabled) {
    return { allowed: true, reason: 'Firewall disabled' };
  }

  const rules = listFirewallRules({
    enabled: true,
    tenant: tenant ?? undefined,
  });

  if (rules.length === 0) {
    if (config.mode === 'whitelist') {
      return { allowed: false, reason: 'Whitelist mode with no rules' };
    } else {
      return { allowed: true, reason: 'Blacklist mode with no deny rules' };
    }
  }

  const allowRules = rules.filter((r) => r.rule_type === 'allow').map((r) => r.ip_range);
  const denyRules = rules.filter((r) => r.rule_type === 'deny').map((r) => r.ip_range);

  // Use ipaddr.js for CIDR matching (same library as express-ipfilter)
  const ipaddr = require('ipaddr.js');

  try {
    let addr = ipaddr.parse(ip);

    // Normalize IPv4-mapped IPv6
    if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) {
      addr = addr.toIPv4Address();
    }

    if (config.mode === 'whitelist') {
      // Check if IP matches any allow rule
      for (const rule of allowRules) {
        if (matchesCidr(addr, rule)) {
          return { allowed: true, reason: `Matches allow rule: ${rule}` };
        }
      }
      return { allowed: false, reason: 'IP not in allowlist' };
    } else {
      // Check if IP matches any deny rule
      for (const rule of denyRules) {
        if (matchesCidr(addr, rule)) {
          return { allowed: false, reason: `Matches deny rule: ${rule}` };
        }
      }
      return { allowed: true, reason: 'IP not in denylist' };
    }
  } catch (error) {
    return { allowed: false, reason: `Invalid IP address: ${error}` };
  }
}

/**
 * Check if an IP address matches a CIDR rule
 */
function matchesCidr(addr: any, rule: string): boolean {
  const ipaddr = require('ipaddr.js');

  try {
    if (rule.includes('/')) {
      // CIDR notation
      const [net, bits] = ipaddr.parseCIDR(rule);
      if (addr.kind() !== net.kind()) {
        return false;
      }
      return addr.match(net, bits);
    } else {
      // Single IP
      const ruleAddr = ipaddr.parse(rule);
      if (addr.kind() !== ruleAddr.kind()) {
        return false;
      }
      return addr.toString() === ruleAddr.toString();
    }
  } catch {
    return false;
  }
}
