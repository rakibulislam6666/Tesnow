/**
 * app/core/constants.js
 * Centralized constants module for Tesnow
 * All shared constants, enums, and immutable values
 * 
 * @module constants
 * @version 1.0.0
 */
import { randomUUID } from 'node:crypto';

// ----------------------------------------------------------------------------
// 1. APPLICATION CONSTANTS
// ----------------------------------------------------------------------------

export const APP = Object.freeze({
    NAME: 'Tesnow',
    VERSION: '1.0.0',
    DEFAULT_LOCALE: 'en-US',
    DEFAULT_TIMEZONE: 'UTC',
});

// ----------------------------------------------------------------------------
// 2. ENVIRONMENT CONSTANTS
// ----------------------------------------------------------------------------

export const ENV = Object.freeze({
    DEVELOPMENT: 'development',
    TEST: 'test',
    PRODUCTION: 'production',
});

// ----------------------------------------------------------------------------
// 3. HTTP CONSTANTS
// ----------------------------------------------------------------------------

export const HTTP_STATUS = Object.freeze({
    CONTINUE: 100,
    SWITCHING_PROTOCOLS: 101,
    PROCESSING: 102,
    EARLY_HINTS: 103,

    OK: 200,
    CREATED: 201,
    ACCEPTED: 202,
    NON_AUTHORITATIVE_INFORMATION: 203,
    NO_CONTENT: 204,
    RESET_CONTENT: 205,
    PARTIAL_CONTENT: 206,

    MULTIPLE_CHOICES: 300,
    MOVED_PERMANENTLY: 301,
    FOUND: 302,
    SEE_OTHER: 303,
    NOT_MODIFIED: 304,
    TEMPORARY_REDIRECT: 307,
    PERMANENT_REDIRECT: 308,

    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    PAYMENT_REQUIRED: 402,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    METHOD_NOT_ALLOWED: 405,
    NOT_ACCEPTABLE: 406,
    PROXY_AUTHENTICATION_REQUIRED: 407,
    REQUEST_TIMEOUT: 408,
    CONFLICT: 409,
    GONE: 410,
    LENGTH_REQUIRED: 411,
    PRECONDITION_FAILED: 412,
    PAYLOAD_TOO_LARGE: 413,
    URI_TOO_LONG: 414,
    UNSUPPORTED_MEDIA_TYPE: 415,
    RANGE_NOT_SATISFIABLE: 416,
    EXPECTATION_FAILED: 417,
    IM_A_TEAPOT: 418,
    MISDIRECTED_REQUEST: 421,
    UNPROCESSABLE_ENTITY: 422,
    LOCKED: 423,
    FAILED_DEPENDENCY: 424,
    TOO_EARLY: 425,
    UPGRADE_REQUIRED: 426,
    PRECONDITION_REQUIRED: 428,
    TOO_MANY_REQUESTS: 429,
    REQUEST_HEADER_FIELDS_TOO_LARGE: 431,
    UNAVAILABLE_FOR_LEGAL_REASONS: 451,

    INTERNAL_SERVER_ERROR: 500,
    NOT_IMPLEMENTED: 501,
    BAD_GATEWAY: 502,
    SERVICE_UNAVAILABLE: 503,
    GATEWAY_TIMEOUT: 504,
    HTTP_VERSION_NOT_SUPPORTED: 505,
    VARIANT_ALSO_NEGOTIATES: 506,
    INSUFFICIENT_STORAGE: 507,
    LOOP_DETECTED: 508,
    NOT_EXTENDED: 510,
    NETWORK_AUTHENTICATION_REQUIRED: 511,
});

export const HTTP_METHODS = Object.freeze({
    GET: 'GET',
    HEAD: 'HEAD',
    POST: 'POST',
    PUT: 'PUT',
    DELETE: 'DELETE',
    PATCH: 'PATCH',
    OPTIONS: 'OPTIONS',
    CONNECT: 'CONNECT',
    TRACE: 'TRACE',
});

// ----------------------------------------------------------------------------
// 4. USER STATUS
// ----------------------------------------------------------------------------

export const USER_STATUS = Object.freeze({
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    SUSPENDED: 'suspended',
    BANNED: 'banned',
    PENDING: 'pending',
});

// ----------------------------------------------------------------------------
// 5. ADMIN STATUS
// ----------------------------------------------------------------------------

export const ADMIN_STATUS = Object.freeze({
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    SUSPENDED: 'suspended',
});

// ----------------------------------------------------------------------------
// 6. POST STATUS
// ----------------------------------------------------------------------------

export const POST_STATUS = Object.freeze({
    DRAFT: 'draft',
    REVIEW: 'review',
    SCHEDULED: 'scheduled',
    PUBLISHED: 'published',
    ARCHIVED: 'archived',
    TRASH: 'trash',
});

// ----------------------------------------------------------------------------
// 7. POST VISIBILITY
// ----------------------------------------------------------------------------

export const POST_VISIBILITY = Object.freeze({
    PUBLIC: 'public',
    PRIVATE: 'private',
    PASSWORD: 'password',
});

// ----------------------------------------------------------------------------
// 8. COMMENT STATUS
// ----------------------------------------------------------------------------

export const COMMENT_STATUS = Object.freeze({
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    SPAM: 'spam',
    TRASH: 'trash',
});

// ----------------------------------------------------------------------------
// 9. REPORT STATUS
// ----------------------------------------------------------------------------

export const REPORT_STATUS = Object.freeze({
    PENDING: 'pending',
    REVIEWING: 'reviewing',
    RESOLVED: 'resolved',
    DISMISSED: 'dismissed',
});

// ----------------------------------------------------------------------------
// 10. MEDIA CONSTANTS
// ----------------------------------------------------------------------------

export const MEDIA_TYPE = Object.freeze({
    IMAGE: 'image',
    VIDEO: 'video',
    AUDIO: 'audio',
    DOCUMENT: 'document',
    OTHER: 'other',
});

export const MEDIA_STATUS = Object.freeze({
    ACTIVE: 'active',
    PROCESSING: 'processing',
    FAILED: 'failed',
    DELETED: 'deleted',
});

export const MEDIA_CATEGORIES = Object.freeze({
    AVATAR: 'avatar',
    COVER: 'cover',
    POST: 'post',
    GALLERY: 'gallery',
    ATTACHMENT: 'attachment',
});

// ----------------------------------------------------------------------------
// 11. SESSION CONSTANTS
// ----------------------------------------------------------------------------

export const SESSION_STATUS = Object.freeze({
    ACTIVE: 'active',
    REVOKED: 'revoked',
    EXPIRED: 'expired',
});

// ----------------------------------------------------------------------------
// 12. SECURITY EVENT CONSTANTS
// ----------------------------------------------------------------------------

export const SECURITY_EVENT = Object.freeze({
    LOGIN_SUCCESS: 'login_success',
    LOGIN_FAILURE: 'login_failure',
    LOGOUT: 'logout',
    PASSWORD_CHANGED: 'password_changed',
    PASSWORD_RESET_REQUESTED: 'password_reset_requested',
    PASSWORD_RESET_COMPLETED: 'password_reset_completed',
    ACCOUNT_LOCKED: 'account_locked',
    ACCOUNT_UNLOCKED: 'account_unlocked',
    TWO_FACTOR_ENABLED: 'two_factor_enabled',
    TWO_FACTOR_DISABLED: 'two_factor_disabled',
    SUSPICIOUS_ACTIVITY: 'suspicious_activity',
    RATE_LIMIT_TRIGGERED: 'rate_limit_triggered',
    CSRF_FAILURE: 'csrf_failure',
    SESSION_EXPIRED: 'session_expired',
    SESSION_REVOKED: 'session_revoked',
    API_KEY_CREATED: 'api_key_created',
    API_KEY_REVOKED: 'api_key_revoked',
    PERMISSION_CHANGED: 'permission_changed',
    ROLE_CHANGED: 'role_changed',
    ACCOUNT_DELETED: 'account_deleted',
});

// ----------------------------------------------------------------------------
// 13. SECURITY SEVERITY
// ----------------------------------------------------------------------------

export const SECURITY_SEVERITY = Object.freeze({
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical',
});

// ----------------------------------------------------------------------------
// 14. AUDIT ACTIONS
// ----------------------------------------------------------------------------

export const AUDIT_ACTION = Object.freeze({
    // CRUD operations
    CREATE: 'create',
    READ: 'read',
    UPDATE: 'update',
    DELETE: 'delete',

    // Authentication
    LOGIN: 'login',
    LOGOUT: 'logout',

    // Content management
    PUBLISH: 'publish',
    UNPUBLISH: 'unpublish',
    ARCHIVE: 'archive',
    RESTORE: 'restore',
    TRASH: 'trash',

    // Moderation
    APPROVE: 'approve',
    REJECT: 'reject',

    // User management
    BAN: 'ban',
    UNBAN: 'unban',
    SUSPEND: 'suspend',
    UNSUSPEND: 'unsuspend',

    // Permissions
    GRANT: 'grant',
    REVOKE: 'revoke',

    // Settings
    SETTING_UPDATE: 'setting_update',
});

// ----------------------------------------------------------------------------
// 15. NOTIFICATION TYPES
// ----------------------------------------------------------------------------

export const NOTIFICATION_TYPE = Object.freeze({
    SYSTEM: 'system',
    SECURITY: 'security',
    COMMENT: 'comment',
    LIKE: 'like',
    BOOKMARK: 'bookmark',
    MENTION: 'mention',
    MODERATION: 'moderation',
    CONTENT: 'content',
    FOLLOW: 'follow',
    SUBSCRIPTION: 'subscription',
});

// ----------------------------------------------------------------------------
// 16. API CONSTANTS
// ----------------------------------------------------------------------------

export const API = Object.freeze({
    VERSION: 'v1',
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
});

// ----------------------------------------------------------------------------
// 17. PAGINATION CONSTANTS
// ----------------------------------------------------------------------------

export const PAGINATION = Object.freeze({
    DEFAULT_PAGE: 1,
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
});

// ----------------------------------------------------------------------------
// 18. CACHE CONSTANTS
// ----------------------------------------------------------------------------

export const CACHE = Object.freeze({
    TTL_SHORT: 60, // 1 minute
    TTL_MEDIUM: 300, // 5 minutes
    TTL_LONG: 3600, // 1 hour
    TTL_DAY: 86400, // 24 hours
    TTL_WEEK: 604800, // 7 days
});

// ----------------------------------------------------------------------------
// 19. COOKIE CONSTANTS
// ----------------------------------------------------------------------------

export const COOKIE = Object.freeze({
    SESSION_NAME: 'tesnow.sid',
    CSRF_NAME: 'tesnow.csrf',
    THEME_NAME: 'tesnow.theme',
});

// ----------------------------------------------------------------------------
// 20. REQUEST HEADER CONSTANTS
// ----------------------------------------------------------------------------

export const HEADER = Object.freeze({
    X_REQUEST_ID: 'x-request-id',
    X_FORWARDED_FOR: 'x-forwarded-for',
    X_FORWARDED_PROTO: 'x-forwarded-proto',
    X_FORWARDED_HOST: 'x-forwarded-host',
    X_FORWARDED_PORT: 'x-forwarded-port',
    X_REAL_IP: 'x-real-ip',
    X_RATELIMIT_LIMIT: 'x-ratelimit-limit',
    X_RATELIMIT_REMAINING: 'x-ratelimit-remaining',
    X_RATELIMIT_RESET: 'x-ratelimit-reset',
});

// ----------------------------------------------------------------------------
// 21. CONTENT LIMITS
// ----------------------------------------------------------------------------

export const LIMIT = Object.freeze({
    // User-related
    USERNAME_MIN_LENGTH: 3,
    USERNAME_MAX_LENGTH: 50,
    BIO_MAX_LENGTH: 500,
    EMAIL_MAX_LENGTH: 255,

    // Content-related
    TITLE_MIN_LENGTH: 1,
    TITLE_MAX_LENGTH: 255,
    EXCERPT_MAX_LENGTH: 500,
    COMMENT_MIN_LENGTH: 1,
    COMMENT_MAX_LENGTH: 2000,

    // Security
    PASSWORD_MIN_LENGTH: 8,
    PASSWORD_MAX_LENGTH: 128,

    // File-related
    FILENAME_MAX_LENGTH: 255,
    MIME_TYPE_MAX_LENGTH: 100,

    // Tags
    TAG_NAME_MIN_LENGTH: 1,
    TAG_NAME_MAX_LENGTH: 50,

    // Category
    CATEGORY_NAME_MIN_LENGTH: 1,
    CATEGORY_NAME_MAX_LENGTH: 100,
    CATEGORY_SLUG_MAX_LENGTH: 100,
});

// ----------------------------------------------------------------------------
// 22. ROUTE / RESOURCE IDENTIFIERS
// ----------------------------------------------------------------------------

export const RESOURCE = Object.freeze({
    USERS: 'users',
    POSTS: 'posts',
    COMMENTS: 'comments',
    CATEGORIES: 'categories',
    TAGS: 'tags',
    MEDIA: 'media',
    NOTIFICATIONS: 'notifications',
    REPORTS: 'reports',
    ROLES: 'roles',
    PERMISSIONS: 'permissions',
    SETTINGS: 'settings',
    ANALYTICS: 'analytics',
    WEBHOOKS: 'webhooks',
    API_KEYS: 'api_keys',
    SESSIONS: 'sessions',
    REDIRECTS: 'redirects',
    NEWSLETTER: 'newsletter',
    FEATURE_FLAGS: 'feature_flags',
});

// ----------------------------------------------------------------------------
// 23. NODE PROCESS EXIT CODES
// ----------------------------------------------------------------------------

export const EXIT_CODE = Object.freeze({
    SUCCESS: 0,
    GENERAL_ERROR: 1,
    CONFIGURATION_ERROR: 2,
    VALIDATION_ERROR: 3,
    INTERRUPTED: 130,
    UNCAUGHT_EXCEPTION: 1,
    UNHANDLED_REJECTION: 1,
});

// ----------------------------------------------------------------------------
// 24. WEBHOOK CONSTANTS
// ----------------------------------------------------------------------------

export const WEBHOOK_EVENT = Object.freeze({
    USER_CREATED: 'user.created',
    USER_UPDATED: 'user.updated',
    USER_DELETED: 'user.deleted',

    POST_CREATED: 'post.created',
    POST_UPDATED: 'post.updated',
    POST_DELETED: 'post.deleted',
    POST_PUBLISHED: 'post.published',

    COMMENT_CREATED: 'comment.created',
    COMMENT_UPDATED: 'comment.updated',
    COMMENT_DELETED: 'comment.deleted',
    COMMENT_APPROVED: 'comment.approved',

    MEDIA_UPLOADED: 'media.uploaded',
    MEDIA_DELETED: 'media.deleted',

    REPORT_CREATED: 'report.created',
    REPORT_RESOLVED: 'report.resolved',
});

// ----------------------------------------------------------------------------
// 25. QUEUE CONSTANTS
// ----------------------------------------------------------------------------

export const QUEUE = Object.freeze({
    EMAIL: 'email',
    NOTIFICATION: 'notification',
    ANALYTICS: 'analytics',
    MEDIA_PROCESSING: 'media_processing',
    WEBHOOK: 'webhook',
    BACKGROUND: 'background',
});

// ----------------------------------------------------------------------------
// REQUEST ID GENERATOR
// ----------------------------------------------------------------------------

/**
 * Generate a cryptographically secure request ID.
 * @returns {string} UUID v4 request ID
 */
export function generateRequestId() {
    return randomUUID();
}
// ----------------------------------------------------------------------------
// 26. IMPORT & EXPORT
// ----------------------------------------------------------------------------

// Create a single immutable constants object for default export
const CONSTANTS = Object.freeze({
    APP,
    ENV,
    HTTP_STATUS,
    HTTP_METHODS,
    USER_STATUS,
    ADMIN_STATUS,
    POST_STATUS,
    POST_VISIBILITY,
    COMMENT_STATUS,
    REPORT_STATUS,
    MEDIA_TYPE,
    MEDIA_STATUS,
    MEDIA_CATEGORIES,
    SESSION_STATUS,
    SECURITY_EVENT,
    SECURITY_SEVERITY,
    AUDIT_ACTION,
    NOTIFICATION_TYPE,
    API,
    PAGINATION,
    CACHE,
    COOKIE,
    HEADER,
    LIMIT,
    RESOURCE,
    EXIT_CODE,
    WEBHOOK_EVENT,
    QUEUE,
    generateRequestId,
});

// Freeze the entire constants object recursively
Object.freeze(CONSTANTS);

export default CONSTANTS;
// Named exports
/*
export {
    CONSTANTS as default,
    APP,
    ENV,
    HTTP_STATUS,
    HTTP_METHODS,
    USER_STATUS,
    ADMIN_STATUS,
    POST_STATUS,
    POST_VISIBILITY,
    COMMENT_STATUS,
    REPORT_STATUS,
    MEDIA_TYPE,
    MEDIA_STATUS,
    MEDIA_CATEGORIES,
    SESSION_STATUS,
    SECURITY_EVENT,
    SECURITY_SEVERITY,
    AUDIT_ACTION,
    NOTIFICATION_TYPE,
    API,
    PAGINATION,
    CACHE,
    COOKIE,
    HEADER,
    LIMIT,
    RESOURCE,
    EXIT_CODE,
    WEBHOOK_EVENT,
    QUEUE,
};
*/

// ----------------------------------------------------------------------------
// EXPLANATION
// ----------------------------------------------------------------------------

/**
 * CONSTANT GROUPS CREATED
 * 
 * 1. Application - APP (name, version, locale, timezone)
 * 2. Environment - ENV (development, test, production)
 * 3. HTTP - HTTP_STATUS, HTTP_METHODS (all standard HTTP codes and methods)
 * 4. Users - USER_STATUS (active, inactive, suspended, banned, pending)
 * 5. Admins - ADMIN_STATUS (active, inactive, suspended)
 * 6. Posts - POST_STATUS (draft, review, scheduled, published, archived, trash)
 * 7. Post Visibility - POST_VISIBILITY (public, private, password)
 * 8. Comments - COMMENT_STATUS (pending, approved, rejected, spam, trash)
 * 9. Reports - REPORT_STATUS (pending, reviewing, resolved, dismissed)
 * 10. Media - MEDIA_TYPE, MEDIA_STATUS, MEDIA_CATEGORIES
 * 11. Sessions - SESSION_STATUS (active, revoked, expired)
 * 12. Security - SECURITY_EVENT, SECURITY_SEVERITY
 * 13. Audit - AUDIT_ACTION
 * 14. Notifications - NOTIFICATION_TYPE
 * 15. API - API (version, pagination defaults)
 * 16. Pagination - PAGINATION (page, size, max size)
 * 17. Cache - CACHE (TTL values)
 * 18. Cookies - COOKIE (session, CSRF, theme names)
 * 19. Headers - HEADER (request header names)
 * 20. Limits - LIMIT (content length constraints)
 * 21. Resources - RESOURCE (resource identifiers)
 * 22. Exit Codes - EXIT_CODE (process exit codes)
 * 23. Webhooks - WEBHOOK_EVENT (webhook event types)
 * 24. Queues - QUEUE (queue names)
 * 
 * IMMUTABILITY ENFORCEMENT
 * 
 * All constants are frozen using Object.freeze() at multiple levels:
 * - Each constant object is frozen individually
 * - The default export object is frozen
 * - Object.freeze() is applied recursively to prevent mutation
 * - Arrays within constants are also frozen where applicable
 * 
 * VALUES INTENTIONALLY IN CONFIGURATION/VALIDATION
 * 
 * The following values remain in configuration modules rather than constants:
 * - Database connection strings (database.config.js)
 * - API keys, secrets, passwords (environment variables)
 * - Session store configuration (session.config.js)
 * - CORS origins (cors.config.js)
 * - Rate limiting parameters (rate-limit.config.js)
 * - Email configuration (email.config.js)
 * - Storage paths (storage.config.js)
 * - Upload configuration (upload.config.js)
 * - Feature flags (feature-flags.config.js)
 * - Environment-specific URLs (api.config.js)
 * - SMTP settings (email.config.js)
 * - OAuth credentials (oauth.config.js)
 * 
 * IMPORT PATTERNS
 * 
 * Named imports (recommended):
 * import { USER_STATUS, POST_STATUS, HTTP_STATUS } from '../core/constants.js';
 * 
 * Default import:
 * import CONSTANTS from '../core/constants.js';
 * 
 * Destructuring from default:
 * import CONSTANTS from '../core/constants.js';
 * const { USER_STATUS, HTTP_STATUS } = CONSTANTS;
 * 
 * All imported objects are immutable and cannot be modified at runtime.
 */