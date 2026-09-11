/**
 * app/config/api.config.js
 * Centralized API configuration for Tesnow
 * Provides secure, validated configuration for API routes, versioning, pagination, rate limiting, and CORS
 * 
 * @module config/api.config
 */

// ----------------------------------------------------------------------------
// 1. CONSTANTS & DEFAULTS
// ----------------------------------------------------------------------------

const DEFAULT_API_ENABLED = true;
const DEFAULT_API_PREFIX = '/api';
const DEFAULT_API_VERSION = 'v1';
const DEFAULT_API_TRUST_CLIENT_IP = false;
const DEFAULT_API_DEFAULT_LIMIT = 20;
const DEFAULT_API_MAX_LIMIT = 100;
const DEFAULT_API_BODY_LIMIT = '1mb';
const DEFAULT_API_PARAMETER_LIMIT = 100;
const DEFAULT_API_REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_API_RATE_LIMIT_ENABLED = true;
const DEFAULT_API_RATE_LIMIT_WINDOW_MS = 900000; // 15 minutes
const DEFAULT_API_RATE_LIMIT_MAX = 100;
const DEFAULT_API_CORS_ENABLED = true;
const DEFAULT_API_CORS_ORIGIN = 'http://localhost:3000';
const DEFAULT_API_CORS_CREDENTIALS = true;
const DEFAULT_API_RESPONSE_COMPRESSION = true;
const DEFAULT_API_DEPRECATION_ENABLED = true;
const DEFAULT_API_VERSIONING_ENABLED = true;

const MIN_LIMIT = 1;
const MAX_LIMIT = 1000;
const MIN_PARAMETER_LIMIT = 1;
const MAX_PARAMETER_LIMIT = 1000;
const MIN_REQUEST_TIMEOUT_MS = 1000;
const MAX_REQUEST_TIMEOUT_MS = 120000; // 2 minutes
const MIN_RATE_LIMIT_WINDOW_MS = 1000;
const MAX_RATE_LIMIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MIN_RATE_LIMIT_MAX = 1;
const MAX_RATE_LIMIT_MAX = 10000;

// ----------------------------------------------------------------------------
// 2. VALIDATION HELPERS
// ----------------------------------------------------------------------------

/**
 * Parse boolean values safely
 * @param {string|boolean|number} value - Value to parse
 * @param {boolean} defaultValue - Default if parsing fails
 * @returns {boolean} Parsed boolean
 */
function parseBoolean(value, defaultValue) {
    if (value === null || value === undefined || value === '') {
        return defaultValue;
    }
    
    if (typeof value === 'boolean') {
        return value;
    }
    
    if (typeof value === 'number') {
        return value !== 0;
    }
    
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
            return true;
        }
        if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
            return false;
        }
    }
    
    return defaultValue;
}

/**
 * Parse positive integer safely
 * @param {string|number} value - Value to parse
 * @param {number} defaultValue - Default if parsing fails
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number} Parsed integer
 */
function parsePositiveInteger(value, defaultValue, min = 1, max = Number.MAX_SAFE_INTEGER) {
    if (value === null || value === undefined || value === '') {
        return defaultValue;
    }
    
    let num;
    if (typeof value === 'string') {
        num = parseInt(value, 10);
    } else if (typeof value === 'number') {
        num = value;
    } else {
        return defaultValue;
    }
    
    if (typeof num !== 'number' || !Number.isFinite(num) || !Number.isInteger(num) || num < min || num > max) {
        throw new Error(`Value must be an integer between ${min} and ${max}`);
    }
    
    return num;
}

/**
 * Parse byte limit string or number
 * @param {string|number} value - Value to parse
 * @param {string} defaultValue - Default if parsing fails
 * @returns {string} Validated byte limit
 */
function parseByteLimit(value, defaultValue) {
    if (value === null || value === undefined || value === '') {
        return defaultValue;
    }
    
    if (typeof value === 'string') {
        const trimmed = value.trim().toLowerCase();
        // Validate format: number followed by optional unit (b, kb, mb, gb)
        if (/^[0-9]+(b|kb|mb|gb)?$/.test(trimmed)) {
            return trimmed;
        }
        throw new Error('Body limit must be a number with optional unit (b, kb, mb, gb)');
    }
    
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return `${Math.floor(value)}b`;
    }
    
    return defaultValue;
}

/**
 * Validate API prefix
 * @param {string} prefix - API prefix
 * @returns {string} Validated prefix
 */
function validateApiPrefix(prefix) {
    if (!prefix || typeof prefix !== 'string') {
        return DEFAULT_API_PREFIX;
    }
    
    let trimmed = prefix.trim();
    
    if (trimmed.length === 0) {
        return DEFAULT_API_PREFIX;
    }
    
    // Check for null bytes
    if (trimmed.includes('\x00')) {
        throw new Error('API_PREFIX contains null bytes');
    }
    
    // Check for control characters
    if (/[\x01-\x1F\x7F]/.test(trimmed)) {
        throw new Error('API_PREFIX contains invalid control characters');
    }
    
    // Check for CR/LF
    if (trimmed.includes('\n') || trimmed.includes('\r')) {
        throw new Error('API_PREFIX contains invalid newline characters');
    }
    
    // Must start with /
    if (!trimmed.startsWith('/')) {
        trimmed = '/' + trimmed;
    }
    
    // Remove trailing slash
    trimmed = trimmed.replace(/\/+$/, '');
    
    // Prevent path traversal
    if (trimmed.includes('..')) {
        throw new Error('API_PREFIX contains path traversal sequences');
    }
    
    // Only allow safe characters
    if (!/^\/[a-zA-Z0-9\-_/]*$/.test(trimmed)) {
        throw new Error('API_PREFIX contains invalid characters');
    }
    
    return trimmed;
}

/**
 * Validate API version
 * @param {string} version - API version
 * @returns {string} Validated version
 */
function validateApiVersion(version) {
    if (!version || typeof version !== 'string') {
        return DEFAULT_API_VERSION;
    }
    
    let trimmed = version.trim();
    
    if (trimmed.length === 0) {
        return DEFAULT_API_VERSION;
    }
    
    // Check for null bytes
    if (trimmed.includes('\x00')) {
        throw new Error('API_VERSION contains null bytes');
    }
    
    // Check for control characters
    if (/[\x01-\x1F\x7F]/.test(trimmed)) {
        throw new Error('API_VERSION contains invalid control characters');
    }
    
    // Check for CR/LF
    if (trimmed.includes('\n') || trimmed.includes('\r')) {
        throw new Error('API_VERSION contains invalid newline characters');
    }
    
    // Remove leading 'v' for consistency
    if (trimmed.startsWith('v')) {
        trimmed = trimmed.substring(1);
    }
    
    // Only allow safe characters
    if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
        throw new Error('API_VERSION contains invalid characters');
    }
    
    // Prevent path traversal
    if (trimmed.includes('..')) {
        throw new Error('API_VERSION contains path traversal sequences');
    }
    
    // Add 'v' prefix
    return 'v' + trimmed;
}

/**
 * Validate CORS origin
 * @param {string} origin - CORS origin
 * @param {boolean} credentials - Whether credentials are allowed
 * @param {boolean} enabled - Whether CORS is enabled
 * @returns {string|string[]} Validated origin(s)
 */
function validateCorsOrigin(origin, credentials, enabled) {
    if (!enabled) {
        return '';
    }
    
    if (!origin || typeof origin !== 'string') {
        return DEFAULT_API_CORS_ORIGIN;
    }
    
    const trimmed = origin.trim();
    
    if (trimmed.length === 0) {
        return DEFAULT_API_CORS_ORIGIN;
    }
    
    // Check for null bytes
    if (trimmed.includes('\x00')) {
        throw new Error('API_CORS_ORIGIN contains null bytes');
    }
    
    // Check for control characters
    if (/[\x01-\x1F\x7F]/.test(trimmed)) {
        throw new Error('API_CORS_ORIGIN contains invalid control characters');
    }
    
    // Check for CR/LF
    if (trimmed.includes('\n') || trimmed.includes('\r')) {
        throw new Error('API_CORS_ORIGIN contains invalid newline characters');
    }
    
    // Handle wildcard
    if (trimmed === '*') {
        if (credentials) {
            throw new Error('API_CORS_ORIGIN cannot be "*" when credentials are enabled');
        }
        return '*';
    }
    
    // Handle multiple origins (comma-separated)
    if (trimmed.includes(',')) {
        const origins = trimmed.split(',').map(o => o.trim()).filter(o => o.length > 0);
        const validOrigins = [];
        
        for (const o of origins) {
            // Allow localhost for development
            if (o === 'localhost' || o.startsWith('http://localhost') || o.startsWith('https://localhost')) {
                validOrigins.push(o);
                continue;
            }
            
            // Validate URL format for other origins
            try {
                const url = new URL(o);
                if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                    throw new Error(`Invalid origin protocol: ${o}`);
                }
                validOrigins.push(o);
            } catch {
                throw new Error(`Invalid CORS origin: ${o}`);
            }
        }
        
        if (validOrigins.length === 0) {
            return DEFAULT_API_CORS_ORIGIN;
        }
        
        return validOrigins;
    }
    
    // Single origin validation
    if (trimmed === 'localhost' || trimmed.startsWith('http://localhost') || trimmed.startsWith('https://localhost')) {
        return trimmed;
    }
    
    try {
        const url = new URL(trimmed);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new Error('CORS origin must use HTTP or HTTPS protocol');
        }
        return trimmed;
    } catch {
        throw new Error(`Invalid CORS origin: ${trimmed}`);
    }
}

// ----------------------------------------------------------------------------
// 3. CONFIGURATION LOADER
// ----------------------------------------------------------------------------

/**
 * Load API configuration from environment variables
 * @param {string} nodeEnv - Current Node environment
 * @returns {Object} Immutable API configuration
 */
function loadApiConfig(nodeEnv = 'development') {
    const isProduction = nodeEnv === 'production';
    
    // Parse enabled flag
    const enabled = parseBoolean(process.env.API_ENABLED, DEFAULT_API_ENABLED);
    
    // Parse prefix and version
    const prefix = validateApiPrefix(process.env.API_PREFIX);
    const version = validateApiVersion(process.env.API_VERSION);
    const basePath = `${prefix}/${version}`;
    
    // Parse trust client IP
    const trustClientIp = parseBoolean(process.env.API_TRUST_CLIENT_IP, DEFAULT_API_TRUST_CLIENT_IP);
    
    // Parse pagination
    let defaultLimit, maxLimit;
    if (enabled) {
        defaultLimit = parsePositiveInteger(
            process.env.API_DEFAULT_LIMIT,
            DEFAULT_API_DEFAULT_LIMIT,
            MIN_LIMIT,
            MAX_LIMIT
        );
        
        maxLimit = parsePositiveInteger(
            process.env.API_MAX_LIMIT,
            DEFAULT_API_MAX_LIMIT,
            MIN_LIMIT,
            MAX_LIMIT
        );
        
        if (defaultLimit > maxLimit) {
            throw new Error('API_DEFAULT_LIMIT must not exceed API_MAX_LIMIT');
        }
    } else {
        defaultLimit = DEFAULT_API_DEFAULT_LIMIT;
        maxLimit = DEFAULT_API_MAX_LIMIT;
    }
    
    // Parse body and parameter limits
    const bodyLimit = enabled ? parseByteLimit(process.env.API_BODY_LIMIT, DEFAULT_API_BODY_LIMIT) : DEFAULT_API_BODY_LIMIT;
    const parameterLimit = enabled ? parsePositiveInteger(
        process.env.API_PARAMETER_LIMIT,
        DEFAULT_API_PARAMETER_LIMIT,
        MIN_PARAMETER_LIMIT,
        MAX_PARAMETER_LIMIT
    ) : DEFAULT_API_PARAMETER_LIMIT;
    
    // Parse request timeout
    const requestTimeoutMs = enabled ? parsePositiveInteger(
        process.env.API_REQUEST_TIMEOUT_MS,
        DEFAULT_API_REQUEST_TIMEOUT_MS,
        MIN_REQUEST_TIMEOUT_MS,
        MAX_REQUEST_TIMEOUT_MS
    ) : DEFAULT_API_REQUEST_TIMEOUT_MS;
    
    // Parse rate limit
    const rateLimitEnabled = parseBoolean(process.env.API_RATE_LIMIT_ENABLED, DEFAULT_API_RATE_LIMIT_ENABLED);
    let rateLimitWindowMs, rateLimitMax;
    if (enabled && rateLimitEnabled) {
        rateLimitWindowMs = parsePositiveInteger(
            process.env.API_RATE_LIMIT_WINDOW_MS,
            DEFAULT_API_RATE_LIMIT_WINDOW_MS,
            MIN_RATE_LIMIT_WINDOW_MS,
            MAX_RATE_LIMIT_WINDOW_MS
        );
        rateLimitMax = parsePositiveInteger(
            process.env.API_RATE_LIMIT_MAX,
            DEFAULT_API_RATE_LIMIT_MAX,
            MIN_RATE_LIMIT_MAX,
            MAX_RATE_LIMIT_MAX
        );
    } else {
        rateLimitWindowMs = DEFAULT_API_RATE_LIMIT_WINDOW_MS;
        rateLimitMax = DEFAULT_API_RATE_LIMIT_MAX;
    }
    
    // Parse CORS
    const corsEnabled = parseBoolean(process.env.API_CORS_ENABLED, DEFAULT_API_CORS_ENABLED);
    const corsCredentials = parseBoolean(process.env.API_CORS_CREDENTIALS, DEFAULT_API_CORS_CREDENTIALS);
    const corsOrigin = validateCorsOrigin(process.env.API_CORS_ORIGIN, corsCredentials, corsEnabled);
    
    // Parse compression
    const compression = parseBoolean(process.env.API_RESPONSE_COMPRESSION, DEFAULT_API_RESPONSE_COMPRESSION);
    
    // Parse versioning and deprecation
    const versioningEnabled = parseBoolean(process.env.API_VERSIONING_ENABLED, DEFAULT_API_VERSIONING_ENABLED);
    const deprecationEnabled = parseBoolean(process.env.API_DEPRECATION_ENABLED, DEFAULT_API_DEPRECATION_ENABLED);
    
    // Build configuration
    const config = {
        enabled,
        prefix,
        version,
        basePath,
        trustClientIp,
        isProduction,
        pagination: {
            defaultLimit,
            maxLimit,
        },
        bodyLimit,
        parameterLimit,
        requestTimeoutMs,
        rateLimit: {
            enabled: rateLimitEnabled,
            windowMs: rateLimitWindowMs,
            max: rateLimitMax,
        },
        cors: {
            enabled: corsEnabled,
            origin: corsOrigin,
            credentials: corsCredentials,
            isWildcard: corsOrigin === '*',
            isMultiOrigin: Array.isArray(corsOrigin),
        },
        compression,
        versioning: {
            enabled: versioningEnabled,
            deprecationEnabled,
            currentVersion: version,
            versions: [version],
        },
    };
    
    return Object.freeze(config);
}

// ----------------------------------------------------------------------------
// 4. SINGLETON CONFIGURATION
// ----------------------------------------------------------------------------

let _config = null;

/**
 * Get the API configuration (singleton)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Immutable API configuration
 */
function getApiConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    if (_config === null) {
        _config = loadApiConfig(nodeEnv);
    }
    return _config;
}

/**
 * Get safe API configuration (for logging/diagnostics)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Safe API configuration
 */
function getSafeApiConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    const config = getApiConfig(nodeEnv);
    
    const safe = {
        enabled: config.enabled,
        prefix: config.prefix,
        version: config.version,
        basePath: config.basePath,
        trustClientIp: config.trustClientIp,
        isProduction: config.isProduction,
        pagination: {
            defaultLimit: config.pagination.defaultLimit,
            maxLimit: config.pagination.maxLimit,
        },
        bodyLimit: config.bodyLimit,
        parameterLimit: config.parameterLimit,
        requestTimeoutMs: config.requestTimeoutMs,
        rateLimit: {
            enabled: config.rateLimit.enabled,
            windowMs: config.rateLimit.windowMs,
            max: config.rateLimit.max,
        },
        cors: {
            enabled: config.cors.enabled,
            origin: Array.isArray(config.cors.origin) ? config.cors.origin : config.cors.origin,
            credentials: config.cors.credentials,
            isWildcard: config.cors.isWildcard,
        },
        compression: config.compression,
        versioning: {
            enabled: config.versioning.enabled,
            deprecationEnabled: config.versioning.deprecationEnabled,
            currentVersion: config.versioning.currentVersion,
            versions: config.versioning.versions,
        },
    };
    
    return Object.freeze(safe);
}

/**
 * Validate API configuration
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Validation result
 */
function validateApiConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    try {
        const config = getApiConfig(nodeEnv);
        const errors = [];
        const warnings = [];
        
        // Validate pagination
        if (config.pagination.defaultLimit > config.pagination.maxLimit) {
            errors.push('Default limit must not exceed max limit');
        }
        
        // Validate rate limit
        if (config.rateLimit.enabled && config.rateLimit.windowMs <= 0) {
            errors.push('Rate limit window must be positive');
        }
        if (config.rateLimit.enabled && config.rateLimit.max <= 0) {
            errors.push('Rate limit max must be positive');
        }
        
        // Validate CORS
        if (config.cors.enabled && config.cors.isWildcard && config.cors.credentials) {
            errors.push('CORS wildcard with credentials is not allowed');
        }
        
        // Check production warnings
        if (config.isProduction) {
            if (!config.rateLimit.enabled) {
                warnings.push('Rate limiting is disabled in production');
            }
            if (config.cors.isWildcard) {
                warnings.push('CORS wildcard is enabled in production - restrict origins');
            }
            if (config.requestTimeoutMs > 60000) {
                warnings.push(`Request timeout (${config.requestTimeoutMs}ms) is high for production`);
            }
            if (config.trustClientIp) {
                warnings.push('API_TRUST_CLIENT_IP is enabled in production - ensure proxy is configured correctly');
            }
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            config: getSafeApiConfig(nodeEnv),
        };
    } catch (error) {
        return {
            valid: false,
            errors: [error.message],
            warnings: [],
            config: null,
        };
    }
}

// ----------------------------------------------------------------------------
// 5. EXPORTS
// ----------------------------------------------------------------------------

export {
    getApiConfig,
    getSafeApiConfig,
    validateApiConfig,
    loadApiConfig,
    parseBoolean,
    parsePositiveInteger,
    parseByteLimit,
    DEFAULT_API_PREFIX,
    DEFAULT_API_VERSION,
    DEFAULT_API_DEFAULT_LIMIT,
    DEFAULT_API_MAX_LIMIT,
};

export default {
    getApiConfig,
    getSafeApiConfig,
    validateApiConfig,
    loadApiConfig,
    parseBoolean,
    parsePositiveInteger,
    parseByteLimit,
    DEFAULT_API_PREFIX,
    DEFAULT_API_VERSION,
    DEFAULT_API_DEFAULT_LIMIT,
    DEFAULT_API_MAX_LIMIT,
};