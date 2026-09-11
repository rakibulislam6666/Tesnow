/**
 * app/repositories/user.repository.js
 *
 * Data-access layer for the `users` table.
 *
 * Responsibilities:
 *   - Parameterized SQL only.
 *   - Explicit column selection per use case (no SELECT *).
 *   - Bounded, deterministic pagination.
 *   - Soft-delete filtering consistent across all queries.
 *   - Propagate database errors unchanged.
 *
 * Non-responsibilities:
 *   - Business rules, authentication decisions, RBAC.
 *   - Password hashing or verification.
 *   - Session/cookie management.
 *   - HTTP/response formatting.
 *   - Logging of user data or credentials.
 *
 * Repository boundary note:
 *   `password_hash` is deliberately returned by the authentication-lookup
 *   methods because the authentication service needs it for verification.
 *   The service is responsible for stripping it before any user-facing
 *   result. It is never returned by listing or count queries.
 */

import { getDbPool } from '../config/database.config.js';

// ----------------------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------------------

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

// ----------------------------------------------------------------------------
// INTERNAL VALIDATION HELPERS
// ----------------------------------------------------------------------------

/**
 * Validate a non-negative integer (0 or positive).
 *
 * Used for `offset`, where 0 is a legitimate value.
 *
 * @param {*} value
 * @param {string} name
 * @returns {number}
 * @throws {TypeError|RangeError}
 */
function validateNonNegativeInteger(value, name) {
    if (!Number.isInteger(value)) {
        throw new TypeError(`${name} must be an integer`);
    }
    if (value < 0) {
        throw new RangeError(`${name} must be a non-negative integer`);
    }
    return value;
}

/**
 * Validate a pagination limit.
 *
 * The repository enforces a strictly positive minimum so callers cannot
 * silently produce `LIMIT 0` and receive an empty result set that looks
 * like a legitimate "no data" response.
 *
 * @param {*} limit
 * @returns {number}
 * @throws {TypeError|RangeError}
 */
function validateLimit(limit) {
    if (!Number.isInteger(limit)) {
        throw new TypeError('limit must be an integer');
    }
    if (limit < 1) {
        throw new RangeError('limit must be at least 1');
    }
    if (limit > MAX_LIMIT) {
        throw new RangeError(`limit cannot exceed ${MAX_LIMIT}`);
    }
    return limit;
}

// ----------------------------------------------------------------------------
// REPOSITORY FACTORY
// ----------------------------------------------------------------------------

/**
 * Create the user repository bound to a mysql2-compatible pool.
 *
 * The pool is injected so unit tests can provide a mock implementation.
 * The factory validates the pool shape at construction time so wiring
 * mistakes fail immediately rather than on the first request.
 *
 * @param {import('mysql2/promise').Pool} [pool]
 * @returns {object}
 */
export function createUserRepository(pool = getDbPool()) {
    if (!pool || typeof pool.query !== 'function') {
        throw new TypeError('createUserRepository requires a mysql2-compatible pool');
    }

    return {
        // --------------------------------------------------------------------
        // DASHBOARD / LIST METHODS
        // --------------------------------------------------------------------

        /**
         * Count all non-deleted users.
         *
         * Exact count is required by the dashboard contract. For very
         * large tables this is inherently O(n) over the filtered subset;
         * replacing it with an approximate count would be a contract change
         * and is not done here.
         *
         * @returns {Promise<number>}
         */
        async countAll() {
            const [rows] = await pool.query(
                'SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL'
            );
            return Number(rows[0]?.count ?? 0);
        },

        /**
         * List recent non-deleted users.
         *
         * Ordering is deterministic: newest first, then highest id to
         * break ties. The composite ordering matches the natural scan
         * direction of a `(created_at DESC, id DESC)` index if one exists.
         *
         * @param {{ limit?: number, offset?: number }} [options]
         * @returns {Promise<Array<object>>}
         */
        async findRecent({ limit = DEFAULT_LIMIT, offset = 0 } = {}) {
            const safeLimit = validateLimit(limit);
            const safeOffset = validateNonNegativeInteger(offset, 'offset');

            const [rows] = await pool.query(
                `SELECT
                    id,
                    username,
                    first_name,
                    last_name,
                    avatar_url,
                    created_at
                 FROM users
                 WHERE deleted_at IS NULL
                 ORDER BY created_at DESC, id DESC
                 LIMIT ? OFFSET ?`,
                [safeLimit, safeOffset]
            );
            return rows;
        },

        // --------------------------------------------------------------------
        // AUTHENTICATION LOOKUPS
        // --------------------------------------------------------------------

        /**
         * Find an active user by username or email.
         *
         * Identifier normalization (lowercasing, trimming) is intentionally
         * NOT performed here. The database collation governs case
         * sensitivity, and any input normalization policy belongs to the
         * validator or service layer. The repository accepts the identifier
         * exactly as supplied by its caller.
         *
         * The predicate `(username = ? OR email = ?)` is served efficiently
         * by MySQL's index-merge union when unique indexes exist on both
         * `username` and `email`. Rewriting as UNION is not necessary.
         *
         * `password_hash` is returned because the authentication service
         * requires it for verification. It must never be forwarded to
         * clients by any downstream layer.
         *
         * @param {string} usernameOrEmail
         * @returns {Promise<object|null>}
         */
        async findByUsernameOrEmail(usernameOrEmail) {
            if (
                typeof usernameOrEmail !== 'string' ||
                usernameOrEmail.trim() === ''
            ) {
                throw new TypeError('usernameOrEmail must be a non-empty string');
            }

            const [rows] = await pool.query(
                `SELECT
                    id,
                    username,
                    email,
                    password_hash,
                    status,
                    created_at,
                    deleted_at
                 FROM users
                 WHERE (username = ? OR email = ?)
                   AND deleted_at IS NULL
                 LIMIT 1`,
                [usernameOrEmail, usernameOrEmail]
            );

            return rows[0] || null;
        },

        /**
         * Find an active user by numeric primary key.
         *
         * Used by the authentication middleware to re-validate the current
         * authenticated user against fresh database state on every
         * authenticated request. Soft-deleted users are excluded so a
         * deletion between requests takes effect immediately.
         *
         * The application representation of user id is a positive JavaScript
         * number. Values outside that contract are rejected before reaching
         * the driver.
         *
         * @param {number} id
         * @returns {Promise<object|null>}
         */
        async findById(id) {
            if (!Number.isInteger(id) || id <= 0) {
                throw new TypeError('id must be a positive integer');
            }

            const [rows] = await pool.query(
                `SELECT
                    id,
                    username,
                    email,
                    password_hash,
                    status,
                    created_at,
                    deleted_at
                 FROM users
                 WHERE id = ?
                   AND deleted_at IS NULL
                 LIMIT 1`,
                [id]
            );

            return rows[0] || null;
        },
    };
}

// ----------------------------------------------------------------------------
// DEFAULT APPLICATION INSTANCE
// ----------------------------------------------------------------------------

/**
 * Default instantiated repository bound to the shared database pool.
 * Existing consumers continue to import this instance directly.
 */
export default createUserRepository();