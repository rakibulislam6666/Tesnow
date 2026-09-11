/**
 * app/config/cache.config.js
 * Centralized cache configuration for Tesnow
 * Provides secure, validated configuration for memory and Redis caching
 * 
 * @module config/cache.config
 */

// ----------------------------------------------------------------------------
// 1. CONSTANTS & DEFAULTS
// ----------------------------------------------------------------------------

const DEFAULT_CACHE_ENABLED = true;
const DEFAULT_CACHE_DRIVER = 'memory';
const DEFAULT_CACHE_DEFAULT_TTL = 300; // 5 minutes
const DEFAULT_CACHE_MAX_TTL = 86400; // 24 hours
const DEFAULT_CACHE_NAMESPACE = 'tesnow';
const DEFAULT_CACHE_KEY_MAX_LENGTH = 200;
const DEFAULT_CACHE_MAX_ENTRIES = 1000;
const DEFAULT_CACHE_REDIS_PORT = 6379;
const DEFAULT_CACHE_REDIS_DATABASE = 0;
const DEFAULT_CACHE_REDIS_TLS = false;
const DEFAULT_CACHE_REDIS_CONNECT_TIMEOUT = 5000;
const DEFAULT_CACHE_FAIL_MODE = 'soft';

const VALID_DRIVERS = ['memory', 'redis', 'none'];
const VALID_FAIL_MODES = ['soft', 'strict'];
const MIN_TTL = 1;
const MAX_TTL_LIMIT = 30 * 24 * 60 * 60; // 30 days
const MIN_REDIS_PORT = 1;
const MAX_REDIS_PORT = 65535;
const MIN_REDIS_DATABASE = 0;
const MAX_REDIS_DATABASE = 15;
const MIN_REDIS_CONNECT_TIMEOUT = 1000;
const MAX_REDIS_CONNECT_TIMEOUT = 30000;
const MIN_CACHE_KEY_LENGTH = 1;
const MIN_MAX_ENTRIES = 1;
const MAX_MAX_ENTRIES = 1000000; // 1 million

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
 * Validate cache driver
 * @param {string} driver - Cache driver name
 * @param {boolean} enabled - Whether cache is enabled
 * @returns {string} Validated driver
 */
function validateDriver(driver, enabled) {
    if (!driver || typeof driver !== 'string') {
        return enabled ? DEFAULT_CACHE_DRIVER : 'none';
    }
    
    const normalized = driver.trim().toLowerCase();
    
    if (!VALID_DRIVERS.includes(normalized)) {
        throw new Error(`CACHE_DRIVER must be one of: ${VALID_DRIVERS.join(', ')}`);
    }
    
    // If cache is disabled, force driver to 'none'
    if (!enabled) {
        return 'none';
    }
    
    return normalized;
}

/**
 * Validate TTL value
 * @param {string|number} value - TTL in seconds
 * @param {number} defaultValue - Default TTL
 * @param {number} min - Minimum TTL
 * @param {number} max - Maximum TTL
 * @param {string} name - Name for error messages
 * @returns {number} Validated TTL
 */
function validateTtl(value, defaultValue, min, max, name) {
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
        throw new Error(`${name} must be an integer`);
    }
    
    if (num < min) {
        throw new Error(`${name} (${num}) is below minimum of ${min}`);
    }
    
    if (num > max) {
        throw new Error(`${name} (${num}) exceeds maximum of ${max}`);
    }
    
    return num;
}

/**
 * Validate namespace
 * @param {string} namespace - Cache namespace
 * @returns {string} Validated namespace
 */
function validateNamespace(namespace) {
    if (!namespace || typeof namespace !== 'string') {
        return DEFAULT_CACHE_NAMESPACE;
    }
    
    const trimmed = namespace.trim();
    
    if (trimmed.length === 0) {
        return DEFAULT_CACHE_NAMESPACE;
    }
    
    // Check for null bytes
    if (trimmed.includes('\x00')) {
        throw new Error('CACHE_NAMESPACE contains null bytes');
    }
    
    // Check for control characters
    if (/[\x01-\x1F\x7F]/.test(trimmed)) {
        throw new Error('CACHE_NAMESPACE contains invalid control characters');
    }
    
    // Check for CR/LF
    if (trimmed.includes('\n') || trimmed.includes('\r')) {
        throw new Error('CACHE_NAMESPACE contains invalid newline characters');
    }
    
    // Only allow safe characters for cache keys
    if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
        throw new Error('CACHE_NAMESPACE contains invalid characters');
    }
    
    return trimmed;
}

/**
 * Validate key max length
 * @param {string|number} value - Max key length
 * @returns {number} Validated max key length
 */
function validateKeyMaxLength(value) {
    if (value === null || value === undefined || value === '') {
        return DEFAULT_CACHE_KEY_MAX_LENGTH;
    }
    
    const num = parsePositiveInteger(value, DEFAULT_CACHE_KEY_MAX_LENGTH, MIN_CACHE_KEY_LENGTH);
    
    if (num > 500) {
        throw new Error(`CACHE_KEY_MAX_LENGTH (${num}) exceeds maximum of 500`);
    }
    
    return num;
}

/**
 * Validate max entries
 * @param {string|number} value - Max entries
 * @returns {number} Validated max entries
 */
function validateMaxEntries(value) {
    if (value === null || value === undefined || value === '') {
        return DEFAULT_CACHE_MAX_ENTRIES;
    }
    
    return parsePositiveInteger(value, DEFAULT_CACHE_MAX_ENTRIES, MIN_MAX_ENTRIES, MAX_MAX_ENTRIES);
}

/**
 * Validate Redis host
 * @param {string} host - Redis host
 * @param {string} driver - Cache driver
 * @param {boolean} enabled - Whether cache is enabled
 * @returns {string} Validated host
 */
function validateRedisHost(host, driver, enabled) {
    if (driver !== 'redis' || !enabled) {
        return '';
    }
    
    if (!host || typeof host !== 'string') {
        throw new Error('CACHE_REDIS_HOST is required when CACHE_DRIVER=redis');
    }
    
    const trimmed = host.trim();
    
    if (trimmed.length === 0) {
        throw new Error('CACHE_REDIS_HOST cannot be empty when CACHE_DRIVER=redis');
    }
    
    // Check for control characters
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
        throw new Error('CACHE_REDIS_HOST contains invalid control characters');
    }
    
    // Check for CR/LF
    if (trimmed.includes('\n') || trimmed.includes('\r')) {
        throw new Error('CACHE_REDIS_HOST contains invalid newline characters');
    }
    
    return trimmed;
}

/**
 * Validate Redis port
 * @param {string|number} port - Redis port
 * @param {string} driver - Cache driver
 * @param {boolean} enabled - Whether cache is enabled
 * @returns {number} Validated port
 */
function validateRedisPort(port, driver, enabled) {
    if (driver !== 'redis' || !enabled) {
        return DEFAULT_CACHE_REDIS_PORT;
    }
    
    if (port === null || port === undefined || port === '') {
        return DEFAULT_CACHE_REDIS_PORT;
    }
    
    return parsePositiveInteger(port, DEFAULT_CACHE_REDIS_PORT, MIN_REDIS_PORT, MAX_REDIS_PORT);
}

/**
 * Validate Redis database
 * @param {string|number} database - Redis database number
 * @param {string} driver - Cache driver
 * @param {boolean} enabled - Whether cache is enabled
 * @returns {number} Validated database
 */
function validateRedisDatabase(database, driver, enabled) {
    if (driver !== 'redis' || !enabled) {
        return DEFAULT_CACHE_REDIS_DATABASE;
    }
    
    if (database === null || database === undefined || database === '') {
        return DEFAULT_CACHE_REDIS_DATABASE;
    }
    
    return parsePositiveInteger(database, DEFAULT_CACHE_REDIS_DATABASE, MIN_REDIS_DATABASE, MAX_REDIS_DATABASE);
}

/**
 * Validate Redis connect timeout
 * @param {string|number} timeout - Connect timeout in milliseconds
 * @param {string} driver - Cache driver
 * @param {boolean} enabled - Whether cache is enabled
 * @returns {number} Validated timeout
 */
function validateRedisConnectTimeout(timeout, driver, enabled) {
    if (driver !== 'redis' || !enabled) {
        return DEFAULT_CACHE_REDIS_CONNECT_TIMEOUT;
    }
    
    if (timeout === null || timeout === undefined || timeout === '') {
        return DEFAULT_CACHE_REDIS_CONNECT_TIMEOUT;
    }
    
    return parsePositiveInteger(timeout, DEFAULT_CACHE_REDIS_CONNECT_TIMEOUT, MIN_REDIS_CONNECT_TIMEOUT, MAX_REDIS_CONNECT_TIMEOUT);
}

/**
 * Validate Redis username
 * @param {string} username - Redis username
 * @param {string} driver - Cache driver
 * @param {boolean} enabled - Whether cache is enabled
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
        throw new Error('CACHE_REDIS_USERNAME contains invalid control characters');
    }
    
    // Check for CR/LF
    if (trimmed.includes('\n') || trimmed.includes('\r')) {
        throw new Error('CACHE_REDIS_USERNAME contains invalid newline characters');
    }
    
    return trimmed;
}

/**
 * Validate Redis password
 * @param {string} password - Redis password
 * @param {string} driver - Cache driver
 * @param {boolean} enabled - Whether cache is enabled
 * @returns {Object} Validation result
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
        throw new Error('CACHE_REDIS_PASSWORD contains invalid control characters');
    }
    
    // Check for CR/LF
    if (trimmed.includes('\n') || trimmed.includes('\r')) {
        throw new Error('CACHE_REDIS_PASSWORD contains invalid newline characters');
    }
    
    return {
        valid: true,
        hasPassword: true,
        password: trimmed,
    };
}

/**
 * Validate Redis URL
 * @param {string} url - Redis connection URL
 * @param {string} driver - Cache driver
 * @param {boolean} enabled - Whether cache is enabled
 * @returns {Object} Parsed URL info or null
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
        
        // Extract and validate components
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
            port: port || DEFAULT_CACHE_REDIS_PORT,
            username,
            hasPassword: password.length > 0,
            password: password || null,
            database: database || DEFAULT_CACHE_REDIS_DATABASE,
            isTls: parsed.protocol === 'rediss:',
        };
    } catch (error) {
        throw new Error(`Invalid CACHE_REDIS_URL: ${error.message}`);
    }
}

/**
 * Validate fail mode
 * @param {string} mode - Fail mode
 * @returns {string} Validated fail mode
 */
function validateFailMode(mode) {
    if (!mode || typeof mode !== 'string') {
        return DEFAULT_CACHE_FAIL_MODE;
    }
    
    const normalized = mode.trim().toLowerCase();
    
    if (!VALID_FAIL_MODES.includes(normalized)) {
        throw new Error(`CACHE_FAIL_MODE must be one of: ${VALID_FAIL_MODES.join(', ')}`);
    }
    
    return normalized;
}

// ----------------------------------------------------------------------------
// 3. CONFIGURATION LOADER
// ----------------------------------------------------------------------------

/**
 * Load cache configuration from environment variables
 * @param {string} nodeEnv - Current Node environment
 * @returns {Object} Immutable cache configuration
 */
function loadCacheConfig(nodeEnv = 'development') {
    const isProduction = nodeEnv === 'production';
    
    // Parse enabled flag
    const enabled = parseBoolean(process.env.CACHE_ENABLED, DEFAULT_CACHE_ENABLED);
    
    // Parse driver (may be overridden if disabled)
    const driver = validateDriver(process.env.CACHE_DRIVER, enabled);
    
    // Parse TTL values
    let defaultTtl, maxTtl;
    
    if (driver !== 'none') {
        defaultTtl = validateTtl(
            process.env.CACHE_DEFAULT_TTL,
            DEFAULT_CACHE_DEFAULT_TTL,
            MIN_TTL,
            MAX_TTL_LIMIT,
            'CACHE_DEFAULT_TTL'
        );
        
        maxTtl = validateTtl(
            process.env.CACHE_MAX_TTL,
            DEFAULT_CACHE_MAX_TTL,
            MIN_TTL,
            MAX_TTL_LIMIT,
            'CACHE_MAX_TTL'
        );
        
        // Ensure default TTL does not exceed max TTL
        if (defaultTtl > maxTtl) {
            throw new Error('CACHE_DEFAULT_TTL must not exceed CACHE_MAX_TTL');
        }
    } else {
        defaultTtl = DEFAULT_CACHE_DEFAULT_TTL;
        maxTtl = DEFAULT_CACHE_MAX_TTL;
    }
    
    // Parse namespace and key length
    const namespace = validateNamespace(process.env.CACHE_NAMESPACE);
    const keyMaxLength = validateKeyMaxLength(process.env.CACHE_KEY_MAX_LENGTH);
    
    // Parse max entries
    const maxEntries = validateMaxEntries(process.env.CACHE_MAX_ENTRIES);
    
    // Parse fail mode
    const failMode = validateFailMode(process.env.CACHE_FAIL_MODE);
    
    // Parse Redis configuration
    const redisHost = validateRedisHost(process.env.CACHE_REDIS_HOST, driver, enabled);
    const redisPort = validateRedisPort(process.env.CACHE_REDIS_PORT, driver, enabled);
    const redisUsername = validateRedisUsername(process.env.CACHE_REDIS_USERNAME, driver, enabled);
    const redisPasswordResult = validateRedisPassword(process.env.CACHE_REDIS_PASSWORD, driver, enabled);
    const redisDatabase = validateRedisDatabase(process.env.CACHE_REDIS_DATABASE, driver, enabled);
    const redisConnectTimeout = validateRedisConnectTimeout(process.env.CACHE_REDIS_CONNECT_TIMEOUT, driver, enabled);
    const redisTls = parseBoolean(process.env.CACHE_REDIS_TLS, DEFAULT_CACHE_REDIS_TLS);
    
    // Parse Redis URL (may override individual settings)
    const redisUrlResult = validateRedisUrl(process.env.CACHE_REDIS_URL, driver, enabled);
    
    // Build Redis config
    let redisConfig = null;
    let redisPassword = null;
    
    if (driver === 'redis' && enabled) {
        // Use URL if provided, otherwise use individual settings
        if (redisUrlResult) {
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
        defaultTtl,
        maxTtl,
        namespace,
        keyMaxLength,
        maxEntries,
        failMode,
        isProduction,
        redis: redisConfig,
        _redisPassword: redisPassword,
        _isRedisConfigured: driver === 'redis' && enabled && redisConfig !== null && redisConfig.host,
    };
    
    return Object.freeze(config);
}

// ----------------------------------------------------------------------------
// 4. SINGLETON CONFIGURATION
// ----------------------------------------------------------------------------

let _config = null;
let _redisPassword = null;

/**
 * Get the cache configuration (singleton)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Immutable cache configuration
 */
function getCacheConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    if (_config === null) {
        const loaded = loadCacheConfig(nodeEnv);
        // Store password internally
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
 * Get safe cache configuration (without secrets)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Safe cache configuration for logging/diagnostics
 */
function getSafeCacheConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    const config = getCacheConfig(nodeEnv);
    
    const safe = {
        enabled: config.enabled,
        driver: config.driver,
        defaultTtl: config.defaultTtl,
        maxTtl: config.maxTtl,
        namespace: config.namespace,
        keyMaxLength: config.keyMaxLength,
        maxEntries: config.maxEntries,
        failMode: config.failMode,
        isProduction: config.isProduction,
    };
    
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
 * Get cache secret configuration (for internal use only)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Secret configuration for cache client
 */
function getCacheSecretConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    const config = getCacheConfig(nodeEnv);
    
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
 * Validate cache configuration
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Validation result
 */
function validateCacheConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    try {
        const config = getCacheConfig(nodeEnv);
        const errors = [];
        const warnings = [];
        
        // Validate driver-specific requirements
        if (config.driver === 'redis') {
            if (!config.redis || !config.redis.host) {
                errors.push('Redis host is required when CACHE_DRIVER=redis');
            }
            
            if (config.redis && !config.redis.host) {
                errors.push('CACHE_REDIS_HOST is required when CACHE_DRIVER=redis');
            }
            
            if (config.isProduction && config.redis && !config.redis.hasPassword && config.redis.username.length === 0) {
                warnings.push('Redis credentials not configured - consider securing Redis in production');
            }
        }
        
        // Warn about disabled cache in production
        if (config.isProduction && !config.enabled) {
            warnings.push('Cache is disabled in production - performance may be impacted');
        }
        
        // Warn about memory driver in production
        if (config.isProduction && config.driver === 'memory') {
            warnings.push('Memory cache driver in production - consider using Redis for scalability');
        }
        
        // Warn about large max entries
        if (config.maxEntries > 10000) {
            warnings.push(`CACHE_MAX_ENTRIES (${config.maxEntries}) is large - may cause memory issues`);
        }
        
        // Check TTL values
        if (config.maxTtl > 7 * 24 * 60 * 60) {
            warnings.push(`CACHE_MAX_TTL (${config.maxTtl}) exceeds 7 days - consider shorter TTL`);
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            config: getSafeCacheConfig(nodeEnv),
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
    getCacheConfig,
    getSafeCacheConfig,
    getCacheSecretConfig,
    validateCacheConfig,
    loadCacheConfig,
    parseBoolean,
    parsePositiveInteger,
    VALID_DRIVERS,
    VALID_FAIL_MODES,
    DEFAULT_CACHE_ENABLED,
    DEFAULT_CACHE_DRIVER,
    DEFAULT_CACHE_DEFAULT_TTL,
    DEFAULT_CACHE_MAX_TTL,
    DEFAULT_CACHE_NAMESPACE,
    DEFAULT_CACHE_KEY_MAX_LENGTH,
    DEFAULT_CACHE_MAX_ENTRIES,
    DEFAULT_CACHE_FAIL_MODE,
};

export default {
    getCacheConfig,
    getSafeCacheConfig,
    getCacheSecretConfig,
    validateCacheConfig,
    loadCacheConfig,
    parseBoolean,
    parsePositiveInteger,
    VALID_DRIVERS,
    VALID_FAIL_MODES,
    DEFAULT_CACHE_ENABLED,
    DEFAULT_CACHE_DRIVER,
    DEFAULT_CACHE_DEFAULT_TTL,
    DEFAULT_CACHE_MAX_TTL,
    DEFAULT_CACHE_NAMESPACE,
    DEFAULT_CACHE_KEY_MAX_LENGTH,
    DEFAULT_CACHE_MAX_ENTRIES,
    DEFAULT_CACHE_FAIL_MODE,
};