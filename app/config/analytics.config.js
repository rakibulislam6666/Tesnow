/**
 * app/config/analytics.config.js
 * Centralized analytics configuration for Tesnow
 * Privacy-first, secure configuration for internal and external analytics
 * 
 * @module config/analytics.config
 */

// ----------------------------------------------------------------------------
// 1. CONSTANTS & DEFAULTS
// ----------------------------------------------------------------------------

const DEFAULT_ANALYTICS_ENABLED = false;
const DEFAULT_ANALYTICS_PROVIDER = 'internal';
const DEFAULT_ANALYTICS_TRACK_PAGEVIEWS = true;
const DEFAULT_ANALYTICS_TRACK_EVENTS = true;
const DEFAULT_ANALYTICS_TRACK_SESSIONS = true;
const DEFAULT_ANALYTICS_ANONYMOUS = true;
const DEFAULT_ANALYTICS_RESPECT_DNT = true;
const DEFAULT_ANALYTICS_RETENTION_DAYS = 365;
const DEFAULT_ANALYTICS_BATCH_SIZE = 50;
const DEFAULT_ANALYTICS_FLUSH_INTERVAL_MS = 10000;
const DEFAULT_ANALYTICS_MAX_EVENT_NAME_LENGTH = 100;
const DEFAULT_ANALYTICS_MAX_PROPERTY_COUNT = 30;
const DEFAULT_ANALYTICS_MAX_PROPERTY_LENGTH = 500;
const DEFAULT_ANALYTICS_SAMPLE_RATE = 1;
const DEFAULT_ANALYTICS_SITE_ID = '';

const VALID_PROVIDERS = ['internal', 'none', 'plausible', 'matomo', 'custom'];
const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 3650; // 10 years
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 1000;
const MIN_FLUSH_INTERVAL_MS = 1000;
const MAX_FLUSH_INTERVAL_MS = 60000;
const MIN_EVENT_NAME_LENGTH = 1;
const MAX_EVENT_NAME_LENGTH_LIMIT = 500;
const MIN_PROPERTY_COUNT = 0;
const MAX_PROPERTY_COUNT_LIMIT = 100;
const MIN_PROPERTY_LENGTH = 0;
const MAX_PROPERTY_LENGTH_LIMIT = 2000;
const MIN_SAMPLE_RATE = 0;
const MAX_SAMPLE_RATE = 1;
const MAX_SITE_ID_LENGTH = 100;

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
 * Validate analytics provider
 * @param {string} provider - Analytics provider
 * @param {boolean} enabled - Whether analytics is enabled
 * @returns {string} Validated provider
 */
function validateProvider(provider, enabled) {
    if (!provider || typeof provider !== 'string') {
        return enabled ? DEFAULT_ANALYTICS_PROVIDER : 'none';
    }
    
    const normalized = provider.trim().toLowerCase();
    
    if (!VALID_PROVIDERS.includes(normalized)) {
        throw new Error(`ANALYTICS_PROVIDER must be one of: ${VALID_PROVIDERS.join(', ')}`);
    }
    
    // If analytics is disabled, force provider to 'none'
    if (!enabled) {
        return 'none';
    }
    
    return normalized;
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
    
    // Check for credentials in URL
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
        
        // Rebuild URL without trailing slash
        let normalized = parsed.toString();
        normalized = normalized.replace(/\/+$/, '');
        return normalized;
    } catch {
        throw new Error(`Invalid ${name}: ${trimmed}`);
    }
}

/**
 * Validate site ID
 * @param {string} siteId - Site ID
 * @param {string} provider - Analytics provider
 * @param {boolean} enabled - Whether analytics is enabled
 * @returns {string} Validated site ID
 */
function validateSiteId(siteId, provider, enabled) {
    if (provider === 'none' || !enabled) {
        return '';
    }
    
    // Only require site ID for certain external providers
    const requiresSiteId = ['plausible', 'matomo', 'custom'].includes(provider);
    
    if (!siteId || typeof siteId !== 'string') {
        if (requiresSiteId) {
            throw new Error(`ANALYTICS_SITE_ID is required for provider: ${provider}`);
        }
        return '';
    }
    
    const trimmed = siteId.trim();
    
    if (trimmed.length === 0) {
        if (requiresSiteId) {
            throw new Error(`ANALYTICS_SITE_ID cannot be empty for provider: ${provider}`);
        }
        return '';
    }
    
    // Check for null bytes
    if (trimmed.includes('\x00')) {
        throw new Error('ANALYTICS_SITE_ID contains null bytes');
    }
    
    // Check for control characters
    if (/[\x01-\x1F\x7F]/.test(trimmed)) {
        throw new Error('ANALYTICS_SITE_ID contains invalid control characters');
    }
    
    // Check for CR/LF
    if (trimmed.includes('\n') || trimmed.includes('\r')) {
        throw new Error('ANALYTICS_SITE_ID contains invalid newline characters');
    }
    
    if (trimmed.length > MAX_SITE_ID_LENGTH) {
        throw new Error(`ANALYTICS_SITE_ID exceeds maximum length of ${MAX_SITE_ID_LENGTH}`);
    }
    
    // Only allow safe characters
    if (!/^[a-zA-Z0-9\-_]+$/.test(trimmed)) {
        throw new Error('ANALYTICS_SITE_ID contains invalid characters');
    }
    
    return trimmed;
}

// ----------------------------------------------------------------------------
// 3. CONFIGURATION LOADER
// ----------------------------------------------------------------------------

/**
 * Load analytics configuration from environment variables
 * @param {string} nodeEnv - Current Node environment
 * @returns {Object} Immutable analytics configuration
 */
function loadAnalyticsConfig(nodeEnv = 'development') {
    const isProduction = nodeEnv === 'production';
    
    // Parse enabled flag
    const enabled = parseBoolean(process.env.ANALYTICS_ENABLED, DEFAULT_ANALYTICS_ENABLED);
    
    // Parse provider
    const provider = validateProvider(process.env.ANALYTICS_PROVIDER, enabled);
    
    // Parse tracking flags
    const trackPageviews = parseBoolean(process.env.ANALYTICS_TRACK_PAGEVIEWS, DEFAULT_ANALYTICS_TRACK_PAGEVIEWS);
    const trackEvents = parseBoolean(process.env.ANALYTICS_TRACK_EVENTS, DEFAULT_ANALYTICS_TRACK_EVENTS);
    const trackSessions = parseBoolean(process.env.ANALYTICS_TRACK_SESSIONS, DEFAULT_ANALYTICS_TRACK_SESSIONS);
    
    // Parse privacy flags
    const anonymous = parseBoolean(process.env.ANALYTICS_ANONYMOUS, DEFAULT_ANALYTICS_ANONYMOUS);
    const respectDnt = parseBoolean(process.env.ANALYTICS_RESPECT_DNT, DEFAULT_ANALYTICS_RESPECT_DNT);
    
    // Parse retention
    let retentionDays;
    if (enabled && provider !== 'none') {
        retentionDays = parsePositiveInteger(
            process.env.ANALYTICS_RETENTION_DAYS,
            DEFAULT_ANALYTICS_RETENTION_DAYS,
            MIN_RETENTION_DAYS,
            MAX_RETENTION_DAYS
        );
    } else {
        retentionDays = DEFAULT_ANALYTICS_RETENTION_DAYS;
    }
    
    // Parse batching
    let batchSize, flushIntervalMs;
    if (enabled && provider !== 'none') {
        batchSize = parsePositiveInteger(
            process.env.ANALYTICS_BATCH_SIZE,
            DEFAULT_ANALYTICS_BATCH_SIZE,
            MIN_BATCH_SIZE,
            MAX_BATCH_SIZE
        );
        
        flushIntervalMs = parsePositiveInteger(
            process.env.ANALYTICS_FLUSH_INTERVAL_MS,
            DEFAULT_ANALYTICS_FLUSH_INTERVAL_MS,
            MIN_FLUSH_INTERVAL_MS,
            MAX_FLUSH_INTERVAL_MS
        );
    } else {
        batchSize = DEFAULT_ANALYTICS_BATCH_SIZE;
        flushIntervalMs = DEFAULT_ANALYTICS_FLUSH_INTERVAL_MS;
    }
    
    // Parse event limits
    let maxEventNameLength, maxPropertyCount, maxPropertyLength;
    if (enabled && provider !== 'none') {
        maxEventNameLength = parsePositiveInteger(
            process.env.ANALYTICS_MAX_EVENT_NAME_LENGTH,
            DEFAULT_ANALYTICS_MAX_EVENT_NAME_LENGTH,
            MIN_EVENT_NAME_LENGTH,
            MAX_EVENT_NAME_LENGTH_LIMIT
        );
        
        maxPropertyCount = parsePositiveInteger(
            process.env.ANALYTICS_MAX_PROPERTY_COUNT,
            DEFAULT_ANALYTICS_MAX_PROPERTY_COUNT,
            MIN_PROPERTY_COUNT,
            MAX_PROPERTY_COUNT_LIMIT
        );
        
        maxPropertyLength = parsePositiveInteger(
            process.env.ANALYTICS_MAX_PROPERTY_LENGTH,
            DEFAULT_ANALYTICS_MAX_PROPERTY_LENGTH,
            MIN_PROPERTY_LENGTH,
            MAX_PROPERTY_LENGTH_LIMIT
        );
    } else {
        maxEventNameLength = DEFAULT_ANALYTICS_MAX_EVENT_NAME_LENGTH;
        maxPropertyCount = DEFAULT_ANALYTICS_MAX_PROPERTY_COUNT;
        maxPropertyLength = DEFAULT_ANALYTICS_MAX_PROPERTY_LENGTH;
    }
    
    // Parse sample rate
    let sampleRate;
    if (enabled && provider !== 'none') {
        sampleRate = parseSampleRate(process.env.ANALYTICS_SAMPLE_RATE, DEFAULT_ANALYTICS_SAMPLE_RATE);
    } else {
        sampleRate = DEFAULT_ANALYTICS_SAMPLE_RATE;
    }
    
    // Parse external URL
    const externalUrl = validateUrl(
        process.env.ANALYTICS_EXTERNAL_URL,
        true,
        'ANALYTICS_EXTERNAL_URL'
    );
    
    // Parse site ID
    const siteId = validateSiteId(process.env.ANALYTICS_SITE_ID, provider, enabled);
    
    // Build privacy config
    const privacy = {
        anonymous: anonymous,
        respectDnt: respectDnt,
        rawIpCollection: false,
        rawUserAgentCollection: false,
    };
    
    // Build tracking config
    const tracking = {
        pageviews: trackPageviews && enabled && provider !== 'none',
        events: trackEvents && enabled && provider !== 'none',
        sessions: trackSessions && enabled && provider !== 'none',
    };
    
    // Build full config
    const config = {
        enabled,
        provider,
        isProduction,
        tracking,
        privacy,
        retentionDays,
        batchSize,
        flushIntervalMs,
        limits: {
            maxEventNameLength,
            maxPropertyCount,
            maxPropertyLength,
        },
        sampleRate,
        external: {
            url: externalUrl,
            siteId,
            hasExternalConfig: externalUrl.length > 0 || siteId.length > 0,
        },
        isConfigured: enabled && provider !== 'none',
    };
    
    return Object.freeze(config);
}

// ----------------------------------------------------------------------------
// 4. SINGLETON CONFIGURATION
// ----------------------------------------------------------------------------

let _config = null;

/**
 * Get the analytics configuration (singleton)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Immutable analytics configuration
 */
function getAnalyticsConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    if (_config === null) {
        _config = loadAnalyticsConfig(nodeEnv);
    }
    return _config;
}

/**
 * Get safe analytics configuration (for logging/diagnostics)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Safe analytics configuration
 */
function getSafeAnalyticsConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    const config = getAnalyticsConfig(nodeEnv);
    
    const safe = {
        enabled: config.enabled,
        provider: config.provider,
        isProduction: config.isProduction,
        tracking: {
            pageviews: config.tracking.pageviews,
            events: config.tracking.events,
            sessions: config.tracking.sessions,
        },
        privacy: {
            anonymous: config.privacy.anonymous,
            respectDnt: config.privacy.respectDnt,
            rawIpCollection: config.privacy.rawIpCollection,
            rawUserAgentCollection: config.privacy.rawUserAgentCollection,
        },
        retentionDays: config.retentionDays,
        batchSize: config.batchSize,
        flushIntervalMs: config.flushIntervalMs,
        limits: {
            maxEventNameLength: config.limits.maxEventNameLength,
            maxPropertyCount: config.limits.maxPropertyCount,
            maxPropertyLength: config.limits.maxPropertyLength,
        },
        sampleRate: config.sampleRate,
        hasExternalConfig: config.external.hasExternalConfig,
        isConfigured: config.isConfigured,
    };
    
    return Object.freeze(safe);
}

/**
 * Validate analytics configuration
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Validation result
 */
function validateAnalyticsConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    try {
        const config = getAnalyticsConfig(nodeEnv);
        const errors = [];
        const warnings = [];
        
        // Validate provider-specific requirements
        if (config.provider === 'plausible' || config.provider === 'matomo' || config.provider === 'custom') {
            if (!config.external.hasExternalConfig) {
                errors.push(`External provider ${config.provider} requires ANALYTICS_EXTERNAL_URL or ANALYTICS_SITE_ID`);
            }
            
            if (config.provider === 'plausible' && !config.external.siteId) {
                errors.push('ANALYTICS_SITE_ID is required for Plausible provider');
            }
            
            if (config.provider === 'matomo' && !config.external.siteId) {
                errors.push('ANALYTICS_SITE_ID is required for Matomo provider');
            }
        }
        
        // Validate privacy settings in production
        if (config.isProduction) {
            if (!config.privacy.anonymous) {
                warnings.push('ANALYTICS_ANONYMOUS is false in production - may collect personal data');
            }
            
            if (config.retentionDays > 730) {
                warnings.push(`ANALYTICS_RETENTION_DAYS (${config.retentionDays}) exceeds 2 years - consider shorter retention`);
            }
        }
        
        // Validate batch configuration
        if (config.batchSize > 100) {
            warnings.push(`ANALYTICS_BATCH_SIZE (${config.batchSize}) is large - may impact performance`);
        }
        
        // Validate sample rate
        if (config.sampleRate < 0.1 && config.sampleRate > 0) {
            warnings.push(`ANALYTICS_SAMPLE_RATE (${config.sampleRate}) is very low - may affect data accuracy`);
        }
        
        // Check if analytics is disabled but tracking is enabled
        if (!config.enabled && (config.tracking.pageviews || config.tracking.events || config.tracking.sessions)) {
            warnings.push('Analytics is disabled but tracking flags are enabled - no data will be collected');
        }
        
        // Check provider is none but analytics is enabled
        if (config.enabled && config.provider === 'none') {
            warnings.push('Analytics is enabled but provider is "none" - no data will be collected');
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            config: getSafeAnalyticsConfig(nodeEnv),
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
    getAnalyticsConfig,
    getSafeAnalyticsConfig,
    validateAnalyticsConfig,
    loadAnalyticsConfig,
    parseBoolean,
    VALID_PROVIDERS,
    DEFAULT_ANALYTICS_ENABLED,
    DEFAULT_ANALYTICS_PROVIDER,
};

export default {
    getAnalyticsConfig,
    getSafeAnalyticsConfig,
    validateAnalyticsConfig,
    loadAnalyticsConfig,
    parseBoolean,
    VALID_PROVIDERS,
    DEFAULT_ANALYTICS_ENABLED,
    DEFAULT_ANALYTICS_PROVIDER,
};