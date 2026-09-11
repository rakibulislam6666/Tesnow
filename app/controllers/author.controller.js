/**
 * app/controllers/author.controller.js
 * Public author profile controller for Tesnow
 * Handles author profile page with published posts and pagination
 * 
 * @module controllers/author.controller
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
 * Safely normalize an author slug
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
 * Build safe view model for author page
 * @param {Object} options - Options for building the view model
 * @param {Object} options.author - Public author data
 * @param {Array} options.posts - Published posts by author
 * @param {Object} options.pagination - Pagination metadata
 * @param {string} options.canonicalUrl - Canonical URL
 * @returns {Object} Safe view model
 */
function buildAuthorViewModel(options = {}) {
    const {
        author = null,
        posts = [],
        pagination = null,
        canonicalUrl = '',
    } = options;

    const appConfig = getAppConfig();
    const seoConfig = getSeoConfig();

    // Build author data (public only)
    const authorData = author ? {
        id: author.id || null,
        name: author.name || '',
        slug: author.slug || '',
        avatar: author.avatar || null,
        bio: author.bio || '',
        website: author.website || null,
        socialLinks: author.socialLinks || null,
        postCount: author.postCount || 0,
        createdAt: author.createdAt || null,
        updatedAt: author.updatedAt || null,
    } : null;

    // Build SEO metadata
    const seoTitle = authorData
        ? `${authorData.name}${seoConfig.titleSuffix || ''}`
        : seoConfig.defaultTitle || appConfig.appName || 'Tesnow';

    const seoDescription = authorData?.bio || seoConfig.defaultDescription || '';

    return {
        page: {
            title: seoTitle,
            description: seoDescription,
            canonicalUrl: canonicalUrl || seoConfig.siteUrl || appConfig.appUrl || '',
            robots: seoConfig.robots?.directive || 'index,follow',
        },
        author: authorData,
        posts: posts.map(post => ({
            id: post.id || null,
            title: post.title || '',
            slug: post.slug || '',
            excerpt: post.excerpt || '',
            featuredImage: post.featuredImage || null,
            publishedAt: post.publishedAt || post.createdAt || null,
            updatedAt: post.updatedAt || null,
            readingTime: post.readingTime || null,
            category: post.category || null,
            tags: post.tags || [],
        })),
        pagination: pagination || null,
        structuredData: authorData ? {
            '@context': 'https://schema.org',
            '@type': 'ProfilePage',
            name: authorData.name,
            description: authorData.bio || undefined,
            url: canonicalUrl || undefined,
            mainEntity: {
                '@type': 'Person',
                name: authorData.name,
                description: authorData.bio || undefined,
                url: canonicalUrl || undefined,
                image: authorData.avatar || undefined,
            },
        } : null,
    };
}

// ----------------------------------------------------------------------------
// 2. CONTROLLER FACTORY
// ----------------------------------------------------------------------------

/**
 * Factory for creating an author controller with injected dependencies
 * @param {Object} dependencies - Injected dependencies
 * @param {Object} dependencies.authorService - Author service (optional)
 * @param {Object} dependencies.postService - Post service (optional)
 * @param {Object} dependencies.seoService - SEO service (optional)
 * @param {Object} dependencies.cacheService - Cache service (optional)
 * @param {Object} dependencies.analyticsService - Analytics service (optional)
 * @param {Object} dependencies.featureFlagService - Feature flag service (optional)
 * @returns {Object} Controller object with handlers
 */
export function createAuthorController(dependencies = {}) {
    const {
        authorService = null,
        postService = null,
        seoService = null,
        cacheService = null,
        analyticsService = null,
        featureFlagService = null,
    } = dependencies;

    // --------------------------------------------------------------------------
    // HANDLER: GET /author/:slug - Author profile page
    // --------------------------------------------------------------------------

    /**
     * Get author by slug handler
     * @param {import('express').Request} req - Express request
     * @param {import('express').Response} res - Express response
     * @param {import('express').NextFunction} next - Express next function
     */
    async function getAuthorBySlug(req, res, next) {
        try {
            const seoConfig = getSeoConfig();
            const apiConfig = getApiConfig();

            // Validate and normalize slug
            const rawSlug = req.params.slug;
            const normalizedSlug = normalizeSlug(rawSlug);

            if (!normalizedSlug) {
                const error = new Error('Author not found');
                error.statusCode = HTTP_STATUS.NOT_FOUND;
                error.code = 'NOT_FOUND';
                error.isOperational = true;
                return next(error);
            }

            // Fetch author from service
            let author = null;

            if (authorService && typeof authorService.getBySlug === 'function') {
                author = await authorService.getBySlug(normalizedSlug);
            } else if (authorService && typeof authorService.findBySlug === 'function') {
                author = await authorService.findBySlug(normalizedSlug);
            }

            // Handle not found
            if (!author) {
                const error = new Error('Author not found');
                error.statusCode = HTTP_STATUS.NOT_FOUND;
                error.code = 'NOT_FOUND';
                error.isOperational = true;
                return next(error);
            }

            // Check if author is publicly visible (future)
            const isVisible = author.status !== 'hidden' && author.status !== 'deleted';
            if (!isVisible) {
                const error = new Error('Author not found');
                error.statusCode = HTTP_STATUS.NOT_FOUND;
                error.code = 'NOT_FOUND';
                error.isOperational = true;
                return next(error);
            }

            // Get pagination parameters
            const defaultLimit = apiConfig?.pagination?.defaultLimit || 20;
            const maxLimit = apiConfig?.pagination?.maxLimit || 100;
            const { page, limit } = parsePaginationQuery(req.query, defaultLimit, maxLimit);

            // Fetch posts for this author
            let posts = [];
            let total = 0;

            if (postService && typeof postService.listByAuthor === 'function') {
                const result = await postService.listByAuthor(author.id, {
                    page,
                    limit,
                    status: 'published',
                });
                posts = result?.data || [];
                total = result?.total || 0;
            } else if (postService && typeof postService.listByAuthorSlug === 'function') {
                const result = await postService.listByAuthorSlug(normalizedSlug, {
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
            let canonicalUrl = `${baseUrl}/author/${author.slug}`;
            if (page > 1) {
                canonicalUrl += `?page=${page}`;
            }

            // Build view model
            const viewModel = buildAuthorViewModel({
                author,
                posts,
                pagination,
                canonicalUrl,
            });

            // Render the view
            res.status(HTTP_STATUS.OK).render('pages/author/index', viewModel);
        } catch (error) {
            next(error);
        }
    }

    // --------------------------------------------------------------------------
    // RETURN CONTROLLER
    // --------------------------------------------------------------------------

    return {
        getAuthorBySlug,
    };
}

// ----------------------------------------------------------------------------
// 3. DEFAULT EXPORT
// ----------------------------------------------------------------------------

// Create default controller instance (with no dependencies)
const defaultController = createAuthorController();

export default {
    getAuthorBySlug: defaultController.getAuthorBySlug,
    createAuthorController,
};

export const getAuthorBySlug = defaultController.getAuthorBySlug;