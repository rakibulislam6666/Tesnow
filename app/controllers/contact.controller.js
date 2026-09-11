/**
 * app/controllers/contact.controller.js
 * Public contact page controller for Tesnow
 * Handles contact form display and submission
 * 
 * @module controllers/contact.controller
 */

import { getAppConfig } from '../config/app.config.js';
import { getSeoConfig } from '../config/seo.config.js';
import { HTTP_STATUS } from '../core/constants.js';

// ----------------------------------------------------------------------------
// 1. CONSTANTS & HELPERS
// ----------------------------------------------------------------------------

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 255;
const MAX_SUBJECT_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_SAFE_STRING_LENGTH = 5000;

/**
 * Safely trim and validate a string field
 * @param {*} value - Input value
 * @param {number} maxLength - Maximum allowed length
 * @param {string} fieldName - Field name for error messages
 * @returns {string|null} Trimmed string or null if invalid
 */
function validateStringField(value, maxLength, fieldName) {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
        return null;
    }

    // Reject control characters (except allowed whitespace)
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(trimmed)) {
        return null;
    }

    // Reject CR/LF in fields that shouldn't have line breaks (name, email, subject)
    if (fieldName !== 'message' && (trimmed.includes('\n') || trimmed.includes('\r'))) {
        return null;
    }

    if (trimmed.length > maxLength) {
        return null;
    }

    return trimmed;
}

/**
 * Validate email format
 * @param {string} email - Email string
 * @returns {boolean} True if valid
 */
function isValidEmail(email) {
    // Simple but robust email validation
    // Allow Unicode and common patterns
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email);
}

/**
 * Sanitize message content (preserve line breaks, strip dangerous control chars)
 * @param {string} message - Raw message
 * @returns {string|null} Sanitized message or null
 */
function sanitizeMessage(message) {
    if (typeof message !== 'string') {
        return null;
    }

    const trimmed = message.trim();

    if (trimmed.length === 0) {
        return null;
    }

    // Remove null bytes and control characters except newlines and tabs
    const sanitized = trimmed.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    if (sanitized.length === 0) {
        return null;
    }

    if (sanitized.length > MAX_MESSAGE_LENGTH) {
        return sanitized.substring(0, MAX_MESSAGE_LENGTH);
    }

    return sanitized;
}

/**
 * Build safe view model for contact page
 * @param {Object} options - Options for building the view model
 * @param {Object} options.formData - Previously submitted form data (for error re-render)
 * @param {Object} options.errors - Validation errors
 * @param {string} options.status - Form status: 'idle', 'success', 'error'
 * @param {string} options.canonicalUrl - Canonical URL
 * @param {string} options.successMessage - Success message
 * @param {string} options.errorMessage - Error message
 * @returns {Object} Safe view model
 */
function buildContactViewModel(options = {}) {
    const {
        formData = {},
        errors = {},
        status = 'idle',
        canonicalUrl = '',
        successMessage = '',
        errorMessage = '',
    } = options;

    const appConfig = getAppConfig();
    const seoConfig = getSeoConfig();

    return {
        page: {
            title: `Contact${seoConfig.titleSuffix || ''}`,
            description: 'Get in touch with us',
            canonicalUrl: canonicalUrl || seoConfig.siteUrl || appConfig.appUrl || '',
            robots: 'index,follow',
        },
        form: {
            values: {
                name: formData.name || '',
                email: formData.email || '',
                subject: formData.subject || '',
                message: formData.message || '',
            },
            errors: {
                name: errors.name || null,
                email: errors.email || null,
                subject: errors.subject || null,
                message: errors.message || null,
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
 * Factory for creating a contact controller with injected dependencies
 * @param {Object} dependencies - Injected dependencies
 * @param {Object} dependencies.contactService - Contact service (optional)
 * @param {Object} dependencies.seoService - SEO service (optional)
 * @param {Object} dependencies.captchaService - CAPTCHA service (optional)
 * @param {Object} dependencies.analyticsService - Analytics service (optional)
 * @param {Object} dependencies.featureFlagService - Feature flag service (optional)
 * @returns {Object} Controller object with handlers
 */
export function createContactController(dependencies = {}) {
    const {
        contactService = null,
        seoService = null,
        captchaService = null,
        analyticsService = null,
        featureFlagService = null,
    } = dependencies;

    // --------------------------------------------------------------------------
    // HANDLER: GET /contact - Display contact page
    // --------------------------------------------------------------------------

    /**
     * Render contact page
     * @param {import('express').Request} req - Express request
     * @param {import('express').Response} res - Express response
     * @param {import('express').NextFunction} next - Express next function
     */
    async function getContact(req, res, next) {
        try {
            const seoConfig = getSeoConfig();
            const baseUrl = seoConfig.siteUrl || '';
            const canonicalUrl = `${baseUrl}/contact`;

            const viewModel = buildContactViewModel({
                canonicalUrl,
                status: 'idle',
            });

            res.status(HTTP_STATUS.OK).render('pages/contact/index', viewModel);
        } catch (error) {
            next(error);
        }
    }

    // --------------------------------------------------------------------------
    // HANDLER: POST /contact - Submit contact form
    // --------------------------------------------------------------------------

    /**
     * Handle contact form submission
     * @param {import('express').Request} req - Express request
     * @param {import('express').Response} res - Express response
     * @param {import('express').NextFunction} next - Express next function
     */
    async function postContact(req, res, next) {
        try {
            const seoConfig = getSeoConfig();
            const baseUrl = seoConfig.siteUrl || '';
            const canonicalUrl = `${baseUrl}/contact`;

            // 1. Extract and validate input
            const { name, email, subject, message } = req.body;

            const errors = {};
            let hasErrors = false;

            // Validate name
            const validatedName = validateStringField(name, MAX_NAME_LENGTH, 'name');
            if (!validatedName) {
                errors.name = 'Name is required and must be valid';
                hasErrors = true;
            }

            // Validate email
            let validatedEmail = null;
            if (typeof email === 'string' && email.trim().length > 0) {
                const trimmed = email.trim();
                if (trimmed.length > MAX_EMAIL_LENGTH) {
                    errors.email = 'Email is too long';
                    hasErrors = true;
                } else if (!isValidEmail(trimmed)) {
                    errors.email = 'Please enter a valid email address';
                    hasErrors = true;
                } else {
                    validatedEmail = trimmed;
                }
            } else {
                errors.email = 'Email is required';
                hasErrors = true;
            }

            // Validate subject
            const validatedSubject = validateStringField(subject, MAX_SUBJECT_LENGTH, 'subject');
            if (!validatedSubject) {
                errors.subject = 'Subject is required and must be valid';
                hasErrors = true;
            }

            // Validate message
            const validatedMessage = sanitizeMessage(message);
            if (!validatedMessage) {
                errors.message = 'Message is required and must be valid';
                hasErrors = true;
            }

            // If validation errors, re-render with errors
            if (hasErrors) {
                const viewModel = buildContactViewModel({
                    formData: {
                        name: validatedName || name || '',
                        email: validatedEmail || email || '',
                        subject: validatedSubject || subject || '',
                        message: validatedMessage || message || '',
                    },
                    errors,
                    status: 'error',
                    canonicalUrl,
                    errorMessage: 'Please correct the highlighted fields.',
                });
                return res.status(HTTP_STATUS.BAD_REQUEST).render('pages/contact/index', viewModel);
            }

            // 2. Check feature flag (optional)
            let isEnabled = true;
            if (featureFlagService && typeof featureFlagService.isEnabled === 'function') {
                isEnabled = await featureFlagService.isEnabled('contact_form');
            }
            if (!isEnabled) {
                const viewModel = buildContactViewModel({
                    status: 'error',
                    canonicalUrl,
                    errorMessage: 'Contact form is currently disabled. Please try again later.',
                });
                return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).render('pages/contact/index', viewModel);
            }

            // 3. CAPTCHA verification (if available)
            let captchaPassed = true;
            if (captchaService && typeof captchaService.verify === 'function') {
                try {
                    captchaPassed = await captchaService.verify(req.body['cf-turnstile-response'] || req.body['g-recaptcha-response']);
                } catch (_) {
                    captchaPassed = false;
                }
                if (!captchaPassed) {
                    const viewModel = buildContactViewModel({
                        formData: {
                            name: validatedName,
                            email: validatedEmail,
                            subject: validatedSubject,
                            message: validatedMessage,
                        },
                        errors: {
                            captcha: 'Please complete the CAPTCHA verification.',
                        },
                        status: 'error',
                        canonicalUrl,
                        errorMessage: 'CAPTCHA verification failed. Please try again.',
                    });
                    return res.status(HTTP_STATUS.BAD_REQUEST).render('pages/contact/index', viewModel);
                }
            }

            // 4. Submit to contact service
            let submitSuccess = false;
            let submitError = null;

            if (contactService && typeof contactService.submit === 'function') {
                const payload = {
                    name: validatedName,
                    email: validatedEmail,
                    subject: validatedSubject,
                    message: validatedMessage,
                    ip: req.ip || req.connection?.remoteAddress,
                    userAgent: req.headers['user-agent'],
                    requestId: req.id || null,
                };
                try {
                    await contactService.submit(payload);
                    submitSuccess = true;
                } catch (error) {
                    submitError = error;
                }
            } else {
                // Service not available - treat as error
                submitError = new Error('Contact service not available');
            }

            // 5. Handle submission result
            if (submitSuccess) {
                // Track analytics (optional)
                if (analyticsService && typeof analyticsService.trackEvent === 'function') {
                    try {
                        await analyticsService.trackEvent('contact_submission', {
                            source: 'contact_form',
                            success: true,
                        });
                    } catch (_) {
                        // Ignore analytics errors
                    }
                }

                // Success - render with success state
                const viewModel = buildContactViewModel({
                    status: 'success',
                    canonicalUrl,
                    successMessage: 'Your message has been sent. We\'ll get back to you soon.',
                });
                return res.status(HTTP_STATUS.OK).render('pages/contact/index', viewModel);
            } else {
                // Submission failed - render error
                if (analyticsService && typeof analyticsService.trackEvent === 'function') {
                    try {
                        await analyticsService.trackEvent('contact_submission', {
                            source: 'contact_form',
                            success: false,
                        });
                    } catch (_) {}
                }

                // Use generic error message; log internal error without exposing
                const viewModel = buildContactViewModel({
                    formData: {
                        name: validatedName,
                        email: validatedEmail,
                        subject: validatedSubject,
                        message: validatedMessage,
                    },
                    status: 'error',
                    canonicalUrl,
                    errorMessage: 'Unable to send your message. Please try again later.',
                });
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render('pages/contact/index', viewModel);
            }
        } catch (error) {
            // Unexpected error - forward to centralized handler
            next(error);
        }
    }

    // --------------------------------------------------------------------------
    // RETURN CONTROLLER
    // --------------------------------------------------------------------------

    return {
        getContact,
        postContact,
    };
}

// ----------------------------------------------------------------------------
// 3. DEFAULT EXPORT
// ----------------------------------------------------------------------------

// Create default controller instance (with no dependencies)
const defaultController = createContactController();

export default {
    getContact: defaultController.getContact,
    postContact: defaultController.postContact,
    createContactController,
};

export const getContact = defaultController.getContact;
export const postContact = defaultController.postContact;