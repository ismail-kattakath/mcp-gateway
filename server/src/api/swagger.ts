/**
 * OpenAPI / Swagger Configuration
 *
 * Auto-generates OpenAPI 3.0 spec from JSDoc annotations in routes.
 * Serves interactive docs at /docs endpoint.
 */

import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MCP Gateway API',
      version: process.env.OCI_IMAGE_VERSION || '2.0.0',
      description:
        'REST API for managing Model Context Protocol (MCP) servers. Supports CRUD operations, lifecycle control (start/stop/restart), and log retrieval.',
      license: {
        name: 'MIT',
        url: 'https://github.com/ismail-kattakath/mcp-gateway/blob/main/LICENSE',
      },
      contact: {
        name: 'MCP Gateway',
        url: 'https://github.com/ismail-kattakath/mcp-gateway',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local development server',
      },
      {
        url: 'http://127.0.0.1:3000',
        description: 'Local loopback',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Key',
          description:
            'Auto-generated API key stored in system keychain. Retrieve with `PRINT_API_KEY=true npm start` or pass as Bearer token.',
        },
      },
      schemas: {
        ServerConfig: {
          type: 'object',
          required: ['source'],
          properties: {
            source: {
              type: 'string',
              enum: ['pkg', 'git', 'container', 'remote', 'local'],
              description: 'Server source type',
            },
            enabled: {
              type: 'boolean',
              default: true,
              description: 'Whether server is enabled (can be started)',
            },
            lifecycle: {
              type: 'string',
              enum: ['persistent', 'on-demand'],
              default: 'on-demand',
              description:
                'Persistent servers start immediately and auto-restart. On-demand servers start when called and stop after 5min idle.',
            },
            timeout: {
              type: 'integer',
              default: 30000,
              minimum: 1000,
              maximum: 600000,
              description: 'Startup timeout in milliseconds',
            },
            env: {
              type: 'object',
              additionalProperties: { type: 'string' },
              description: 'Environment variables (supports ${VAR} substitution)',
            },
            command: {
              type: 'string',
              description: 'Command to execute (required for pkg/git/local sources)',
            },
            args: {
              type: 'array',
              items: { type: 'string' },
              description: 'Command arguments',
            },
            repo: {
              type: 'string',
              description: 'Git repository URL (required for git source)',
            },
            branch: {
              type: 'string',
              description: 'Git branch (git source only)',
            },
            tag: {
              type: 'string',
              description: 'Git tag (git source only)',
            },
            install: {
              type: 'array',
              items: { type: 'string' },
              description: 'Install commands (git source only)',
            },
            build: {
              type: 'array',
              items: { type: 'string' },
              description: 'Build commands (git source only)',
            },
            image: {
              type: 'string',
              description: 'Docker image (required for container source if build not specified)',
            },
            build_config: {
              type: 'object',
              properties: {
                repo: { type: 'string' },
                dockerfile: { type: 'string', default: 'Dockerfile' },
                context: { type: 'string', default: '.' },
                branch: { type: 'string' },
                tag: { type: 'string' },
              },
              description: 'Container build configuration (container source only)',
            },
            volumes: {
              type: 'array',
              items: { type: 'string', pattern: '^.+:.+(:.+)?$' },
              description: 'Docker volumes in "host:container" or "host:container:ro" format',
            },
            ports: {
              type: 'object',
              additionalProperties: { type: 'integer' },
              description: 'Port mappings {"container": host} (container source only)',
            },
            transport: {
              type: 'string',
              enum: ['sse', 'http'],
              description: 'Transport protocol (required for remote source)',
            },
            url: {
              type: 'string',
              format: 'uri',
              description: 'Remote server URL (required for remote source)',
            },
            method: {
              type: 'string',
              enum: ['GET', 'POST'],
              default: 'POST',
              description: 'HTTP method (remote HTTP transport only)',
            },
            headers: {
              type: 'object',
              additionalProperties: { type: 'string' },
              description: 'HTTP headers (remote source only, supports ${VAR} substitution)',
            },
          },
          discriminator: {
            propertyName: 'source',
          },
        },
        ServerStatus: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              example: 'obs-mcp',
            },
            state: {
              type: 'string',
              enum: ['stopped', 'starting', 'running', 'stopping', 'failed'],
            },
            pid: {
              type: 'integer',
              nullable: true,
              description: 'Process ID (null if not running or remote)',
            },
            uptime: {
              type: 'integer',
              description: 'Uptime in milliseconds',
            },
            lastError: {
              type: 'string',
              nullable: true,
              description: 'Last error message',
            },
            restartCount: {
              type: 'integer',
              description: 'Number of restarts since initialization',
            },
          },
        },
        LogEntry: {
          type: 'object',
          properties: {
            timestamp: {
              type: 'string',
              format: 'date-time',
            },
            level: {
              type: 'string',
              enum: ['debug', 'info', 'warn', 'error'],
            },
            stream: {
              type: 'string',
              enum: ['stdout', 'stderr'],
            },
            message: {
              type: 'string',
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message',
            },
          },
        },
      },
      responses: {
        Unauthorized: {
          description: 'Authentication required',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                error: 'Unauthorized',
              },
            },
          },
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                error: 'Server not found: unknown-server',
              },
            },
          },
        },
        BadRequest: {
          description: 'Invalid request',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                error: 'Missing required fields: name, config',
              },
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [path.resolve(__dirname, './routes.ts'), path.resolve(__dirname, './routes.js')],
};

export const swaggerSpec = swaggerJsdoc(swaggerOptions);

export const swaggerUiOptions: swaggerUi.SwaggerUiOptions = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'MCP Gateway API Docs',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    syntaxHighlight: {
      activate: true,
      theme: 'monokai',
    },
  },
};

export { swaggerUi };
