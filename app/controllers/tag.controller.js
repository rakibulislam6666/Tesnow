/**
 * app/controllers/tag.controller.js
 * Public tag controller for Tesnow
 * Handles tag page display with associated posts
 * 
 * @module controllers/tag.controller
 */

import { getAppConfig } from '../config/app.config.js';
import { getSeoConfig } from '../config/seo.config.js';
import { getApiConfig } from '../config/api.config.js';
import { HTTP_STATUS } from '../core/constants.js';

// ----------------------------------------------------------------------------
// 1. HELPERS
// ----------------------------------------------------------------------------

/**
 * Safely parse pagination query parameters
 * @param {Object} query - Express query object
 * @param {number} defaultLimit - Default limit
 * @param {number} maxLimit - Maximum allowed limit
 * @returns {Object} Normalized pagination params { page, limit }
 */
function parsePaginationQuery(query, defaultLimit = 20, maxLimit = 100) {
    let page = 1;
    let limit = defaultLimit;

    // Parse page
    if (query.page !== undefined && query.page !== null && query.page !== '') {
        const parsed = parseInt(query.page, 10);
        if (Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 1) {
            page = parsed;
        }
    }

    // Parse limit
    if (query.limit !== undefined && query.limit !== null && query.limit !== '') {
        const parsed = parseInt(query.limit, 10);
        if (Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 1 && parsed <= maxLimit) {
            limit = parsed;
        }
    }

    return { page, limit };
}

/**
 * Safely normalize a tag slug
 * @param {string} slug - Raw slug from route parameter
 * @returns {string|null} Normalized slug or null if invalid
 */
function normalizeSlug(slug) {
    if (typeof slug !== 'string' || slug.trim() === '') {
        return null;
    }

    const normalized = slug.trim().toLowerCase();

    // Reject path traversal patterns
    if (normalized.includes('..') || normalized.includes('/') || normalized.includes('\\')) {
        return null;
    }

    // Reject control characters and null bytes
    if (/[\x00-\x1F\x7F]/.test(normalized)) {
        return null;
    }

    // Reject excessively long slugs
    if (normalized.length > 255) {
        return null;
    }

    // Only allow safe characters for slugs
    if (!/^[a-z0-9\-_]+$/.test(normalized)) {
        return null;
    }

    return normalized;
}

/**
 * Build safe view model for tag page
 * @param {Object} options - Options for building the view model
 * @param {Object} options.tag - Tag data
 * @param {Array} options.posts - Posts belonging to the tag
 * @param {Object} options.pagination - Pagination metadata
 * @param {string} options.canonicalUrl - Canonical URL
 * @returns {Object} Safe view model
 */
function buildTagViewModel(options = {}) {
    const {
        tag = null,
        posts = [],
        pagination = null,
        canonicalUrl = '',
    } = options;

    const appConfig = getAppConfig();
    const seoConfig = getSeoConfig();

    // Build tag data
    const tagData = tag ? {
        id: tag.id || null,
        name: tag.name || '',
        slug: tag.slug || '',
        description: tag.description || '',
        postCount: tag.postCount || 0,
        createdAt: tag.createdAt || null,
        updatedAt: tag.updatedAt || null,
    } : null;

    // Build SEO metadata
    const seoTitle = tagData
        ? `${tagData.name}${seoConfig.titleSuffix || ''}`
        : seoConfig.defaultTitle || appConfig.appName || 'Tesnow';

    const seoDescription = tagData?.description || seoConfig.defaultDescription || '';

    return {
        page: {
            title: seoTitle,
            description: seoDescription,
            canonicalUrl: canonicalUrl || seoConfig.siteUrl || appConfig.appUrl || '',
            robots: seoConfig.robots?.directive || 'index,follow',
        },
        tag: tagData,
        posts: posts.map(post => ({
            id: post.id || null,
            title: post.title || '',
            slug: post.slug || '',
            excerpt: post.excerpt || '',
            featuredImage: post.featuredImage || null,
            publishedAt: post.publishedAt || post.createdAt || null,
            updatedAt: post.updatedAt || null,
            author: post.author || null,
            readingTime: post.readingTime || null,
        })),
        pagination: pagination || null,
        structuredData: tagData ? {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: tagData.name,
            description: tagData.description || undefined,
            url: canonicalUrl || undefined,
            mainEntity: {
                '@type': 'ItemList',
                itemListElement: posts.map((post, index) => ({
                    '@type': 'ListItem',
                    position: index + 1,
                    url: `${seoConfig.siteUrl || ''}/post/${post.slug}`,
                })),
            },
        } : null,
    };
}

// ----------------------------------------------------------------------------
// 2. CONTROLLER FACTORY
// ----------------------------------------------------------------------------

/**
 * Factory for creating a tag controller with injected dependencies
 * @param {Object} dependencies - Injected dependencies
 * @param {Object} dependencies.tagService - Tag service (optional)
 * @param {Object} dependencies.postService - Post service (optional)
 * @param {Object} dependencies.seoService - SEO service (optional)
 * @param {Object} dependencies.redirectService - Redirect service (optional)
 * @param {Object} dependencies.cacheService - Cache service (optional)
 * @param {Object} dependencies.analyticsService - Analytics service (optional)
 * @param {Object} dependencies.featureFlagService - Feature flag service (optional)
 * @returns {Object} Controller object with handlers
 */
export function createTagController(dependencies = {}) {
    const {
        tagService = null,
        postService = null,
        seoService = null,
        redirectService = null,
        cacheService = null,
        analyticsService = null,
        featureFlagService = null,
    } = dependencies;

    // --------------------------------------------------------------------------
    // HANDLER: GET /tag/:slug - Tag page with posts
    // --------------------------------------------------------------------------

    /**
     * Get tag by slug handler
     * @param {import('express').Request} req - Express request
     * @param {import('express').Response} res - Express response
     * @param {import('express').NextFunction} next - Express next function
     */
    async function getTagBySlug(req, res, next) {
        try {
            const seoConfig = getSeoConfig();
            const apiConfig = getApiConfig();

            // Validate and normalize slug
            const rawSlug = req.params.slug;
            const normalizedSlug = normalizeSlug(rawSlug);

            if (!normalizedSlug) {
                const error = new Error('Tag not found');
                error.statusCode = HTTP_STATUS.NOT_FOUND;
                error.code = 'NOT_FOUND';
                error.isOperational = true;
                return next(error);
            }

            // Check for redirects (future)
            if (redirectService && typeof redirectService.resolve === 'function') {
                const resolved = await redirectService.resolve(normalizedSlug, 'tag');
                if (resolved && resolved.target) {
                    return res.redirect(HTTP_STATUS.MOVED_PERMANENTLY, resolved.target);
                }
            }

            // Fetch tag from service
            let tag = null;

            if (tagService && typeof tagService.getBySlug === 'function') {
                tag = await tagService.getBySlug(normalizedSlug);
            } else if (tagService && typeof tagService.findBySlug === 'function') {
                tag = await tagService.findBySlug(normalizedSlug);
            }

            // Handle not found
            if (!tag) {
                const error = new Error('Tag not found');
                error.statusCode = HTTP_STATUS.NOT_FOUND;
                error.code = 'NOT_FOUND';
                error.isOperational = true;
                return next(error);
            }

            // Check if tag is active/visible (future)
            const isVisible = tag.status !== 'hidden' && tag.status !== 'deleted';
            if (!isVisible) {
                const error = new Error('Tag not found');
                error.statusCode = HTTP_STATUS.NOT_FOUND;
                error.code = 'NOT_FOUND';
                error.isOperational = true;
                return next(error);
            }

            // Get pagination parameters
            const defaultLimit = apiConfig?.pagination?.defaultLimit || 20;
            const maxLimit = apiConfig?.pagination?.maxLimit || 100;
            const { page, limit } = parsePaginationQuery(req.query, defaultLimit, maxLimit);

            // Fetch posts for this tag
            let posts = [];
            let total = 0;

            if (postService && typeof postService.listByTag === 'function') {
                const result = await postService.listByTag(tag.id, {
                    page,
                    limit,
                    status: 'published',
                });
                posts = result?.data || [];
                total = result?.total || 0;
            } else if (postService && typeof postService.listByTagSlug === 'function') {
                const result = await postService.listByTagSlug(normalizedSlug, {
                    page,
                    limit,
                });
                posts = result?.data || [];
                total = result?.total || 0;
            } else {
                // No service available - return empty state
                posts = [];
                total = 0;
            }

            // Calculate pagination metadata
            const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
            const hasNext = page < totalPages;
            const hasPrevious = page > 1;

            const pagination = {
                page,
                limit,
                total,
                totalPages,
                hasNext,
                hasPrevious,
                nextPage: hasNext ? page + 1 : null,
                previousPage: hasPrevious ? page - 1 : null,
            };

            // Build canonical URL
            const baseUrl = seoConfig.siteUrl || '';
            let canonicalUrl = `${baseUrl}/tag/${tag.slug}`;
            if (page > 1) {
                canonicalUrl += `?page=${page}`;
            }

            // Build view model
            const viewModel = buildTagViewModel({
                tag,
                posts,
                pagination,
                canonicalUrl,
            });

            // Render the view
            res.status(HTTP_STATUS.OK).render('pages/tag/index', viewModel);
        } catch (error) {
            next(error);
        }
    }

    // --------------------------------------------------------------------------
    // RETURN CONTROLLER
    // --------------------------------------------------------------------------

    return {
        getTagBySlug,
    };
}

// ----------------------------------------------------------------------------
// 3. DEFAULT EXPORT
// ----------------------------------------------------------------------------

// Create default controller instance (with no dependencies)
// This ensures the controller can be used immediately without injection
const defaultController = createTagController();

export default {
    getTagBySlug: defaultController.getTagBySlug,
    createTagController,
};

export const getTagBySlug = defaultController.getTagBySlug;