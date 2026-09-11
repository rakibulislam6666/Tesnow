/**
 * app/repositories/category.repository.js
 *
 * Database access layer for the `categories` table.
 *
 * Responsibilities:
 *   - Parameterized SQL only.
 *   - Explicit column selection per use-case.
 *   - Strict repository-level query normalization.
 *   - Bounded, deterministic pagination.
 *   - Public/admin visibility separation.
 *   - Read-only hierarchy primitives.
 *
 * Non-responsibilities:
 *   - Business workflow / authorization -> Service layer
 *   - Request validation / UUID & slug format rules -> Validator layer
 *   - Circular hierarchy prevention -> Service layer
 *   - HTTP status/messages -> Controller / error layer
 *
 * Error contract:
 *   Database errors propagate unchanged.
 */

import { getDbPool } from '../config/database.config.js';

// -----------------------------------------------------------------------------
// CONSTANTS
// -----------------------------------------------------------------------------

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_OFFSET = 100_000;

const NAME_MAX_LENGTH = 150;
const SLUG_MAX_LENGTH = 150;
const DESCRIPTION_MAX_LENGTH = 500;
const UUID_MAX_LENGTH = 36;
const MAX_SORT_ORDER = 4_294_967_295;

const LIST_ORDERINGS = Object.freeze([
    'sort_order_asc',
    'created_at_desc',
]);

const LIST_ORDERING_SET = new Set(LIST_ORDERINGS);

/**
 * Only internally defined SQL fragments may be selected.
 * Caller input is never interpolated into ORDER BY.
 */
const ORDER_BY_SQL = Object.freeze({
    sort_order_asc:
        'ORDER BY categories.sort_order ASC, categories.id ASC',
    created_at_desc:
        'ORDER BY categories.created_at DESC, categories.id DESC',
});

// -----------------------------------------------------------------------------
// EXPLICIT COLUMN SETS
// -----------------------------------------------------------------------------

/**
 * Fields suitable for public category responses.
 *
 * Lifecycle fields such as is_active/deleted_at are intentionally excluded.
 */
const PUBLIC_COLUMNS = `
    categories.id,
    categories.uuid,
    categories.parent_id,
    categories.name,
    categories.slug,
    categories.description,
    categories.sort_order
`;

/**
 * Fields suitable for administrative category management.
 */
const ADMIN_COLUMNS = `
    categories.id,
    categories.uuid,
    categories.parent_id,
    categories.name,
    categories.slug,
    categories.description,
    categories.sort_order,
    categories.is_active,
    categories.created_at,
    categories.updated_at,
    categories.deleted_at
`;

// -----------------------------------------------------------------------------
// VALIDATION / NORMALIZATION HELPERS
// -----------------------------------------------------------------------------

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

function normalizeLimit(limit) {
    if (limit === undefined || limit === null) {
        return DEFAULT_LIMIT;
    }

    return assertIntegerInRange(limit, 'limit', {
        min: 1,
        max: MAX_LIMIT,
    });
}

function normalizeOffset(offset) {
    if (offset === undefined || offset === null) {
        return 0;
    }

    return assertIntegerInRange(offset, 'offset', {
        min: 0,
        max: MAX_OFFSET,
    });
}

function assertBoolean(value, name) {
    if (typeof value !== 'boolean') {
        throw new TypeError(`${name} must be a boolean`);
    }

    return value;
}

function assertPositiveIntegerId(value, name = 'id') {
    if (!Number.isInteger(value) || value <= 0) {
        throw new TypeError(`${name} must be a positive integer`);
    }

    return value;
}

function assertBoundedString(value, name, maxLength) {
    if (typeof value !== 'string') {
        throw new TypeError(`${name} must be a string`);
    }

    const normalized = value.trim();

    if (normalized.length === 0) {
        throw new TypeError(`${name} must be a non-empty string`);
    }

    if (normalized.length > maxLength) {
        throw new RangeError(
            `${name} must be at most ${maxLength} characters`
        );
    }

    return normalized;
}

function normalizeName(value) {
    return assertBoundedString(value, 'name', NAME_MAX_LENGTH);
}

function normalizeSlug(value) {
    return assertBoundedString(value, 'slug', SLUG_MAX_LENGTH);
}

function normalizeUuid(value) {
    return assertBoundedString(value, 'uuid', UUID_MAX_LENGTH);
}

function normalizeDescription(value) {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value !== 'string') {
        throw new TypeError(
            'description must be a string or null'
        );
    }

    const normalized = value.trim();

    if (normalized.length > DESCRIPTION_MAX_LENGTH) {
        throw new RangeError(
            `description must be at most ${DESCRIPTION_MAX_LENGTH} characters`
        );
    }

    return normalized === '' ? null : normalized;
}

function normalizeSortOrder(value) {
    if (value === undefined || value === null) {
        return 0;
    }

    return assertIntegerInRange(value, 'sortOrder', {
        min: 0,
        max: MAX_SORT_ORDER,
    });
}

function normalizeParentId(value) {
    if (value === undefined || value === null) {
        return null;
    }

    return assertPositiveIntegerId(value, 'parentId');
}

/**
 * Distinguishes:
 *
 * undefined -> do not filter by parent
 * null      -> root categories only
 * number    -> children of the supplied parent
 */
function normalizeParentFilter(value) {
    if (value === undefined) {
        return { kind: 'any' };
    }

    if (value === null) {
        return { kind: 'root' };
    }

    return {
        kind: 'id',
        id: assertPositiveIntegerId(value, 'parentId'),
    };
}

function normalizeOrdering(ordering) {
    if (ordering === undefined || ordering === null) {
        return 'sort_order_asc';
    }

    if (
        typeof ordering !== 'string' ||
        !LIST_ORDERING_SET.has(ordering)
    ) {
        throw new RangeError(
            `ordering must be one of: ${LIST_ORDERINGS.join(', ')}`
        );
    }

    return ordering;
}

function normalizeIncludeDeleted(
    value,
    name = 'includeDeleted'
) {
    if (value === undefined) {
        return false;
    }

    return assertBoolean(value, name);
}

// -----------------------------------------------------------------------------
// REPOSITORY FACTORY
// -----------------------------------------------------------------------------

export function createCategoryRepository(pool = getDbPool()) {
    if (!pool || typeof pool.query !== 'function') {
        throw new TypeError(
            'createCategoryRepository requires a mysql2-compatible pool'
        );
    }

    // -------------------------------------------------------------------------
    // PUBLIC READS
    // -------------------------------------------------------------------------

    async function findPublicActive({
        parentId,
        limit,
        offset,
        ordering,
    } = {}) {
        const safeLimit = normalizeLimit(limit);
        const safeOffset = normalizeOffset(offset);
        const parent = normalizeParentFilter(parentId);
        const safeOrdering = normalizeOrdering(ordering);

        let sql = `
            SELECT ${PUBLIC_COLUMNS}
            FROM categories
            WHERE categories.deleted_at IS NULL
              AND categories.is_active = 1
        `;

        const params = [];

        if (parent.kind === 'root') {
            sql += ' AND categories.parent_id IS NULL';
        } else if (parent.kind === 'id') {
            sql += ' AND categories.parent_id = ?';
            params.push(parent.id);
        }

        sql += `
            ${ORDER_BY_SQL[safeOrdering]}
            LIMIT ? OFFSET ?
        `;

        params.push(safeLimit, safeOffset);

        const [rows] = await pool.query(sql, params);

        return rows;
    }

    async function findPublicById(id) {
        const safeId = assertPositiveIntegerId(id);

        const [rows] = await pool.query(
            `
                SELECT ${PUBLIC_COLUMNS}
                FROM categories
                WHERE categories.id = ?
                  AND categories.is_active = 1
                  AND categories.deleted_at IS NULL
                LIMIT 1
            `,
            [safeId]
        );

        return rows[0] ?? null;
    }

    async function findPublicBySlug(slug) {
        const safeSlug = normalizeSlug(slug);

        const [rows] = await pool.query(
            `
                SELECT ${PUBLIC_COLUMNS}
                FROM categories
                WHERE categories.slug = ?
                  AND categories.is_active = 1
                  AND categories.deleted_at IS NULL
                LIMIT 1
            `,
            [safeSlug]
        );

        return rows[0] ?? null;
    }

    async function findPublicByUuid(uuid) {
        const safeUuid = normalizeUuid(uuid);

        const [rows] = await pool.query(
            `
                SELECT ${PUBLIC_COLUMNS}
                FROM categories
                WHERE categories.uuid = ?
                  AND categories.is_active = 1
                  AND categories.deleted_at IS NULL
                LIMIT 1
            `,
            [safeUuid]
        );

        return rows[0] ?? null;
    }

    async function countPublicActive() {
        const [rows] = await pool.query(`
            SELECT COUNT(*) AS count
            FROM categories
            WHERE categories.deleted_at IS NULL
              AND categories.is_active = 1
        `);

        return Number(rows[0]?.count ?? 0);
    }

    // -------------------------------------------------------------------------
    // ADMIN READS
    // -------------------------------------------------------------------------

    async function findAdminList({
        parentId,
        isActive,
        includeDeleted,
        limit,
        offset,
        ordering,
    } = {}) {
        const parent = normalizeParentFilter(parentId);
        const safeIncludeDeleted =
            normalizeIncludeDeleted(includeDeleted);
        const safeLimit = normalizeLimit(limit);
        const safeOffset = normalizeOffset(offset);
        const safeOrdering = normalizeOrdering(ordering);

        let sql = `
            SELECT ${ADMIN_COLUMNS}
            FROM categories
            WHERE 1 = 1
        `;

        const params = [];

        if (!safeIncludeDeleted) {
            sql += ' AND categories.deleted_at IS NULL';
        }

        // undefined/null means no active-state filter.
        if (isActive !== undefined && isActive !== null) {
            const safeIsActive = assertBoolean(
                isActive,
                'isActive'
            );

            sql += ' AND categories.is_active = ?';
            params.push(safeIsActive ? 1 : 0);
        }

        if (parent.kind === 'root') {
            sql += ' AND categories.parent_id IS NULL';
        } else if (parent.kind === 'id') {
            sql += ' AND categories.parent_id = ?';
            params.push(parent.id);
        }

        sql += `
            ${ORDER_BY_SQL[safeOrdering]}
            LIMIT ? OFFSET ?
        `;

        params.push(safeLimit, safeOffset);

        const [rows] = await pool.query(sql, params);

        return rows;
    }

    async function findAdminById(
        id,
        { includeDeleted } = {}
    ) {
        const safeId = assertPositiveIntegerId(id);
        const safeIncludeDeleted =
            normalizeIncludeDeleted(includeDeleted);

        const sql = `
            SELECT ${ADMIN_COLUMNS}
            FROM categories
            WHERE categories.id = ?
              ${
                  safeIncludeDeleted
                      ? ''
                      : 'AND categories.deleted_at IS NULL'
              }
            LIMIT 1
        `;

        const [rows] = await pool.query(sql, [safeId]);

        return rows[0] ?? null;
    }

    async function findAdminByUuid(
        uuid,
        { includeDeleted } = {}
    ) {
        const safeUuid = normalizeUuid(uuid);
        const safeIncludeDeleted =
            normalizeIncludeDeleted(includeDeleted);

        const sql = `
            SELECT ${ADMIN_COLUMNS}
            FROM categories
            WHERE categories.uuid = ?
              ${
                  safeIncludeDeleted
                      ? ''
                      : 'AND categories.deleted_at IS NULL'
              }
            LIMIT 1
        `;

        const [rows] = await pool.query(sql, [safeUuid]);

        return rows[0] ?? null;
    }

    async function countAdmin({
        parentId,
        isActive,
        includeDeleted,
    } = {}) {
        const parent = normalizeParentFilter(parentId);
        const safeIncludeDeleted =
            normalizeIncludeDeleted(includeDeleted);

        let sql = `
            SELECT COUNT(*) AS count
            FROM categories
            WHERE 1 = 1
        `;

        const params = [];

        if (!safeIncludeDeleted) {
            sql += ' AND categories.deleted_at IS NULL';
        }

        // undefined/null means no active-state filter.
        if (isActive !== undefined && isActive !== null) {
            const safeIsActive = assertBoolean(
                isActive,
                'isActive'
            );

            sql += ' AND categories.is_active = ?';
            params.push(safeIsActive ? 1 : 0);
        }

        if (parent.kind === 'root') {
            sql += ' AND categories.parent_id IS NULL';
        } else if (parent.kind === 'id') {
            sql += ' AND categories.parent_id = ?';
            params.push(parent.id);
        }

        const [rows] = await pool.query(sql, params);

        return Number(rows[0]?.count ?? 0);
    }

    // -------------------------------------------------------------------------
    // HIERARCHY READ PRIMITIVES
    // -------------------------------------------------------------------------

    /**
     * Returns descendant IDs below rootId.
     *
     * The rootId itself is excluded.
     *
     * This method intentionally does not implement business rules such as
     * circular-hierarchy prevention. The Service layer uses this primitive
     * when validating a reparent operation.
     */
    async function listDescendantIds(rootId) {
        const safeRootId = assertPositiveIntegerId(
            rootId,
            'rootId'
        );

        const [rows] = await pool.query(
            `
                WITH RECURSIVE descendants (id) AS (
                    SELECT id
                    FROM categories
                    WHERE parent_id = ?

                    UNION ALL

                    SELECT c.id
                    FROM categories AS c
                    INNER JOIN descendants AS d
                        ON c.parent_id = d.id
                )
                SELECT id
                FROM descendants
            `,
            [safeRootId]
        );

        return rows.map((row) => Number(row.id));
    }

    async function countActiveChildren(parentId) {
        const safeParentId = assertPositiveIntegerId(
            parentId,
            'parentId'
        );

        const [rows] = await pool.query(
            `
                SELECT COUNT(*) AS count
                FROM categories
                WHERE categories.parent_id = ?
                  AND categories.deleted_at IS NULL
                  AND categories.is_active = 1
            `,
            [safeParentId]
        );

        return Number(rows[0]?.count ?? 0);
    }

    // -------------------------------------------------------------------------
    // WRITES
    // -------------------------------------------------------------------------

    async function create({
        uuid,
        parentId = null,
        name,
        slug,
        description = null,
        sortOrder = 0,
        isActive = true,
    }) {
        const safeUuid = normalizeUuid(uuid);
        const safeParentId = normalizeParentId(parentId);
        const safeName = normalizeName(name);
        const safeSlug = normalizeSlug(slug);
        const safeDescription =
            normalizeDescription(description);
        const safeSortOrder =
            normalizeSortOrder(sortOrder);
        const safeIsActive =
            assertBoolean(isActive, 'isActive');

        const [result] = await pool.query(
            `
                INSERT INTO categories (
                    uuid,
                    parent_id,
                    name,
                    slug,
                    description,
                    sort_order,
                    is_active
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [
                safeUuid,
                safeParentId,
                safeName,
                safeSlug,
                safeDescription,
                safeSortOrder,
                safeIsActive ? 1 : 0,
            ]
        );

        return Number(result.insertId);
    }

    /**
     * PATCH-style update.
     *
     * Only explicitly supplied, non-undefined fields are updated.
     *
     * Nullable fields:
     *   parentId = null      -> move to root
     *   description = null   -> clear description
     *
     * The repository deliberately does not perform hierarchy business rules.
     */
    async function updateById(id, patch) {
        const safeId = assertPositiveIntegerId(id);

        if (
            patch === null ||
            typeof patch !== 'object' ||
            Array.isArray(patch)
        ) {
            throw new TypeError('patch must be an object');
        }

        const fields = [];
        const params = [];

        const has = (key) =>
            Object.prototype.hasOwnProperty.call(
                patch,
                key
            ) &&
            patch[key] !== undefined;

        if (has('parentId')) {
            fields.push('parent_id = ?');
            params.push(
                normalizeParentId(patch.parentId)
            );
        }

        if (has('name')) {
            fields.push('name = ?');
            params.push(normalizeName(patch.name));
        }

        if (has('slug')) {
            fields.push('slug = ?');
            params.push(normalizeSlug(patch.slug));
        }

        if (has('description')) {
            fields.push('description = ?');
            params.push(
                normalizeDescription(patch.description)
            );
        }

        if (has('sortOrder')) {
            fields.push('sort_order = ?');
            params.push(
                normalizeSortOrder(patch.sortOrder)
            );
        }

        if (has('isActive')) {
            fields.push('is_active = ?');
            params.push(
                assertBoolean(
                    patch.isActive,
                    'isActive'
                )
                    ? 1
                    : 0
            );
        }

        if (fields.length === 0) {
            return 0;
        }

        params.push(safeId);

        const [result] = await pool.query(
            `
                UPDATE categories
                SET ${fields.join(', ')}
                WHERE categories.id = ?
                  AND categories.deleted_at IS NULL
            `,
            params
        );

        return Number(result.affectedRows ?? 0);
    }

    /**
     * Soft-delete only.
     *
     * Posts referencing the category are unaffected because the database
     * relation uses ON DELETE SET NULL and this operation never physically
     * deletes the category row.
     */
    async function softDeleteById(id) {
        const safeId = assertPositiveIntegerId(id);

        const [result] = await pool.query(
            `
                UPDATE categories
                SET deleted_at = CURRENT_TIMESTAMP,
                    is_active = 0
                WHERE categories.id = ?
                  AND categories.deleted_at IS NULL
            `,
            [safeId]
        );

        return Number(result.affectedRows ?? 0);
    }

    /**
     * Restore a soft-deleted category.
     *
     * Restoration only clears deleted_at. The Service layer decides whether
     * the category should remain active and whether its parent hierarchy is
     * currently valid for publication.
     */
    async function restoreById(id) {
        const safeId = assertPositiveIntegerId(id);

        const [result] = await pool.query(
            `
                UPDATE categories
                SET deleted_at = NULL
                WHERE categories.id = ?
                  AND categories.deleted_at IS NOT NULL
            `,
            [safeId]
        );

        return Number(result.affectedRows ?? 0);
    }

    // -------------------------------------------------------------------------
    // PUBLIC API
    // -------------------------------------------------------------------------

    return {
        // Public reads
        findPublicActive,
        findPublicById,
        findPublicBySlug,
        findPublicByUuid,
        countPublicActive,

        // Admin reads
        findAdminList,
        findAdminById,
        findAdminByUuid,
        countAdmin,

        // Hierarchy primitives
        listDescendantIds,
        countActiveChildren,

        // Writes
        create,
        updateById,
        softDeleteById,
        restoreById,
    };
}

export default createCategoryRepository;
