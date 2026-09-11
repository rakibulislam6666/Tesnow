/**
 * app/controllers/legal.controller.js
 * Public legal documents controller for Tesnow
 * Handles privacy policy, terms of service, cookie policy, and other legal pages
 * 
 * @module controllers/legal.controller
 */

import { getAppConfig } from '../config/app.config.js';
import { getSeoConfig } from '../config/seo.config.js';
import { HTTP_STATUS } from '../core/constants.js';

// ----------------------------------------------------------------------------
// 1. CONSTANTS & HELPERS
// ----------------------------------------------------------------------------

const MAX_SLUG_LENGTH = 100;
const ALLOWED_SLUGS = ['privacy', 'terms', 'cookies', 'disclaimer', 'accessibility', 'security', 'dmca'];

/**
 * Safely normalize a legal document slug
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
    if (normalized.length > MAX_SLUG_LENGTH) {
        return null;
    }

    // Only allow safe characters for slugs
    if (!/^[a-z0-9\-_]+$/.test(normalized)) {
        return null;
    }

    return normalized;
}

/**
 * Build safe view model for legal document
 * @param {Object} options - Options for building the view model
 * @param {Object} options.document - Legal document data
 * @param {string} options.canonicalUrl - Canonical URL
 * @param {string} options.slug - Document slug
 * @returns {Object} Safe view model
 */
function buildLegalViewModel(options = {}) {
    const {
        document = null,
        canonicalUrl = '',
        slug = '',
    } = options;

    const appConfig = getAppConfig();
    const seoConfig = getSeoConfig();

    // Build document data
    const docData = document ? {
        slug: document.slug || slug,
        title: document.title || '',
        content: document.content || '',
        effectiveDate: document.effectiveDate || null,
        updatedAt: document.updatedAt || null,
        version: document.version || null,
    } : null;

    // Build SEO metadata
    const seoTitle = docData?.title || seoConfig.defaultTitle || appConfig.appName || 'Tesnow';
    const seoDescription = docData?.excerpt || seoConfig.defaultDescription || '';

    return {
        page: {
            title: seoTitle,
            description: seoDescription,
            canonicalUrl: canonicalUrl || seoConfig.siteUrl || appConfig.appUrl || '',
            robots: 'index,follow',
        },
        legal: docData,
        structuredData: docData ? {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: docData.title,
            description: seoDescription || undefined,
            url: canonicalUrl || undefined,
            dateModified: docData.updatedAt || docData.effectiveDate || undefined,
        } : null,
    };
}

// ----------------------------------------------------------------------------
// 2. CONTROLLER FACTORY
// ----------------------------------------------------------------------------

/**
 * Factory for creating a legal controller with injected dependencies
 * @param {Object} dependencies - Injected dependencies
 * @param {Object} dependencies.legalService - Legal document service (optional)
 * @param {Object} dependencies.seoService - SEO service (optional)
 * @param {Object} dependencies.analyticsService - Analytics service (optional)
 * @param {Object} dependencies.featureFlagService - Feature flag service (optional)
 * @returns {Object} Controller object with handlers
 */
export function createLegalController(dependencies = {}) {
    const {
        legalService = null,
        seoService = null,
        analyticsService = null,
        featureFlagService = null,
    } = dependencies;

    // --------------------------------------------------------------------------
    // HANDLER: GET /legal/:slug - Display a legal document
    // --------------------------------------------------------------------------

    /**
     * Get legal document by slug
     * @param {import('express').Request} req - Express request
     * @param {import('express').Response} res - Express response
     * @param {import('express').NextFunction} next - Express next function
     */
    async function getLegalDocument(req, res, next) {
        try {
            const seoConfig = getSeoConfig();

            // Validate and normalize slug
            const rawSlug = req.params.slug;
            const normalizedSlug = normalizeSlug(rawSlug);

            if (!normalizedSlug) {
                const error = new Error('Legal document not found');
                error.statusCode = HTTP_STATUS.NOT_FOUND;
                error.code = 'NOT_FOUND';
                error.isOperational = true;
                return next(error);
            }

            // Optional: check feature flag
            let isEnabled = true;
            if (featureFlagService && typeof featureFlagService.isEnabled === 'function') {
                isEnabled = await featureFlagService.isEnabled('legal_pages');
            }
            if (!isEnabled) {
                const error = new Error('Legal pages are currently disabled');
                error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
                error.code = 'SERVICE_UNAVAILABLE';
                error.isOperational = true;
                return next(error);
            }

            // Fetch document from service
            let document = null;

            if (legalService && typeof legalService.getBySlug === 'function') {
                document = await legalService.getBySlug(normalizedSlug);
            } else if (legalService && typeof legalService.findBySlug === 'function') {
                document = await legalService.findBySlug(normalizedSlug);
            }

            // Handle not found
            if (!document) {
                const error = new Error('Legal document not found');
                error.statusCode = HTTP_STATUS.NOT_FOUND;
                error.code = 'NOT_FOUND';
                error.isOperational = true;
                return next(error);
            }

            // Check if document is published
            const isPublished = document.status === 'published';
            if (!isPublished) {
                const error = new Error('Legal document not found');
                error.statusCode = HTTP_STATUS.NOT_FOUND;
                error.code = 'NOT_FOUND';
                error.isOperational = true;
                return next(error);
            }

            // Build canonical URL
            const baseUrl = seoConfig.siteUrl || '';
            const canonicalUrl = `${baseUrl}/legal/${document.slug}`;

            // Build view model
            const viewModel = buildLegalViewModel({
                document,
                canonicalUrl,
                slug: document.slug,
            });

            // Render the view
            res.status(HTTP_STATUS.OK).render('pages/legal/index', viewModel);
        } catch (error) {
            next(error);
        }
    }

    // --------------------------------------------------------------------------
    // HANDLER: GET /privacy - Privacy policy (convenience)
    // --------------------------------------------------------------------------

    /**
     * Convenience handler for privacy policy
     * @param {import('express').Request} req - Express request
     * @param {import('express').Response} res - Express response
     * @param {import('express').NextFunction} next - Express next function
     */
    async function getPrivacy(req, res, next) {
        req.params.slug = 'privacy';
        return getLegalDocument(req, res, next);
    }

    /**
     * Convenience handler for terms of service
     * @param {import('express').Request} req - Express request
     * @param {import('express').Response} res - Express response
     * @param {import('express').NextFunction} next - Express next function
     */
    async function getTerms(req, res, next) {
        req.params.slug = 'terms';
        return getLegalDocument(req, res, next);
    }

    /**
     * Convenience handler for cookie policy
     * @param {import('express').Request} req - Express request
     * @param {import('express').Response} res - Express response
     * @param {import('express').NextFunction} next - Express next function
     */
    async function getCookies(req, res, next) {
        req.params.slug = 'cookies';
        return getLegalDocument(req, res, next);
    }

    // --------------------------------------------------------------------------
    // RETURN CONTROLLER
    // --------------------------------------------------------------------------

    return {
        getLegalDocument,
        getPrivacy,
        getTerms,
        getCookies,
    };
}

// ----------------------------------------------------------------------------
// 3. DEFAULT EXPORT
// ----------------------------------------------------------------------------

// Create default controller instance (with no dependencies)
const defaultController = createLegalController();

export default {
    getLegalDocument: defaultController.getLegalDocument,
    getPrivacy: defaultController.getPrivacy,
    getTerms: defaultController.getTerms,
    getCookies: defaultController.getCookies,
    createLegalController,
};

export const getLegalDocument = defaultController.getLegalDocument;
export const getPrivacy = defaultController.getPrivacy;
export const getTerms = defaultController.getTerms;
export const getCookies = defaultController.getCookies;