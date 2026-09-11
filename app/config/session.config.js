/**
 * app/config/session.config.js
 * Centralized session configuration for Tesnow
 * Provides secure session configuration with secret isolation
 * 
 * @module config/session.config
 */

// ----------------------------------------------------------------------------
// 1. CONSTANTS & DEFAULTS
// ----------------------------------------------------------------------------

const DEFAULT_SESSION_NAME = 'tesnow.sid';
const DEFAULT_SESSION_MAX_AGE = 604800000; // 7 days
const DEFAULT_SESSION_HTTP_ONLY = true;
const DEFAULT_SESSION_SAME_SITE = 'lax';
const DEFAULT_SESSION_RESAVE = false;
const DEFAULT_SESSION_SAVE_UNINITIALIZED = false;
const DEFAULT_SESSION_ROLLING = false;
const DEFAULT_REGEN_ON_AUTH = true;

const MIN_SECRET_LENGTH = 32;
const MAX_SESSION_NAME_LENGTH = 64;
const VALID_SAME_SITE_VALUES = ['strict', 'lax', 'none'];
const MAX_SESSION_MAX_AGE = 90 * 24 * 60 * 60 * 1000; // 90 days
const MIN_SESSION_MAX_AGE = 60 * 1000; // 1 minute
const PLACEHOLDER_SECRETS = [
    'CHANGE_ME_TO_A_LONG_RANDOM_SECRET',
    'CHANGE_ME_TO_A_LONG_RANDOM_SECRET',
    'secret',
    'change_me',
    'your-secret-here',
    'changeme',
    'default_secret',
];

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
 * Validate session secret
 * @param {string} secret - Session secret
 * @param {string} nodeEnv - Current environment
 * @returns {Object} Validation result with secret info
 */
function validateSessionSecret(secret, nodeEnv) {
    const isProduction = nodeEnv === 'production';
    
    if (!secret || typeof secret !== 'string') {
        if (isProduction) {
            throw new Error('SESSION_SECRET is required in production');
        }
        return {
            valid: false,
            isPlaceholder: false,
            hasSecret: false,
            length: 0,
            error: 'SESSION_SECRET is missing',
        };
    }
    
    const trimmed = secret.trim();
    
    if (trimmed.length === 0) {
        if (isProduction) {
            throw new Error('SESSION_SECRET cannot be empty in production');
        }
        return {
            valid: false,
            isPlaceholder: false,
            hasSecret: false,
            length: 0,
            error: 'SESSION_SECRET is empty',
        };
    }
    
    // Check for placeholder values
    const isPlaceholder = PLACEHOLDER_SECRETS.some(p => 
        trimmed.toLowerCase() === p.toLowerCase()
    );
    
    if (isPlaceholder) {
        if (isProduction) {
            throw new Error('SESSION_SECRET uses a placeholder value - must be changed in production');
        }
        return {
            valid: false,
            isPlaceholder: true,
            hasSecret: false,
            length: trimmed.length,
            error: 'SESSION_SECRET is a placeholder value',
        };
    }
    
    // Check minimum length
    if (trimmed.length < MIN_SECRET_LENGTH) {
        if (isProduction) {
            throw new Error(`SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
        }
        return {
            valid: false,
            isPlaceholder: false,
            hasSecret: false,
            length: trimmed.length,
            error: `SESSION_SECRET is too short (${trimmed.length} < ${MIN_SECRET_LENGTH})`,
        };
    }
    
    // Check for control characters
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
        throw new Error('SESSION_SECRET contains invalid control characters');
    }
    
    return {
        valid: true,
        isPlaceholder: false,
        hasSecret: true,
        length: trimmed.length,
        secret: trimmed, // Internal use only - not exposed
        error: null,
    };
}

/**
 * Validate session name
 * @param {string} name - Session cookie name
 * @returns {string} Validated name
 */
function validateSessionName(name) {
    if (!name || typeof name !== 'string') {
        return DEFAULT_SESSION_NAME;
    }
    
    const trimmed = name.trim();
    
    if (trimmed.length === 0) {
        return DEFAULT_SESSION_NAME;
    }
    
    if (trimmed.length > MAX_SESSION_NAME_LENGTH) {
        throw new Error(`SESSION_NAME exceeds maximum length of ${MAX_SESSION_NAME_LENGTH}`);
    }
    
    // Only allow safe cookie name characters
    if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
        throw new Error('SESSION_NAME contains invalid characters. Only alphanumeric, dot, underscore, and hyphen allowed.');
    }
    
    // Check for control characters
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
        throw new Error('SESSION_NAME contains invalid control characters');
    }
    
    // Prevent semicolons (cookie separator)
    if (trimmed.includes(';')) {
        throw new Error('SESSION_NAME cannot contain semicolons');
    }
    
    return trimmed;
}

/**
 * Validate session max age
 * @param {string|number} value - Max age value
 * @returns {number} Validated max age
 */
function validateMaxAge(value) {
    if (value === null || value === undefined || value === '') {
        return DEFAULT_SESSION_MAX_AGE;
    }
    
    let num;
    if (typeof value === 'string') {
        num = parseInt(value, 10);
    } else if (typeof value === 'number') {
        num = value;
    } else {
        return DEFAULT_SESSION_MAX_AGE;
    }
    
    if (typeof num !== 'number' || !Number.isFinite(num) || !Number.isInteger(num)) {
        return DEFAULT_SESSION_MAX_AGE;
    }
    
    if (num < MIN_SESSION_MAX_AGE) {
        throw new Error(`SESSION_MAX_AGE (${num}ms) is below minimum of ${MIN_SESSION_MAX_AGE}ms`);
    }
    
    if (num > MAX_SESSION_MAX_AGE) {
        throw new Error(`SESSION_MAX_AGE (${num}ms) exceeds maximum of ${MAX_SESSION_MAX_AGE}ms`);
    }
    
    return num;
}

/**
 * Validate SameSite value
 * @param {string} value - SameSite value
 * @param {boolean} secure - Secure flag for validation
 * @returns {string} Validated SameSite value
 */
function validateSameSite(value, secure) {
    if (!value || typeof value !== 'string') {
        return DEFAULT_SESSION_SAME_SITE;
    }
    
    const normalized = value.trim().toLowerCase();
    
    if (!VALID_SAME_SITE_VALUES.includes(normalized)) {
        throw new Error(`SESSION_SAME_SITE must be one of: ${VALID_SAME_SITE_VALUES.join(', ')}`);
    }
    
    // Enforce SameSite=None with Secure
    if (normalized === 'none' && !secure) {
        throw new Error('SESSION_SAME_SITE=none requires SESSION_SECURE=true');
    }
    
    return normalized;
}

// ----------------------------------------------------------------------------
// 3. CONFIGURATION LOADER
// ----------------------------------------------------------------------------

/**
 * Load session configuration from environment variables
 * @param {string} nodeEnv - Current Node environment
 * @returns {Object} Immutable session configuration
 */
function loadSessionConfig(nodeEnv = 'development') {
    const isProduction = nodeEnv === 'production';
    
    // Parse secret
    const secretResult = validateSessionSecret(process.env.SESSION_SECRET, nodeEnv);
    const hasSecret = secretResult.valid && secretResult.hasSecret;
    const secret = secretResult.valid ? secretResult.secret : null;
    
    // Parse configuration
    const name = validateSessionName(process.env.SESSION_NAME);
    const maxAge = validateMaxAge(process.env.SESSION_MAX_AGE);
    
    // Cookie security - production defaults to secure
    let secure;
    if (process.env.SESSION_SECURE !== undefined && process.env.SESSION_SECURE !== '') {
        secure = parseBoolean(process.env.SESSION_SECURE, false);
    } else {
        secure = isProduction;
    }
    
    const httpOnly = parseBoolean(process.env.SESSION_HTTP_ONLY, DEFAULT_SESSION_HTTP_ONLY);
    const sameSite = validateSameSite(process.env.SESSION_SAME_SITE, secure);
    
    const resave = parseBoolean(process.env.SESSION_RESAVE, DEFAULT_SESSION_RESAVE);
    const saveUninitialized = parseBoolean(process.env.SESSION_SAVE_UNINITIALIZED, DEFAULT_SESSION_SAVE_UNINITIALIZED);
    const rolling = parseBoolean(process.env.SESSION_ROLLING, DEFAULT_SESSION_ROLLING);
    const regenOnAuth = parseBoolean(process.env.SESSION_REGEN_ON_AUTH, DEFAULT_REGEN_ON_AUTH);
    
    // Build safe configuration (no secret)
    const safeConfig = {
        // Internal secret - removed before public config is returned
        _secret: secret,
        // Basic session settings
        name,
        maxAge,
        httpOnly,
        secure,
        sameSite,
        resave,
        saveUninitialized,
        rolling,
        regenOnAuth,
        
        // Security indicators
        hasSecret,
        secretLength: hasSecret ? secret.length : 0,
        isProduction,
        isSecure: secure,
        
        // Cookie configuration for express-session
        cookie: {
            httpOnly,
            secure,
            sameSite,
            maxAge,
        },
        
        // Store configuration (placeholder for future)
        storeType: 'memory', // Will be overridden by production config
    };
    
    return Object.freeze(safeConfig);
}

// ----------------------------------------------------------------------------
// 4. SINGLETON CONFIGURATION
// ----------------------------------------------------------------------------

let _config = null;
let _secret = null;

/**
 * Get the session configuration (singleton)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Immutable session configuration (without secret)
 */
function getSessionConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    if (_config === null) {
        const loaded = loadSessionConfig(nodeEnv);
        _secret = loaded._secret || null;
        // Remove internal secret from config
        const { _secret: _, ...safeConfig } = loaded;
        _config = Object.freeze(safeConfig);
    }
    return _config;
}

/**
 * Get the session secret (for internal use only)
 * @returns {string|null} Session secret or null if not available
 * @throws {Error} If secret is required but missing
 */
function getSessionSecret() {
    const config = getSessionConfig();
    if (!config.hasSecret) {
        throw new Error('Session secret is not configured');
    }
    return _secret;
}

/**
 * Get cookie configuration for express-session
 * @returns {Object} Cookie configuration
 */
function getSessionCookieConfig() {
    const config = getSessionConfig();
    return Object.freeze({
        name: config.name,
        maxAge: config.maxAge,
        httpOnly: config.httpOnly,
        secure: config.secure,
        sameSite: config.sameSite,
    });
}

/**
 * Get session security configuration
 * @returns {Object} Session security configuration
 */
function getSessionSecurityConfig() {
    const config = getSessionConfig();
    return Object.freeze({
        httpOnly: config.httpOnly,
        secure: config.secure,
        sameSite: config.sameSite,
        hasSecret: config.hasSecret,
        isSecure: config.isSecure,
    });
}

/**
 * Get complete express-session compatible configuration
 * @param {Object} options - Additional options
 * @param {Object} options.store - Session store instance
 * @returns {Object} Express-session configuration
 */
function getExpressSessionConfig(options = {}) {
    const { store = null } = options;
    const config = getSessionConfig();
    const secret = _secret;
    
    if (!secret) {
        throw new Error('Cannot create session configuration: secret is missing');
    }
    
    const sessionConfig = {
        secret,
        name: config.name,
        cookie: {
            httpOnly: config.httpOnly,
            secure: config.secure,
            sameSite: config.sameSite,
            maxAge: config.maxAge,
        },
        resave: config.resave,
        saveUninitialized: config.saveUninitialized,
        rolling: config.rolling,
    };
    
    if (store) {
        sessionConfig.store = store;
    }
    
    return Object.freeze(sessionConfig);
}

/**
 * Check if session configuration is production-ready
 * @returns {boolean} True if production-ready
 */
function isProductionSession() {
    const config = getSessionConfig();
    return config.isProduction && config.hasSecret && config.secure && config.httpOnly;
}

/**
 * Check if secure cookie is enabled
 * @returns {boolean} True if secure cookies are enabled
 */
function isSecureCookieEnabled() {
    const config = getSessionConfig();
    return config.secure;
}

/**
 * Validate the session configuration
 * @returns {Object} Validation result
 */
function validateSessionConfig() {
    try {
        const config = getSessionConfig();
        const errors = [];
        const warnings = [];
        
        // Validate critical settings
        if (!config.hasSecret) {
            errors.push('Session secret is not configured');
        }
        
        if (config.isProduction && !config.secure) {
            warnings.push('Session cookies are not secure in production');
        }
        
        if (!config.httpOnly) {
            warnings.push('Session cookies are not HTTP-only - security risk');
        }
        
        if (config.sameSite === 'none' && !config.secure) {
            errors.push('SameSite=none requires Secure cookies');
        }
        
        if (config.maxAge < 3600000) {
            warnings.push('Session max age is less than 1 hour - may cause frequent logouts');
        }
        
        if (config.maxAge > 30 * 24 * 60 * 60 * 1000) {
            warnings.push('Session max age exceeds 30 days - consider shorter sessions');
        }
        
        // Check secret strength
        if (config.hasSecret && config.secretLength < MIN_SECRET_LENGTH) {
            warnings.push(`Secret length (${config.secretLength}) is below recommended minimum of ${MIN_SECRET_LENGTH}`);
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            config: {
                name: config.name,
                maxAge: config.maxAge,
                secure: config.secure,
                httpOnly: config.httpOnly,
                sameSite: config.sameSite,
                hasSecret: config.hasSecret,
                isProduction: config.isProduction,
            },
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
    getSessionConfig,
    getSessionSecret,
    getSessionCookieConfig,
    getSessionSecurityConfig,
    getExpressSessionConfig,
    isProductionSession,
    isSecureCookieEnabled,
    validateSessionConfig,
    loadSessionConfig,
    VALID_SAME_SITE_VALUES,
    MIN_SECRET_LENGTH,
    DEFAULT_SESSION_NAME,
    DEFAULT_SESSION_MAX_AGE,
};

export default {
    getSessionConfig,
    getSessionSecret,
    getSessionCookieConfig,
    getSessionSecurityConfig,
    getExpressSessionConfig,
    isProductionSession,
    isSecureCookieEnabled,
    validateSessionConfig,
    loadSessionConfig,
    VALID_SAME_SITE_VALUES,
    MIN_SECRET_LENGTH,
    DEFAULT_SESSION_NAME,
    DEFAULT_SESSION_MAX_AGE,
};