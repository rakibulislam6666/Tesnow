/**
 * app/routes/category.routes.js
 *
 * Public Category API route composition.
 *
 * Responsibilities:
 *   - Define category HTTP endpoints.
 *   - Attach request validation.
 *   - Delegate to Category Controller.
 *
 * Non-responsibilities:
 *   - Business logic.
 *   - SQL.
 *   - Authorization.
 *   - Dependency construction.
 *
 * @module routes/category.routes
 */

import express from "express";

import { validateQuery, validateParams } from "../middleware/validation.js";

import {
  categoryIdParam,
  categoryUuidParam,
  categorySlugParam,
  listPublicCategoriesQuery,
} from "../validators/category.validator.js";

import createCategoryDependencies from "../factories/category.factory.js";

const router = express.Router();

const { categoryController } = createCategoryDependencies();

/**
 * GET /categories
 *
 * List active public categories.
 */
router.get(
  "/",
  validateQuery(listPublicCategoriesQuery),
  categoryController.listPublicCategories,
);

/**
 * GET /categories/count
 *
 * Count active public categories.
 *
 * Must be declared before /:id.
 */
router.get("/count", categoryController.countPublicCategories);

/**
 * GET /categories/slug/:slug
 *
 * Get an active public category by slug.
 */
router.get(
  "/slug/:slug",
  validateParams((params) => ({
    slug: categorySlugParam(params.slug),
  })),
  categoryController.getPublicCategoryBySlug,
);

/**
 * GET /categories/uuid/:uuid
 *
 * Get an active public category by UUID.
 */
router.get(
  "/uuid/:uuid",
  validateParams((params) => ({
    uuid: categoryUuidParam(params.uuid),
  })),
  categoryController.getPublicCategoryByUuid,
);

/**
 * GET /categories/:id
 *
 * Get an active public category by numeric ID.
 */
router.get(
  "/:id",
  validateParams((params) => ({
    id: categoryIdParam(params.id),
  })),
  categoryController.getPublicCategoryById,
);

export default router;
export { router };
