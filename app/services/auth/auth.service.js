/**
 * app/services/auth/auth.service.js
 *
 * Authentication business logic.
 *
 * Responsibilities:
 *   - Validate the service-level shape of authentication input.
 *   - Look up users through the repository.
 *   - Verify passwords through the password service.
 *   - Enforce authentication eligibility.
 *   - Re-validate authenticated users against current database state.
 *   - Return an explicit safe-user projection.
 *
 * Non-responsibilities:
 *   - SQL / direct database access.
 *   - HTTP / Express response handling.
 *   - Cookies / sessions.
 *   - Password hashing implementation.
 *   - RBAC / authorization.
 *   - MFA, lockout, password reset, OTP, CAPTCHA, or rate limiting.
 *
 * Security principles:
 *   - Expected authentication failures use one generic client-facing message.
 *   - Infrastructure errors are never converted into authentication failures.
 *   - Passwords and password hashes are never logged or returned.
 *   - User projection is an explicit allowlist.
 *   - Authentication state is validated fail-closed.
 */

import { AuthenticationError } from '../../core/errors.js';
import { createChildLogger } from '../../core/logger.js';
import { USER_STATUS } from '../../core/constants.js';
import userRepository from '../../repositories/user.repository.js';
import { verifyPassword } from './password.service.js';

const logger = createChildLogger({ module: 'auth-service' });

const INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials';

const ALLOWED_LOGIN_STATUSES = new Set([USER_STATUS.ACTIVE]);

/**
 * Only fields explicitly approved for downstream consumers are returned.
 *
 * This is intentionally an allowlist rather than:
 *
 *     const { password_hash, ...safeUser } = user;
 *
 * A whitelist prevents future sensitive repository fields from leaking
 * automatically if the users table or repository projection grows.
 */
const SAFE_USER_FIELDS = Object.freeze([
    'id',
    'username',
    'email',
    'status',
    'created_at',
]);

/**
 * Create a safe user projection.
 *
 * @param {object} user
 * @returns {object}
 */
function projectSafeUser(user) {
    const safeUser = {};

    for (const field of SAFE_USER_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(user, field)) {
            safeUser[field] = user[field];
        }
    }

    return safeUser;
}

/**
 * Validate basic credential types at the service boundary.
 *
 * Detailed request validation belongs to the route/validator layer.
 * This check exists as defense-in-depth for internal callers.
 *
 * Passwords are deliberately not trimmed or normalized.
 *
 * @param {*} usernameOrEmail
 * @param {*} password
 * @returns {{ usernameOrEmail: string, password: string }}
 * @throws {AuthenticationError}
 */
function assertCredentialShape(usernameOrEmail, password) {
    if (
        typeof usernameOrEmail !== 'string' ||
        usernameOrEmail.length === 0
    ) {
        throw new AuthenticationError(INVALID_CREDENTIALS_MESSAGE);
    }

    if (typeof password !== 'string' || password.length === 0) {
        throw new AuthenticationError(INVALID_CREDENTIALS_MESSAGE);
    }

    return {
        usernameOrEmail,
        password,
    };
}

/**
 * Validate a user ID according to the application's numeric ID contract.
 *
 * No coercion is performed. Values such as "42" are intentionally rejected.
 *
 * @param {*} userId
 * @returns {boolean}
 */
function isValidUserId(userId) {
    return (
        typeof userId === 'number' &&
        Number.isSafeInteger(userId) &&
        userId > 0
    );
}

/**
 * Validate the minimum security-critical shape required for login.
 *
 * The login path requires:
 *   - a valid user ID;
 *   - a usable password hash;
 *   - a valid status;
 *   - an explicit non-deleted state.
 *
 * This is intentionally not a complete database-row validator.
 *
 * @param {*} user
 * @returns {boolean}
 */
function isValidLoginUser(user) {
    if (!user || typeof user !== 'object') {
        return false;
    }

    if (!isValidUserId(user.id)) {
        return false;
    }

    if (
        typeof user.password_hash !== 'string' ||
        user.password_hash.length === 0
    ) {
        return false;
    }

    if (typeof user.status !== 'string' || user.status.length === 0) {
        return false;
    }

    /*
     * The repository contract returns deleted_at because the service uses
     * defense-in-depth. `null` is the only valid non-deleted state here.
     *
     * Treating undefined as non-deleted would make malformed repository
     * output fail open.
     */
    if (user.deleted_at !== null) {
        return false;
    }

    return true;
}

/**
 * Validate the minimum security-critical shape required for an already
 * authenticated user.
 *
 * Password verification is not performed on this path, therefore
 * password_hash is deliberately NOT required here.
 *
 * @param {*} user
 * @returns {boolean}
 */
function isValidAuthenticatedUser(user) {
    if (!user || typeof user !== 'object') {
        return false;
    }

    if (!isValidUserId(user.id)) {
        return false;
    }

    if (typeof user.status !== 'string' || user.status.length === 0) {
        return false;
    }

    if (user.deleted_at !== null) {
        return false;
    }

    return true;
}

/**
 * Determine whether the user is currently allowed to authenticate.
 *
 * @param {object} user
 * @returns {boolean}
 */
function isEligibleForLogin(user) {
    return (
        user.deleted_at === null &&
        ALLOWED_LOGIN_STATUSES.has(user.status)
    );
}

/**
 * Log an authentication rejection without logging credentials or identifiers.
 *
 * The reason is operational metadata only. The client always receives the
 * same generic authentication failure.
 *
 * @param {string} reason
 * @param {number|null} [userId]
 * @returns {void}
 */
function logLoginRejection(reason, userId = null) {
    logger.warn(
        {
            event: 'auth_login_rejected',
            reason,
            userId,
        },
        'Login rejected',
    );
}

/**
 * Create the authentication service.
 *
 * @param {object} [userRepo=userRepository]
 * @returns {Readonly<{
 *   login: Function,
 *   getAuthenticatedUser: Function
 * }>}
 */
export function createAuthService(userRepo = userRepository) {
    if (!userRepo || typeof userRepo !== 'object') {
        throw new TypeError(
            'createAuthService requires a user repository',
        );
    }

    if (typeof userRepo.findByUsernameOrEmail !== 'function') {
        throw new TypeError(
            'userRepository.findByUsernameOrEmail must be a function',
        );
    }

    if (typeof userRepo.findById !== 'function') {
        throw new TypeError(
            'userRepository.findById must be a function',
        );
    }

    const service = {
        /**
         * Authenticate a user with username/email and password.
         *
         * Expected authentication failures are deliberately normalized to
         * one generic AuthenticationError to prevent account-state
         * enumeration.
         *
         * Repository and password-service errors are intentionally NOT caught.
         * Those are infrastructure/dependency failures and must reach the
         * centralized error handler rather than being incorrectly reported
         * as invalid credentials.
         *
         * Authentication flow:
         *
         *   validate input
         *        ↓
         *   repository lookup
         *        ↓
         *   validate security-critical row
         *        ↓
         *   verify password
         *        ↓
         *   validate account eligibility
         *        ↓
         *   safe-user projection
         *
         * @param {string} usernameOrEmail
         * @param {string} password
         * @returns {Promise<object>}
         * @throws {AuthenticationError}
         */
        async login(usernameOrEmail, password) {
            const credentials = assertCredentialShape(
                usernameOrEmail,
                password,
            );

            /*
             * Exactly one repository lookup is performed.
             *
             * Database/repository errors intentionally propagate.
             */
            const user = await userRepo.findByUsernameOrEmail(
                credentials.usernameOrEmail,
            );

            if (!user) {
                logLoginRejection('unknown_identifier');
                throw new AuthenticationError(
                    INVALID_CREDENTIALS_MESSAGE,
                );
            }

            /*
             * Never allow malformed repository data to reach password
             * verification or account-eligibility logic.
             */
            if (!isValidLoginUser(user)) {
                logLoginRejection(
                    'malformed_user_record',
                    isValidUserId(user?.id) ? user.id : null,
                );

                throw new AuthenticationError(
                    INVALID_CREDENTIALS_MESSAGE,
                );
            }

            /*
             * Password verification intentionally happens before the
             * account-status check.
             *
             * This avoids making account eligibility the first observable
             * authentication decision after an identifier lookup.
             *
             * Errors from verifyPassword are infrastructure/dependency
             * failures and intentionally propagate unchanged.
             */
            const passwordMatches = await verifyPassword(
                credentials.password,
                user.password_hash,
            );

            if (!passwordMatches) {
                logLoginRejection('invalid_password', user.id);

                throw new AuthenticationError(
                    INVALID_CREDENTIALS_MESSAGE,
                );
            }

            /*
             * Account-state failures use the exact same public error as
             * unknown users and incorrect passwords.
             *
             * Never expose:
             *   - inactive/suspended state;
             *   - deletion state;
             *   - account existence.
             */
            if (!isEligibleForLogin(user)) {
                logLoginRejection(
                    user.deleted_at !== null
                        ? 'deleted_account'
                        : 'inactive_account',
                    user.id,
                );

                throw new AuthenticationError(
                    INVALID_CREDENTIALS_MESSAGE,
                );
            }

            logger.info(
                {
                    event: 'auth_login_success',
                    userId: user.id,
                },
                'User authenticated',
            );

            return projectSafeUser(user);
        },

        /**
         * Re-validate an authenticated user against current database state.
         *
         * This method is intentionally separate from login:
         *   - no password verification;
         *   - no session manipulation;
         *   - no cookie handling;
         *   - no HTTP logic.
         *
         * Invalid IDs and invalid/missing users return null so the
         * authentication middleware can fail closed and invalidate the
         * corresponding session.
         *
         * Repository/database errors intentionally propagate because an
         * infrastructure outage must not silently look like a normal
         * unauthenticated request.
         *
         * @param {number} userId
         * @returns {Promise<object|null>}
         */
        async getAuthenticatedUser(userId) {
            if (!isValidUserId(userId)) {
                return null;
            }

            const user = await userRepo.findById(userId);

            if (!user) {
                return null;
            }

            /*
             * Unlike login, password_hash is not required here because this
             * method never verifies a password. Requiring it would couple
             * authenticated-user validation unnecessarily to the repository's
             * authentication projection.
             */
            if (!isValidAuthenticatedUser(user)) {
                return null;
            }

            if (!ALLOWED_LOGIN_STATUSES.has(user.status)) {
                return null;
            }

            return projectSafeUser(user);
        },
    };

    return Object.freeze(service);
}

export default createAuthService();