/**
 * app/controllers/post.controller.js
 * Public post controller for Tesnow
 * Handles post listing and single post display
 * 
 * @module controllers/post.controller
 */

import { getAppConfig } from '../config/app.config.js';
import { getSeoConfig } from '../config/seo.config.js';
import { getApiConfig } from '../config/api.config.js';
import { getCacheConfig } from '../config/cache.config.js';
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
 * Safely normalize a slug
 * @param {string} slug - Raw slug from route parameter
 * @returns {string} Normalized slug
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
 * Build safe view model for post listing
 * @param {Object} options - Options for building the view model
 * @param {Array} options.posts - List of posts
 * @param {Object} options.pagination - Pagination metadata
 * @param {string} options.title - Page title
 * @param {string} options.description - Page description
 * @param {string} options.canonicalUrl - Canonical URL
 * @param {Array} options.categories - Categories list
 * @param {Array} options.featuredPosts - Featured posts
 * @returns {Object} Safe view model
 */
function buildPostListViewModel(options = {}) {
    const {
        posts = [],
        pagination = null,
        title = 'Posts',
        description = '',
        canonicalUrl = '',
        categories = [],
        featuredPosts = [],
    } = options;

    const appConfig = getAppConfig();
    const seoConfig = getSeoConfig();

    return {
        page: {
            title: title || seoConfig.defaultTitle || appConfig.appName || 'Tesnow',
            description: description || seoConfig.defaultDescription || '',
            canonicalUrl: canonicalUrl || seoConfig.siteUrl || appConfig.appUrl || '',
            robots: seoConfig.robots?.directive || 'index,follow',
        },
        posts: posts.map(post => ({
            id: post.id || null,
            title: post.title || '',
            slug: post.slug || '',
            excerpt: post.excerpt || '',
            publishedAt: post.publishedAt || post.createdAt || null,
            updatedAt: post.updatedAt || null,
            author: post.author || null,
            category: post.category || null,
            tags: Array.isArray(post.tags) ? post.tags : [],
            featuredImage: post.featuredImage || null,
            readingTime: post.readingTime || null,
        })),
        pagination: pagination || null,
        categories,
        featuredPosts,
    };
}

/**
 * Build safe view model for single post
 * @param {Object} options - Options for building the view model
 * @param {Object} options.post - Post data
 * @param {Array} options.relatedPosts - Related posts
 * @param {Array} options.comments - Comments
 * @param {string} options.canonicalUrl - Canonical URL
 * @returns {Object} Safe view model
 */
function buildSinglePostViewModel(options = {}) {
    const {
        post = null,
        relatedPosts = [],
        comments = [],
        canonicalUrl = '',
    } = options;

    const appConfig = getAppConfig();
    const seoConfig = getSeoConfig();

    const postData = post ? {
        id: post.id || null,
        title: post.title || '',
        slug: post.slug || '',
        excerpt: post.excerpt || '',
        content: post.content || '',
        publishedAt: post.publishedAt || post.createdAt || null,
        updatedAt: post.updatedAt || null,
        author: post.author || null,
        category: post.category || null,
        tags: Array.isArray(post.tags) ? post.tags : [],
        featuredImage: post.featuredImage || null,
        readingTime: post.readingTime || null,
        viewCount: post.viewCount || 0,
        commentCount: post.commentCount || 0,
        likeCount: post.likeCount || 0,
    } : null;

    const seoTitle = postData
        ? `${postData.title}${seoConfig.titleSuffix || ''}`
        : seoConfig.defaultTitle || appConfig.appName || 'Tesnow';

    return {
        page: {
            title: seoTitle,
            description: postData?.excerpt || seoConfig.defaultDescription || '',
            canonicalUrl: canonicalUrl || postData ? `${seoConfig.siteUrl || ''}/post/${postData.slug}` : '',
            robots: seoConfig.robots?.directive || 'index,follow',
        },
        post: postData,
        relatedPosts: relatedPosts.map(p => ({
            id: p.id || null,
            title: p.title || '',
            slug: p.slug || '',
            excerpt: p.excerpt || '',
            publishedAt: p.publishedAt || p.createdAt || null,
            featuredImage: p.featuredImage || null,
        })),
        comments: comments.map(c => ({
            id: c.id || null,
            author: c.author || null,
            content: c.content || '',
            createdAt: c.createdAt || null,
            isApproved: c.isApproved !== false,
        })),
        structuredData: postData ? {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: postData.title,
            description: postData.excerpt,
            datePublished: postData.publishedAt,
            dateModified: postData.updatedAt || postData.publishedAt,
            author: postData.author ? {
                '@type': 'Person',
                name: postData.author.name || '',
            } : undefined,
            mainEntityOfPage: {
                '@type': 'WebPage',
                '@id': canonicalUrl || '',
            },
        } : null,
    };
}

// ----------------------------------------------------------------------------
// 2. CONTROLLER FACTORY
// ----------------------------------------------------------------------------

/**
 * Factory for creating a post controller with injected dependencies
 * @param {Object} dependencies - Injected dependencies
 * @param {Object} dependencies.postService - Post service (optional)
 * @param {Object} dependencies.seoService - SEO service (optional)
 * @param {Object} dependencies.redirectService - Redirect service (optional)
 * @param {Object} dependencies.cacheService - Cache service (optional)
 * @param {Object} dependencies.analyticsService - Analytics service (optional)
 * @param {Object} dependencies.featureFlagService - Feature flag service (optional)
 * @returns {Object} Controller object with handlers
 */
export function createPostController(dependencies = {}) {
    const {
        postService = null,
        seoService = null,
        redirectService = null,
        cacheService = null,
        analyticsService = null,
        featureFlagService = null,
    } = dependencies;

    // --------------------------------------------------------------------------
    // HANDLER: GET /posts - List posts with pagination
    // --------------------------------------------------------------------------

    /**
     * List posts handler
     * @param {import('express').Request} req - Express request
     * @param {import('express').Response} res - Express response
     * @param {import('express').NextFunction} next - Express next function
     */
    async function listPosts(req, res, next) {
        try {
            const seoConfig = getSeoConfig();
            const apiConfig = getApiConfig();
            const cacheConfig = getCacheConfig();

            // Get and validate pagination parameters
            const defaultLimit = apiConfig?.pagination?.defaultLimit || 20;
            const maxLimit = apiConfig?.pagination?.maxLimit || 100;
            const { page, limit } = parsePaginationQuery(req.query, defaultLimit, maxLimit);

            // Get filter parameters (future)
            const category = req.query.category ? String(req.query.category).trim() : null;
            const tag = req.query.tag ? String(req.query.tag).trim() : null;
            const search = req.query.search ? String(req.query.search).trim() : null;

            // Determine if search is active
            const hasSearch = !!(search && search.length > 0);

            // Prepare service input
            const serviceInput = {
                page,
                limit,
                category: category && category.length > 0 ? category : null,
                tag: tag && tag.length > 0 ? tag : null,
                search: hasSearch ? search : null,
                status: 'published',
            };

            // Fetch posts from service
            let posts = [];
            let total = 0;

            if (postService && typeof postService.list === 'function') {
                const result = await postService.list(serviceInput);
                posts = result?.data || [];
                total = result?.total || 0;
            } else if (postService && typeof postService.listPublished === 'function') {
                // Alternative method name
                const result = await postService.listPublished(serviceInput);
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
            let canonicalUrl = `${baseUrl}/posts`;
            const queryParts = [];
            if (page > 1) queryParts.push(`page=${page}`);
            if (limit !== defaultLimit) queryParts.push(`limit=${limit}`);
            if (category) queryParts.push(`category=${encodeURIComponent(category)}`);
            if (tag) queryParts.push(`tag=${encodeURIComponent(tag)}`);
            if (search) queryParts.push(`search=${encodeURIComponent(search)}`);
            if (queryParts.length > 0) canonicalUrl += `?${queryParts.join('&')}`;

            // Build view model
            const viewModel = buildPostListViewModel({
                posts,
                pagination,
                title: search ? `Search: ${search}` : 'Posts',
                description: search ? `Search results for "${search}"` : '',
                canonicalUrl,
                categories: [],
                featuredPosts: [],
            });

            // Render the view
            res.status(HTTP_STATUS.OK).render('pages/post/index', viewModel);
        } catch (error) {
            next(error);
        }
    }

    // --------------------------------------------------------------------------
    // HANDLER: GET /post/:slug - Single post
    // --------------------------------------------------------------------------

    /**
     * Get single post by slug handler
     * @param {import('express').Request} req - Express request
     * @param {import('express').Response} res - Express response
     * @param {import('express').NextFunction} next - Express next function
     */
    async function getPostBySlug(req, res, next) {
        try {
            const seoConfig = getSeoConfig();

            // Validate and normalize slug
            const rawSlug = req.params.slug;
            const normalizedSlug = normalizeSlug(rawSlug);

            if (!normalizedSlug) {
                // Return 404 for invalid slug
                const error = new Error('Post not found');
                error.statusCode = HTTP_STATUS.NOT_FOUND;
                error.code = 'NOT_FOUND';
                error.isOperational = true;
                return next(error);
            }

            // Check for redirects (future)
            if (redirectService && typeof redirectService.resolve === 'function') {
                const resolved = await redirectService.resolve(normalizedSlug);
                if (resolved && resolved.target) {
                    return res.redirect(HTTP_STATUS.MOVED_PERMANENTLY, resolved.target);
                }
            }

            // Fetch post from service
            let post = null;

            if (postService && typeof postService.getBySlug === 'function') {
                post = await postService.getBySlug(normalizedSlug);
            } else if (postService && typeof postService.findBySlug === 'function') {
                post = await postService.findBySlug(normalizedSlug);
            }

            // Handle not found
            if (!post) {
                const error = new Error('Post not found');
                error.statusCode = HTTP_STATUS.NOT_FOUND;
                error.code = 'NOT_FOUND';
                error.isOperational = true;
                return next(error);
            }

            // Check if post is published (unless feature flag allows preview)
            const isPublished = post.status === 'published';
            const allowPreview = featureFlagService && typeof featureFlagService.isEnabled === 'function'
                ? await featureFlagService.isEnabled('post_preview')
                : false;

            if (!isPublished && !allowPreview) {
                const error = new Error('Post not found');
                error.statusCode = HTTP_STATUS.NOT_FOUND;
                error.code = 'NOT_FOUND';
                error.isOperational = true;
                return next(error);
            }

            // Track view (future)
            if (analyticsService && typeof analyticsService.trackEvent === 'function') {
                try {
                    await analyticsService.trackEvent('post_view', {
                        postId: post.id,
                        slug: post.slug,
                        userId: req.user?.id ?? req.session?.userId ?? null,
                        requestId: req.id || null,
                    });
                } catch (_) {
                    // Silently ignore analytics errors
                }
            }

            // Build canonical URL
            const baseUrl = seoConfig.siteUrl || '';
            const canonicalUrl = `${baseUrl}/post/${post.slug}`;

            // Fetch related posts (future)
            let relatedPosts = [];
            if (postService && typeof postService.getRelated === 'function') {
                try {
                    const related = await postService.getRelated(post.id, 5);
                    relatedPosts = related || [];
                } catch (_) {
                    relatedPosts = [];
                }
            }

            // Fetch comments (future)
            let comments = [];
            if (postService && typeof postService.getComments === 'function') {
                try {
                    const commentResult = await postService.getComments(post.id, { approved: true });
                    comments = commentResult?.data || [];
                } catch (_) {
                    comments = [];
                }
            }

            // Build view model
            const viewModel = buildSinglePostViewModel({
                post,
                relatedPosts,
                comments,
                canonicalUrl,
            });

            // Render the view
            res.status(HTTP_STATUS.OK).render('pages/post/index', viewModel);
        } catch (error) {
            // Log error but don't expose details
            next(error);
        }
    }

    // --------------------------------------------------------------------------
    // RETURN CONTROLLER
    // --------------------------------------------------------------------------

    return {
        listPosts,
        getPostBySlug,
    };
}

// ----------------------------------------------------------------------------
// 3. DEFAULT EXPORT
// ----------------------------------------------------------------------------

// Create default controller instance (with no dependencies)
// This ensures the controller can be used immediately without injection
const defaultController = createPostController();

export default {
    listPosts: defaultController.listPosts,
    getPostBySlug: defaultController.getPostBySlug,
    createPostController,
};

export const listPosts = defaultController.listPosts;
export const getPostBySlug = defaultController.getPostBySlug;