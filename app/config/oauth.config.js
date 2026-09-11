/**
 * app/config/oauth.config.js
 * Centralized OAuth/social-auth configuration for Tesnow
 * Provides secure, validated configuration for OAuth providers
 * 
 * @module config/oauth.config
 */

// ----------------------------------------------------------------------------
// 1. CONSTANTS & DEFAULTS
// ----------------------------------------------------------------------------

const DEFAULT_OAUTH_ENABLED = false;
const DEFAULT_OAUTH_STATE_TTL_MS = 600000; // 10 minutes
const DEFAULT_OAUTH_NONCE_TTL_MS = 600000; // 10 minutes
const DEFAULT_OAUTH_ALLOW_ACCOUNT_LINKING = false;
const DEFAULT_OAUTH_REQUIRE_EMAIL = true;
const DEFAULT_OAUTH_AUTO_CREATE_USERS = true;

const PROVIDER_NAMES = ['google', 'github', 'facebook', 'microsoft'];
const MIN_TTL_MS = 1000;
const MAX_TTL_MS = 3600000; // 1 hour
const MAX_CLIENT_ID_LENGTH = 255;
const MAX_CLIENT_SECRET_LENGTH = 255;
const MAX_REDIRECT_URI_LENGTH = 500;
const MAX_ALLOWED_ORIGIN_LENGTH = 500;

// Provider default scopes
const PROVIDER_SCOPES = {
    google: 'openid email profile',
    github: 'user:email',
    facebook: 'email public_profile',
    microsoft: 'openid email profile',
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
 * Validate URL
 * @param {string} url - URL to validate
 * @param {boolean} allowEmpty - Whether empty URL is allowed
 * @param {string} name - Name for error messages
 * @param {boolean} requireHttps - Whether HTTPS is required
 * @returns {string} Validated URL
 */
function validateUrl(url, allowEmpty, name, requireHttps = false) {
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

    if (trimmed.length > MAX_REDIRECT_URI_LENGTH) {
        throw new Error(`${name} exceeds maximum length of ${MAX_REDIRECT_URI_LENGTH}`);
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

        if (requireHttps && parsed.protocol === 'http:') {
            throw new Error(`${name} must use HTTPS in production`);
        }

        // Reject fragments
        if (parsed.hash) {
            throw new Error(`${name} cannot contain fragments`);
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
 * Validate client ID
 * @param {string} value - Client ID
 * @param {string} provider - Provider name
 * @param {boolean} enabled - Whether provider is enabled
 * @returns {string} Validated client ID
 */
function validateClientId(value, provider, enabled) {
    if (!enabled) {
        return '';
    }

    if (!value || typeof value !== 'string') {
        throw new Error(`OAUTH_${provider.toUpperCase()}_CLIENT_ID is required when ${provider} is enabled`);
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
        throw new Error(`OAUTH_${provider.toUpperCase()}_CLIENT_ID cannot be empty when ${provider} is enabled`);
    }

    if (trimmed.length > MAX_CLIENT_ID_LENGTH) {
        throw new Error(`OAUTH_${provider.toUpperCase()}_CLIENT_ID exceeds maximum length of ${MAX_CLIENT_ID_LENGTH}`);
    }

    // Check for null bytes
    if (trimmed.includes('\x00')) {
        throw new Error(`OAUTH_${provider.toUpperCase()}_CLIENT_ID contains null bytes`);
    }

    // Check for control characters
    if (/[\x01-\x1F\x7F]/.test(trimmed)) {
        throw new Error(`OAUTH_${provider.toUpperCase()}_CLIENT_ID contains invalid control characters`);
    }

    // Check for CR/LF
    if (trimmed.includes('\n') || trimmed.includes('\r')) {
        throw new Error(`OAUTH_${provider.toUpperCase()}_CLIENT_ID contains invalid newline characters`);
    }

    return trimmed;
}

/**
 * Validate client secret
 * @param {string} value - Client secret
 * @param {string} provider - Provider name
 * @param {boolean} enabled - Whether provider is enabled
 * @returns {Object} Validation result with secret info
 */
function validateClientSecret(value, provider, enabled) {
    if (!enabled) {
        return {
            valid: true,
            hasSecret: false,
            secret: null,
        };
    }

    if (!value || typeof value !== 'string') {
        throw new Error(`OAUTH_${provider.toUpperCase()}_CLIENT_SECRET is required when ${provider} is enabled`);
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
        throw new Error(`OAUTH_${provider.toUpperCase()}_CLIENT_SECRET cannot be empty when ${provider} is enabled`);
    }

    if (trimmed.length > MAX_CLIENT_SECRET_LENGTH) {
        throw new Error(`OAUTH_${provider.toUpperCase()}_CLIENT_SECRET exceeds maximum length of ${MAX_CLIENT_SECRET_LENGTH}`);
    }

    // Check for null bytes
    if (trimmed.includes('\x00')) {
        throw new Error(`OAUTH_${provider.toUpperCase()}_CLIENT_SECRET contains null bytes`);
    }

    // Check for control characters
    if (/[\x01-\x1F\x7F]/.test(trimmed)) {
        throw new Error(`OAUTH_${provider.toUpperCase()}_CLIENT_SECRET contains invalid control characters`);
    }

    // Check for CR/LF
    if (trimmed.includes('\n') || trimmed.includes('\r')) {
        throw new Error(`OAUTH_${provider.toUpperCase()}_CLIENT_SECRET contains invalid newline characters`);
    }

    return {
        valid: true,
        hasSecret: true,
        secret: trimmed,
    };
}

/**
 * Validate redirect URI
 * @param {string} value - Redirect URI
 * @param {string} provider - Provider name
 * @param {boolean} enabled - Whether provider is enabled
 * @param {boolean} requireHttps - Whether HTTPS is required
 * @returns {string} Validated redirect URI
 */
function validateRedirectUri(value, provider, enabled, requireHttps) {
    if (!enabled) {
        return '';
    }

    if (!value || typeof value !== 'string') {
        throw new Error(`OAUTH_${provider.toUpperCase()}_REDIRECT_URI is required when ${provider} is enabled`);
    }

    return validateUrl(value, false, `OAUTH_${provider.toUpperCase()}_REDIRECT_URI`, requireHttps);
}

/**
 * Validate allowed redirect origins
 * @param {string} origins - Comma-separated origins
 * @param {boolean} requireHttps - Whether HTTPS is required
 * @returns {Array} Validated origins
 */
function validateAllowedRedirectOrigins(origins, requireHttps) {
    if (!origins || typeof origins !== 'string') {
        return [];
    }

    const trimmed = origins.trim();

    if (trimmed.length === 0) {
        return [];
    }

    const originList = trimmed.split(',').map(o => o.trim()).filter(o => o.length > 0);

    if (originList.length === 0) {
        return [];
    }

    const validated = [];
    for (const origin of originList) {
        // Validate each origin
        if (origin.length > MAX_ALLOWED_ORIGIN_LENGTH) {
            throw new Error(`Allowed redirect origin exceeds maximum length of ${MAX_ALLOWED_ORIGIN_LENGTH}`);
        }

        // Check for null bytes
        if (origin.includes('\x00')) {
            throw new Error('OAUTH_ALLOWED_REDIRECT_ORIGINS contains null bytes');
        }

        // Check for control characters
        if (/[\x01-\x1F\x7F]/.test(origin)) {
            throw new Error('OAUTH_ALLOWED_REDIRECT_ORIGINS contains invalid control characters');
        }

        // Check for CR/LF
        if (origin.includes('\n') || origin.includes('\r')) {
            throw new Error('OAUTH_ALLOWED_REDIRECT_ORIGINS contains invalid newline characters');
        }

        // Reject wildcard
        if (origin === '*') {
            throw new Error('OAUTH_ALLOWED_REDIRECT_ORIGINS cannot contain wildcard');
        }

        // Validate URL
        try {
            const parsed = new URL(origin);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                throw new Error(`Invalid redirect origin protocol: ${origin}`);
            }
            if (requireHttps && parsed.protocol === 'http:') {
                throw new Error(`Redirect origin must use HTTPS in production: ${origin}`);
            }
            // Ensure no path/query/fragment
            if (parsed.pathname !== '/' && parsed.pathname !== '') {
                throw new Error(`Redirect origin cannot contain a path: ${origin}`);
            }
            if (parsed.search) {
                throw new Error(`Redirect origin cannot contain query: ${origin}`);
            }
            if (parsed.hash) {
                throw new Error(`Redirect origin cannot contain fragment: ${origin}`);
            }
            // Rebuild without trailing slash
            let normalized = parsed.toString();
            normalized = normalized.replace(/\/+$/, '');
            validated.push(normalized);
        } catch {
            throw new Error(`Invalid redirect origin: ${origin}`);
        }
    }

    return validated;
}

// ----------------------------------------------------------------------------
// 3. PROVIDER CONFIGURATION LOADER
// ----------------------------------------------------------------------------

/**
 * Load a single provider configuration
 * @param {string} provider - Provider name
 * @param {string} envPrefix - Environment variable prefix
 * @param {boolean} oauthEnabled - Master OAuth enabled flag
 * @param {boolean} requireHttps - Whether HTTPS is required
 * @returns {Object} Provider configuration
 */
function loadProviderConfig(provider, envPrefix, oauthEnabled, requireHttps) {
    const enabledFlag = `${envPrefix}_ENABLED`;
    const clientIdVar = `${envPrefix}_CLIENT_ID`;
    const clientSecretVar = `${envPrefix}_CLIENT_SECRET`;
    const redirectUriVar = `${envPrefix}_REDIRECT_URI`;

    const enabled = parseBoolean(process.env[enabledFlag], false);
    const isActive = oauthEnabled && enabled;

    // Validate and load client ID
    const clientId = validateClientId(process.env[clientIdVar], provider, isActive);

    // Validate and load client secret
    const secretResult = validateClientSecret(process.env[clientSecretVar], provider, isActive);
    const clientSecret = secretResult.hasSecret ? secretResult.secret : null;

    // Validate redirect URI
    const redirectUri = validateRedirectUri(
        process.env[redirectUriVar],
        provider,
        isActive,
        requireHttps
    );

    // Build provider config
    const config = {
        enabled: isActive,
        clientIdConfigured: !!clientId,
        hasSecret: secretResult.hasSecret,
        redirectUriConfigured: !!redirectUri,
        clientId: clientId || '',
        redirectUri: redirectUri || '',
        // For safe output, we don't include secret
        scopes: PROVIDER_SCOPES[provider] || '',
    };

    // Store secret internally
    if (secretResult.hasSecret) {
        config._secret = clientSecret;
    }

    return config;
}

// ----------------------------------------------------------------------------
// 4. CONFIGURATION LOADER
// ----------------------------------------------------------------------------

/**
 * Load OAuth configuration from environment variables
 * @param {string} nodeEnv - Current Node environment
 * @returns {Object} Immutable OAuth configuration
 */
function loadOAuthConfig(nodeEnv = 'development') {
    const isProduction = nodeEnv === 'production';
    const requireHttps = isProduction;

    // Parse master enabled flag
    const enabled = parseBoolean(process.env.OAUTH_ENABLED, DEFAULT_OAUTH_ENABLED);

    // Parse TTLs
    const stateTtlMs = parsePositiveInteger(
        process.env.OAUTH_STATE_TTL_MS,
        DEFAULT_OAUTH_STATE_TTL_MS,
        MIN_TTL_MS,
        MAX_TTL_MS
    );
    const nonceTtlMs = parsePositiveInteger(
        process.env.OAUTH_NONCE_TTL_MS,
        DEFAULT_OAUTH_NONCE_TTL_MS,
        MIN_TTL_MS,
        MAX_TTL_MS
    );

    // Parse policies
    const allowAccountLinking = parseBoolean(
        process.env.OAUTH_ALLOW_ACCOUNT_LINKING,
        DEFAULT_OAUTH_ALLOW_ACCOUNT_LINKING
    );
    const requireEmail = parseBoolean(
        process.env.OAUTH_REQUIRE_EMAIL,
        DEFAULT_OAUTH_REQUIRE_EMAIL
    );
    const autoCreateUsers = parseBoolean(
        process.env.OAUTH_AUTO_CREATE_USERS,
        DEFAULT_OAUTH_AUTO_CREATE_USERS
    );

    // Parse allowed redirect origins
    const allowedRedirectOrigins = validateAllowedRedirectOrigins(
        process.env.OAUTH_ALLOWED_REDIRECT_ORIGINS,
        requireHttps
    );

    // Load each provider
    const providers = {};
    const providerSecrets = {};

    for (const provider of PROVIDER_NAMES) {
        const envPrefix = `OAUTH_${provider.toUpperCase()}`;
        const config = loadProviderConfig(provider, envPrefix, enabled, requireHttps);

        // Extract secret
        if (config._secret) {
            providerSecrets[provider] = config._secret;
            delete config._secret;
        }

        providers[provider] = Object.freeze(config);
    }

    // Build the full config
    const config = {
        enabled,
        providers: Object.freeze(providers),
        stateTtlMs,
        nonceTtlMs,
        allowAccountLinking,
        requireEmail,
        autoCreateUsers,
        allowedRedirectOrigins: Object.freeze(allowedRedirectOrigins),
        isProduction,
        _providerSecrets: providerSecrets,
        isConfigured: enabled && Object.values(providers).some(p => p.enabled),
    };

    return Object.freeze(config);
}

// ----------------------------------------------------------------------------
// 5. SINGLETON CONFIGURATION
// ----------------------------------------------------------------------------

let _config = null;
let _providerSecrets = null;

/**
 * Get the OAuth configuration (singleton)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Immutable OAuth configuration
 */
function getOAuthConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    if (_config === null) {
        const loaded = loadOAuthConfig(nodeEnv);
        if (loaded._providerSecrets) {
            _providerSecrets = loaded._providerSecrets;
        }
        // Remove secrets from config
        const { _providerSecrets: _, ...safeConfig } = loaded;
        _config = Object.freeze(safeConfig);
    }
    return _config;
}

/**
 * Get safe OAuth configuration (for logging/diagnostics)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Safe OAuth configuration
 */
function getSafeOAuthConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    const config = getOAuthConfig(nodeEnv);

    const safeProviders = {};
    for (const [provider, providerConfig] of Object.entries(config.providers)) {
        safeProviders[provider] = {
            enabled: providerConfig.enabled,
            clientIdConfigured: providerConfig.clientIdConfigured,
            redirectUriConfigured: providerConfig.redirectUriConfigured,
            hasSecret: providerConfig.hasSecret,
            redirectUri: providerConfig.redirectUri || null,
            scopes: providerConfig.scopes || '',
        };
    }

    const safe = {
        enabled: config.enabled,
        providers: safeProviders,
        stateTtlMs: config.stateTtlMs,
        nonceTtlMs: config.nonceTtlMs,
        allowAccountLinking: config.allowAccountLinking,
        requireEmail: config.requireEmail,
        autoCreateUsers: config.autoCreateUsers,
        allowedRedirectOrigins: config.allowedRedirectOrigins,
        isProduction: config.isProduction,
        isConfigured: config.isConfigured,
    };

    return Object.freeze(safe);
}

/**
 * Get OAuth secret configuration (for internal use only)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Secret configuration
 */
function getOAuthSecretConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    const config = getOAuthConfig(nodeEnv);
    const secrets = {};

    for (const provider of PROVIDER_NAMES) {
        if (_providerSecrets && _providerSecrets[provider]) {
            secrets[provider] = {
                clientSecret: _providerSecrets[provider],
                hasSecret: true,
            };
        } else {
            secrets[provider] = {
                clientSecret: null,
                hasSecret: false,
            };
        }
    }

    return Object.freeze({
        providers: Object.freeze(secrets),
        hasSecrets: Object.values(secrets).some(s => s.hasSecret),
    });
}

/**
 * Validate OAuth configuration
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Validation result
 */
function validateOAuthConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    try {
        const config = getOAuthConfig(nodeEnv);
        const errors = [];
        const warnings = [];

        // Check each provider
        for (const provider of PROVIDER_NAMES) {
            const p = config.providers[provider];
            if (p.enabled) {
                if (!p.clientIdConfigured) {
                    errors.push(`${provider} is enabled but client ID is not configured`);
                }
                if (!p.hasSecret) {
                    errors.push(`${provider} is enabled but client secret is not configured`);
                }
                if (!p.redirectUriConfigured) {
                    errors.push(`${provider} is enabled but redirect URI is not configured`);
                }
            }
        }

        // Check if OAuth is enabled but no provider is active
        if (config.enabled && !config.isConfigured) {
            warnings.push('OAuth is enabled but no providers are active');
        }

        // Check production security
        if (config.isProduction) {
            if (config.enabled && !config.allowedRedirectOrigins.length) {
                warnings.push('Allowed redirect origins not configured - OAuth may be vulnerable to open redirect');
            }

            // Check for HTTP redirect URIs
            for (const [provider, p] of Object.entries(config.providers)) {
                if (p.enabled && p.redirectUri && p.redirectUri.startsWith('http://')) {
                    errors.push(`${provider} redirect URI uses HTTP in production - requires HTTPS`);
                }
            }

            // Check allowed redirect origins are HTTPS
            for (const origin of config.allowedRedirectOrigins) {
                if (origin.startsWith('http://')) {
                    errors.push(`Allowed redirect origin uses HTTP in production: ${origin}`);
                }
            }
        }

        // Warn if account linking is enabled
        if (config.allowAccountLinking) {
            warnings.push('Account linking is enabled - ensure security implications are understood');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            config: getSafeOAuthConfig(nodeEnv),
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
// 6. EXPORTS
// ----------------------------------------------------------------------------

export {
    getOAuthConfig,
    getSafeOAuthConfig,
    getOAuthSecretConfig,
    validateOAuthConfig,
    loadOAuthConfig,
    parseBoolean,
    PROVIDER_NAMES,
    DEFAULT_OAUTH_ENABLED,
};

export default {
    getOAuthConfig,
    getSafeOAuthConfig,
    getOAuthSecretConfig,
    validateOAuthConfig,
    loadOAuthConfig,
    parseBoolean,
    PROVIDER_NAMES,
    DEFAULT_OAUTH_ENABLED,
};