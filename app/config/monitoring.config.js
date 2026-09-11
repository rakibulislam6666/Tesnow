/**
 * app/config/monitoring.config.js
 * Centralized monitoring/observability configuration for Tesnow
 * Provides secure, privacy-conscious configuration for metrics, tracing, and error tracking
 * 
 * @module config/monitoring.config
 */

// ----------------------------------------------------------------------------
// 1. CONSTANTS & DEFAULTS
// ----------------------------------------------------------------------------

const DEFAULT_MONITORING_ENABLED = true;
const DEFAULT_MONITORING_ENVIRONMENT = 'development';
const DEFAULT_MONITORING_SERVICE_NAME = 'tesnow';
const DEFAULT_MONITORING_LOG_LEVEL = 'info';
const DEFAULT_MONITORING_HEALTH_ENABLED = true;
const DEFAULT_MONITORING_READINESS_ENABLED = true;
const DEFAULT_MONITORING_METRICS_ENABLED = true;
const DEFAULT_MONITORING_TRACING_ENABLED = false;
const DEFAULT_MONITORING_ERROR_TRACKING_ENABLED = false;
const DEFAULT_MONITORING_SAMPLE_RATE = 1;
const DEFAULT_MONITORING_METRICS_INTERVAL_MS = 15000;
const DEFAULT_MONITORING_REQUEST_DURATION_ENABLED = true;
const DEFAULT_MONITORING_REQUEST_COUNT_ENABLED = true;
const DEFAULT_MONITORING_REDACTION_ENABLED = true;
const DEFAULT_MONITORING_MAX_EVENT_NAME_LENGTH = 100;
const DEFAULT_MONITORING_MAX_ATTRIBUTE_COUNT = 30;
const DEFAULT_MONITORING_MAX_ATTRIBUTE_LENGTH = 500;

const VALID_ENVIRONMENTS = ['development', 'test', 'staging', 'production'];
const VALID_LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];
const MIN_ENV_LENGTH = 1;
const MAX_ENV_LENGTH = 20;
const MIN_SERVICE_NAME_LENGTH = 1;
const MAX_SERVICE_NAME_LENGTH = 100;
const MIN_METRICS_INTERVAL_MS = 1000;
const MAX_METRICS_INTERVAL_MS = 60000;
const MIN_SAMPLE_RATE = 0;
const MAX_SAMPLE_RATE = 1;
const MIN_EVENT_NAME_LENGTH = 1;
const MAX_EVENT_NAME_LENGTH = 500;
const MIN_ATTRIBUTE_COUNT = 0;
const MAX_ATTRIBUTE_COUNT = 100;
const MIN_ATTRIBUTE_LENGTH = 0;
const MAX_ATTRIBUTE_LENGTH = 2000;
const MAX_DSN_LENGTH = 500;

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
 * Parse sample rate
 * @param {string|number} value - Sample rate value
 * @param {number} defaultValue - Default if parsing fails
 * @returns {number} Validated sample rate
 */
function parseSampleRate(value, defaultValue) {
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
    
    if (typeof num !== 'number' || !Number.isFinite(num)) {
        throw new Error('Sample rate must be a finite number');
    }
    
    if (num < MIN_SAMPLE_RATE || num > MAX_SAMPLE_RATE) {
        throw new Error(`Sample rate must be between ${MIN_SAMPLE_RATE} and ${MAX_SAMPLE_RATE}`);
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
 * Validate environment
 * @param {string} environment - Environment name
 * @param {string} defaultValue - Default if invalid
 * @returns {string} Validated environment
 */
function validateEnvironment(environment, defaultValue) {
    if (!environment || typeof environment !== 'string') {
        return defaultValue;
    }
    
    const trimmed = environment.trim().toLowerCase();
    
    if (trimmed.length === 0) {
        return defaultValue;
    }
    
    if (!VALID_ENVIRONMENTS.includes(trimmed)) {
        throw new Error(`Environment must be one of: ${VALID_ENVIRONMENTS.join(', ')}`);
    }
    
    return trimmed;
}

/**
 * Validate log level
 * @param {string} level - Log level
 * @param {string} defaultValue - Default if invalid
 * @returns {string} Validated log level
 */
function validateLogLevel(level, defaultValue) {
    if (!level || typeof level !== 'string') {
        return defaultValue;
    }
    
    const trimmed = level.trim().toLowerCase();
    
    if (!VALID_LOG_LEVELS.includes(trimmed)) {
        throw new Error(`Log level must be one of: ${VALID_LOG_LEVELS.join(', ')}`);
    }
    
    return trimmed;
}

/**
 * Validate URL
 * @param {string} url - URL to validate
 * @param {boolean} allowEmpty - Whether empty URL is allowed
 * @param {string} name - Name for error messages
 * @returns {string} Validated URL
 */
function validateUrl(url, allowEmpty, name) {
    if (url === null || url === undefined || url === '') {
        if (allowEmpty) {
            return '';
        }
        throw new Error(`${name} cannot be empty`);
    }
    
    const trimmed = url.trim();
    
    if (trimmed.length === 0) {
        if (allowEmpty) {
            return '';
        }
        throw new Error(`${name} cannot be empty`);
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
    
    // Check for credentials
    if (trimmed.includes('@') && (trimmed.includes(':') || trimmed.includes('://'))) {
        try {
            const parsed = new URL(trimmed);
            if (parsed.username || parsed.password) {
                throw new Error(`${name} cannot contain credentials`);
            }
        } catch {
            // Let URL validation handle it
        }
    }
    
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new Error(`${name} must use HTTP or HTTPS protocol`);
        }
        
        // Remove trailing slash
        let normalized = parsed.toString();
        normalized = normalized.replace(/\/+$/, '');
        return normalized;
    } catch {
        throw new Error(`Invalid ${name}: ${trimmed}`);
    }
}

/**
 * Validate DSN (sensitive)
 * @param {string} dsn - DSN string
 * @param {boolean} enabled - Whether monitoring is enabled
 * @returns {Object} Validation result with DSN info
 */
function validateDsn(dsn, enabled) {
    if (!enabled) {
        return {
            valid: true,
            hasDsn: false,
            dsn: null,
        };
    }
    
    if (!dsn || typeof dsn !== 'string') {
        return {
            valid: true,
            hasDsn: false,
            dsn: null,
        };
    }
    
    const trimmed = dsn.trim();
    
    if (trimmed.length === 0) {
        return {
            valid: true,
            hasDsn: false,
            dsn: null,
        };
    }
    
    // Check for null bytes
    if (trimmed.includes('\x00')) {
        throw new Error('MONITORING_DSN contains null bytes');
    }
    
    // Check for control characters
    if (/[\x01-\x1F\x7F]/.test(trimmed)) {
        throw new Error('MONITORING_DSN contains invalid control characters');
    }
    
    // Check for CR/LF
    if (trimmed.includes('\n') || trimmed.includes('\r')) {
        throw new Error('MONITORING_DSN contains invalid newline characters');
    }
    
    if (trimmed.length > MAX_DSN_LENGTH) {
        throw new Error(`MONITORING_DSN exceeds maximum length of ${MAX_DSN_LENGTH}`);
    }
    
    // Basic DSN format validation (e.g., protocol://...)
    // We don't validate format too strictly to allow different provider formats
    // but we ensure it's not obviously malformed.
    if (!/^[a-zA-Z0-9+.-]+:\/\/.+/.test(trimmed)) {
        throw new Error('MONITORING_DSN must be a valid DSN URL');
    }
    
    return {
        valid: true,
        hasDsn: true,
        dsn: trimmed,
    };
}

// ----------------------------------------------------------------------------
// 3. CONFIGURATION LOADER
// ----------------------------------------------------------------------------

/**
 * Load monitoring configuration from environment variables
 * @param {string} nodeEnv - Current Node environment
 * @returns {Object} Immutable monitoring configuration
 */
function loadMonitoringConfig(nodeEnv = 'development') {
    const isProduction = nodeEnv === 'production';
    
    // Parse enabled flag
    const enabled = parseBoolean(process.env.MONITORING_ENABLED, DEFAULT_MONITORING_ENABLED);
    
    // Parse environment and service name
    const environment = validateEnvironment(
        process.env.MONITORING_ENVIRONMENT,
        DEFAULT_MONITORING_ENVIRONMENT
    );
    
    const serviceName = validateRequiredString(
        process.env.MONITORING_SERVICE_NAME,
        DEFAULT_MONITORING_SERVICE_NAME,
        MAX_SERVICE_NAME_LENGTH,
        'MONITORING_SERVICE_NAME'
    );
    
    // Parse log level
    const logLevel = validateLogLevel(process.env.MONITORING_LOG_LEVEL, DEFAULT_MONITORING_LOG_LEVEL);
    
    // Parse health flags
    const healthEnabled = parseBoolean(process.env.MONITORING_HEALTH_ENABLED, DEFAULT_MONITORING_HEALTH_ENABLED);
    const readinessEnabled = parseBoolean(process.env.MONITORING_READINESS_ENABLED, DEFAULT_MONITORING_READINESS_ENABLED);
    
    // Parse metrics flags
    const metricsEnabled = parseBoolean(process.env.MONITORING_METRICS_ENABLED, DEFAULT_MONITORING_METRICS_ENABLED);
    const metricsIntervalMs = parsePositiveInteger(
        process.env.MONITORING_METRICS_INTERVAL_MS,
        DEFAULT_MONITORING_METRICS_INTERVAL_MS,
        MIN_METRICS_INTERVAL_MS,
        MAX_METRICS_INTERVAL_MS
    );
    const requestDurationEnabled = parseBoolean(
        process.env.MONITORING_REQUEST_DURATION_ENABLED,
        DEFAULT_MONITORING_REQUEST_DURATION_ENABLED
    );
    const requestCountEnabled = parseBoolean(
        process.env.MONITORING_REQUEST_COUNT_ENABLED,
        DEFAULT_MONITORING_REQUEST_COUNT_ENABLED
    );
    
    // Parse tracing and error tracking
    const tracingEnabled = parseBoolean(process.env.MONITORING_TRACING_ENABLED, DEFAULT_MONITORING_TRACING_ENABLED);
    const errorTrackingEnabled = parseBoolean(
        process.env.MONITORING_ERROR_TRACKING_ENABLED,
        DEFAULT_MONITORING_ERROR_TRACKING_ENABLED
    );
    const sampleRate = parseSampleRate(process.env.MONITORING_SAMPLE_RATE, DEFAULT_MONITORING_SAMPLE_RATE);
    
    // Parse external URL
    const externalUrl = validateUrl(
        process.env.MONITORING_EXTERNAL_URL,
        true,
        'MONITORING_EXTERNAL_URL'
    );
    
    // Parse DSN (sensitive)
    const dsnResult = validateDsn(process.env.MONITORING_DSN, enabled);
    const dsn = dsnResult.hasDsn ? dsnResult.dsn : null;
    
    // Parse redaction
    const redactionEnabled = parseBoolean(process.env.MONITORING_REDACTION_ENABLED, DEFAULT_MONITORING_REDACTION_ENABLED);
    
    // Parse event/attribute limits
    const maxEventNameLength = parsePositiveInteger(
        process.env.MONITORING_MAX_EVENT_NAME_LENGTH,
        DEFAULT_MONITORING_MAX_EVENT_NAME_LENGTH,
        MIN_EVENT_NAME_LENGTH,
        MAX_EVENT_NAME_LENGTH
    );
    const maxAttributeCount = parsePositiveInteger(
        process.env.MONITORING_MAX_ATTRIBUTE_COUNT,
        DEFAULT_MONITORING_MAX_ATTRIBUTE_COUNT,
        MIN_ATTRIBUTE_COUNT,
        MAX_ATTRIBUTE_COUNT
    );
    const maxAttributeLength = parsePositiveInteger(
        process.env.MONITORING_MAX_ATTRIBUTE_LENGTH,
        DEFAULT_MONITORING_MAX_ATTRIBUTE_LENGTH,
        MIN_ATTRIBUTE_LENGTH,
        MAX_ATTRIBUTE_LENGTH
    );
    
    // Build config
    const config = {
        enabled,
        environment,
        serviceName,
        logLevel,
        isProduction,
        health: {
            enabled: healthEnabled && enabled,
            readinessEnabled: readinessEnabled && enabled,
        },
        metrics: {
            enabled: metricsEnabled && enabled,
            intervalMs: metricsIntervalMs,
            requestDuration: requestDurationEnabled && enabled && metricsEnabled,
            requestCount: requestCountEnabled && enabled && metricsEnabled,
        },
        tracing: {
            enabled: tracingEnabled && enabled,
            sampleRate,
        },
        errorTracking: {
            enabled: errorTrackingEnabled && enabled,
        },
        external: {
            url: externalUrl,
        },
        redactionEnabled: redactionEnabled && enabled,
        limits: {
            maxEventNameLength,
            maxAttributeCount,
            maxAttributeLength,
        },
        _dsn: dsn,
        isConfigured: enabled,
    };
    
    return Object.freeze(config);
}

// ----------------------------------------------------------------------------
// 4. SINGLETON CONFIGURATION
// ----------------------------------------------------------------------------

let _config = null;
let _dsn = null;

/**
 * Get the monitoring configuration (singleton)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Immutable monitoring configuration
 */
function getMonitoringConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    if (_config === null) {
        const loaded = loadMonitoringConfig(nodeEnv);
        // Store DSN internally
        if (loaded._dsn) {
            _dsn = loaded._dsn;
        }
        // Remove sensitive DSN from config
        const { _dsn: _, ...safeConfig } = loaded;
        _config = Object.freeze(safeConfig);
    }
    return _config;
}

/**
 * Get safe monitoring configuration (for logging/diagnostics)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Safe monitoring configuration
 */
function getSafeMonitoringConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    const config = getMonitoringConfig(nodeEnv);
    
    const safe = {
        enabled: config.enabled,
        environment: config.environment,
        serviceName: config.serviceName,
        logLevel: config.logLevel,
        isProduction: config.isProduction,
        health: {
            enabled: config.health.enabled,
            readinessEnabled: config.health.readinessEnabled,
        },
        metrics: {
            enabled: config.metrics.enabled,
            intervalMs: config.metrics.intervalMs,
            requestDuration: config.metrics.requestDuration,
            requestCount: config.metrics.requestCount,
        },
        tracing: {
            enabled: config.tracing.enabled,
            sampleRate: config.tracing.sampleRate,
        },
        errorTracking: {
            enabled: config.errorTracking.enabled,
        },
        external: {
            hasUrl: !!config.external.url,
        },
        redactionEnabled: config.redactionEnabled,
        limits: {
            maxEventNameLength: config.limits.maxEventNameLength,
            maxAttributeCount: config.limits.maxAttributeCount,
            maxAttributeLength: config.limits.maxAttributeLength,
        },
        isConfigured: config.isConfigured,
    };
    
    return Object.freeze(safe);
}

/**
 * Get monitoring secret configuration (for internal use only)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Secret configuration
 */
function getMonitoringSecretConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    const config = getMonitoringConfig(nodeEnv);
    
    const secretConfig = {
        dsn: _dsn || undefined,
        hasSecrets: !!_dsn,
    };
    
    return Object.freeze(secretConfig);
}

/**
 * Validate monitoring configuration
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Validation result
 */
function validateMonitoringConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    try {
        const config = getMonitoringConfig(nodeEnv);
        const errors = [];
        const warnings = [];
        
        // Validate environment
        if (config.isProduction && config.environment !== 'production') {
            warnings.push(`Environment is "${config.environment}" but NODE_ENV is "production" - mismatch`);
        }
        
        // Validate tracing
        if (config.tracing.enabled && config.tracing.sampleRate < 0.1) {
            warnings.push(`Tracing sample rate (${config.tracing.sampleRate}) is very low - may miss traces`);
        }
        
        // Validate metrics interval
        if (config.metrics.enabled && config.metrics.intervalMs > 30000) {
            warnings.push(`Metrics interval (${config.metrics.intervalMs}ms) is high - may miss recent data`);
        }
        
        // Validate external URL
        if (config.isProduction && !config.external.url && (config.tracing.enabled || config.errorTracking.enabled)) {
            warnings.push('External monitoring URL not configured but tracing/error tracking is enabled');
        }
        
        // Validate redaction
        if (config.isProduction && !config.redactionEnabled) {
            warnings.push('Redaction is disabled in production - may send sensitive data');
        }
        
        // Validate DSN presence
        if (config.isProduction && config.errorTracking.enabled && !_dsn) {
            errors.push('MONITORING_DSN is required for error tracking in production');
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            config: getSafeMonitoringConfig(nodeEnv),
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
    getMonitoringConfig,
    getSafeMonitoringConfig,
    getMonitoringSecretConfig,
    validateMonitoringConfig,
    loadMonitoringConfig,
    parseBoolean,
    VALID_ENVIRONMENTS,
    VALID_LOG_LEVELS,
    DEFAULT_MONITORING_ENABLED,
    DEFAULT_MONITORING_SERVICE_NAME,
};

export default {
    getMonitoringConfig,
    getSafeMonitoringConfig,
    getMonitoringSecretConfig,
    validateMonitoringConfig,
    loadMonitoringConfig,
    parseBoolean,
    VALID_ENVIRONMENTS,
    VALID_LOG_LEVELS,
    DEFAULT_MONITORING_ENABLED,
    DEFAULT_MONITORING_SERVICE_NAME,
};