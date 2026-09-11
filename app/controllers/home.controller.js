/**
 * app/controllers/home.controller.js
 * Homepage controller for Tesnow
 * Renders the main landing page
 * 
 * @module controllers/home.controller
 */

import { getAppConfig } from '../config/app.config.js';
import { getSeoConfig } from '../config/seo.config.js';

/**
 * Homepage controller handler
 * Renders the homepage with appropriate view model
 * 
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
export async function home(req, res, next) {
    try {
        // Get configuration for the view model
        const appConfig = getAppConfig();
        const seoConfig = getSeoConfig();

        // Build the view model
        const viewModel = {
            page: {
                title: seoConfig.defaultTitle || appConfig.appName || 'Tesnow',
                description: seoConfig.defaultDescription || '',
                canonicalUrl: seoConfig.siteUrl || appConfig.appUrl || '',
                robots: seoConfig.robots?.directive || 'index,follow',
            },
            // These will be populated by the service layer in the future
            featuredPosts: [],
            latestPosts: [],
            categories: [],
            pagination: null,
        };

        // Render the homepage view
        res.status(200).render('pages/home/index', viewModel);
    } catch (error) {
        // Forward any unexpected errors to the global error handler
        next(error);
    }
}

/**
 * Factory for creating a home controller with injected dependencies
 * @param {Object} dependencies - Injected dependencies
 * @param {Object} dependencies.homeService - Home service (optional)
 * @returns {Object} Controller object with home handler
 */
export function createHomeController(dependencies = {}) {
    // In the future, we can destructure and use the injected service
    // const { homeService } = dependencies;

    return {
        home,
    };
}

// Default export for consistency with existing controller pattern
export default {
    home,
};