/**
 * app/repositories/post.repository.js
 *
 * Database access layer for the `posts` table.
 *
 * Responsibilities:
 *   - Parameterized SQL only.
 *   - Explicit column selection per use-case.
 *   - Allowlisted status/visibility filters.
 *   - Bounded, deterministic pagination.
 *   - Public/admin data separation.
 *
 * Non-responsibilities:
 *   - Business workflow / authorization -> Service layer
 *   - Input-shape validation -> Validator layer
 *   - HTTP status/messages -> Controller / error layer
 *
 * Error contract:
 *   Database errors are propagated unchanged. This layer does not swallow
 *   database failures, return fake results, or construct HTTP errors.
 */

import { getDbPool } from '../config/database.config.js';

// ----------------------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------------------

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const MAX_OFFSET = 100_000;

const POST_STATUSES = Object.freeze([
    'draft',
    'review',
    'scheduled',
    'published',
    'archived',
    'trash',
]);

const POST_VISIBILITIES = Object.freeze([
    'public',
    'private',
    'password',
]);

const STATUS_SET = new Set(POST_STATUSES);
const VISIBILITY_SET = new Set(POST_VISIBILITIES);

// ----------------------------------------------------------------------------
// COLUMN DEFINITIONS
// ----------------------------------------------------------------------------

/**
 * Columns safe for public post list responses.
 *
 * Intentionally excludes full post content and internal moderation/security
 * fields. `excerpt` is included because it is public presentation data.
 */
const PUBLIC_LIST_COLUMNS = `
    posts.id,
    posts.uuid,
    posts.slug,
    posts.title,
    posts.excerpt,
    posts.featured_image_id,
    posts.published_at,
    posts.created_at,
    posts.updated_at,
    users.username AS author_name,
    users.avatar_url AS author_avatar
`;

/**
 * Columns required by admin/service post list views.
 *
 * Includes moderation and persistence state that must never be exposed
 * directly through public repository methods.
 */
const ADMIN_LIST_COLUMNS = `
    posts.id,
    posts.uuid,
    posts.author_id,
    posts.category_id,
    posts.title,
    posts.slug,
    posts.status,
    posts.visibility,
    posts.published_at,
    posts.scheduled_at,
    posts.deleted_at,
    posts.created_at,
    posts.updated_at,
    users.username AS author_name,
    users.avatar_url AS author_avatar
`;

/**
 * Columns safe for a public single-post detail page.
 *
 * Internal moderation/state fields (`status`, `visibility`, `scheduled_at`,
 * `deleted_at`, `author_id`) are deliberately excluded so a public detail
 * render cannot accidentally leak lifecycle metadata. `author_name` /
 * `author_avatar` come from the LEFT JOIN in the detail query.
 */
const PUBLIC_DETAIL_COLUMNS = `
    posts.id,
    posts.uuid,
    posts.category_id,
    posts.title,
    posts.slug,
    posts.excerpt,
    posts.content,
    posts.featured_image_id,
    posts.published_at,
    posts.created_at,
    posts.updated_at,
    users.username AS author_name,
    users.avatar_url AS author_avatar
`;

/**
 * Columns required for admin/service single-post reads.
 *
 * Includes internal lifecycle and moderation fields. Includes author
 * display fields because admin detail views are expected to show the
 * author without a follow-up query (avoids an N+1).
 */
const ADMIN_DETAIL_COLUMNS = `
    posts.id,
    posts.uuid,
    posts.author_id,
    posts.category_id,
    posts.title,
    posts.slug,
    posts.excerpt,
    posts.content,
    posts.featured_image_id,
    posts.status,
    posts.visibility,
    posts.published_at,
    posts.scheduled_at,
    posts.deleted_at,
    posts.created_at,
    posts.updated_at,
    users.username AS author_name,
    users.avatar_url AS author_avatar
`;

// ----------------------------------------------------------------------------
// VALIDATION HELPERS
// ----------------------------------------------------------------------------

/**
 * Validate an integer within a defined range.
 *
 * @param {unknown} value
 * @param {string} name
 * @param {{ min: number, max: number }} range
 * @returns {number}
 */
function assertIntegerInRange(value, name, { min, max }) {
    if (!Number.isInteger(value)) {
        throw new TypeError(`${name} must be an integer`);
    }

    if (value < min || value > max) {
        throw new RangeError(
            `${name} must be between ${min} and ${max}`
        );
    }

    return value;
}

/**
 * @param {unknown} limit
 * @returns {number}
 */
function normalizeLimit(limit) {
    if (limit === undefined || limit === null) {
        return DEFAULT_LIMIT;
    }

    return assertIntegerInRange(limit, 'limit', {
        min: 1,
        max: MAX_LIMIT,
    });
}

/**
 * @param {unknown} offset
 * @returns {number}
 */
function normalizeOffset(offset) {
    if (offset === undefined || offset === null) {
        return 0;
    }

    return assertIntegerInRange(offset, 'offset', {
        min: 0,
        max: MAX_OFFSET,
    });
}

/**
 * Validate an optional post status against the database allowlist.
 *
 * `null` means no status filter.
 *
 * @param {unknown} status
 * @returns {string|null}
 */
function normalizeStatus(status) {
    if (status === undefined || status === null) {
        return null;
    }

    if (typeof status !== 'string' || !STATUS_SET.has(status)) {
        throw new RangeError(
            `status must be one of: ${POST_STATUSES.join(', ')}`
        );
    }

    return status;
}

/**
 * Validate an optional visibility value against the database allowlist.
 *
 * `null` means no visibility filter.
 *
 * @param {unknown} visibility
 * @returns {string|null}
 */
function normalizeVisibility(visibility) {
    if (visibility === undefined || visibility === null) {
        return null;
    }

    if (
        typeof visibility !== 'string' ||
        !VISIBILITY_SET.has(visibility)
    ) {
        throw new RangeError(
            `visibility must be one of: ${POST_VISIBILITIES.join(', ')}`
        );
    }

    return visibility;
}

/**
 * Validate a numeric primary key.
 *
 * Full request-level ID validation belongs to the Validator layer.
 *
 * @param {unknown} id
 * @param {string} [name]
 * @returns {number}
 */
function assertPositiveIntegerId(id, name = 'id') {
    if (!Number.isInteger(id) || id <= 0) {
        throw new TypeError(`${name} must be a positive integer`);
    }

    return id;
}

/**
 * Validate a repository lookup string.
 *
 * Leading/trailing whitespace is stripped so a stray space from an
 * upstream validator cannot silently match nothing.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {string}
 */
function assertNonEmptyString(value, name) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new TypeError(`${name} must be a non-empty string`);
    }

    return value.trim();
}

/**
 * Validate the repository-level includeDeleted flag.
 *
 * Only real booleans are accepted. In particular, strings such as
 * `"true"` and `"false"` are rejected to prevent truthiness mistakes that
 * could expose soft-deleted rows.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function normalizeIncludeDeleted(value) {
    if (value === undefined) {
        return false;
    }

    if (typeof value !== 'boolean') {
        throw new TypeError('includeDeleted must be a boolean');
    }

    return value;
}

// ----------------------------------------------------------------------------
// REPOSITORY FACTORY
// ----------------------------------------------------------------------------

/**
 * Create a Post repository bound to a mysql2-compatible pool.
 *
 * The pool is injectable so unit tests can provide a mock implementation.
 *
 * @param {import('mysql2/promise').Pool} [pool]
 * @returns {object}
 */
export function createPostRepository(pool = getDbPool()) {
    if (!pool || typeof pool.query !== 'function') {
        throw new TypeError(
            'createPostRepository requires a mysql2-compatible pool'
        );
    }

    // ------------------------------------------------------------------------
    // COUNT METHODS
    // ------------------------------------------------------------------------

    /**
     * Count all non-deleted posts.
     *
     * Intended primarily for admin/service use.
     *
     * @returns {Promise<number>}
     */
    async function countAll() {
        const [rows] = await pool.query(`
            SELECT COUNT(*) AS count
            FROM posts
            WHERE deleted_at IS NULL
        `);

        return Number(rows[0]?.count ?? 0);
    }

    /**
     * Count non-deleted posts by allowlisted status.
     *
     * @param {string} status
     * @returns {Promise<number>}
     */
    async function countByStatus(status) {
        const safeStatus = normalizeStatus(status);

        if (safeStatus === null) {
            throw new TypeError(
                'countByStatus requires an explicit status'
            );
        }

        const [rows] = await pool.query(
            `
                SELECT COUNT(*) AS count
                FROM posts
                WHERE deleted_at IS NULL
                  AND status = ?
            `,
            [safeStatus]
        );

        return Number(rows[0]?.count ?? 0);
    }

    /**
     * Count publicly visible published posts.
     *
     * Uses the same visibility predicate as findPublicRecent() and
     * findPublicBySlug().
     *
     * @returns {Promise<number>}
     */
    async function countPublic() {
        const [rows] = await pool.query(`
            SELECT COUNT(*) AS count
            FROM posts
            WHERE deleted_at IS NULL
              AND status = 'published'
              AND visibility = 'public'
              AND published_at IS NOT NULL
        `);

        return Number(rows[0]?.count ?? 0);
    }

    // ------------------------------------------------------------------------
    // PUBLIC READS
    // ------------------------------------------------------------------------

    /**
     * Find recent publicly visible published posts.
     *
     * The public predicate is hard-coded so callers cannot accidentally
     * request drafts, private posts, scheduled posts, or soft-deleted
     * records through this method.
     *
     * Ordering is deterministic:
     *   1. newest publication time
     *   2. highest ID when publication timestamps are equal
     *
     * @param {{ limit?: number, offset?: number }} [options]
     * @returns {Promise<Array<object>>}
     */
    async function findPublicRecent({ limit, offset } = {}) {
        const safeLimit = normalizeLimit(limit);
        const safeOffset = normalizeOffset(offset);

        const sql = `
            SELECT ${PUBLIC_LIST_COLUMNS}
            FROM posts
            LEFT JOIN users
                ON posts.author_id = users.id
            WHERE posts.deleted_at IS NULL
              AND posts.status = 'published'
              AND posts.visibility = 'public'
              AND posts.published_at IS NOT NULL
            ORDER BY posts.published_at DESC, posts.id DESC
            LIMIT ? OFFSET ?
        `;

        const [rows] = await pool.query(sql, [
            safeLimit,
            safeOffset,
        ]);

        return rows;
    }

    /**
     * Find a single public post by slug.
     *
     * Only published, public and non-deleted posts are eligible. Selects
     * only public-safe columns; internal lifecycle fields are excluded.
     *
     * @param {string} slug
     * @returns {Promise<object|null>}
     */
    async function findPublicBySlug(slug) {
        const safeSlug = assertNonEmptyString(slug, 'slug');

        const sql = `
            SELECT ${PUBLIC_DETAIL_COLUMNS}
            FROM posts
            LEFT JOIN users
                ON posts.author_id = users.id
            WHERE posts.deleted_at IS NULL
              AND posts.status = 'published'
              AND posts.visibility = 'public'
              AND posts.published_at IS NOT NULL
              AND posts.slug = ?
            LIMIT 1
        `;

        const [rows] = await pool.query(sql, [safeSlug]);

        return rows[0] ?? null;
    }

    // ------------------------------------------------------------------------
    // ADMIN / SERVICE READS
    // ------------------------------------------------------------------------

    /**
     * Find recent posts for admin/service workflows.
     *
     * Status and visibility are optional but always allowlisted.
     *
     * Ordering is based on creation time because administrative views
     * generally need the newest submissions/records first.
     *
     * @param {{
     *   status?: 'draft'|'review'|'scheduled'|'published'|'archived'|'trash',
     *   visibility?: 'public'|'private'|'password',
     *   limit?: number,
     *   offset?: number
     * }} [options]
     * @returns {Promise<Array<object>>}
     */
    async function findAdminRecent({
        status,
        visibility,
        limit,
        offset,
    } = {}) {
        const safeStatus = normalizeStatus(status);
        const safeVisibility = normalizeVisibility(visibility);
        const safeLimit = normalizeLimit(limit);
        const safeOffset = normalizeOffset(offset);

        let sql = `
            SELECT ${ADMIN_LIST_COLUMNS}
            FROM posts
            LEFT JOIN users
                ON posts.author_id = users.id
            WHERE posts.deleted_at IS NULL
        `;

        const params = [];

        if (safeStatus !== null) {
            sql += ' AND posts.status = ?';
            params.push(safeStatus);
        }

        if (safeVisibility !== null) {
            sql += ' AND posts.visibility = ?';
            params.push(safeVisibility);
        }

        sql += `
            ORDER BY posts.created_at DESC, posts.id DESC
            LIMIT ? OFFSET ?
        `;

        params.push(safeLimit, safeOffset);

        const [rows] = await pool.query(sql, params);

        return rows;
    }

    /**
     * Find a post by numeric primary key for admin/service operations.
     *
     * Author display fields are joined here so callers do not need a
     * follow-up query (avoids an N+1). Soft-deleted posts are excluded by
     * default.
     *
     * `includeDeleted` must be a real boolean. String values such as
     * `"false"` are rejected rather than interpreted by truthiness.
     *
     * @param {number} id
     * @param {{ includeDeleted?: boolean }} [options]
     * @returns {Promise<object|null>}
     */
    async function findById(id, { includeDeleted } = {}) {
        const safeId = assertPositiveIntegerId(id, 'id');
        const safeIncludeDeleted =
            normalizeIncludeDeleted(includeDeleted);

        const sql = `
            SELECT ${ADMIN_DETAIL_COLUMNS}
            FROM posts
            LEFT JOIN users
                ON posts.author_id = users.id
            WHERE posts.id = ?
              ${safeIncludeDeleted ? '' : 'AND posts.deleted_at IS NULL'}
            LIMIT 1
        `;

        const [rows] = await pool.query(sql, [safeId]);

        return rows[0] ?? null;
    }

    // ------------------------------------------------------------------------
    // LEGACY COMPATIBILITY
    // ------------------------------------------------------------------------

    /**
     * Backwards-compatible alias for the original generic API.
     *
     * @deprecated Prefer findPublicRecent() for public pages or
     * findAdminRecent() for admin/service workflows.
     *
     * @param {object} [options]
     * @returns {Promise<Array<object>>}
     */
    async function findRecent(options = {}) {
        return findAdminRecent(options);
    }

    // ------------------------------------------------------------------------
    // PUBLIC API
    // ------------------------------------------------------------------------

    return {
        countAll,
        countByStatus,
        countPublic,
        findPublicRecent,
        findPublicBySlug,
        findAdminRecent,
        findById,
        findRecent,
    };
}

export default createPostRepository;