/**
 * app/services/auth/session.service.js
 *
 * Tesnow session lifecycle service.
 *
 * Responsibilities:
 *   - Hash Express session IDs.
 *   - Create DB-backed session records.
 *   - Revoke DB-backed sessions.
 *   - Validate DB-backed sessions.
 *   - Throttle last_activity_at updates.
 *   - Provide bounded cleanup primitives.
 *
 * Important compatibility contract:
 *   Existing callers use:
 *
 *     sessionService.createSession(userId, hashedSessionId, expiresAt)
 *     sessionService.revokeSession(hashedSessionId)
 *     sessionService.validateSession(hashedSessionId, userId)
 *
 *   Those signatures MUST remain unchanged.
 */

import crypto from 'node:crypto';

import sessionRepository from '../../repositories/session.repository.js';
import { createChildLogger } from '../../core/logger.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const HASH_HEX_PATTERN = /^[a-f0-9]{64}$/;

const ACTIVITY_UPDATE_INTERVAL_MS = 10 * 60 * 1000;

const EXPIRED_RETENTION_DAYS = 7;
const REVOKED_RETENTION_DAYS = 30;

const CLEANUP_BATCH_LIMIT = 5000;

const MIN_ACTIVITY_INTERVAL_MS = 60 * 1000;
const MAX_ACTIVITY_INTERVAL_MS = 60 * 60 * 1000;

const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 365;

const MIN_CLEANUP_BATCH_LIMIT = 1;
const MAX_CLEANUP_BATCH_LIMIT = 50_000;

const logger = createChildLogger({
    module: 'session-service',
});

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

function assertHashedSessionId(hashedSessionId) {
    if (
        typeof hashedSessionId !== 'string' ||
        !HASH_HEX_PATTERN.test(hashedSessionId)
    ) {
        throw new TypeError(
            'hashedSessionId must be a 64-character lowercase hex string'
        );
    }

    return hashedSessionId;
}

function assertUserId(userId) {
    if (
        typeof userId !== 'number' ||
        !Number.isInteger(userId) ||
        !Number.isSafeInteger(userId) ||
        userId <= 0
    ) {
        throw new TypeError('userId must be a positive safe integer');
    }

    return userId;
}

function assertFutureDate(expiresAt, now = new Date()) {
    if (!(expiresAt instanceof Date)) {
        throw new TypeError('expiresAt must be a Date instance');
    }

    const expiresAtMs = expiresAt.getTime();

    if (!Number.isFinite(expiresAtMs)) {
        throw new TypeError('expiresAt must be a valid Date');
    }

    if (expiresAtMs <= now.getTime()) {
        throw new TypeError('expiresAt must be in the future');
    }

    return expiresAt;
}

function assertValidDate(value, name) {
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
        throw new TypeError(`${name} must be a valid Date`);
    }

    return value;
}

function assertIntegerInRange(value, name, min, max) {
    if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < min ||
        value > max
    ) {
        throw new TypeError(
            `${name} must be an integer between ${min} and ${max}`
        );
    }

    return value;
}

function assertHashOrNull(value, name) {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value !== 'string' || !HASH_HEX_PATTERN.test(value)) {
        throw new TypeError(
            `${name} must be a 64-character lowercase hex string or null`
        );
    }

    return value;
}

function isExpired(expiresAt, now = new Date()) {
    let expiresAtMs;

    if (expiresAt instanceof Date) {
        expiresAtMs = expiresAt.getTime();
    } else {
        expiresAtMs = new Date(expiresAt).getTime();
    }

    if (!Number.isFinite(expiresAtMs)) {
        return true;
    }

    return expiresAtMs <= now.getTime();
}

// ============================================================================
// SERVICE FACTORY
// ============================================================================

/**
 * Dependency-injection factory.
 *
 * Used by tests and controlled application wiring.
 *
 * Existing application code should continue using the default export below.
 *
 * @param {object} [dependencies]
 * @param {object} [dependencies.repository]
 * @param {object} [dependencies.logger]
 * @param {number} [dependencies.activityUpdateIntervalMs]
 * @returns {object}
 */
export function createSessionService({
    repository = sessionRepository,
    logger: serviceLogger = logger,
    activityUpdateIntervalMs = ACTIVITY_UPDATE_INTERVAL_MS,
} = {}) {
    if (!repository || typeof repository !== 'object') {
        throw new TypeError('Session repository is required');
    }

    const requiredMethods = [
        'createSession',
        'revokeSession',
        'findByHashedSessionId',
        'updateLastActivity',
        'deleteExpiredBefore',
        'deleteRevokedBefore',
    ];

    for (const method of requiredMethods) {
        if (typeof repository[method] !== 'function') {
            throw new TypeError(
                `sessionRepository.${method} must be a function`
            );
        }
    }

    assertIntegerInRange(
        activityUpdateIntervalMs,
        'activityUpdateIntervalMs',
        MIN_ACTIVITY_INTERVAL_MS,
        MAX_ACTIVITY_INTERVAL_MS
    );

    function safeLog(level, payload) {
        if (!serviceLogger || typeof serviceLogger[level] !== 'function') {
            return;
        }

        try {
            serviceLogger[level](payload);
        } catch {
            // Logging must never break authentication/session processing.
        }
    }

    // ========================================================================
    // HASH
    // ========================================================================

    /**
     * Hash an Express session ID.
     *
     * Raw session IDs must never be persisted or logged.
     *
     * @param {string} sessionId
     * @returns {string}
     */
    function hashSessionId(sessionId) {
        if (typeof sessionId !== 'string' || sessionId.length === 0) {
            throw new TypeError('sessionId must be a non-empty string');
        }

        return crypto
            .createHash('sha256')
            .update(sessionId, 'utf8')
            .digest('hex');
    }

    // ========================================================================
    // CREATE
    // ========================================================================

    /**
     * Create a DB session record.
     *
     * IMPORTANT:
     * This signature intentionally remains compatible with the existing
     * auth.routes.js implementation.
     *
     * @param {number} userId
     * @param {string} hashedSessionId
     * @param {Date} expiresAt
     * @returns {Promise<*>}
     */
    async function createSession(userId, hashedSessionId, expiresAt) {
        const safeUserId = assertUserId(userId);
        const safeHash = assertHashedSessionId(hashedSessionId);
        const safeExpiresAt = assertFutureDate(expiresAt);

        return repository.createSession(
            safeUserId,
            safeHash,
            safeExpiresAt
        );
    }

    // ========================================================================
    // REVOKE
    // ========================================================================

    /**
     * Revoke a DB session.
     *
     * Existing callers continue using:
     *
     *   revokeSession(hashedSessionId)
     *
     * @param {string} hashedSessionId
     * @returns {Promise<*>}
     */
    async function revokeSession(hashedSessionId) {
        const safeHash = assertHashedSessionId(hashedSessionId);

        return repository.revokeSession(safeHash);
    }

    // ========================================================================
    // VALIDATE
    // ========================================================================

    /**
     * Validate a session.
     *
     * Existing callers continue using:
     *
     *   validateSession(hashedSessionId, userId)
     *
     * Return contract is intentionally preserved:
     *
     *   { valid: true }
     *
     * or
     *
     *   { valid: false, reason: 'not_found'|'wrong_user'|'revoked'|'expired' }
     *
     * @param {string} hashedSessionId
     * @param {number} userId
     * @returns {Promise<object>}
     */
    async function validateSession(hashedSessionId, userId) {
        const safeHash = assertHashedSessionId(hashedSessionId);
        const safeUserId = assertUserId(userId);

        const record = await repository.findByHashedSessionId(safeHash);

        if (!record) {
            return {
                valid: false,
                reason: 'not_found',
            };
        }

        if (Number(record.user_id) !== safeUserId) {
            return {
                valid: false,
                reason: 'wrong_user',
            };
        }

        if (
            record.revoked_at !== null &&
            record.revoked_at !== undefined
        ) {
            return {
                valid: false,
                reason: 'revoked',
            };
        }

        if (isExpired(record.expires_at)) {
            return {
                valid: false,
                reason: 'expired',
            };
        }

        return {
            valid: true,

            // These additional fields are safe projections and do not expose
            // session identifiers, hashes, tokens, or secrets.
            sessionRecordId:
                Number.isSafeInteger(Number(record.id)) &&
                Number(record.id) > 0
                    ? Number(record.id)
                    : null,

            lastActivityAt:
                record.last_activity_at !== null &&
                record.last_activity_at !== undefined
                    ? new Date(record.last_activity_at)
                    : null,

            expiresAt:
                record.expires_at !== null &&
                record.expires_at !== undefined
                    ? new Date(record.expires_at)
                    : null,
        };
    }

    // ========================================================================
    // LAST ACTIVITY
    // ========================================================================

    /**
     * Best-effort, throttled session activity update.
     *
     * Authentication must NEVER fail because this metadata update fails.
     *
     * @param {number} sessionRecordId
     * @param {Date|null} lastActivityAt
     * @param {Date} [now]
     * @returns {Promise<boolean>}
     */
    async function touchSessionActivity(
        sessionRecordId,
        lastActivityAt,
        now = new Date()
    ) {
        try {
            if (
                !Number.isInteger(sessionRecordId) ||
                !Number.isSafeInteger(sessionRecordId) ||
                sessionRecordId <= 0
            ) {
                return false;
            }

            assertValidDate(now, 'now');

            if (lastActivityAt !== null && lastActivityAt !== undefined) {
                if (
                    !(lastActivityAt instanceof Date) ||
                    !Number.isFinite(lastActivityAt.getTime())
                ) {
                    return false;
                }

                const elapsed =
                    now.getTime() - lastActivityAt.getTime();

                // Future timestamps are treated as "recent" rather than
                // immediately triggering a write.
                if (elapsed < activityUpdateIntervalMs) {
                    return false;
                }
            }

            const affectedRows = await repository.updateLastActivity(
                sessionRecordId,
                now
            );

            return Number(affectedRows) > 0;
        } catch (error) {
            safeLog('warn', {
                event: 'session_activity_update_failed',
                errorName:
                    error instanceof Error
                        ? error.name
                        : 'Error',
                errorCode:
                    error && typeof error.code === 'string'
                        ? error.code
                        : undefined,
            });

            return false;
        }
    }

    // ========================================================================
    // CLEANUP
    // ========================================================================

    /**
     * Delete expired sessions older than the configured retention period.
     *
     * This function performs ONE bounded repository operation.
     * The maintenance script is responsible for repeatedly calling it.
     *
     * @param {object} [options]
     * @param {number} [options.retentionDays]
     * @param {number} [options.batchLimit]
     * @param {Date} [options.now]
     * @returns {Promise<number>}
     */
    async function cleanupExpiredSessions({
        retentionDays = EXPIRED_RETENTION_DAYS,
        batchLimit = CLEANUP_BATCH_LIMIT,
        now = new Date(),
    } = {}) {
        const safeRetentionDays = assertIntegerInRange(
            retentionDays,
            'retentionDays',
            MIN_RETENTION_DAYS,
            MAX_RETENTION_DAYS
        );

        const safeBatchLimit = assertIntegerInRange(
            batchLimit,
            'batchLimit',
            MIN_CLEANUP_BATCH_LIMIT,
            MAX_CLEANUP_BATCH_LIMIT
        );

        assertValidDate(now, 'now');

        const cutoff = new Date(
            now.getTime() -
                safeRetentionDays * 24 * 60 * 60 * 1000
        );

        return repository.deleteExpiredBefore(
            cutoff,
            safeBatchLimit
        );
    }

    /**
     * Delete revoked sessions older than the configured retention period.
     *
     * @param {object} [options]
     * @param {number} [options.retentionDays]
     * @param {number} [options.batchLimit]
     * @param {Date} [options.now]
     * @returns {Promise<number>}
     */
    async function cleanupRevokedSessions({
        retentionDays = REVOKED_RETENTION_DAYS,
        batchLimit = CLEANUP_BATCH_LIMIT,
        now = new Date(),
    } = {}) {
        const safeRetentionDays = assertIntegerInRange(
            retentionDays,
            'retentionDays',
            MIN_RETENTION_DAYS,
            MAX_RETENTION_DAYS
        );

        const safeBatchLimit = assertIntegerInRange(
            batchLimit,
            'batchLimit',
            MIN_CLEANUP_BATCH_LIMIT,
            MAX_CLEANUP_BATCH_LIMIT
        );

        assertValidDate(now, 'now');

        const cutoff = new Date(
            now.getTime() -
                safeRetentionDays * 24 * 60 * 60 * 1000
        );

        return repository.deleteRevokedBefore(
            cutoff,
            safeBatchLimit
        );
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    return Object.freeze({
        hashSessionId,
        createSession,
        revokeSession,
        validateSession,
        touchSessionActivity,
        cleanupExpiredSessions,
        cleanupRevokedSessions,

        constants: Object.freeze({
            ACTIVITY_UPDATE_INTERVAL_MS,
            EXPIRED_RETENTION_DAYS,
            REVOKED_RETENTION_DAYS,
            CLEANUP_BATCH_LIMIT,
        }),
    });
}

// ============================================================================
// DEFAULT APPLICATION INSTANCE
// ============================================================================

/**
 * IMPORTANT:
 *
 * Existing application code imports the instantiated service:
 *
 *   import sessionService from '../services/auth/session.service.js';
 *
 * Therefore the default export MUST remain an instance, not the factory.
 */
const sessionService = createSessionService();

export default sessionService;