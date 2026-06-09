/**
 * Domain validation utilities
 */

/**
 * Validate domain name format
 * RFC 1035: <domain> ::= <subdomain> | " "
 * <subdomain> ::= <label> | <subdomain> "." <label>
 * <label> ::= <letter> [ [ <ldh-str> ] <let-dig> ]
 * <ldh-str> ::= <let-dig-hyp> | <let-dig-hyp> <ldh-str>
 * <let-dig-hyp> ::= <let-dig> | "-"
 * <let-dig> ::= <letter> | <digit>
 */
export function isValidDomain(domain: string): boolean {
  if (!domain || typeof domain !== 'string') {
    return false;
  }

  // Remove trailing dot (FQDN format)
  const normalizedDomain = domain.endsWith('.') ? domain.slice(0, -1) : domain;

  // Check length
  if (normalizedDomain.length < 1 || normalizedDomain.length > 253) {
    return false;
  }

  // RFC 1035 domain regex
  // Matches: example.com, sub.example.com, my-site.com, etc.
  const domainRegex =
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

  return domainRegex.test(normalizedDomain);
}

/**
 * Validate wildcard domain format
 * Examples: *.example.com, *.sub.example.com
 */
export function isValidWildcardDomain(domain: string): boolean {
  if (!domain || typeof domain !== 'string') {
    return false;
  }

  if (!domain.startsWith('*.')) {
    return false;
  }

  const baseDomain = domain.substring(2); // Remove "*."
  return isValidDomain(baseDomain);
}

/**
 * Validate IP address (IPv4 or IPv6)
 */
export function isValidIpAddress(ip: string): boolean {
  if (!ip || typeof ip !== 'string') {
    return false;
  }

  // IPv4 regex
  const ipv4Regex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

  // IPv6 regex (simplified)
  const ipv6Regex = /^(?:[a-f0-9]{1,4}:){7}[a-f0-9]{1,4}$/i;

  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * Normalize domain name (lowercase, remove trailing dot)
 */
export function normalizeDomain(domain: string): string {
  if (!domain || typeof domain !== 'string') {
    throw new Error('Invalid domain');
  }

  let normalized = domain.toLowerCase().trim();

  // Remove trailing dot (FQDN)
  if (normalized.endsWith('.')) {
    normalized = normalized.slice(0, -1);
  }

  // Remove protocol if accidentally included
  normalized = normalized.replace(/^https?:\/\//, '');

  // Remove port if included
  normalized = normalized.replace(/:\d+$/, '');

  return normalized;
}

/**
 * Check if domain is localhost or local development domain
 */
export function isLocalDomain(domain: string): boolean {
  const normalized = normalizeDomain(domain);

  const localPatterns = [
    'localhost',
    '127.0.0.1',
    '::1',
    '0.0.0.0',
    /^.+\.local$/,
    /^.+\.localhost$/,
    /^192\.168\.\d+\.\d+$/,
    /^10\.\d+\.\d+\.\d+$/,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/,
  ];

  return localPatterns.some((pattern) => {
    if (typeof pattern === 'string') {
      return normalized === pattern;
    }
    return pattern.test(normalized);
  });
}

/**
 * Extract root domain from subdomain
 * Example: api.example.com -> example.com
 */
export function getRootDomain(domain: string): string {
  const normalized = normalizeDomain(domain);
  const parts = normalized.split('.');

  if (parts.length < 2) {
    throw new Error('Invalid domain: must have at least two labels');
  }

  // Handle country code TLDs (e.g., .co.uk, .com.au)
  const ccTLDs = ['co', 'com', 'org', 'net', 'ac', 'gov'];
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];

  if (parts.length >= 3 && ccTLDs.includes(sld)) {
    return parts.slice(-3).join('.');
  }

  return parts.slice(-2).join('.');
}

/**
 * Validate TLS configuration
 */
export interface TLSConfig {
  protocols?: string[];
  ciphers?: string[];
  certificate?: string;
  key?: string;
}

export function validateTLSConfig(config: TLSConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate protocols
  if (config.protocols) {
    const validProtocols = ['tls1.2', 'tls1.3'];
    const invalidProtocols = config.protocols.filter((p) => !validProtocols.includes(p));

    if (invalidProtocols.length > 0) {
      errors.push(`Invalid TLS protocols: ${invalidProtocols.join(', ')}`);
    }

    // Warn if TLS 1.2 is enabled (should prefer 1.3 only)
    if (config.protocols.includes('tls1.2') && !config.protocols.includes('tls1.3')) {
      errors.push('Warning: TLS 1.2 is deprecated, prefer TLS 1.3 only');
    }
  }

  // Validate ciphers (basic check - full validation would be much longer)
  if (config.ciphers) {
    const recommendedCiphers = [
      'TLS_AES_128_GCM_SHA256',
      'TLS_AES_256_GCM_SHA384',
      'TLS_CHACHA20_POLY1305_SHA256',
    ];

    const hasRecommendedCipher = config.ciphers.some((c) => recommendedCiphers.includes(c));

    if (!hasRecommendedCipher) {
      errors.push('Warning: No recommended TLS 1.3 ciphers configured (AES-GCM or ChaCha20)');
    }
  }

  // Validate certificate and key (if custom)
  if (config.certificate && !config.key) {
    errors.push('Certificate provided but key is missing');
  }

  if (config.key && !config.certificate) {
    errors.push('Key provided but certificate is missing');
  }

  if (config.certificate && config.key) {
    // Basic PEM format check
    if (!config.certificate.includes('BEGIN CERTIFICATE')) {
      errors.push('Invalid certificate format (must be PEM)');
    }

    if (
      !config.key.includes('BEGIN PRIVATE KEY') &&
      !config.key.includes('BEGIN RSA PRIVATE KEY')
    ) {
      errors.push('Invalid key format (must be PEM)');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
