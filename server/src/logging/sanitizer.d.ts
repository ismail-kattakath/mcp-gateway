/**
 * Log Sanitization Utilities
 *
 * Enterprise-grade input sanitization for logs to prevent:
 * - Log injection attacks (CRLF, null bytes)
 * - Information disclosure (secrets, tokens, PII)
 * - Log flooding (excessively long values)
 *
 * Addresses CodeQL security warnings about logging user-provided values.
 */
/**
 * Sanitizes a string for safe logging by:
 * 1. Removing control characters (CRLF, null bytes, etc.)
 * 2. Truncating to reasonable length
 * 3. Redacting sensitive patterns
 */
export declare function sanitizeString(value: string, maxLength?: number): string;
/**
 * Sanitizes server names for logging
 */
export declare function sanitizeServerName(serverName: unknown): string;
/**
 * Sanitizes domain names for logging.
 * Returns a constant marker for invalid/unexpected input.
 */
export declare function sanitizeDomainForLog(domain: unknown): string;
/**
 * Sanitizes URLs by removing credentials and query parameters
 */
export declare function sanitizeUrl(url: unknown): string;
/**
 * Sanitizes command arguments by redacting anything that looks sensitive
 */
export declare function sanitizeArgs(args: unknown): string[];
/**
 * Sanitizes environment variables by redacting sensitive keys
 */
export declare function sanitizeEnv(env: NodeJS.ProcessEnv): Record<string, string>;
/**
 * Sanitizes an error object for logging
 */
export declare function sanitizeError(error: unknown): {
    message: string;
    name?: string;
    code?: string;
    stack?: string;
};
/**
 * Sanitizes an IP address (preserves format but masks last octet for privacy)
 */
export declare function sanitizeIp(ip: unknown): string;
/**
 * Sanitizes a path by ensuring it doesn't expose system details
 */
export declare function sanitizePath(filePath: unknown): string;
/**
 * Sanitizes an object for logging (recursively sanitizes all values)
 */
export declare function sanitizeObject(obj: unknown, depth?: number, maxDepth?: number): unknown;
//# sourceMappingURL=sanitizer.d.ts.map