/**
 * Performance Configuration
 *
 * Centralized configuration for HTTP/2, compression, caching, and connection pooling
 * Settings can be overridden via environment variables
 */

export interface PerformanceConfig {
  http2: {
    enabled: boolean;
    maxConcurrentStreams: number;
    allowHTTP1: boolean;
    pushEnabled: boolean;
  };
  compression: {
    enabled: boolean;
    level: number; // 0-9, higher = better compression, slower
    threshold: number; // Min size in bytes to compress
    types: string[]; // MIME types to compress
  };
  cache: {
    enabled: boolean;
    maxSize: number; // Max entries
    ttl: number; // Time to live in milliseconds
    updateAgeOnGet: boolean; // Refresh TTL on cache hit
  };
  pool: {
    keepAlive: boolean;
    maxSockets: number;
    maxFreeSockets: number;
    timeout: number; // milliseconds
  };
}

/**
 * Default performance configuration
 */
export const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  http2: {
    enabled: false, // Disabled by default (requires HTTPS setup)
    maxConcurrentStreams: 100,
    allowHTTP1: true,
    pushEnabled: false,
  },
  compression: {
    enabled: true,
    level: 6,
    threshold: 1024, // 1KB
    types: [
      'text/plain',
      'text/html',
      'text/css',
      'text/javascript',
      'application/json',
      'application/javascript',
      'application/xml',
      'application/x-www-form-urlencoded',
    ],
  },
  cache: {
    enabled: true,
    maxSize: 1000,
    ttl: 300000, // 5 minutes
    updateAgeOnGet: true,
  },
  pool: {
    keepAlive: true,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000, // 1 minute
  },
};

/**
 * Get performance configuration from environment variables
 */
export function getPerformanceConfig(): PerformanceConfig {
  const config = { ...DEFAULT_PERFORMANCE_CONFIG };

  // HTTP/2 configuration
  if (process.env.ENABLE_HTTP2 !== undefined) {
    config.http2.enabled = process.env.ENABLE_HTTP2 === 'true';
  }
  if (process.env.HTTP2_MAX_CONCURRENT_STREAMS !== undefined) {
    config.http2.maxConcurrentStreams = parseInt(process.env.HTTP2_MAX_CONCURRENT_STREAMS, 10);
  }
  if (process.env.HTTP2_ALLOW_HTTP1 !== undefined) {
    config.http2.allowHTTP1 = process.env.HTTP2_ALLOW_HTTP1 === 'true';
  }
  if (process.env.HTTP2_PUSH_ENABLED !== undefined) {
    config.http2.pushEnabled = process.env.HTTP2_PUSH_ENABLED === 'true';
  }

  // Compression configuration
  if (process.env.ENABLE_COMPRESSION !== undefined) {
    config.compression.enabled = process.env.ENABLE_COMPRESSION === 'true';
  }
  if (process.env.COMPRESSION_LEVEL !== undefined) {
    const level = parseInt(process.env.COMPRESSION_LEVEL, 10);
    config.compression.level = Math.max(0, Math.min(9, level));
  }
  if (process.env.COMPRESSION_THRESHOLD !== undefined) {
    config.compression.threshold = parseInt(process.env.COMPRESSION_THRESHOLD, 10);
  }

  // Cache configuration
  if (process.env.ENABLE_CACHE !== undefined) {
    config.cache.enabled = process.env.ENABLE_CACHE === 'true';
  }
  if (process.env.CACHE_MAX_SIZE !== undefined) {
    config.cache.maxSize = parseInt(process.env.CACHE_MAX_SIZE, 10);
  }
  if (process.env.CACHE_TTL !== undefined) {
    config.cache.ttl = parseInt(process.env.CACHE_TTL, 10);
  }
  if (process.env.CACHE_UPDATE_AGE_ON_GET !== undefined) {
    config.cache.updateAgeOnGet = process.env.CACHE_UPDATE_AGE_ON_GET === 'true';
  }

  // Connection pooling configuration
  if (process.env.HTTP_KEEP_ALIVE !== undefined) {
    config.pool.keepAlive = process.env.HTTP_KEEP_ALIVE === 'true';
  }
  if (process.env.HTTP_MAX_SOCKETS !== undefined) {
    config.pool.maxSockets = parseInt(process.env.HTTP_MAX_SOCKETS, 10);
  }
  if (process.env.HTTP_MAX_FREE_SOCKETS !== undefined) {
    config.pool.maxFreeSockets = parseInt(process.env.HTTP_MAX_FREE_SOCKETS, 10);
  }
  if (process.env.HTTP_TIMEOUT !== undefined) {
    config.pool.timeout = parseInt(process.env.HTTP_TIMEOUT, 10);
  }

  return config;
}

/**
 * Validate performance configuration
 */
export function validatePerformanceConfig(config: PerformanceConfig): string[] {
  const errors: string[] = [];

  if (config.compression.level < 0 || config.compression.level > 9) {
    errors.push('Compression level must be between 0 and 9');
  }

  if (config.compression.threshold < 0) {
    errors.push('Compression threshold must be non-negative');
  }

  if (config.cache.maxSize <= 0) {
    errors.push('Cache max size must be positive');
  }

  if (config.cache.ttl <= 0) {
    errors.push('Cache TTL must be positive');
  }

  if (config.pool.maxSockets <= 0) {
    errors.push('HTTP max sockets must be positive');
  }

  if (config.pool.maxFreeSockets < 0) {
    errors.push('HTTP max free sockets must be non-negative');
  }

  if (config.pool.timeout <= 0) {
    errors.push('HTTP timeout must be positive');
  }

  if (config.http2.maxConcurrentStreams <= 0) {
    errors.push('HTTP/2 max concurrent streams must be positive');
  }

  return errors;
}
