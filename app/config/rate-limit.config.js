/**
 * app/config/rate-limit.config.js
 * Centralized rate-limiting configuration for Tesnow
 * Provides secure, validated rate limit settings for global and route-specific limits
 * 
 * @module config/rate-limit.config
 */

// ----------------------------------------------------------------------------
// 1. CONSTANTS & DEFAULTS
// ----------------------------------------------------------------------------

const DEFAULT_RATE_LIMIT_ENABLED = true;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_RATE_LIMIT_MAX = 100;
const DEFAULT_RATE_LIMIT_MESSAGE = 'Too many requests, please try again later.';
const DEFAULT_RATE_LIMIT_STATUS_CODE = 429;
const DEFAULT_RATE_LIMIT_SKIP_SUCCESSFUL = false;
const DEFAULT_RATE_LIMIT_KEY_GENERATOR = 'ip'; // 'ip', 'userId', 'apiKey'
const DEFAULT_RATE_LIMIT_STORE = 'memory';

const MIN_WINDOW_MS = 1000;
const MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MIN_MAX_REQUESTS = 1;
const MAX_MAX_REQUESTS = 100000;
const VALID_KEY_GENERATORS = ['ip', 'userId', 'apiKey', 'combined'];
const VALID_STORES = ['memory', 'redis', 'database'];

// Route-specific defaults
const DEFAULT_LOGIN_RATE_LIMIT_ENABLED = true;
const DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_LOGIN_RATE_LIMIT_MAX = 10;

const DEFAULT_REGISTER_RATE_LIMIT_ENABLED = true;
const DEFAULT_REGISTER_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_REGISTER_RATE_LIMIT_MAX = 5;

const DEFAULT_PASSWORD_RESET_RATE_LIMIT_ENABLED = true;
const DEFAULT_PASSWORD_RESET_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_PASSWORD_RESET_RATE_LIMIT_MAX = 3;

const DEFAULT_COMMENT_RATE_LIMIT_ENABLED = true;
const DEFAULT_COMMENT_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const DEFAULT_COMMENT_RATE_LIMIT_MAX = 10;

const DEFAULT_API_RATE_LIMIT_ENABLED = true;
const DEFAULT_API_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_API_RATE_LIMIT_MAX = 60;

const DEFAULT_ADMIN_RATE_LIMIT_ENABLED = true;
const DEFAULT_ADMIN_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_ADMIN_RATE_LIMIT_MAX = 30;

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
 * Validate safe string
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
 * Validate key generator strategy
 * @param {string} strategy - Key generator strategy
 * @param {string} defaultValue - Default if invalid
 * @returns {string} Validated strategy
 */
function validateKeyGenerator(strategy, defaultValue) {
    if (typeof strategy !== 'string' || strategy.trim() === '') {
        return defaultValue;
    }

    const normalized = strategy.trim().toLowerCase();

    if (!VALID_KEY_GENERATORS.includes(normalized)) {
        throw new Error(`Key generator must be one of: ${VALID_KEY_GENERATORS.join(', ')}`);
    }

    return normalized;
}

/**
 * Validate store type
 * @param {string} store - Store type
 * @param {string} defaultValue - Default if invalid
 * @returns {string} Validated store
 */
function validateStore(store, defaultValue) {
    if (typeof store !== 'string' || store.trim() === '') {
        return defaultValue;
    }

    const normalized = store.trim().toLowerCase();

    if (!VALID_STORES.includes(normalized)) {
        throw new Error(`Store must be one of: ${VALID_STORES.join(', ')}`);
    }

    return normalized;
}

// ----------------------------------------------------------------------------
// 3. CONFIGURATION LOADER
// ----------------------------------------------------------------------------

/**
 * Load rate-limit configuration from environment variables
 * @param {string} nodeEnv - Current Node environment
 * @returns {Object} Immutable rate-limit configuration
 */
function loadRateLimitConfig(nodeEnv = 'development') {
    const isProduction = nodeEnv === 'production';

    // Global settings
    const enabled = parseBoolean(process.env.RATE_LIMIT_ENABLED, DEFAULT_RATE_LIMIT_ENABLED);
    const windowMs = parsePositiveInteger(
        process.env.RATE_LIMIT_WINDOW_MS,
        DEFAULT_RATE_LIMIT_WINDOW_MS,
        MIN_WINDOW_MS,
        MAX_WINDOW_MS
    );
    const max = parsePositiveInteger(
        process.env.RATE_LIMIT_MAX,
        DEFAULT_RATE_LIMIT_MAX,
        MIN_MAX_REQUESTS,
        MAX_MAX_REQUESTS
    );
    const message = validateSafeString(
        process.env.RATE_LIMIT_MESSAGE,
        DEFAULT_RATE_LIMIT_MESSAGE,
        500,
        'RATE_LIMIT_MESSAGE',
        false
    );
    const statusCode = parsePositiveInteger(
        process.env.RATE_LIMIT_STATUS_CODE,
        DEFAULT_RATE_LIMIT_STATUS_CODE,
        400,
        599
    );
    const skipSuccessful = parseBoolean(process.env.RATE_LIMIT_SKIP_SUCCESSFUL, DEFAULT_RATE_LIMIT_SKIP_SUCCESSFUL);
    const keyGenerator = validateKeyGenerator(process.env.RATE_LIMIT_KEY_GENERATOR, DEFAULT_RATE_LIMIT_KEY_GENERATOR);
    const store = validateStore(process.env.RATE_LIMIT_STORE, DEFAULT_RATE_LIMIT_STORE);

    // Route-specific settings (prefixed with RATE_LIMIT_ROUTE_)
    const routeConfigs = {
        login: {
            enabled: parseBoolean(process.env.RATE_LIMIT_LOGIN_ENABLED, DEFAULT_LOGIN_RATE_LIMIT_ENABLED),
            windowMs: parsePositiveInteger(
                process.env.RATE_LIMIT_LOGIN_WINDOW_MS,
                DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS,
                MIN_WINDOW_MS,
                MAX_WINDOW_MS
            ),
            max: parsePositiveInteger(
                process.env.RATE_LIMIT_LOGIN_MAX,
                DEFAULT_LOGIN_RATE_LIMIT_MAX,
                MIN_MAX_REQUESTS,
                MAX_MAX_REQUESTS
            ),
        },
        register: {
            enabled: parseBoolean(process.env.RATE_LIMIT_REGISTER_ENABLED, DEFAULT_REGISTER_RATE_LIMIT_ENABLED),
            windowMs: parsePositiveInteger(
                process.env.RATE_LIMIT_REGISTER_WINDOW_MS,
                DEFAULT_REGISTER_RATE_LIMIT_WINDOW_MS,
                MIN_WINDOW_MS,
                MAX_WINDOW_MS
            ),
            max: parsePositiveInteger(
                process.env.RATE_LIMIT_REGISTER_MAX,
                DEFAULT_REGISTER_RATE_LIMIT_MAX,
                MIN_MAX_REQUESTS,
                MAX_MAX_REQUESTS
            ),
        },
        passwordReset: {
            enabled: parseBoolean(process.env.RATE_LIMIT_PASSWORD_RESET_ENABLED, DEFAULT_PASSWORD_RESET_RATE_LIMIT_ENABLED),
            windowMs: parsePositiveInteger(
                process.env.RATE_LIMIT_PASSWORD_RESET_WINDOW_MS,
                DEFAULT_PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
                MIN_WINDOW_MS,
                MAX_WINDOW_MS
            ),
            max: parsePositiveInteger(
                process.env.RATE_LIMIT_PASSWORD_RESET_MAX,
                DEFAULT_PASSWORD_RESET_RATE_LIMIT_MAX,
                MIN_MAX_REQUESTS,
                MAX_MAX_REQUESTS
            ),
        },
        comment: {
            enabled: parseBoolean(process.env.RATE_LIMIT_COMMENT_ENABLED, DEFAULT_COMMENT_RATE_LIMIT_ENABLED),
            windowMs: parsePositiveInteger(
                process.env.RATE_LIMIT_COMMENT_WINDOW_MS,
                DEFAULT_COMMENT_RATE_LIMIT_WINDOW_MS,
                MIN_WINDOW_MS,
                MAX_WINDOW_MS
            ),
            max: parsePositiveInteger(
                process.env.RATE_LIMIT_COMMENT_MAX,
                DEFAULT_COMMENT_RATE_LIMIT_MAX,
                MIN_MAX_REQUESTS,
                MAX_MAX_REQUESTS
            ),
        },
        api: {
            enabled: parseBoolean(process.env.RATE_LIMIT_API_ENABLED, DEFAULT_API_RATE_LIMIT_ENABLED),
            windowMs: parsePositiveInteger(
                process.env.RATE_LIMIT_API_WINDOW_MS,
                DEFAULT_API_RATE_LIMIT_WINDOW_MS,
                MIN_WINDOW_MS,
                MAX_WINDOW_MS
            ),
            max: parsePositiveInteger(
                process.env.RATE_LIMIT_API_MAX,
                DEFAULT_API_RATE_LIMIT_MAX,
                MIN_MAX_REQUESTS,
                MAX_MAX_REQUESTS
            ),
        },
        admin: {
            enabled: parseBoolean(process.env.RATE_LIMIT_ADMIN_ENABLED, DEFAULT_ADMIN_RATE_LIMIT_ENABLED),
            windowMs: parsePositiveInteger(
                process.env.RATE_LIMIT_ADMIN_WINDOW_MS,
                DEFAULT_ADMIN_RATE_LIMIT_WINDOW_MS,
                MIN_WINDOW_MS,
                MAX_WINDOW_MS
            ),
            max: parsePositiveInteger(
                process.env.RATE_LIMIT_ADMIN_MAX,
                DEFAULT_ADMIN_RATE_LIMIT_MAX,
                MIN_MAX_REQUESTS,
                MAX_MAX_REQUESTS
            ),
        },
    };

    // Build configuration
    const config = {
        enabled,
        windowMs,
        max,
        message,
        statusCode,
        skipSuccessful,
        keyGenerator,
        store,
        isProduction,
        routes: Object.freeze(routeConfigs),
        isConfigured: enabled,
        // For express-rate-limit compatibility
        expressOptions: {
            windowMs,
            max,
            message,
            statusCode,
            skipSuccessful,
            keyGenerator: keyGenerator === 'ip' ? undefined : keyGenerator, // express-rate-limit uses keyGenerator function
            store: store === 'memory' ? undefined : store, // store will be provided by middleware
        },
    };

    return Object.freeze(config);
}

// ----------------------------------------------------------------------------
// 4. SINGLETON CONFIGURATION
// ----------------------------------------------------------------------------

let _config = null;

/**
 * Get the rate-limit configuration (singleton)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Immutable rate-limit configuration
 */
function getRateLimitConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    if (_config === null) {
        _config = loadRateLimitConfig(nodeEnv);
    }
    return _config;
}

/**
 * Get safe rate-limit configuration (for logging/diagnostics)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Safe rate-limit configuration
 */
function getSafeRateLimitConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    const config = getRateLimitConfig(nodeEnv);

    const safe = {
        enabled: config.enabled,
        windowMs: config.windowMs,
        max: config.max,
        statusCode: config.statusCode,
        skipSuccessful: config.skipSuccessful,
        keyGenerator: config.keyGenerator,
        store: config.store,
        isProduction: config.isProduction,
        routes: Object.entries(config.routes).reduce((acc, [key, route]) => {
            acc[key] = {
                enabled: route.enabled,
                windowMs: route.windowMs,
                max: route.max,
            };
            return acc;
        }, {}),
        isConfigured: config.isConfigured,
    };

    return Object.freeze(safe);
}

/**
 * Validate rate-limit configuration
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Validation result
 */
function validateRateLimitConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    try {
        const config = getRateLimitConfig(nodeEnv);
        const errors = [];
        const warnings = [];

        // Check global limits
        if (config.enabled) {
            if (config.max <= 0) {
                errors.push('RATE_LIMIT_MAX must be greater than 0');
            }
            if (config.windowMs < MIN_WINDOW_MS) {
                errors.push(`RATE_LIMIT_WINDOW_MS must be at least ${MIN_WINDOW_MS}ms`);
            }
            if (config.windowMs > MAX_WINDOW_MS) {
                errors.push(`RATE_LIMIT_WINDOW_MS must be at most ${MAX_WINDOW_MS}ms`);
            }
            if (config.statusCode < 400 || config.statusCode > 599) {
                errors.push('RATE_LIMIT_STATUS_CODE must be between 400 and 599');
            }
        }

        // Check route-specific limits
        for (const [route, routeConfig] of Object.entries(config.routes)) {
            if (routeConfig.enabled) {
                if (routeConfig.max <= 0) {
                    errors.push(`Route "${route}" max must be greater than 0`);
                }
                if (routeConfig.windowMs < MIN_WINDOW_MS) {
                    errors.push(`Route "${route}" window must be at least ${MIN_WINDOW_MS}ms`);
                }
                if (routeConfig.windowMs > MAX_WINDOW_MS) {
                    errors.push(`Route "${route}" window must be at most ${MAX_WINDOW_MS}ms`);
                }
            }
        }

        // Production security checks
        if (config.isProduction) {
            if (!config.enabled) {
                warnings.push('Rate limiting is disabled in production - this may allow abuse');
            }
            if (config.store === 'memory') {
                warnings.push('Memory store is not scalable in production - consider using Redis');
            }
            if (config.keyGenerator === 'ip' && config.isProduction) {
                warnings.push('Using IP-based key generator in production may be unreliable behind proxies');
            }
            if (config.max > 1000) {
                warnings.push(`Global max (${config.max}) is high in production - consider lower limits`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            config: getSafeRateLimitConfig(nodeEnv),
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
    getRateLimitConfig,
    getSafeRateLimitConfig,
    validateRateLimitConfig,
    loadRateLimitConfig,
    parseBoolean,
    DEFAULT_RATE_LIMIT_ENABLED,
    DEFAULT_RATE_LIMIT_WINDOW_MS,
    DEFAULT_RATE_LIMIT_MAX,
    VALID_KEY_GENERATORS,
    VALID_STORES,
};

export default {
    getRateLimitConfig,
    getSafeRateLimitConfig,
    validateRateLimitConfig,
    loadRateLimitConfig,
    parseBoolean,
    DEFAULT_RATE_LIMIT_ENABLED,
    DEFAULT_RATE_LIMIT_WINDOW_MS,
    DEFAULT_RATE_LIMIT_MAX,
    VALID_KEY_GENERATORS,
    VALID_STORES,
};