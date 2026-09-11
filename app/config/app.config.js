/**
 * app/config/app.config.js
 * Centralized application configuration for Tesnow
 * Manages non-secret application settings with validation and immutability
 * 
 * @module config/app.config
 */

// ----------------------------------------------------------------------------
// 1. CONSTANTS & DEFAULTS
// ----------------------------------------------------------------------------

const DEFAULT_APP_NAME = 'Tesnow';
const DEFAULT_APP_URL = 'http://localhost:3000';
const DEFAULT_SITE_NAME = 'Tesnow';
const DEFAULT_SITE_URL = 'http://localhost:3000';
const DEFAULT_PORT = 3000;
const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_TRUST_PROXY = false;
const DEFAULT_API_PREFIX = '/api';
const DEFAULT_API_VERSION = 'v1';
const DEFAULT_NODE_ENV = 'development';

const VALID_ENVIRONMENTS = ['development', 'test', 'production'];

// ----------------------------------------------------------------------------
// 2. VALIDATION HELPERS
// ----------------------------------------------------------------------------

/**
 * Validate and parse NODE_ENV
 * @param {string} value - Environment value
 * @returns {string} Validated environment
 */
function validateEnvironment(value) {
    if (typeof value !== 'string' || value.trim() === '') {
        return DEFAULT_NODE_ENV;
    }
    
    const normalized = value.trim().toLowerCase();
    
    if (VALID_ENVIRONMENTS.includes(normalized)) {
        return normalized;
    }
    
    return DEFAULT_NODE_ENV;
}

/**
 * Validate and parse PORT
 * @param {string|number} value - Port value
 * @returns {number} Validated port
 */
function validatePort(value) {
    if (value === null || value === undefined || value === '') {
        return DEFAULT_PORT;
    }
    
    const num = typeof value === 'string' ? parseInt(value, 10) : value;
    
    if (typeof num !== 'number' || !Number.isFinite(num)) {
        return DEFAULT_PORT;
    }
    
    if (!Number.isInteger(num)) {
        return DEFAULT_PORT;
    }
    
    if (num < 1 || num > 65535) {
        throw new Error(`Invalid PORT: ${num}. Must be between 1 and 65535.`);
    }
    
    return num;
}

/**
 * Validate and parse HOST
 * @param {string} value - Host value
 * @returns {string} Validated host
 */
function validateHost(value) {
    if (typeof value !== 'string' || value.trim() === '') {
        return DEFAULT_HOST;
    }
    
    return value.trim();
}

/**
 * Validate and parse TRUST_PROXY
 * @param {string|boolean} value - Trust proxy value
 * @returns {boolean} Validated trust proxy
 */
function validateTrustProxy(value) {
    if (value === null || value === undefined || value === '') {
        return DEFAULT_TRUST_PROXY;
    }
    
    if (typeof value === 'boolean') {
        return value;
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
    
    if (typeof value === 'number') {
        return value !== 0;
    }
    
    return DEFAULT_TRUST_PROXY;
}

/**
 * Validate and normalize a URL
 * @param {string} value - URL value
 * @param {string} defaultValue - Default URL
 * @param {string} name - Name for error messages
 * @returns {string} Normalized URL
 */
function validateUrl(value, defaultValue, name) {
    if (typeof value !== 'string' || value.trim() === '') {
        return defaultValue;
    }
    
    let trimmed = value.trim();
    
    // Remove trailing slash
    trimmed = trimmed.replace(/\/+$/, '');
    
    // Validate URL format
    try {
        const url = new URL(trimmed);
        
        // Only allow HTTP/HTTPS
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new Error(`${name} must use HTTP or HTTPS protocol`);
        }
        
        // Reconstruct without trailing slash
        return url.toString().replace(/\/+$/, '');
    } catch (error) {
        throw new Error(`Invalid ${name}: ${trimmed}. ${error.message}`);
    }
}

/**
 * Validate and normalize API prefix
 * @param {string} value - API prefix value
 * @returns {string} Normalized API prefix
 */
function validateApiPrefix(value) {
    if (typeof value !== 'string' || value.trim() === '') {
        return DEFAULT_API_PREFIX;
    }
    
    let normalized = value.trim();
    
    // Must start with /
    if (!normalized.startsWith('/')) {
        normalized = '/' + normalized;
    }
    
    // Remove trailing slash
    normalized = normalized.replace(/\/+$/, '');
    
    // Prevent path traversal
    if (normalized.includes('..')) {
        throw new Error(`Invalid API_PREFIX: ${value}. Path traversal not allowed.`);
    }
    
    // Only allow safe characters
    if (!/^\/[a-zA-Z0-9\-_/]*$/.test(normalized)) {
        throw new Error(`Invalid API_PREFIX: ${value}. Only alphanumeric, hyphen, underscore, and slash allowed.`);
    }
    
    return normalized;
}

/**
 * Validate and normalize API version
 * @param {string} value - API version value
 * @returns {string} Normalized API version
 */
function validateApiVersion(value) {
    if (typeof value !== 'string' || value.trim() === '') {
        return DEFAULT_API_VERSION;
    }
    
    let normalized = value.trim();
    
    // Remove leading 'v' for consistency
    if (normalized.startsWith('v')) {
        normalized = normalized.substring(1);
    }
    
    // Only allow safe characters
    if (!/^[a-zA-Z0-9._-]+$/.test(normalized)) {
        throw new Error(`Invalid API_VERSION: ${value}. Only alphanumeric, dot, underscore, and hyphen allowed.`);
    }
    
    // Add 'v' prefix
    return 'v' + normalized;
}

/**
 * Validate application name
 * @param {string} value - App name value
 * @param {string} defaultValue - Default name
 * @returns {string} Validated name
 */
function validateAppName(value, defaultValue) {
    if (typeof value !== 'string' || value.trim() === '') {
        return defaultValue;
    }
    
    const trimmed = value.trim();
    
    // Sanitize: remove control characters
    const sanitized = trimmed.replace(/[\x00-\x1F\x7F]/g, '');
    
    if (sanitized.length === 0) {
        return defaultValue;
    }
    
    return sanitized;
}

// ----------------------------------------------------------------------------
// 3. CONFIGURATION LOADING
// ----------------------------------------------------------------------------

/**
 * Load and validate application configuration from environment variables
 * @returns {Object} Immutable configuration object
 */
function loadAppConfig() {
    // Read environment variables
    const env = process.env.NODE_ENV || DEFAULT_NODE_ENV;
    const appName = process.env.APP_NAME || DEFAULT_APP_NAME;
    const appUrl = process.env.APP_URL || DEFAULT_APP_URL;
    const siteName = process.env.SITE_NAME || DEFAULT_SITE_NAME;
    const siteUrl = process.env.SITE_URL || DEFAULT_SITE_URL;
    const port = process.env.PORT || DEFAULT_PORT;
    const host = process.env.HOST || DEFAULT_HOST;
    const trustProxy = process.env.TRUST_PROXY || DEFAULT_TRUST_PROXY;
    const apiPrefix = process.env.API_PREFIX || DEFAULT_API_PREFIX;
    const apiVersion = process.env.API_VERSION || DEFAULT_API_VERSION;
    
    // Validate values
    const environment = validateEnvironment(env);
    const validatedAppName = validateAppName(appName, DEFAULT_APP_NAME);
    const validatedAppUrl = validateUrl(appUrl, DEFAULT_APP_URL, 'APP_URL');
    const validatedSiteName = validateAppName(siteName, DEFAULT_SITE_NAME);
    const validatedSiteUrl = validateUrl(siteUrl, DEFAULT_SITE_URL, 'SITE_URL');
    const validatedPort = validatePort(port);
    const validatedHost = validateHost(host);
    const validatedTrustProxy = validateTrustProxy(trustProxy);
    const validatedApiPrefix = validateApiPrefix(apiPrefix);
    const validatedApiVersion = validateApiVersion(apiVersion);
    
    // Build config object
    const config = {
        // Core
        nodeEnv: environment,
        appName: validatedAppName,
        appUrl: validatedAppUrl,
        siteName: validatedSiteName,
        siteUrl: validatedSiteUrl,
        
        // Server
        port: validatedPort,
        host: validatedHost,
        trustProxy: validatedTrustProxy,
        
        // API
        apiPrefix: validatedApiPrefix,
        apiVersion: validatedApiVersion,
        
        // Environment flags
        isDevelopment: environment === 'development',
        isProduction: environment === 'production',
        isTest: environment === 'test',
        
        // Derived
        apiBaseUrl: `${validatedApiPrefix}/${validatedApiVersion}`,
    };
    
    // Freeze to prevent mutation
    return Object.freeze(config);
}

// ----------------------------------------------------------------------------
// 4. SINGLETON CONFIGURATION
// ----------------------------------------------------------------------------

// Lazy-load configuration
let _config = null;

/**
 * Get the application configuration (singleton)
 * @returns {Object} Immutable configuration object
 */
function getAppConfig() {
    if (_config === null) {
        _config = loadAppConfig();
    }
    return _config;
}

/**
 * Get the current environment
 * @returns {string} Environment name (development, test, production)
 */
function getEnvironment() {
    return getAppConfig().nodeEnv;
}

/**
 * Check if environment is development
 * @returns {boolean} True if development
 */
function isDevelopment() {
    return getAppConfig().isDevelopment;
}

/**
 * Check if environment is production
 * @returns {boolean} True if production
 */
function isProduction() {
    return getAppConfig().isProduction;
}

/**
 * Check if environment is test
 * @returns {boolean} True if test
 */
function isTest() {
    return getAppConfig().isTest;
}

/**
 * Get the application URL
 * @returns {string} Application URL
 */
function getAppUrl() {
    return getAppConfig().appUrl;
}

/**
 * Get the site URL
 * @returns {string} Site URL
 */
function getSiteUrl() {
    return getAppConfig().siteUrl;
}

/**
 * Get the normalized API prefix
 * @returns {string} API prefix (e.g., '/api')
 */
function getApiPrefix() {
    return getAppConfig().apiPrefix;
}

/**
 * Get the API version
 * @returns {string} API version (e.g., 'v1')
 */
function getApiVersion() {
    return getAppConfig().apiVersion;
}

/**
 * Get the full API base URL
 * @returns {string} API base URL (e.g., '/api/v1')
 */
function getApiBaseUrl() {
    return getAppConfig().apiBaseUrl;
}

/**
 * Get server configuration
 * @returns {Object} Server config { host, port, trustProxy }
 */
function getServerConfig() {
    const config = getAppConfig();
    return {
        host: config.host,
        port: config.port,
        trustProxy: config.trustProxy,
    };
}

/**
 * Validate application configuration
 * @returns {Object} Validation result
 */
function validateAppConfig() {
    try {
        const config = getAppConfig();
        
        return {
            valid: true,
            errors: [],
            config: {
                nodeEnv: config.nodeEnv,
                appName: config.appName,
                appUrl: config.appUrl,
                siteName: config.siteName,
                siteUrl: config.siteUrl,
                port: config.port,
                host: config.host,
                trustProxy: config.trustProxy,
                apiPrefix: config.apiPrefix,
                apiVersion: config.apiVersion,
                apiBaseUrl: config.apiBaseUrl,
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
    getAppConfig,
    getEnvironment,
    isDevelopment,
    isProduction,
    isTest,
    getAppUrl,
    getSiteUrl,
    getApiPrefix,
    getApiVersion,
    getApiBaseUrl,
    getServerConfig,
    validateAppConfig,
    loadAppConfig,
    VALID_ENVIRONMENTS,
};

// Default export with all public functions
export default {
    getAppConfig,
    getEnvironment,
    isDevelopment,
    isProduction,
    isTest,
    getAppUrl,
    getSiteUrl,
    getApiPrefix,
    getApiVersion,
    getApiBaseUrl,
    getServerConfig,
    validateAppConfig,
    loadAppConfig,
    VALID_ENVIRONMENTS,
};