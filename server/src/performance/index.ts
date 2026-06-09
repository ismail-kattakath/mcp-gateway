/**
 * Performance Module
 *
 * Exports all performance optimization utilities:
 * - HTTP/2 server setup
 * - Response compression
 * - Response caching
 * - Connection pooling
 * - ETag support
 */

export * from './config.js';
export * from './compression.js';
export * from './cache.js';
export * from './pool.js';
export * from './etag.js';
export * from './http2.js';

export { default as compressionModule } from './compression.js';
export { default as cacheModule } from './cache.js';
export { default as poolModule } from './pool.js';
export { default as etagModule } from './etag.js';
export { default as http2Module } from './http2.js';
