/**
 * app/controllers/health.controller.js
 * Health, liveness, readiness, and status endpoints
 * 
 * @module controllers/health.controller
 */

import { getAppConfig, getServerConfig } from '../config/app.config.js';
import { getDbPool } from '../config/database.config.js';
import { getRequestId, getRequestContext } from '../core/request-context.js';
import { sendSuccess, sendError } from '../core/response.js';
import { getLogger, createChildLogger } from '../core/logger.js';

// ----------------------------------------------------------------------------
// 1. HELPERS
// ----------------------------------------------------------------------------

/**
 * Get safe request ID from context or fallback
 * @param {import('express').Request} req - Express request
 * @returns {string} Request ID
 */
function getRequestIdSafe(req) {
    return getRequestId() || req.id || 'unknown';
}

// ----------------------------------------------------------------------------
// 2. CONTROLLER FACTORY
// ----------------------------------------------------------------------------

/**
 * Factory for creating a health controller with injected dependencies
 * @param {Object} dependencies - Injected dependencies
 * @param {Object} dependencies.appConfig - Application configuration (optional)
 * @param {Object} dependencies.serverConfig - Server configuration (optional)
 * @param {Object} dependencies.dbPool - Database pool (optional)
 * @param {Function} dependencies.getLogger - Logger getter (optional)
 * @param {Function} dependencies.getRequestId - Request ID getter (optional)
 * @param {Function} dependencies.sendSuccess - Success response helper (optional)
 * @param {Function} dependencies.sendError - Error response helper (optional)
 * @returns {Object} Controller object with handlers
 */
export function createHealthController(dependencies = {}) {
    const {
        appConfig: injectedAppConfig = null,
        serverConfig: injectedServerConfig = null,
        dbPool: injectedDbPool = null,
        getLogger: injectedGetLogger = null,
        getRequestId: injectedGetRequestId = null,
        sendSuccess: injectedSendSuccess = null,
        sendError: injectedSendError = null,
    } = dependencies;

    // Use injected or fallback to default imports
    const appConfig = injectedAppConfig || getAppConfig();
    const serverConfig = injectedServerConfig || getServerConfig();
    const dbPool = injectedDbPool || getDbPool();
    const getRequestIdFn = injectedGetRequestId || getRequestId;
    const sendSuccessFn = injectedSendSuccess || sendSuccess;
    const sendErrorFn = injectedSendError || sendError;
    const logger = injectedGetLogger ? injectedGetLogger() : getLogger();
    const log = createChildLogger({ module: 'health-controller' });

    // --------------------------------------------------------------------------
    // HANDLER: GET /health - Basic application health
    // --------------------------------------------------------------------------

    /**
     * Basic health endpoint
     * @param {import('express').Request} req - Express request
     * @param {import('express').Response} res - Express response
     * @param {import('express').NextFunction} next - Express next function
     */
    function health(req, res, next) {
        try {
            const requestId = getRequestIdSafe(req);
            const config = appConfig;
            const server = serverConfig;

            sendSuccessFn(res, {
                data: {
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    environment: config.nodeEnv,
                    version: config.appVersion || '1.0.0',
                },
                message: 'Application is healthy',
                meta: { requestId },
            });
        } catch (error) {
            next(error);
        }
    }

    // --------------------------------------------------------------------------
    // HANDLER: GET /live - Liveness probe
    // --------------------------------------------------------------------------

    /**
     * Liveness endpoint - process aliveness
     * @param {import('express').Request} req - Express request
     * @param {import('express').Response} res - Express response
     * @param {import('express').NextFunction} next - Express next function
     */
    function live(req, res, next) {
        try {
            const requestId = getRequestIdSafe(req);
            sendSuccessFn(res, {
                data: {
                    status: 'alive',
                    timestamp: new Date().toISOString(),
                },
                message: 'Process is alive',
                meta: { requestId },
            });
        } catch (error) {
            next(error);
        }
    }

    // --------------------------------------------------------------------------
    // HANDLER: GET /ready - Readiness probe
    // --------------------------------------------------------------------------

    /**
     * Readiness endpoint - checks critical dependencies
     * @param {import('express').Request} req - Express request
     * @param {import('express').Response} res - Express response
     * @param {import('express').NextFunction} next - Express next function
     */
    async function ready(req, res, next) {
        const requestId = getRequestIdSafe(req);

        try {
            // Check database connectivity
            let dbStatus = 'unknown';
            let dbError = null;

            if (dbPool && typeof dbPool.getConnection === 'function') {
                let connection;
                try {
                    connection = await dbPool.getConnection();
                    await connection.ping();
                    dbStatus = 'connected';
                } catch (error) {
                    dbStatus = 'error';
                    dbError = error.message || 'Database connection failed';
                    log.warn({ err: error, requestId }, 'Readiness check: database error');
                } finally {
                    if (connection && typeof connection.release === 'function') {
                        try {
                            connection.release();
                        } catch (_) {
                            // Ignore release errors
                        }
                    }
                }
            } else {
                dbStatus = 'unavailable';
                dbError = 'Database pool not available';
                log.warn({ requestId }, 'Readiness check: database pool unavailable');
            }

            const isReady = dbStatus === 'connected';

            if (isReady) {
                sendSuccessFn(res, {
                    data: {
                        status: 'ready',
                        timestamp: new Date().toISOString(),
                        dependencies: {
                            database: 'connected',
                        },
                    },
                    message: 'Application is ready to serve traffic',
                    meta: { requestId },
                });
            } else {
                // Not ready - return 503 Service Unavailable
                res.status(503);
                sendSuccessFn(res, {
                    data: {
                        status: 'not ready',
                        timestamp: new Date().toISOString(),
                        dependencies: {
                            database: dbStatus,
                            error: dbError,
                        },
                    },
                    message: 'Application is not ready',
                    meta: { requestId },
                });
            }
        } catch (error) {
            // Unexpected error in readiness check
            log.error({ err: error, requestId }, 'Readiness check unexpected error');
            sendErrorFn(res, error, {
                requestId,
                fallbackMessage: 'Readiness check failed',
                statusCode: 500,
            });
        }
    }

    // --------------------------------------------------------------------------
    // HANDLER: GET /status - System status information
    // --------------------------------------------------------------------------

    /**
     * Status endpoint - safe system information
     * @param {import('express').Request} req - Express request
     * @param {import('express').Response} res - Express response
     * @param {import('express').NextFunction} next - Express next function
     */
    function status(req, res, next) {
        try {
            const requestId = getRequestIdSafe(req);
            const app = appConfig;
            const server = serverConfig;

            // Gather safe system info
            const statusData = {
                application: {
                    name: app.appName || 'Tesnow',
                    version: app.appVersion || '1.0.0',
                    environment: app.nodeEnv,
                },
                server: {
                    host: server.host,
                    port: server.port,
                },
                process: {
                    pid: process.pid,
                    uptime: process.uptime(),
                    nodeVersion: process.version,
                    platform: process.platform,
                },
                timestamp: new Date().toISOString(),
            };

            sendSuccessFn(res, {
                data: statusData,
                message: 'System status retrieved',
                meta: { requestId },
            });
        } catch (error) {
            next(error);
        }
    }

    // --------------------------------------------------------------------------
    // RETURN CONTROLLER
    // --------------------------------------------------------------------------

    return {
        health,
        live,
        ready,
        status,
    };
}

// ----------------------------------------------------------------------------
// 3. DEFAULT EXPORT
// ----------------------------------------------------------------------------

// Create default controller instance (with no dependencies)
const defaultController = createHealthController();

export default {
    health: defaultController.health,
    live: defaultController.live,
    ready: defaultController.ready,
    status: defaultController.status,
    createHealthController,
};

export const health = defaultController.health;
export const live = defaultController.live;
export const ready = defaultController.ready;
export const status = defaultController.status;