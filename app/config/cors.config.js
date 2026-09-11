/**
 * app/config/cors.config.js
 * Centralized CORS configuration for Tesnow
 * Provides secure, validated CORS settings for cross-origin requests
 * 
 * @module config/cors.config
 */

// ----------------------------------------------------------------------------
// 1. CONSTANTS & DEFAULTS
// ----------------------------------------------------------------------------

const DEFAULT_CORS_ENABLED = true;
const DEFAULT_CORS_ORIGIN = 'http://localhost:3000';
const DEFAULT_CORS_CREDENTIALS = false;
const DEFAULT_CORS_METHODS = 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS';
const DEFAULT_CORS_ALLOWED_HEADERS = 'Origin,X-Requested-With,Content-Type,Accept,Authorization,X-Request-ID,X-CSRF-Token,X-API-Key';
const DEFAULT_CORS_EXPOSED_HEADERS = 'X-Request-ID,X-RateLimit-Limit,X-RateLimit-Remaining,X-RateLimit-Reset';
const DEFAULT_CORS_MAX_AGE = 86400; // 24 hours
const DEFAULT_CORS_PREFLIGHT_CONTINUE = false;
const DEFAULT_CORS_OPTIONS_SUCCESS_STATUS = 204;

const VALID_METHODS = ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS', 'CONNECT', 'TRACE'];
const MAX_AGE_MIN = 0;
const MAX_AGE_MAX = 86400 * 30; // 30 days
const MAX_AGE_DEFAULT = 86400;

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
function parsePositiveInteger(value, defaultValue, min = 0, max = Number.MAX_SAFE_INTEGER) {
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
 * Validate safe string (basic sanitization)
 * @param {string} value - Value to validate
 * @param {string} defaultValue - Default if empty
 * @param {number} maxLength - Maximum allowed length
 * @param {string} name - Name for error messages
 * @param {boolean} allowEmpty - Whether empty is allowed
 * @returns {string} Validated string
 */
function validateSafeString(value, defaultValue, maxLength, name, allowEmpty = false) {
    if (value === null || value === undefined) {
        return defaultValue || '';
    }

    if (typeof value !== 'string') {
        throw new Error(`${name} must be a string`);
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
        if (allowEmpty) {
            return '';
        }
        return defaultValue || '';
    }

    // Check for null bytes
    if (trimmed.includes('\x00')) {
        throw new Error(`${name} contains null bytes`);
    }

    // Check for control characters
    if (/[\x01-\x1F\x7F]/.test(trimmed)) {
        throw new Error(`${name} contains invalid control characters`);
    }

    // Check for CR/LF
    if (trimmed.includes('\n') || trimmed.includes('\r')) {
        throw new Error(`${name} contains invalid newline characters`);
    }

    if (trimmed.length > maxLength) {
        throw new Error(`${name} exceeds maximum length of ${maxLength}`);
    }

    return trimmed;
}

/**
 * Parse CORS origin(s)
 * @param {string} origin - Comma-separated origins or '*'
 * @param {boolean} credentials - Whether credentials are allowed
 * @param {string} nodeEnv - Current environment
 * @returns {string|string[]} Validated origin(s)
 */
function validateOrigin(origin, credentials, nodeEnv) {
    if (typeof origin !== 'string' || origin.trim() === '') {
        // Provide environment-aware default
        if (nodeEnv === 'production') {
            throw new Error('CORS_ORIGIN must be explicitly set in production');
        }
        return DEFAULT_CORS_ORIGIN;
    }

    const trimmed = origin.trim();

    // Handle wildcard
    if (trimmed === '*') {
        if (credentials) {
            throw new Error('CORS_ORIGIN cannot be "*" when credentials are enabled');
        }
        return '*';
    }

    // Split into multiple origins
    const parts = trimmed.split(',').map(o => o.trim()).filter(o => o.length > 0);

    if (parts.length === 0) {
        if (nodeEnv === 'production') {
            throw new Error('CORS_ORIGIN cannot be empty in production');
        }
        return DEFAULT_CORS_ORIGIN;
    }

    // Validate each part
    const validated = [];
    for (const part of parts) {
        // Allow localhost variants without protocol for convenience
        if (part === 'localhost' || part.startsWith('localhost:')) {
            validated.push(part);
            continue;
        }

        // Validate URL format
        try {
            const url = new URL(part);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                throw new Error(`Invalid origin protocol: ${part}`);
            }
            // Remove trailing slash
            const normalized = url.toString().replace(/\/+$/, '');
            validated.push(normalized);
        } catch {
            // If it's not a valid URL, reject
            throw new Error(`Invalid CORS origin: ${part}`);
        }
    }

    // If only one, return as string, else array
    return validated.length === 1 ? validated[0] : validated;
}

/**
 * Validate allowed methods
 * @param {string} methods - Comma-separated HTTP methods
 * @returns {string[]} Validated methods
 */
function validateMethods(methods) {
    if (typeof methods !== 'string' || methods.trim() === '') {
        return ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'];
    }

    const parts = methods.split(',').map(m => m.trim().toUpperCase()).filter(m => m.length > 0);

    if (parts.length === 0) {
        return ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'];
    }

    // Validate each method
    for (const method of parts) {
        if (!VALID_METHODS.includes(method)) {
            throw new Error(`Invalid HTTP method: ${method}`);
        }
    }

    return parts;
}

/**
 * Validate allowed headers
 * @param {string} headers - Comma-separated header names
 * @returns {string[]} Validated headers
 */
function validateHeaders(headers) {
    if (typeof headers !== 'string' || headers.trim() === '') {
        return ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'X-Request-ID', 'X-CSRF-Token', 'X-API-Key'];
    }

    const parts = headers.split(',').map(h => h.trim()).filter(h => h.length > 0);

    if (parts.length === 0) {
        return ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'X-Request-ID', 'X-CSRF-Token', 'X-API-Key'];
    }

    // Basic sanitization: reject control characters
    for (const header of parts) {
        if (/[\x00-\x1F\x7F]/.test(header)) {
            throw new Error(`Invalid header name: ${header}`);
        }
    }

    return parts;
}

// ----------------------------------------------------------------------------
// 3. CONFIGURATION LOADER
// ----------------------------------------------------------------------------

/**
 * Load CORS configuration from environment variables
 * @param {string} nodeEnv - Current Node environment
 * @returns {Object} Immutable CORS configuration
 */
function loadCorsConfig(nodeEnv = 'development') {
    const isProduction = nodeEnv === 'production';

    // Parse enabled flag
    const enabled = parseBoolean(process.env.CORS_ENABLED, DEFAULT_CORS_ENABLED);

    // Parse credentials (must come before origin validation)
    const credentials = parseBoolean(process.env.CORS_CREDENTIALS, DEFAULT_CORS_CREDENTIALS);

    // Parse origin (depends on credentials)
    let origin;
    if (enabled) {
        origin = validateOrigin(process.env.CORS_ORIGIN, credentials, nodeEnv);
    } else {
        origin = '';
    }

    // Parse methods
    const methods = validateMethods(process.env.CORS_METHODS);

    // Parse allowed headers
    const allowedHeaders = validateHeaders(process.env.CORS_ALLOWED_HEADERS);

    // Parse exposed headers
    const exposedHeaders = validateHeaders(process.env.CORS_EXPOSED_HEADERS);

    // Parse max age
    let maxAge = DEFAULT_CORS_MAX_AGE;
    if (enabled) {
        maxAge = parsePositiveInteger(
            process.env.CORS_MAX_AGE,
            DEFAULT_CORS_MAX_AGE,
            MAX_AGE_MIN,
            MAX_AGE_MAX
        );
    }

    // Parse preflight continue
    const preflightContinue = parseBoolean(process.env.CORS_PREFLIGHT_CONTINUE, DEFAULT_CORS_PREFLIGHT_CONTINUE);

    // Parse options success status
    let optionsSuccessStatus = DEFAULT_CORS_OPTIONS_SUCCESS_STATUS;
    if (enabled) {
        optionsSuccessStatus = parsePositiveInteger(
            process.env.CORS_OPTIONS_SUCCESS_STATUS,
            DEFAULT_CORS_OPTIONS_SUCCESS_STATUS,
            200,
            204
        );
    }

    // Build configuration
    const config = {
        enabled,
        origin,
        credentials,
        methods,
        allowedHeaders,
        exposedHeaders,
        maxAge,
        preflightContinue,
        optionsSuccessStatus,
        isProduction,
        isConfigured: enabled,
        // Determine if origin is wildcard
        isWildcard: origin === '*',
        isMultiOrigin: Array.isArray(origin),
        // Determine if credentials are allowed with wildcard (should be false)
        isSafe: !(origin === '*' && credentials),
    };

    return Object.freeze(config);
}

// ----------------------------------------------------------------------------
// 4. SINGLETON CONFIGURATION
// ----------------------------------------------------------------------------

let _config = null;

/**
 * Get the CORS configuration (singleton)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Immutable CORS configuration
 */
function getCorsConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    if (_config === null) {
        _config = loadCorsConfig(nodeEnv);
    }
    return _config;
}

/**
 * Get safe CORS configuration (for logging/diagnostics)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Safe CORS configuration
 */
function getSafeCorsConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    const config = getCorsConfig(nodeEnv);

    return Object.freeze({
        enabled: config.enabled,
        origin: Array.isArray(config.origin) ? config.origin : config.origin,
        credentials: config.credentials,
        methods: config.methods,
        allowedHeaders: config.allowedHeaders,
        exposedHeaders: config.exposedHeaders,
        maxAge: config.maxAge,
        preflightContinue: config.preflightContinue,
        optionsSuccessStatus: config.optionsSuccessStatus,
        isProduction: config.isProduction,
        isWildcard: config.isWildcard,
        isSafe: config.isSafe,
        isConfigured: config.isConfigured,
    });
}

/**
 * Validate CORS configuration
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Validation result
 */
function validateCorsConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    try {
        const config = getCorsConfig(nodeEnv);
        const errors = [];
        const warnings = [];

        // Security checks
        if (config.enabled && config.origin === '*' && config.credentials) {
            errors.push('CORS origin is wildcard and credentials are enabled - this is insecure');
        }

        if (config.enabled && config.isProduction && config.origin === '*') {
            warnings.push('CORS wildcard origin is used in production - restrict origins');
        }

        if (config.enabled && config.isProduction && config.origin === '') {
            errors.push('CORS origin is empty in production');
        }

        if (config.enabled && config.isProduction && config.origin === 'http://localhost:3000') {
            warnings.push('CORS origin is localhost in production - may not be intended');
        }

        if (config.enabled && config.maxAge < 3600 && config.isProduction) {
            warnings.push(`CORS max age (${config.maxAge}s) is short in production - consider increasing`);
        }

        // Check methods
        if (config.methods.includes('*')) {
            errors.push('CORS methods cannot include wildcard');
        }

        // Check that origin is not a credential-bearing URL
        if (config.enabled && typeof config.origin === 'string' && config.origin.includes('@')) {
            errors.push('CORS origin contains credentials');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            config: getSafeCorsConfig(nodeEnv),
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
    getCorsConfig,
    getSafeCorsConfig,
    validateCorsConfig,
    loadCorsConfig,
    parseBoolean,
    DEFAULT_CORS_ENABLED,
    DEFAULT_CORS_ORIGIN,
};

export default {
    ALLOWED_ORIGINS: (() => {
        const config = getCorsConfig();
        if (!config.enabled) return [];
        if (config.origin === '*') return [];
        return Array.isArray(config.origin)
            ? config.origin
            : [config.origin];
    })(),

    CREDENTIALS: getCorsConfig().credentials,

    getCorsConfig,
    getSafeCorsConfig,
    validateCorsConfig,
    loadCorsConfig,
    parseBoolean,
    DEFAULT_CORS_ENABLED,
    DEFAULT_CORS_ORIGIN,
};