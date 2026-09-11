/**
 * server.js
 * Tesnow application entry point
 * Orchestrates configuration validation, server startup, and graceful shutdown
 * 
 * @module server
 */

import { getAppConfig, getServerConfig, validateAppConfig } from './app/config/app.config.js';
import { getDbPool } from './app/config/database.config.js';
import { getSecurityConfig, validateSecurityConfig } from './app/config/security.config.js';
import { getSessionConfig, validateSessionConfig } from './app/config/session.config.js';
import { getFeatureFlagsConfig, validateFeatureFlagsConfig } from './app/config/feature-flags.config.js';
import { getLogger, createChildLogger } from './app/core/logger.js';
import { getDefaultManager, installSignalHandlers, createServerCleanup, createPoolCleanup } from './app/core/shutdown.js';
import app from './app/core/app.js';

// ----------------------------------------------------------------------------
// 1. CONSTANTS
// ----------------------------------------------------------------------------

const EXIT_CODE_SUCCESS = 0;
const EXIT_CODE_STARTUP_FAILURE = 1;
const EXIT_CODE_SHUTDOWN_TIMEOUT = 2;
const SHUTDOWN_FORCE_TIMEOUT_MS = 30000; // 30 seconds

// ----------------------------------------------------------------------------
// 2. LOGGER
// ----------------------------------------------------------------------------

const rootLogger = getLogger();
const logger = createChildLogger({ module: 'server' });

// ----------------------------------------------------------------------------
// 3. CONFIGURATION VALIDATION
// ----------------------------------------------------------------------------

/**
 * Validate all required configurations
 * @throws {Error} If any configuration is invalid
 */
function validateConfigurations() {
    logger.debug('Validating application configuration...');

    // Validate app config
    const appValidation = validateAppConfig();
    if (!appValidation.valid) {
        throw new Error(`Application configuration invalid: ${appValidation.errors.join(', ')}`);
    }
    logger.debug('Application configuration validated');

    // Validate security config
    const securityValidation = validateSecurityConfig();
    if (!securityValidation.valid) {
        throw new Error(`Security configuration invalid: ${securityValidation.errors.join(', ')}`);
    }
    if (securityValidation.warnings && securityValidation.warnings.length > 0) {
        logger.warn({ warnings: securityValidation.warnings }, 'Security configuration warnings');
    }
    logger.debug('Security configuration validated');

    // Validate session config
    const sessionValidation = validateSessionConfig();
    if (!sessionValidation.valid) {
        throw new Error(`Session configuration invalid: ${sessionValidation.errors.join(', ')}`);
    }
    if (sessionValidation.warnings && sessionValidation.warnings.length > 0) {
        logger.warn({ warnings: sessionValidation.warnings }, 'Session configuration warnings');
    }
    logger.debug('Session configuration validated');

    // Validate feature flags config
    const ffValidation = validateFeatureFlagsConfig();
    if (!ffValidation.valid) {
        throw new Error(`Feature flags configuration invalid: ${ffValidation.errors.join(', ')}`);
    }
    if (ffValidation.warnings && ffValidation.warnings.length > 0) {
        logger.warn({ warnings: ffValidation.warnings }, 'Feature flags configuration warnings');
    }
    logger.debug('Feature flags configuration validated');

    logger.info('All configurations validated successfully');
}

// ----------------------------------------------------------------------------
// 4. DATABASE CONNECTION TEST
// ----------------------------------------------------------------------------

/**
 * Test database connectivity
 * @throws {Error} If connection fails
 */
async function testDatabaseConnection() {
    logger.debug('Testing database connectivity...');

    const pool = getDbPool();
    if (!pool || typeof pool.getConnection !== 'function') {
        throw new Error('Database pool is not available');
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.ping();
        logger.debug('Database connection successful');
    } catch (error) {
        logger.error({ err: error }, 'Database connection failed');
        throw new Error(`Database connection failed: ${error.message}`);
    } finally {
        if (connection) {
            try {
                connection.release();
            } catch (releaseError) {
                logger.warn({ err: releaseError }, 'Error releasing test connection');
            }
        }
    }
}

// ----------------------------------------------------------------------------
// 5. SERVER STARTUP
// ----------------------------------------------------------------------------

/**
 * Start the HTTP server
 * @param {import('express').Application} app - Express application
 * @param {Object} serverConfig - Server configuration
 * @returns {Promise<import('http').Server>} HTTP server instance
 */
function startServer(app, serverConfig) {
    return new Promise((resolve, reject) => {
        const { host, port } = serverConfig;

        const server = app.listen(port, host, () => {
            resolve(server);
        });

        server.on('error', (error) => {
            reject(error);
        });
    });
}

// ----------------------------------------------------------------------------
// 6. SHUTDOWN SETUP
// ----------------------------------------------------------------------------

/**
 * Register cleanup handlers with the shutdown manager
 * @param {import('http').Server} server - HTTP server instance
 */
function setupShutdown(server) {
    const shutdownManager = getDefaultManager({
        timeout: SHUTDOWN_FORCE_TIMEOUT_MS,
        logger: logger,
    });

    // Register server cleanup
    shutdownManager.register('http-server', createServerCleanup(server, { gracePeriod: 1000 }), {
        priority: 10, // High priority: stop accepting requests early
    });

    // Register database pool cleanup
    const pool = getDbPool();
    if (pool && typeof pool.end === 'function') {
        shutdownManager.register('database-pool', createPoolCleanup(pool, { gracePeriod: 500 }), {
            priority: 50, // After server stops accepting new connections
        });
    }

    // Install signal handlers
    installSignalHandlers(shutdownManager, {
        signals: ['SIGINT', 'SIGTERM'],
        onSignal: (signal) => {
            logger.info({ signal }, `Received ${signal}, initiating graceful shutdown`);
        },
    });

    // Handle uncaught exceptions and unhandled rejections
    process.on('uncaughtException', (error) => {
        logger.fatal({ err: error }, 'Uncaught exception');
        shutdownManager.shutdown('uncaughtException', { throwOnError: false })
            .then(() => {
                process.exit(EXIT_CODE_STARTUP_FAILURE);
            })
            .catch(() => {
                process.exit(EXIT_CODE_STARTUP_FAILURE);
            });
    });

    process.on('unhandledRejection', (reason) => {
        logger.fatal({ err: reason }, 'Unhandled rejection');
        shutdownManager.shutdown('unhandledRejection', { throwOnError: false })
            .then(() => {
                process.exit(EXIT_CODE_STARTUP_FAILURE);
            })
            .catch(() => {
                process.exit(EXIT_CODE_STARTUP_FAILURE);
            });
    });

    return shutdownManager;
}

// ----------------------------------------------------------------------------
// 7. MAIN ENTRY POINT
// ----------------------------------------------------------------------------

/**
 * Bootstrap the application
 */
async function main() {
    try {
        // Log startup banner
        logger.info('🚀 Starting Tesnow application...');

        // 1. Validate configurations
        validateConfigurations();

        // 2. Test database connectivity
        await testDatabaseConnection();

        // 3. Get server configuration
        const appConfig = getAppConfig();
        const serverConfig = getServerConfig();

        // 4. Start HTTP server
        logger.info({ host: serverConfig.host, port: serverConfig.port }, 'Starting HTTP server...');
        const server = await startServer(app, serverConfig);

        // 5. Setup graceful shutdown
        const shutdownManager = setupShutdown(server);

        // 6. Log successful startup
        const nodeVersion = process.version;
        const pid = process.pid;
        const environment = appConfig.nodeEnv;

        logger.info({
            appName: appConfig.appName,
            environment,
            host: serverConfig.host,
            port: serverConfig.port,
            nodeVersion,
            pid,
            startupTimestamp: new Date().toISOString(),
        }, '✅ Tesnow server started successfully');

        // Store shutdown manager for potential later use (e.g., health checks)
        global.__tesnowShutdownManager = shutdownManager;

        // Keep process alive
        // The server will keep the process alive, and shutdown handlers handle termination.

    } catch (error) {
        // Fatal startup error
        logger.fatal({ err: error }, '❌ Failed to start Tesnow server');

        // Attempt to clean up any resources that might have been partially initialized
        try {
            const pool = getDbPool();
            if (pool && typeof pool.end === 'function') {
                await pool.end();
            }
        } catch (cleanupError) {
            // Ignore cleanup errors during startup failure
        }

        process.exit(EXIT_CODE_STARTUP_FAILURE);
    }
}

// ----------------------------------------------------------------------------
// 8. EXECUTE
// ----------------------------------------------------------------------------

// Run the main function
main();

// ----------------------------------------------------------------------------
// 9. EXPORTS (for testing purposes only)
// ----------------------------------------------------------------------------

export { main };