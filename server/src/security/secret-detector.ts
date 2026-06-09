/**
 * Secret Detector
 *
 * Detects potential secrets in configuration files and logs warnings.
 * Prevents accidental secret exposure in registry.json and other configs.
 *
 * Detects:
 * - API keys, tokens, passwords
 * - AWS keys, GitHub tokens
 * - JWTs, private keys
 * - Database connection strings with credentials
 */

import logger, { sanitizeString } from '../logging/logger.js';
import type { Registry } from '../types/registry.js';

/**
 * Secret pattern definitions
 */
interface SecretPattern {
  name: string;
  pattern: RegExp;
  severity: 'high' | 'medium' | 'low';
  description: string;
}

/**
 * Comprehensive list of secret patterns
 */
const SECRET_PATTERNS: SecretPattern[] = [
  // Generic API keys and tokens
  {
    name: 'API Key',
    pattern: /api[_-]?key\s*[:=]\s*['"]?[a-zA-Z0-9_-]{20,}['"]?/gi,
    severity: 'high',
    description: 'API key detected',
  },
  {
    name: 'Auth Token',
    pattern: /auth[_-]?token\s*[:=]\s*['"]?[a-zA-Z0-9_-]{20,}['"]?/gi,
    severity: 'high',
    description: 'Authentication token detected',
  },
  {
    name: 'Bearer Token',
    pattern: /bearer\s+[a-zA-Z0-9_\-.]{20,}/gi,
    severity: 'high',
    description: 'Bearer token detected',
  },
  {
    name: 'Password',
    pattern: /password\s*[:=]\s*['"][^'"]{8,}['"]/gi,
    severity: 'high',
    description: 'Password detected',
  },
  {
    name: 'Secret',
    pattern: /secret\s*[:=]\s*['"]?[a-zA-Z0-9]{16,}['"]?/gi,
    severity: 'high',
    description: 'Secret value detected',
  },

  // AWS credentials
  {
    name: 'AWS Access Key',
    pattern: /(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
    severity: 'high',
    description: 'AWS access key detected',
  },
  {
    name: 'AWS Secret Key',
    pattern: /aws[_-]?secret[_-]?access[_-]?key\s*[:=]\s*['"]?[a-zA-Z0-9/+=]{40}['"]?/gi,
    severity: 'high',
    description: 'AWS secret access key detected',
  },

  // GitHub tokens
  {
    name: 'GitHub Personal Access Token',
    pattern: /ghp_[a-zA-Z0-9]{30,}/g,
    severity: 'high',
    description: 'GitHub personal access token detected',
  },
  {
    name: 'GitHub OAuth Token',
    pattern: /gho_[a-zA-Z0-9]{30,}/g,
    severity: 'high',
    description: 'GitHub OAuth token detected',
  },
  {
    name: 'GitHub App Token',
    pattern: /ghs_[a-zA-Z0-9]{30,}/g,
    severity: 'high',
    description: 'GitHub app token detected',
  },

  // JWTs
  {
    name: 'JWT Token',
    pattern: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
    severity: 'high',
    description: 'JWT token detected',
  },

  // Private keys
  {
    name: 'RSA Private Key',
    pattern: /-----BEGIN RSA PRIVATE KEY-----/g,
    severity: 'high',
    description: 'RSA private key detected',
  },
  {
    name: 'Private Key',
    pattern: /-----BEGIN PRIVATE KEY-----/g,
    severity: 'high',
    description: 'Private key detected',
  },
  {
    name: 'SSH Private Key',
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----/g,
    severity: 'high',
    description: 'SSH private key detected',
  },

  // Database connection strings
  {
    name: 'PostgreSQL Connection String',
    pattern: /postgresql:\/\/[^:]+:[^@]+@[^/]+/gi,
    severity: 'high',
    description: 'PostgreSQL connection string with credentials detected',
  },
  {
    name: 'MySQL Connection String',
    pattern: /mysql:\/\/[^:]+:[^@]+@[^/]+/gi,
    severity: 'high',
    description: 'MySQL connection string with credentials detected',
  },
  {
    name: 'MongoDB Connection String',
    pattern: /mongodb(?:\+srv)?:\/\/[^:]+:[^@]+@[^/]+/gi,
    severity: 'high',
    description: 'MongoDB connection string with credentials detected',
  },

  // Cloud provider tokens
  {
    name: 'Google Cloud API Key',
    pattern: /AIza[0-9A-Za-z_-]{35}/g,
    severity: 'high',
    description: 'Google Cloud API key detected',
  },
  {
    name: 'Stripe Secret Key',
    pattern: /sk_live_[0-9a-zA-Z]{24,}/g,
    severity: 'high',
    description: 'Stripe secret key detected',
  },
  {
    name: 'Twilio API Key',
    pattern: /SK[0-9a-fA-F]{32}/g,
    severity: 'medium',
    description: 'Twilio API key detected',
  },

  // Generic patterns
  {
    name: 'Base64 Encoded String',
    pattern: /['"][A-Za-z0-9+/]{40,}={0,2}['"]/g,
    severity: 'low',
    description: 'Long base64-encoded string detected (potential secret)',
  },
  {
    name: 'Hex Encoded String',
    pattern: /['"][0-9a-fA-F]{40,}['"]/g,
    severity: 'low',
    description: 'Long hex-encoded string detected (potential secret)',
  },
];

/**
 * Detection result
 */
export interface SecretDetection {
  pattern: string;
  location: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  line?: number;
  context?: string;
}

/**
 * Secret Detector class
 */
export class SecretDetector {
  private patterns: SecretPattern[];

  constructor(customPatterns?: SecretPattern[]) {
    this.patterns = [...SECRET_PATTERNS, ...(customPatterns ?? [])];
  }

  /**
   * Detect secrets in a string
   */
  detect(text: string, location = 'unknown'): SecretDetection[] {
    const detections: SecretDetection[] = [];

    for (const pattern of this.patterns) {
      const matches = text.matchAll(pattern.pattern);

      for (const match of matches) {
        detections.push({
          pattern: pattern.name,
          location,
          severity: pattern.severity,
          description: pattern.description,
          context: this.extractContext(text, match.index ?? 0),
        });
      }
    }

    return detections;
  }

  /**
   * Extract context around a match (10 chars before and after)
   */
  private extractContext(text: string, index: number, contextSize = 10): string {
    const start = Math.max(0, index - contextSize);
    const end = Math.min(text.length, index + contextSize);
    let context = text.substring(start, end);

    // Replace the actual secret with [REDACTED]
    context = context.replace(/[a-zA-Z0-9+/=_-]{10,}/g, '[REDACTED]');

    return sanitizeString(context, 50);
  }

  /**
   * Detect secrets in a JSON object
   */
  detectInObject(obj: unknown, path = 'root'): SecretDetection[] {
    const detections: SecretDetection[] = [];

    if (typeof obj === 'string') {
      detections.push(...this.detect(obj, path));
    } else if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        detections.push(...this.detectInObject(item, `${path}[${index}]`));
      });
    } else if (obj !== null && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        // Check key names for sensitive fields
        if (/password|secret|token|key|credential/i.test(key)) {
          detections.push({
            pattern: 'Sensitive Field Name',
            location: `${path}.${key}`,
            severity: 'medium',
            description: `Potentially sensitive field: ${key}`,
          });
        }

        detections.push(...this.detectInObject(value, `${path}.${key}`));
      }
    }

    return detections;
  }

  /**
   * Scan a registry configuration for secrets
   */
  scanRegistry(registry: Registry): SecretDetection[] {
    const detections = this.detectInObject(registry, 'registry');

    // Log warnings for detected secrets
    if (detections.length > 0) {
      const highSeverity = detections.filter((d) => d.severity === 'high');
      const mediumSeverity = detections.filter((d) => d.severity === 'medium');
      const lowSeverity = detections.filter((d) => d.severity === 'low');

      if (highSeverity.length > 0) {
        logger.warn('⚠️  HIGH SEVERITY: Potential secrets detected in registry.json', {
          count: highSeverity.length,
          message: 'Use environment variables or secrets manager instead',
          detections: highSeverity.map((d) => ({
            pattern: d.pattern,
            location: d.location,
            description: d.description,
          })),
        });
      }

      if (mediumSeverity.length > 0) {
        logger.warn('⚠️  MEDIUM SEVERITY: Potentially sensitive data in registry.json', {
          count: mediumSeverity.length,
          detections: mediumSeverity.map((d) => ({
            pattern: d.pattern,
            location: d.location,
          })),
        });
      }

      if (lowSeverity.length > 0) {
        logger.info('Possible encoded values detected in registry.json', {
          count: lowSeverity.length,
          message: 'Review if these should be in secrets manager',
        });
      }

      // Log recommendations
      logger.info('Security recommendation: Use environment variables or secrets manager', {
        examples: [
          'Environment variable: "env": {"API_KEY": "${MY_API_KEY}"}',
          'Secrets manager: "env": {"API_KEY": "${SECRET:MY_API_KEY}"}',
        ],
      });
    }

    return detections;
  }

  /**
   * Scan a file for secrets
   */
  async scanFile(filePath: string): Promise<SecretDetection[]> {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');
      return this.detect(content, filePath);
    } catch (error) {
      logger.error('Failed to scan file for secrets', {
        filePath: sanitizeString(filePath),
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Generate a security report
   */
  generateReport(detections: SecretDetection[]): {
    summary: { high: number; medium: number; low: number; total: number };
    detections: SecretDetection[];
  } {
    const summary = {
      high: detections.filter((d) => d.severity === 'high').length,
      medium: detections.filter((d) => d.severity === 'medium').length,
      low: detections.filter((d) => d.severity === 'low').length,
      total: detections.length,
    };

    return { summary, detections };
  }
}

/**
 * Singleton instance
 */
export const secretDetector = new SecretDetector();

export default secretDetector;
