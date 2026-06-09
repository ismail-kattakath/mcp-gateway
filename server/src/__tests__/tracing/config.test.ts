/**
 * Tests for tracing configuration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTracingConfig, createResource } from '../../tracing/config.js';

describe('Tracing Configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment
    delete process.env.OTEL_SERVICE_NAME;
    delete process.env.OTEL_SERVICE_VERSION;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_TRACES_SAMPLER;
    delete process.env.OTEL_TRACES_SAMPLER_ARG;
    delete process.env.OTEL_TRACING_ENABLED;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('getTracingConfig', () => {
    it('should return default configuration', () => {
      const config = getTracingConfig();

      expect(config).toEqual({
        enabled: true,
        serviceName: 'mcp-gateway',
        serviceVersion: '3.0.0',
        exporterEndpoint: 'http://localhost:4318/v1/traces',
        samplerType: 'parentbased_always_on',
        samplerRatio: 1.0,
      });
    });

    it('should respect OTEL_TRACING_ENABLED=false', () => {
      process.env.OTEL_TRACING_ENABLED = 'false';
      const config = getTracingConfig();

      expect(config.enabled).toBe(false);
    });

    it('should use custom service name', () => {
      process.env.OTEL_SERVICE_NAME = 'my-gateway';
      const config = getTracingConfig();

      expect(config.serviceName).toBe('my-gateway');
    });

    it('should use custom service version', () => {
      process.env.OTEL_SERVICE_VERSION = '4.0.0';
      const config = getTracingConfig();

      expect(config.serviceVersion).toBe('4.0.0');
    });

    it('should use custom exporter endpoint', () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://jaeger:4318/v1/traces';
      const config = getTracingConfig();

      expect(config.exporterEndpoint).toBe('http://jaeger:4318/v1/traces');
    });

    it('should use custom sampler type', () => {
      process.env.OTEL_TRACES_SAMPLER = 'traceidratio';
      const config = getTracingConfig();

      expect(config.samplerType).toBe('traceidratio');
    });

    it('should use custom sampler ratio', () => {
      process.env.OTEL_TRACES_SAMPLER_ARG = '0.5';
      const config = getTracingConfig();

      expect(config.samplerRatio).toBe(0.5);
    });

    it('should parse sampler ratio as float', () => {
      process.env.OTEL_TRACES_SAMPLER_ARG = '0.123';
      const config = getTracingConfig();

      expect(config.samplerRatio).toBeCloseTo(0.123, 3);
    });
  });

  describe('createResource', () => {
    it('should create resource with service info', () => {
      const config = getTracingConfig();
      const resource = createResource(config);

      expect(resource).toBeDefined();
      expect(resource.attributes['service.name']).toBe('mcp-gateway');
      expect(resource.attributes['service.version']).toBe('3.0.0');
    });

    it('should create resource with custom service info', () => {
      const config = {
        enabled: true,
        serviceName: 'custom-gateway',
        serviceVersion: '5.0.0',
        exporterEndpoint: 'http://localhost:4318/v1/traces',
        samplerType: 'always_on' as const,
        samplerRatio: 1.0,
      };
      const resource = createResource(config);

      expect(resource.attributes['service.name']).toBe('custom-gateway');
      expect(resource.attributes['service.version']).toBe('5.0.0');
    });
  });
});
