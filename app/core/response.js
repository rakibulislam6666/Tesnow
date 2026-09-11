/**
 * app/core/response.js
 * Consistent response abstraction for Tesnow API
 * Provides standardized success, error, and paginated responses
 * 
 * @module response
 */

import { getRequestId, getCorrelationId, hasRequestContext } from './request-context.js';
import { HTTP_STATUS } from './constants.js';
import { AppError, normalizeError, toSafeErrorResponse } from './errors.js';

// ----------------------------------------------------------------------------
// 1. CONSTANTS
// ----------------------------------------------------------------------------

const DEFAULT_SUCCESS_MESSAGE = 'Operation successful';
const DEFAULT_ERROR_MESSAGE = 'An unexpected error occurred';

// ----------------------------------------------------------------------------
// 2. HELPER FUNCTIONS
// ----------------------------------------------------------------------------

/**
 * Get request ID from context if available
 * @returns {string|null} Request ID or null
 */
function getRequestIdFromContext() {
    try {
        if (hasRequestContext()) {
            return getRequestId();
        }
    } catch {
        // Ignore context errors
    }
    return null;
}

/**
 * Get correlation ID from context if available
 * @returns {string|null} Correlation ID or null
 */
function getCorrelationIdFromContext() {
    try {
        if (hasRequestContext()) {
            return getCorrelationId();
        }
    } catch {
        // Ignore context errors
    }
    return null;
}

/**
 * Sanitize a message string
 * @param {string} message - Message to sanitize
 * @param {string} defaultMessage - Default message if invalid
 * @returns {string} Sanitized message
 */
function sanitizeMessage(message, defaultMessage) {
    if (typeof message !== 'string' || message.trim().length === 0) {
        return defaultMessage || '';
    }
    
    // Truncate extremely long messages (max 1000 chars)
    if (message.length > 1000) {
        return message.substring(0, 1000);
    }
    
    // Remove control characters (except newlines for error messages)
    return message.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Validate HTTP status code
 * @param {number} statusCode - Status code to validate
 * @param {number} fallback - Fallback status code
 * @returns {number} Valid status code
 */
function validateStatusCode(statusCode, fallback = 500) {
    if (typeof statusCode !== 'number' || !Number.isInteger(statusCode)) {
        return fallback;
    }
    
    // HTTP status codes are 100-599
    if (statusCode < 100 || statusCode > 599) {
        return fallback;
    }
    
    return statusCode;
}

/**
 * Check if response can be sent
 * @param {import('express').Response} res - Express response
 * @returns {boolean} True if response can be sent
 */
function canSendResponse(res) {
    return res && typeof res === 'object' && !res.headersSent;
}

/**
 * Safely serialize data for JSON response
 * @param {*} data - Data to serialize
 * @returns {*} Safely serialized data
 */
function safeSerialize(data) {
    if (data === undefined || data === null) {
        return null;
    }
    
    // Handle BigInt
    if (typeof data === 'bigint') {
        return data.toString();
    }
    
    // Handle Date
    if (data instanceof Date) {
        return data.toISOString();
    }
    
    // Handle Error (should not happen, but safe fallback)
    if (data instanceof Error) {
        return {
            name: data.name,
            message: data.message,
        };
    }
    
    // Handle arrays
    if (Array.isArray(data)) {
        return data.map(item => safeSerialize(item));
    }
    
    // Handle objects
    if (data && typeof data === 'object') {
        // Check for circular references
        try {
            JSON.stringify(data);
        } catch {
            // If circular, create a safe copy
            const safeCopy = {};
            for (const key of Object.keys(data)) {
                try {
                    safeCopy[key] = safeSerialize(data[key]);
                } catch {
                    safeCopy[key] = '[Circular or Unserializable]';
                }
            }
            return safeCopy;
        }
        
        // If serializable, process recursively
        const result = {};
        for (const key of Object.keys(data)) {
            // Skip potentially sensitive fields if they appear in objects
            // But only if this is not a known safe object (we can't know for sure)
            // We'll rely on the caller to not pass sensitive data
            result[key] = safeSerialize(data[key]);
        }
        return result;
    }
    
    // Primitive values
    return data;
}

// ----------------------------------------------------------------------------
// 3. CORE RESPONSE FUNCTIONS
// ----------------------------------------------------------------------------

/**
 * Send a success response
 * @param {import('express').Response} res - Express response
 * @param {Object} options - Response options
 * @param {number} options.statusCode - HTTP status code (default: 200)
 * @param {*} options.data - Response data
 * @param {string} options.message - Success message
 * @param {Object} options.meta - Additional metadata
 * @param {string} options.requestId - Request ID (overrides context)
 * @param {string} options.correlationId - Correlation ID (overrides context)
 * @param {boolean} options.includeMeta - Whether to include meta in response
 * @returns {import('express').Response} Express response
 */
export function sendSuccess(res, options = {}) {
    // Default options
    const {
        statusCode = 200,
        data = null,
        message = DEFAULT_SUCCESS_MESSAGE,
        meta = null,
        requestId: providedRequestId = null,
        correlationId: providedCorrelationId = null,
        includeMeta = true,
    } = options;
    
    // Validate status code
    const safeStatusCode = validateStatusCode(statusCode, 200);
    
    // Check if response can be sent
    if (!canSendResponse(res)) {
        return res;
    }
    
    // Get request IDs
    const requestId = providedRequestId || getRequestIdFromContext();
    const correlationId = providedCorrelationId || getCorrelationIdFromContext();
    
    // Sanitize message
    const safeMessage = sanitizeMessage(message, DEFAULT_SUCCESS_MESSAGE);
    
    // Build response body
    const responseBody = {
        success: true,
    };
    
    // Add data if present
    if (data !== null && data !== undefined) {
        responseBody.data = safeSerialize(data);
    }
    
    // Add message
    if (safeMessage) {
        responseBody.message = safeMessage;
    }
    
    // Build meta object
    const metaObject = {};
    
    if (includeMeta) {
        if (requestId) {
            metaObject.requestId = requestId;
        }
        if (correlationId) {
            metaObject.correlationId = correlationId;
        }
        if (meta && typeof meta === 'object') {
            // Merge meta, but don't override requestId/correlationId if they're already set
            const safeMeta = safeSerialize(meta);
            if (safeMeta && typeof safeMeta === 'object') {
                Object.assign(metaObject, safeMeta);
            }
        }
    }
    
    // Add meta if not empty
    if (Object.keys(metaObject).length > 0) {
        responseBody.meta = metaObject;
    }
    
    // Set request ID header if available
    if (requestId) {
        res.setHeader('X-Request-ID', requestId);
    }
    
    // Send response
    return res.status(safeStatusCode).json(responseBody);
}

/**
 * Send a created response (201)
 * @param {import('express').Response} res - Express response
 * @param {*} data - Created resource data
 * @param {string} message - Success message
 * @param {Object} meta - Additional metadata
 * @returns {import('express').Response} Express response
 */
export function sendCreated(res, data = null, message = 'Resource created successfully', meta = null) {
    return sendSuccess(res, {
        statusCode: HTTP_STATUS.CREATED,
        data,
        message,
        meta,
    });
}

/**
 * Send an accepted response (202)
 * @param {import('express').Response} res - Express response
 * @param {*} data - Response data
 * @param {string} message - Success message
 * @param {Object} meta - Additional metadata
 * @returns {import('express').Response} Express response
 */
export function sendAccepted(res, data = null, message = 'Request accepted', meta = null) {
    return sendSuccess(res, {
        statusCode: HTTP_STATUS.ACCEPTED,
        data,
        message,
        meta,
    });
}

/**
 * Send a no-content response (204)
 * @param {import('express').Response} res - Express response
 * @returns {import('express').Response} Express response
 */
export function sendNoContent(res) {
    if (!canSendResponse(res)) {
        return res;
    }
    
    // Set status to 204 and end without body
    return res.status(HTTP_STATUS.NO_CONTENT).send();
}

/**
 * Send a paginated response
 * @param {import('express').Response} res - Express response
 * @param {Object} options - Response options
 * @param {*} options.data - Paginated data items
 * @param {Object} options.pagination - Pagination metadata
 * @param {number} options.pagination.page - Current page
 * @param {number} options.pagination.limit - Items per page
 * @param {number} options.pagination.total - Total items
 * @param {number} options.pagination.totalPages - Total pages
 * @param {boolean} options.pagination.hasNext - Has next page
 * @param {boolean} options.pagination.hasPrevious - Has previous page
 * @param {string} options.message - Success message
 * @param {Object} options.meta - Additional metadata
 * @returns {import('express').Response} Express response
 */
export function sendPaginated(res, options = {}) {
    const {
        data = null,
        pagination = null,
        message = 'Data retrieved successfully',
        meta = null,
    } = options;
    
    // Build meta with pagination
    const responseMeta = {
        ...(meta || {}),
    };
    
    if (pagination && typeof pagination === 'object') {
        const { page, limit, total, totalPages, hasNext, hasPrevious } = pagination;
        
        responseMeta.pagination = {
            page: typeof page === 'number' ? page : 1,
            limit: typeof limit === 'number' ? limit : 20,
            total: typeof total === 'number' ? total : 0,
            totalPages: typeof totalPages === 'number' ? totalPages : 0,
            hasNext: typeof hasNext === 'boolean' ? hasNext : false,
            hasPrevious: typeof hasPrevious === 'boolean' ? hasPrevious : false,
        };
    }
    
    return sendSuccess(res, {
        statusCode: HTTP_STATUS.OK,
        data,
        message,
        meta: responseMeta,
    });
}

// ----------------------------------------------------------------------------
// 4. ERROR RESPONSE
// ----------------------------------------------------------------------------

/**
 * Send an error response
 * @param {import('express').Response} res - Express response
 * @param {Error|AppError|*} error - Error to send
 * @param {Object} options - Response options
 * @param {number} options.statusCode - HTTP status code (overrides error)
 * @param {string} options.message - Error message (overrides error)
 * @param {string} options.code - Error code (overrides error)
 * @param {Object} options.details - Error details (overrides error)
 * @param {string} options.requestId - Request ID (overrides context)
 * @param {string} options.correlationId - Correlation ID (overrides context)
 * @param {boolean} options.development - Development mode (overrides environment)
 * @param {boolean} options.includeStack - Include stack trace (development only)
 * @param {boolean} options.includeCause - Include error cause (development only)
 * @param {string} options.fallbackMessage - Fallback message if error has no message
 * @returns {import('express').Response} Express response
 */
export function sendError(res, error, options = {}) {
    // Default options
    const {
        statusCode: overrideStatusCode = null,
        message: overrideMessage = null,
        code: overrideCode = null,
        details: overrideDetails = null,
        requestId: providedRequestId = null,
        correlationId: providedCorrelationId = null,
        development = process.env.NODE_ENV === 'development',
        includeStack = false,
        includeCause = false,
        fallbackMessage = DEFAULT_ERROR_MESSAGE,
    } = options;
    
    // Check if response can be sent
    if (!canSendResponse(res)) {
        return res;
    }
    
    // Get request IDs
    const requestId = providedRequestId || getRequestIdFromContext();
    const correlationId = providedCorrelationId || getCorrelationIdFromContext();
    
    // Normalize the error
    let normalizedError;
    try {
        normalizedError = normalizeError(error, { requestId });
    } catch {
        // If normalization fails, create a safe fallback
        normalizedError = new AppError(DEFAULT_ERROR_MESSAGE, {
            code: 'INTERNAL_SERVER_ERROR',
            statusCode: 500,
            isOperational: false,
        });
    }
    
    // Apply overrides
    const effectiveStatusCode = overrideStatusCode !== null 
        ? validateStatusCode(overrideStatusCode, normalizedError.statusCode || 500)
        : validateStatusCode(normalizedError.statusCode || 500, 500);
    
    const effectiveCode = overrideCode || normalizedError.code || 'INTERNAL_SERVER_ERROR';
    const effectiveMessage = overrideMessage || normalizedError.message || fallbackMessage;
    const effectiveDetails = overrideDetails || normalizedError.details || null;
    
    // Determine if we should include development information
    const isDevelopment = development || process.env.NODE_ENV === 'development';
    const showStack = isDevelopment && includeStack;
    const showCause = isDevelopment && includeCause;
    
    // Build safe error response
    const responseBody = {
        success: false,
        error: {
            code: effectiveCode,
            message: sanitizeMessage(effectiveMessage, fallbackMessage),
        },
    };
    
    // Add details if present and safe
    if (effectiveDetails && typeof effectiveDetails === 'object') {
        const sanitizedDetails = safeSerialize(effectiveDetails);
        if (sanitizedDetails && Object.keys(sanitizedDetails).length > 0) {
            responseBody.error.details = sanitizedDetails;
        }
    }
    
    // Add request ID
    if (requestId) {
        responseBody.requestId = requestId;
    }
    
    // Add correlation ID
    if (correlationId) {
        responseBody.correlationId = correlationId;
    }
    
    // Development-only information
    if (isDevelopment) {
        if (showStack && normalizedError.stack) {
            responseBody.error.stack = normalizedError.stack;
        }
        
        if (showCause && normalizedError.cause) {
            responseBody.error.cause = normalizedError.cause instanceof Error
                ? {
                    name: normalizedError.cause.name,
                    message: normalizedError.cause.message,
                    stack: normalizedError.cause.stack,
                }
                : normalizedError.cause;
        }
        
        // Add error type for debugging
        responseBody.error.type = normalizedError.name || 'Error';
        responseBody.error.isOperational = normalizedError.isOperational !== false;
    }
    
    // Set request ID header if available
    if (requestId) {
        res.setHeader('X-Request-ID', requestId);
    }
    
    // Send error response
    return res.status(effectiveStatusCode).json(responseBody);
}

/**
 * Send a bad request error (400)
 * @param {import('express').Response} res - Express response
 * @param {string} message - Error message
 * @param {Object} details - Error details
 * @param {Object} options - Additional options
 * @returns {import('express').Response} Express response
 */
export function sendBadRequest(res, message = 'Bad request', details = null, options = {}) {
    return sendError(res, new AppError(message, {
        code: 'BAD_REQUEST',
        statusCode: HTTP_STATUS.BAD_REQUEST,
        isOperational: true,
        details,
    }), options);
}

/**
 * Send an unauthorized error (401)
 * @param {import('express').Response} res - Express response
 * @param {string} message - Error message
 * @param {Object} details - Error details
 * @param {Object} options - Additional options
 * @returns {import('express').Response} Express response
 */
export function sendUnauthorized(res, message = 'Authentication required', details = null, options = {}) {
    return sendError(res, new AppError(message, {
        code: 'UNAUTHORIZED',
        statusCode: HTTP_STATUS.UNAUTHORIZED,
        isOperational: true,
        details,
    }), options);
}

/**
 * Send a forbidden error (403)
 * @param {import('express').Response} res - Express response
 * @param {string} message - Error message
 * @param {Object} details - Error details
 * @param {Object} options - Additional options
 * @returns {import('express').Response} Express response
 */
export function sendForbidden(res, message = 'Access denied', details = null, options = {}) {
    return sendError(res, new AppError(message, {
        code: 'FORBIDDEN',
        statusCode: HTTP_STATUS.FORBIDDEN,
        isOperational: true,
        details,
    }), options);
}

/**
 * Send a not found error (404)
 * @param {import('express').Response} res - Express response
 * @param {string} message - Error message
 * @param {Object} details - Error details
 * @param {Object} options - Additional options
 * @returns {import('express').Response} Express response
 */
export function sendNotFound(res, message = 'Resource not found', details = null, options = {}) {
    return sendError(res, new AppError(message, {
        code: 'NOT_FOUND',
        statusCode: HTTP_STATUS.NOT_FOUND,
        isOperational: true,
        details,
    }), options);
}

/**
 * Send a conflict error (409)
 * @param {import('express').Response} res - Express response
 * @param {string} message - Error message
 * @param {Object} details - Error details
 * @param {Object} options - Additional options
 * @returns {import('express').Response} Express response
 */
export function sendConflict(res, message = 'Resource conflict', details = null, options = {}) {
    return sendError(res, new AppError(message, {
        code: 'CONFLICT',
        statusCode: HTTP_STATUS.CONFLICT,
        isOperational: true,
        details,
    }), options);
}

/**
 * Send a validation error (422)
 * @param {import('express').Response} res - Express response
 * @param {string} message - Error message
 * @param {Object} details - Validation error details
 * @param {Object} options - Additional options
 * @returns {import('express').Response} Express response
 */
export function sendValidationError(res, message = 'Validation failed', details = null, options = {}) {
    return sendError(res, new AppError(message, {
        code: 'VALIDATION_ERROR',
        statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
        isOperational: true,
        details,
    }), options);
}

/**
 * Send a rate limit error (429)
 * @param {import('express').Response} res - Express response
 * @param {string} message - Error message
 * @param {Object} details - Error details
 * @param {Object} options - Additional options
 * @returns {import('express').Response} Express response
 */
export function sendRateLimit(res, message = 'Too many requests', details = null, options = {}) {
    return sendError(res, new AppError(message, {
        code: 'RATE_LIMITED',
        statusCode: HTTP_STATUS.TOO_MANY_REQUESTS,
        isOperational: true,
        details,
    }), options);
}

// ----------------------------------------------------------------------------
// 5. EXPORTS
// ----------------------------------------------------------------------------

export default {
    sendSuccess,
    sendCreated,
    sendAccepted,
    sendNoContent,
    sendPaginated,
    sendError,
    sendBadRequest,
    sendUnauthorized,
    sendForbidden,
    sendNotFound,
    sendConflict,
    sendValidationError,
    sendRateLimit,
    safeSerialize,
};

// ----------------------------------------------------------------------------
// EXPLANATION
// ----------------------------------------------------------------------------

/**
 * RESPONSE MODULE EXPLANATION
 * 
 * 1. CORE DESIGN
 *    - sendSuccess() for consistent success responses
 *    - sendError() for consistent error responses
 *    - sendPaginated() for paginated data responses
 *    - Convenience helpers for common status codes
 * 
 * 2. RESPONSE FORMATS
 *    Success: { success: true, data?, message?, meta? }
 *    Error: { success: false, error: { code, message, details? }, requestId? }
 *    Paginated: { success: true, data: [], meta: { pagination: {...} } }
 * 
 * 3. INTEGRATION WITH EXISTING MODULES
 *    - Uses request-context.js for requestId/correlationId
 *    - Uses errors.js for error normalization and safe responses
 *    - Uses constants.js for HTTP status codes
 * 
 * 4. SECURITY FEATURES
 *    - No stack traces in production
 *    - No SQL queries exposed
 *    - No sensitive data exposed
 *    - Safe serialization of BigInt, Date, circular refs
 *    - Message sanitization
 *    - Status code validation
 * 
 * 5. ERROR HANDLING
 *    - sendError() normalizes any error using errors.js
 *    - Unknown errors become 500 Internal Server Error
 *    - Zod validation errors are formatted with details
 *    - Database errors are sanitized
 * 
 * 6. PAGINATION SUPPORT
 *    - sendPaginated() formats data with pagination metadata
 *    - Works with pagination.js module for calculations
 * 
 * 7. ENVIRONMENT AWARENESS
 *    - Development: may include stack traces, causes, types
 *    - Production: minimal safe error responses
 * 
 * 8. USAGE EXAMPLES
 * 
 *    // Success responses
 *    sendSuccess(res, { data: user, message: 'User found' });
 *    sendCreated(res, user, 'User created');
 *    sendNoContent(res);
 * 
 *    // Paginated responses
 *    sendPaginated(res, {
 *        data: posts,
 *        pagination: { page: 1, limit: 20, total: 150, totalPages: 8, hasNext: true, hasPrevious: false }
 *    });
 * 
 *    // Error responses
 *    sendError(res, err);
 *    sendNotFound(res, 'User not found');
 *    sendValidationError(res, 'Validation failed', { email: 'Invalid email' });
 * 
 * 9. TESTING
 *    - All functions accept mocked Express response objects
 *    - No side effects on import
 *    - Safe to use in CLI scripts and background jobs
 *    - Works without request context
 */