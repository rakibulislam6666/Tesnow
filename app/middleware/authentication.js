/**
 * app/middleware/authentication.js
 *
 * Protected-route authentication middleware.
 *
 * Flow:
 *
 *   req.session.userId
 *          ↓
 *   req.sessionID
 *          ↓
 *   sessionService.hashSessionId()
 *          ↓
 *   sessionService.validateSession()
 *          ↓
 *   authService.getAuthenticatedUser()
 *          ↓
 *   req.user + request context
 *          ↓
 *   throttled activity update
 *          ↓
 *   next()
 *
 * Security:
 *   - Authentication is mandatory.
 *   - Fails closed.
 *   - Raw session IDs are never logged.
 *   - Session hashes are never logged.
 *   - Invalid/revoked/expired sessions cannot continue.
 *   - User validity is checked against authService.
 *   - Activity tracking cannot invalidate authentication.
 *   - No database access is performed directly here.
 */

import { AuthenticationError } from '../core/errors.js';
import { createChildLogger } from '../core/logger.js';
import {
  getRequestId,
  setUserContext,
} from '../core/request-context.js';
import authService from '../services/auth/auth.service.js';
import sessionService from '../services/auth/session.service.js';

const logger = createChildLogger({
  module: 'authentication-middleware',
});

const SESSION_COOKIE_NAME = 'tesnow.sid';

/**
 * Safely destroy the current Express session and clear its client cookie.
 *
 * This helper intentionally does not throw.
 * Authentication failure remains the caller's responsibility.
 *
 * Cookie path/domain are taken from the current Express session cookie
 * whenever available, avoiding a mismatch with configured session cookies.
 *
 * @param {object} req
 * @param {object} res
 * @param {object} context
 * @param {string} context.event
 * @param {string} [context.reason]
 * @param {string|null} [context.requestId]
 * @returns {Promise<void>}
 */
async function invalidateSession(req, res, context = {}) {
  const session = req?.session;

  if (session && typeof session.destroy === 'function') {
    await new Promise((resolve) => {
      let settled = false;

      const finish = () => {
        if (settled) {
          return;
        }

        settled = true;
        resolve();
      };

      try {
        session.destroy((error) => {
          if (error) {
            try {
              if (typeof logger.warn === 'function') {
                logger.warn({
                  event: 'session_destroy_failed',
                  cause: context.event || 'session_invalidation',
                  reason: context.reason || 'unknown',
                  requestId: context.requestId || null,
                  errorName:
                    error instanceof Error
                      ? error.name
                      : 'Error',
                  errorCode:
                    error &&
                    typeof error.code === 'string'
                      ? error.code
                      : undefined,
                });
              }
            } catch {
              // Logging must never block session invalidation.
            }
          }

          finish();
        });
      } catch (error) {
        try {
          if (typeof logger.warn === 'function') {
            logger.warn({
              event: 'session_destroy_threw',
              cause: context.event || 'session_invalidation',
              reason: context.reason || 'unknown',
              requestId: context.requestId || null,
              errorName:
                error instanceof Error
                  ? error.name
                  : 'Error',
              errorCode:
                error &&
                typeof error.code === 'string'
                  ? error.code
                  : undefined,
            });
          }
        } catch {
          // Logging must never break authentication handling.
        }

        finish();
      }
    });
  }

  if (res && typeof res.clearCookie === 'function') {
    const cookie = session?.cookie;

    const clearCookieOptions = {
      path:
        typeof cookie?.path === 'string' && cookie.path !== ''
          ? cookie.path
          : '/',
    };

    /*
     * Domain must match the original cookie if one was configured.
     * Leaving it undefined is correct when the original cookie was host-only.
     */
    if (
      typeof cookie?.domain === 'string' &&
      cookie.domain !== ''
    ) {
      clearCookieOptions.domain = cookie.domain;
    }

    try {
      res.clearCookie(
        SESSION_COOKIE_NAME,
        clearCookieOptions
      );
    } catch (error) {
      /*
       * Cookie clearing is defense-in-depth.
       * The server-side session has already been invalidated/destroyed
       * or the destroy attempt has completed.
       *
       * Never turn cookie-clearing failure into a successful authentication.
       */
      try {
        if (typeof logger.warn === 'function') {
          logger.warn({
            event: 'session_cookie_clear_failed',
            cause: context.event || 'session_invalidation',
            reason: context.reason || 'unknown',
            requestId: context.requestId || null,
            errorName:
              error instanceof Error
                ? error.name
                : 'Error',
            errorCode:
              error &&
              typeof error.code === 'string'
                ? error.code
                : undefined,
          });
        }
      } catch {
        // Logging must never break authentication handling.
      }
    }
  }
}

/**
 * Protected-route authentication middleware.
 *
 * @param {object} req
 * @param {object} res
 * @param {Function} next
 * @returns {Promise<void>}
 */
export async function authenticate(req, res, next) {
  const requestId = getRequestId() || req.id || null;

  try {
    // ========================================================================
    // 1. REQUIRE SESSION + USER ID
    // ========================================================================

    const session = req.session;

    if (!session) {
      throw new AuthenticationError(
        'Authentication required'
      );
    }

    const userId = session.userId;

    if (!userId) {
      await invalidateSession(req, res, {
        event: 'auth_missing_user_id',
        reason: 'missing_user_id',
        requestId,
      });

      throw new AuthenticationError(
        'Authentication required'
      );
    }

    // ========================================================================
    // 2. REQUIRE EXPRESS SESSION ID
    // ========================================================================

    const sessionId = req.sessionID;

    if (!sessionId) {
      await invalidateSession(req, res, {
        event: 'auth_missing_session_id',
        reason: 'missing_session_id',
        requestId,
      });

      throw new AuthenticationError(
        'Authentication required'
      );
    }

    // ========================================================================
    // 3. HASH SESSION ID
    // ========================================================================

    /*
     * The session service owns the hashing primitive.
     *
     * Never use a raw session ID for database lookup or logging.
     */
    const hashedSessionId =
      sessionService.hashSessionId(sessionId);

    // ========================================================================
    // 4. VALIDATE DB-BACKED SESSION
    // ========================================================================

    const validation =
      await sessionService.validateSession(
        hashedSessionId,
        userId
      );

    if (!validation || validation.valid !== true) {
      await invalidateSession(req, res, {
        event: 'auth_invalid_session',
        reason:
          validation?.reason || 'invalid_session',
        requestId,
      });

      throw new AuthenticationError(
        'Invalid session'
      );
    }

    // ========================================================================
    // 5. LOAD AUTHENTICATED USER
    // ========================================================================

    const user =
      await authService.getAuthenticatedUser(userId);

    if (!user) {
      await invalidateSession(req, res, {
        event: 'auth_user_invalid',
        reason: 'user_no_longer_valid',
        requestId,
      });

      throw new AuthenticationError(
        'User no longer valid'
      );
    }

    // ========================================================================
    // 6. ATTACH AUTHENTICATED USER
    // ========================================================================

    req.user = user;

    setUserContext({
      userId: user.id,
      isAuthenticated: true,
    });

    // ========================================================================
    // 7. BEST-EFFORT ACTIVITY TRACKING
    // ========================================================================

    /*
     * Activity tracking is metadata only.
     *
     * The service performs throttling. It must never affect the
     * authentication result.
     */
    if (
      Number.isSafeInteger(validation.sessionRecordId) &&
      validation.sessionRecordId > 0
    ) {
      try {
        const activityPromise =
          sessionService.touchSessionActivity(
            validation.sessionRecordId,
            validation.lastActivityAt
          );

        /*
         * Defensive catch:
         * even if the service implementation changes in the future
         * and starts rejecting, authentication must still succeed.
         */
        if (
          activityPromise &&
          typeof activityPromise.catch === 'function'
        ) {
          activityPromise.catch(() => {
            // The session service owns activity-error logging.
          });
        }
      } catch {
        /*
         * Synchronous activity-tracking failures are also ignored.
         * Authentication has already been successfully established.
         */
      }
    }

    // ========================================================================
    // 8. SUCCESS LOG
    // ========================================================================

    if (typeof logger.debug === 'function') {
      logger.debug(
        {
          userId: user.id,
          requestId,
        },
        'Authentication successful'
      );
    }

    // ========================================================================
    // 9. CONTINUE
    // ========================================================================

    return next();
  } catch (error) {
    return next(error);
  }
}

export default authenticate;