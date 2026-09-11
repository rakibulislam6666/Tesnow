/**
 * app/core/errors.js
 * Centralized error architecture for Tesnow
 * Production-grade, secure, and scalable error handling
 */

// ----------------------------------------------------------------------------
// 1. ERROR CODES
// ----------------------------------------------------------------------------

export const ErrorCodes = {
    // Client Errors (4xx)
    BAD_REQUEST: 'BAD_REQUEST',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
    CONFLICT: 'CONFLICT',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    RATE_LIMITED: 'RATE_LIMITED',
    CSRF_ERROR: 'CSRF_ERROR',
    PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
    UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
    REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',

    // Authentication/Authorization
    AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
    SESSION_INVALID: 'SESSION_INVALID',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    TOKEN_INVALID: 'TOKEN_INVALID',
    INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',

    // Server Errors (5xx)
    INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    DATABASE_ERROR: 'DATABASE_ERROR',
    DATABASE_CONNECTION_ERROR: 'DATABASE_CONNECTION_ERROR',
    DATABASE_TIMEOUT: 'DATABASE_TIMEOUT',
    DATABASE_LOCK_ERROR: 'DATABASE_LOCK_ERROR',
    DATABASE_DEADLOCK: 'DATABASE_DEADLOCK',
    FILE_SYSTEM_ERROR: 'FILE_SYSTEM_ERROR',
    CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
    DEPENDENCY_ERROR: 'DEPENDENCY_ERROR',
    CACHE_ERROR: 'CACHE_ERROR',
    QUEUE_ERROR: 'QUEUE_ERROR',
    EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
};

// ----------------------------------------------------------------------------
// 2. HTTP STATUS CODE MAPPING
// ----------------------------------------------------------------------------

export const HttpStatusMap = {
    [ErrorCodes.BAD_REQUEST]: 400,
    [ErrorCodes.UNAUTHORIZED]: 401,
    [ErrorCodes.FORBIDDEN]: 403,
    [ErrorCodes.NOT_FOUND]: 404,
    [ErrorCodes.METHOD_NOT_ALLOWED]: 405,
    [ErrorCodes.CONFLICT]: 409,
    [ErrorCodes.VALIDATION_ERROR]: 422,
    [ErrorCodes.RATE_LIMITED]: 429,
    [ErrorCodes.CSRF_ERROR]: 403,
    [ErrorCodes.PAYLOAD_TOO_LARGE]: 413,
    [ErrorCodes.UNSUPPORTED_MEDIA_TYPE]: 415,
    [ErrorCodes.REQUEST_TIMEOUT]: 408,
    [ErrorCodes.AUTHENTICATION_FAILED]: 401,
    [ErrorCodes.SESSION_INVALID]: 401,
    [ErrorCodes.TOKEN_EXPIRED]: 401,
    [ErrorCodes.TOKEN_INVALID]: 401,
    [ErrorCodes.INSUFFICIENT_PERMISSIONS]: 403,
    [ErrorCodes.INTERNAL_SERVER_ERROR]: 500,
    [ErrorCodes.SERVICE_UNAVAILABLE]: 503,
    [ErrorCodes.DATABASE_ERROR]: 500,
    [ErrorCodes.DATABASE_CONNECTION_ERROR]: 503,
    [ErrorCodes.DATABASE_TIMEOUT]: 504,
    [ErrorCodes.DATABASE_LOCK_ERROR]: 409,
    [ErrorCodes.DATABASE_DEADLOCK]: 409,
    [ErrorCodes.FILE_SYSTEM_ERROR]: 500,
    [ErrorCodes.CONFIGURATION_ERROR]: 500,
    [ErrorCodes.DEPENDENCY_ERROR]: 503,
    [ErrorCodes.CACHE_ERROR]: 500,
    [ErrorCodes.QUEUE_ERROR]: 500,
    [ErrorCodes.EXTERNAL_SERVICE_ERROR]: 503,
};

// ----------------------------------------------------------------------------
// 3. DATABASE ERROR MAPPING
// ----------------------------------------------------------------------------

export const DatabaseErrorMap = {
    'ER_DUP_ENTRY': {
        code: ErrorCodes.CONFLICT,
        message: 'Resource already exists',
        statusCode: 409,
    },
    'ER_NO_REFERENCED_ROW_2': {
        code: ErrorCodes.BAD_REQUEST,
        message: 'Referenced resource does not exist',
        statusCode: 400,
    },
    'ER_ROW_IS_REFERENCED_2': {
        code: ErrorCodes.CONFLICT,
        message: 'Resource is in use and cannot be modified',
        statusCode: 409,
    },
    'ER_BAD_FIELD_ERROR': {
        code: ErrorCodes.INTERNAL_SERVER_ERROR,
        message: 'Database error occurred',
        statusCode: 500,
    },
    'ER_NO_SUCH_TABLE': {
        code: ErrorCodes.DATABASE_ERROR,
        message: 'Database error occurred',
        statusCode: 500,
    },
    'ER_LOCK_DEADLOCK': {
        code: ErrorCodes.DATABASE_DEADLOCK,
        message: 'Database operation conflict, please retry',
        statusCode: 409,
    },
    'ER_LOCK_WAIT_TIMEOUT': {
        code: ErrorCodes.DATABASE_TIMEOUT,
        message: 'Database operation timed out, please retry',
        statusCode: 504,
    },
};

// ----------------------------------------------------------------------------
// 4. SANITIZATION PRIMITIVES (internal)
// ----------------------------------------------------------------------------

const DANGEROUS_KEYS = new Set([
    '__proto__',
    'constructor',
    'prototype',
]);

const SENSITIVE_KEYS = new Set([
    // auth
    'password', 'passwd', 'pwd', 'passphrase',
    'token', 'access_token', 'accesstoken', 'refresh_token', 'refreshtoken',
    'id_token', 'idtoken', 'bearer', 'jwt',
    'secret', 'client_secret', 'clientsecret',
    'api_key', 'apikey', 'apisecret', 'api_secret',
    'authorization', 'auth', 'credentials', 'credential',
    'private_key', 'privatekey',
    'oauth', 'oauth_token', 'oauthtoken',
    'cookie', 'set-cookie', 'session', 'session_id', 'sessionid',
    'x-api-key', 'x-auth-token',
    // pii
    'ssn', 'social_security', 'socialsecurity',
    'credit_card', 'creditcard', 'card_number', 'cardnumber',
    'cvv', 'cvc', 'pin',
    // infra
    'sql', 'sql_message', 'sqlmessage',
    'connection', 'connection_string', 'connectionstring',
    'db', 'database', 'dsn',
    'key', 'secret_key', 'secretkey',
]);

// Text-level redaction patterns — applied to every string value encountered
// during deepSanitize / serializeCauseForDebug. This catches sensitive data
// embedded inside otherwise innocent-looking strings (error messages, URLs).
const TEXT_REDACT_PATTERNS = [
    // scheme://user:pass@host  →  scheme://[REDACTED]@host
    {
        re: /([a-z][a-z0-9+.\-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi,
        replace: '$1[REDACTED]@',
    },
    // Bearer / Basic / Token <credential>
    {
        re: /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=\-]+/gi,
        replace: '$1 [REDACTED]',
    },
    // JWT (three base64url segments)
    {
        re: /\beyJ[A-Za-z0-9_\-]{5,}\.[A-Za-z0-9_\-]{5,}\.[A-Za-z0-9_\-]{5,}\b/g,
        replace: '[JWT]',
    },
    // AWS Access Key ID
    {
        re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g,
        replace: '[AWS_KEY]',
    },
    // key=value / key: value for well-known sensitive keys
    {
        re: /\b(password|passwd|pwd|passphrase|token|secret|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|auth|authorization|credential|client[_-]?secret|private[_-]?key|session[_-]?id)\b(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;"']+)/gi,
        replace: '$1$2[REDACTED]',
    },
];

// Error-own-property allowlist — only these are carried through in debug cause
// serialization. Everything else (path, url, src, dest, …) is dropped because
// it can carry credentials or PII.
const SAFE_CAUSE_FIELDS = new Set([
    'code',
    'errno',
    'syscall',
    'statusCode',
    'status',
    'type',
    'method',
]);

const MAX_SANITIZE_DEPTH = 8;
const MAX_STACK_LEN = 4000;
const MAX_MESSAGE_LEN = 2000;
const MAX_IDENTIFIER_LEN = 128;

/**
 * Redact well-known secret patterns from any string.
 * @param {string} input
 * @param {number} [maxLen=0]  0 = no truncation
 * @returns {string}
 */
function redactText(input, maxLen = 0) {
    if (typeof input !== 'string' || input.length === 0) return input;
    let out = input;
    for (const { re, replace } of TEXT_REDACT_PATTERNS) {
        out = out.replace(re, replace);
    }
    if (maxLen > 0 && out.length > maxLen) {
        out = out.slice(0, maxLen) + '...[truncated]';
    }
    return out;
}

/**
 * Coerce any value into a short, log-safe identifier string.
 * Preserves primitives; sanitizes objects; strips control chars; caps length.
 * @param {*} value
 * @param {number} [maxLen]
 * @returns {string|null}
 */
function sanitizeIdentifier(value, maxLen = MAX_IDENTIFIER_LEN) {
    if (value === null || value === undefined) return null;

    if (typeof value === 'string') {
        const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLen);
        return cleaned.length > 0 ? cleaned : null;
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
        return String(value).slice(0, maxLen);
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }

    // Non-primitive: sanitize then stringify safely.
    try {
        const safe = deepSanitize(value);
        const s = JSON.stringify(safe);
        if (typeof s !== 'string') return null;
        return s.length > maxLen ? s.slice(0, maxLen) : s;
    } catch {
        return null;
    }
}

/**
 * Recursively strip sensitive fields, redact sensitive text, and prevent
 * prototype pollution. Safe against circular refs, deep nesting, throwing
 * getters, non-plain objects, BigInt, Buffer, ArrayBuffer, TypedArray,
 * Map, Set.
 * @param {*} value
 * @param {Object} [options]
 * @returns {*}
 */
function deepSanitize(value, options = {}) {
    const {
        maxDepth = MAX_SANITIZE_DEPTH,
        depth = 0,
        seen = new WeakSet(),
    } = options;

    if (value === null || value === undefined) return value;

    const t = typeof value;

    if (t === 'string') return redactText(value);
    if (t === 'boolean' || t === 'number') return value;
    if (t === 'bigint') return value.toString();
    if (t === 'function' || t === 'symbol') return undefined;
    if (t !== 'object') return undefined;

    if (depth >= maxDepth) return '[Truncated]';

    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    if (value instanceof Date) return value.toISOString();
    if (value instanceof RegExp) return value.toString();
    if (value instanceof Error) {
        return {
            name: typeof value.name === 'string' ? value.name : 'Error',
            message: '[Redacted]',
        };
    }
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
        return `[Buffer length=${value.length}]`;
    }
    if (value instanceof ArrayBuffer) {
        return `[ArrayBuffer byteLength=${value.byteLength}]`;
    }
    if (ArrayBuffer.isView(value)) {
        return `[${value.constructor?.name || 'TypedArray'} length=${value.length ?? 0}]`;
    }

    if (Array.isArray(value)) {
        return value.map((item) =>
            deepSanitize(item, { maxDepth, depth: depth + 1, seen })
        );
    }

    if (value instanceof Map) {
        const out = {};
        for (const [k, v] of value.entries()) {
            if (typeof k !== 'string') continue;
            if (DANGEROUS_KEYS.has(k)) continue;
            if (SENSITIVE_KEYS.has(k.toLowerCase())) continue;
            out[k] = deepSanitize(v, { maxDepth, depth: depth + 1, seen });
        }
        return out;
    }

    if (value instanceof Set) {
        return Array.from(value).map((item) =>
            deepSanitize(item, { maxDepth, depth: depth + 1, seen })
        );
    }

    const out = {};
    for (const key of Object.keys(value)) {
        if (DANGEROUS_KEYS.has(key)) continue;
        if (SENSITIVE_KEYS.has(key.toLowerCase())) continue;
        try {
            out[key] = deepSanitize(value[key], {
                maxDepth,
                depth: depth + 1,
                seen,
            });
        } catch {
            // Ignore throwing getters.
        }
    }
    return out;
}

function hasContent(value) {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
}

/**
 * Serialize a cause safely for development responses and internal logs.
 *
 * Policy (consistent with deepSanitize):
 *   - Error `message` and `stack` pass through redactText()
 *   - Only SAFE_CAUSE_FIELDS are carried from Error own-properties
 *   - Nested `cause` recurses with the same rules
 *   - Non-Error values are deepSanitize()'d
 *   - Depth-limited and circular-safe
 */
function serializeCauseForDebug(cause, depth = 0, seen = new WeakSet()) {
    if (cause === null || cause === undefined) return undefined;
    if (depth > 3) return '[Truncated]';

    if (cause instanceof Error) {
        if (seen.has(cause)) return '[Circular]';
        seen.add(cause);

        const out = {
            name: typeof cause.name === 'string' ? cause.name.slice(0, 100) : 'Error',
            message: redactText(
                typeof cause.message === 'string' ? cause.message : '',
                MAX_MESSAGE_LEN
            ),
        };

        if (typeof cause.stack === 'string') {
            out.stack = redactText(cause.stack, MAX_STACK_LEN);
        }

        // Only allowlisted own properties are surfaced.
        for (const key of Object.keys(cause)) {
            if (!SAFE_CAUSE_FIELDS.has(key)) continue;
            try {
                out[key] = deepSanitize(cause[key]);
            } catch {
                // ignore
            }
        }

        if (cause.cause !== undefined && cause.cause !== null) {
            out.cause = serializeCauseForDebug(cause.cause, depth + 1, seen);
        }

        return out;
    }

    return deepSanitize(cause);
}

// ----------------------------------------------------------------------------
// 5. BASE ERROR CLASS
// ----------------------------------------------------------------------------

export class AppError extends Error {
    /**
     * @param {string} message  Public-safe, human-readable message.
     * @param {Object} [options]
     * @param {string} [options.code]
     * @param {number} [options.statusCode]
     * @param {boolean} [options.isOperational=true]
     * @param {*} [options.details]   Structured, deep-sanitized on output.
     * @param {*} [options.cause]     Internal only. Never exposed to clients.
     * @param {string|null} [options.userId]
     * @param {string|null} [options.requestId]
     */
    constructor(message, options = {}) {
        super(typeof message === 'string' && message.length > 0 ? message : 'An error occurred');

        this.name = this.constructor.name;

        this.code = options.code || ErrorCodes.INTERNAL_SERVER_ERROR;

        this.statusCode =
            typeof options.statusCode === 'number' &&
            options.statusCode >= 100 &&
            options.statusCode < 600
                ? options.statusCode
                : (HttpStatusMap[this.code] || 500);

        this.isOperational =
            options.isOperational !== undefined ? Boolean(options.isOperational) : true;

        this.details = options.details !== undefined ? options.details : null;

        if (options.cause !== undefined) {
            this.cause = options.cause;
        }

        this.userId = options.userId ?? null;
        this.requestId = options.requestId ?? null;
        this.timestamp = new Date().toISOString();

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    toSafeResponse(options = {}) {
        return buildSafeResponse(this, options);
    }

    sanitizeDetails(details) {
        return deepSanitize(details);
    }

    serializeCause(cause) {
        return serializeCauseForDebug(cause);
    }
}

// ----------------------------------------------------------------------------
// 6. SPECIALIZED ERROR CLASSES
// ----------------------------------------------------------------------------

// Client Errors (4xx)
export class BadRequestError extends AppError {
    constructor(message = 'Bad request', options = {}) {
        super(message, {
            code: ErrorCodes.BAD_REQUEST,
            statusCode: 400,
            isOperational: true,
            ...options,
        });
    }
}

export class ValidationError extends AppError {
    constructor(message = 'Validation failed', options = {}) {
        super(message, {
            code: ErrorCodes.VALIDATION_ERROR,
            statusCode: 422,
            isOperational: true,
            ...options,
        });
    }
}

export class AuthenticationError extends AppError {
    constructor(message = 'Authentication failed', options = {}) {
        super(message, {
            code: ErrorCodes.AUTHENTICATION_FAILED,
            statusCode: 401,
            isOperational: true,
            ...options,
        });
    }
}

export class AuthorizationError extends AppError {
    constructor(message = 'Access denied', options = {}) {
        super(message, {
            code: ErrorCodes.FORBIDDEN,
            statusCode: 403,
            isOperational: true,
            ...options,
        });
    }
}

export class NotFoundError extends AppError {
    constructor(message = 'Resource not found', options = {}) {
        super(message, {
            code: ErrorCodes.NOT_FOUND,
            statusCode: 404,
            isOperational: true,
            ...options,
        });
    }
}

export class ConflictError extends AppError {
    constructor(message = 'Resource conflict', options = {}) {
        super(message, {
            code: ErrorCodes.CONFLICT,
            statusCode: 409,
            isOperational: true,
            ...options,
        });
    }
}

export class RateLimitError extends AppError {
    constructor(message = 'Rate limit exceeded', options = {}) {
        super(message, {
            code: ErrorCodes.RATE_LIMITED,
            statusCode: 429,
            isOperational: true,
            ...options,
        });
    }
}

export class PayloadTooLargeError extends AppError {
    constructor(message = 'Request payload too large', options = {}) {
        super(message, {
            code: ErrorCodes.PAYLOAD_TOO_LARGE,
            statusCode: 413,
            isOperational: true,
            ...options,
        });
    }
}

// Server Errors (5xx)
export class DatabaseError extends AppError {
    constructor(message = 'Database error occurred', options = {}) {
        super(message, {
            code: ErrorCodes.DATABASE_ERROR,
            statusCode: 500,
            isOperational: false,
            ...options,
        });
    }
}

export class ServiceUnavailableError extends AppError {
    constructor(message = 'Service temporarily unavailable', options = {}) {
        super(message, {
            code: ErrorCodes.SERVICE_UNAVAILABLE,
            statusCode: 503,
            isOperational: true,
            ...options,
        });
    }
}

export class ConfigurationError extends AppError {
    constructor(message = 'Configuration error', options = {}) {
        super(message, {
            code: ErrorCodes.CONFIGURATION_ERROR,
            statusCode: 500,
            isOperational: false,
            ...options,
        });
    }
}

export class SecurityError extends AppError {
    constructor(message = 'Security violation detected', options = {}) {
        super(message, {
            code: ErrorCodes.CSRF_ERROR,
            statusCode: 403,
            isOperational: true,
            ...options,
        });
    }
}

export class DependencyError extends AppError {
    constructor(message = 'Dependency error', options = {}) {
        super(message, {
            code: ErrorCodes.DEPENDENCY_ERROR,
            statusCode: 503,
            isOperational: false,
            ...options,
        });
    }
}

export class FileSystemError extends AppError {
    constructor(message = 'File system error', options = {}) {
        super(message, {
            code: ErrorCodes.FILE_SYSTEM_ERROR,
            statusCode: 500,
            isOperational: false,
            ...options,
        });
    }
}

// ----------------------------------------------------------------------------
// 7. HTTP STATUS HELPER
// ----------------------------------------------------------------------------

/**
 * Reliably derive the HTTP status for any error. Single source of truth so
 * response body and HTTP adapter cannot diverge.
 * @param {*} error
 * @returns {number}
 */
export function getHttpStatus(error) {
    if (error instanceof AppError) {
        const sc = error.statusCode;
        if (typeof sc === 'number' && sc >= 100 && sc < 600) return sc;
        return HttpStatusMap[error.code] || 500;
    }

    if (error && typeof error === 'object') {
        if (
            typeof error.statusCode === 'number' &&
            error.statusCode >= 100 &&
            error.statusCode < 600
        ) {
            return error.statusCode;
        }
        if (
            typeof error.status === 'number' &&
            error.status >= 100 &&
            error.status < 600
        ) {
            return error.status;
        }
        if (typeof error.code === 'string' && HttpStatusMap[error.code]) {
            return HttpStatusMap[error.code];
        }
    }

    return 500;
}

// ----------------------------------------------------------------------------
// 8. ERROR NORMALIZATION
// ----------------------------------------------------------------------------

export function normalizeError(error, options = {}) {
    if (error instanceof AppError) return error;

    const requestId =
        options.requestId || (error && typeof error === 'object' ? error.requestId : null) || null;
    const userId =
        options.userId || (error && typeof error === 'object' ? error.userId : null) || null;

    if (!error || typeof error !== 'object') {
        return new AppError('An unexpected error occurred', {
            code: ErrorCodes.INTERNAL_SERVER_ERROR,
            statusCode: 500,
            isOperational: false,
            cause: error,
            requestId,
            userId,
        });
    }

    if (
        error.name === 'ValidationError' ||
        error.name === 'ZodError' ||
        error.isJoi === true ||
        error.name === 'JoiError'
    ) {
        return new ValidationError('Validation failed', {
            details: extractValidationDetails(error),
            cause: error,
            requestId,
            userId,
        });
    }

    if (error.name === 'UnauthorizedError' || error.code === 'UNAUTHORIZED') {
        return new AuthenticationError('Authentication required', {
            cause: error,
            requestId,
            userId,
        });
    }

    if (error.code === 'LIMIT_FILE_SIZE' || error.type === 'entity.too.large') {
        return new PayloadTooLargeError('Request payload too large', {
            cause: error,
            requestId,
            userId,
        });
    }

    if (
        error.code === 'ECONNREFUSED' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'EAI_AGAIN' ||
        error.code === 'ETIMEDOUT'
    ) {
        return new ServiceUnavailableError('Service temporarily unavailable', {
            cause: error,
            requestId,
            userId,
        });
    }

    if (error.code === 'PROXY_AUTHENTICATION_REQUIRED') {
        return new AuthenticationError('Proxy authentication required', {
            cause: error,
            requestId,
            userId,
        });
    }

    if (typeof error.code === 'string' && error.code.startsWith('ER_')) {
        return normalizeDatabaseError(error, { requestId, userId });
    }

    if (error.sql || error.sqlMessage) {
        return new DatabaseError('Database error occurred', {
            cause: error,
            requestId,
            userId,
        });
    }

    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        return new BadRequestError('Invalid JSON payload', {
            cause: error,
            requestId,
            userId,
        });
    }

    return new AppError('An unexpected error occurred', {
        code: ErrorCodes.INTERNAL_SERVER_ERROR,
        statusCode: 500,
        isOperational: false,
        cause: error,
        requestId,
        userId,
    });
}

function normalizeDatabaseError(error, context = {}) {
    const { requestId, userId } = context;
    const mapped = DatabaseErrorMap[error.code];

    if (mapped) {
        if (mapped.code === ErrorCodes.CONFLICT) {
            return new ConflictError(mapped.message, {
                cause: error,
                requestId,
                userId,
            });
        }
        return new DatabaseError(mapped.message, {
            code: mapped.code,
            statusCode: mapped.statusCode,
            cause: error,
            requestId,
            userId,
        });
    }

    return new DatabaseError('Database error occurred', {
        cause: error,
        requestId,
        userId,
    });
}

function extractValidationDetails(error) {
    if (error.details && typeof error.details === 'object') {
        return error.details;
    }

    if (Array.isArray(error.errors) && error.errors.length > 0) {
        const out = {};
        for (const err of error.errors) {
            const path = Array.isArray(err.path)
                ? err.path.join('.')
                : (err.path || err.field || err.param || 'unknown');
            out[path] = err.message || 'Invalid value';
        }
        return out;
    }

    if (error.errors && typeof error.errors === 'object') {
        return error.errors;
    }

    if (typeof error.message === 'string' && error.message.length > 0) {
        return { message: error.message };
    }

    return null;
}

// ----------------------------------------------------------------------------
// 9. SAFE ERROR RESPONSE
// ----------------------------------------------------------------------------

const GENERIC_INTERNAL_MESSAGE = 'An unexpected error occurred';

/**
 * Build a client-safe response body.
 *
 * Message policy:
 *   - development  : defaultMessage OR normalized.message
 *   - production,
 *     operational  : defaultMessage OR normalized.message
 *   - production,
 *     non-operational : hardcoded generic (defaultMessage is IGNORED — it
 *                       cannot be used to smuggle internal error text)
 */
function buildSafeResponse(error, options = {}) {
    const normalized = normalizeError(error, { requestId: options.requestId });

    const development = options.development === true;
    const includeStack = development && options.includeStack === true;

    const publicMessage = (() => {
        if (development) {
            return options.defaultMessage || normalized.message;
        }
        // Production
        if (normalized.isOperational) {
            return options.defaultMessage || normalized.message;
        }
        // Non-operational in production: always force generic.
        // Callers cannot bypass this via defaultMessage.
        return GENERIC_INTERNAL_MESSAGE;
    })();

    const response = {
        success: false,
        error: {
            code: normalized.code,
            message: publicMessage,
        },
    };

    const requestId = options.requestId || normalized.requestId;
    if (requestId) response.requestId = requestId;

    if (normalized.details !== null && normalized.details !== undefined) {
        const sanitized = deepSanitize(normalized.details);
        if (hasContent(sanitized)) {
            response.error.details = sanitized;
        }
    }

    if (development) {
        response.error.type = normalized.name;
        response.error.statusCode = getHttpStatus(normalized);
        response.error.isOperational = normalized.isOperational;

        if (includeStack && normalized.stack) {
            response.error.stack = redactText(normalized.stack, MAX_STACK_LEN);
        }
        if (normalized.cause !== undefined && normalized.cause !== null) {
            response.error.cause = serializeCauseForDebug(normalized.cause);
        }
    }

    return response;
}

/**
 * Public API: convert any error to a client-safe response body.
 * @param {*} error
 * @param {Object} [options]
 * @param {boolean} [options.development=false]
 * @param {boolean} [options.includeStack=false]
 * @param {string} [options.requestId]
 * @param {string} [options.defaultMessage]
 * @returns {Object}
 */
export function toSafeErrorResponse(error, options = {}) {
    return buildSafeResponse(error, options);
}

// ----------------------------------------------------------------------------
// 10. OPERATIONAL ERROR CHECK
// ----------------------------------------------------------------------------

export function isOperationalError(error) {
    if (error instanceof AppError) {
        return error.isOperational === true;
    }

    if (!error || typeof error !== 'object') return false;

    if (
        error instanceof TypeError ||
        error instanceof ReferenceError ||
        error instanceof RangeError ||
        error instanceof EvalError ||
        error instanceof URIError
    ) {
        return false;
    }

    if (error instanceof SyntaxError) {
        if (typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
            return true;
        }
        return false;
    }

    if (typeof error.code === 'string') {
        if (DatabaseErrorMap[error.code]) return true;
        if (error.code === 'LIMIT_FILE_SIZE') return true;
        if (error.code === 'entity.too.large') return true;
        if (error.code === 'ECONNREFUSED') return false;
    }

    const status = getHttpStatus(error);
    if (status >= 400 && status < 500) return true;

    return false;
}

// ----------------------------------------------------------------------------
// 11. ERROR LOGGING UTILITY
// ----------------------------------------------------------------------------

/**
 * Prepare a fully-sanitized log entry.
 *
 *  - `cause` goes through serializeCauseForDebug (redacted message/stack,
 *    allowlisted own-fields, recursive)
 *  - `context` is deepSanitize()'d (string values redacted, sensitive keys
 *    stripped, DANGEROUS_KEYS blocked)
 *  - `userId` / `requestId` are coerced to short identifier strings so
 *    objects, control chars, or enormous values cannot pollute the log.
 */
export function prepareErrorForLogging(error, context = {}) {
    const normalized = normalizeError(error, {
        requestId: context && typeof context === 'object' ? context.requestId : null,
        userId: context && typeof context === 'object' ? context.userId : null,
    });

    const safeContext = context && typeof context === 'object'
        ? deepSanitize(context)
        : {};

    // Make sure userId inside context (if survived deepSanitize) is safe.
    if (safeContext && typeof safeContext === 'object' && 'userId' in safeContext) {
        safeContext.userId = sanitizeIdentifier(safeContext.userId);
    }

    const logEntry = {
        timestamp: new Date().toISOString(),
        error: {
            name: normalized.name,
            code: normalized.code,
            message: redactText(normalized.message, MAX_MESSAGE_LEN),
            statusCode: getHttpStatus(normalized),
            isOperational: normalized.isOperational,
            stack: typeof normalized.stack === 'string'
                ? redactText(normalized.stack, MAX_STACK_LEN)
                : undefined,
            requestId: sanitizeIdentifier(normalized.requestId),
            userId: sanitizeIdentifier(normalized.userId),
        },
        context: safeContext,
    };

    if (normalized.cause !== undefined && normalized.cause !== null) {
        logEntry.error.cause = serializeCauseForDebug(normalized.cause);
    }

    return logEntry;
}

// ----------------------------------------------------------------------------
// 12. DEFAULT EXPORT
// ----------------------------------------------------------------------------

export default {
    AppError,
    ErrorCodes,
    HttpStatusMap,
    DatabaseErrorMap,

    // Specialized errors
    BadRequestError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError,
    RateLimitError,
    PayloadTooLargeError,
    DatabaseError,
    ServiceUnavailableError,
    ConfigurationError,
    SecurityError,
    DependencyError,
    FileSystemError,

    // Utilities
    getHttpStatus,
    normalizeError,
    toSafeErrorResponse,
    isOperationalError,
    prepareErrorForLogging,
};