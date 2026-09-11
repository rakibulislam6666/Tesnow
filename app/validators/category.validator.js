/**
 * app/validators/category.validator.js
 *
 * Request-level validation for the Category domain.
 *
 * Scope:
 *   - request shape and type validation
 *   - length and range validation
 *   - format validation
 *   - allowlist validation
 *   - safe transport normalization
 *
 * Out of scope:
 *   - authentication / authorization
 *   - database access
 *   - parent existence or lifecycle checks
 *   - category hierarchy / cycle detection
 *   - slug uniqueness
 *   - UUID generation
 *   - persistence
 *   - HTTP response generation
 *
 * Validators throw the project's ValidationError and return a new,
 * normalized object without mutating caller input.
 */

import { ValidationError } from '../core/errors.js';

// ----------------------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------------------

const NAME_MAX_LENGTH = 150;
const SLUG_MAX_LENGTH = 150;
const DESCRIPTION_MAX_LENGTH = 500;

/**
 * Database schema:
 *   categories.sort_order INT UNSIGNED
 */
const SORT_ORDER_MIN = 0;
const SORT_ORDER_MAX = 4294967295;

const LIMIT_MIN = 1;
const LIMIT_MAX = 100;
const LIMIT_DEFAULT = 20;

const OFFSET_MIN = 0;
const OFFSET_MAX = 100000;
const OFFSET_DEFAULT = 0;

const ORDERING_DEFAULT = 'sort_order_asc';

const ORDERING_ALLOWLIST = Object.freeze([
    'sort_order_asc',
    'created_at_desc',
]);

const ORDERING_ALLOWLIST_SET = new Set(ORDERING_ALLOWLIST);

const CREATE_ALLOWED_FIELDS = Object.freeze([
    'parentId',
    'name',
    'slug',
    'description',
    'sortOrder',
    'isActive',
]);

const UPDATE_ALLOWED_FIELDS = CREATE_ALLOWED_FIELDS;

const FORBIDDEN_CREATE_FIELDS = Object.freeze([
    'uuid',
]);

const CREATE_ALLOWED_FIELD_SET = new Set(CREATE_ALLOWED_FIELDS);
const UPDATE_ALLOWED_FIELD_SET = new Set(UPDATE_ALLOWED_FIELDS);
const FORBIDDEN_CREATE_FIELD_SET = new Set(FORBIDDEN_CREATE_FIELDS);

/**
 * Strict public URL slug.
 *
 * Examples:
 *   tech
 *   technology
 *   tech-news
 *   tech2026
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Canonical UUID format.
 */
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Strict positive decimal integer string.
 *
 * No:
 *   - leading zero
 *   - sign
 *   - decimal
 *   - exponent
 *   - whitespace
 */
const POSITIVE_INT_STRING_PATTERN = /^[1-9][0-9]*$/;

/**
 * Strict non-negative decimal integer string.
 */
const NON_NEGATIVE_INT_STRING_PATTERN = /^(?:0|[1-9][0-9]*)$/;

/**
 * ASCII control characters, including null byte.
 */
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;

// ----------------------------------------------------------------------------
// ERROR HELPER
// ----------------------------------------------------------------------------

/**
 * Create a safe ValidationError.
 *
 * The official errors.js contract supports structured details:
 *
 *   new ValidationError(message, {
 *       details: {
 *           field,
 *           code,
 *       },
 *   });
 *
 * Raw user-controlled values are not inserted into the message.
 *
 * @param {string} message
 * @param {string|undefined} field
 * @param {string|undefined} code
 * @returns {ValidationError}
 */
function fail(message, field, code) {
    if (field === undefined) {
        return new ValidationError(message);
    }

    const details = {
        field,
    };

    if (code !== undefined) {
        details.code = code;
    }

    return new ValidationError(message, {
        details,
    });
}

// ----------------------------------------------------------------------------
// OBJECT HELPERS
// ----------------------------------------------------------------------------

/**
 * Determine whether a value is a plain object.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isPlainObject(value) {
    if (value === null || typeof value !== 'object') {
        return false;
    }

    if (Array.isArray(value)) {
        return false;
    }

    const prototype = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
}

/**
 * Safe own-property check.
 *
 * @param {object} object
 * @param {string} key
 * @returns {boolean}
 */
function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * Reject ASCII control characters.
 *
 * @param {string} value
 * @param {string} field
 * @returns {string}
 */
function assertNoControlCharacters(value, field) {
    if (CONTROL_CHAR_PATTERN.test(value)) {
        throw fail(
            `${field} contains invalid characters`,
            field,
            'invalid_value',
        );
    }

    return value;
}

// ----------------------------------------------------------------------------
// BODY FIELD VALIDATORS
// ----------------------------------------------------------------------------

/**
 * Validate category name.
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeName(value) {
    if (typeof value !== 'string') {
        throw fail('name must be a string', 'name', 'invalid_type');
    }

    const normalized = value.trim();

    if (normalized.length === 0) {
        throw fail('name must not be empty', 'name', 'required');
    }

    if (normalized.length > NAME_MAX_LENGTH) {
        throw fail(
            `name must be at most ${NAME_MAX_LENGTH} characters`,
            'name',
            'invalid_length',
        );
    }

    return assertNoControlCharacters(normalized, 'name');
}

/**
 * Validate category slug.
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeSlug(value) {
    if (typeof value !== 'string') {
        throw fail('slug must be a string', 'slug', 'invalid_type');
    }

    const normalized = value.trim();

    if (normalized.length === 0) {
        throw fail('slug must not be empty', 'slug', 'required');
    }

    if (normalized.length > SLUG_MAX_LENGTH) {
        throw fail(
            `slug must be at most ${SLUG_MAX_LENGTH} characters`,
            'slug',
            'invalid_length',
        );
    }

    if (CONTROL_CHAR_PATTERN.test(normalized)) {
        throw fail(
            'slug contains invalid characters',
            'slug',
            'invalid_value',
        );
    }

    if (!SLUG_PATTERN.test(normalized)) {
        throw fail(
            'slug must contain only lowercase letters, digits, and single hyphens',
            'slug',
            'invalid_format',
        );
    }

    return normalized;
}

/**
 * Validate category description.
 *
 * null / undefined / empty-after-trim become null.
 *
 * @param {*} value
 * @returns {string|null}
 */
function normalizeDescription(value) {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value !== 'string') {
        throw fail(
            'description must be a string or null',
            'description',
            'invalid_type',
        );
    }

    const normalized = value.trim();

    if (normalized.length === 0) {
        return null;
    }

    if (normalized.length > DESCRIPTION_MAX_LENGTH) {
        throw fail(
            `description must be at most ${DESCRIPTION_MAX_LENGTH} characters`,
            'description',
            'invalid_length',
        );
    }

    return assertNoControlCharacters(normalized, 'description');
}

/**
 * Validate body parentId.
 *
 * Semantics:
 *   null             = root
 *   positive integer = parent
 *
 * @param {*} value
 * @returns {number|null}
 */
function normalizeBodyParentId(value) {
    if (value === null) {
        return null;
    }

    if (!Number.isInteger(value)) {
        throw fail(
            'parentId must be a positive integer or null',
            'parentId',
            'invalid_type',
        );
    }

    if (value <= 0) {
        throw fail(
            'parentId must be a positive integer or null',
            'parentId',
            'invalid_range',
        );
    }

    if (!Number.isSafeInteger(value)) {
        throw fail(
            'parentId is out of range',
            'parentId',
            'invalid_range',
        );
    }

    return value;
}

/**
 * Validate sortOrder.
 *
 * Aligned with MySQL INT UNSIGNED:
 *   0 .. 4294967295
 *
 * @param {*} value
 * @returns {number}
 */
function normalizeSortOrder(value) {
    if (!Number.isInteger(value)) {
        throw fail(
            'sortOrder must be an integer',
            'sortOrder',
            'invalid_type',
        );
    }

    if (value < SORT_ORDER_MIN || value > SORT_ORDER_MAX) {
        throw fail(
            `sortOrder must be between ${SORT_ORDER_MIN} and ${SORT_ORDER_MAX}`,
            'sortOrder',
            'invalid_range',
        );
    }

    if (!Number.isSafeInteger(value)) {
        throw fail(
            'sortOrder is out of range',
            'sortOrder',
            'invalid_range',
        );
    }

    return value;
}

/**
 * Validate strict JSON boolean.
 *
 * @param {*} value
 * @param {string} field
 * @returns {boolean}
 */
function normalizeBoolean(value, field) {
    if (value === true || value === false) {
        return value;
    }

    throw fail(
        `${field} must be a boolean`,
        field,
        'invalid_type',
    );
}

// ----------------------------------------------------------------------------
// QUERY HELPERS
// ----------------------------------------------------------------------------

/**
 * Parse a strict query integer.
 *
 * Query values are strings and must use strict decimal notation.
 *
 * @param {*} value
 * @param {string} field
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function parseIntegerQuery(value, field, min, max) {
    if (
        typeof value !== 'string' ||
        !NON_NEGATIVE_INT_STRING_PATTERN.test(value)
    ) {
        throw fail(
            `${field} must be a non-negative integer`,
            field,
            'invalid_format',
        );
    }

    const parsed = Number(value);

    if (!Number.isSafeInteger(parsed)) {
        throw fail(
            `${field} is out of range`,
            field,
            'invalid_range',
        );
    }

    if (parsed < min || parsed > max) {
        throw fail(
            `${field} must be between ${min} and ${max}`,
            field,
            'invalid_range',
        );
    }

    return parsed;
}

/**
 * Parse strict query boolean.
 *
 * Only "true" and "false" are accepted.
 *
 * @param {*} value
 * @param {string} field
 * @returns {boolean}
 */
function parseBooleanQuery(value, field) {
    if (value === 'true') {
        return true;
    }

    if (value === 'false') {
        return false;
    }

    throw fail(
        `${field} must be "true" or "false"`,
        field,
        'invalid_value',
    );
}

/**
 * Normalize query parentId.
 *
 * Transport semantics:
 *   undefined = no filter
 *   "root"    = root categories → null
 *   "5"       = direct children of category 5
 *
 * Returned value:
 *   undefined | null | positive integer
 *
 * @param {*} value
 * @returns {number|null|undefined}
 */
function normalizeParentIdQuery(value) {
    if (value === undefined) {
        return undefined;
    }

    if (value === 'root') {
        return null;
    }

    if (
        typeof value !== 'string' ||
        !POSITIVE_INT_STRING_PATTERN.test(value)
    ) {
        throw fail(
            'parentId must be "root" or a positive integer',
            'parentId',
            'invalid_format',
        );
    }

    const parsed = Number(value);

    if (!Number.isSafeInteger(parsed)) {
        throw fail(
            'parentId is out of range',
            'parentId',
            'invalid_range',
        );
    }

    return parsed;
}

/**
 * Normalize pagination and ordering.
 *
 * Only own query properties are considered.
 *
 * @param {object} query
 * @returns {{
 *   limit: number,
 *   offset: number,
 *   ordering: string
 * }}
 */
function normalizePaginationQuery(query) {
    const limit =
        !hasOwn(query, 'limit') || query.limit === undefined
            ? LIMIT_DEFAULT
            : parseIntegerQuery(
                  query.limit,
                  'limit',
                  LIMIT_MIN,
                  LIMIT_MAX,
              );

    const offset =
        !hasOwn(query, 'offset') || query.offset === undefined
            ? OFFSET_DEFAULT
            : parseIntegerQuery(
                  query.offset,
                  'offset',
                  OFFSET_MIN,
                  OFFSET_MAX,
              );

    const ordering =
        !hasOwn(query, 'ordering') || query.ordering === undefined
            ? ORDERING_DEFAULT
            : query.ordering;

    if (
        typeof ordering !== 'string' ||
        !ORDERING_ALLOWLIST_SET.has(ordering)
    ) {
        throw fail(
            `ordering must be one of: ${ORDERING_ALLOWLIST.join(', ')}`,
            'ordering',
            'invalid_value',
        );
    }

    return {
        limit,
        offset,
        ordering,
    };
}

/**
 * Normalize includeDeleted.
 *
 * @param {object} query
 * @returns {boolean}
 */
function normalizeIncludeDeletedQuery(query) {
    if (
        !hasOwn(query, 'includeDeleted') ||
        query.includeDeleted === undefined
    ) {
        return false;
    }

    return parseBooleanQuery(
        query.includeDeleted,
        'includeDeleted',
    );
}

/**
 * Normalize optional isActive filter.
 *
 * @param {object} query
 * @returns {boolean|undefined}
 */
function normalizeIsActiveQuery(query) {
    if (
        !hasOwn(query, 'isActive') ||
        query.isActive === undefined
    ) {
        return undefined;
    }

    return parseBooleanQuery(
        query.isActive,
        'isActive',
    );
}

// ----------------------------------------------------------------------------
// BODY VALIDATORS
// ----------------------------------------------------------------------------

/**
 * Validate create-category request body.
 *
 * Returns a new normalized object.
 *
 * @param {*} input
 * @returns {{
 *   parentId: number|null,
 *   name: string,
 *   slug: string,
 *   description: string|null,
 *   sortOrder: number,
 *   isActive: boolean
 * }}
 */
export function createCategoryBody(input) {
    if (!isPlainObject(input)) {
        throw fail(
            'Request body must be a plain object',
            undefined,
            'invalid_type',
        );
    }

    for (const key of Object.keys(input)) {
        if (FORBIDDEN_CREATE_FIELD_SET.has(key)) {
            throw fail(
                'A protected field cannot be supplied',
                key,
                'forbidden_field',
            );
        }

        if (!CREATE_ALLOWED_FIELD_SET.has(key)) {
            throw fail(
                'Unknown field supplied',
                key,
                'unknown_field',
            );
        }
    }

    if (!hasOwn(input, 'name')) {
        throw fail(
            'name is required',
            'name',
            'required',
        );
    }

    if (!hasOwn(input, 'slug')) {
        throw fail(
            'slug is required',
            'slug',
            'required',
        );
    }

    const parentId = hasOwn(input, 'parentId')
        ? normalizeBodyParentId(input.parentId)
        : null;

    const name = normalizeName(input.name);
    const slug = normalizeSlug(input.slug);

    const description = hasOwn(input, 'description')
        ? normalizeDescription(input.description)
        : null;

    const sortOrder = hasOwn(input, 'sortOrder')
        ? normalizeSortOrder(input.sortOrder)
        : 0;

    const isActive = hasOwn(input, 'isActive')
        ? normalizeBoolean(input.isActive, 'isActive')
        : true;

    return {
        parentId,
        name,
        slug,
        description,
        sortOrder,
        isActive,
    };
}

/**
 * Validate update-category request body.
 *
 * PATCH semantics:
 *   - only supplied fields are returned
 *   - undefined values are omitted
 *   - empty object is valid and represents a no-op
 *
 * @param {*} input
 * @returns {object}
 */
export function updateCategoryBody(input) {
    if (!isPlainObject(input)) {
        throw fail(
            'Request body must be a plain object',
            undefined,
            'invalid_type',
        );
    }

    for (const key of Object.keys(input)) {
        if (!UPDATE_ALLOWED_FIELD_SET.has(key)) {
            throw fail(
                'Unknown field supplied',
                key,
                'unknown_field',
            );
        }
    }

    const patch = {};

    if (hasOwn(input, 'parentId') && input.parentId !== undefined) {
        patch.parentId = normalizeBodyParentId(input.parentId);
    }

    if (hasOwn(input, 'name') && input.name !== undefined) {
        patch.name = normalizeName(input.name);
    }

    if (hasOwn(input, 'slug') && input.slug !== undefined) {
        patch.slug = normalizeSlug(input.slug);
    }

    if (
        hasOwn(input, 'description') &&
        input.description !== undefined
    ) {
        patch.description = normalizeDescription(
            input.description,
        );
    }

    if (
        hasOwn(input, 'sortOrder') &&
        input.sortOrder !== undefined
    ) {
        patch.sortOrder = normalizeSortOrder(
            input.sortOrder,
        );
    }

    if (
        hasOwn(input, 'isActive') &&
        input.isActive !== undefined
    ) {
        patch.isActive = normalizeBoolean(
            input.isActive,
            'isActive',
        );
    }

    return patch;
}

// ----------------------------------------------------------------------------
// ROUTE PARAM VALIDATORS
// ----------------------------------------------------------------------------

/**
 * Validate category ID route parameter.
 *
 * IMPORTANT:
 * This validator accepts the raw route value directly:
 *
 *   categoryIdParam(req.params.id)
 *
 * It does NOT accept the complete params object.
 *
 * @param {*} value
 * @returns {number}
 */
export function categoryIdParam(value) {
    if (
        typeof value !== 'string' ||
        !POSITIVE_INT_STRING_PATTERN.test(value)
    ) {
        throw fail(
            'id must be a positive integer',
            'id',
            'invalid_format',
        );
    }

    const parsed = Number(value);

    if (!Number.isSafeInteger(parsed)) {
        throw fail(
            'id is out of range',
            'id',
            'invalid_range',
        );
    }

    return parsed;
}

/**
 * Validate UUID route parameter.
 *
 * IMPORTANT:
 * This validator accepts the raw route value directly.
 *
 * @param {*} value
 * @returns {string}
 */
export function categoryUuidParam(value) {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
        throw fail(
            'uuid must be a valid UUID',
            'uuid',
            'invalid_format',
        );
    }

    return value.toLowerCase();
}

/**
 * Validate category slug route parameter.
 *
 * IMPORTANT:
 * This validator accepts the raw route value directly.
 *
 * @param {*} value
 * @returns {string}
 */
export function categorySlugParam(value) {
    return normalizeSlug(value);
}

// ----------------------------------------------------------------------------
// QUERY VALIDATORS
// ----------------------------------------------------------------------------

/**
 * Validate public category list query.
 *
 * Unknown query parameters are ignored.
 *
 * @param {*} query
 * @returns {{
 *   parentId: number|null|undefined,
 *   limit: number,
 *   offset: number,
 *   ordering: string
 * }}
 */
export function listPublicCategoriesQuery(query) {
    const normalizedQuery = isPlainObject(query) ? query : {};

    const parentId = normalizeParentIdQuery(
        hasOwn(normalizedQuery, 'parentId')
            ? normalizedQuery.parentId
            : undefined,
    );

    const pagination =
        normalizePaginationQuery(normalizedQuery);

    const result = {
        limit: pagination.limit,
        offset: pagination.offset,
        ordering: pagination.ordering,
    };

    if (parentId !== undefined) {
        result.parentId = parentId;
    }

    return result;
}

/**
 * Validate admin category list query.
 *
 * Unknown query parameters are ignored.
 *
 * @param {*} query
 * @returns {{
 *   parentId: number|null|undefined,
 *   isActive: boolean|undefined,
 *   includeDeleted: boolean,
 *   limit: number,
 *   offset: number,
 *   ordering: string
 * }}
 */
export function listAdminCategoriesQuery(query) {
    const normalizedQuery = isPlainObject(query) ? query : {};

    const parentId = normalizeParentIdQuery(
        hasOwn(normalizedQuery, 'parentId')
            ? normalizedQuery.parentId
            : undefined,
    );

    const isActive = normalizeIsActiveQuery(
        normalizedQuery,
    );

    const includeDeleted = normalizeIncludeDeletedQuery(
        normalizedQuery,
    );

    const pagination =
        normalizePaginationQuery(normalizedQuery);

    const result = {
        includeDeleted,
        limit: pagination.limit,
        offset: pagination.offset,
        ordering: pagination.ordering,
    };

    if (parentId !== undefined) {
        result.parentId = parentId;
    }

    if (isActive !== undefined) {
        result.isActive = isActive;
    }

    return result;
}

/**
 * Validate admin category count query.
 *
 * @param {*} query
 * @returns {{
 *   parentId: number|null|undefined,
 *   isActive: boolean|undefined,
 *   includeDeleted: boolean
 * }}
 */
export function countAdminCategoriesQuery(query) {
    const normalizedQuery = isPlainObject(query) ? query : {};

    const parentId = normalizeParentIdQuery(
        hasOwn(normalizedQuery, 'parentId')
            ? normalizedQuery.parentId
            : undefined,
    );

    const isActive = normalizeIsActiveQuery(
        normalizedQuery,
    );

    const includeDeleted = normalizeIncludeDeletedQuery(
        normalizedQuery,
    );

    const result = {
        includeDeleted,
    };

    if (parentId !== undefined) {
        result.parentId = parentId;
    }

    if (isActive !== undefined) {
        result.isActive = isActive;
    }

    return result;
}

// ----------------------------------------------------------------------------
// DEFAULT EXPORT
// ----------------------------------------------------------------------------

export default {
    createCategoryBody,
    updateCategoryBody,

    categoryIdParam,
    categoryUuidParam,
    categorySlugParam,

    listPublicCategoriesQuery,
    listAdminCategoriesQuery,
    countAdminCategoriesQuery,
};