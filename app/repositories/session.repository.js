/**
 * app/repositories/session.repository.js
 *
 * Database session tracking.
 *
 * Responsibilities:
 *   - Persist hashed Express session identifiers.
 *   - Revoke sessions.
 *   - Validate/load session metadata.
 *   - Update throttled activity timestamps.
 *   - Perform bounded session cleanup.
 *
 * Important:
 *   Session IDs and session hashes must never be logged.
 */

import { getDbPool } from '../config/database.config.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const HASH_HEX_PATTERN = /^[a-f0-9]{64}$/;

const MIN_CLEANUP_BATCH_LIMIT = 1;
const MAX_CLEANUP_BATCH_LIMIT = 50_000;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

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

function assertValidDate(value, name) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError(`${name} must be a valid Date`);
  }

  return value;
}

function assertSessionRecordId(sessionRecordId) {
  if (
    typeof sessionRecordId !== 'number' ||
    !Number.isInteger(sessionRecordId) ||
    !Number.isSafeInteger(sessionRecordId) ||
    sessionRecordId <= 0
  ) {
    throw new TypeError(
      'sessionRecordId must be a positive safe integer'
    );
  }

  return sessionRecordId;
}

function assertCleanupBatchLimit(batchLimit) {
  if (
    typeof batchLimit !== 'number' ||
    !Number.isInteger(batchLimit) ||
    batchLimit < MIN_CLEANUP_BATCH_LIMIT ||
    batchLimit > MAX_CLEANUP_BATCH_LIMIT
  ) {
    throw new TypeError(
      `batchLimit must be an integer between ${MIN_CLEANUP_BATCH_LIMIT} and ${MAX_CLEANUP_BATCH_LIMIT}`
    );
  }

  return batchLimit;
}

// ============================================================================
// REPOSITORY FACTORY
// ============================================================================

export function createSessionRepository(pool = getDbPool()) {
  if (!pool || typeof pool.query !== 'function') {
    throw new TypeError('A valid database pool is required');
  }

  return {
    // ========================================================================
    // CREATE
    // ========================================================================

    /**
     * Create a new session record.
     *
     * Existing application API:
     *   createSession(userId, hashedSessionId, expiresAt)
     *
     * @param {number} userId
     * @param {string} hashedSessionId
     * @param {Date} expiresAt
     * @returns {Promise<void>}
     */
    async createSession(userId, hashedSessionId, expiresAt) {
      const safeUserId = assertUserId(userId);
      const safeHash = assertHashedSessionId(hashedSessionId);
      const safeExpiresAt = assertValidDate(expiresAt, 'expiresAt');

      await pool.query(
        `INSERT INTO sessions
         (
           session_identifier,
           user_id,
           session_token_hash,
           expires_at,
           created_at,
           last_activity_at
         )
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [
          safeHash,
          safeUserId,
          safeHash,
          safeExpiresAt,
        ]
      );
    },

    // ========================================================================
    // REVOKE
    // ========================================================================

    /**
     * Revoke a session by its hashed identifier.
     *
     * Revocation is idempotent:
     * attempting to revoke an already-revoked session is harmless.
     *
     * @param {string} hashedSessionId
     * @returns {Promise<number>} affected row count
     */
    async revokeSession(hashedSessionId) {
      const safeHash = assertHashedSessionId(hashedSessionId);

      const [result] = await pool.query(
        `UPDATE sessions
         SET revoked_at = COALESCE(revoked_at, NOW())
         WHERE session_identifier = ?
           AND revoked_at IS NULL`,
        [safeHash]
      );

      return Number(result?.affectedRows) || 0;
    },

    // ========================================================================
    // FIND
    // ========================================================================

    /**
     * Find an active/session record by its hashed identifier.
     *
     * The service layer performs ownership, revocation and expiration
     * decisions. The repository only retrieves the required metadata.
     *
     * @param {string} hashedSessionId
     * @returns {Promise<Object|null>}
     */
    async findByHashedSessionId(hashedSessionId) {
      const safeHash = assertHashedSessionId(hashedSessionId);

      const [rows] = await pool.query(
        `SELECT
           id,
           user_id,
           expires_at,
           revoked_at,
           last_activity_at
         FROM sessions
         WHERE session_identifier = ?
         LIMIT 1`,
        [safeHash]
      );

      return rows[0] || null;
    },

    // ========================================================================
    // ACTIVITY
    // ========================================================================

    /**
     * Update last_activity_at for a specific session record.
     *
     * The service layer is responsible for throttling how frequently this
     * method is called.
     *
     * @param {number} sessionRecordId
     * @param {Date} lastActivityAt
     * @returns {Promise<number>} affected row count
     */
    async updateLastActivity(sessionRecordId, lastActivityAt) {
      const safeSessionRecordId =
        assertSessionRecordId(sessionRecordId);

      const safeLastActivityAt = assertValidDate(
        lastActivityAt,
        'lastActivityAt'
      );

      const [result] = await pool.query(
        `UPDATE sessions
         SET last_activity_at = ?
         WHERE id = ?
           AND revoked_at IS NULL
           AND expires_at > ?`,
        [
          safeLastActivityAt,
          safeSessionRecordId,
          safeLastActivityAt,
        ]
      );

      return Number(result?.affectedRows) || 0;
    },

    // ========================================================================
    // CLEANUP: EXPIRED
    // ========================================================================

    /**
     * Delete expired session records older than the supplied cutoff.
     *
     * Only expired records are removed here.
     *
     * This intentionally does NOT delete revoked sessions merely because
     * they are expired. Revoked-session retention is handled separately.
     *
     * The LIMIT keeps cleanup bounded and prevents one maintenance run from
     * creating an unnecessarily large transaction/lock workload.
     *
     * @param {Date} cutoffDate
     * @param {number} batchLimit
     * @returns {Promise<number>} deleted row count
     */
    async deleteExpiredBefore(cutoffDate, batchLimit) {
      const safeCutoffDate = assertValidDate(
        cutoffDate,
        'cutoffDate'
      );

      const safeBatchLimit =
        assertCleanupBatchLimit(batchLimit);

      /*
       * MySQL does not allow a bind parameter for LIMIT in every driver/query
       * context reliably. batchLimit has already been strictly validated as
       * an integer, so interpolation here is safe.
       */
      const [result] = await pool.query(
        `DELETE FROM sessions
         WHERE revoked_at IS NULL
           AND expires_at < ?
         ORDER BY expires_at ASC
         LIMIT ${safeBatchLimit}`,
        [safeCutoffDate]
      );

      return Number(result?.affectedRows) || 0;
    },

    // ========================================================================
    // CLEANUP: REVOKED
    // ========================================================================

    /**
     * Delete revoked session records older than the supplied cutoff.
     *
     * Revoked retention is deliberately independent from expired retention.
     * This preserves security/audit usefulness for revoked sessions.
     *
     * @param {Date} cutoffDate
     * @param {number} batchLimit
     * @returns {Promise<number>} deleted row count
     */
    async deleteRevokedBefore(cutoffDate, batchLimit) {
      const safeCutoffDate = assertValidDate(
        cutoffDate,
        'cutoffDate'
      );

      const safeBatchLimit =
        assertCleanupBatchLimit(batchLimit);

      const [result] = await pool.query(
        `DELETE FROM sessions
         WHERE revoked_at IS NOT NULL
           AND revoked_at < ?
         ORDER BY revoked_at ASC
         LIMIT ${safeBatchLimit}`,
        [safeCutoffDate]
      );

      return Number(result?.affectedRows) || 0;
    },
  };
}

// ============================================================================
// DEFAULT APPLICATION INSTANCE
// ============================================================================

export default createSessionRepository();