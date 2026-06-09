/**
 * Caddy Admin API client
 *
 * Communicates with Caddy's admin API to dynamically update configuration
 * without restarts.
 *
 * API Documentation: https://caddyserver.com/docs/api
 */

import axios, { AxiosInstance } from 'axios';
import logger from '../logging/logger.js';
import { sanitizeUrl } from '../logging/sanitizer.js';

export interface CaddyConfig {
  adminUrl: string;
  timeout?: number;
}

export interface CaddyUpstream {
  dial: string; // e.g., "gateway:3000"
  healthy: boolean;
}

export interface CaddyRoute {
  handle: Array<{
    handler: string;
    upstreams?: CaddyUpstream[];
  }>;
  match?: Array<{
    host?: string[];
  }>;
}

export class CaddyClient {
  private client: AxiosInstance;
  private adminUrl: string;

  constructor(config: CaddyConfig) {
    this.adminUrl = config.adminUrl || 'http://localhost:2019';
    this.client = axios.create({
      baseURL: this.adminUrl,
      timeout: config.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    logger.info('Caddy client initialized', { adminUrl: sanitizeUrl(this.adminUrl) });
  }

  /**
   * Check if Caddy is reachable
   */
  async ping(): Promise<boolean> {
    try {
      const response = await this.client.get('/config/');
      return response.status === 200;
    } catch (error) {
      logger.error('Caddy ping failed', { error });
      return false;
    }
  }

  /**
   * Get current Caddy configuration
   */
  async getConfig(): Promise<any> {
    try {
      const response = await this.client.get('/config/');
      return response.data;
    } catch (error) {
      logger.error('Failed to get Caddy config', { error });
      throw new Error('Failed to retrieve Caddy configuration');
    }
  }

  /**
   * Sanitize Caddyfile content before sending to Caddy API
   * Prevents file access to HTTP security issues by validating content
   */
  private sanitizeCaddyfile(caddyfile: string): string {
    if (typeof caddyfile !== 'string') {
      throw new Error('Caddyfile must be a string');
    }

    // Remove null bytes and control characters that could cause issues
    // eslint-disable-next-line no-control-regex
    const sanitized = caddyfile.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Basic validation: ensure it's not empty after sanitization
    if (sanitized.trim().length === 0) {
      throw new Error('Caddyfile is empty after sanitization');
    }

    // Prevent excessively large configs (DoS prevention)
    const maxSize = 1024 * 1024; // 1MB
    if (sanitized.length > maxSize) {
      throw new Error(`Caddyfile too large: ${sanitized.length} bytes (max ${maxSize})`);
    }

    return sanitized;
  }

  /**
   * Reload Caddy configuration from Caddyfile
   *
   * This sends a POST request to /load with the Caddyfile content
   */
  async reload(caddyfile: string): Promise<void> {
    try {
      logger.info('Reloading Caddy configuration');

      // Sanitize caddyfile content before sending to API
      const sanitizedCaddyfile = this.sanitizeCaddyfile(caddyfile);

      const response = await this.client.post('/load', sanitizedCaddyfile, {
        headers: {
          'Content-Type': 'text/caddyfile',
        },
      });

      if (response.status === 200) {
        logger.info('Caddy configuration reloaded successfully');
      } else {
        throw new Error(`Unexpected status: ${response.status}`);
      }
    } catch (error: any) {
      logger.error('Failed to reload Caddy config', {
        error: error.message,
        response: error.response?.data,
      });
      throw new Error(`Failed to reload Caddy: ${error.message}`);
    }
  }

  /**
   * Get upstream health status
   */
  async getUpstreams(): Promise<CaddyUpstream[]> {
    try {
      const response = await this.client.get('/reverse_proxy/upstreams');
      return response.data;
    } catch (error) {
      logger.error('Failed to get Caddy upstreams', { error });
      return [];
    }
  }

  /**
   * Validate Caddyfile syntax (client-side check)
   *
   * Note: Full validation happens server-side when reloading
   */
  validateCaddyfile(caddyfile: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Basic syntax checks
    if (!caddyfile || caddyfile.trim().length === 0) {
      errors.push('Caddyfile is empty');
      return { valid: false, errors };
    }

    // Check for balanced braces
    const openBraces = (caddyfile.match(/{/g) || []).length;
    const closeBraces = (caddyfile.match(/}/g) || []).length;

    if (openBraces !== closeBraces) {
      errors.push(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
    }

    // Check for global options block
    if (!caddyfile.includes('{') || caddyfile.indexOf('{') > caddyfile.indexOf('\n{')) {
      // Global block should be at the start
      // This is a soft warning
    }

    // Check for reverse_proxy directive
    if (!caddyfile.includes('reverse_proxy')) {
      errors.push('No reverse_proxy directive found');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get TLS certificates
   */
  async getCertificates(): Promise<any[]> {
    try {
      const response = await this.client.get('/pki/certificates/local');
      return response.data || [];
    } catch (error) {
      logger.error('Failed to get Caddy certificates', { error });
      return [];
    }
  }

  /**
   * Test connection to Caddy admin API
   */
  static async testConnection(adminUrl: string): Promise<boolean> {
    try {
      const response = await axios.get(`${adminUrl}/config/`, {
        timeout: 5000,
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Generate Caddyfile block for a domain
 */
export function generateDomainBlock(
  domain: string,
  options: {
    upstreamUrl?: string;
    tlsEnabled?: boolean;
    tlsProtocols?: string[];
    tlsCiphers?: string[];
    customCert?: { cert: string; key: string };
    securityHeaders?: boolean;
  } = {}
): string {
  const upstream = options.upstreamUrl || 'gateway:3000';
  const tlsProtocols = options.tlsProtocols || ['tls1.3'];
  const tlsCiphers = options.tlsCiphers || [
    'TLS_AES_128_GCM_SHA256',
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
  ];
  const securityHeaders = options.securityHeaders !== false; // Default true

  let block = `\n# ${domain}\n${domain} {\n`;

  // Reverse proxy
  block += `    reverse_proxy ${upstream} {\n`;
  block += `        health_uri /health\n`;
  block += `        health_interval 30s\n`;
  block += `        health_timeout 10s\n`;
  block += `\n`;
  block += `        header_up X-Real-IP {remote_host}\n`;
  block += `        header_up X-Forwarded-For {remote_host}\n`;
  block += `        header_up X-Forwarded-Proto {scheme}\n`;
  block += `    }\n\n`;

  // TLS configuration
  if (options.tlsEnabled !== false) {
    block += `    tls {\n`;

    if (options.customCert) {
      block += `        # Custom certificate (path on Caddy container)\n`;
      block += `        # cert ${options.customCert.cert}\n`;
      block += `        # key ${options.customCert.key}\n`;
    }

    block += `        protocols ${tlsProtocols.join(' ')}\n`;

    if (tlsCiphers.length > 0) {
      block += `        ciphers ${tlsCiphers.join(' ')}\n`;
    }

    block += `    }\n\n`;
  }

  // Security headers
  if (securityHeaders) {
    block += `    header {\n`;
    block += `        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"\n`;
    block += `        X-Frame-Options "DENY"\n`;
    block += `        X-Content-Type-Options "nosniff"\n`;
    block += `        X-XSS-Protection "1; mode=block"\n`;
    block += `        Referrer-Policy "strict-origin-when-cross-origin"\n`;
    block += `        -Server\n`;
    block += `    }\n\n`;
  }

  // Logging
  block += `    log {\n`;
  block += `        output file /var/log/caddy/${domain}.log {\n`;
  block += `            roll_size 100mb\n`;
  block += `            roll_keep 5\n`;
  block += `        }\n`;
  block += `        format json\n`;
  block += `    }\n`;

  block += `}\n`;

  return block;
}

/**
 * Generate HTTP to HTTPS redirect block
 */
export function generateHttpRedirect(): string {
  return `
# HTTP to HTTPS redirect
http:// {
    redir https://{host}{uri} permanent
}
`;
}
