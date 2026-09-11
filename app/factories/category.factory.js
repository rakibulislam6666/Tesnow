/**
 * app/factories/category.factory.js
 *
 * Composition factory for the Category domain.
 *
 * Responsibility:
 *   - Wire Category repository, service and controller.
 *   - Provide cryptographically secure UUID generation.
 *   - Keep dependency construction outside routes/controllers.
 *
 * Non-responsibilities:
 *   - HTTP handling.
 *   - Request validation.
 *   - Authorization.
 *   - Business rules.
 *   - SQL.
 */

import { randomUUID } from 'node:crypto';

import createCategoryRepository from '../repositories/category.repository.js';
import createCategoryService from '../services/category.service.js';
import createCategoryController from '../controllers/category.controller.js';

/**
 * Create the complete Category HTTP dependency graph.
 *
 * Dependency graph:
 *
 *   crypto.randomUUID
 *          ↓
 *   Category Service
 *          ↑
 *   Category Repository
 *          ↓
 *   Category Controller
 *
 * @returns {{
 *   categoryRepository: object,
 *   categoryService: object,
 *   categoryController: object
 * }}
 */
export function createCategoryDependencies() {
    const categoryRepository = createCategoryRepository();

    const categoryService = createCategoryService({
        categoryRepository,
        uuidGenerator: randomUUID,
    });

    const categoryController = createCategoryController({
        categoryService,
    });

    return Object.freeze({
        categoryRepository,
        categoryService,
        categoryController,
    });
}

export default createCategoryDependencies;
