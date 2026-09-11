/**
 * app/controllers/category.controller.js
 *
 * HTTP adapter for the Category domain.
 *
 * Responsibilities:
 *   - Read validated HTTP input when available.
 *   - Fall back to req.* defensively when validation middleware has not
 *     populated req.validated.
 *   - Call the appropriate Category Service method.
 *   - Use the application's centralized response helpers.
 *   - Forward errors to the centralized error middleware.
 *
 * Non-responsibilities:
 *   - Validation.
 *   - Business rules.
 *   - Hierarchy/lifecycle policy.
 *   - Authorization.
 *   - SQL/repository access.
 *   - Error serialization.
 */

import {
    sendSuccess,
    sendCreated,
} from '../core/response.js';

// -----------------------------------------------------------------------------
// CONTRACT
// -----------------------------------------------------------------------------

const REQUIRED_SERVICE_METHODS = Object.freeze([
    'listPublicCategories',
    'getPublicCategoryById',
    'getPublicCategoryBySlug',
    'getPublicCategoryByUuid',
    'countPublicCategories',
    'listAdminCategories',
    'getAdminCategory',
    'getAdminCategoryByUuid',
    'countAdminCategories',
    'createCategory',
    'updateCategory',
    'deleteCategory',
    'restoreCategory',
    'activateCategory',
    'deactivateCategory',
]);

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

/**
 * Read normalized/validated input when upstream middleware provides it.
 *
 * Fallback to req[key] is intentionally defensive. The controller does not
 * perform validation itself.
 *
 * @param {object} req
 * @param {'body'|'query'|'params'} key
 * @returns {object}
 */
function readInput(req, key) {
    if (!req || typeof req !== 'object') {
        return {};
    }

    const validated = req.validated;

    if (
        validated &&
        typeof validated === 'object' &&
        validated[key] !== undefined &&
        validated[key] !== null
    ) {
        return validated[key];
    }

    const raw = req[key];

    if (raw !== undefined && raw !== null) {
        return raw;
    }

    return {};
}

/**
 * Read a parameter without introducing validation logic.
 *
 * @param {object} req
 * @param {string} name
 * @returns {*}
 */
function readParam(req, name) {
    const params = readInput(req, 'params');

    if (
        params &&
        typeof params === 'object' &&
        Object.prototype.hasOwnProperty.call(params, name)
    ) {
        return params[name];
    }

    return undefined;
}

/**
 * Validate the injected service contract at composition time.
 *
 * @param {object} categoryService
 */
function assertCategoryService(categoryService) {
    if (
        !categoryService ||
        typeof categoryService !== 'object'
    ) {
        throw new TypeError(
            'createCategoryController requires categoryService'
        );
    }

    for (const method of REQUIRED_SERVICE_METHODS) {
        if (typeof categoryService[method] !== 'function') {
            throw new TypeError(
                `categoryService.${method} must be a function`
            );
        }
    }
}

// -----------------------------------------------------------------------------
// FACTORY
// -----------------------------------------------------------------------------

/**
 * Create the Category Controller.
 *
 * The Service instance is injected by the composition root.
 *
 * @param {{categoryService: object}} deps
 * @returns {Readonly<object>}
 */
export function createCategoryController({ categoryService } = {}) {
    assertCategoryService(categoryService);

    // -------------------------------------------------------------------------
    // PUBLIC READS
    // -------------------------------------------------------------------------

    /**
     * GET /categories
     */
    async function listPublicCategories(req, res, next) {
        try {
            const query = readInput(req, 'query');

            const result =
                await categoryService.listPublicCategories(query);

            return sendSuccess(res, {
                data: result,
                message: 'Categories retrieved successfully',
            });
        } catch (error) {
            return next(error);
        }
    }

    /**
     * GET /categories/:id
     */
    async function getPublicCategoryById(req, res, next) {
        try {
            const id = readParam(req, 'id');

            const result =
                await categoryService.getPublicCategoryById(id);

            return sendSuccess(res, {
                data: result,
                message: 'Category retrieved successfully',
            });
        } catch (error) {
            return next(error);
        }
    }

    /**
     * GET /categories/slug/:slug
     */
    async function getPublicCategoryBySlug(req, res, next) {
        try {
            const slug = readParam(req, 'slug');

            const result =
                await categoryService.getPublicCategoryBySlug(slug);

            return sendSuccess(res, {
                data: result,
                message: 'Category retrieved successfully',
            });
        } catch (error) {
            return next(error);
        }
    }

    /**
     * GET /categories/:uuid
     */
    async function getPublicCategoryByUuid(req, res, next) {
        try {
            const uuid = readParam(req, 'uuid');

            const result =
                await categoryService.getPublicCategoryByUuid(uuid);

            return sendSuccess(res, {
                data: result,
                message: 'Category retrieved successfully',
            });
        } catch (error) {
            return next(error);
        }
    }

    /**
     * GET /categories/count
     */
    async function countPublicCategories(req, res, next) {
        try {
            const query = readInput(req, 'query');

            const count =
                await categoryService.countPublicCategories(query);

            return sendSuccess(res, {
                data: { count },
                message: 'Category count retrieved successfully',
            });
        } catch (error) {
            return next(error);
        }
    }

    // -------------------------------------------------------------------------
    // ADMIN READS
    // -------------------------------------------------------------------------

    /**
     * GET /admin/categories
     */
    async function listAdminCategories(req, res, next) {
        try {
            const query = readInput(req, 'query');

            const result =
                await categoryService.listAdminCategories(query);

            return sendSuccess(res, {
                data: result,
                message: 'Categories retrieved successfully',
            });
        } catch (error) {
            return next(error);
        }
    }

    /**
     * GET /admin/categories/:id
     */
    async function getAdminCategory(req, res, next) {
        try {
            const id = readParam(req, 'id');

            const result =
                await categoryService.getAdminCategory(id);

            return sendSuccess(res, {
                data: result,
                message: 'Category retrieved successfully',
            });
        } catch (error) {
            return next(error);
        }
    }

    /**
     * GET /admin/categories/uuid/:uuid
     */
    async function getAdminCategoryByUuid(req, res, next) {
        try {
            const uuid = readParam(req, 'uuid');

            const result =
                await categoryService.getAdminCategoryByUuid(uuid);

            return sendSuccess(res, {
                data: result,
                message: 'Category retrieved successfully',
            });
        } catch (error) {
            return next(error);
        }
    }

    /**
     * GET /admin/categories/count
     */
    async function countAdminCategories(req, res, next) {
        try {
            const query = readInput(req, 'query');

            const count =
                await categoryService.countAdminCategories(query);

            return sendSuccess(res, {
                data: { count },
                message: 'Category count retrieved successfully',
            });
        } catch (error) {
            return next(error);
        }
    }

    // -------------------------------------------------------------------------
    // ADMIN WRITES
    // -------------------------------------------------------------------------

    /**
     * POST /admin/categories
     */
    async function createCategory(req, res, next) {
        try {
            const body = readInput(req, 'body');

            const result =
                await categoryService.createCategory(body);

            return sendCreated(
                res,
                result,
                'Category created successfully'
            );
        } catch (error) {
            return next(error);
        }
    }

    /**
     * PATCH /admin/categories/:id
     */
    async function updateCategory(req, res, next) {
        try {
            const id = readParam(req, 'id');
            const body = readInput(req, 'body');

            const result =
                await categoryService.updateCategory(id, body);

            return sendSuccess(res, {
                data: result,
                message: 'Category updated successfully',
            });
        } catch (error) {
            return next(error);
        }
    }

    /**
     * DELETE /admin/categories/:id
     */
    async function deleteCategory(req, res, next) {
        try {
            const id = readParam(req, 'id');

            const result =
                await categoryService.deleteCategory(id);

            return sendSuccess(res, {
                data: result,
                message: 'Category deleted successfully',
            });
        } catch (error) {
            return next(error);
        }
    }

    /**
     * POST /admin/categories/:id/restore
     */
    async function restoreCategory(req, res, next) {
        try {
            const id = readParam(req, 'id');

            const result =
                await categoryService.restoreCategory(id);

            return sendSuccess(res, {
                data: result,
                message: 'Category restored successfully',
            });
        } catch (error) {
            return next(error);
        }
    }

    /**
     * POST /admin/categories/:id/activate
     */
    async function activateCategory(req, res, next) {
        try {
            const id = readParam(req, 'id');

            const result =
                await categoryService.activateCategory(id);

            return sendSuccess(res, {
                data: result,
                message: 'Category activated successfully',
            });
        } catch (error) {
            return next(error);
        }
    }

    /**
     * POST /admin/categories/:id/deactivate
     */
    async function deactivateCategory(req, res, next) {
        try {
            const id = readParam(req, 'id');

            const result =
                await categoryService.deactivateCategory(id);

            return sendSuccess(res, {
                data: result,
                message: 'Category deactivated successfully',
            });
        } catch (error) {
            return next(error);
        }
    }

    // -------------------------------------------------------------------------
    // PUBLIC API
    // -------------------------------------------------------------------------

    return Object.freeze({
        // Public
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

        // Admin writes
        createCategory,
        updateCategory,
        deleteCategory,
        restoreCategory,
        activateCategory,
        deactivateCategory,
    });
}

export default createCategoryController;