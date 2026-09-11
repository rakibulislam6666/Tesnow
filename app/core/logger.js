/**
 * app/core/logger.js
 * Centralized structured logging utility for Tesnow using Pino
 * Provides secure, production-ready logging with secret redaction
 * 
 * @module logger
 */

import pino from 'pino';
import { randomUUID } from 'node:crypto';

// ----------------------------------------------------------------------------
// 1. CONSTANTS & CONFIGURATION
// ----------------------------------------------------------------------------

const VALID_LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
const DEFAULT_LOG_LEVEL = 'info';
const MAX_DEPTH = 5;
const MAX_STRING_LENGTH = 10000;
const MAX_ARRAY_LENGTH = 100;

/**
 * Get the effective log level from environment
 * @returns {string} Validated log level
 */
function getLogLevel() {
    const envLevel = process.env.LOG_LEVEL || DEFAULT_LOG_LEVEL;
    const normalizedLevel = envLevel.toLowerCase();
    
    if (VALID_LOG_LEVELS.includes(normalizedLevel)) {
        return normalizedLevel;
    }
    
    return DEFAULT_LOG_LEVEL;
}

/**
 * Determine if pretty logging is requested and available
 * @returns {boolean} True if pretty logging should be used
 */
function shouldUsePretty() {
    const pretty = process.env.LOG_PRETTY || 'false';
    return pretty === 'true' || pretty === '1';
}

// ----------------------------------------------------------------------------
// 2. REDACTION CONFIGURATION
// ----------------------------------------------------------------------------

/**
 * Sensitive field paths to redact from logs
 * Covers common sensitive fields and nested paths
 */
const REDACT_PATHS = [
    // Password fields
    'password',
    'passwordHash',
    'password_hash',
    'currentPassword',
    'newPassword',
    'confirmPassword',
    'oldPassword',
    
    // Token fields
    'token',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'sessionToken',
    'session_token',
    'csrfToken',
    'csrf_token',
    'jwt',
    'jwtToken',
    'bearer',
    
    // Secret fields
    'secret',
    'clientSecret',
    'client_secret',
    'apiKey',
    'api_key',
    'apiSecret',
    'api_secret',
    'webhookSecret',
    'webhook_secret',
    'twoFactorSecret',
    'two_factor_secret',
    'encryptionKey',
    'encryption_key',
    'privateKey',
    'private_key',
    'publicKey',
    'authKey',
    'auth_key',
    
    // Authorization headers
    'authorization',
    'headers.authorization',
    'headers.Authorization',
    'req.headers.authorization',
    'req.headers.Authorization',
    'request.headers.authorization',
    'request.headers.Authorization',
    
    // Cookie headers
    'cookie',
    'headers.cookie',
    'req.headers.cookie',
    'request.headers.cookie',
    'set-cookie',
    'headers.set-cookie',
    'req.headers.set-cookie',
    'request.headers.set-cookie',
    
    // Session fields
    'sessionId',
    'session_id',
    'sessionSecret',
    'session_secret',
    
    // Database credentials
    'dbPassword',
    'db_password',
    'DB_PASSWORD',
    'databasePassword',
    'database_password',
    'DATABASE_PASSWORD',
    
    // Service credentials
    'SMTP_PASSWORD',
    'smtpPassword',
    'smtp_password',
    'redisPassword',
    'redis_password',
    
    // OAuth
    'oauthSecret',
    'oauth_secret',
    'clientSecret',
    'client_secret',
    
    // Payment
    'creditCard',
    'credit_card',
    'cardNumber',
    'card_number',
    'cvv',
    'cvc',
    'ccv',
    'paymentToken',
    'payment_token',
    
    // Personal data (minimal, focused on authentication)
    'ssn',
    'socialSecurity',
    'social_security',
];

// ----------------------------------------------------------------------------
// 3. SAFE SERIALIZATION HELPERS
// ----------------------------------------------------------------------------

/**
 * Safely truncate a string to prevent log flooding
 * @param {string} str - String to truncate
 * @returns {string} Truncated string
 */
function safeTruncate(str) {
    if (typeof str !== 'string') return str;
    if (str.length <= MAX_STRING_LENGTH) return str;
    return str.substring(0, MAX_STRING_LENGTH) + '... [truncated]';
}

/**
 * Safely limit array size in logs
 * @param {Array} arr - Array to limit
 * @returns {Array} Limited array
 */
function safeLimitArray(arr) {
    if (!Array.isArray(arr)) return arr;
    if (arr.length <= MAX_ARRAY_LENGTH) return arr;
    return arr.slice(0, MAX_ARRAY_LENGTH);
}

/**
 * Sanitize log metadata recursively
 * @param {*} data - Data to sanitize
 * @param {number} depth - Current recursion depth
 * @returns {*} Sanitized data
 */
function sanitizeLogMeta(data, depth = 0) {
    if (data === null || data === undefined) {
        return data;
    }
    
    if (depth > MAX_DEPTH) {
        return '[Max depth reached]';
    }
    
    // Handle primitive values
    if (typeof data !== 'object') {
        return typeof data === 'string' ? safeTruncate(data) : data;
    }
    
    // Handle arrays
    if (Array.isArray(data)) {
        const limited = safeLimitArray(data);
        return limited.map(item => sanitizeLogMeta(item, depth + 1));
    }
    
    // Skip sensitive objects
    if (data instanceof Error) {
        return {
            name: data.name,
            message: data.message,
            code: data.code,
            stack: data.stack,
        };
    }
    
    if (data instanceof Date) {
        return data.toISOString();
    }
    
    if (typeof data === 'bigint') {
        return data.toString();
    }
    
    // Handle regular objects
    const sanitized = {};
    const keys = Object.keys(data);
    
    for (const key of keys) {
        // Skip sensitive keys
        if (REDACT_PATHS.some(pattern => key.toLowerCase().includes(pattern.toLowerCase()))) {
            sanitized[key] = '[REDACTED]';
            continue;
        }
        
        const value = data[key];
        
        // Skip huge objects
        if (value && typeof value === 'object') {
            sanitized[key] = sanitizeLogMeta(value, depth + 1);
        } else if (typeof value === 'string') {
            sanitized[key] = safeTruncate(value);
        } else if (typeof value === 'bigint') {
            sanitized[key] = value.toString();
        } else {
            sanitized[key] = value;
        }
    }
    
    return sanitized;
}

// ----------------------------------------------------------------------------
// 4. ERROR NORMALIZATION
// ----------------------------------------------------------------------------

/**
 * Normalize an error for logging
 * @param {*} error - Error to normalize
 * @returns {Object} Normalized error object
 */
function normalizeLogError(error) {
    // Handle null/undefined
    if (error === null || error === undefined) {
        return {
            name: 'UnknownError',
            message: 'Unknown error (null or undefined)',
        };
    }
    
    // Handle non-Error objects
    if (!(error instanceof Error)) {
        // Check if it's an error-like object
        if (typeof error === 'object' && error !== null) {
            const safeError = {
                name: error.name || 'UnknownError',
                message: error.message || String(error),
            };
            
            // Preserve useful error properties
            if (error.code) safeError.code = error.code;
            if (error.statusCode) safeError.statusCode = error.statusCode;
            if (error.errno) safeError.errno = error.errno;
            if (error.sqlState) safeError.sqlState = error.sqlState;
            if (error.sqlMessage) safeError.sqlMessage = safeTruncate(error.sqlMessage);
            
            // Preserve stack if available
            if (error.stack) safeError.stack = error.stack;
            
            return safeError;
        }
        
        return {
            name: 'UnknownError',
            message: String(error),
        };
    }
    
    // Handle Error instances
    const normalized = {
        name: error.name,
        message: error.message,
        stack: error.stack,
    };
    
    // Preserve useful error properties
    if (error.code) normalized.code = error.code;
    if (error.statusCode) normalized.statusCode = error.statusCode;
    if (error.errno) normalized.errno = error.errno;
    if (error.sqlState) normalized.sqlState = error.sqlState;
    if (error.sqlMessage) normalized.sqlMessage = safeTruncate(error.sqlMessage);
    if (error.cause) normalized.cause = normalizeLogError(error.cause);
    
    // Preserve custom error properties
    for (const key of Object.keys(error)) {
        if (!['name', 'message', 'stack', 'code', 'statusCode', 'errno', 'sqlState', 'sqlMessage', 'cause'].includes(key)) {
            try {
                normalized[key] = error[key];
            } catch {
                // Ignore properties that can't be accessed
            }
        }
    }
    
    return normalized;
}

// ----------------------------------------------------------------------------
// 5. REQUEST CONTEXT INTEGRATION
// ----------------------------------------------------------------------------

let requestContextModule = null;

/**
 * Safely load request context module
 * Avoids circular dependencies by lazy loading
 */
function getRequestContext() {
    if (requestContextModule === null) {
        try {
            // Dynamic import to avoid circular dependency at module load time
            requestContextModule = import('./request-context.js')
                .then(module => module)
                .catch(() => null);
        } catch {
            requestContextModule = null;
        }
    }
    
    return requestContextModule;
}

/**
 * Get request context bindings if available
 * @returns {Object} Context bindings or empty object
 */
function getContextBindings() {
    try {
        const ctxModule = getRequestContext();
        if (!ctxModule) return {};
        
        // Check if module is a Promise (still loading)
        if (ctxModule instanceof Promise) {
            return {}; // Return empty for now, will be resolved later
        }
        
        const context = ctxModule.getRequestContext?.();
        if (!context) return {};
        
        const bindings = {};
        
        if (context.requestId) bindings.requestId = context.requestId;
        if (context.correlationId) bindings.correlationId = context.correlationId;
        if (context.userId) bindings.userId = context.userId;
        if (context.adminId) bindings.adminId = context.adminId;
        if (context.method) bindings.method = context.method;
        if (context.path) bindings.path = context.path;
        
        return bindings;
    } catch {
        return {};
    }
}

// ----------------------------------------------------------------------------
// 6. PINO LOGGER CREATION
// ----------------------------------------------------------------------------

/**
 * Create a Pino logger instance
 * @param {Object} options - Logger options
 * @param {string} options.level - Log level
 * @param {Object} options.bindings - Initial bindings
 * @param {boolean} options.pretty - Enable pretty printing (if available)
 * @param {boolean} options.redact - Enable redaction
 * @param {Object} options.base - Base bindings
 * @param {string} options.name - Logger name
 * @returns {Object} Pino logger instance
 */
function createLogger(options = {}) {
    const {
        level = getLogLevel(),
        bindings = {},
        pretty = shouldUsePretty(),
        redact = true,
        base = {
            environment: process.env.NODE_ENV || 'development',
            service: 'tesnow',
        },
        name = null,
    } = options;
    
    // Validate log level
    const safeLevel = VALID_LOG_LEVELS.includes(level) ? level : DEFAULT_LOG_LEVEL;
    
    // Build base bindings
    const baseBindings = {
        ...base,
        ...(name ? { module: name } : {}),
    };
    
    // Configure Pino options
    const pinoOptions = {
        level: safeLevel,
        base: baseBindings,
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: {
            level: (label) => {
                return { level: label };
            },
            bindings: (bindings) => {
                // Remove pid and hostname in production for cleaner logs
                const { pid, hostname, ...rest } = bindings;
                return rest;
            },
        },
        // Custom serializers
        serializers: {
            err: (err) => normalizeLogError(err),
            error: (err) => normalizeLogError(err),
            meta: (meta) => sanitizeLogMeta(meta),
        },
        // Redaction configuration
        redact: redact ? {
            paths: REDACT_PATHS,
            censor: '[REDACTED]',
            remove: false,
        } : undefined,
        // Hooks
        hooks: {
            logMethod(inputArgs, method) {
                // Add request context bindings if available
                const args = [...inputArgs];
                const contextBindings = getContextBindings();
                
                if (args.length === 1 && typeof args[0] === 'string') {
                    // No metadata, just message
                    if (Object.keys(contextBindings).length > 0) {
                        const message = args[0];
                        args[0] = { ...contextBindings, message };
                    }
                } else if (args.length >= 1 && typeof args[0] === 'object' && args[0] !== null) {
                    // Has metadata, merge context
                    const meta = args[0];
                    const hasMessage = typeof args[1] === 'string';
                    
                    const mergedMeta = {
                        ...contextBindings,
                        ...meta,
                    };
                    
                    // Remove message from meta if present
                    if (mergedMeta.message && typeof mergedMeta.message === 'string') {
                        // Keep message as separate argument if it exists in meta
                        if (hasMessage) {
                            // If message already provided as second arg, remove from meta
                            delete mergedMeta.message;
                        }
                    }
                    
                    args[0] = mergedMeta;
                }
                
                // Apply method
                return method.apply(this, args);
            },
        },
    };
    
    // Create the logger
    const logger = pino(pinoOptions);
    
    // Add bindings if provided
    if (Object.keys(bindings).length > 0) {
        return logger.child(bindings);
    }
    
    return logger;
}

// ----------------------------------------------------------------------------
// 7. SINGLETON LOGGER
// ----------------------------------------------------------------------------

let defaultLogger = null;

/**
 * Get the default logger instance (lazy singleton)
 * @returns {Object} Pino logger instance
 */
function getLogger() {
    if (!defaultLogger) {
        defaultLogger = createLogger();
    }
    return defaultLogger;
}

/**
 * Create a child logger with additional bindings
 * @param {Object} bindings - Additional bindings
 * @param {Object} options - Child logger options
 * @returns {Object} Child Pino logger instance
 */
function createChildLogger(bindings = {}, options = {}) {
    const parent = options.parent || getLogger();
    
    // Sanitize bindings
    const safeBindings = {};
    for (const [key, value] of Object.entries(bindings)) {
        // Skip sensitive keys
        if (REDACT_PATHS.some(pattern => key.toLowerCase().includes(pattern.toLowerCase()))) {
            safeBindings[key] = '[REDACTED]';
            continue;
        }
        
        // Sanitize value
        if (typeof value === 'string') {
            safeBindings[key] = safeTruncate(value);
        } else if (value && typeof value === 'object') {
            safeBindings[key] = sanitizeLogMeta(value);
        } else {
            safeBindings[key] = value;
        }
    }
    
    return parent.child(safeBindings);
}

// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// 8. EXPORTS
// ----------------------------------------------------------------------------

export {
    createLogger,
    getLogger,
    createChildLogger,
    normalizeLogError,
    sanitizeLogMeta,
    REDACT_PATHS,
    VALID_LOG_LEVELS,
    DEFAULT_LOG_LEVEL,
};

// Default export is the actual Pino logger instance.
const logger = getLogger();

export default logger;
