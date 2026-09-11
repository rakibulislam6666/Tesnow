/**
 * app/controllers/newsletter.controller.js
 * Public newsletter controller for Tesnow
 * Handles subscription and unsubscription workflows
 * 
 * @module controllers/newsletter.controller
 */

import { getAppConfig } from '../config/app.config.js';
import { getSeoConfig } from '../config/seo.config.js';
import { HTTP_STATUS } from '../core/constants.js';

// ----------------------------------------------------------------------------
// 1. CONSTANTS & HELPERS
// ----------------------------------------------------------------------------

const MAX_EMAIL_LENGTH = 255;
const MAX_NAME_LENGTH = 100;
const MAX_TOKEN_LENGTH = 255;

/**
 * Safely trim and validate an email address
 * @param {*} value - Input email
 * @returns {string|null} Normalized email or null if invalid
 */
function normalizeEmail(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
        return null;
    }

    // Reject control characters and CR/LF
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
        return null;
    }

    if (trimmed.length > MAX_EMAIL_LENGTH) {
        return null;
    }

    // Basic email format validation (allow Unicode)
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!emailRegex.test(trimmed)) {
        return null;
    }

    return trimmed;
}

/**
 * Safely validate a token (unsubscribe/confirmation)
 * @param {*} value - Input token
 * @returns {string|null} Normalized token or null if invalid
 */
function normalizeToken(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
        return null;
    }

    // Reject control characters
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
        return null;
    }

    if (trimmed.length > MAX_TOKEN_LENGTH) {
        return null;
    }

    // Only allow safe characters (alphanumeric, dash, underscore, dot)
    if (!/^[a-zA-Z0-9\-_.]+$/.test(trimmed)) {
        return null;
    }

    return trimmed;
}

/**
 * Build safe view model for newsletter page
 * @param {Object} options - Options for building the view model
 * @param {string} options.status - Form status: 'idle', 'success', 'error'
 * @param {string} options.successMessage - Success message
 * @param {string} options.errorMessage - Error message
 * @param {string} options.canonicalUrl - Canonical URL
 * @param {Object} options.formData - Previously submitted form data (for error re-render)
 * @returns {Object} Safe view model
 */
function buildNewsletterViewModel(options = {}) {
    const {
        status = 'idle',
        successMessage = '',
        errorMessage = '',
        canonicalUrl = '',
        formData = {},
    } = options;

    const appConfig = getAppConfig();
    const seoConfig = getSeoConfig();

    return {
        page: {
            title: `Newsletter${seoConfig.titleSuffix || ''}`,
            description: 'Subscribe to our newsletter for updates and insights',
            canonicalUrl: canonicalUrl || seoConfig.siteUrl || appConfig.appUrl || '',
            robots: 'index,follow',
        },
        form: {
            values: {
                email: formData.email || '',
                name: formData.name || '',
            },
            status: status,
            successMessage: successMessage || null,
            errorMessage: errorMessage || null,
        },
    };
}

// ----------------------------------------------------------------------------
// 2. CONTROLLER FACTORY
// ----------------------------------------------------------------------------

/**
 * Factory for creating a newsletter controller with injected dependencies
 * @param {Object} dependencies - Injected dependencies
 * @param {Object} dependencies.newsletterService - Newsletter service (optional)
 * @param {Object} dependencies.seoService - SEO service (optional)
 * @param {Object} dependencies.captchaService - CAPTCHA service (optional)
 * @param {Object} dependencies.analyticsService - Analytics service (optional)
 * @param {Object} dependencies.featureFlagService - Feature flag service (optional)
 * @returns {Object} Controller object with handlers
 */
export function createNewsletterController(dependencies = {}) {
    const {
        newsletterService = null,
        seoService = null,
        captchaService = null,
        analyticsService = null,
        featureFlagService = null,
    } = dependencies;

    // --------------------------------------------------------------------------
    // HANDLER: GET /newsletter - Display newsletter page
    // --------------------------------------------------------------------------

    /**
     * Render newsletter page
     * @param {import('express').Request} req - Express request
     * @param {import('express').Response} res - Express response
     * @param {import('express').NextFunction} next - Express next function
     */
    async function getNewsletter(req, res, next) {
        try {
            const seoConfig = getSeoConfig();
            const baseUrl = seoConfig.siteUrl || '';
            const canonicalUrl = `${baseUrl}/newsletter`;

            const viewModel = buildNewsletterViewModel({
                canonicalUrl,
                status: 'idle',
            });

            res.status(HTTP_STATUS.OK).render('pages/newsletter/index', viewModel);
        } catch (error) {
            next(error);
        }
    }

    // --------------------------------------------------------------------------
    // HANDLER: POST /newsletter/subscribe - Subscribe to newsletter
    // --------------------------------------------------------------------------

    /**
     * Handle newsletter subscription
     * @param {import('express').Request} req - Express request
     * @param {import('express').Response} res - Express response
     * @param {import('express').NextFunction} next - Express next function
     */
    async function postSubscribe(req, res, next) {
        try {
            const seoConfig = getSeoConfig();
            const baseUrl = seoConfig.siteUrl || '';
            const canonicalUrl = `${baseUrl}/newsletter`;

            // 1. Extract and validate email
            const email = normalizeEmail(req.body.email);
            if (!email) {
                const viewModel = buildNewsletterViewModel({
                    status: 'error',
                    canonicalUrl,
                    errorMessage: 'Please enter a valid email address.',
                    formData: { email: req.body.email || '' },
                });
                return res.status(HTTP_STATUS.BAD_REQUEST).render('pages/newsletter/index', viewModel);
            }

            // 2. Optional: validate name if provided
            let name = null;
            if (req.body.name && typeof req.body.name === 'string') {
                const trimmed = req.body.name.trim();
                if (trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH) {
                    name = trimmed;
                }
            }

            // 3. Check feature flag (optional)
            let isEnabled = true;
            if (featureFlagService && typeof featureFlagService.isEnabled === 'function') {
                isEnabled = await featureFlagService.isEnabled('newsletter');
            }
            if (!isEnabled) {
                const viewModel = buildNewsletterViewModel({
                    status: 'error',
                    canonicalUrl,
                    errorMessage: 'Newsletter is currently disabled. Please try again later.',
                });
                return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).render('pages/newsletter/index', viewModel);
            }

            // 4. CAPTCHA verification (if available)
            let captchaPassed = true;
            if (captchaService && typeof captchaService.verify === 'function') {
                try {
                    captchaPassed = await captchaService.verify(req.body['cf-turnstile-response'] || req.body['g-recaptcha-response']);
                } catch (_) {
                    captchaPassed = false;
                }
                if (!captchaPassed) {
                    const viewModel = buildNewsletterViewModel({
                        status: 'error',
                        canonicalUrl,
                        errorMessage: 'CAPTCHA verification failed. Please try again.',
                        formData: { email, name: name || '' },
                    });
                    return res.status(HTTP_STATUS.BAD_REQUEST).render('pages/newsletter/index', viewModel);
                }
            }

            // 5. Submit to newsletter service
            let submitSuccess = false;
            let submitError = null;

            if (newsletterService && typeof newsletterService.subscribe === 'function') {
                const payload = {
                    email,
                    name,
                    ip: req.ip || req.connection?.remoteAddress,
                    userAgent: req.headers['user-agent'],
                    requestId: req.id || null,
                };
                try {
                    await newsletterService.subscribe(payload);
                    submitSuccess = true;
                } catch (error) {
                    submitError = error;
                }
            } else {
                // Service not available - treat as error
                submitError = new Error('Newsletter service not available');
            }

            // 6. Handle result
            if (submitSuccess) {
                // Track analytics (optional)
                if (analyticsService && typeof analyticsService.trackEvent === 'function') {
                    try {
                        await analyticsService.trackEvent('newsletter_subscription', {
                            source: 'newsletter_page',
                            success: true,
                        });
                    } catch (_) {}
                }

                const viewModel = buildNewsletterViewModel({
                    status: 'success',
                    canonicalUrl,
                    successMessage: 'Thank you for subscribing! Please check your email to confirm your subscription.',
                });
                return res.status(HTTP_STATUS.OK).render('pages/newsletter/index', viewModel);
            } else {
                // Submission failed - render error
                if (analyticsService && typeof analyticsService.trackEvent === 'function') {
                    try {
                        await analyticsService.trackEvent('newsletter_subscription', {
                            source: 'newsletter_page',
                            success: false,
                        });
                    } catch (_) {}
                }

                const viewModel = buildNewsletterViewModel({
                    status: 'error',
                    canonicalUrl,
                    errorMessage: 'Unable to subscribe at this time. Please try again later.',
                    formData: { email, name: name || '' },
                });
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render('pages/newsletter/index', viewModel);
            }
        } catch (error) {
            next(error);
        }
    }

    // --------------------------------------------------------------------------
    // HANDLER: POST /newsletter/unsubscribe - Unsubscribe from newsletter
    // --------------------------------------------------------------------------

    /**
     * Handle newsletter unsubscription
     * @param {import('express').Request} req - Express request
     * @param {import('express').Response} res - Express response
     * @param {import('express').NextFunction} next - Express next function
     */
    async function postUnsubscribe(req, res, next) {
        try {
            const seoConfig = getSeoConfig();
            const baseUrl = seoConfig.siteUrl || '';
            const canonicalUrl = `${baseUrl}/newsletter`;

            // 1. Extract and validate input
            // Support both email and token-based unsubscribe
            const email = normalizeEmail(req.body.email);
            const token = normalizeToken(req.body.token);

            // Must provide either email or token
            if (!email && !token) {
                const viewModel = buildNewsletterViewModel({
                    status: 'error',
                    canonicalUrl,
                    errorMessage: 'Please provide your email address or unsubscribe token.',
                });
                return res.status(HTTP_STATUS.BAD_REQUEST).render('pages/newsletter/index', viewModel);
            }

            // 2. Check feature flag (optional)
            let isEnabled = true;
            if (featureFlagService && typeof featureFlagService.isEnabled === 'function') {
                isEnabled = await featureFlagService.isEnabled('newsletter');
            }
            if (!isEnabled) {
                const viewModel = buildNewsletterViewModel({
                    status: 'error',
                    canonicalUrl,
                    errorMessage: 'Newsletter is currently disabled. Please try again later.',
                });
                return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).render('pages/newsletter/index', viewModel);
            }

            // 3. Submit to newsletter service
            let submitSuccess = false;
            let submitError = null;

            if (newsletterService && typeof newsletterService.unsubscribe === 'function') {
                const payload = {
                    email,
                    token,
                    ip: req.ip || req.connection?.remoteAddress,
                    userAgent: req.headers['user-agent'],
                    requestId: req.id || null,
                };
                try {
                    await newsletterService.unsubscribe(payload);
                    submitSuccess = true;
                } catch (error) {
                    submitError = error;
                }
            } else {
                submitError = new Error('Newsletter service not available');
            }

            // 4. Handle result
            if (submitSuccess) {
                if (analyticsService && typeof analyticsService.trackEvent === 'function') {
                    try {
                        await analyticsService.trackEvent('newsletter_unsubscription', {
                            source: 'newsletter_page',
                            success: true,
                        });
                    } catch (_) {}
                }

                const viewModel = buildNewsletterViewModel({
                    status: 'success',
                    canonicalUrl,
                    successMessage: 'You have been unsubscribed from our newsletter.',
                });
                return res.status(HTTP_STATUS.OK).render('pages/newsletter/index', viewModel);
            } else {
                if (analyticsService && typeof analyticsService.trackEvent === 'function') {
                    try {
                        await analyticsService.trackEvent('newsletter_unsubscription', {
                            source: 'newsletter_page',
                            success: false,
                        });
                    } catch (_) {}
                }

                // Generic error message (avoid enumeration)
                const viewModel = buildNewsletterViewModel({
                    status: 'error',
                    canonicalUrl,
                    errorMessage: 'Unable to process your request. Please try again later.',
                });
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render('pages/newsletter/index', viewModel);
            }
        } catch (error) {
            next(error);
        }
    }

    // --------------------------------------------------------------------------
    // RETURN CONTROLLER
    // --------------------------------------------------------------------------

    return {
        getNewsletter,
        postSubscribe,
        postUnsubscribe,
    };
}

// ----------------------------------------------------------------------------
// 3. DEFAULT EXPORT
// ----------------------------------------------------------------------------

// Create default controller instance (with no dependencies)
const defaultController = createNewsletterController();

export default {
    getNewsletter: defaultController.getNewsletter,
    postSubscribe: defaultController.postSubscribe,
    postUnsubscribe: defaultController.postUnsubscribe,
    createNewsletterController,
};

export const getNewsletter = defaultController.getNewsletter;
export const postSubscribe = defaultController.postSubscribe;
export const postUnsubscribe = defaultController.postUnsubscribe;