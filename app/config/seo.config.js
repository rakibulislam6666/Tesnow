/**
 * app/config/seo.config.js
 * Centralized SEO configuration for Tesnow
 * Provides secure, validated configuration for SEO metadata, social sharing, robots, and sitemaps
 * 
 * @module config/seo.config
 */

// ----------------------------------------------------------------------------
// 1. CONSTANTS & DEFAULTS
// ----------------------------------------------------------------------------

const DEFAULT_SEO_ENABLED = true;
const DEFAULT_SEO_SITE_NAME = 'Tesnow';
const DEFAULT_SEO_SITE_URL = 'http://localhost:3000';
const DEFAULT_SEO_DEFAULT_TITLE = 'Tesnow';
const DEFAULT_SEO_TITLE_SUFFIX = ' | Tesnow';
const DEFAULT_SEO_DEFAULT_DESCRIPTION = '';
const DEFAULT_SEO_DEFAULT_KEYWORDS = '';
const DEFAULT_SEO_DEFAULT_OG_IMAGE = '';
const DEFAULT_SEO_DEFAULT_OG_TYPE = 'website';
const DEFAULT_SEO_TWITTER_CARD = 'summary_large_image';
const DEFAULT_SEO_TWITTER_SITE = '';
const DEFAULT_SEO_ROBOTS_INDEX = true;
const DEFAULT_SEO_ROBOTS_FOLLOW = true;
const DEFAULT_SEO_CANONICAL_ENABLED = true;
const DEFAULT_SEO_SITEMAP_ENABLED = true;
const DEFAULT_SEO_SITEMAP_PATH = '/sitemap.xml';
const DEFAULT_SEO_ROBOTS_PATH = '/robots.txt';
const DEFAULT_SEO_MAX_TITLE_LENGTH = 60;
const DEFAULT_SEO_MAX_DESCRIPTION_LENGTH = 160;
const DEFAULT_SEO_LOCALE = 'en_US';
const DEFAULT_SEO_THEME_COLOR = '';

const VALID_OG_TYPES = ['website', 'article'];
const VALID_TWITTER_CARDS = ['summary', 'summary_large_image'];
const MIN_LENGTH = 1;
const MAX_SITE_NAME_LENGTH = 100;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_KEYWORDS_LENGTH = 500;
const MAX_TWITTER_HANDLE_LENGTH = 50;
const MAX_LOCALE_LENGTH = 10;
const MIN_TITLE_LENGTH = 1;
const MIN_DESCRIPTION_LENGTH = 0;

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
 * Validate a safe string
 * @param {string} value - String to validate
 * @param {string} defaultValue - Default if empty
 * @param {number} maxLength - Maximum allowed length
 * @param {string} name - Name for error messages
 * @param {boolean} allowEmpty - Whether empty string is allowed
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
 * Validate a required safe string
 * @param {string} value - String to validate
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
 * Validate URL
 * @param {string} url - URL to validate
 * @param {boolean} allowEmpty - Whether empty URL is allowed
 * @param {string} name - Name for error messages
 * @param {string} defaultValue - Default if empty and allowed
 * @returns {string} Validated URL
 */
function validateUrl(url, allowEmpty, name, defaultValue = '') {
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
        // Check if it's a credential-bearing URL
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
 * Validate OG type
 * @param {string} type - OG type
 * @param {string} defaultValue - Default type
 * @returns {string} Validated OG type
 */
function validateOgType(type, defaultValue) {
    if (!type || typeof type !== 'string') {
        return defaultValue;
    }
    
    const trimmed = type.trim().toLowerCase();
    
    if (!VALID_OG_TYPES.includes(trimmed)) {
        throw new Error(`OG type must be one of: ${VALID_OG_TYPES.join(', ')}`);
    }
    
    return trimmed;
}

/**
 * Validate Twitter card type
 * @param {string} card - Twitter card type
 * @param {string} defaultValue - Default card type
 * @returns {string} Validated card type
 */
function validateTwitterCard(card, defaultValue) {
    if (!card || typeof card !== 'string') {
        return defaultValue;
    }
    
    const trimmed = card.trim().toLowerCase();
    
    if (!VALID_TWITTER_CARDS.includes(trimmed)) {
        throw new Error(`Twitter card must be one of: ${VALID_TWITTER_CARDS.join(', ')}`);
    }
    
    return trimmed;
}

/**
 * Validate social handle
 * @param {string} handle - Social handle
 * @param {number} maxLength - Maximum handle length
 * @param {string} name - Name for error messages
 * @returns {string} Validated handle
 */
function validateSocialHandle(handle, maxLength, name) {
    if (!handle || typeof handle !== 'string') {
        return '';
    }
    
    const trimmed = handle.trim();
    
    if (trimmed.length === 0) {
        return '';
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
    
    // Allow alphanumeric, underscore, and @ symbol (without space)
    if (!/^@?[a-zA-Z0-9_]+$/.test(trimmed)) {
        throw new Error(`${name} contains invalid characters`);
    }
    
    return trimmed;
}

/**
 * Validate path
 * @param {string} path - Path to validate
 * @param {string} defaultValue - Default path
 * @param {string} name - Name for error messages
 * @returns {string} Validated path
 */
function validatePath(path, defaultValue, name) {
    if (!path || typeof path !== 'string') {
        return defaultValue;
    }
    
    const trimmed = path.trim();
    
    if (trimmed.length === 0) {
        return defaultValue;
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
    
    // Must start with /
    if (!trimmed.startsWith('/')) {
        throw new Error(`${name} must start with /`);
    }
    
    // Prevent path traversal
    if (trimmed.includes('..')) {
        throw new Error(`${name} contains path traversal sequences`);
    }
    
    // No query strings or fragments
    if (trimmed.includes('?') || trimmed.includes('#')) {
        throw new Error(`${name} cannot contain query strings or fragments`);
    }
    
    // Only allow safe characters
    if (!/^\/[a-zA-Z0-9\-_./]*$/.test(trimmed)) {
        throw new Error(`${name} contains invalid characters`);
    }
    
    return trimmed;
}

/**
 * Validate locale
 * @param {string} locale - Locale string
 * @param {string} defaultValue - Default locale
 * @returns {string} Validated locale
 */
function validateLocale(locale, defaultValue) {
    if (!locale || typeof locale !== 'string') {
        return defaultValue;
    }
    
    const trimmed = locale.trim();
    
    if (trimmed.length === 0) {
        return defaultValue;
    }
    
    // Check for null bytes
    if (trimmed.includes('\x00')) {
        throw new Error('SEO_LOCALE contains null bytes');
    }
    
    // Check for control characters
    if (/[\x01-\x1F\x7F]/.test(trimmed)) {
        throw new Error('SEO_LOCALE contains invalid control characters');
    }
    
    // Check for CR/LF
    if (trimmed.includes('\n') || trimmed.includes('\r')) {
        throw new Error('SEO_LOCALE contains invalid newline characters');
    }
    
    if (trimmed.length > MAX_LOCALE_LENGTH) {
        throw new Error(`SEO_LOCALE exceeds maximum length of ${MAX_LOCALE_LENGTH}`);
    }
    
    // Allow format like en_US, en-US, fr_FR
    if (!/^[a-zA-Z]{2}[_\-][a-zA-Z]{2}$/.test(trimmed)) {
        throw new Error('SEO_LOCALE must be in format like en_US, en-US');
    }
    
    return trimmed;
}

/**
 * Validate theme color
 * @param {string} color - Theme color
 * @returns {string} Validated theme color or empty string
 */
function validateThemeColor(color) {
    if (!color || typeof color !== 'string') {
        return '';
    }
    
    const trimmed = color.trim();
    
    if (trimmed.length === 0) {
        return '';
    }
    
    // Check for null bytes
    if (trimmed.includes('\x00')) {
        throw new Error('SEO_THEME_COLOR contains null bytes');
    }
    
    // Check for control characters
    if (/[\x01-\x1F\x7F]/.test(trimmed)) {
        throw new Error('SEO_THEME_COLOR contains invalid control characters');
    }
    
    // Check for CR/LF
    if (trimmed.includes('\n') || trimmed.includes('\r')) {
        throw new Error('SEO_THEME_COLOR contains invalid newline characters');
    }
    
    // Prevent CSS injection
    if (trimmed.includes(';') || trimmed.includes('{') || trimmed.includes('}') || trimmed.includes('(') || trimmed.includes(')')) {
        throw new Error('SEO_THEME_COLOR contains invalid CSS injection characters');
    }
    
    // Validate hex color format with optional # prefix
    if (!/^#?[0-9a-fA-F]{3,8}$/.test(trimmed)) {
        throw new Error('SEO_THEME_COLOR must be a valid hex color');
    }
    
    return trimmed;
}

// ----------------------------------------------------------------------------
// 3. CONFIGURATION LOADER
// ----------------------------------------------------------------------------

/**
 * Load SEO configuration from environment variables
 * @param {string} nodeEnv - Current Node environment
 * @returns {Object} Immutable SEO configuration
 */
function loadSeoConfig(nodeEnv = 'development') {
    const isProduction = nodeEnv === 'production';
    
    // Parse enabled flag
    const enabled = parseBoolean(process.env.SEO_ENABLED, DEFAULT_SEO_ENABLED);
    
    // Parse site name and URL
    const siteName = validateRequiredString(
        process.env.SEO_SITE_NAME,
        DEFAULT_SEO_SITE_NAME,
        MAX_SITE_NAME_LENGTH,
        'SEO_SITE_NAME'
    );
    
    const siteUrl = validateUrl(
        process.env.SEO_SITE_URL,
        false,
        'SEO_SITE_URL',
        DEFAULT_SEO_SITE_URL
    );
    
    // Parse titles
    const defaultTitle = validateRequiredString(
        process.env.SEO_DEFAULT_TITLE,
        DEFAULT_SEO_DEFAULT_TITLE,
        MAX_TITLE_LENGTH,
        'SEO_DEFAULT_TITLE'
    );
    
    const titleSuffix = validateSafeString(
        process.env.SEO_TITLE_SUFFIX,
        DEFAULT_SEO_TITLE_SUFFIX,
        MAX_TITLE_LENGTH,
        'SEO_TITLE_SUFFIX',
        true
    );
    
    const maxTitleLength = parsePositiveInteger(
        process.env.SEO_MAX_TITLE_LENGTH,
        DEFAULT_SEO_MAX_TITLE_LENGTH,
        MIN_TITLE_LENGTH,
        MAX_TITLE_LENGTH
    );
    
    // Parse description
    const defaultDescription = validateSafeString(
        process.env.SEO_DEFAULT_DESCRIPTION,
        DEFAULT_SEO_DEFAULT_DESCRIPTION,
        MAX_DESCRIPTION_LENGTH,
        'SEO_DEFAULT_DESCRIPTION',
        true
    );
    
    const maxDescriptionLength = parsePositiveInteger(
        process.env.SEO_MAX_DESCRIPTION_LENGTH,
        DEFAULT_SEO_MAX_DESCRIPTION_LENGTH,
        MIN_DESCRIPTION_LENGTH,
        MAX_DESCRIPTION_LENGTH
    );
    
    // Parse keywords
    const defaultKeywords = validateSafeString(
        process.env.SEO_DEFAULT_KEYWORDS,
        DEFAULT_SEO_DEFAULT_KEYWORDS,
        MAX_KEYWORDS_LENGTH,
        'SEO_DEFAULT_KEYWORDS',
        true
    );
    
    // Parse OG
    const defaultOgImage = validateUrl(
        process.env.SEO_DEFAULT_OG_IMAGE,
        true,
        'SEO_DEFAULT_OG_IMAGE'
    );
    
    const defaultOgType = validateOgType(
        process.env.SEO_DEFAULT_OG_TYPE,
        DEFAULT_SEO_DEFAULT_OG_TYPE
    );
    
    // Parse Twitter
    const twitterCard = validateTwitterCard(
        process.env.SEO_TWITTER_CARD,
        DEFAULT_SEO_TWITTER_CARD
    );
    
    const twitterSite = validateSocialHandle(
        process.env.SEO_TWITTER_SITE,
        MAX_TWITTER_HANDLE_LENGTH,
        'SEO_TWITTER_SITE'
    );
    
    // Parse robots
    const robotsIndex = parseBoolean(process.env.SEO_ROBOTS_INDEX, DEFAULT_SEO_ROBOTS_INDEX);
    const robotsFollow = parseBoolean(process.env.SEO_ROBOTS_FOLLOW, DEFAULT_SEO_ROBOTS_FOLLOW);
    
    // Build robots directive
    let robotsDirective = '';
    if (robotsIndex && robotsFollow) robotsDirective = 'index,follow';
    else if (robotsIndex && !robotsFollow) robotsDirective = 'index,nofollow';
    else if (!robotsIndex && robotsFollow) robotsDirective = 'noindex,follow';
    else robotsDirective = 'noindex,nofollow';
    
    // Parse canonical
    const canonicalEnabled = parseBoolean(process.env.SEO_CANONICAL_ENABLED, DEFAULT_SEO_CANONICAL_ENABLED);
    
    // Parse sitemap
    const sitemapEnabled = parseBoolean(process.env.SEO_SITEMAP_ENABLED, DEFAULT_SEO_SITEMAP_ENABLED);
    const sitemapPath = validatePath(
        process.env.SEO_SITEMAP_PATH,
        DEFAULT_SEO_SITEMAP_PATH,
        'SEO_SITEMAP_PATH'
    );
    
    // Parse robots path
    const robotsPath = validatePath(
        process.env.SEO_ROBOTS_PATH,
        DEFAULT_SEO_ROBOTS_PATH,
        'SEO_ROBOTS_PATH'
    );
    
    // Parse locale
    const locale = validateLocale(process.env.SEO_LOCALE, DEFAULT_SEO_LOCALE);
    
    // Parse theme color
    const themeColor = validateThemeColor(process.env.SEO_THEME_COLOR);
    
    // Build full config
    const config = {
        enabled,
        siteName,
        siteUrl,
        isProduction,
        defaultTitle,
        titleSuffix,
        maxTitleLength,
        defaultDescription,
        maxDescriptionLength,
        defaultKeywords,
        defaultOgImage,
        defaultOgType,
        twitterCard,
        twitterSite,
        robots: {
            index: robotsIndex,
            follow: robotsFollow,
            directive: robotsDirective,
        },
        canonicalEnabled,
        sitemap: {
            enabled: sitemapEnabled,
            path: sitemapPath,
        },
        robotsPath,
        locale,
        themeColor,
    };
    
    return Object.freeze(config);
}

// ----------------------------------------------------------------------------
// 4. SINGLETON CONFIGURATION
// ----------------------------------------------------------------------------

let _config = null;

/**
 * Get the SEO configuration (singleton)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Immutable SEO configuration
 */
function getSeoConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    if (_config === null) {
        _config = loadSeoConfig(nodeEnv);
    }
    return _config;
}

/**
 * Get safe SEO configuration (for logging/diagnostics)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Safe SEO configuration
 */
function getSafeSeoConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    const config = getSeoConfig(nodeEnv);
    
    const safe = {
        enabled: config.enabled,
        siteName: config.siteName,
        siteUrl: config.siteUrl,
        isProduction: config.isProduction,
        defaultTitle: config.defaultTitle,
        titleSuffix: config.titleSuffix,
        maxTitleLength: config.maxTitleLength,
        defaultDescription: config.defaultDescription || '(empty)',
        maxDescriptionLength: config.maxDescriptionLength,
        defaultKeywords: config.defaultKeywords || '(empty)',
        defaultOgImage: config.defaultOgImage || '(empty)',
        defaultOgType: config.defaultOgType,
        twitterCard: config.twitterCard,
        twitterSite: config.twitterSite || '(empty)',
        robots: {
            index: config.robots.index,
            follow: config.robots.follow,
            directive: config.robots.directive,
        },
        canonicalEnabled: config.canonicalEnabled,
        sitemap: {
            enabled: config.sitemap.enabled,
            path: config.sitemap.path,
        },
        robotsPath: config.robotsPath,
        locale: config.locale,
        themeColor: config.themeColor || '(not set)',
    };
    
    return Object.freeze(safe);
}

/**
 * Validate SEO configuration
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Validation result
 */
function validateSeoConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    try {
        const config = getSeoConfig(nodeEnv);
        const errors = [];
        const warnings = [];
        
        // Validate site URL in production
        if (config.isProduction && config.siteUrl.startsWith('http://')) {
            warnings.push('SEO_SITE_URL uses HTTP in production - consider using HTTPS');
        }
        
        // Validate title length
        if (config.maxTitleLength < 30) {
            warnings.push(`SEO_MAX_TITLE_LENGTH (${config.maxTitleLength}) is low for SEO`);
        }
        
        if (config.maxTitleLength > 80) {
            warnings.push(`SEO_MAX_TITLE_LENGTH (${config.maxTitleLength}) exceeds recommended 60 characters`);
        }
        
        // Validate description length
        if (config.maxDescriptionLength > 200) {
            warnings.push(`SEO_MAX_DESCRIPTION_LENGTH (${config.maxDescriptionLength}) exceeds recommended 160 characters`);
        }
        
        // Validate OG image URL in production
        if (config.isProduction && config.defaultOgImage && !config.defaultOgImage.startsWith('https://')) {
            warnings.push('SEO_DEFAULT_OG_IMAGE uses HTTP in production - consider using HTTPS');
        }
        
        // Check if sitemap is enabled but no path configured
        if (config.sitemap.enabled && !config.sitemap.path) {
            errors.push('Sitemap is enabled but path is empty');
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            config: getSafeSeoConfig(nodeEnv),
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
    getSeoConfig,
    getSafeSeoConfig,
    validateSeoConfig,
    loadSeoConfig,
    parseBoolean,
    DEFAULT_SEO_SITE_NAME,
    DEFAULT_SEO_SITE_URL,
};

export default {
    getSeoConfig,
    getSafeSeoConfig,
    validateSeoConfig,
    loadSeoConfig,
    parseBoolean,
    DEFAULT_SEO_SITE_NAME,
    DEFAULT_SEO_SITE_URL,
};