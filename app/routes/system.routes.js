/**
 * app/routes/system.routes.js
 *
 * System-level HTTP routes for:
 *   - health
 *   - liveness
 *   - readiness
 *   - public status
 *
 * Responsibilities:
 *   - Define system route methods and paths.
 *   - Perform only the minimum infrastructure checks currently required
 *     by the existing architecture.
 *   - Return safe, stable HTTP responses.
 *
 * Non-responsibilities:
 *   - Authentication / authorization.
 *   - Business logic.
 *   - SQL queries or repository operations.
 *   - Error serialization for unexpected application errors.
 *
 * Architectural note:
 *   GET /ready currently performs the database connectivity probe directly
 *   because no dedicated system/health service exists yet. This should be
 *   moved to a dedicated health/system service when that layer is introduced.
 *
 * Public security note:
 *   Public endpoints intentionally avoid exposing environment names,
 *   server addresses, ports, process IDs, runtime versions, uptime, or
 *   database driver error messages.
 *
 * @module routes/system.routes
 */

import express from 'express';

import { getAppConfig } from '../config/app.config.js';
import { getDbPool } from '../config/database.config.js';
import { getRequestId } from '../core/request-context.js';
import { sendSuccess } from '../core/response.js';
import { createChildLogger } from '../core/logger.js';

const router = express.Router();

const logger = createChildLogger({
    module: 'system-routes',
});

/**
 * Resolve the request ID used for response correlation and server-side logs.
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
function resolveRequestId(req) {
    return getRequestId() || req.id || 'unknown';
}

// -----------------------------------------------------------------------------
// GET /health
// -----------------------------------------------------------------------------

/**
 * Basic application health.
 *
 * This endpoint intentionally performs no dependency checks. A process that
 * is alive but has a degraded dependency should still be distinguishable
 * from a dead process.
 */
router.get('/health', (req, res) => {
    const requestId = resolveRequestId(req);

    return sendSuccess(res, {
        data: {
            status: 'ok',
            timestamp: new Date().toISOString(),
        },
        message: 'Application is healthy',
        meta: {
            requestId,
        },
    });
});

// -----------------------------------------------------------------------------
// GET /live
// -----------------------------------------------------------------------------

/**
 * Process liveness probe.
 *
 * This endpoint must remain independent of external dependencies such as
 * the database so an orchestrator can determine whether the process itself
 * is alive.
 */
router.get('/live', (req, res) => {
    const requestId = resolveRequestId(req);

    return sendSuccess(res, {
        data: {
            status: 'alive',
            timestamp: new Date().toISOString(),
        },
        message: 'Process is alive',
        meta: {
            requestId,
        },
    });
});

// -----------------------------------------------------------------------------
// GET /ready
// -----------------------------------------------------------------------------

/**
 * Application readiness probe.
 *
 * Current readiness dependency:
 *   - Database connectivity
 *
 * Success:
 *   HTTP 200 + success envelope
 *
 * Failure:
 *   HTTP 503 + explicit failure envelope
 *
 * Security:
 *   Raw database-driver error messages are never returned to the client.
 */
router.get('/ready', async (req, res) => {
    const requestId = resolveRequestId(req);

    let connection = null;
    let databaseReady = false;

    try {
        const pool = getDbPool();

        if (!pool || typeof pool.getConnection !== 'function') {
            logger.warn(
                {
                    event: 'readiness_pool_unavailable',
                    requestId,
                },
                'Readiness check: database pool is unavailable',
            );
        } else {
            connection = await pool.getConnection();

            if (!connection || typeof connection.ping !== 'function') {
                logger.warn(
                    {
                        event: 'readiness_connection_invalid',
                        requestId,
                    },
                    'Readiness check: database connection is invalid',
                );
            } else {
                await connection.ping();
                databaseReady = true;
            }
        }
    } catch (error) {
        /**
         * Never expose database-driver error messages to the client.
         *
         * Only safe metadata is logged. The logger receives no raw error
         * object here to avoid accidentally serializing sensitive driver
         * details through an external logging transport.
         */
        logger.warn(
            {
                event: 'readiness_database_error',
                requestId,
                errorName:
                    error instanceof Error ? error.name : 'UnknownError',
                errorCode:
                    error &&
                    typeof error.code === 'string'
                        ? error.code
                        : undefined,
            },
            'Readiness check: database connectivity failed',
        );
    } finally {
        if (connection && typeof connection.release === 'function') {
            try {
                connection.release();
            } catch (releaseError) {
                logger.warn(
                    {
                        event: 'readiness_connection_release_failed',
                        requestId,
                        errorName:
                            releaseError instanceof Error
                                ? releaseError.name
                                : 'UnknownError',
                        errorCode:
                            releaseError &&
                            typeof releaseError.code === 'string'
                                ? releaseError.code
                                : undefined,
                    },
                    'Readiness check: failed to release database connection',
                );
            }
        }
    }

    const timestamp = new Date().toISOString();

    if (databaseReady) {
        return sendSuccess(res, {
            data: {
                status: 'ready',
                timestamp,
                dependencies: {
                    database: 'connected',
                },
            },
            message: 'Application is ready to serve traffic',
            meta: {
                requestId,
            },
        });
    }

    /**
     * Do not use sendSuccess() for a failed readiness response.
     *
     * The HTTP status and response envelope must agree:
     *   HTTP 503 + success:false
     */
    return res.status(503).json({
        success: false,
        error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Application is not ready',
        },
        data: {
            status: 'not_ready',
            timestamp,
            dependencies: {
                database: 'unavailable',
            },
        },
        meta: {
            requestId,
        },
    });
});

// -----------------------------------------------------------------------------
// GET /status
// -----------------------------------------------------------------------------

/**
 * Public system status.
 *
 * Only non-sensitive application information is exposed.
 *
 * Intentionally excluded:
 *   - environment
 *   - server host
 *   - server port
 *   - process PID
 *   - process uptime
 *   - Node.js version
 *   - platform
 *
 * Detailed operational information should eventually live behind an
 * authenticated administrative/operations endpoint.
 */
router.get('/status', (req, res) => {
    const requestId = resolveRequestId(req);
    const appConfig = getAppConfig();

    return sendSuccess(res, {
        data: {
            application: {
                name: appConfig.appName || 'Tesnow',
            },
            timestamp: new Date().toISOString(),
        },
        message: 'System status retrieved',
        meta: {
            requestId,
        },
    });
});

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

export default router;
export { router };