/**
 * Backward Compatibility Layer for v2.x
 * Provides compatibility for v2 clients and API consumers.
 *
 * Enable with: ENABLE_V2_COMPAT=true
 */

import logger from '../logging/logger.js';

export class V2CompatLayer {
  private enabled: boolean;

  constructor() {
    this.enabled = process.env.ENABLE_V2_COMPAT === 'true';
    if (this.enabled) {
      logger.info('V2 compatibility layer enabled');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Map old API paths to new ones.
   * Returns the original path if no mapping exists or if compat layer is disabled.
   */
  mapApiPath(oldPath: string): string {
    if (!this.enabled) return oldPath;

    const pathMap: Record<string, string> = {
      // If we had breaking API changes between v2 and v3, map them here
      // Example: '/api/v2/servers': '/api/servers',
      // For now, API is backward compatible
    };

    const mapped = pathMap[oldPath];
    if (mapped) {
      logger.warn(`Mapped deprecated API path '${oldPath}' to '${mapped}'`);
      return mapped;
    }

    return oldPath;
  }

  /**
   * Map old tool names to new ones.
   * Returns the original name if no mapping exists or if compat layer is disabled.
   */
  mapToolName(oldName: string): string {
    if (!this.enabled) return oldName;

    const toolMap: Record<string, string> = {
      // If we renamed tools between v2 and v3, map them here
      // Example: 'obs/list': 'observatory/list',
      // For now, tool names are backward compatible
    };

    const mapped = toolMap[oldName];
    if (mapped) {
      logger.warn(`Deprecated tool name '${oldName}' used. Use '${mapped}' instead.`);
      return mapped;
    }

    return oldName;
  }

  /**
   * Map old server configuration fields to new ones.
   * Used when updating server configs via API.
   */
  mapServerConfig(config: any): any {
    if (!this.enabled) return config;
    if (!config || typeof config !== 'object') return config;

    // Handle v2.0 "type" field -> v3.0 "source" field
    if (config.type && !config.source) {
      logger.warn('Deprecated field "type" used in server config. Use "source" instead.');
      config.source = config.type;
      delete config.type;
    }

    return config;
  }

  /**
   * Check if a feature is deprecated and log a warning.
   * Returns true if feature should be allowed (even if deprecated).
   */
  checkDeprecatedFeature(feature: string, suggestion?: string): boolean {
    if (!this.enabled) return true;

    logger.warn(`Deprecated feature used: ${feature}`, {
      suggestion: suggestion || 'Please upgrade to v3.0 for the latest features.',
    });

    return true; // Allow deprecated features when compat layer is enabled
  }

  /**
   * Log a deprecation warning with migration guidance.
   */
  logDeprecation(item: string, replacement: string): void {
    if (!this.enabled) return;

    logger.warn(`DEPRECATION: ${item} is deprecated and will be removed in v4.0`, {
      replacement,
      migration: 'Run "mcp migrate from-v2" to upgrade your configuration.',
    });
  }
}

// Singleton instance
export const v2Compat = new V2CompatLayer();

export default v2Compat;
