/**
 * app/config/storage.config.js
 * Centralized storage configuration for Tesnow
 * Manages local and S3-compatible storage configuration
 * 
 * @module config/storage.config
 */

// ----------------------------------------------------------------------------
// 1. CONSTANTS & DEFAULTS
// ----------------------------------------------------------------------------

const DEFAULT_STORAGE_DRIVER = 'local';
const DEFAULT_UPLOAD_DIR = './storage/uploads';
const DEFAULT_MAX_FILE_SIZE = 5242880; // 5 MB
const DEFAULT_FILE_NAMING = 'uuid';
const DEFAULT_DIR_ORGANIZATION = 'year/month';

const VALID_DRIVERS = ['local', 's3'];
const VALID_NAMING_STRATEGIES = ['uuid', 'hash', 'original'];
const MAX_FILE_SIZE_LIMIT = 100 * 1024 * 1024; // 100 MB
const MIN_FILE_SIZE_LIMIT = 1024; // 1 KB

const PLACEHOLDER_SECRETS = [
    'CHANGE_ME',
    'YOUR_SECRET',
    'example',
    'your-secret-key-here',
    'changeme',
    'secret',
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
 * Validate storage driver
 * @param {string} driver - Storage driver name
 * @returns {string} Validated driver
 */
function validateDriver(driver) {
    if (!driver || typeof driver !== 'string') {
        return DEFAULT_STORAGE_DRIVER;
    }
    
    const normalized = driver.trim().toLowerCase();
    
    if (!VALID_DRIVERS.includes(normalized)) {
        throw new Error(`STORAGE_DRIVER must be one of: ${VALID_DRIVERS.join(', ')}`);
    }
    
    return normalized;
}

/**
 * Validate upload directory path
 * @param {string} dir - Upload directory path
 * @param {string} nodeEnv - Current environment
 * @returns {string} Validated path
 */
function validateUploadDir(dir, nodeEnv) {
    const isProduction = nodeEnv === 'production';
    
    if (!dir || typeof dir !== 'string') {
        if (isProduction) {
            throw new Error('UPLOAD_DIR is required in production');
        }
        return DEFAULT_UPLOAD_DIR;
    }
    
    const trimmed = dir.trim();
    
    if (trimmed.length === 0) {
        if (isProduction) {
            throw new Error('UPLOAD_DIR cannot be empty in production');
        }
        return DEFAULT_UPLOAD_DIR;
    }
    
    // Check for null bytes (critical for path traversal)
    if (trimmed.includes('\x00')) {
        throw new Error('UPLOAD_DIR contains null bytes');
    }
    
    // Check for control characters
    if (/[\x01-\x1F\x7F]/.test(trimmed)) {
        throw new Error('UPLOAD_DIR contains invalid control characters');
    }
    
    // Check for path traversal attempts
    if (trimmed.includes('..')) {
        throw new Error('UPLOAD_DIR contains path traversal sequences');
    }
    
    // Remove trailing slash for consistency
    const normalized = trimmed.replace(/[/\\]+$/, '');
    
    return normalized;
}

/**
 * Validate max file size
 * @param {string|number} size - Max file size in bytes
 * @returns {number} Validated size
 */
function validateMaxFileSize(size) {
    if (size === null || size === undefined || size === '') {
        return DEFAULT_MAX_FILE_SIZE;
    }
    
    let num;
    if (typeof size === 'string') {
        num = parseInt(size, 10);
    } else if (typeof size === 'number') {
        num = size;
    } else {
        return DEFAULT_MAX_FILE_SIZE;
    }
    
    if (typeof num !== 'number' || !Number.isFinite(num) || !Number.isInteger(num)) {
        return DEFAULT_MAX_FILE_SIZE;
    }
    
    if (num < MIN_FILE_SIZE_LIMIT) {
        throw new Error(`MAX_FILE_SIZE (${num} bytes) is below minimum of ${MIN_FILE_SIZE_LIMIT} bytes`);
    }
    
    if (num > MAX_FILE_SIZE_LIMIT) {
        throw new Error(`MAX_FILE_SIZE (${num} bytes) exceeds maximum of ${MAX_FILE_SIZE_LIMIT} bytes`);
    }
    
    return num;
}

/**
 * Validate file naming strategy
 * @param {string} strategy - Naming strategy
 * @returns {string} Validated strategy
 */
function validateNamingStrategy(strategy) {
    if (!strategy || typeof strategy !== 'string') {
        return DEFAULT_FILE_NAMING;
    }
    
    const normalized = strategy.trim().toLowerCase();
    
    if (!VALID_NAMING_STRATEGIES.includes(normalized)) {
        throw new Error(`FILE_NAMING_STRATEGY must be one of: ${VALID_NAMING_STRATEGIES.join(', ')}`);
    }
    
    return normalized;
}

/**
 * Validate directory organization
 * @param {string} organization - Organization pattern
 * @returns {string} Validated organization
 */
function validateDirOrganization(organization) {
    if (!organization || typeof organization !== 'string') {
        return DEFAULT_DIR_ORGANIZATION;
    }
    
    const trimmed = organization.trim();
    
    if (trimmed.length === 0) {
        return DEFAULT_DIR_ORGANIZATION;
    }
    
    // Only allow safe characters
    if (!/^[a-zA-Z0-9/_\-]+$/.test(trimmed)) {
        throw new Error('DIR_ORGANIZATION contains invalid characters');
    }
    
    // Prevent path traversal
    if (trimmed.includes('..')) {
        throw new Error('DIR_ORGANIZATION contains path traversal sequences');
    }
    
    return trimmed;
}

/**
 * Validate S3 bucket
 * @param {string} bucket - S3 bucket name
 * @param {string} nodeEnv - Current environment
 * @returns {string} Validated bucket
 */
function validateS3Bucket(bucket, nodeEnv) {
    const isProduction = nodeEnv === 'production';
    
    if (!bucket || typeof bucket !== 'string') {
        if (isProduction) {
            throw new Error('S3_BUCKET is required in production when using S3 storage');
        }
        return '';
    }
    
    const trimmed = bucket.trim();
    
    if (trimmed.length === 0) {
        if (isProduction) {
            throw new Error('S3_BUCKET cannot be empty in production');
        }
        return '';
    }
    
    // S3 bucket naming rules: lowercase, numbers, hyphens, dots
    if (!/^[a-z0-9.-]+$/.test(trimmed)) {
        throw new Error('S3_BUCKET contains invalid characters');
    }
    
    return trimmed;
}

/**
 * Validate S3 region
 * @param {string} region - S3 region
 * @param {string} nodeEnv - Current environment
 * @returns {string} Validated region
 */
function validateS3Region(region, nodeEnv) {
    const isProduction = nodeEnv === 'production';
    
    if (!region || typeof region !== 'string') {
        if (isProduction) {
            throw new Error('S3_REGION is required in production when using S3 storage');
        }
        return '';
    }
    
    const trimmed = region.trim();
    
    if (trimmed.length === 0) {
        if (isProduction) {
            throw new Error('S3_REGION cannot be empty in production');
        }
        return '';
    }
    
    // Allow region formats like us-east-1, eu-west-1
    if (!/^[a-z0-9-]+$/.test(trimmed)) {
        throw new Error('S3_REGION contains invalid characters');
    }
    
    return trimmed;
}

/**
 * Validate S3 endpoint
 * @param {string} endpoint - S3 endpoint URL
 * @returns {string|null} Validated endpoint or null
 */
function validateS3Endpoint(endpoint) {
    if (!endpoint || typeof endpoint !== 'string') {
        return null;
    }
    
    const trimmed = endpoint.trim();
    
    if (trimmed.length === 0) {
        return null;
    }
    
    try {
        const url = new URL(trimmed);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new Error('S3_ENDPOINT must use HTTP or HTTPS protocol');
        }
        return url.toString().replace(/\/+$/, '');
    } catch {
        throw new Error('S3_ENDPOINT is not a valid URL');
    }
}

/**
 * Validate S3 access key ID
 * @param {string} keyId - S3 access key ID
 * @param {string} nodeEnv - Current environment
 * @returns {string} Validated access key ID
 */
function validateS3AccessKeyId(keyId, nodeEnv) {
    const isProduction = nodeEnv === 'production';
    
    if (!keyId || typeof keyId !== 'string') {
        if (isProduction) {
            throw new Error('S3_ACCESS_KEY_ID is required in production when using S3 storage');
        }
        return '';
    }
    
    const trimmed = keyId.trim();
    
    if (trimmed.length === 0) {
        if (isProduction) {
            throw new Error('S3_ACCESS_KEY_ID cannot be empty in production');
        }
        return '';
    }
    
    // Check for placeholder values
    const isPlaceholder = PLACEHOLDER_SECRETS.some(p =>
        trimmed.toLowerCase() === p.toLowerCase()
    );
    
    if (isPlaceholder && isProduction) {
        throw new Error('S3_ACCESS_KEY_ID uses a placeholder value - must be changed in production');
    }
    
    return trimmed;
}

/**
 * Validate S3 secret access key
 * @param {string} secret - S3 secret access key
 * @param {string} nodeEnv - Current environment
 * @returns {Object} Validation result
 */
function validateS3SecretAccessKey(secret, nodeEnv) {
    const isProduction = nodeEnv === 'production';
    
    if (!secret || typeof secret !== 'string') {
        if (isProduction) {
            throw new Error('S3_SECRET_ACCESS_KEY is required in production when using S3 storage');
        }
        return {
            valid: false,
            hasSecret: false,
            isPlaceholder: false,
            error: 'S3_SECRET_ACCESS_KEY is missing',
        };
    }
    
    const trimmed = secret.trim();
    
    if (trimmed.length === 0) {
        if (isProduction) {
            throw new Error('S3_SECRET_ACCESS_KEY cannot be empty in production');
        }
        return {
            valid: false,
            hasSecret: false,
            isPlaceholder: false,
            error: 'S3_SECRET_ACCESS_KEY is empty',
        };
    }
    
    // Check for placeholder values
    const isPlaceholder = PLACEHOLDER_SECRETS.some(p =>
        trimmed.toLowerCase() === p.toLowerCase()
    );
    
    if (isPlaceholder) {
        if (isProduction) {
            throw new Error('S3_SECRET_ACCESS_KEY uses a placeholder value - must be changed in production');
        }
        return {
            valid: false,
            hasSecret: false,
            isPlaceholder: true,
            error: 'S3_SECRET_ACCESS_KEY is a placeholder value',
        };
    }
    
    return {
        valid: true,
        hasSecret: true,
        isPlaceholder: false,
        secret: trimmed,
        error: null,
    };
}

/**
 * Validate public media URL
 * @param {string} url - Public media URL
 * @param {string} appUrl - Application URL for fallback
 * @param {string} siteUrl - Site URL for fallback
 * @returns {string} Validated URL
 */
function validatePublicMediaUrl(url, appUrl, siteUrl) {
    // If not provided, derive from APP_URL or SITE_URL
    if (!url || typeof url !== 'string' || url.trim() === '') {
        const baseUrl = appUrl || siteUrl || '';
        if (baseUrl) {
            return baseUrl.replace(/\/+$/, '') + '/uploads';
        }
        return '';
    }
    
    const trimmed = url.trim().replace(/\/+$/, '');
    
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new Error('Public media URL must use HTTP or HTTPS protocol');
        }
        return parsed.toString().replace(/\/+$/, '');
    } catch {
        throw new Error('STORAGE_PUBLIC_URL is not a valid URL');
    }
}

// ----------------------------------------------------------------------------
// 3. CONFIGURATION LOADER
// ----------------------------------------------------------------------------

/**
 * Load storage configuration from environment variables
 * @param {string} nodeEnv - Current Node environment
 * @param {string} appUrl - Application URL from app config
 * @param {string} siteUrl - Site URL from app config
 * @returns {Object} Immutable storage configuration
 */
function loadStorageConfig(nodeEnv = 'development', appUrl = '', siteUrl = '') {
    const isProduction = nodeEnv === 'production';
    
    // Parse driver
    const driver = validateDriver(process.env.STORAGE_DRIVER);
    
    // Parse local storage settings
    const uploadDir = validateUploadDir(process.env.UPLOAD_DIR, nodeEnv);
    const maxFileSize = validateMaxFileSize(process.env.MAX_FILE_SIZE);
    const fileNaming = validateNamingStrategy(process.env.FILE_NAMING_STRATEGY);
    const dirOrganization = validateDirOrganization(process.env.DIR_ORGANIZATION);
    const publicMediaUrl = validatePublicMediaUrl(
        process.env.STORAGE_PUBLIC_URL,
        appUrl,
        siteUrl
    );
    
    // Parse S3 settings if driver is S3
    let s3Config = null;
    let s3Secret = null;
    
    if (driver === 's3') {
        const bucket = validateS3Bucket(process.env.S3_BUCKET, nodeEnv);
        const region = validateS3Region(process.env.S3_REGION, nodeEnv);
        const endpoint = validateS3Endpoint(process.env.S3_ENDPOINT);
        const accessKeyId = validateS3AccessKeyId(process.env.S3_ACCESS_KEY_ID, nodeEnv);
        const secretResult = validateS3SecretAccessKey(process.env.S3_SECRET_ACCESS_KEY, nodeEnv);
        
        s3Secret = secretResult.hasSecret ? secretResult.secret : null;
        
        s3Config = {
            bucket,
            region,
            endpoint,
            accessKeyId,
            hasSecret: secretResult.hasSecret,
            isConfigured: bucket.length > 0 && region.length > 0 && accessKeyId.length > 0 && secretResult.hasSecret,
            isValid: secretResult.valid,
        };
    }
    
    // Determine if storage is configured
    let isConfigured = false;
    
    if (driver === 'local') {
        isConfigured = uploadDir.length > 0;
    } else if (driver === 's3') {
        isConfigured = s3Config ? s3Config.isConfigured : false;
    }
    
    // Build configuration
    const config = {
        driver,
        uploadDir,
        maxFileSize,
        fileNaming,
        dirOrganization,
        publicMediaUrl,
        isConfigured,
        isProduction,
        local: {
            driver: 'local',
            uploadDir,
            publicUrl: publicMediaUrl || '/uploads',
        },
        s3: s3Config,
        upload: {
            maxFileSize,
            allowedDrivers: VALID_DRIVERS,
            directory: uploadDir,
            naming: fileNaming,
            organization: dirOrganization,
        },
    };
    
    return Object.freeze(config);
}

// ----------------------------------------------------------------------------
// 4. SINGLETON CONFIGURATION
// ----------------------------------------------------------------------------

let _config = null;
let _s3Secret = null;

/**
 * Get the storage configuration (singleton)
 * @param {string} nodeEnv - Node environment (optional)
 * @param {string} appUrl - Application URL (optional)
 * @param {string} siteUrl - Site URL (optional)
 * @returns {Object} Immutable storage configuration
 */
function getStorageConfig(nodeEnv = process.env.NODE_ENV || 'development', appUrl = '', siteUrl = '') {
    if (_config === null) {
        const loaded = loadStorageConfig(nodeEnv, appUrl, siteUrl);
        // Store S3 secret internally
        if (loaded._s3Secret) {
            _s3Secret = loaded._s3Secret;
        }
        // Remove secret from config
        const { _s3Secret: _, ...safeConfig } = loaded;
        _config = Object.freeze(safeConfig);
    }
    return _config;
}

/**
 * Get S3 secret access key (for internal use only)
 * @returns {string|null} S3 secret or null if not available
 * @throws {Error} If secret is required but missing
 */
function getS3SecretAccessKey() {
    const config = getStorageConfig();
    if (config.driver !== 's3') {
        return null;
    }
    if (!config.s3 || !config.s3.hasSecret) {
        throw new Error('S3 secret access key is not configured');
    }
    return _s3Secret || null;
}

/**
 * Get local storage configuration
 * @returns {Object} Local storage configuration
 */
function getLocalStorageConfig() {
    const config = getStorageConfig();
    return Object.freeze({
        driver: 'local',
        uploadDir: config.uploadDir,
        publicUrl: config.publicMediaUrl || '/uploads',
        maxFileSize: config.maxFileSize,
        fileNaming: config.fileNaming,
        dirOrganization: config.dirOrganization,
    });
}

/**
 * Get upload configuration
 * @returns {Object} Upload configuration
 */
function getUploadConfig() {
    const config = getStorageConfig();
    return Object.freeze({
        maxFileSize: config.maxFileSize,
        allowedDrivers: config.upload.allowedDrivers,
        directory: config.upload.directory,
        naming: config.upload.naming,
        organization: config.upload.organization,
        publicUrl: config.publicMediaUrl,
    });
}

/**
 * Get public media URL
 * @returns {string} Public media URL
 */
function getPublicMediaUrl() {
    const config = getStorageConfig();
    return config.publicMediaUrl || '/uploads';
}

/**
 * Check if storage is configured
 * @returns {boolean} True if configured
 */
function isStorageConfigured() {
    const config = getStorageConfig();
    return config.isConfigured;
}

/**
 * Check if local storage is used
 * @returns {boolean} True if local
 */
function isLocalStorage() {
    const config = getStorageConfig();
    return config.driver === 'local';
}

/**
 * Check if S3 storage is used
 * @returns {boolean} True if S3
 */
function isS3Storage() {
    const config = getStorageConfig();
    return config.driver === 's3';
}

/**
 * Validate storage configuration
 * @returns {Object} Validation result
 */
function validateStorageConfig() {
    try {
        const config = getStorageConfig();
        const errors = [];
        const warnings = [];
        
        // Validate based on driver
        if (config.driver === 'local') {
            if (!config.uploadDir) {
                errors.push('UPLOAD_DIR is required for local storage');
            }
        }
        
        if (config.driver === 's3') {
            if (!config.s3 || !config.s3.isConfigured) {
                errors.push('S3 configuration is incomplete');
            }
            
            if (config.s3 && !config.s3.bucket) {
                errors.push('S3_BUCKET is required for S3 storage');
            }
            
            if (config.s3 && !config.s3.region) {
                errors.push('S3_REGION is required for S3 storage');
            }
            
            if (config.s3 && !config.s3.accessKeyId) {
                errors.push('S3_ACCESS_KEY_ID is required for S3 storage');
            }
            
            if (config.s3 && !config.s3.hasSecret) {
                errors.push('S3_SECRET_ACCESS_KEY is required for S3 storage');
            }
        }
        
        if (config.maxFileSize < MIN_FILE_SIZE_LIMIT) {
            warnings.push(`MAX_FILE_SIZE (${config.maxFileSize} bytes) is very small`);
        }
        
        if (config.maxFileSize > 10 * 1024 * 1024) {
            warnings.push(`MAX_FILE_SIZE (${config.maxFileSize} bytes) is large - consider limiting uploads`);
        }
        
        if (config.driver === 's3' && config.isProduction && config.s3 && !config.s3.endpoint) {
            warnings.push('S3_ENDPOINT not configured - using AWS default endpoint');
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            config: {
                driver: config.driver,
                uploadDir: config.uploadDir || '(not configured)',
                maxFileSize: config.maxFileSize,
                fileNaming: config.fileNaming,
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
    getStorageConfig,
    getS3SecretAccessKey,
    getLocalStorageConfig,
    getUploadConfig,
    getPublicMediaUrl,
    isStorageConfigured,
    isLocalStorage,
    isS3Storage,
    validateStorageConfig,
    loadStorageConfig,
    VALID_DRIVERS,
    VALID_NAMING_STRATEGIES,
    DEFAULT_MAX_FILE_SIZE,
};

export default {
    getStorageConfig,
    getS3SecretAccessKey,
    getLocalStorageConfig,
    getUploadConfig,
    getPublicMediaUrl,
    isStorageConfigured,
    isLocalStorage,
    isS3Storage,
    validateStorageConfig,
    loadStorageConfig,
    VALID_DRIVERS,
    VALID_NAMING_STRATEGIES,
    DEFAULT_MAX_FILE_SIZE,
};