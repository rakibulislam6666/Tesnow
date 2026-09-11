/**
 * app/services/category.service.js
 *
 * Business logic layer for the Category domain.
 *
 * Responsibilities:
 *   - Enforce category hierarchy and lifecycle policies.
 *   - Coordinate repository operations to make domain decisions.
 *   - Prevent circular parent relationships.
 *   - Enforce activation/deactivation rules.
 *   - Protect against mass assignment (strict update allowlist).
 *   - Translate known persistence errors into domain errors.
 *
 * Non-responsibilities:
 *   - HTTP request/response handling (Controller layer).
 *   - Authorization (Middleware / Controller).
 *   - SQL and driver access (Repository layer).
 *   - Request-schema validation of primitives (Validator layer).
 *     NOTE: parentId type/range validation is intentionally duplicated
 *     here because an invalid type would otherwise reach the repository
 *     and surface as a 500 instead of a 422. This duplication is
 *     deliberate and documented.
 *   - UUID algorithm selection (injected uuidGenerator).
 *
 * Known concurrency limitation:
 *   Reparent cycle detection uses a non-locking descendant read.
 *   Two concurrent reparent operations can, in principle, both pass
 *   the descendant check and each persist an update that together
 *   create a cycle.
 *
 *   Closing that window requires transaction/locking, a database-level
 *   invariant, or serialization of reparent operations.
 */

import {
    ValidationError,
    NotFoundError,
    ConflictError,
} from '../core/errors.js';

// ----------------------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------------------

const ALLOWED_UPDATE_FIELDS = Object.freeze([
    'parentId',
    'name',
    'slug',
    'description',
    'sortOrder',
    'isActive',
]);

const ALLOWED_UPDATE_FIELD_SET = new Set(ALLOWED_UPDATE_FIELDS);

const REQUIRED_REPOSITORY_METHODS = Object.freeze([
    'create',
    'updateById',
    'softDeleteById',
    'restoreById',
    'findAdminById',
    'findAdminByUuid',
    'findPublicBySlug',
    'findPublicByUuid',
    'findPublicActive',
    'findAdminList',
    'countPublicActive',
    'countAdmin',
    'listDescendantIds',
    'countActiveChildren',
]);

const ER_DUP_ENTRY = 'ER_DUP_ENTRY';
const ER_NO_REFERENCED_ROW_2 = 'ER_NO_REFERENCED_ROW_2';

const MSG_DUPLICATE_SLUG =
    'A category with this slug already exists';

const MSG_DUPLICATE_UUID =
    'A category with this identifier already exists';

const MSG_MISSING_PARENT =
    'Parent category is no longer available';

// ----------------------------------------------------------------------------
// MODULE-LEVEL HELPERS
// ----------------------------------------------------------------------------

/**
 * Check whether a value is a plain object.
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

    const proto = Object.getPrototypeOf(value);

    return proto === Object.prototype || proto === null;
}

/**
 * Safely check own-property presence.
 *
 * @param {object} object
 * @param {string} key
 * @returns {boolean}
 */
function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * Extract a strict allowlisted PATCH object.
 *
 * Unknown fields are rejected rather than silently discarded.
 *
 * @param {*} input
 * @returns {object}
 */
function extractAllowedPatch(input) {
    if (!isPlainObject(input)) {
        throw new ValidationError(
            'Update input must be a plain object'
        );
    }

    const patch = {};

    for (const key of Object.keys(input)) {
        if (!ALLOWED_UPDATE_FIELD_SET.has(key)) {
            throw new ValidationError(
                `Unsupported update field: ${key}`
            );
        }

        if (input[key] !== undefined) {
            patch[key] = input[key];
        }
    }

    return patch;
}

/**
 * Translate recognized database write errors into domain errors.
 *
 * Unknown errors are intentionally not translated.
 *
 * @param {*} error
 * @param {{
 *   onDuplicateSlug: string,
 *   onDuplicateUuid: string,
 *   onMissingParent: string
 * }} messages
 * @returns {Error|null}
 */
function translateWriteError(
    error,
    {
        onDuplicateSlug,
        onDuplicateUuid,
        onMissingParent,
    }
) {
    if (!error || typeof error !== 'object') {
        return null;
    }

    if (error.code === ER_DUP_ENTRY) {
        const sqlMessage =
            typeof error.sqlMessage === 'string'
                ? error.sqlMessage
                : '';

        if (sqlMessage.includes('uq_categories_slug')) {
            return new ConflictError(onDuplicateSlug);
        }

        if (sqlMessage.includes('uq_categories_uuid')) {
            return new ConflictError(onDuplicateUuid);
        }

        return new ConflictError(
            'Category conflicts with an existing record'
        );
    }

    if (error.code === ER_NO_REFERENCED_ROW_2) {
        return new ValidationError(onMissingParent);
    }

    return null;
}

/**
 * Determine whether a category is soft-deleted.
 *
 * Both null and undefined mean "not deleted".
 *
 * @param {object} category
 * @returns {boolean}
 */
function isDeleted(category) {
    return (
        category.deleted_at !== null &&
        category.deleted_at !== undefined
    );
}

/**
 * Determine whether a category is active.
 *
 * Supports both MySQL numeric representation and boolean mocks.
 *
 * @param {object} category
 * @returns {boolean}
 */
function isActive(category) {
    return (
        category.is_active === true ||
        category.is_active === 1
    );
}

/**
 * Load an admin representation through the repository.
 *
 * @param {object} repository
 * @param {number} id
 * @param {{includeDeleted?: boolean}} [options]
 * @returns {Promise<object|null>}
 */
async function loadAdmin(
    repository,
    id,
    options = {}
) {
    return repository.findAdminById(id, options);
}

/**
 * Validate that a parent can be assigned.
 *
 * @param {object} repository
 * @param {number} parentId
 * @param {number} [selfId]
 * @returns {Promise<object>}
 */
async function assertAssignableParent(
    repository,
    parentId,
    selfId
) {
    if (
        selfId !== undefined &&
        parentId === selfId
    ) {
        throw new ConflictError(
            'A category cannot be its own parent'
        );
    }

    const parent = await loadAdmin(
        repository,
        parentId,
        { includeDeleted: true }
    );

    if (!parent) {
        throw new ValidationError(
            'Parent category does not exist'
        );
    }

    if (isDeleted(parent)) {
        throw new ConflictError(
            'Parent category is deleted'
        );
    }

    if (!isActive(parent)) {
        throw new ConflictError(
            'Parent category is inactive; activate it before assigning children'
        );
    }

    return parent;
}

/**
 * Ensure a reparent operation cannot create a cycle.
 *
 * Assumes IDs have already been validated.
 *
 * @param {object} repository
 * @param {number} id
 * @param {number|null} newParentId
 * @returns {Promise<void>}
 */
async function assertNoCycle(
    repository,
    id,
    newParentId
) {
    if (
        newParentId === null ||
        newParentId === undefined
    ) {
        return;
    }

    if (newParentId === id) {
        throw new ConflictError(
            'A category cannot be its own parent'
        );
    }

    const descendants =
        await repository.listDescendantIds(id);

    if (descendants.includes(newParentId)) {
        throw new ConflictError(
            'Cannot move a category under one of its own descendants'
        );
    }
}

/**
 * Validate service-level parentId semantics.
 *
 * undefined means "not supplied".
 * null means "move to root".
 * positive integer means "assign this parent".
 *
 * @param {*} value
 * @returns {void}
 */
function assertServiceParentId(value) {
    if (value === null) {
        return;
    }

    if (
        !Number.isInteger(value) ||
        value <= 0
    ) {
        throw new ValidationError(
            'parentId must be a positive integer or null'
        );
    }
}

// ----------------------------------------------------------------------------
// SERVICE FACTORY
// ----------------------------------------------------------------------------

/**
 * Create the Category Service.
 *
 * @param {{
 *   categoryRepository: object,
 *   uuidGenerator: () => string
 * }} deps
 * @returns {object}
 */
export function createCategoryService({
    categoryRepository,
    uuidGenerator,
} = {}) {
    if (
        !categoryRepository ||
        typeof categoryRepository !== 'object'
    ) {
        throw new TypeError(
            'createCategoryService requires categoryRepository'
        );
    }

    if (typeof uuidGenerator !== 'function') {
        throw new TypeError(
            'createCategoryService requires uuidGenerator'
        );
    }

    const repository = categoryRepository;

    for (const method of REQUIRED_REPOSITORY_METHODS) {
        if (typeof repository[method] !== 'function') {
            throw new TypeError(
                `categoryRepository.${method} must be a function`
            );
        }
    }

    // ------------------------------------------------------------------------
    // CREATE
    // ------------------------------------------------------------------------

    /**
     * Create a category.
     *
     * UUID is server-generated.
     * Parent, when supplied, must exist and be active.
     *
     * @param {object} input
     * @returns {Promise<object>}
     */
    async function createCategory(input) {
        if (!isPlainObject(input)) {
            throw new ValidationError(
                'Create input must be a plain object'
            );
        }

        if (hasOwn(input, 'uuid')) {
            throw new ValidationError(
                'UUID cannot be supplied when creating a category'
            );
        }

        const parentId =
            hasOwn(input, 'parentId')
                ? input.parentId
                : null;

        const isActiveValue =
            hasOwn(input, 'isActive')
                ? input.isActive
                : true;

        if (
            parentId !== null &&
            parentId !== undefined
        ) {
            assertServiceParentId(parentId);

            await assertAssignableParent(
                repository,
                parentId
            );
        }

        const uuid = uuidGenerator();

        if (
            typeof uuid !== 'string' ||
            uuid.length === 0
        ) {
            throw new TypeError(
                'uuidGenerator must return a non-empty string'
            );
        }

        try {
            const id = await repository.create({
                uuid,
                parentId:
                    parentId === undefined
                        ? null
                        : parentId,
                name: input.name,
                slug: input.slug,
                description:
                    input.description === undefined
                        ? null
                        : input.description,
                sortOrder:
                    input.sortOrder === undefined
                        ? 0
                        : input.sortOrder,
                isActive: isActiveValue,
            });

            const created =
                await loadAdmin(repository, id);

            if (!created) {
                throw new NotFoundError(
                    'Category could not be loaded after creation'
                );
            }

            return created;
        } catch (error) {
            if (
                error instanceof ConflictError ||
                error instanceof NotFoundError ||
                error instanceof ValidationError
            ) {
                throw error;
            }

            const translated =
                translateWriteError(error, {
                    onDuplicateSlug:
                        MSG_DUPLICATE_SLUG,
                    onDuplicateUuid:
                        MSG_DUPLICATE_UUID,
                    onMissingParent:
                        MSG_MISSING_PARENT,
                });

            if (translated) {
                throw translated;
            }

            throw error;
        }
    }

    // ------------------------------------------------------------------------
    // UPDATE
    // ------------------------------------------------------------------------

    /**
     * Update a category using PATCH semantics.
     *
     * parentId validation intentionally occurs here before repository access
     * so malformed parent IDs become ValidationError instead of TypeError.
     *
     * @param {number} id
     * @param {object} input
     * @returns {Promise<object>}
     */
    async function updateCategory(id, input) {
        const patch =
            extractAllowedPatch(input);

        const current =
            await loadAdmin(repository, id);

        if (!current) {
            throw new NotFoundError(
                'Category not found'
            );
        }

        if (Object.keys(patch).length === 0) {
            return current;
        }

        const parentChangeRequested =
            hasOwn(patch, 'parentId');

        // --------------------------------------------------------------------
        // HIERARCHY
        // --------------------------------------------------------------------

        if (parentChangeRequested) {
            /*
             * CRITICAL:
             * Validate type/range before ANY repository operation involving
             * the supplied parentId.
             *
             * null = root
             * positive integer = parent
             */
            assertServiceParentId(
                patch.parentId
            );

            if (patch.parentId !== null) {
                await assertAssignableParent(
                    repository,
                    patch.parentId,
                    id
                );

                await assertNoCycle(
                    repository,
                    id,
                    patch.parentId
                );
            }
        }

        // --------------------------------------------------------------------
        // ACTIVATION
        // --------------------------------------------------------------------

        if (
            hasOwn(patch, 'isActive') &&
            patch.isActive === true
        ) {
            const effectiveParentId =
                parentChangeRequested
                    ? patch.parentId
                    : current.parent_id;

            if (
                effectiveParentId !== null &&
                effectiveParentId !== undefined
            ) {
                const parent =
                    await loadAdmin(
                        repository,
                        effectiveParentId,
                        { includeDeleted: true }
                    );

                if (!parent) {
                    throw new ConflictError(
                        'Parent category is missing; cannot activate'
                    );
                }

                if (isDeleted(parent)) {
                    throw new ConflictError(
                        'Parent category is deleted; cannot activate'
                    );
                }

                if (!isActive(parent)) {
                    throw new ConflictError(
                        'Parent category is inactive; activate the parent first'
                    );
                }
            }
        }

        // --------------------------------------------------------------------
        // PERSIST
        // --------------------------------------------------------------------

        try {
            const affected =
                await repository.updateById(
                    id,
                    patch
                );

            if (affected === 0) {
                throw new ConflictError(
                    'Category was modified concurrently; please retry'
                );
            }

            const updated =
                await loadAdmin(repository, id);

            if (!updated) {
                throw new ConflictError(
                    'Category disappeared after update; please retry'
                );
            }

            return updated;
        } catch (error) {
            if (
                error instanceof ConflictError ||
                error instanceof NotFoundError ||
                error instanceof ValidationError
            ) {
                throw error;
            }

            const translated =
                translateWriteError(error, {
                    onDuplicateSlug:
                        MSG_DUPLICATE_SLUG,
                    onDuplicateUuid:
                        MSG_DUPLICATE_UUID,
                    onMissingParent:
                        MSG_MISSING_PARENT,
                });

            if (translated) {
                throw translated;
            }

            throw error;
        }
    }

    // ------------------------------------------------------------------------
    // DELETE
    // ------------------------------------------------------------------------

    /**
     * Soft-delete a category.
     *
     * Active child categories prevent deletion.
     *
     * @param {number} id
     * @returns {Promise<object>}
     */
    async function deleteCategory(id) {
        const current =
            await loadAdmin(repository, id);

        if (!current) {
            throw new NotFoundError(
                'Category not found'
            );
        }

        const activeChildren =
            await repository.countActiveChildren(id);

        if (activeChildren > 0) {
            throw new ConflictError(
                'Category has active child categories; move or delete them first'
            );
        }

        const affected =
            await repository.softDeleteById(id);

        if (affected === 0) {
            throw new ConflictError(
                'Category was already deleted'
            );
        }

        const deleted =
            await loadAdmin(
                repository,
                id,
                { includeDeleted: true }
            );

        if (!deleted) {
            throw new ConflictError(
                'Category could not be loaded after deletion'
            );
        }

        return deleted;
    }

    // ------------------------------------------------------------------------
    // RESTORE
    // ------------------------------------------------------------------------

    /**
     * Restore a soft-deleted category.
     *
     * Restore does not activate the category.
     *
     * @param {number} id
     * @returns {Promise<object>}
     */
    async function restoreCategory(id) {
        const current =
            await loadAdmin(
                repository,
                id,
                { includeDeleted: true }
            );

        if (!current) {
            throw new NotFoundError(
                'Category not found'
            );
        }

        if (!isDeleted(current)) {
            throw new ConflictError(
                'Category is not deleted'
            );
        }

        if (
            current.parent_id !== null &&
            current.parent_id !== undefined
        ) {
            const parent =
                await loadAdmin(
                    repository,
                    current.parent_id,
                    { includeDeleted: true }
                );

            if (!parent) {
                throw new ConflictError(
                    'Parent category no longer exists; move this category to root before restoring'
                );
            }

            if (isDeleted(parent)) {
                throw new ConflictError(
                    'Parent category is deleted; restore the parent first or move this category to root'
                );
            }
        }

        const affected =
            await repository.restoreById(id);

        if (affected === 0) {
            throw new ConflictError(
                'Category was already restored'
            );
        }

        const restored =
            await loadAdmin(
                repository,
                id,
                { includeDeleted: true }
            );

        if (!restored) {
            throw new ConflictError(
                'Category could not be loaded after restoration'
            );
        }

        return restored;
    }

    // ------------------------------------------------------------------------
    // ACTIVATE
    // ------------------------------------------------------------------------

    /**
     * Activate a non-deleted category.
     *
     * Non-root categories require an active parent.
     *
     * @param {number} id
     * @returns {Promise<object>}
     */
    async function activateCategory(id) {
        const current =
            await loadAdmin(repository, id);

        if (!current) {
            throw new NotFoundError(
                'Category not found'
            );
        }

        if (isActive(current)) {
            throw new ConflictError(
                'Category is already active'
            );
        }

        if (
            current.parent_id !== null &&
            current.parent_id !== undefined
        ) {
            const parent =
                await loadAdmin(
                    repository,
                    current.parent_id,
                    { includeDeleted: true }
                );

            if (!parent) {
                throw new ConflictError(
                    'Parent category is missing; cannot activate'
                );
            }

            if (isDeleted(parent)) {
                throw new ConflictError(
                    'Parent category is deleted; cannot activate'
                );
            }

            if (!isActive(parent)) {
                throw new ConflictError(
                    'Parent category is inactive; activate the parent first'
                );
            }
        }

        const affected =
            await repository.updateById(
                id,
                { isActive: true }
            );

        if (affected === 0) {
            throw new ConflictError(
                'Category was modified concurrently; please retry'
            );
        }

        const activated =
            await loadAdmin(repository, id);

        if (!activated) {
            throw new ConflictError(
                'Category could not be loaded after activation'
            );
        }

        return activated;
    }

    // ------------------------------------------------------------------------
    // DEACTIVATE
    // ------------------------------------------------------------------------

    /**
     * Deactivate a non-deleted category.
     *
     * @param {number} id
     * @returns {Promise<object>}
     */
    async function deactivateCategory(id) {
        const current =
            await loadAdmin(
                repository,
                id,
                { includeDeleted: true }
            );

        if (!current) {
            throw new NotFoundError(
                'Category not found'
            );
        }

        if (!isActive(current)) {
            throw new ConflictError(
                'Category is already inactive'
            );
        }

        if (isDeleted(current)) {
            throw new ConflictError(
                'Deleted categories cannot be modified'
            );
        }

        const affected =
            await repository.updateById(
                id,
                { isActive: false }
            );

        if (affected === 0) {
            throw new ConflictError(
                'Category was modified concurrently; please retry'
            );
        }

        const deactivated =
            await loadAdmin(repository, id);

        if (!deactivated) {
            throw new ConflictError(
                'Category could not be loaded after deactivation'
            );
        }

        return deactivated;
    }

    // ------------------------------------------------------------------------
    // PUBLIC READS
    // ------------------------------------------------------------------------

    /**
     * List publicly visible categories.
     *
     * @param {object} [options]
     * @returns {Promise<object[]>}
     */
    async function listPublicCategories(
        options = {}
    ) {
        return repository.findPublicActive(
            options
        );
    }

    /**
     * Get a public category by ID.
     *
     * @param {number|string} id
     * @returns {Promise<object>}
     */
    async function getPublicCategoryById(
        id
    ) {
        const row =
            await repository.findPublicById(
                id
            );

        if (!row) {
            throw new NotFoundError(
                'Category not found'
            );
        }

        return row;
    }

    /**
     * Get a public category by slug.
     *
     * @param {string} slug
     * @returns {Promise<object>}
     */
    async function getPublicCategoryBySlug(
        slug
    ) {
        const row =
            await repository.findPublicBySlug(
                slug
            );

        if (!row) {
            throw new NotFoundError(
                'Category not found'
            );
        }

        return row;
    }

    /**
     * Get a public category by UUID.
     *
     * @param {string} uuid
     * @returns {Promise<object>}
     */
    async function getPublicCategoryByUuid(
        uuid
    ) {
        const row =
            await repository.findPublicByUuid(
                uuid
            );

        if (!row) {
            throw new NotFoundError(
                'Category not found'
            );
        }

        return row;
    }

    /**
     * Count publicly visible categories.
     *
     * @returns {Promise<number>}
     */
    async function countPublicCategories() {
        return repository.countPublicActive();
    }

    // ------------------------------------------------------------------------
    // ADMIN READS
    // ------------------------------------------------------------------------

    /**
     * List categories for administrative views.
     *
     * @param {object} [options]
     * @returns {Promise<object[]>}
     */
    async function listAdminCategories(
        options = {}
    ) {
        return repository.findAdminList(
            options
        );
    }

    /**
     * Get an admin category by numeric ID.
     *
     * @param {number} id
     * @param {{includeDeleted?: boolean}} [options]
     * @returns {Promise<object>}
     */
    async function getAdminCategory(
        id,
        options = {}
    ) {
        const row =
            await repository.findAdminById(
                id,
                options
            );

        if (!row) {
            throw new NotFoundError(
                'Category not found'
            );
        }

        return row;
    }

    /**
     * Get an admin category by UUID.
     *
     * @param {string} uuid
     * @param {{includeDeleted?: boolean}} [options]
     * @returns {Promise<object>}
     */
    async function getAdminCategoryByUuid(
        uuid,
        options = {}
    ) {
        const row =
            await repository.findAdminByUuid(
                uuid,
                options
            );

        if (!row) {
            throw new NotFoundError(
                'Category not found'
            );
        }

        return row;
    }

    /**
     * Count categories for administrative dashboards.
     *
     * @param {object} [options]
     * @returns {Promise<number>}
     */
    async function countAdminCategories(
        options = {}
    ) {
        return repository.countAdmin(
            options
        );
    }

    // ------------------------------------------------------------------------
    // FROZEN PUBLIC API
    // ------------------------------------------------------------------------

    return Object.freeze({
        // Writes
        createCategory,
        updateCategory,
        deleteCategory,
        restoreCategory,
        activateCategory,
        deactivateCategory,

        // Public reads
        listPublicCategories,
        getPublicCategoryById,
        getPublicCategoryBySlug,
        getPublicCategoryByUuid,
        countPublicCategories,

        // Admin reads
        listAdminCategories,
        getAdminCategory,
        getAdminCategoryByUuid,
        countAdminCategories,
    });
}

export default createCategoryService;
