/**
 * app/config/feature-flags.config.js
 * Centralized feature-flag configuration for Tesnow
 * Provides secure, validated configuration for feature flags, rollouts, and providers
 * 
 * @module config/feature-flags.config
 */

// ----------------------------------------------------------------------------
// 1. CONSTANTS & DEFAULTS
// ----------------------------------------------------------------------------

const DEFAULT_FEATURE_FLAGS_ENABLED = true;
const DEFAULT_FEATURE_FLAGS_PROVIDER = 'local';
const DEFAULT_FEATURE_FLAGS_DEFAULT_ENABLED = false;
const DEFAULT_FEATURE_FLAGS_FAIL_MODE = 'closed';
const DEFAULT_FEATURE_FLAGS_CACHE_TTL = 60000; // 1 minute
const DEFAULT_FEATURE_FLAGS_ROLLOUT_SALT = ''; // Must be set in production
const DEFAULT_FEATURE_FLAGS_ALLOW_OVERRIDE = false;

const VALID_PROVIDERS = ['local', 'database', 'redis', 'remote', 'none'];
const VALID_FAIL_MODES = ['open', 'closed'];
const VALID_ENVIRONMENTS = ['development', 'test', 'staging', 'production'];

const MIN_SALT_LENGTH = 16;
const MAX_CACHE_TTL = 300000; // 5 minutes
const MIN_CACHE_TTL = 1000;
const MAX_CACHE_ENTRIES = 10000;
const MIN_CACHE_ENTRIES = 1;
const DEFAULT_CACHE_NAMESPACE = 'feature-flags';
const DEFAULT_CACHE_MAX_ENTRIES = 1000;
const DEFAULT_CACHE_ENABLED = true;

const DEFAULT_REFRESH_INTERVAL = 60000; // 1 minute
const MIN_REFRESH_INTERVAL = 5000;
const MAX_REFRESH_INTERVAL = 3600000; // 1 hour
const DEFAULT_REMOTE_TIMEOUT = 5000;
const DEFAULT_REMOTE_RETRY_COUNT = 3;
const MAX_REMOTE_RETRY_COUNT = 10;

const FEATURE_KEY_REGEX = /^[a-zA-Z][a-zA-Z0-9._-]{0,99}$/;

// Default feature flag registry (all disabled by default)
const DEFAULT_FLAGS = {
    newPostEditor: {
        enabled: false,
        rollout: 0,
        environments: ['development', 'staging', 'production'],
        description: 'New post editor with advanced formatting',
        beta: false,
        killSwitch: false,
        deprecated: false,
    },
    postScheduling: {
        enabled: false,
        rollout: 0,
        environments: ['development', 'staging', 'production'],
        description: 'Schedule posts for future publication',
        beta: true,
        killSwitch: false,
        deprecated: false,
    },
    postRevisionHistory: {
        enabled: false,
        rollout: 0,
        environments: ['development', 'staging', 'production'],
        description: 'Track and restore post revisions',
        beta: true,
        killSwitch: false,
        deprecated: false,
    },
    advancedAnalytics: {
        enabled: false,
        rollout: 0,
        environments: ['development', 'staging', 'production'],
        description: 'Advanced analytics dashboard',
        beta: true,
        killSwitch: false,
        deprecated: false,
    },
    userBookmarks: {
        enabled: false,
        rollout: 0,
        environments: ['development', 'staging', 'production'],
        description: 'Save posts to bookmarks',
        beta: false,
        killSwitch: false,
        deprecated: false,
    },
    comments: {
        enabled: false,
        rollout: 0,
        environments: ['development', 'staging', 'production'],
        description: 'Enable commenting system',
        beta: false,
        killSwitch: false,
        deprecated: false,
    },
    newsletter: {
        enabled: false,
        rollout: 0,
        environments: ['development', 'staging', 'production'],
        description: 'Email newsletter subscriptions and sending',
        beta: true,
        killSwitch: false,
        deprecated: false,
    },
    oauthLogin: {
        enabled: false,
        rollout: 0,
        environments: ['development', 'staging', 'production'],
        description: 'OAuth social login (Google, GitHub, etc.)',
        beta: true,
        killSwitch: false,
        deprecated: false,
    },
    payments: {
        enabled: false,
        rollout: 0,
        environments: ['development', 'staging', 'production'],
        description: 'Payment processing for premium features',
        beta: true,
        killSwitch: false,
        deprecated: false,
    },
    apiV2: {
        enabled: false,
        rollout: 0,
        environments: ['development', 'staging', 'production'],
        description: 'API v2 with improved endpoints',
        beta: true,
        killSwitch: false,
        deprecated: false,
    },
};

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
 * Parse rollout percentage (0-100)
 * @param {string|number} value - Value to parse
 * @param {number} defaultValue - Default if parsing fails
 * @returns {number} Parsed percentage
 */
function parseRollout(value, defaultValue) {
    if (value === null || value === undefined || value === '') {
        return defaultValue;
    }

    let num;
    if (typeof value === 'string') {
        num = parseFloat(value);
    } else if (typeof value === 'number') {
        num = value;
    } else {
        return defaultValue;
    }

    if (typeof num !== 'number' || !Number.isFinite(num) || num < 0 || num > 100) {
        throw new Error('Rollout must be a number between 0 and 100');
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
 * Validate required safe string
 * @param {string} value - Value to validate
 * @param {string} defaultValue - Default if empty
 * @param {number} maxLength - Maximum allowed length
 * @param {string} name - Name for error messages
 * @returns {string} Validated string
 */
function validateRequiredString(value, defaultValue, maxLength, name) {
    const result = validateSafeString(value, defaultValue, maxLength, name, false);
    if (result.length === 0) {
        throw new Error(`${name} cannot be empty`);
    }
    return result;
}

/**
 * Validate provider
 * @param {string} provider - Provider name
 * @param {string} defaultValue - Default if invalid
 * @param {boolean} enabled - Master enabled flag
 * @returns {string} Validated provider
 */
function validateProvider(provider, defaultValue, enabled) {
    if (!provider || typeof provider !== 'string') {
        return enabled ? defaultValue : 'none';
    }

    const trimmed = provider.trim().toLowerCase();

    if (!VALID_PROVIDERS.includes(trimmed)) {
        throw new Error(`Provider must be one of: ${VALID_PROVIDERS.join(', ')}`);
    }

    if (!enabled) {
        return 'none';
    }

    return trimmed;
}

/**
 * Validate fail mode
 * @param {string} mode - Fail mode
 * @param {string} defaultValue - Default if invalid
 * @returns {string} Validated fail mode
 */
function validateFailMode(mode, defaultValue) {
    if (!mode || typeof mode !== 'string') {
        return defaultValue;
    }

    const trimmed = mode.trim().toLowerCase();

    if (!VALID_FAIL_MODES.includes(trimmed)) {
        throw new Error(`Fail mode must be one of: ${VALID_FAIL_MODES.join(', ')}`);
    }

    return trimmed;
}

/**
 * Validate environment list
 * @param {string|Array} envs - Environment list
 * @param {Array} defaultValue - Default if empty
 * @returns {Array} Validated environment list
 */
function validateEnvironments(envs, defaultValue) {
    if (!envs || (Array.isArray(envs) && envs.length === 0)) {
        return defaultValue;
    }

    let list;
    if (Array.isArray(envs)) {
        list = envs;
    } else if (typeof envs === 'string') {
        list = envs.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    } else {
        return defaultValue;
    }

    if (list.length === 0) {
        return defaultValue;
    }

    const validated = [];
    for (const env of list) {
        if (!VALID_ENVIRONMENTS.includes(env)) {
            throw new Error(`Invalid environment: ${env}. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`);
        }
        validated.push(env);
    }

    return validated;
}

/**
 * Validate feature key
 * @param {string} key - Feature key
 * @returns {string} Validated key
 */
function validateFeatureKey(key) {
    if (typeof key !== 'string' || !key) {
        throw new Error('Feature key must be a non-empty string');
    }

    const trimmed = key.trim();
    if (trimmed.length === 0) {
        throw new Error('Feature key cannot be empty');
    }

    // Prevent prototype pollution
    if (trimmed === '__proto__' || trimmed === 'constructor' || trimmed === 'prototype') {
        throw new Error(`Invalid feature key: "${trimmed}"`);
    }

    if (!FEATURE_KEY_REGEX.test(trimmed)) {
        throw new Error(`Feature key must match pattern: ${FEATURE_KEY_REGEX}`);
    }

    return trimmed;
}

/**
 * Validate feature definition
 * @param {string} key - Feature key
 * @param {Object} def - Feature definition
 * @param {boolean} defaultEnabled - Default enabled state
 * @param {string} currentEnvironment - Current environment
 * @returns {Object} Validated definition
 */
function validateFeatureDefinition(key, def, defaultEnabled, currentEnvironment) {
    const safeKey = validateFeatureKey(key);

    const enabled = parseBoolean(def.enabled, defaultEnabled);
    const rollout = parseRollout(def.rollout, 0);
    const environments = validateEnvironments(def.environments, ['development', 'staging', 'production']);
    const description = validateSafeString(def.description, '', 500, 'description', true);
    const beta = parseBoolean(def.beta, false);
    const killSwitch = parseBoolean(def.killSwitch, false);
    const deprecated = parseBoolean(def.deprecated, false);
    const config = def.config && typeof def.config === 'object' ? { ...def.config } : null;

    return {
        key: safeKey,
        enabled,
        rollout,
        environments,
        description,
        beta,
        killSwitch,
        deprecated,
        config,
    };
}

/**
 * Deep freeze an object
 * @param {Object} obj - Object to freeze
 * @returns {Object} Frozen object
 */
function deepFreeze(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    const propNames = Object.getOwnPropertyNames(obj);
    for (const name of propNames) {
        const value = obj[name];
        if (value && typeof value === 'object') {
            deepFreeze(value);
        }
    }
    return Object.freeze(obj);
}

// ----------------------------------------------------------------------------
// 3. CONFIGURATION LOADER
// ----------------------------------------------------------------------------

/**
 * Load feature-flag configuration from environment variables
 * @param {string} nodeEnv - Current Node environment
 * @returns {Object} Immutable feature-flag configuration
 */
function loadFeatureFlagsConfig(nodeEnv = 'development') {
    const isProduction = nodeEnv === 'production';

    // Master enablement
    const enabled = parseBoolean(process.env.FEATURE_FLAGS_ENABLED, DEFAULT_FEATURE_FLAGS_ENABLED);

    // Provider
    const provider = validateProvider(
        process.env.FEATURE_FLAGS_PROVIDER,
        DEFAULT_FEATURE_FLAGS_PROVIDER,
        enabled
    );

    // Default enabled state
    const defaultEnabled = parseBoolean(process.env.FEATURE_FLAGS_DEFAULT_ENABLED, DEFAULT_FEATURE_FLAGS_DEFAULT_ENABLED);

    // Fail mode
    const failMode = validateFailMode(
        process.env.FEATURE_FLAGS_FAIL_MODE,
        DEFAULT_FEATURE_FLAGS_FAIL_MODE
    );

    // Cache TTL
    let cacheTtl = DEFAULT_FEATURE_FLAGS_CACHE_TTL;
    if (enabled && provider !== 'none') {
        cacheTtl = parsePositiveInteger(
            process.env.FEATURE_FLAGS_CACHE_TTL,
            DEFAULT_FEATURE_FLAGS_CACHE_TTL,
            MIN_CACHE_TTL,
            MAX_CACHE_TTL
        );
    }

    // Rollout salt
    const rawSalt = process.env.FEATURE_FLAGS_ROLLOUT_SALT || '';
    let rolloutSalt = '';
    if (enabled && provider !== 'none') {
        const salt = validateSafeString(rawSalt, '', 256, 'FEATURE_FLAGS_ROLLOUT_SALT', false);
        if (salt.length === 0) {
            if (isProduction) {
                throw new Error('FEATURE_FLAGS_ROLLOUT_SALT is required in production');
            }
        } else {
            if (salt.length < MIN_SALT_LENGTH) {
                throw new Error(`FEATURE_FLAGS_ROLLOUT_SALT must be at least ${MIN_SALT_LENGTH} characters`);
            }
            // Reject placeholder values
            const placeholders = ['CHANGE_ME', 'change_me', 'your-salt-here', 'secret'];
            if (placeholders.includes(salt.toLowerCase())) {
                if (isProduction) {
                    throw new Error('FEATURE_FLAGS_ROLLOUT_SALT uses a placeholder value');
                }
            }
            rolloutSalt = salt;
        }
    }

    // Override
    const allowOverride = parseBoolean(
        process.env.FEATURE_FLAGS_ALLOW_OVERRIDE,
        DEFAULT_FEATURE_FLAGS_ALLOW_OVERRIDE
    );
    const overrideEnabled = allowOverride && (nodeEnv === 'development' || nodeEnv === 'test');

    // Cache config
    const cacheEnabled = parseBoolean(
        process.env.FEATURE_FLAGS_CACHE_ENABLED,
        DEFAULT_CACHE_ENABLED
    );
    const cacheMaxEntries = parsePositiveInteger(
        process.env.FEATURE_FLAGS_CACHE_MAX_ENTRIES,
        DEFAULT_CACHE_MAX_ENTRIES,
        MIN_CACHE_ENTRIES,
        MAX_CACHE_ENTRIES
    );
    const cacheNamespace = validateSafeString(
        process.env.FEATURE_FLAGS_CACHE_NAMESPACE,
        DEFAULT_CACHE_NAMESPACE,
        100,
        'FEATURE_FLAGS_CACHE_NAMESPACE',
        false
    );

    // Providers config
    const databaseTableName = validateSafeString(
        process.env.FEATURE_FLAGS_DATABASE_TABLE,
        'feature_flags',
        100,
        'FEATURE_FLAGS_DATABASE_TABLE',
        false
    );
    const databaseRefreshInterval = parsePositiveInteger(
        process.env.FEATURE_FLAGS_DATABASE_REFRESH_INTERVAL,
        DEFAULT_REFRESH_INTERVAL,
        MIN_REFRESH_INTERVAL,
        MAX_REFRESH_INTERVAL
    );

    const redisKeyPrefix = validateSafeString(
        process.env.FEATURE_FLAGS_REDIS_KEY_PREFIX,
        'feature-flags',
        100,
        'FEATURE_FLAGS_REDIS_KEY_PREFIX',
        false
    );
    const redisRefreshInterval = parsePositiveInteger(
        process.env.FEATURE_FLAGS_REDIS_REFRESH_INTERVAL,
        DEFAULT_REFRESH_INTERVAL,
        MIN_REFRESH_INTERVAL,
        MAX_REFRESH_INTERVAL
    );

    const remoteBaseUrl = validateSafeString(
        process.env.FEATURE_FLAGS_REMOTE_BASE_URL,
        '',
        500,
        'FEATURE_FLAGS_REMOTE_BASE_URL',
        true
    );
    const remoteTimeout = parsePositiveInteger(
        process.env.FEATURE_FLAGS_REMOTE_TIMEOUT,
        DEFAULT_REMOTE_TIMEOUT,
        1000,
        60000
    );
    const remoteRetryCount = parsePositiveInteger(
        process.env.FEATURE_FLAGS_REMOTE_RETRY_COUNT,
        DEFAULT_REMOTE_RETRY_COUNT,
        0,
        MAX_REMOTE_RETRY_COUNT
    );
    const remoteRefreshInterval = parsePositiveInteger(
        process.env.FEATURE_FLAGS_REMOTE_REFRESH_INTERVAL,
        DEFAULT_REFRESH_INTERVAL,
        MIN_REFRESH_INTERVAL,
        MAX_REFRESH_INTERVAL
    );

    // Parse feature flags from JSON environment variable or use defaults
    let flags = { ...DEFAULT_FLAGS };
    const jsonEnv = process.env.FEATURE_FLAGS_JSON;
    if (jsonEnv && typeof jsonEnv === 'string' && jsonEnv.trim()) {
        try {
            const parsed = JSON.parse(jsonEnv);
            if (typeof parsed === 'object' && parsed !== null) {
                for (const [key, value] of Object.entries(parsed)) {
                    if (value && typeof value === 'object') {
                        flags[key] = { ...flags[key], ...value };
                    }
                }
            }
        } catch (err) {
            throw new Error(`FEATURE_FLAGS_JSON is not valid JSON: ${err.message}`);
        }
    }

    // Validate each flag and normalize
    const validatedFlags = {};
    for (const [key, def] of Object.entries(flags)) {
        try {
            validatedFlags[key] = validateFeatureDefinition(key, def, defaultEnabled, nodeEnv);
        } catch (err) {
            throw new Error(`Invalid feature flag definition for "${key}": ${err.message}`);
        }
    }

    // Build configuration
    const config = {
        enabled,
        provider,
        defaultEnabled,
        failMode,
        cache: {
            enabled: cacheEnabled && enabled && provider !== 'none',
            ttl: cacheTtl,
            maxEntries: cacheMaxEntries,
            namespace: cacheNamespace,
        },
        rollout: {
            salt: rolloutSalt,
            defaultRollout: 0,
            min: 0,
            max: 100,
        },
        override: {
            enabled: overrideEnabled,
            allowedEnvironments: ['development', 'test'],
            allowQueryParameter: false,
            allowCookie: false,
            allowHeader: false,
        },
        providers: {
            local: {
                enabled: provider === 'local',
            },
            database: {
                enabled: provider === 'database',
                tableName: databaseTableName,
                refreshInterval: databaseRefreshInterval,
            },
            redis: {
                enabled: provider === 'redis',
                keyPrefix: redisKeyPrefix,
                refreshInterval: redisRefreshInterval,
            },
            remote: {
                enabled: provider === 'remote',
                baseUrl: remoteBaseUrl,
                timeout: remoteTimeout,
                retryCount: remoteRetryCount,
                refreshInterval: remoteRefreshInterval,
            },
        },
        flags: validatedFlags,
        isProduction,
        isConfigured: enabled && provider !== 'none',
    };

    return deepFreeze(config);
}

// ----------------------------------------------------------------------------
// 4. SINGLETON CONFIGURATION
// ----------------------------------------------------------------------------

let _config = null;

/**
 * Get the feature-flag configuration (singleton)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Immutable feature-flag configuration
 */
function getFeatureFlagsConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    if (_config === null) {
        _config = loadFeatureFlagsConfig(nodeEnv);
    }
    return _config;
}

/**
 * Get safe feature-flag configuration (without sensitive data)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Safe configuration
 */
function getSafeFeatureFlagsConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    const config = getFeatureFlagsConfig(nodeEnv);

    // Create a safe copy without the salt and without secret URLs if any
    const safe = {
        enabled: config.enabled,
        provider: config.provider,
        defaultEnabled: config.defaultEnabled,
        failMode: config.failMode,
        cache: {
            enabled: config.cache.enabled,
            ttl: config.cache.ttl,
            maxEntries: config.cache.maxEntries,
            namespace: config.cache.namespace,
        },
        rollout: {
            defaultRollout: config.rollout.defaultRollout,
            min: config.rollout.min,
            max: config.rollout.max,
            hasSalt: !!config.rollout.salt,
        },
        override: {
            enabled: config.override.enabled,
            allowedEnvironments: config.override.allowedEnvironments,
            allowQueryParameter: config.override.allowQueryParameter,
            allowCookie: config.override.allowCookie,
            allowHeader: config.override.allowHeader,
        },
        providers: {
            local: {
                enabled: config.providers.local.enabled,
            },
            database: {
                enabled: config.providers.database.enabled,
                tableName: config.providers.database.tableName,
                refreshInterval: config.providers.database.refreshInterval,
            },
            redis: {
                enabled: config.providers.redis.enabled,
                keyPrefix: config.providers.redis.keyPrefix,
                refreshInterval: config.providers.redis.refreshInterval,
            },
            remote: {
                enabled: config.providers.remote.enabled,
                hasBaseUrl: !!config.providers.remote.baseUrl,
                timeout: config.providers.remote.timeout,
                retryCount: config.providers.remote.retryCount,
                refreshInterval: config.providers.remote.refreshInterval,
            },
        },
        flags: Object.keys(config.flags).reduce((acc, key) => {
            const f = config.flags[key];
            acc[key] = {
                enabled: f.enabled,
                rollout: f.rollout,
                environments: f.environments,
                description: f.description,
                beta: f.beta,
                killSwitch: f.killSwitch,
                deprecated: f.deprecated,
            };
            return acc;
        }, {}),
        isProduction: config.isProduction,
        isConfigured: config.isConfigured,
    };

    return deepFreeze(safe);
}

/**
 * Validate feature-flag configuration
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Validation result
 */
function validateFeatureFlagsConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    try {
        const config = getFeatureFlagsConfig(nodeEnv);
        const errors = [];
        const warnings = [];

        // Check provider requirements
        if (config.enabled && config.provider === 'none') {
            errors.push('Feature flags are enabled but provider is "none"');
        }

        if (config.enabled && config.provider !== 'none') {
            // Provider-specific checks
            if (config.provider === 'database' && !config.providers.database.tableName) {
                errors.push('Database provider requires table name');
            }
            if (config.provider === 'redis' && !config.providers.redis.keyPrefix) {
                warnings.push('Redis key prefix is empty, using default');
            }
            if (config.provider === 'remote' && !config.providers.remote.baseUrl) {
                errors.push('Remote provider requires base URL');
            }
            if (config.provider === 'remote' && config.isProduction && !config.providers.remote.baseUrl.startsWith('https://')) {
                errors.push('Remote provider base URL must use HTTPS in production');
            }
        }

        // Check fail mode
        if (config.failMode === 'open' && config.isProduction) {
            warnings.push('Fail mode is "open" in production - features may be unexpectedly enabled');
        }

        // Check override
        if (config.override.enabled && config.isProduction) {
            warnings.push('Override is enabled in production - security risk');
        }

        // Check cache
        if (config.cache.enabled && config.cache.ttl < 10000 && config.isProduction) {
            warnings.push('Cache TTL is very low in production - may impact performance');
        }

        // Check rollout salt
        if (config.enabled && !config.rollout.salt && config.isProduction) {
            errors.push('Rollout salt is not configured in production - deterministic rollouts will fail');
        }

        // Check for flags with rollout > 0 but no salt
        if (config.rollout.salt) {
            for (const [key, flag] of Object.entries(config.flags)) {
                if (flag.rollout > 0 && flag.rollout < 100 && !config.rollout.salt) {
                    warnings.push(`Feature "${key}" has partial rollout but no salt configured`);
                }
                if (flag.rollout > 0 && !flag.enabled) {
                    warnings.push(`Feature "${key}" has rollout > 0 but is disabled`);
                }
            }
        }

        // Check for killSwitch flags
        for (const [key, flag] of Object.entries(config.flags)) {
            if (flag.killSwitch && flag.enabled) {
                warnings.push(`Kill switch feature "${key}" is enabled - ensure this is intentional`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            config: getSafeFeatureFlagsConfig(nodeEnv),
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
    getFeatureFlagsConfig,
    getSafeFeatureFlagsConfig,
    validateFeatureFlagsConfig,
    loadFeatureFlagsConfig,
    parseBoolean,
    VALID_PROVIDERS,
    VALID_FAIL_MODES,
    DEFAULT_FEATURE_FLAGS_ENABLED,
};

export default {
    getFeatureFlagsConfig,
    getSafeFeatureFlagsConfig,
    validateFeatureFlagsConfig,
    loadFeatureFlagsConfig,
    parseBoolean,
    VALID_PROVIDERS,
    VALID_FAIL_MODES,
    DEFAULT_FEATURE_FLAGS_ENABLED,
};