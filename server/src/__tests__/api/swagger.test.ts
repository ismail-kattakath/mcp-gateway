import { describe, it, expect } from 'vitest';
import { swaggerSpec } from '../../api/swagger.js';

describe('OpenAPI Swagger spec', () => {
  it('should generate valid OpenAPI 3.0 spec', () => {
    expect(swaggerSpec).toBeDefined();
    expect(swaggerSpec.openapi).toBe('3.0.0');
  });

  it('should have info metadata', () => {
    expect(swaggerSpec.info).toBeDefined();
    expect(swaggerSpec.info.title).toBe('MCP Gateway API');
    expect(swaggerSpec.info.description).toContain('REST API');
    expect(swaggerSpec.info.license).toBeDefined();
    expect(swaggerSpec.info.license.name).toBe('MIT');
  });

  it('should define Bearer auth security scheme', () => {
    expect(swaggerSpec.components?.securitySchemes).toBeDefined();
    expect(swaggerSpec.components?.securitySchemes?.bearerAuth).toBeDefined();
    expect(swaggerSpec.components?.securitySchemes?.bearerAuth.type).toBe('http');
    expect(swaggerSpec.components?.securitySchemes?.bearerAuth.scheme).toBe('bearer');
  });

  it('should define server status schema', () => {
    expect(swaggerSpec.components?.schemas?.ServerStatus).toBeDefined();
    const schema = swaggerSpec.components?.schemas?.ServerStatus as Record<string, unknown>;
    expect(schema.type).toBe('object');
    expect(schema.properties).toHaveProperty('name');
    expect(schema.properties).toHaveProperty('state');
    expect(schema.properties).toHaveProperty('pid');
  });

  it('should define server config schema', () => {
    expect(swaggerSpec.components?.schemas?.ServerConfig).toBeDefined();
    const schema = swaggerSpec.components?.schemas?.ServerConfig as Record<string, unknown>;
    expect(schema.type).toBe('object');
    expect(schema.required).toContain('source');
    expect(schema.properties).toHaveProperty('source');
    expect(schema.properties).toHaveProperty('enabled');
    expect(schema.properties).toHaveProperty('lifecycle');
  });

  it('should define log entry schema', () => {
    expect(swaggerSpec.components?.schemas?.LogEntry).toBeDefined();
    const schema = swaggerSpec.components?.schemas?.LogEntry as Record<string, unknown>;
    expect(schema.type).toBe('object');
    expect(schema.properties).toHaveProperty('timestamp');
    expect(schema.properties).toHaveProperty('level');
    expect(schema.properties).toHaveProperty('message');
  });

  it('should define common error responses', () => {
    expect(swaggerSpec.components?.responses?.Unauthorized).toBeDefined();
    expect(swaggerSpec.components?.responses?.NotFound).toBeDefined();
    expect(swaggerSpec.components?.responses?.BadRequest).toBeDefined();
  });

  it('should document /api/servers endpoint', () => {
    expect(swaggerSpec.paths).toBeDefined();
    expect(swaggerSpec.paths?.['/api/servers']).toBeDefined();
    expect(swaggerSpec.paths?.['/api/servers']?.get).toBeDefined();
    expect(swaggerSpec.paths?.['/api/servers']?.post).toBeDefined();
  });

  it('should document /api/servers/:serverName endpoint', () => {
    expect(swaggerSpec.paths?.['/api/servers/{serverName}']).toBeDefined();
    expect(swaggerSpec.paths?.['/api/servers/{serverName}']?.get).toBeDefined();
    expect(swaggerSpec.paths?.['/api/servers/{serverName}']?.put).toBeDefined();
    expect(swaggerSpec.paths?.['/api/servers/{serverName}']?.delete).toBeDefined();
  });

  it('should document server control endpoints', () => {
    expect(swaggerSpec.paths?.['/api/servers/{serverName}/start']).toBeDefined();
    expect(swaggerSpec.paths?.['/api/servers/{serverName}/stop']).toBeDefined();
    expect(swaggerSpec.paths?.['/api/servers/{serverName}/restart']).toBeDefined();
    expect(swaggerSpec.paths?.['/api/servers/{serverName}/enable']).toBeDefined();
    expect(swaggerSpec.paths?.['/api/servers/{serverName}/disable']).toBeDefined();
  });

  it('should document logs endpoints', () => {
    expect(swaggerSpec.paths?.['/api/logs']).toBeDefined();
    expect(swaggerSpec.paths?.['/api/logs/{serverName}']).toBeDefined();
  });

  it('should require authentication for endpoints', () => {
    const getServersPath = swaggerSpec.paths?.['/api/servers']?.get as Record<string, unknown>;
    expect(getServersPath?.security).toBeDefined();
    expect(getServersPath?.security).toEqual([{ bearerAuth: [] }]);
  });

  it('should include response schemas', () => {
    const getServersPath = swaggerSpec.paths?.['/api/servers']?.get as Record<string, unknown>;
    expect(getServersPath?.responses).toBeDefined();
    expect(getServersPath?.responses?.['200']).toBeDefined();
    expect(getServersPath?.responses?.['401']).toBeDefined();
  });

  it('should have tags for organization', () => {
    const getServersPath = swaggerSpec.paths?.['/api/servers']?.get as Record<string, unknown>;
    expect(getServersPath?.tags).toBeDefined();
    expect(getServersPath?.tags).toContain('Servers');
  });

  it('should document request parameters', () => {
    const getServerPath = swaggerSpec.paths?.['/api/servers/{serverName}']?.get as Record<
      string,
      unknown
    >;
    expect(getServerPath?.parameters).toBeDefined();
    expect(Array.isArray(getServerPath?.parameters)).toBe(true);
    const params = getServerPath?.parameters as Array<Record<string, unknown>>;
    expect(params.some((p) => p.name === 'serverName')).toBe(true);
  });

  it('should document request bodies', () => {
    const postServersPath = swaggerSpec.paths?.['/api/servers']?.post as Record<string, unknown>;
    expect(postServersPath?.requestBody).toBeDefined();
    const requestBody = postServersPath?.requestBody as Record<string, unknown>;
    expect(requestBody?.required).toBe(true);
    expect(requestBody?.content).toBeDefined();
  });
});
