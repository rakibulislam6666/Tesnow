/**
 * app/config/queue.config.js
 * Centralized job-queue configuration for Tesnow
 * Provides secure, validated configuration for BullMQ/Redis and in-memory queues
 * 
 * @module config/queue.config
 */

// ----------------------------------------------------------------------------
// 1. CONSTANTS & DEFAULTS
// ----------------------------------------------------------------------------

const DEFAULT_QUEUE_ENABLED = true;
const DEFAULT_QUEUE_DRIVER = 'memory';
const DEFAULT_QUEUE_PREFIX = 'tesnow';
const DEFAULT_QUEUE_DEFAULT_ATTEMPTS = 3;
const DEFAULT_QUEUE_MAX_ATTEMPTS = 10;
const DEFAULT_QUEUE_DEFAULT_BACKOFF_MS = 1000;
const DEFAULT_QUEUE_MAX_BACKOFF_MS = 300000; // 5 minutes
const DEFAULT_QUEUE_CONCURRENCY = 5;
const DEFAULT_QUEUE_MAX_CONCURRENCY = 20;
const DEFAULT_QUEUE_JOB_TIMEOUT_MS = 300000; // 5 minutes
const DEFAULT_QUEUE_MAX_JOB_TIMEOUT_MS = 3600000; // 1 hour
const DEFAULT_QUEUE_REMOVE_ON_COMPLETE = true;
const DEFAULT_QUEUE_REMOVE_ON_FAIL = false;
const DEFAULT_QUEUE_MAX_QUEUE_LENGTH = 10000;
const DEFAULT_QUEUE_MAX_PAYLOAD_SIZE = 1048576; // 1 MB
const DEFAULT_QUEUE_RETRY_ENABLED = true;
const DEFAULT_QUEUE_REDIS_PORT = 6379;
const DEFAULT_QUEUE_REDIS_DATABASE = 0;
const DEFAULT_QUEUE_REDIS_TLS = false;
const DEFAULT_QUEUE_REDIS_CONNECT_TIMEOUT = 5000;

const VALID_DRIVERS = ['memory', 'redis', 'none'];
const MIN_PREFIX_LENGTH = 1;
const MAX_PREFIX_LENGTH = 100;
const MIN_ATTEMPTS = 1;
const MAX_ATTEMPTS = 100;
const MIN_BACKOFF_MS = 100;
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000; // 1 day
const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 100;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MIN_QUEUE_LENGTH = 1;
const MAX_QUEUE_LENGTH = 1000000;
const MIN_PAYLOAD_SIZE = 1024;
const MAX_PAYLOAD_SIZE = 10 * 1024 * 1024; // 10 MB
const MIN_REDIS_PORT = 1;
const MAX_REDIS_PORT = 65535;
const MIN_REDIS_DATABASE = 0;
const MAX_REDIS_DATABASE = 15;
const MIN_REDIS_CONNECT_TIMEOUT = 1000;
const MAX_REDIS_CONNECT_TIMEOUT = 30000;

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
 * Validate queue driver
 * @param {string} driver - Queue driver
 * @param {boolean} enabled - Whether queues are enabled
 * @returns {string} Validated driver
 */
function validateDriver(driver, enabled) {
    if (!driver || typeof driver !== 'string') {
        return enabled ? DEFAULT_QUEUE_DRIVER : 'none';
    }
    
    const normalized = driver.trim().toLowerCase();
    
    if (!VALID_DRIVERS.includes(normalized)) {
        throw new Error(`QUEUE_DRIVER must be one of: ${VALID_DRIVERS.join(', ')}`);
    }
    
    // If queues are disabled, force driver to 'none'
    if (!enabled) {
        return 'none';
    }
    
    return normalized;
}

/**
 * Validate queue prefix
 * @param {string} prefix - Queue prefix
 * @returns {string} Validated prefix
 */
function validatePrefix(prefix) {
    if (!prefix || typeof prefix !== 'string') {
        return DEFAULT_QUEUE_PREFIX;
    }
    
    const trimmed = prefix.trim();
    
    if (trimmed.length === 0) {
        return DEFAULT_QUEUE_PREFIX;
    }
    
    if (trimmed.length > MAX_PREFIX_LENGTH) {
        throw new Error(`QUEUE_PREFIX exceeds maximum length of ${MAX_PREFIX_LENGTH}`);
    }
    
    // Check for null bytes
    if (trimmed.includes('\x00')) {
        throw new Error('QUEUE_PREFIX contains null bytes');
    }
    
    // Check for control characters
    if (/[\x01-\x1F\x7F]/.test(trimmed)) {
        throw new Error('QUEUE_PREFIX contains invalid control characters');
    }
    
    // Check for CR/LF
    if (trimmed.includes('\n') || trimmed.includes('\r')) {
        throw new Error('QUEUE_PREFIX contains invalid newline characters');
    }
    
    // Only allow safe characters for Redis keys
    if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
        throw new Error('QUEUE_PREFIX contains invalid characters');
    }
    
    return trimmed;
}

/**
 * Validate Redis URL
 * @param {string} url - Redis connection URL
 * @param {string} driver - Queue driver
 * @param {boolean} enabled - Whether queues are enabled
 * @returns {Object|null} Parsed URL info or null
 */
function validateRedisUrl(url, driver, enabled) {
    if (driver !== 'redis' || !enabled) {
        return null;
    }
    
    if (!url || typeof url !== 'string') {
        return null;
    }
    
    const trimmed = url.trim();
    
    if (trimmed.length === 0) {
        return null;
    }
    
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
            throw new Error('Redis URL must use redis:// or rediss:// protocol');
        }
        
        // Extract components
        const host = parsed.hostname || '';
        const port = parsed.port ? parseInt(parsed.port, 10) : null;
        const username = parsed.username || '';
        const password = parsed.password || '';
        const database = parsed.pathname ? parseInt(parsed.pathname.replace('/', ''), 10) : 0;
        
        // Validate extracted values
        if (host && !/^[a-zA-Z0-9.-]+$/.test(host)) {
            throw new Error('Invalid host in Redis URL');
        }
        
        if (port !== null && (port < MIN_REDIS_PORT || port > MAX_REDIS_PORT)) {
            throw new Error('Invalid port in Redis URL');
        }
        
        if (database < MIN_REDIS_DATABASE || database > MAX_REDIS_DATABASE) {
            throw new Error('Invalid database in Redis URL');
        }
        
        return {
            host,
            port: port || DEFAULT_QUEUE_REDIS_PORT,
            username,
            hasPassword: password.length > 0,
            password: password || null,
            database: database || DEFAULT_QUEUE_REDIS_DATABASE,
            isTls: parsed.protocol === 'rediss:',
        };
    } catch (error) {
        throw new Error(`Invalid QUEUE_REDIS_URL: ${error.message}`);
    }
}

/**
 * Validate Redis host
 * @param {string} host - Redis host
 * @param {string} driver - Queue driver
 * @param {boolean} enabled - Whether queues are enabled
 * @returns {string} Validated host
 */
function validateRedisHost(host, driver, enabled) {
    if (driver !== 'redis' || !enabled) {
        return '';
    }
    
    if (!host || typeof host !== 'string') {
        throw new Error('QUEUE_REDIS_HOST is required when QUEUE_DRIVER=redis');
    }
    
    const trimmed = host.trim();
    
    if (trimmed.length === 0) {
        throw new Error('QUEUE_REDIS_HOST cannot be empty when QUEUE_DRIVER=redis');
    }
    
    // Check for control characters
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
        throw new Error('QUEUE_REDIS_HOST contains invalid control characters');
    }
    
    // Check for CR/LF
    if (trimmed.includes('\n') || trimmed.includes('\r')) {
        throw new Error('QUEUE_REDIS_HOST contains invalid newline characters');
    }
    
    return trimmed;
}

/**
 * Validate Redis port
 * @param {string|number} port - Redis port
 * @param {string} driver - Queue driver
 * @param {boolean} enabled - Whether queues are enabled
 * @returns {number} Validated port
 */
function validateRedisPort(port, driver, enabled) {
    if (driver !== 'redis' || !enabled) {
        return DEFAULT_QUEUE_REDIS_PORT;
    }
    
    if (port === null || port === undefined || port === '') {
        return DEFAULT_QUEUE_REDIS_PORT;
    }
    
    return parsePositiveInteger(port, DEFAULT_QUEUE_REDIS_PORT, MIN_REDIS_PORT, MAX_REDIS_PORT);
}

/**
 * Validate Redis database
 * @param {string|number} database - Redis database number
 * @param {string} driver - Queue driver
 * @param {boolean} enabled - Whether queues are enabled
 * @returns {number} Validated database
 */
function validateRedisDatabase(database, driver, enabled) {
    if (driver !== 'redis' || !enabled) {
        return DEFAULT_QUEUE_REDIS_DATABASE;
    }
    
    if (database === null || database === undefined || database === '') {
        return DEFAULT_QUEUE_REDIS_DATABASE;
    }
    
    return parsePositiveInteger(database, DEFAULT_QUEUE_REDIS_DATABASE, MIN_REDIS_DATABASE, MAX_REDIS_DATABASE);
}

/**
 * Validate Redis connect timeout
 * @param {string|number} timeout - Connect timeout in milliseconds
 * @param {string} driver - Queue driver
 * @param {boolean} enabled - Whether queues are enabled
 * @returns {number} Validated timeout
 */
function validateRedisConnectTimeout(timeout, driver, enabled) {
    if (driver !== 'redis' || !enabled) {
        return DEFAULT_QUEUE_REDIS_CONNECT_TIMEOUT;
    }
    
    if (timeout === null || timeout === undefined || timeout === '') {
        return DEFAULT_QUEUE_REDIS_CONNECT_TIMEOUT;
    }
    
    return parsePositiveInteger(timeout, DEFAULT_QUEUE_REDIS_CONNECT_TIMEOUT, MIN_REDIS_CONNECT_TIMEOUT, MAX_REDIS_CONNECT_TIMEOUT);
}

/**
 * Validate Redis username
 * @param {string} username - Redis username
 * @param {string} driver - Queue driver
 * @param {boolean} enabled - Whether queues are enabled
 * @returns {string} Validated username
 */
function validateRedisUsername(username, driver, enabled) {
    if (driver !== 'redis' || !enabled) {
        return '';
    }
    
    if (!username || typeof username !== 'string') {
        return '';
    }
    
    const trimmed = username.trim();
    
    if (trimmed.length === 0) {
        return '';
    }
    
    // Check for control characters
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
        throw new Error('QUEUE_REDIS_USERNAME contains invalid control characters');
    }
    
    // Check for CR/LF
    if (trimmed.includes('\n') || trimmed.includes('\r')) {
        throw new Error('QUEUE_REDIS_USERNAME contains invalid newline characters');
    }
    
    return trimmed;
}

/**
 * Validate Redis password
 * @param {string} password - Redis password
 * @param {string} driver - Queue driver
 * @param {boolean} enabled - Whether queues are enabled
 * @returns {Object} Validation result with password info
 */
function validateRedisPassword(password, driver, enabled) {
    if (driver !== 'redis' || !enabled) {
        return {
            valid: true,
            hasPassword: false,
            password: null,
        };
    }
    
    if (!password || typeof password !== 'string') {
        return {
            valid: true,
            hasPassword: false,
            password: null,
        };
    }
    
    const trimmed = password.trim();
    
    if (trimmed.length === 0) {
        return {
            valid: true,
            hasPassword: false,
            password: null,
        };
    }
    
    // Check for control characters
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
        throw new Error('QUEUE_REDIS_PASSWORD contains invalid control characters');
    }
    
    // Check for CR/LF
    if (trimmed.includes('\n') || trimmed.includes('\r')) {
        throw new Error('QUEUE_REDIS_PASSWORD contains invalid newline characters');
    }
    
    return {
        valid: true,
        hasPassword: true,
        password: trimmed,
    };
}

// ----------------------------------------------------------------------------
// 3. CONFIGURATION LOADER
// ----------------------------------------------------------------------------

/**
 * Load queue configuration from environment variables
 * @param {string} nodeEnv - Current Node environment
 * @returns {Object} Immutable queue configuration
 */
function loadQueueConfig(nodeEnv = 'development') {
    const isProduction = nodeEnv === 'production';
    
    // Parse enabled flag
    const enabled = parseBoolean(process.env.QUEUE_ENABLED, DEFAULT_QUEUE_ENABLED);
    
    // Parse driver
    const driver = validateDriver(process.env.QUEUE_DRIVER, enabled);
    
    // Parse prefix
    const prefix = validatePrefix(process.env.QUEUE_PREFIX);
    
    // Parse attempts
    let defaultAttempts, maxAttempts;
    if (enabled && driver !== 'none') {
        defaultAttempts = parsePositiveInteger(
            process.env.QUEUE_DEFAULT_ATTEMPTS,
            DEFAULT_QUEUE_DEFAULT_ATTEMPTS,
            MIN_ATTEMPTS,
            MAX_ATTEMPTS
        );
        
        maxAttempts = parsePositiveInteger(
            process.env.QUEUE_MAX_ATTEMPTS,
            DEFAULT_QUEUE_MAX_ATTEMPTS,
            MIN_ATTEMPTS,
            MAX_ATTEMPTS
        );
        
        if (defaultAttempts > maxAttempts) {
            throw new Error('QUEUE_DEFAULT_ATTEMPTS must not exceed QUEUE_MAX_ATTEMPTS');
        }
    } else {
        defaultAttempts = DEFAULT_QUEUE_DEFAULT_ATTEMPTS;
        maxAttempts = DEFAULT_QUEUE_MAX_ATTEMPTS;
    }
    
    // Parse backoff
    let defaultBackoffMs, maxBackoffMs;
    if (enabled && driver !== 'none') {
        defaultBackoffMs = parsePositiveInteger(
            process.env.QUEUE_DEFAULT_BACKOFF_MS,
            DEFAULT_QUEUE_DEFAULT_BACKOFF_MS,
            MIN_BACKOFF_MS,
            MAX_BACKOFF_MS
        );
        
        maxBackoffMs = parsePositiveInteger(
            process.env.QUEUE_MAX_BACKOFF_MS,
            DEFAULT_QUEUE_MAX_BACKOFF_MS,
            MIN_BACKOFF_MS,
            MAX_BACKOFF_MS
        );
        
        if (defaultBackoffMs > maxBackoffMs) {
            throw new Error('QUEUE_DEFAULT_BACKOFF_MS must not exceed QUEUE_MAX_BACKOFF_MS');
        }
    } else {
        defaultBackoffMs = DEFAULT_QUEUE_DEFAULT_BACKOFF_MS;
        maxBackoffMs = DEFAULT_QUEUE_MAX_BACKOFF_MS;
    }
    
    // Parse concurrency
    let defaultConcurrency, maxConcurrency;
    if (enabled && driver !== 'none') {
        defaultConcurrency = parsePositiveInteger(
            process.env.QUEUE_CONCURRENCY,
            DEFAULT_QUEUE_CONCURRENCY,
            MIN_CONCURRENCY,
            MAX_CONCURRENCY
        );
        
        maxConcurrency = parsePositiveInteger(
            process.env.QUEUE_MAX_CONCURRENCY,
            DEFAULT_QUEUE_MAX_CONCURRENCY,
            MIN_CONCURRENCY,
            MAX_CONCURRENCY
        );
        
        if (defaultConcurrency > maxConcurrency) {
            throw new Error('QUEUE_CONCURRENCY must not exceed QUEUE_MAX_CONCURRENCY');
        }
    } else {
        defaultConcurrency = DEFAULT_QUEUE_CONCURRENCY;
        maxConcurrency = DEFAULT_QUEUE_MAX_CONCURRENCY;
    }
    
    // Parse job timeout
    let defaultJobTimeoutMs, maxJobTimeoutMs;
    if (enabled && driver !== 'none') {
        defaultJobTimeoutMs = parsePositiveInteger(
            process.env.QUEUE_JOB_TIMEOUT_MS,
            DEFAULT_QUEUE_JOB_TIMEOUT_MS,
            MIN_TIMEOUT_MS,
            MAX_TIMEOUT_MS
        );
        
        maxJobTimeoutMs = parsePositiveInteger(
            process.env.QUEUE_MAX_JOB_TIMEOUT_MS,
            DEFAULT_QUEUE_MAX_JOB_TIMEOUT_MS,
            MIN_TIMEOUT_MS,
            MAX_TIMEOUT_MS
        );
        
        if (defaultJobTimeoutMs > maxJobTimeoutMs) {
            throw new Error('QUEUE_JOB_TIMEOUT_MS must not exceed QUEUE_MAX_JOB_TIMEOUT_MS');
        }
    } else {
        defaultJobTimeoutMs = DEFAULT_QUEUE_JOB_TIMEOUT_MS;
        maxJobTimeoutMs = DEFAULT_QUEUE_MAX_JOB_TIMEOUT_MS;
    }
    
    // Parse retention flags
    const removeOnComplete = parseBoolean(process.env.QUEUE_REMOVE_ON_COMPLETE, DEFAULT_QUEUE_REMOVE_ON_COMPLETE);
    const removeOnFail = parseBoolean(process.env.QUEUE_REMOVE_ON_FAIL, DEFAULT_QUEUE_REMOVE_ON_FAIL);
    
    // Parse queue length and payload size
    let maxQueueLength, maxPayloadSize;
    if (enabled && driver !== 'none') {
        maxQueueLength = parsePositiveInteger(
            process.env.QUEUE_MAX_QUEUE_LENGTH,
            DEFAULT_QUEUE_MAX_QUEUE_LENGTH,
            MIN_QUEUE_LENGTH,
            MAX_QUEUE_LENGTH
        );
        
        maxPayloadSize = parsePositiveInteger(
            process.env.QUEUE_MAX_PAYLOAD_SIZE,
            DEFAULT_QUEUE_MAX_PAYLOAD_SIZE,
            MIN_PAYLOAD_SIZE,
            MAX_PAYLOAD_SIZE
        );
    } else {
        maxQueueLength = DEFAULT_QUEUE_MAX_QUEUE_LENGTH;
        maxPayloadSize = DEFAULT_QUEUE_MAX_PAYLOAD_SIZE;
    }
    
    // Parse retry enabled
    const retryEnabled = parseBoolean(process.env.QUEUE_RETRY_ENABLED, DEFAULT_QUEUE_RETRY_ENABLED);
    
    // Parse Redis configuration
    const redisUrlResult = validateRedisUrl(process.env.QUEUE_REDIS_URL, driver, enabled);
    const redisHost = validateRedisHost(process.env.QUEUE_REDIS_HOST, driver, enabled);
    const redisPort = validateRedisPort(process.env.QUEUE_REDIS_PORT, driver, enabled);
    const redisUsername = validateRedisUsername(process.env.QUEUE_REDIS_USERNAME, driver, enabled);
    const redisPasswordResult = validateRedisPassword(process.env.QUEUE_REDIS_PASSWORD, driver, enabled);
    const redisDatabase = validateRedisDatabase(process.env.QUEUE_REDIS_DATABASE, driver, enabled);
    const redisTls = parseBoolean(process.env.QUEUE_REDIS_TLS, DEFAULT_QUEUE_REDIS_TLS);
    const redisConnectTimeout = validateRedisConnectTimeout(process.env.QUEUE_REDIS_CONNECT_TIMEOUT, driver, enabled);
    
    // Build Redis config
    let redisConfig = null;
    let redisPassword = null;
    
    if (driver === 'redis' && enabled) {
        if (redisUrlResult) {
            // Use URL if provided
            redisConfig = {
                host: redisUrlResult.host,
                port: redisUrlResult.port,
                username: redisUrlResult.username || '',
                hasPassword: redisUrlResult.hasPassword,
                database: redisUrlResult.database,
                connectTimeout: redisConnectTimeout,
                tls: redisUrlResult.isTls || redisTls,
                fromUrl: true,
            };
            if (redisUrlResult.hasPassword) {
                redisPassword = redisUrlResult.password;
            }
        } else {
            // Use individual settings
            redisConfig = {
                host: redisHost,
                port: redisPort,
                username: redisUsername || '',
                hasPassword: redisPasswordResult.hasPassword,
                database: redisDatabase,
                connectTimeout: redisConnectTimeout,
                tls: redisTls,
                fromUrl: false,
            };
            if (redisPasswordResult.hasPassword) {
                redisPassword = redisPasswordResult.password;
            }
        }
    }
    
    // Build configuration
    const config = {
        enabled,
        driver,
        prefix,
        isProduction,
        attempts: {
            default: defaultAttempts,
            max: maxAttempts,
        },
        backoff: {
            defaultMs: defaultBackoffMs,
            maxMs: maxBackoffMs,
        },
        concurrency: {
            default: defaultConcurrency,
            max: maxConcurrency,
        },
        timeout: {
            defaultMs: defaultJobTimeoutMs,
            maxMs: maxJobTimeoutMs,
        },
        retention: {
            removeOnComplete,
            removeOnFail,
        },
        maxQueueLength,
        maxPayloadSize,
        retry: {
            enabled: retryEnabled,
        },
        redis: redisConfig,
        _redisPassword: redisPassword,
        _isRedisConfigured: driver === 'redis' && enabled && redisConfig !== null && redisConfig.host,
        isConfigured: enabled && driver !== 'none',
    };
    
    return Object.freeze(config);
}

// ----------------------------------------------------------------------------
// 4. SINGLETON CONFIGURATION
// ----------------------------------------------------------------------------

let _config = null;
let _redisPassword = null;

/**
 * Get the queue configuration (singleton)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Immutable queue configuration
 */
function getQueueConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    if (_config === null) {
        const loaded = loadQueueConfig(nodeEnv);
        if (loaded._redisPassword) {
            _redisPassword = loaded._redisPassword;
        }
        // Build safe config without password
        const { _redisPassword: _, ...safeConfig } = loaded;
        _config = Object.freeze(safeConfig);
    }
    return _config;
}

/**
 * Get safe queue configuration (for logging/diagnostics)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Safe queue configuration
 */
function getSafeQueueConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    const config = getQueueConfig(nodeEnv);
    
    const safe = {
        enabled: config.enabled,
        driver: config.driver,
        prefix: config.prefix,
        isProduction: config.isProduction,
        attempts: {
            default: config.attempts.default,
            max: config.attempts.max,
        },
        backoff: {
            defaultMs: config.backoff.defaultMs,
            maxMs: config.backoff.maxMs,
        },
        concurrency: {
            default: config.concurrency.default,
            max: config.concurrency.max,
        },
        timeout: {
            defaultMs: config.timeout.defaultMs,
            maxMs: config.timeout.maxMs,
        },
        retention: {
            removeOnComplete: config.retention.removeOnComplete,
            removeOnFail: config.retention.removeOnFail,
        },
        maxQueueLength: config.maxQueueLength,
        maxPayloadSize: config.maxPayloadSize,
        retry: {
            enabled: config.retry.enabled,
        },
        isConfigured: config.isConfigured,
    };
    
    // Include safe Redis metadata if applicable
    if (config.driver === 'redis' && config.redis) {
        safe.redis = {
            host: config.redis.host,
            port: config.redis.port,
            hasUsername: config.redis.username.length > 0,
            hasPassword: config.redis.hasPassword,
            database: config.redis.database,
            connectTimeout: config.redis.connectTimeout,
            tls: config.redis.tls,
            fromUrl: config.redis.fromUrl,
        };
    }
    
    return Object.freeze(safe);
}

/**
 * Get queue secret configuration (for internal use only)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Secret configuration for queue client
 */
function getQueueSecretConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    const config = getQueueConfig(nodeEnv);
    
    if (config.driver !== 'redis' || !config.redis) {
        return {
            driver: config.driver,
            hasSecrets: false,
        };
    }
    
    const secretConfig = {
        driver: config.driver,
        host: config.redis.host,
        port: config.redis.port,
        database: config.redis.database,
        username: config.redis.username || undefined,
        password: _redisPassword || undefined,
        connectTimeout: config.redis.connectTimeout,
        tls: config.redis.tls,
        hasSecrets: config.redis.hasPassword || config.redis.username.length > 0,
    };
    
    return Object.freeze(secretConfig);
}

/**
 * Validate queue configuration
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Validation result
 */
function validateQueueConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    try {
        const config = getQueueConfig(nodeEnv);
        const errors = [];
        const warnings = [];
        
        // Validate driver-specific requirements
        if (config.driver === 'redis') {
            if (!config.redis || !config.redis.host) {
                errors.push('Redis host is required when QUEUE_DRIVER=redis');
            }
            if (config.redis && !config.redis.host) {
                errors.push('QUEUE_REDIS_HOST is required when QUEUE_DRIVER=redis');
            }
            if (config.isProduction && config.redis && !config.redis.hasPassword && config.redis.username.length === 0) {
                warnings.push('Redis credentials not configured - consider securing Redis in production');
            }
        }
        
        // Warn about disabled queue in production
        if (config.isProduction && !config.enabled) {
            warnings.push('Queue is disabled in production - background jobs will not run');
        }
        
        // Warn about memory driver in production
        if (config.isProduction && config.driver === 'memory') {
            warnings.push('Memory queue driver in production - not suitable for production workloads');
        }
        
        // Check retry settings
        if (config.retry.enabled && config.attempts.max > 20) {
            warnings.push(`MAX_ATTEMPTS (${config.attempts.max}) is high - may cause excessive retries`);
        }
        
        // Check payload size
        if (config.maxPayloadSize > 5 * 1024 * 1024) {
            warnings.push(`MAX_PAYLOAD_SIZE (${config.maxPayloadSize} bytes) is large - may impact performance`);
        }
        
        // Check concurrency
        if (config.concurrency.max > 50) {
            warnings.push(`MAX_CONCURRENCY (${config.concurrency.max}) is high - may cause resource exhaustion`);
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            config: getSafeQueueConfig(nodeEnv),
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
    getQueueConfig,
    getSafeQueueConfig,
    getQueueSecretConfig,
    validateQueueConfig,
    loadQueueConfig,
    parseBoolean,
    VALID_DRIVERS,
    DEFAULT_QUEUE_ENABLED,
    DEFAULT_QUEUE_DRIVER,
};

export default {
    getQueueConfig,
    getSafeQueueConfig,
    getQueueSecretConfig,
    validateQueueConfig,
    loadQueueConfig,
    parseBoolean,
    VALID_DRIVERS,
    DEFAULT_QUEUE_ENABLED,
    DEFAULT_QUEUE_DRIVER,
};