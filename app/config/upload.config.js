/**
 * app/config/upload.config.js
 * Centralized upload configuration for Tesnow
 * High-security configuration for file uploads, media validation, and storage policies
 * 
 * @module config/upload.config
 */

// ----------------------------------------------------------------------------
// 1. CONSTANTS & DEFAULTS
// ----------------------------------------------------------------------------

const DEFAULT_UPLOAD_ENABLED = true;
const DEFAULT_UPLOAD_DRIVER = 'local';
const DEFAULT_UPLOAD_DIR = './storage/uploads';
const DEFAULT_UPLOAD_TEMP_DIR = './storage/tmp';
const DEFAULT_UPLOAD_MAX_FILE_SIZE = 5242880; // 5 MB
const DEFAULT_UPLOAD_MAX_FILES = 10;
const DEFAULT_UPLOAD_MAX_FILENAME_LENGTH = 180;
const DEFAULT_UPLOAD_MAX_PATH_LENGTH = 500;
const DEFAULT_UPLOAD_ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
];
const DEFAULT_UPLOAD_ALLOWED_EXTENSIONS = [
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.gif',
    '.pdf',
];
const DEFAULT_UPLOAD_IMAGE_MAX_WIDTH = 4096;
const DEFAULT_UPLOAD_IMAGE_MAX_HEIGHT = 4096;
const DEFAULT_UPLOAD_IMAGE_MAX_PIXELS = 16777216; // 4096 * 4096
const DEFAULT_UPLOAD_REJECT_DOUBLE_EXTENSIONS = true;
const DEFAULT_UPLOAD_REJECT_HIDDEN_FILES = true;
const DEFAULT_UPLOAD_REJECT_SYMLINKS = true;
const DEFAULT_UPLOAD_GENERATE_SAFE_FILENAMES = true;
const DEFAULT_UPLOAD_PRESERVE_ORIGINAL_NAME = true;
const DEFAULT_UPLOAD_CHECKSUM_ENABLED = true;
const DEFAULT_UPLOAD_CHECKSUM_ALGORITHM = 'sha256';
const DEFAULT_UPLOAD_QUARANTINE_ENABLED = true;
const DEFAULT_UPLOAD_QUARANTINE_DIR = './storage/quarantine';
const DEFAULT_UPLOAD_CLEANUP_TEMP_AFTER_MS = 3600000; // 1 hour

const VALID_DRIVERS = ['local', 's3', 'none'];
const VALID_CHECKSUM_ALGORITHMS = ['sha256', 'sha512'];
const MIN_FILE_SIZE = 1;
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const MIN_MAX_FILES = 1;
const MAX_MAX_FILES = 100;
const MIN_MAX_FILENAME_LENGTH = 1;
const MAX_MAX_FILENAME_LENGTH = 255;
const MIN_MAX_PATH_LENGTH = 1;
const MAX_MAX_PATH_LENGTH = 1024;
const MIN_IMAGE_DIMENSION = 1;
const MAX_IMAGE_DIMENSION = 16384;
const MIN_IMAGE_PIXELS = 1;
const MAX_IMAGE_PIXELS = 268435456; // 16384 * 16384
const MIN_CLEANUP_MS = 60000; // 1 minute
const MAX_CLEANUP_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
 * Validate upload driver
 * @param {string} driver - Upload driver
 * @param {boolean} enabled - Whether uploads are enabled
 * @returns {string} Validated driver
 */
function validateDriver(driver, enabled) {
    if (!driver || typeof driver !== 'string') {
        return enabled ? DEFAULT_UPLOAD_DRIVER : 'none';
    }
    
    const normalized = driver.trim().toLowerCase();
    
    if (!VALID_DRIVERS.includes(normalized)) {
        throw new Error(`UPLOAD_DRIVER must be one of: ${VALID_DRIVERS.join(', ')}`);
    }
    
    // If uploads are disabled, force driver to 'none'
    if (!enabled) {
        return 'none';
    }
    
    return normalized;
}

/**
 * Validate safe path
 * @param {string} path - Path to validate
 * @param {string} defaultValue - Default if empty
 * @param {string} name - Name for error messages
 * @param {boolean} required - Whether path is required
 * @returns {string} Validated path
 */
function validateSafePath(path, defaultValue, name, required = false) {
    if (path === null || path === undefined || path === '') {
        if (required) {
            throw new Error(`${name} cannot be empty`);
        }
        return defaultValue || '';
    }
    
    if (typeof path !== 'string') {
        throw new Error(`${name} must be a string`);
    }
    
    const trimmed = path.trim();
    
    if (trimmed.length === 0) {
        if (required) {
            throw new Error(`${name} cannot be empty`);
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
    
    // Check for path traversal attempts
    if (trimmed.includes('..')) {
        throw new Error(`${name} contains path traversal sequences`);
    }
    
    // Only allow safe characters for paths
    if (!/^[a-zA-Z0-9\-_./]+$/.test(trimmed)) {
        throw new Error(`${name} contains invalid characters`);
    }
    
    return trimmed;
}

/**
 * Validate MIME types
 * @param {string} mimeTypes - Comma-separated MIME types
 * @param {Array} defaultValue - Default MIME types
 * @returns {Array} Validated MIME types
 */
function validateMimeTypes(mimeTypes, defaultValue) {
    if (!mimeTypes || typeof mimeTypes !== 'string') {
        return defaultValue;
    }
    
    const trimmed = mimeTypes.trim();
    
    if (trimmed.length === 0) {
        return defaultValue;
    }
    
    const types = trimmed.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0);
    
    if (types.length === 0) {
        return defaultValue;
    }
    
    // Validate each MIME type
    for (const type of types) {
        // Basic MIME type format: type/subtype
        if (!/^[a-z0-9\-+]+(?:\/[a-z0-9\-+]+)$/.test(type)) {
            throw new Error(`Invalid MIME type: ${type}`);
        }
        
        // Reject dangerous wildcard patterns unless explicitly allowed
        if (type === '*/*') {
            throw new Error('Wildcard MIME types are not allowed');
        }
    }
    
    return types;
}

/**
 * Validate file extensions
 * @param {string} extensions - Comma-separated extensions
 * @param {Array} defaultValue - Default extensions
 * @returns {Array} Validated extensions
 */
function validateExtensions(extensions, defaultValue) {
    if (!extensions || typeof extensions !== 'string') {
        return defaultValue;
    }
    
    const trimmed = extensions.trim();
    
    if (trimmed.length === 0) {
        return defaultValue;
    }
    
    const extList = trimmed.split(',').map(e => e.trim().toLowerCase()).filter(e => e.length > 0);
    
    if (extList.length === 0) {
        return defaultValue;
    }
    
    // Validate each extension
    for (const ext of extList) {
        // Must start with .
        if (!ext.startsWith('.')) {
            throw new Error(`Extension must start with '.': ${ext}`);
        }
        
        // Only allow safe characters
        if (!/^\.[a-z0-9]+$/.test(ext)) {
            throw new Error(`Invalid extension: ${ext}`);
        }
        
        // Reject executable extensions (security)
        const dangerousExtensions = ['.exe', '.bat', '.cmd', '.com', '.scr', '.js', '.jar', '.php', '.pl', '.py', '.rb', '.sh'];
        if (dangerousExtensions.includes(ext)) {
            throw new Error(`Dangerous extension not allowed: ${ext}`);
        }
    }
    
    return extList;
}

/**
 * Validate checksum algorithm
 * @param {string} algorithm - Checksum algorithm
 * @param {string} defaultValue - Default algorithm
 * @returns {string} Validated algorithm
 */
function validateChecksumAlgorithm(algorithm, defaultValue) {
    if (!algorithm || typeof algorithm !== 'string') {
        return defaultValue;
    }
    
    const normalized = algorithm.trim().toLowerCase();
    
    if (!VALID_CHECKSUM_ALGORITHMS.includes(normalized)) {
        throw new Error(`Checksum algorithm must be one of: ${VALID_CHECKSUM_ALGORITHMS.join(', ')}`);
    }
    
    return normalized;
}

// ----------------------------------------------------------------------------
// 3. CONFIGURATION LOADER
// ----------------------------------------------------------------------------

/**
 * Load upload configuration from environment variables
 * @param {string} nodeEnv - Current Node environment
 * @returns {Object} Immutable upload configuration
 */
function loadUploadConfig(nodeEnv = 'development') {
    const isProduction = nodeEnv === 'production';
    
    // Parse enabled flag
    const enabled = parseBoolean(process.env.UPLOAD_ENABLED, DEFAULT_UPLOAD_ENABLED);
    
    // Parse driver
    const driver = validateDriver(process.env.UPLOAD_DRIVER, enabled);
    
    // Parse paths
    const uploadDir = validateSafePath(
        process.env.UPLOAD_DIR,
        DEFAULT_UPLOAD_DIR,
        'UPLOAD_DIR',
        driver === 'local'
    );
    
    const tempDir = validateSafePath(
        process.env.UPLOAD_TEMP_DIR,
        DEFAULT_UPLOAD_TEMP_DIR,
        'UPLOAD_TEMP_DIR',
        driver === 'local'
    );
    
    const quarantineDir = validateSafePath(
        process.env.UPLOAD_QUARANTINE_DIR,
        DEFAULT_UPLOAD_QUARANTINE_DIR,
        'UPLOAD_QUARANTINE_DIR',
        driver === 'local' && parseBoolean(process.env.UPLOAD_QUARANTINE_ENABLED, DEFAULT_UPLOAD_QUARANTINE_ENABLED)
    );
    
    // Parse file limits
    let maxFileSize, maxFiles;
    if (enabled && driver !== 'none') {
        maxFileSize = parsePositiveInteger(
            process.env.UPLOAD_MAX_FILE_SIZE,
            DEFAULT_UPLOAD_MAX_FILE_SIZE,
            MIN_FILE_SIZE,
            MAX_FILE_SIZE
        );
        
        maxFiles = parsePositiveInteger(
            process.env.UPLOAD_MAX_FILES,
            DEFAULT_UPLOAD_MAX_FILES,
            MIN_MAX_FILES,
            MAX_MAX_FILES
        );
    } else {
        maxFileSize = DEFAULT_UPLOAD_MAX_FILE_SIZE;
        maxFiles = DEFAULT_UPLOAD_MAX_FILES;
    }
    
    // Parse filename limits
    const maxFilenameLength = parsePositiveInteger(
        process.env.UPLOAD_MAX_FILENAME_LENGTH,
        DEFAULT_UPLOAD_MAX_FILENAME_LENGTH,
        MIN_MAX_FILENAME_LENGTH,
        MAX_MAX_FILENAME_LENGTH
    );
    
    const maxPathLength = parsePositiveInteger(
        process.env.UPLOAD_MAX_PATH_LENGTH,
        DEFAULT_UPLOAD_MAX_PATH_LENGTH,
        MIN_MAX_PATH_LENGTH,
        MAX_MAX_PATH_LENGTH
    );
    
    // Parse MIME types and extensions
    const allowedMimeTypes = validateMimeTypes(
        process.env.UPLOAD_ALLOWED_MIME_TYPES,
        DEFAULT_UPLOAD_ALLOWED_MIME_TYPES
    );
    
    const allowedExtensions = validateExtensions(
        process.env.UPLOAD_ALLOWED_EXTENSIONS,
        DEFAULT_UPLOAD_ALLOWED_EXTENSIONS
    );
    
    // Parse image limits
    let imageMaxWidth, imageMaxHeight, imageMaxPixels;
    if (enabled && driver !== 'none') {
        imageMaxWidth = parsePositiveInteger(
            process.env.UPLOAD_IMAGE_MAX_WIDTH,
            DEFAULT_UPLOAD_IMAGE_MAX_WIDTH,
            MIN_IMAGE_DIMENSION,
            MAX_IMAGE_DIMENSION
        );
        
        imageMaxHeight = parsePositiveInteger(
            process.env.UPLOAD_IMAGE_MAX_HEIGHT,
            DEFAULT_UPLOAD_IMAGE_MAX_HEIGHT,
            MIN_IMAGE_DIMENSION,
            MAX_IMAGE_DIMENSION
        );
        
        imageMaxPixels = parsePositiveInteger(
            process.env.UPLOAD_IMAGE_MAX_PIXELS,
            DEFAULT_UPLOAD_IMAGE_MAX_PIXELS,
            MIN_IMAGE_PIXELS,
            MAX_IMAGE_PIXELS
        );
    } else {
        imageMaxWidth = DEFAULT_UPLOAD_IMAGE_MAX_WIDTH;
        imageMaxHeight = DEFAULT_UPLOAD_IMAGE_MAX_HEIGHT;
        imageMaxPixels = DEFAULT_UPLOAD_IMAGE_MAX_PIXELS;
    }
    
    // Parse security flags
    const rejectDoubleExtensions = parseBoolean(
        process.env.UPLOAD_REJECT_DOUBLE_EXTENSIONS,
        DEFAULT_UPLOAD_REJECT_DOUBLE_EXTENSIONS
    );
    
    const rejectHiddenFiles = parseBoolean(
        process.env.UPLOAD_REJECT_HIDDEN_FILES,
        DEFAULT_UPLOAD_REJECT_HIDDEN_FILES
    );
    
    const rejectSymlinks = parseBoolean(
        process.env.UPLOAD_REJECT_SYMLINKS,
        DEFAULT_UPLOAD_REJECT_SYMLINKS
    );
    
    // Parse filename handling
    const generateSafeFilenames = parseBoolean(
        process.env.UPLOAD_GENERATE_SAFE_FILENAMES,
        DEFAULT_UPLOAD_GENERATE_SAFE_FILENAMES
    );
    
    const preserveOriginalName = parseBoolean(
        process.env.UPLOAD_PRESERVE_ORIGINAL_NAME,
        DEFAULT_UPLOAD_PRESERVE_ORIGINAL_NAME
    );
    
    // Parse checksum
    const checksumEnabled = parseBoolean(
        process.env.UPLOAD_CHECKSUM_ENABLED,
        DEFAULT_UPLOAD_CHECKSUM_ENABLED
    );
    
    const checksumAlgorithm = validateChecksumAlgorithm(
        process.env.UPLOAD_CHECKSUM_ALGORITHM,
        DEFAULT_UPLOAD_CHECKSUM_ALGORITHM
    );
    
    // Parse quarantine
    const quarantineEnabled = parseBoolean(
        process.env.UPLOAD_QUARANTINE_ENABLED,
        DEFAULT_UPLOAD_QUARANTINE_ENABLED
    );
    
    // Parse temp cleanup
    let cleanupTempAfterMs;
    if (enabled && driver !== 'none') {
        cleanupTempAfterMs = parsePositiveInteger(
            process.env.UPLOAD_CLEANUP_TEMP_AFTER_MS,
            DEFAULT_UPLOAD_CLEANUP_TEMP_AFTER_MS,
            MIN_CLEANUP_MS,
            MAX_CLEANUP_MS
        );
    } else {
        cleanupTempAfterMs = DEFAULT_UPLOAD_CLEANUP_TEMP_AFTER_MS;
    }
    
    // Build S3 config (future)
    const s3Config = {
        bucket: process.env.UPLOAD_S3_BUCKET || '',
        region: process.env.UPLOAD_S3_REGION || '',
        endpoint: process.env.UPLOAD_S3_ENDPOINT || '',
        publicUrl: process.env.UPLOAD_S3_PUBLIC_URL || '',
        forcePathStyle: parseBoolean(
            process.env.UPLOAD_S3_FORCE_PATH_STYLE,
            false
        ),
    };
    
    // Build configuration
    const config = {
        enabled,
        driver,
        isProduction,
        paths: {
            upload: uploadDir,
            temp: tempDir,
            quarantine: quarantineEnabled ? quarantineDir : '',
        },
        limits: {
            maxFileSize,
            maxFiles,
            maxFilenameLength,
            maxPathLength,
        },
        allowedMimeTypes,
        allowedExtensions,
        image: {
            maxWidth: imageMaxWidth,
            maxHeight: imageMaxHeight,
            maxPixels: imageMaxPixels,
        },
        security: {
            rejectDoubleExtensions,
            rejectHiddenFiles,
            rejectSymlinks,
        },
        filename: {
            generateSafeFilenames,
            preserveOriginalName,
        },
        checksum: {
            enabled: checksumEnabled,
            algorithm: checksumAlgorithm,
        },
        quarantine: {
            enabled: quarantineEnabled,
            dir: quarantineDir,
        },
        cleanup: {
            tempAfterMs: cleanupTempAfterMs,
        },
        s3: s3Config,
        isConfigured: enabled && driver !== 'none',
    };
    
    return Object.freeze(config);
}

// ----------------------------------------------------------------------------
// 4. SINGLETON CONFIGURATION
// ----------------------------------------------------------------------------

let _config = null;

/**
 * Get the upload configuration (singleton)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Immutable upload configuration
 */
function getUploadConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    if (_config === null) {
        _config = loadUploadConfig(nodeEnv);
    }
    return _config;
}

/**
 * Get safe upload configuration (for logging/diagnostics)
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Safe upload configuration
 */
function getSafeUploadConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    const config = getUploadConfig(nodeEnv);
    
    const safe = {
        enabled: config.enabled,
        driver: config.driver,
        isProduction: config.isProduction,
        paths: {
            upload: config.paths.upload || '(not configured)',
            temp: config.paths.temp || '(not configured)',
            quarantine: config.paths.quarantine || '(not configured)',
        },
        limits: {
            maxFileSize: config.limits.maxFileSize,
            maxFiles: config.limits.maxFiles,
            maxFilenameLength: config.limits.maxFilenameLength,
            maxPathLength: config.limits.maxPathLength,
        },
        allowedMimeTypes: config.allowedMimeTypes,
        allowedExtensions: config.allowedExtensions,
        image: {
            maxWidth: config.image.maxWidth,
            maxHeight: config.image.maxHeight,
            maxPixels: config.image.maxPixels,
        },
        security: {
            rejectDoubleExtensions: config.security.rejectDoubleExtensions,
            rejectHiddenFiles: config.security.rejectHiddenFiles,
            rejectSymlinks: config.security.rejectSymlinks,
        },
        filename: {
            generateSafeFilenames: config.filename.generateSafeFilenames,
            preserveOriginalName: config.filename.preserveOriginalName,
        },
        checksum: {
            enabled: config.checksum.enabled,
            algorithm: config.checksum.algorithm,
        },
        quarantine: {
            enabled: config.quarantine.enabled,
        },
        cleanup: {
            tempAfterMs: config.cleanup.tempAfterMs,
        },
        s3: {
            hasBucket: !!config.s3.bucket,
            hasRegion: !!config.s3.region,
            hasEndpoint: !!config.s3.endpoint,
            hasPublicUrl: !!config.s3.publicUrl,
            forcePathStyle: config.s3.forcePathStyle,
        },
        isConfigured: config.isConfigured,
    };
    
    return Object.freeze(safe);
}

/**
 * Validate upload configuration
 * @param {string} nodeEnv - Node environment (optional)
 * @returns {Object} Validation result
 */
function validateUploadConfig(nodeEnv = process.env.NODE_ENV || 'development') {
    try {
        const config = getUploadConfig(nodeEnv);
        const errors = [];
        const warnings = [];
        
        // Validate driver-specific requirements
        if (config.driver === 'local') {
            if (!config.paths.upload) {
                errors.push('UPLOAD_DIR is required for local driver');
            }
            if (!config.paths.temp) {
                errors.push('UPLOAD_TEMP_DIR is required for local driver');
            }
        }
        
        if (config.driver === 's3') {
            if (!config.s3.bucket) {
                errors.push('UPLOAD_S3_BUCKET is required for S3 driver');
            }
            if (!config.s3.region) {
                errors.push('UPLOAD_S3_REGION is required for S3 driver');
            }
        }
        
        // Validate allowed MIME types and extensions consistency
        if (config.allowedMimeTypes.length === 0) {
            warnings.push('No MIME types are allowed - uploads will be blocked');
        }
        
        if (config.allowedExtensions.length === 0) {
            warnings.push('No extensions are allowed - uploads will be blocked');
        }
        
        // Validate security settings
        if (config.isProduction && config.security.rejectSymlinks === false) {
            warnings.push('Symlinks are allowed in production - security risk');
        }
        
        if (config.isProduction && config.quarantine.enabled === false) {
            warnings.push('Quarantine is disabled in production - security risk');
        }
        
        if (config.isProduction && config.checksum.enabled === false) {
            warnings.push('Checksum is disabled in production - data integrity risk');
        }
        
        // Validate file size limits
        if (config.limits.maxFileSize > 10 * 1024 * 1024) {
            warnings.push(`MAX_FILE_SIZE (${config.limits.maxFileSize} bytes) is large - may impact performance`);
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            config: getSafeUploadConfig(nodeEnv),
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
    getUploadConfig,
    getSafeUploadConfig,
    validateUploadConfig,
    loadUploadConfig,
    parseBoolean,
    VALID_DRIVERS,
    VALID_CHECKSUM_ALGORITHMS,
    DEFAULT_UPLOAD_MAX_FILE_SIZE,
    DEFAULT_UPLOAD_MAX_FILES,
};

export default {
    getUploadConfig,
    getSafeUploadConfig,
    validateUploadConfig,
    loadUploadConfig,
    parseBoolean,
    VALID_DRIVERS,
    VALID_CHECKSUM_ALGORITHMS,
    DEFAULT_UPLOAD_MAX_FILE_SIZE,
    DEFAULT_UPLOAD_MAX_FILES,
};