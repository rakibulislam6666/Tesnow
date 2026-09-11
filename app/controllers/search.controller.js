/**
 * app/controllers/search.controller.js
 * Public search controller for Tesnow
 * Handles search queries with pagination and results display
 * 
 * @module controllers/search.controller
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
 * Safely normalize a search query
 * @param {*} rawQuery - Raw query from request
 * @param {number} maxLength - Maximum allowed query length
 * @returns {string|null} Normalized query or null if invalid/empty
 */
function normalizeSearchQuery(rawQuery, maxLength = 200) {
    if (typeof rawQuery !== 'string') {
        return null;
    }

    const trimmed = rawQuery.trim();

    if (trimmed.length === 0) {
        return null;
    }

    // Reject control characters and null bytes
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
        return null;
    }

    // Enforce maximum length
    if (trimmed.length > maxLength) {
        return trimmed.substring(0, maxLength);
    }

    return trimmed;
}

/**
 * Build safe view model for search page
 * @param {Object} options - Options for building the view model
 * @param {string} options.query - The search query
 * @param {Array} options.results - Search results
 * @param {Object} options.pagination - Pagination metadata
 * @param {string} options.canonicalUrl - Canonical URL
 * @param {number} options.resultCount - Total result count
 * @returns {Object} Safe view model
 */
function buildSearchViewModel(options = {}) {
    const {
        query = '',
        results = [],
        pagination = null,
        canonicalUrl = '',
        resultCount = 0,
    } = options;

    const appConfig = getAppConfig();
    const seoConfig = getSeoConfig();

    // Build SEO metadata
    const hasQuery = query && query.length > 0;
    const seoTitle = hasQuery
        ? `Search: ${query}${seoConfig.titleSuffix || ''}`
        : `Search${seoConfig.titleSuffix || ''}`;

    const seoDescription = hasQuery
        ? `Search results for "${query}"`
        : 'Search for content on Tesnow';

    return {
        page: {
            title: seoTitle,
            description: seoDescription,
            canonicalUrl: canonicalUrl || seoConfig.siteUrl || appConfig.appUrl || '',
            robots: hasQuery ? 'index,follow' : 'noindex,follow',
        },
        query: query,
        results: results.map(result => ({
            id: result.id || null,
            title: result.title || '',
            slug: result.slug || '',
            excerpt: result.excerpt || '',
            featuredImage: result.featuredImage || null,
            publishedAt: result.publishedAt || result.createdAt || null,
            updatedAt: result.updatedAt || null,
            author: result.author || null,
            category: result.category || null,
            readingTime: result.readingTime || null,
        })),
        pagination: pagination || null,
        resultCount: resultCount,
        hasQuery: hasQuery,
        structuredData: hasQuery ? {
            '@context': 'https://schema.org',
            '@type': 'SearchResultsPage',
            name: `Search results for "${query}"`,
            url: canonicalUrl || undefined,
            mainEntity: {
                '@type': 'ItemList',
                itemListElement: results.map((result, index) => ({
                    '@type': 'ListItem',
                    position: index + 1,
                    url: `${seoConfig.siteUrl || ''}/post/${result.slug}`,
                })),
            },
        } : null,
    };
}

// ----------------------------------------------------------------------------
// 2. CONTROLLER FACTORY
// ----------------------------------------------------------------------------

/**
 * Factory for creating a search controller with injected dependencies
 * @param {Object} dependencies - Injected dependencies
 * @param {Object} dependencies.searchService - Search service (optional)
 * @param {Object} dependencies.seoService - SEO service (optional)
 * @param {Object} dependencies.cacheService - Cache service (optional)
 * @param {Object} dependencies.analyticsService - Analytics service (optional)
 * @param {Object} dependencies.featureFlagService - Feature flag service (optional)
 * @returns {Object} Controller object with handlers
 */
export function createSearchController(dependencies = {}) {
    const {
        searchService = null,
        seoService = null,
        cacheService = null,
        analyticsService = null,
        featureFlagService = null,
    } = dependencies;

    // --------------------------------------------------------------------------
    // HANDLER: GET /search - Search page
    // --------------------------------------------------------------------------

    /**
     * Search handler
     * @param {import('express').Request} req - Express request
     * @param {import('express').Response} res - Express response
     * @param {import('express').NextFunction} next - Express next function
     */
    async function search(req, res, next) {
        try {
            const seoConfig = getSeoConfig();
            const apiConfig = getApiConfig();

            // Extract and normalize query
            let rawQuery = req.query.q;

            // Handle multiple q values (take first)
            if (Array.isArray(rawQuery)) {
                rawQuery = rawQuery[0];
            }

            const normalizedQuery = normalizeSearchQuery(rawQuery, 200);
            const hasQuery = normalizedQuery !== null && normalizedQuery.length > 0;

            // Get pagination parameters
            const defaultLimit = apiConfig?.pagination?.defaultLimit || 20;
            const maxLimit = apiConfig?.pagination?.maxLimit || 100;
            const { page, limit } = parsePaginationQuery(req.query, defaultLimit, maxLimit);

            let results = [];
            let total = 0;

            // Only perform search if query is present
            if (hasQuery) {
                // Build service input
                const serviceInput = {
                    query: normalizedQuery,
                    page,
                    limit,
                };

                // Call search service
                if (searchService && typeof searchService.search === 'function') {
                    const result = await searchService.search(serviceInput);
                    results = result?.data || [];
                    total = result?.total || 0;
                } else if (searchService && typeof searchService.query === 'function') {
                    // Alternative method name
                    const result = await searchService.query(serviceInput);
                    results = result?.data || [];
                    total = result?.total || 0;
                } else {
                    // No service available - return empty state
                    results = [];
                    total = 0;
                }
            } else {
                // No query - empty state
                results = [];
                total = 0;
            }

            // Calculate pagination metadata
            const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
            const hasNext = page < totalPages;
            const hasPrevious = page > 1;

            const pagination = hasQuery && totalPages > 0 ? {
                page,
                limit,
                total,
                totalPages,
                hasNext,
                hasPrevious,
                nextPage: hasNext ? page + 1 : null,
                previousPage: hasPrevious ? page - 1 : null,
            } : null;

            // Build canonical URL
            const baseUrl = seoConfig.siteUrl || '';
            let canonicalUrl = `${baseUrl}/search`;
            const queryParams = [];
            if (hasQuery) {
                queryParams.push(`q=${encodeURIComponent(normalizedQuery)}`);
            }
            if (page > 1) {
                queryParams.push(`page=${page}`);
            }
            if (limit !== defaultLimit) {
                queryParams.push(`limit=${limit}`);
            }
            if (queryParams.length > 0) {
                canonicalUrl += `?${queryParams.join('&')}`;
            }

            // Build view model
            const viewModel = buildSearchViewModel({
                query: hasQuery ? normalizedQuery : '',
                results,
                pagination,
                canonicalUrl,
                resultCount: total,
            });

            // Render the view
            res.status(HTTP_STATUS.OK).render('pages/search/index', viewModel);
        } catch (error) {
            next(error);
        }
    }

    // --------------------------------------------------------------------------
    // RETURN CONTROLLER
    // --------------------------------------------------------------------------

    return {
        search,
    };
}

// ----------------------------------------------------------------------------
// 3. DEFAULT EXPORT
// ----------------------------------------------------------------------------

// Create default controller instance (with no dependencies)
// This ensures the controller can be used immediately without injection
const defaultController = createSearchController();

export default {
    search: defaultController.search,
    createSearchController,
};

export const search = defaultController.search;