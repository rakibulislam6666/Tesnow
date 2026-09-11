/**
 * app/config/payment.config.js
 * Centralized payment configuration for Tesnow
 * High-security configuration for payment providers, webhooks, and idempotency
 * 
 * @module config/payment.config
 */

// ----------------------------------------------------------------------------
// 1. CONSTANTS & DEFAULTS
// ----------------------------------------------------------------------------

const DEFAULT_PAYMENT_ENABLED = false;
const DEFAULT_PAYMENT_PROVIDER = 'none';
const DEFAULT_PAYMENT_CURRENCY = 'USD';
const DEFAULT_PAYMENT_COUNTRY = 'BD';
const DEFAULT_PAYMENT_MODE = 'test';
const DEFAULT_PAYMENT_CHECKOUT_TIMEOUT_MS = 30000;
const DEFAULT_PAYMENT_WEBHOOK_TOLERANCE_SECONDS = 300;
const DEFAULT_PAYMENT_ALLOW_GUEST_CHECKOUT = false;
const DEFAULT_PAYMENT_REQUIRE_BILLING_ADDRESS = false;
const DEFAULT_PAYMENT_WEBHOOK_ENABLED = true;
const DEFAULT_PAYMENT_IDEMPOTENCY_ENABLED = true;
const DEFAULT_PAYMENT_IDEMPOTENCY_TTL_SECONDS = 86400;
const DEFAULT_PAYMENT_MAX_AMOUNT = 1000000;
const DEFAULT_PAYMENT_MIN_AMOUNT = 1;

const VALID_PROVIDERS = ['none', 'stripe', 'paypal', 'bkash', 'custom'];
const VALID_MODES = ['test', 'live'];
const CURRENCY_REGEX = /^[A-Z]{3}$/;
const COUNTRY_REGEX = /^[A-Z]{2}$/;
const MAX_SECRET_LENGTH = 500;
const MAX_STRING_LENGTH = 255;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 300000; // 5 minutes
const MIN_WEBHOOK_TOLERANCE = 1;
const MAX_WEBHOOK_TOLERANCE = 3600; // 1 hour
const MIN_IDEMPOTENCY_TTL = 60;
const MAX_IDEMPOTENCY_TTL = 7 * 24 * 60 * 60; // 7 days
const MIN_AMOUNT = 0;
const MAX_AMOUNT = 1000000000; // 1 billion

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
 * Validate a secret (sensitive string)
 * @param {string} value - Secret value
 * @param {string} name - Name for error messages
 * @param {boolean} required - Whether secret is required
 * @returns {Object} Validation result with secret info
 */
function validateSecret(value, name, required = true) {
    if (!value || typeof value !== 'string') {
        if (required) {
            throw new Error(`${name} is required`);
        }
        return {
            valid: true,
            hasSecret: false,
            secret: null,
        };
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
        if (required) {
            throw new Error(`${name} cannot be empty`);
        }
        return {
            valid: true,
            hasSecret: false,
            secret: null,
        };
    }

    if (trimmed.length > MAX_SECRET_LENGTH) {
        throw new Error(`${name} exceeds maximum length of ${MAX_SECRET_LENGTH}`);
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

    return {
        valid: true,
        hasSecret: true,
        secret: trimmed,
    };
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

    if (trimmed.length > MAX_STRING_LENGTH) {
        throw new Error(`${name} exceeds maximum length of ${MAX_STRING_LENGTH}`);
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
            throw new Error(`${name} must use HTTPS in live/production mode`);
        }

        // Rebuild without trailing slash
        let normalized = parsed.toString();
        normalized = normalized.replace(/\/+$/, '');
        return normalized;
    } catch {
        throw new Error(`Invalid ${name}: ${trimmed}`);
    }
}

/**
 * Validate currency code
 * @param {string} code - Currency code
 * @param {string} defaultValue - Default if empty
 * @returns {string} Validated currency
 */
function validateCurrency(code, defaultValue) {
    if (!code || typeof code !== 'string') {
        return defaultValue;
    }

    const trimmed = code.trim().toUpperCase();

    if (trimmed.length === 0) {
        return defaultValue;
    }

    if (!CURRENCY_REGEX.test(trimmed)) {
        throw new Error(`PAYMENT_CURRENCY must be a 3-letter ISO currency code`);
    }

    return trimmed;
}

/**
 * Validate country code
 * @param {string} code - Country code
 * @param {string} defaultValue - Default if empty
 * @returns {string} Validated country
 */
function validateCountry(code, defaultValue) {
    if (!code || typeof code !== 'string') {
        return defaultValue;
    }

    const trimmed = code.trim().toUpperCase();

    if (trimmed.length === 0) {
        return defaultValue;
    }

    if (!COUNTRY_REGEX.test(trimmed)) {
        throw new Error(`PAYMENT_COUNTRY must be a 2-letter ISO country code`);
    }

    return trimmed;
}

/**
 * Validate payment mode
 * @param {string} mode - Payment mode
 * @param {string} defaultValue - Default if invalid
 * @returns {string} Validated mode
 */
function validateMode(mode, defaultValue) {
    if (!mode || typeof mode !== 'string') {
        return defaultValue;
    }

    const trimmed = mode.trim().toLowerCase();

    if (!VALID_MODES.includes(trimmed)) {
        throw new Error(`PAYMENT_MODE must be one of: ${VALID_MODES.join(', ')}`);
    }

    return trimmed;
}

/**
 * Validate payment provider
 * @param {string} provider - Provider name
 * @param {boolean} enabled - Master payment enabled flag
 * @returns {string} Validated provider
 */
function validateProvider(provider, enabled) {
    if (!provider || typeof provider !== 'string') {
        return enabled ? DEFAULT_PAYMENT_PROVIDER : 'none';
    }

    const trimmed = provider.trim().toLowerCase();

    if (!VALID_PROVIDERS.includes(trimmed)) {
        throw new Error(`PAYMENT_PROVIDER must be one of: ${VALID_PROVIDERS.join(', ')}`);
    }

    if (!enabled) {
        return 'none';
    }

    return trimmed;
}

// ----------------------------------------------------------------------------
// 3. PROVIDER CONFIGURATION LOADER
// ----------------------------------------------------------------------------

/**
 * Load a single provider's configuration and credentials
 * @param {string} provider - Provider name
 * @param {string} envPrefix - Environment variable prefix
 * @param {boolean} isActive - Whether provider is selected and enabled
 * @param {boolean} isLive - Whether payment mode is live
 * @param {string} mode - Payment mode
 * @returns {Object} Provider configuration
 */
function loadProviderConfig(provider, envPrefix, isActive, isLive, mode) {
    // Determine required flags
    const enabledFlag = `${envPrefix}_ENABLED`;
    const enabled = parseBoolean(process.env[enabledFlag], false);
    const isActuallyActive = isActive && enabled;

    // Define credential fields based on provider
    let credentialFields = [];
    let publicFields = [];

    switch (provider) {
        case 'stripe':
            credentialFields = ['SECRET_KEY', 'WEBHOOK_SECRET'];
            publicFields = ['PUBLIC_KEY'];
            break;
        case 'paypal':
            credentialFields = ['CLIENT_SECRET', 'WEBHOOK_ID'];
            publicFields = ['CLIENT_ID'];
            break;
        case 'bkash':
            credentialFields = ['APP_SECRET', 'USERNAME', 'PASSWORD'];
            publicFields = ['APP_KEY'];
            break;
        default:
            credentialFields = [];
            publicFields = [];
    }

    // Validate public fields (non-secret)
    const publicValues = {};
    for (const field of publicFields) {
        const envVar = `${envPrefix}_${field}`;
        const value = validateSafeString(
            process.env[envVar],
            '',
            MAX_STRING_LENGTH,
            `${envPrefix}_${field}`,
            !isActuallyActive
        );
        if (isActuallyActive && !value) {
            throw new Error(`${envPrefix}_${field} is required when ${provider} is active`);
        }
        publicValues[field] = value;
    }

    // Validate secrets
    const secrets = {};
    for (const field of credentialFields) {
        const envVar = `${envPrefix}_${field}`;
        const secretResult = validateSecret(
            process.env[envVar],
            `${envPrefix}_${field}`,
            isActuallyActive
        );
        if (isActuallyActive && !secretResult.hasSecret) {
            throw new Error(`${envPrefix}_${field} is required when ${provider} is active`);
        }
        secrets[field] = secretResult.hasSecret ? secretResult.secret : null;
        publicValues[`has${field}`] = secretResult.hasSecret;
    }

    // Check if provider is configured (has required credentials)
    const hasCredentials = isActuallyActive &&
        publicValues[publicFields[0]] &&
        secrets[credentialFields[0]];

    return {
        enabled: isActuallyActive,
        configured: !!hasCredentials,
        publicValues: Object.freeze(publicValues),
        _secrets: Object.freeze(secrets),
    };
}

// ----------------------------------------------------------------------------
// 4. CONFIGURATION LOADER
// ----------------------------------------------------------------------------

/**
 * Load payment configuration from environment variables
 * @param {string} nodeEnv - Current Node environment
 * @returns {Object} Immutable payment configuration
 */
function loadPaymentConfig(nodeEnv = 'development') {
    const isProduction = nodeEnv === 'production';

    // Master enablement
    const enabled = parseBoolean(process.env.PAYMENT_ENABLED, DEFAULT_PAYMENT_ENABLED);

    // Provider selection
    const provider = validateProvider(process.env.PAYMENT_PROVIDER, enabled);

    // Mode
    const mode = validateMode(process.env.PAYMENT_MODE, DEFAULT_PAYMENT_MODE);
    const isLive = mode === 'live';

    // Currency and country
    const currency = validateCurrency(process.env.PAYMENT_CURRENCY, DEFAULT_PAYMENT_CURRENCY);
    const country = validateCountry(process.env.PAYMENT_COUNTRY, DEFAULT_PAYMENT_COUNTRY);

    // Amount limits
    const minAmount = parsePositiveInteger(
        process.env.PAYMENT_MIN_AMOUNT,
        DEFAULT_PAYMENT_MIN_AMOUNT,
        MIN_AMOUNT,
        MAX_AMOUNT
    );
    const maxAmount = parsePositiveInteger(
        process.env.PAYMENT_MAX_AMOUNT,
        DEFAULT_PAYMENT_MAX_AMOUNT,
        MIN_AMOUNT,
        MAX_AMOUNT
    );
    if (minAmount > maxAmount) {
        throw new Error('PAYMENT_MIN_AMOUNT must not exceed PAYMENT_MAX_AMOUNT');
    }

    // Checkout timeout
    const checkoutTimeoutMs = parsePositiveInteger(
        process.env.PAYMENT_CHECKOUT_TIMEOUT_MS,
        DEFAULT_PAYMENT_CHECKOUT_TIMEOUT_MS,
        MIN_TIMEOUT_MS,
        MAX_TIMEOUT_MS
    );

    // Webhook tolerance
    const webhookToleranceSeconds = parsePositiveInteger(
        process.env.PAYMENT_WEBHOOK_TOLERANCE_SECONDS,
        DEFAULT_PAYMENT_WEBHOOK_TOLERANCE_SECONDS,
        MIN_WEBHOOK_TOLERANCE,
        MAX_WEBHOOK_TOLERANCE
    );

    // Guest checkout and billing address
    const allowGuestCheckout = parseBoolean(
        process.env.PAYMENT_ALLOW_GUEST_CHECKOUT,
        DEFAULT_PAYMENT_ALLOW_GUEST_CHECKOUT
    );
    const requireBillingAddress = parseBoolean(
        process.env.PAYMENT_REQUIRE_BILLING_ADDRESS,
        DEFAULT_PAYMENT_REQUIRE_BILLING_ADDRESS
    );

    // Webhook configuration
    const webhookEnabled = parseBoolean(
        process.env.PAYMENT_WEBHOOK_ENABLED,
        DEFAULT_PAYMENT_WEBHOOK_ENABLED
    );
    const webhookUrl = webhookEnabled
        ? validateUrl(
            process.env.PAYMENT_WEBHOOK_URL,
            true,
            'PAYMENT_WEBHOOK_URL',
            isLive || isProduction
        )
        : '';

    // Idempotency
    const idempotencyEnabled = parseBoolean(
        process.env.PAYMENT_IDEMPOTENCY_ENABLED,
        DEFAULT_PAYMENT_IDEMPOTENCY_ENABLED
    );
    const idempotencyTtlSeconds = idempotencyEnabled
        ? parsePositiveInteger(
            process.env.PAYMENT_IDEMPOTENCY_TTL_SECONDS,
            DEFAULT_PAYMENT_IDEMPOTENCY_TTL_SECONDS,
            MIN_IDEMPOTENCY_TTL,
            MAX_IDEMPOTENCY_TTL
        )
        : DEFAULT_PAYMENT_IDEMPOTENCY_TTL_SECONDS;

    // Load providers
    const providerConfigs = {};
    const providerSecrets = {};

    for (const p of VALID_PROVIDERS) {
        if (p === 'none') continue;
        const prefix = `PAYMENT_${p.toUpperCase()}`;
        const isActive = enabled && provider === p;
        const config = loadProviderConfig(p, prefix, isActive, isLive, mode);

        // Store secrets separately
        if (config._secrets && Object.keys(config._secrets).length > 0) {
            providerSecrets[p] = config._secrets;
        }
        // Remove secrets from config
        delete config._secrets;

        providerConfigs[p] = Object.freeze(config);
    }

    // Build full config
    const config = {
        enabled,
        provider,
        mode,
        currency,
        country,
        minAmount,
        maxAmount,
        checkoutTimeoutMs,
        webhookToleranceSeconds,
        allowGuestCheckout,
        requireBillingAddress,
        webhook: {
            enabled: webhookEnabled,
            url: webhookUrl,
            configured: !!webhookUrl,
        },
        idempotency: {
            enabled: idempotencyEnabled,
            ttlSeconds: idempotencyTtlSeconds,
        },
        providers: Object.freeze(providerConfigs),
        isLive,
        isProduction,
        _providerSecrets: Object.freeze(providerSecrets),
        isConfigured: enabled && provider !== 'none' && providerConfigs[provider]?.configured,
    };

    return Object.freeze(config);
}

// ----------------------------------------------------------------------------
// 5. SINGLETON CONFIGURATION
// ----------------------------------------------------------------------------

let _config = null;
let _providerSecrets = null;

/**
 * Get the payment configuration (singleton)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Immutable payment configuration
 */
function getPaymentConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    if (_config === null) {
        const loaded = loadPaymentConfig(nodeEnv);
        if (loaded._providerSecrets) {
            _providerSecrets = loaded._providerSecrets;
        }
        const { _providerSecrets: _, ...safeConfig } = loaded;
        _config = Object.freeze(safeConfig);
    }
    return _config;
}

/**
 * Get safe payment configuration (for logging/diagnostics)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Safe payment configuration
 */
function getSafePaymentConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    const config = getPaymentConfig(nodeEnv);

    const safeProviders = {};
    for (const [provider, providerConfig] of Object.entries(config.providers)) {
        // Build a safe representation without secrets
        const safeProvider = {
            enabled: providerConfig.enabled,
            configured: providerConfig.configured,
            publicValues: providerConfig.publicValues,
        };
        // Remove hasSecret flags (we only need to know if configured)
        if (safeProvider.publicValues && typeof safeProvider.publicValues === 'object') {
            const cleaned = { ...safeProvider.publicValues };
            for (const key of Object.keys(cleaned)) {
                if (key.startsWith('has')) {
                    delete cleaned[key];
                }
            }
            safeProvider.publicValues = Object.freeze(cleaned);
        }
        safeProviders[provider] = Object.freeze(safeProvider);
    }

    const safe = {
        enabled: config.enabled,
        provider: config.provider,
        mode: config.mode,
        currency: config.currency,
        country: config.country,
        minAmount: config.minAmount,
        maxAmount: config.maxAmount,
        checkoutTimeoutMs: config.checkoutTimeoutMs,
        webhookToleranceSeconds: config.webhookToleranceSeconds,
        allowGuestCheckout: config.allowGuestCheckout,
        requireBillingAddress: config.requireBillingAddress,
        webhook: {
            enabled: config.webhook.enabled,
            configured: config.webhook.configured,
            hasUrl: !!config.webhook.url,
        },
        idempotency: {
            enabled: config.idempotency.enabled,
            ttlSeconds: config.idempotency.ttlSeconds,
        },
        providers: safeProviders,
        isLive: config.isLive,
        isProduction: config.isProduction,
        isConfigured: config.isConfigured,
    };

    return Object.freeze(safe);
}

/**
 * Get payment secret configuration (for internal use only)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Secret configuration
 */
function getPaymentSecretConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    const config = getPaymentConfig(nodeEnv);

    // Return secrets only for the active provider
    const activeProvider = config.provider;
    const secrets = {};

    if (activeProvider !== 'none' && _providerSecrets && _providerSecrets[activeProvider]) {
        secrets[activeProvider] = { ..._providerSecrets[activeProvider] };
    }

    return Object.freeze({
        provider: activeProvider,
        secrets: Object.freeze(secrets),
        hasSecrets: Object.keys(secrets).length > 0,
    });
}

/**
 * Validate payment configuration
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Validation result
 */
function validatePaymentConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    try {
        const config = getPaymentConfig(nodeEnv);
        const errors = [];
        const warnings = [];

        // Check if enabled and provider set
        if (config.enabled && config.provider === 'none') {
            errors.push('PAYMENT_ENABLED is true but PAYMENT_PROVIDER is "none"');
        }

        if (config.enabled && config.provider !== 'none') {
            const providerConfig = config.providers[config.provider];
            if (!providerConfig || !providerConfig.enabled) {
                errors.push(`Provider "${config.provider}" is not enabled`);
            }
            if (!providerConfig || !providerConfig.configured) {
                errors.push(`Provider "${config.provider}" is not properly configured`);
            }
        }

        // Live mode checks
        if (config.isLive) {
            if (!config.webhook.enabled) {
                warnings.push('Webhooks are disabled in live mode - may miss payment events');
            }
            if (config.webhook.enabled && !config.webhook.configured) {
                errors.push('Webhooks are enabled in live mode but no webhook URL configured');
            }
            if (config.webhook.url && !config.webhook.url.startsWith('https://')) {
                errors.push('Webhook URL must use HTTPS in live mode');
            }
            if (config.allowGuestCheckout) {
                warnings.push('Guest checkout is enabled in live mode - consider disabling for security');
            }
            if (!config.idempotency.enabled) {
                warnings.push('Idempotency is disabled in live mode - risk of duplicate payments');
            }
        }

        // Currency and country warnings
        if (config.currency === 'USD' && config.country !== 'US') {
            warnings.push('Currency and country mismatch may cause payment issues');
        }

        // Amount range
        if (config.maxAmount > 10000000) {
            warnings.push(`Max amount (${config.maxAmount}) is very high - ensure proper fraud controls`);
        }

        // Timeout
        if (config.checkoutTimeoutMs > 60000) {
            warnings.push(`Checkout timeout (${config.checkoutTimeoutMs}ms) is high - user experience may suffer`);
        }

        // Production warnings
        if (config.isProduction && config.mode !== 'live') {
            warnings.push('Payment mode is not "live" in production environment');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            config: getSafePaymentConfig(nodeEnv),
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
    getPaymentConfig,
    getSafePaymentConfig,
    getPaymentSecretConfig,
    validatePaymentConfig,
    loadPaymentConfig,
    parseBoolean,
    VALID_PROVIDERS,
    VALID_MODES,
    DEFAULT_PAYMENT_ENABLED,
};

export default {
    getPaymentConfig,
    getSafePaymentConfig,
    getPaymentSecretConfig,
    validatePaymentConfig,
    loadPaymentConfig,
    parseBoolean,
    VALID_PROVIDERS,
    VALID_MODES,
    DEFAULT_PAYMENT_ENABLED,
};