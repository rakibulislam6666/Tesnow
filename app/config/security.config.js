/**
 * app/config/security.config.js
 * Centralized security configuration for Tesnow
 * Provides secure defaults and validation for security-related settings
 * 
 * @module config/security.config
 */

// ----------------------------------------------------------------------------
// 1. CONSTANTS & DEFAULTS
// ----------------------------------------------------------------------------

// CSRF
const DEFAULT_CSRF_ENABLED = true;

// Rate Limiting
const DEFAULT_RATE_LIMIT_ENABLED = true;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_RATE_LIMIT_MAX = 100;

// Login Rate Limiting
const DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_LOGIN_RATE_LIMIT_MAX = 10;

// Password Hashing
const DEFAULT_BCRYPT_ROUNDS = 12;
const MIN_BCRYPT_ROUNDS = 10;
const MAX_BCRYPT_ROUNDS = 14;

// Password Policy
const DEFAULT_PASSWORD_MIN_LENGTH = 12;
const DEFAULT_PASSWORD_MAX_LENGTH = 128;
const MIN_PASSWORD_LENGTH = 8;

// Account Lockout
const DEFAULT_ACCOUNT_LOCKOUT_THRESHOLD = 5;
const DEFAULT_ACCOUNT_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Cookie Security
const DEFAULT_COOKIE_HTTP_ONLY = true;
const DEFAULT_COOKIE_SECURE = null; // null means auto-detect based on environment
const DEFAULT_COOKIE_SAME_SITE = 'lax';
const VALID_SAME_SITE_VALUES = ['strict', 'lax', 'none'];

// Request Limits
const DEFAULT_JSON_BODY_LIMIT = '1mb';
const DEFAULT_URL_ENCODED_BODY_LIMIT = '1mb';

// Security Headers
const DEFAULT_SECURITY_HEADERS_ENABLED = true;

// Security Events
const DEFAULT_SECURITY_EVENTS_ENABLED = true;
const DEFAULT_SECURITY_EVENTS_RETENTION_DAYS = 90;

// Session Fixation Protection
const DEFAULT_SESSION_FIXATION_PROTECTION = true;

// Reauthentication
const DEFAULT_REAUTHENTICATION_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// Suspicious Login Detection
const DEFAULT_SUSPICIOUS_LOGIN_DETECTION = true;

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
 * Parse integer values safely
 * @param {string|number} value - Value to parse
 * @param {number} defaultValue - Default if parsing fails
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number} Parsed integer
 */
function parseInteger(value, defaultValue, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
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
    
    if (typeof num !== 'number' || !Number.isFinite(num) || !Number.isInteger(num)) {
        return defaultValue;
    }
    
    if (num < min || num > max) {
        return defaultValue;
    }
    
    return num;
}

/**
 * Parse milliseconds from a value
 * @param {string|number} value - Value to parse
 * @param {number} defaultValue - Default if parsing fails
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number} Parsed milliseconds
 */
function parseMs(value, defaultValue, min = 0, max = Number.MAX_SAFE_INTEGER) {
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
    
    if (typeof num !== 'number' || !Number.isFinite(num) || !Number.isInteger(num)) {
        return defaultValue;
    }
    
    if (num < min || num > max) {
        return defaultValue;
    }
    
    return num;
}

/**
 * Parse a byte limit string or number
 * @param {string|number} value - Value to parse
 * @param {string} defaultValue - Default if parsing fails
 * @returns {string} Validated byte limit
 */
function parseByteLimit(value, defaultValue) {
    if (value === null || value === undefined || value === '') {
        return defaultValue;
    }
    
    if (typeof value === 'string') {
        const trimmed = value.trim();
        // Validate format: number followed by optional unit (b, kb, mb, gb)
        if (/^[0-9]+(b|kb|mb|gb)?$/i.test(trimmed)) {
            return trimmed.toLowerCase();
        }
    }
    
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return `${Math.floor(value)}b`;
    }
    
    return defaultValue;
}

/**
 * Validate SameSite value
 * @param {string} value - SameSite value
 * @param {string} defaultValue - Default if invalid
 * @returns {string} Validated SameSite value
 */
function validateSameSite(value, defaultValue) {
    if (typeof value !== 'string' || value.trim() === '') {
        return defaultValue;
    }
    
    const normalized = value.trim().toLowerCase();
    if (VALID_SAME_SITE_VALUES.includes(normalized)) {
        return normalized;
    }
    
    return defaultValue;
}

// ----------------------------------------------------------------------------
// 3. CONFIGURATION LOADER
// ----------------------------------------------------------------------------

/**
 * Load security configuration from environment variables
 * @param {string} nodeEnv - Current Node environment
 * @returns {Object} Immutable security configuration
 */
function loadSecurityConfig(nodeEnv = 'development') {
    const isProduction = nodeEnv === 'production';
    
    // Parse environment variables
    const csrfEnabled = parseBoolean(process.env.CSRF_ENABLED, DEFAULT_CSRF_ENABLED);
    const rateLimitEnabled = parseBoolean(process.env.RATE_LIMIT_ENABLED, DEFAULT_RATE_LIMIT_ENABLED);
    const rateLimitWindowMs = parseMs(process.env.RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT_WINDOW_MS, 1000);
    const rateLimitMax = parseInteger(process.env.RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX, 1);
    
    const loginRateLimitWindowMs = parseMs(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS, 1000);
    const loginRateLimitMax = parseInteger(process.env.LOGIN_RATE_LIMIT_MAX, DEFAULT_LOGIN_RATE_LIMIT_MAX, 1);
    
    const bcryptRounds = parseInteger(process.env.BCRYPT_ROUNDS, DEFAULT_BCRYPT_ROUNDS, MIN_BCRYPT_ROUNDS, MAX_BCRYPT_ROUNDS);
    
    const passwordMinLength = parseInteger(process.env.PASSWORD_MIN_LENGTH, DEFAULT_PASSWORD_MIN_LENGTH, MIN_PASSWORD_LENGTH);
    const passwordMaxLength = parseInteger(process.env.PASSWORD_MAX_LENGTH, DEFAULT_PASSWORD_MAX_LENGTH, passwordMinLength + 1);
    
    const accountLockoutThreshold = parseInteger(process.env.ACCOUNT_LOCKOUT_THRESHOLD, DEFAULT_ACCOUNT_LOCKOUT_THRESHOLD, 1);
    const accountLockoutDurationMs = parseMs(process.env.ACCOUNT_LOCKOUT_DURATION_MS, DEFAULT_ACCOUNT_LOCKOUT_DURATION_MS, 1000);
    
    const cookieHttpOnly = parseBoolean(process.env.COOKIE_HTTP_ONLY, DEFAULT_COOKIE_HTTP_ONLY);
    // For secure: use env if set, else auto-detect from production
    let cookieSecure;
    if (process.env.COOKIE_SECURE !== undefined && process.env.COOKIE_SECURE !== '') {
        cookieSecure = parseBoolean(process.env.COOKIE_SECURE, false);
    } else {
        cookieSecure = isProduction;
    }
    const cookieSameSite = validateSameSite(process.env.COOKIE_SAME_SITE, DEFAULT_COOKIE_SAME_SITE);
    
    const jsonBodyLimit = parseByteLimit(process.env.JSON_BODY_LIMIT, DEFAULT_JSON_BODY_LIMIT);
    const urlEncodedBodyLimit = parseByteLimit(process.env.URL_ENCODED_BODY_LIMIT, DEFAULT_URL_ENCODED_BODY_LIMIT);
    
    const securityHeadersEnabled = parseBoolean(process.env.SECURITY_HEADERS_ENABLED, DEFAULT_SECURITY_HEADERS_ENABLED);
    
    const securityEventsEnabled = parseBoolean(process.env.SECURITY_EVENTS_ENABLED, DEFAULT_SECURITY_EVENTS_ENABLED);
    const securityEventsRetentionDays = parseInteger(process.env.SECURITY_EVENTS_RETENTION_DAYS, DEFAULT_SECURITY_EVENTS_RETENTION_DAYS, 1, 3650);
    
    const sessionFixationProtection = parseBoolean(process.env.SESSION_FIXATION_PROTECTION, DEFAULT_SESSION_FIXATION_PROTECTION);
    const reauthenticationIntervalMs = parseMs(process.env.REAUTHENTICATION_INTERVAL_MS, DEFAULT_REAUTHENTICATION_INTERVAL_MS, 60000);
    const suspiciousLoginDetection = parseBoolean(process.env.SUSPICIOUS_LOGIN_DETECTION, DEFAULT_SUSPICIOUS_LOGIN_DETECTION);
    
    // Build configuration object
    const config = {
        // CSRF
        csrf: {
            enabled: csrfEnabled,
        },
        
        // Rate Limiting
        rateLimit: {
            enabled: rateLimitEnabled,
            windowMs: rateLimitWindowMs,
            max: rateLimitMax,
        },
        
        // Login Rate Limiting
        loginRateLimit: {
            windowMs: loginRateLimitWindowMs,
            max: loginRateLimitMax,
        },
        
        // Password Hashing
        password: {
            bcryptRounds: bcryptRounds,
            minLength: passwordMinLength,
            maxLength: passwordMaxLength,
        },
        
        // Authentication Security
        auth: {
            accountLockoutThreshold: accountLockoutThreshold,
            accountLockoutDurationMs: accountLockoutDurationMs,
            sessionFixationProtection: sessionFixationProtection,
            reauthenticationIntervalMs: reauthenticationIntervalMs,
            suspiciousLoginDetection: suspiciousLoginDetection,
        },
        
        // Cookie Security
        cookies: {
            httpOnly: cookieHttpOnly,
            secure: cookieSecure,
            sameSite: cookieSameSite,
        },
        
        // Request Limits
        request: {
            jsonBodyLimit: jsonBodyLimit,
            urlEncodedBodyLimit: urlEncodedBodyLimit,
        },
        
        // Security Headers
        headers: {
            enabled: securityHeadersEnabled,
        },
        
        // Security Events
        securityEvents: {
            enabled: securityEventsEnabled,
            retentionDays: securityEventsRetentionDays,
        },
        
        // Environment
        environment: nodeEnv,
        isProduction: isProduction,
    };
    
    // Deep freeze to prevent mutation
    return Object.freeze(config);
}

// ----------------------------------------------------------------------------
// 4. SINGLETON CONFIGURATION
// ----------------------------------------------------------------------------

let _config = null;

/**
 * Get the security configuration (singleton)
 * @param {string} nodeEnv - Node environment (optional, auto-detects if not provided)
 * @returns {Object} Immutable security configuration
 */
function getSecurityConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    if (_config === null) {
        _config = loadSecurityConfig(nodeEnv);
    }
    return _config;
}

/**
 * Get CSRF configuration
 * @returns {Object} CSRF configuration
 */
function getCsrfConfig() {
    return getSecurityConfig().csrf;
}

/**
 * Get rate limit configuration
 * @returns {Object} Rate limit configuration
 */
function getRateLimitConfig() {
    return getSecurityConfig().rateLimit;
}

/**
 * Get login rate limit configuration
 * @returns {Object} Login rate limit configuration
 */
function getLoginRateLimitConfig() {
    return getSecurityConfig().loginRateLimit;
}

/**
 * Get password configuration
 * @returns {Object} Password configuration
 */
function getPasswordConfig() {
    return getSecurityConfig().password;
}

/**
 * Get authentication security configuration
 * @returns {Object} Authentication security configuration
 */
function getAuthSecurityConfig() {
    return getSecurityConfig().auth;
}

/**
 * Get cookie security configuration
 * @returns {Object} Cookie security configuration
 */
function getCookieSecurityConfig() {
    return getSecurityConfig().cookies;
}

/**
 * Get request limit configuration
 * @returns {Object} Request limit configuration
 */
function getRequestLimitConfig() {
    return getSecurityConfig().request;
}

/**
 * Get security headers configuration
 * @returns {Object} Security headers configuration
 */
function getHeadersConfig() {
    return getSecurityConfig().headers;
}

/**
 * Get security events configuration
 * @returns {Object} Security events configuration
 */
function getSecurityEventsConfig() {
    return getSecurityConfig().securityEvents;
}

/**
 * Check if security is in production mode
 * @returns {boolean} True if production
 */
function isSecurityProductionMode() {
    return getSecurityConfig().isProduction;
}

/**
 * Validate the security configuration
 * @returns {Object} Validation result
 */
function validateSecurityConfig() {
    try {
        const config = getSecurityConfig();
        
        // Validate critical settings
        const errors = [];
        
        if (!config.csrf.enabled && config.isProduction) {
            errors.push('CSRF is disabled in production - this is a security risk');
        }
        
        if (!config.rateLimit.enabled && config.isProduction) {
            errors.push('Rate limiting is disabled in production - this is a security risk');
        }
        
        if (config.password.bcryptRounds < MIN_BCRYPT_ROUNDS) {
            errors.push(`BCRYPT_ROUNDS (${config.password.bcryptRounds}) is below recommended minimum of ${MIN_BCRYPT_ROUNDS}`);
        }
        
        if (config.password.minLength < MIN_PASSWORD_LENGTH) {
            errors.push(`PASSWORD_MIN_LENGTH (${config.password.minLength}) is below recommended minimum of ${MIN_PASSWORD_LENGTH}`);
        }
        
        if (!config.cookies.httpOnly) {
            errors.push('COOKIE_HTTP_ONLY is false - session cookies should be HTTP-only');
        }
        
        if (config.cookies.sameSite === 'none' && !config.cookies.secure) {
            errors.push('SameSite=none requires Secure cookies - security risk');
        }
        
        if (config.auth.accountLockoutThreshold <= 0) {
            errors.push('ACCOUNT_LOCKOUT_THRESHOLD must be greater than 0');
        }
        
        if (config.auth.accountLockoutDurationMs <= 0) {
            errors.push('ACCOUNT_LOCKOUT_DURATION_MS must be greater than 0');
        }
        
        return {
            valid: errors.length === 0,
            errors,
            config: {
                csrfEnabled: config.csrf.enabled,
                rateLimitEnabled: config.rateLimit.enabled,
                bcryptRounds: config.password.bcryptRounds,
                passwordMinLength: config.password.minLength,
                cookieSecure: config.cookies.secure,
                cookieHttpOnly: config.cookies.httpOnly,
                cookieSameSite: config.cookies.sameSite,
                isProduction: config.isProduction,
            },
        };
    } catch (error) {
        return {
            valid: false,
            errors: [error.message],
            config: null,
        };
    }
}

// ----------------------------------------------------------------------------
// 5. EXPORTS
// ----------------------------------------------------------------------------

export {
    getSecurityConfig,
    getCsrfConfig,
    getRateLimitConfig,
    getLoginRateLimitConfig,
    getPasswordConfig,
    getAuthSecurityConfig,
    getCookieSecurityConfig,
    getRequestLimitConfig,
    getHeadersConfig,
    getSecurityEventsConfig,
    isSecurityProductionMode,
    validateSecurityConfig,
    loadSecurityConfig,
    VALID_SAME_SITE_VALUES,
    MIN_BCRYPT_ROUNDS,
    MAX_BCRYPT_ROUNDS,
};

export default {
    getSecurityConfig,
    getCsrfConfig,
    getRateLimitConfig,
    getLoginRateLimitConfig,
    getPasswordConfig,
    getAuthSecurityConfig,
    getCookieSecurityConfig,
    getRequestLimitConfig,
    getHeadersConfig,
    getSecurityEventsConfig,
    isSecurityProductionMode,
    validateSecurityConfig,
    loadSecurityConfig,
    VALID_SAME_SITE_VALUES,
    MIN_BCRYPT_ROUNDS,
    MAX_BCRYPT_ROUNDS,
};