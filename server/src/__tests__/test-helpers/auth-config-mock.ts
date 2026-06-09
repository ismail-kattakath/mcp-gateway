import { vi } from 'vitest';
import * as authConfig from '../../config/auth-config.js';

/**
 * Mock auth config module for testing
 * Allows tests to control auth settings without file I/O
 */

export interface MockAuthConfig {
  disableAuth: boolean;
  allowedIPs: string[];
}

let mockConfig: MockAuthConfig = {
  disableAuth: false,
  allowedIPs: [],
};

export function setMockAuthConfig(config: Partial<MockAuthConfig>): void {
  mockConfig = {
    ...mockConfig,
    ...config,
  };
}

export function resetMockAuthConfig(): void {
  mockConfig = {
    disableAuth: false,
    allowedIPs: [],
  };
}

export function setupAuthConfigMocks(): void {
  vi.spyOn(authConfig, 'isAuthDisabled').mockImplementation(() => {
    // Check env var first, just like real implementation
    const envDisabled = process.env.GATEWAY_DISABLE_AUTH?.toLowerCase();
    if (envDisabled !== undefined) {
      return envDisabled === 'true';
    }
    return mockConfig.disableAuth;
  });

  vi.spyOn(authConfig, 'getAllowedIPs').mockImplementation(() => {
    return mockConfig.allowedIPs;
  });
}

export function restoreAuthConfigMocks(): void {
  vi.restoreAllMocks();
}
