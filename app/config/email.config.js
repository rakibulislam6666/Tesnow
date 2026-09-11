/**
 * app/config/email.config.js
 * Centralized email/SMTP configuration for Tesnow
 * Provides validation and secure configuration for email services
 * 
 * @module config/email.config
 */

// ----------------------------------------------------------------------------
// 1. CONSTANTS & DEFAULTS
// ----------------------------------------------------------------------------

const DEFAULT_SMTP_PORT = 587;
const DEFAULT_SMTP_SECURE = false;
const DEFAULT_MAIL_FROM = 'noreply@example.com';

const MIN_SMTP_PORT = 1;
const MAX_SMTP_PORT = 65535;
const MAX_HOST_LENGTH = 255;
const MAX_EMAIL_LENGTH = 320;
const MAX_DISPLAY_NAME_LENGTH = 100;

const PLACEHOLDER_PASSWORDS = [
    'CHANGE_ME_SMTP_PASSWORD',
    'change_me_smtp_password',
    'your-smtp-password-here',
    'password',
    'changeme',
    'CHANGE_ME',
];

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
 * Validate SMTP host
 * @param {string} host - SMTP host
 * @param {string} nodeEnv - Current environment
 * @returns {string} Validated host
 */
function validateHost(host, nodeEnv) {
    const isProduction = nodeEnv === 'production';
    
    if (!host || typeof host !== 'string') {
        if (isProduction) {
            throw new Error('SMTP_HOST is required in production');
        }
        return '';
    }
    
    const trimmed = host.trim();
    
    if (trimmed.length === 0) {
        if (isProduction) {
            throw new Error('SMTP_HOST cannot be empty in production');
        }
        return '';
    }
    
    if (trimmed.length > MAX_HOST_LENGTH) {
        throw new Error(`SMTP_HOST exceeds maximum length of ${MAX_HOST_LENGTH}`);
    }
    
    // Check for control characters
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
        throw new Error('SMTP_HOST contains invalid control characters');
    }
    
    // Basic hostname validation (allow IPs and domain names)
    // Hostnames: alphanumeric, hyphens, dots
    // IPs: numbers and dots
    if (!/^[a-zA-Z0-9.-]+$/.test(trimmed)) {
        throw new Error('SMTP_HOST contains invalid characters');
    }
    
    // Reject CRLF injection
    if (trimmed.includes('\n') || trimmed.includes('\r')) {
        throw new Error('SMTP_HOST contains invalid newline characters');
    }
    
    return trimmed;
}

/**
 * Validate SMTP port
 * @param {string|number} port - SMTP port
 * @returns {number} Validated port
 */
function validatePort(port) {
    if (port === null || port === undefined || port === '') {
        return DEFAULT_SMTP_PORT;
    }
    
    let num;
    if (typeof port === 'string') {
        num = parseInt(port, 10);
    } else if (typeof port === 'number') {
        num = port;
    } else {
        return DEFAULT_SMTP_PORT;
    }
    
    if (typeof num !== 'number' || !Number.isFinite(num) || !Number.isInteger(num)) {
        return DEFAULT_SMTP_PORT;
    }
    
    if (num < MIN_SMTP_PORT || num > MAX_SMTP_PORT) {
        throw new Error(`SMTP_PORT must be between ${MIN_SMTP_PORT} and ${MAX_SMTP_PORT}`);
    }
    
    return num;
}

/**
 * Validate SMTP user
 * @param {string} user - SMTP username
 * @returns {string} Validated username
 */
function validateUser(user) {
    if (!user || typeof user !== 'string') {
        return '';
    }
    
    const trimmed = user.trim();
    
    if (trimmed.length === 0) {
        return '';
    }
    
    // Check for control characters
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
        throw new Error('SMTP_USER contains invalid control characters');
    }
    
    // Reject CRLF injection
    if (trimmed.includes('\n') || trimmed.includes('\r')) {
        throw new Error('SMTP_USER contains invalid newline characters');
    }
    
    // Reject header injection attempts
    if (trimmed.includes(':') || trimmed.includes('@')) {
        // Usernames may contain @ for email auth, but reject header injection patterns
        if (trimmed.includes('\n') || trimmed.includes('\r')) {
            throw new Error('SMTP_USER contains invalid characters');
        }
    }
    
    return trimmed;
}

/**
 * Validate SMTP password
 * @param {string} password - SMTP password
 * @param {string} nodeEnv - Current environment
 * @returns {Object} Validation result with password info
 */
function validatePassword(password, nodeEnv) {
    const isProduction = nodeEnv === 'production';
    
    if (!password || typeof password !== 'string') {
        if (isProduction) {
            throw new Error('SMTP_PASSWORD is required in production');
        }
        return {
            valid: false,
            hasPassword: false,
            isPlaceholder: false,
            error: 'SMTP_PASSWORD is missing',
        };
    }
    
    const trimmed = password.trim();
    
    if (trimmed.length === 0) {
        if (isProduction) {
            throw new Error('SMTP_PASSWORD cannot be empty in production');
        }
        return {
            valid: false,
            hasPassword: false,
            isPlaceholder: false,
            error: 'SMTP_PASSWORD is empty',
        };
    }
    
    // Check for placeholder values
    const isPlaceholder = PLACEHOLDER_PASSWORDS.some(p => 
        trimmed.toLowerCase() === p.toLowerCase()
    );
    
    if (isPlaceholder) {
        if (isProduction) {
            throw new Error('SMTP_PASSWORD uses a placeholder value - must be changed in production');
        }
        return {
            valid: false,
            hasPassword: false,
            isPlaceholder: true,
            error: 'SMTP_PASSWORD is a placeholder value',
        };
    }
    
    // Check for control characters
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
        throw new Error('SMTP_PASSWORD contains invalid control characters');
    }
    
    // Reject CRLF injection
    if (trimmed.includes('\n') || trimmed.includes('\r')) {
        throw new Error('SMTP_PASSWORD contains invalid newline characters');
    }
    
    return {
        valid: true,
        hasPassword: true,
        isPlaceholder: false,
        password: trimmed,
        error: null,
    };
}

/**
 * Validate MAIL_FROM
 * @param {string} from - Mail from address
 * @param {string} nodeEnv - Current environment
 * @returns {string} Validated mail from
 */
function validateMailFrom(from, nodeEnv) {
    const isProduction = nodeEnv === 'production';
    
    if (!from || typeof from !== 'string') {
        if (isProduction) {
            throw new Error('MAIL_FROM is required in production');
        }
        return DEFAULT_MAIL_FROM;
    }
    
    const trimmed = from.trim();
    
    if (trimmed.length === 0) {
        if (isProduction) {
            throw new Error('MAIL_FROM cannot be empty in production');
        }
        return DEFAULT_MAIL_FROM;
    }
    
    if (trimmed.length > MAX_EMAIL_LENGTH) {
        throw new Error(`MAIL_FROM exceeds maximum length of ${MAX_EMAIL_LENGTH}`);
    }
    
    // Check for control characters
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
        throw new Error('MAIL_FROM contains invalid control characters');
    }
    
    // Reject CRLF injection (critical for email headers)
    if (trimmed.includes('\n') || trimmed.includes('\r')) {
        throw new Error('MAIL_FROM contains invalid newline characters');
    }
    
    // Reject email header injection patterns
    if (trimmed.includes('bcc:') || trimmed.includes('cc:') || trimmed.includes('to:')) {
        throw new Error('MAIL_FROM contains invalid header injection patterns');
    }
    
    // Extract email address from display name format
    let emailPart = trimmed;
    const emailMatch = trimmed.match(/<([^>]+)>/);
    if (emailMatch) {
        emailPart = emailMatch[1].trim();
    }
    
    // Basic email format validation
    if (!emailPart.includes('@')) {
        throw new Error('MAIL_FROM must contain a valid email address');
    }
    
    // Validate email part doesn't contain dangerous characters
    if (/[\x00-\x1F\x7F\n\r]/.test(emailPart)) {
        throw new Error('MAIL_FROM contains invalid characters in email address');
    }
    
    // Validate display name if present
    if (trimmed.includes('<')) {
        const displayName = trimmed.substring(0, trimmed.indexOf('<')).trim();
        if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
            throw new Error(`MAIL_FROM display name exceeds maximum length of ${MAX_DISPLAY_NAME_LENGTH}`);
        }
        if (/[\x00-\x1F\x7F\n\r]/.test(displayName)) {
            throw new Error('MAIL_FROM display name contains invalid characters');
        }
    }
    
    return trimmed;
}

// ----------------------------------------------------------------------------
// 3. CONFIGURATION LOADER
// ----------------------------------------------------------------------------

/**
 * Load email configuration from environment variables
 * @param {string} nodeEnv - Current Node environment
 * @returns {Object} Immutable email configuration
 */
function loadEmailConfig(nodeEnv = 'development') {
    const isProduction = nodeEnv === 'production';
    
    // Validate SMTP settings
    const host = validateHost(process.env.SMTP_HOST, nodeEnv);
    const port = validatePort(process.env.SMTP_PORT);
    const secure = parseBoolean(process.env.SMTP_SECURE, DEFAULT_SMTP_SECURE);
    const user = validateUser(process.env.SMTP_USER);
    const mailFrom = validateMailFrom(process.env.MAIL_FROM, nodeEnv);
    
    // Validate password (internal only)
    const passwordResult = validatePassword(process.env.SMTP_PASSWORD, nodeEnv);
    
    // Determine if email is configured
    const hasRequired = host.length > 0 && port > 0 && mailFrom.length > 0 && mailFrom !== DEFAULT_MAIL_FROM;
    const hasAuth = user.length > 0 && passwordResult.hasPassword;
    const isConfigured = hasRequired && (hasAuth || !isProduction);
    
    // Build safe configuration (no password)
    const config = {
        // SMTP settings
        smtp: {
            host,
            port,
            secure,
            user,
            hasAuth: hasAuth,
            configured: isConfigured,
        },
        
        // Mail settings
        mailFrom,
        
        // Status
        isConfigured,
        isProduction,
        hasRequiredConfig: hasRequired,
        hasCredentials: hasAuth,
    };
    
    return Object.freeze(config);
}

// ----------------------------------------------------------------------------
// 4. SINGLETON CONFIGURATION
// ----------------------------------------------------------------------------

let _config = null;
let _password = null;

/**
 * Get the email configuration (singleton)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Immutable email configuration
 */
function getEmailConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    if (_config === null) {
        const loaded = loadEmailConfig(nodeEnv);
        // Store password internally
        if (loaded._password) {
            _password = loaded._password;
        }
        // Remove password from config
        const { _password: _, ...safeConfig } = loaded;
        _config = Object.freeze(safeConfig);
    }
    return _config;
}

/**
 * Get SMTP password (for internal use only)
 * @returns {string|null} SMTP password or null if not available
 * @throws {Error} If password is required but missing
 */
function getSmtpPassword() {
    const config = getEmailConfig();
    if (!config.smtp.hasAuth) {
        return null;
    }
    return _password || null;
}

/**
 * Get SMTP configuration (safe, without password)
 * @returns {Object} Safe SMTP configuration
 */
function getSmtpConfig() {
    const config = getEmailConfig();
    return Object.freeze({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        user: config.smtp.user,
        hasAuth: config.smtp.hasAuth,
        configured: config.smtp.configured,
    });
}

/**
 * Get MAIL_FROM address
 * @returns {string} Mail from address
 */
function getMailFrom() {
    const config = getEmailConfig();
    return config.mailFrom;
}

/**
 * Check if email is configured
 * @returns {Object} Configuration status
 */
function isEmailConfigured() {
    const config = getEmailConfig();
    return {
        configured: config.isConfigured,
        hasRequiredConfig: config.hasRequiredConfig,
        hasCredentials: config.hasCredentials,
        isProduction: config.isProduction,
    };
}

/**
 * Check if production email configuration is ready
 * @returns {boolean} True if production-ready
 */
function isProductionEmail() {
    const config = getEmailConfig();
    return config.isProduction && config.isConfigured && config.smtp.hasAuth;
}

/**
 * Validate email configuration
 * @returns {Object} Validation result
 */
function validateEmailConfig() {
    try {
        const config = getEmailConfig();
        const errors = [];
        const warnings = [];
        
        // Validate required fields
        if (config.isProduction) {
            if (!config.smtp.host) {
                errors.push('SMTP_HOST is required in production');
            }
            
            if (!config.smtp.port || config.smtp.port < MIN_SMTP_PORT || config.smtp.port > MAX_SMTP_PORT) {
                errors.push(`SMTP_PORT must be between ${MIN_SMTP_PORT} and ${MAX_SMTP_PORT}`);
            }
            
            if (!config.mailFrom || config.mailFrom === DEFAULT_MAIL_FROM) {
                errors.push('MAIL_FROM must be configured in production');
            }
            
            if (!config.smtp.hasAuth) {
                errors.push('SMTP credentials are required in production');
            }
        }
        
        // Check for insecure settings
        if (config.smtp.secure === false && config.isProduction) {
            warnings.push('SMTP_SECURE is false in production - consider using TLS/SSL');
        }
        
        if (config.smtp.port === 25 && config.isProduction) {
            warnings.push('SMTP_PORT 25 is less secure and may be blocked - consider using 587 or 465');
        }
        
        if (!config.smtp.host) {
            warnings.push('SMTP_HOST is not configured - email features will not work');
        }
        
        if (!config.smtp.hasAuth) {
            warnings.push('SMTP credentials are not configured - email may not work');
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            config: {
                host: config.smtp.host || '(not configured)',
                port: config.smtp.port,
                secure: config.smtp.secure,
                hasAuth: config.smtp.hasAuth,
                mailFrom: config.mailFrom,
                isConfigured: config.isConfigured,
                isProduction: config.isProduction,
            },
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
    getEmailConfig,
    getSmtpConfig,
    getSmtpPassword,
    getMailFrom,
    isEmailConfigured,
    isProductionEmail,
    validateEmailConfig,
    loadEmailConfig,
    DEFAULT_SMTP_PORT,
    DEFAULT_SMTP_SECURE,
    DEFAULT_MAIL_FROM,
};

export default {
    getEmailConfig,
    getSmtpConfig,
    getSmtpPassword,
    getMailFrom,
    isEmailConfigured,
    isProductionEmail,
    validateEmailConfig,
    loadEmailConfig,
    DEFAULT_SMTP_PORT,
    DEFAULT_SMTP_SECURE,
    DEFAULT_MAIL_FROM,
};