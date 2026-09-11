/**
 * app/config/index.js
 * Centralized configuration entry point for Tesnow
 * Aggregates and re-exports all configuration modules
 * 
 * @module config/index
 */

// Import configuration modules
import appConfig from './app.config.js';
import databaseConfig from './database.config.js';
import securityConfig from './security.config.js';
import sessionConfig from './session.config.js';
import emailConfig from './email.config.js';
import storageConfig from './storage.config.js';
import cacheConfig from './cache.config.js';
import apiConfig from './api.config.js';
import seoConfig from './seo.config.js';
import analyticsConfig from './analytics.config.js';
import uploadConfig from './upload.config.js';
import queueConfig from './queue.config.js';
import monitoringConfig from './monitoring.config.js';
import oauthConfig from './oauth.config.js';
import paymentConfig from './payment.config.js';
import featureFlagsConfig from './feature-flags.config.js';

// ----------------------------------------------------------------------------
// 2. NAMED EXPORTS
// ----------------------------------------------------------------------------

// Export each configuration module as a named export
export {
    appConfig,
    databaseConfig,
    securityConfig,
    sessionConfig,
    emailConfig,
    storageConfig,
    cacheConfig,
    apiConfig,
    seoConfig,
    analyticsConfig,
    uploadConfig,
    queueConfig,
    monitoringConfig,
    oauthConfig,
    paymentConfig,
    featureFlagsConfig,
};

// Also export any named helpers from each module if needed
// (The default objects already contain the public API, so we don't need to
// individually re-export each helper function.)

// ----------------------------------------------------------------------------
// 3. DEFAULT EXPORT
// ----------------------------------------------------------------------------

/**
 * Combined configuration object
 * @property {Object} app - Application configuration
 * @property {Object} database - Database configuration
 * @property {Object} security - Security configuration
 * @property {Object} session - Session configuration
 * @property {Object} email - Email/SMTP configuration
 * @property {Object} storage - Storage configuration
 * @property {Object} cache - Cache configuration
 * @property {Object} api - API configuration
 * @property {Object} seo - SEO configuration
 * @property {Object} analytics - Analytics configuration
 * @property {Object} upload - Upload configuration
 * @property {Object} queue - Queue configuration
 * @property {Object} monitoring - Monitoring configuration
 * @property {Object} oauth - OAuth configuration
 * @property {Object} payment - Payment configuration
 * @property {Object} featureFlags - Feature flags configuration
 */
const combinedConfig = {
    app: appConfig,
    database: databaseConfig,
    security: securityConfig,
    session: sessionConfig,
    email: emailConfig,
    storage: storageConfig,
    cache: cacheConfig,
    api: apiConfig,
    seo: seoConfig,
    analytics: analyticsConfig,
    upload: uploadConfig,
    queue: queueConfig,
    monitoring: monitoringConfig,
    oauth: oauthConfig,
    payment: paymentConfig,
    featureFlags: featureFlagsConfig,
};

// Freeze to prevent mutation
Object.freeze(combinedConfig);

// Deep freeze nested objects (but skip functions like getDbPool, etc.)
// We'll rely on individual config modules to freeze their own exports.

export default combinedConfig;

// ----------------------------------------------------------------------------
// 4. UTILITY FUNCTIONS
// ----------------------------------------------------------------------------

/**
 * Collect validation results from all configuration modules that provide a validate function
 * @returns {Object} Validation result with errors and warnings
 */
export function validateAllConfig() {
    const allErrors = [];
    const allWarnings = [];
    const configs = {
        app: appConfig,
        database: databaseConfig,
        security: securityConfig,
        session: sessionConfig,
        email: emailConfig,
        storage: storageConfig,
        cache: cacheConfig,
        api: apiConfig,
        seo: seoConfig,
        analytics: analyticsConfig,
        upload: uploadConfig,
        queue: queueConfig,
        monitoring: monitoringConfig,
        oauth: oauthConfig,
        payment: paymentConfig,
        featureFlags: featureFlagsConfig,
    };

    for (const [name, config] of Object.entries(configs)) {
        if (config && typeof config.validateConfig === 'function') {
            try {
                const result = config.validateConfig();
                if (!result.valid) {
                    allErrors.push({ module: name, errors: result.errors });
                }
                if (result.warnings && result.warnings.length > 0) {
                    allWarnings.push({ module: name, warnings: result.warnings });
                }
            } catch (error) {
                allErrors.push({ module: name, error: error.message });
            }
        }
    }

    return {
        valid: allErrors.length === 0,
        errors: allErrors,
        warnings: allWarnings,
    };
}

/**
 * Get a safe, non-sensitive representation of all configuration
 * @returns {Object} Safe configuration for logging/diagnostics
 */
export function getSafeConfig() {
    const safe = {};

    const configs = {
        app: appConfig,
        database: databaseConfig,
        security: securityConfig,
        session: sessionConfig,
        email: emailConfig,
        storage: storageConfig,
        cache: cacheConfig,
        api: apiConfig,
        seo: seoConfig,
        analytics: analyticsConfig,
        upload: uploadConfig,
        queue: queueConfig,
        monitoring: monitoringConfig,
        oauth: oauthConfig,
        payment: paymentConfig,
        featureFlags: featureFlagsConfig,
    };

    for (const [name, config] of Object.entries(configs)) {
        if (config && typeof config.getSafeConfig === 'function') {
            try {
                safe[name] = config.getSafeConfig();
            } catch {
                // If getSafeConfig fails, fall back to a safe default
                safe[name] = { error: 'Unable to retrieve safe config' };
            }
        } else if (config && typeof config.getSafe === 'function') {
            // Some modules might use getSafe (e.g., cache, queue)
            try {
                safe[name] = config.getSafe();
            } catch {
                safe[name] = { error: 'Unable to retrieve safe config' };
            }
        } else {
            // For modules without a safe getter, omit sensitive data
            safe[name] = { available: true };
        }
    }

    return safe;
}