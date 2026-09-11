/**
 * app/controllers/auth.controller.js
 *
 * HTTP/session orchestration for authentication endpoints.
 *
 * Responsibilities:
 * - Extract HTTP request data.
 * - Delegate credential authentication to authService.
 * - Coordinate Express session lifecycle with sessionService.
 * - Perform defensive cleanup on partial authentication failures.
 * - Delegate success/error response handling to existing application layers.
 *
 * Non-responsibilities:
 * - Password hashing or verification.
 * - Account eligibility/business rules.
 * - SQL or repository access.
 * - Database query construction.
 * - Global error serialization.
 * - Authentication middleware concerns.
 *
 * Security properties:
 * - Regenerates the Express session before assigning authenticated identity.
 * - Never logs credentials, session IDs, hashes, cookies, or secrets.
 * - Uses only the regenerated session ID for DB session persistence.
 * - Fails closed when required session state is unavailable.
 * - Performs best-effort cleanup after partial login failures.
 * - Preserves the original failure when cleanup also fails.
 */

import { AuthenticationError, ValidationError } from '../core/errors.js';
import { sendSuccess } from '../core/response.js';
import { createChildLogger } from '../core/logger.js';
import { getRequestId } from '../core/request-context.js';
import authService from '../services/auth/auth.service.js';
import sessionService from '../services/auth/session.service.js';

const SESSION_COOKIE_NAME = 'tesnow.sid';

const MAX_IDENTIFIER_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 1024;

const DEFAULT_LOGIN_SUCCESS_MESSAGE = 'Login successful';
const DEFAULT_LOGOUT_SUCCESS_MESSAGE = 'Logged out successfully';

/**
 * Safely obtain the current request ID.
 *
 * Request context is treated as optional because controllers should remain
 * usable in isolated unit tests and during early application lifecycle.
 *
 * @param {object} req
 * @returns {string|null}
 */
function getSafeRequestId(req) {
    const requestContextId = getRequestId();

    if (typeof requestContextId === 'string' && requestContextId.length > 0) {
        return requestContextId;
    }

    if (typeof req?.id === 'string' && req.id.length > 0) {
        return req.id;
    }

    return null;
}

/**
 * Convert an Express callback-style session method into a Promise.
 *
 * The helper protects against:
 * - missing session methods
 * - synchronous throws
 * - asynchronous callback errors
 * - accidental callback double invocation
 *
 * @param {object} session
 * @param {'regenerate'|'save'|'destroy'} method
 * @returns {Promise<void>}
 */
function callSessionMethod(session, method) {
    return new Promise((resolve, reject) => {
        if (!session || typeof session[method] !== 'function') {
            reject(new Error(`req.session.${method} is not available`));
            return;
        }

        let settled = false;

        const finish = (error) => {
            if (settled) {
                return;
            }

            settled = true;

            if (error) {
                reject(error);
                return;
            }

            resolve();
        };

        try {
            session[method](finish);
        } catch (error) {
            finish(error);
        }
    });
}

/**
 * Clear the configured authentication cookie.
 *
 * Cookie path/domain are taken from the current Express session so that
 * clearCookie targets the same cookie scope that was used to create it.
 *
 * @param {object} req
 * @param {object} res
 * @returns {boolean}
 */
function clearSessionCookie(req, res) {
    if (!res || typeof res.clearCookie !== 'function') {
        return false;
    }

    const cookie = req?.session?.cookie;

    const options = {
        path:
            typeof cookie?.path === 'string' && cookie.path.length > 0
                ? cookie.path
                : '/',
    };

    if (typeof cookie?.domain === 'string' && cookie.domain.length > 0) {
        options.domain = cookie.domain;
    }

    try {
        res.clearCookie(SESSION_COOKIE_NAME, options);
        return true;
    } catch {
        return false;
    }
}

/**
 * Destroy the Express session and clear its authentication cookie.
 *
 * Cleanup is deliberately best-effort. It never throws because callers
 * must preserve the original authentication/session failure.
 *
 * @param {object} req
 * @param {object} res
 * @param {object} logger
 * @param {string|null} requestId
 * @param {string} event
 * @returns {Promise<{
 *   destroyed: boolean,
 *   cookieCleared: boolean
 * }>}
 */
async function destroyAndClearSession(
    req,
    res,
    logger,
    requestId,
    event,
) {
    let destroyed = false;

    if (req?.session && typeof req.session.destroy === 'function') {
        try {
            await callSessionMethod(req.session, 'destroy');
            destroyed = true;
        } catch (error) {
            logger.warn({
                event: `${event}_destroy_failed`,
                requestId,
                errorName: error instanceof Error ? error.name : 'Error',
                errorCode:
                    typeof error?.code === 'string' ? error.code : undefined,
            });
        }
    }

    const cookieCleared = clearSessionCookie(req, res);

    if (!cookieCleared) {
        logger.warn({
            event: `${event}_cookie_clear_failed`,
            requestId,
        });
    }

    return {
        destroyed,
        cookieCleared,
    };
}

/**
 * Read and minimally validate login credentials.
 *
 * This boundary check intentionally does not normalize a legitimate
 * password. In particular, password whitespace is significant unless the
 * password consists entirely of whitespace.
 *
 * Identifier normalization preserves the existing authentication route
 * behavior: surrounding whitespace is removed before authService receives
 * the identifier.
 *
 * @param {unknown} body
 * @returns {{identifier: string, password: string}}
 * @throws {ValidationError}
 */
function readLoginCredentials(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ValidationError('Invalid login request');
    }

    const username =
        typeof body.username === 'string' ? body.username.trim() : '';

    const email =
        typeof body.email === 'string' ? body.email.trim() : '';

    const identifier = username.length > 0 ? username : email;

    if (identifier.length === 0) {
        throw new ValidationError('Username or email is required');
    }

    if (identifier.length > MAX_IDENTIFIER_LENGTH) {
        throw new ValidationError('Username or email is too long');
    }

    if (typeof body.password !== 'string') {
        throw new ValidationError('Password is required');
    }

    if (body.password.length === 0) {
        throw new ValidationError('Password is required');
    }

    if (body.password.length > MAX_PASSWORD_LENGTH) {
        throw new ValidationError('Password is too long');
    }

    if (body.password.trim().length === 0) {
        throw new ValidationError('Password is required');
    }

    return Object.freeze({
        identifier,
        password: body.password,
    });
}

/**
 * Resolve the database session expiration from Express session state.
 *
 * The database session must not outlive the Express session. Therefore an
 * invalid or already-expired Express cookie expiration fails closed.
 *
 * @param {object} session
 * @returns {Date}
 * @throws {Error}
 */
function resolveSessionExpiry(session) {
    const expires = session?.cookie?.expires;

    if (!(expires instanceof Date) || !Number.isFinite(expires.getTime())) {
        throw new Error('Session cookie expiration is unavailable');
    }

    if (expires.getTime() <= Date.now()) {
        throw new Error('Session cookie is already expired');
    }

    return new Date(expires.getTime());
}

/**
 * Validate the regenerated Express session identifier.
 *
 * @param {unknown} sessionId
 * @returns {string}
 * @throws {Error}
 */
function requireSessionId(sessionId) {
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
        throw new Error('Regenerated session ID is unavailable');
    }

    return sessionId;
}

/**
 * Revoke a database-backed session without allowing cleanup failure to
 * replace the original failure.
 *
 * @param {object} sessionServiceInstance
 * @param {string} hashedSessionId
 * @param {object} logger
 * @param {string|null} requestId
 * @param {string} event
 * @returns {Promise<boolean>}
 */
async function revokeDatabaseSession(
    sessionServiceInstance,
    hashedSessionId,
    logger,
    requestId,
    event,
) {
    try {
        await sessionServiceInstance.revokeSession(hashedSessionId);
        return true;
    } catch (error) {
        logger.warn({
            event,
            requestId,
            errorName: error instanceof Error ? error.name : 'Error',
            errorCode:
                typeof error?.code === 'string' ? error.code : undefined,
        });

        return false;
    }
}

/**
 * Create the authentication controller.
 *
 * Dependencies are injectable to keep the controller deterministic and
 * straightforward to unit test without introducing a DI framework.
 *
 * @param {{
 *   authService?: object,
 *   sessionService?: object,
 *   logger?: object
 * }} [dependencies]
 * @returns {Readonly<{
 *   login: Function,
 *   logout: Function
 * }>}
 */
export function createAuthController({
    authService: injectedAuthService = authService,
    sessionService: injectedSessionService = sessionService,
    logger: injectedLogger = createChildLogger({
        module: 'auth-controller',
    }),
} = {}) {
    if (
        !injectedAuthService ||
        typeof injectedAuthService.login !== 'function'
    ) {
        throw new TypeError(
            'createAuthController requires authService.login',
        );
    }

    if (
        !injectedSessionService ||
        typeof injectedSessionService.hashSessionId !== 'function' ||
        typeof injectedSessionService.createSession !== 'function' ||
        typeof injectedSessionService.revokeSession !== 'function'
    ) {
        throw new TypeError(
            'createAuthController requires sessionService.hashSessionId, createSession, and revokeSession',
        );
    }

    if (
        !injectedLogger ||
        typeof injectedLogger.warn !== 'function' ||
        typeof injectedLogger.info !== 'function'
    ) {
        throw new TypeError(
            'createAuthController requires logger.info and logger.warn',
        );
    }

    /**
     * Handle POST /login.
     *
     * The controller deliberately owns the Express-session lifecycle because
     * session regeneration and persistence are HTTP/session concerns.
     *
     * @param {object} req
     * @param {object} res
     * @param {Function} next
     * @returns {Promise<void>}
     */
    async function login(req, res, next) {
        const requestId = getSafeRequestId(req);

        try {
            const { identifier, password } = readLoginCredentials(req.body);

            const user = await injectedAuthService.login(
                identifier,
                password,
            );

            if (
                !user ||
                !Number.isSafeInteger(user.id) ||
                user.id <= 0
            ) {
                throw new AuthenticationError('Invalid credentials');
            }

            if (
                !req.session ||
                typeof req.session.regenerate !== 'function'
            ) {
                throw new Error('Session is not available');
            }

            /*
             * Session fixation defense:
             * regenerate before assigning the authenticated user.
             */
            try {
                await callSessionMethod(req.session, 'regenerate');
            } catch (error) {
                await destroyAndClearSession(
                    req,
                    res,
                    injectedLogger,
                    requestId,
                    'auth_login_regenerate_failed',
                );

                throw error;
            }

            /*
             * Everything below this point is part of the newly regenerated
             * authenticated session and therefore requires cleanup if it
             * fails.
             */
            let regeneratedSessionId;

            try {
                regeneratedSessionId = requireSessionId(req.sessionID);
            } catch (error) {
                await destroyAndClearSession(
                    req,
                    res,
                    injectedLogger,
                    requestId,
                    'auth_login_session_id_failed',
                );

                throw error;
            }

            req.session.userId = user.id;

            let expiresAt;

            try {
                expiresAt = resolveSessionExpiry(req.session);
            } catch (error) {
                await destroyAndClearSession(
                    req,
                    res,
                    injectedLogger,
                    requestId,
                    'auth_login_expiry_failed',
                );

                throw error;
            }

            let hashedSessionId;

            try {
                hashedSessionId =
                    injectedSessionService.hashSessionId(
                        regeneratedSessionId,
                    );
            } catch (error) {
                await destroyAndClearSession(
                    req,
                    res,
                    injectedLogger,
                    requestId,
                    'auth_login_hash_failed',
                );

                throw error;
            }

            /*
             * Persist the server-side session before saving the Express
             * session. If persistence succeeds but Express save fails,
             * revoke the DB session during rollback.
             */
            try {
                await injectedSessionService.createSession(
                    user.id,
                    hashedSessionId,
                    expiresAt,
                );
            } catch (error) {
                await destroyAndClearSession(
                    req,
                    res,
                    injectedLogger,
                    requestId,
                    'auth_login_db_create_failed',
                );

                throw error;
            }

            try {
                await callSessionMethod(req.session, 'save');
            } catch (error) {
                await revokeDatabaseSession(
                    injectedSessionService,
                    hashedSessionId,
                    injectedLogger,
                    requestId,
                    'auth_login_db_rollback_failed',
                );

                await destroyAndClearSession(
                    req,
                    res,
                    injectedLogger,
                    requestId,
                    'auth_login_save_failed',
                );

                throw error;
            }

            injectedLogger.info({
                event: 'auth_login_success',
                userId: user.id,
                requestId,
            });

            return sendSuccess(res, {
                data: { user },
                message: DEFAULT_LOGIN_SUCCESS_MESSAGE,
            });
        } catch (error) {
            return next(error);
        }
    }

    /**
     * Handle POST /logout.
     *
     * Logout is intentionally idempotent from the HTTP perspective.
     * Database revocation is attempted first, followed by local session
     * invalidation. Database cleanup failure does not prevent local logout.
     *
     * @param {object} req
     * @param {object} res
     * @param {Function} next
     * @returns {Promise<void>}
     */
    async function logout(req, res, next) {
        const requestId = getSafeRequestId(req);

        try {
            const sessionId = req.sessionID;

            if (
                typeof sessionId !== 'string' ||
                sessionId.length === 0
            ) {
                await destroyAndClearSession(
                    req,
                    res,
                    injectedLogger,
                    requestId,
                    'auth_logout_no_session',
                );

                return sendSuccess(res, {
                    message: DEFAULT_LOGOUT_SUCCESS_MESSAGE,
                });
            }

            let hashedSessionId;

            try {
                hashedSessionId =
                    injectedSessionService.hashSessionId(sessionId);
            } catch (error) {
                await destroyAndClearSession(
                    req,
                    res,
                    injectedLogger,
                    requestId,
                    'auth_logout_hash_failed',
                );

                throw error;
            }

            /*
             * Revoke server-side authentication first. A revocation failure
             * is logged but does not prevent local session invalidation.
             */
            await revokeDatabaseSession(
                injectedSessionService,
                hashedSessionId,
                injectedLogger,
                requestId,
                'auth_logout_db_revoke_failed',
            );

            /*
             * Defense-in-depth:
             * remove the authenticated claim before destroying the session.
             */
            if (req.session) {
                try {
                    req.session.userId = undefined;
                } catch (error) {
                    injectedLogger.warn({
                        event: 'auth_logout_session_claim_clear_failed',
                        requestId,
                        errorName:
                            error instanceof Error
                                ? error.name
                                : 'Error',
                        errorCode:
                            typeof error?.code === 'string'
                                ? error.code
                                : undefined,
                    });
                }
            }

            await destroyAndClearSession(
                req,
                res,
                injectedLogger,
                requestId,
                'auth_logout',
            );

            injectedLogger.info({
                event: 'auth_logout_success',
                requestId,
            });

            return sendSuccess(res, {
                message: DEFAULT_LOGOUT_SUCCESS_MESSAGE,
            });
        } catch (error) {
            return next(error);
        }
    }

    return Object.freeze({
        login,
        logout,
    });
}

export default createAuthController();