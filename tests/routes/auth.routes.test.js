/**
 * tests/routes/auth.routes.test.js
 *
 * Production-grade security regression suite for app/routes/auth.routes.js.
 *
 * Scope:
 *   - POST /login
 *   - POST /logout
 *
 * Guarantees tested:
 *   - Strict input validation
 *   - Authentication failure propagation
 *   - Session fixation protection
 *   - Regenerated session ID hashing
 *   - Session expiry validation
 *   - DB/Express-session consistency
 *   - Compensation / rollback on partial failure
 *   - Fail-closed behavior
 *   - Safe user projection
 *   - Sensitive-data logging protection
 *   - Logout idempotency
 *   - Cookie clearing
 *   - Error propagation
 *   - Route-method regression protection
 *
 * Test characteristics:
 *   - Vitest
 *   - ESM
 *   - No HTTP server
 *   - No database
 *   - No filesystem
 *   - No network
 *   - No sleep/timers
 *   - No random values
 *   - Fixed deterministic dates
 *   - Async express-session callback behavior is simulated
 */

import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

// ============================================================================
// HOISTED MOCKS
// ============================================================================

const {
    authLoginMock,
    hashSessionIdMock,
    createSessionMock,
    revokeSessionMock,
    validateSessionMock,
    touchSessionActivityMock,
    sendSuccessMock,
    loggerInfoMock,
    loggerWarnMock,
    loggerErrorMock,
    loggerDebugMock,
    getRequestIdMock,
} = vi.hoisted(() => ({
    authLoginMock: vi.fn(),

    hashSessionIdMock: vi.fn(),
    createSessionMock: vi.fn(),
    revokeSessionMock: vi.fn(),
    validateSessionMock: vi.fn(),
    touchSessionActivityMock: vi.fn(),

    sendSuccessMock: vi.fn(),

    loggerInfoMock: vi.fn(),
    loggerWarnMock: vi.fn(),
    loggerErrorMock: vi.fn(),
    loggerDebugMock: vi.fn(),

    getRequestIdMock: vi.fn(),
}));

// ============================================================================
// MODULE MOCKS
// ============================================================================

vi.mock('../../app/services/auth/auth.service.js', () => ({
    default: {
        login: authLoginMock,
    },
}));

vi.mock('../../app/services/auth/session.service.js', () => ({
    default: {
        hashSessionId: hashSessionIdMock,
        createSession: createSessionMock,
        revokeSession: revokeSessionMock,
        validateSession: validateSessionMock,
        touchSessionActivity: touchSessionActivityMock,
    },
}));

vi.mock('../../app/core/response.js', () => ({
    sendSuccess: sendSuccessMock,
}));

vi.mock('../../app/core/logger.js', () => ({
    createChildLogger: vi.fn(() => ({
        info: loggerInfoMock,
        warn: loggerWarnMock,
        error: loggerErrorMock,
        debug: loggerDebugMock,
    })),
}));

vi.mock('../../app/core/request-context.js', () => ({
    getRequestId: getRequestIdMock,
}));

// ============================================================================
// IMPORTS AFTER MOCK REGISTRATION
// ============================================================================

import router from '../../app/routes/auth.routes.js';

import authService from '../../app/services/auth/auth.service.js';
import sessionService from '../../app/services/auth/session.service.js';

import { sendSuccess } from '../../app/core/response.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const LOGIN_PATH = '/login';
const LOGOUT_PATH = '/logout';

const SESSION_COOKIE_NAME = 'tesnow.sid';

const OLD_SESSION_ID = 'old-session-id';
const NEW_SESSION_ID = 'new-session-id';
const LOGOUT_SESSION_ID = 'logout-session-id';

const OLD_SESSION_HASH = 'a'.repeat(64);
const NEW_SESSION_HASH = 'b'.repeat(64);
const LOGOUT_SESSION_HASH = 'c'.repeat(64);

const REQUEST_ID = 'test-request-id';

const FUTURE_EXPIRY = new Date('2099-01-01T00:00:00.000Z');
const PAST_EXPIRY = new Date('2000-01-01T00:00:00.000Z');
const INVALID_EXPIRY = new Date('invalid-date');

const VALID_CREDENTIALS = Object.freeze({
    username: 'alice',
    password: 'correct horse battery staple',
});

const SAFE_USER_FIELDS = [
    'id',
    'uuid',
    'username',
    'email',
    'display_name',
    'avatar_url',
    'role',
    'is_active',
    'created_at',
];

const SENSITIVE_USER_FIELDS = [
    'password',
    'password_hash',
    'passwordHash',
    'passwordResetToken',
    'password_reset_token',
    'twoFactorSecret',
    'two_factor_secret',
    'sessionID',
    'sessionId',
    'session_id',
    'sessionToken',
    'session_token',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'apiKey',
    'api_key',
    'secret',
    'authorization',
    'cookie',
];

const RICH_USER = Object.freeze({
    id: 42,
    uuid: 'user-uuid-42',
    username: 'alice',
    email: 'alice@example.com',
    display_name: 'Alice',
    avatar_url: '/avatars/alice.png',
    role: 'user',
    is_active: true,
    created_at: '2099-01-01T00:00:00.000Z',

    // Sensitive fields deliberately included to test projection.
    password: 'VERY_SECRET_PASSWORD',
    password_hash: 'VERY_SECRET_HASH',
    passwordHash: 'VERY_SECRET_HASH_2',
    passwordResetToken: 'VERY_SECRET_RESET_TOKEN',
    password_reset_token: 'VERY_SECRET_RESET_TOKEN_2',
    twoFactorSecret: 'VERY_SECRET_2FA',
    two_factor_secret: 'VERY_SECRET_2FA_2',
    sessionID: NEW_SESSION_ID,
    sessionId: NEW_SESSION_ID,
    session_id: NEW_SESSION_ID,
    sessionToken: 'VERY_SECRET_SESSION_TOKEN',
    session_token: 'VERY_SECRET_SESSION_TOKEN_2',
    accessToken: 'VERY_SECRET_ACCESS_TOKEN',
    access_token: 'VERY_SECRET_ACCESS_TOKEN_2',
    refreshToken: 'VERY_SECRET_REFRESH_TOKEN',
    refresh_token: 'VERY_SECRET_REFRESH_TOKEN_2',
    apiKey: 'VERY_SECRET_API_KEY',
    api_key: 'VERY_SECRET_API_KEY_2',
    secret: 'VERY_SECRET',
    authorization: `Bearer ${NEW_SESSION_HASH}`,
    cookie: 'VERY_SECRET_COOKIE',
});

// ============================================================================
// ROUTE EXTRACTION
// ============================================================================

function getRouteHandler(routerInstance, method, path) {
    const stack = routerInstance?.stack || [];

    for (const layer of stack) {
        const route = layer?.route;

        if (!route) {
            continue;
        }

        if (route.path !== path) {
            continue;
        }

        if (!route.methods?.[method.toLowerCase()]) {
            continue;
        }

        const handlers = route.stack
            ?.map((stackLayer) => stackLayer.handle)
            .filter((handler) => typeof handler === 'function');

        return handlers?.at(-1) ?? null;
    }

    return null;
}

function loginHandler() {
    const handler = getRouteHandler(router, 'post', LOGIN_PATH);

    if (!handler) {
        throw new Error('POST /login handler not found');
    }

    return handler;
}

function logoutHandler() {
    const handler = getRouteHandler(router, 'post', LOGOUT_PATH);

    if (!handler) {
        throw new Error('POST /logout handler not found');
    }

    return handler;
}

// ============================================================================
// SESSION FIXTURE
// ============================================================================

function makeFakeSession(options = {}) {
    const {
        userId = undefined,
        cookie = {},
        regenerateError = null,
        saveError = null,
        destroyError = null,
        onRegenerate = null,
        asyncCallbacks = false,
        events = null,
    } = options;

    const runCallback = (callback, error = null) => {
        if (asyncCallbacks) {
            queueMicrotask(() => callback(error));
            return;
        }

        callback(error);
    };

    const session = {
        userId,

        cookie: {
            path: '/',
            ...cookie,
        },

        regenerate: vi.fn((callback) => {
            events?.push('session.regenerate');

            if (regenerateError) {
                runCallback(callback, regenerateError);
                return;
            }

            if (typeof onRegenerate === 'function') {
                onRegenerate();
            }

            runCallback(callback, null);
        }),

        save: vi.fn((callback) => {
            events?.push('session.save');

            if (saveError) {
                runCallback(callback, saveError);
                return;
            }

            runCallback(callback, null);
        }),

        destroy: vi.fn((callback) => {
            events?.push('session.destroy');

            if (destroyError) {
                runCallback(callback, destroyError);
                return;
            }

            runCallback(callback, null);
        }),
    };

    return session;
}

// ============================================================================
// REQUEST / RESPONSE FIXTURES
// ============================================================================

function makeReq(overrides = {}) {
    return {
        id: 'req-id-1',
        method: 'POST',
        body: undefined,
        sessionID: OLD_SESSION_ID,
        session: makeFakeSession(),
        ...overrides,
    };
}

function makeRes() {
    const state = {
        statusCode: null,
        jsonBody: null,
        clearedCookies: [],
    };

    const res = {
        state,

        status(code) {
            state.statusCode = code;
            return res;
        },

        json(body) {
            state.jsonBody = body;
            return res;
        },

        clearCookie(name, options) {
            state.clearedCookies.push({
                name,
                opts: options,
            });

            return res;
        },
    };

    return res;
}

function makeNext() {
    return vi.fn();
}

async function invokeHandler(handler, req, res) {
    const next = makeNext();

    await handler(req, res, next);

    return {
        next,
        res,
    };
}

// ============================================================================
// LOGGING INSPECTION
// ============================================================================

function flattenForSecurityInspection(value, output = []) {
    if (value === null || value === undefined) {
        return output;
    }

    if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    ) {
        output.push(String(value));
        return output;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            flattenForSecurityInspection(item, output);
        }

        return output;
    }

    if (typeof value === 'object') {
        for (const [key, nestedValue] of Object.entries(value)) {
            output.push(String(key));
            flattenForSecurityInspection(nestedValue, output);
        }
    }

    return output;
}

function getAllLoggerArguments() {
    return [
        ...loggerInfoMock.mock.calls,
        ...loggerWarnMock.mock.calls,
        ...loggerErrorMock.mock.calls,
        ...loggerDebugMock.mock.calls,
    ].flatMap((call) => flattenForSecurityInspection(call));
}

function expectNoSensitiveLogging() {
    const loggedValues = getAllLoggerArguments();

    const forbiddenValues = [
        OLD_SESSION_ID,
        NEW_SESSION_ID,
        LOGOUT_SESSION_ID,
        OLD_SESSION_HASH,
        NEW_SESSION_HASH,
        LOGOUT_SESSION_HASH,
        VALID_CREDENTIALS.password,
        RICH_USER.password,
        RICH_USER.password_hash,
        RICH_USER.passwordHash,
        RICH_USER.passwordResetToken,
        RICH_USER.twoFactorSecret,
        RICH_USER.sessionToken,
        RICH_USER.accessToken,
        RICH_USER.refreshToken,
        RICH_USER.apiKey,
        RICH_USER.secret,
        RICH_USER.authorization,
        RICH_USER.cookie,
    ];

    for (const forbidden of forbiddenValues) {
        expect(loggedValues).not.toContain(forbidden);
    }
}

// ============================================================================
// COOKIE ASSERTIONS
// ============================================================================

function expectCookieCleared(res, expected = {}) {
    expect(res.state.clearedCookies).toHaveLength(1);

    const cleared = res.state.clearedCookies[0];

    expect(cleared.name).toBe(SESSION_COOKIE_NAME);

    if (Object.prototype.hasOwnProperty.call(expected, 'path')) {
        expect(cleared.opts.path).toBe(expected.path);
    }

    if (Object.prototype.hasOwnProperty.call(expected, 'domain')) {
        expect(cleared.opts.domain).toBe(expected.domain);
    }
}

// ============================================================================
// SHARED SETUP
// ============================================================================

beforeEach(() => {
    vi.clearAllMocks();

    getRequestIdMock.mockReturnValue(REQUEST_ID);

    authService.login.mockResolvedValue(RICH_USER);

    sessionService.hashSessionId.mockImplementation(() => {
        return NEW_SESSION_HASH;
    });

    sessionService.createSession.mockResolvedValue(undefined);

    sessionService.revokeSession.mockResolvedValue(undefined);

    sessionService.validateSession.mockResolvedValue(null);

    sessionService.touchSessionActivity.mockResolvedValue(undefined);

    sendSuccess.mockImplementation((res, options = {}) => {
        res.status(200).json({
            success: true,
            ...options,
        });

        return res;
    });
});

// ============================================================================
// ROUTER SHAPE
// ============================================================================

describe('auth.routes.js — router shape', () => {
    it('exports a router as the default export', () => {
        expect(router).toBeTruthy();
        expect(typeof router.post).toBe('function');
    });

    it('defines POST /login', () => {
        expect(getRouteHandler(router, 'post', LOGIN_PATH))
            .toEqual(expect.any(Function));
    });

    it('defines POST /logout', () => {
        expect(getRouteHandler(router, 'post', LOGOUT_PATH))
            .toEqual(expect.any(Function));
    });

    it('does not define GET /login', () => {
        expect(getRouteHandler(router, 'get', LOGIN_PATH))
            .toBeNull();
    });

    it('does not define GET /logout', () => {
        expect(getRouteHandler(router, 'get', LOGOUT_PATH))
            .toBeNull();
    });

    it.each([
        ['put', LOGIN_PATH],
        ['patch', LOGIN_PATH],
        ['delete', LOGIN_PATH],
        ['put', LOGOUT_PATH],
        ['patch', LOGOUT_PATH],
        ['delete', LOGOUT_PATH],
    ])('does not define %s %s', (method, path) => {
        expect(getRouteHandler(router, method, path))
            .toBeNull();
    });
});

// ============================================================================
// LOGIN — INPUT VALIDATION
// ============================================================================

describe('POST /login — input validation', () => {
    const invalidBodies = [
        ['undefined body', undefined],
        ['null body', null],
        ['array body', []],
        ['string body', 'alice'],
        ['number body', 42],
        ['empty object', {}],

        ['empty username', {
            username: '',
            password: 'x',
        }],

        ['whitespace username', {
            username: '   ',
            password: 'x',
        }],

        ['numeric username', {
            username: 123,
            password: 'x',
        }],

        ['object username', {
            username: {
                value: 'alice',
            },
            password: 'x',
        }],

        ['array username', {
            username: ['alice'],
            password: 'x',
        }],

        ['empty email', {
            email: '',
            password: 'x',
        }],

        ['whitespace email', {
            email: '   ',
            password: 'x',
        }],

        ['numeric email', {
            email: 123,
            password: 'x',
        }],

        ['object email', {
            email: {},
            password: 'x',
        }],

        ['missing password', {
            username: 'alice',
        }],

        ['empty password', {
            username: 'alice',
            password: '',
        }],

        ['whitespace password', {
            username: 'alice',
            password: '   ',
        }],

        ['numeric password', {
            username: 'alice',
            password: 123,
        }],

        ['object password', {
            username: 'alice',
            password: {},
        }],

        ['array password', {
            username: 'alice',
            password: [],
        }],

        ['oversized username', {
            username: 'a'.repeat(321),
            password: 'x',
        }],

        ['oversized email', {
            email: 'a'.repeat(321),
            password: 'x',
        }],

        ['oversized password', {
            username: 'alice',
            password: 'x'.repeat(1025),
        }],
    ];

    it.each(invalidBodies)(
        'rejects %s before authentication/session mutation',
        async (_label, body) => {
            const session = makeFakeSession();

            const req = makeReq({
                body,
                session,
            });

            const res = makeRes();

            const { next } = await invokeHandler(
                loginHandler(),
                req,
                res,
            );

            expect(authService.login).not.toHaveBeenCalled();

            expect(session.regenerate).not.toHaveBeenCalled();
            expect(session.save).not.toHaveBeenCalled();
            expect(session.destroy).not.toHaveBeenCalled();

            expect(sessionService.hashSessionId).not.toHaveBeenCalled();
            expect(sessionService.createSession).not.toHaveBeenCalled();
            expect(sessionService.revokeSession).not.toHaveBeenCalled();

            expect(next).toHaveBeenCalledTimes(1);
            expect(next.mock.calls[0][0]).toBeInstanceOf(Error);

            expect(res.state.jsonBody).toBeNull();
            expect(sendSuccess).not.toHaveBeenCalled();
        },
    );

    it('accepts valid username/password credentials', async () => {
        const session = makeFakeSession();

        session.cookie.expires = FUTURE_EXPIRY;

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
        });

        const res = makeRes();

        await invokeHandler(loginHandler(), req, res);

        expect(authService.login).toHaveBeenCalledTimes(1);

        expect(authService.login).toHaveBeenCalledWith(
            VALID_CREDENTIALS.username,
            VALID_CREDENTIALS.password,
        );
    });

    it('never places password or sensitive field names into validation errors', async () => {
        const req = makeReq({
            body: {
                username: 'alice',
                password: 123,
            },
        });

        const res = makeRes();

        const { next } = await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(next).toHaveBeenCalledTimes(1);

        const error = next.mock.calls[0][0];

        const serialized = [
            error?.message,
            error?.details,
            error?.code,
        ]
            .map((value) => JSON.stringify(value ?? ''))
            .join(' ');

        expect(serialized).not.toContain(
            VALID_CREDENTIALS.password,
        );

        for (const field of SENSITIVE_USER_FIELDS) {
            expect(serialized).not.toContain(field);
        }
    });
});

// ============================================================================
// LOGIN — AUTHENTICATION FAILURE
// ============================================================================

describe('POST /login — authentication failure', () => {
    it('forwards authentication error and does not mutate session state', async () => {
        const authenticationError = new Error(
            'Invalid credentials',
        );

        authenticationError.name = 'AuthenticationError';

        authService.login.mockRejectedValue(
            authenticationError,
        );

        const session = makeFakeSession();

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
        });

        const res = makeRes();

        const { next } = await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0][0])
            .toBe(authenticationError);

        expect(session.regenerate).not.toHaveBeenCalled();
        expect(session.save).not.toHaveBeenCalled();
        expect(session.destroy).not.toHaveBeenCalled();

        expect(sessionService.hashSessionId)
            .not.toHaveBeenCalled();

        expect(sessionService.createSession)
            .not.toHaveBeenCalled();

        expect(sessionService.revokeSession)
            .not.toHaveBeenCalled();

        expect(sendSuccess).not.toHaveBeenCalled();
        expect(res.state.jsonBody).toBeNull();
    });
});

// ============================================================================
// LOGIN — SESSION FIXATION
// ============================================================================

describe('POST /login — session fixation protection', () => {
    it('regenerates before hashing and persists only the new session ID', async () => {
        const events = [];

        let currentSessionId = OLD_SESSION_ID;

        const session = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },

            events,

            onRegenerate: () => {
                currentSessionId = NEW_SESSION_ID;
            },
        });

        const req = {
            ...makeReq({
                body: {
                    ...VALID_CREDENTIALS,
                },
                session,
            }),

            get sessionID() {
                return currentSessionId;
            },
        };

        sessionService.hashSessionId.mockImplementation(
            (sessionId) => {
                events.push(`hash:${sessionId}`);

                expect(sessionId).toBe(NEW_SESSION_ID);

                return NEW_SESSION_HASH;
            },
        );

        sessionService.createSession.mockImplementation(
            async (userId, hash, expiresAt) => {
                events.push('db.create');

                expect(userId).toBe(42);
                expect(hash).toBe(NEW_SESSION_HASH);
                expect(expiresAt).toEqual(FUTURE_EXPIRY);
            },
        );

        session.save.mockImplementation((callback) => {
            events.push('session.save');

            callback(null);
        });

        const res = makeRes();

        const { next } = await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(events).toEqual([
            'session.regenerate',
            `hash:${NEW_SESSION_ID}`,
            'db.create',
            'session.save',
        ]);

        expect(sessionService.hashSessionId)
            .toHaveBeenCalledTimes(1);

        expect(sessionService.hashSessionId)
            .not.toHaveBeenCalledWith(OLD_SESSION_ID);

        expect(sessionService.createSession)
            .toHaveBeenCalledWith(
                42,
                NEW_SESSION_HASH,
                FUTURE_EXPIRY,
            );

        expect(req.session.userId).toBe(42);

        expect(next).not.toHaveBeenCalled();
        expect(sendSuccess).toHaveBeenCalledTimes(1);
    });

    it('never creates a DB session using the old session hash', async () => {
        let currentSessionId = OLD_SESSION_ID;

        const session = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },

            onRegenerate: () => {
                currentSessionId = NEW_SESSION_ID;
            },
        });

        const req = {
            ...makeReq({
                body: {
                    ...VALID_CREDENTIALS,
                },
                session,
            }),

            get sessionID() {
                return currentSessionId;
            },
        };

        sessionService.hashSessionId.mockImplementation(
            (id) => {
                if (id === OLD_SESSION_ID) {
                    return OLD_SESSION_HASH;
                }

                if (id === NEW_SESSION_ID) {
                    return NEW_SESSION_HASH;
                }

                throw new Error('unexpected session ID');
            },
        );

        const res = makeRes();

        await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(sessionService.createSession)
            .toHaveBeenCalledWith(
                42,
                NEW_SESSION_HASH,
                FUTURE_EXPIRY,
            );

        expect(sessionService.createSession)
            .not.toHaveBeenCalledWith(
                42,
                OLD_SESSION_HASH,
                expect.any(Date),
            );
    });
});

// ============================================================================
// LOGIN — ASYNC SESSION CALLBACKS
// ============================================================================

describe('POST /login — asynchronous express-session callbacks', () => {
    it('handles asynchronous regenerate/save callbacks correctly', async () => {
        let currentSessionId = OLD_SESSION_ID;

        const session = makeFakeSession({
            asyncCallbacks: true,

            cookie: {
                expires: FUTURE_EXPIRY,
            },

            onRegenerate: () => {
                currentSessionId = NEW_SESSION_ID;
            },
        });

        const req = {
            ...makeReq({
                body: {
                    ...VALID_CREDENTIALS,
                },
                session,
            }),

            get sessionID() {
                return currentSessionId;
            },
        };

        sessionService.hashSessionId.mockReturnValue(
            NEW_SESSION_HASH,
        );

        const res = makeRes();

        const { next } = await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(session.regenerate).toHaveBeenCalledTimes(1);
        expect(session.save).toHaveBeenCalledTimes(1);

        expect(sessionService.createSession)
            .toHaveBeenCalledWith(
                42,
                NEW_SESSION_HASH,
                FUTURE_EXPIRY,
            );

        expect(sendSuccess).toHaveBeenCalledTimes(1);
        expect(next).not.toHaveBeenCalled();
    });
});

// ============================================================================
// LOGIN — REGENERATION FAILURE
// ============================================================================

describe('POST /login — regeneration failure', () => {
    it('does not create a DB session after regenerate failure', async () => {
        const regenerateError = new Error(
            'regenerate failed',
        );

        const session = makeFakeSession({
            regenerateError,
        });

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
        });

        const res = makeRes();

        const { next } = await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0][0])
            .toBe(regenerateError);

        expect(sessionService.hashSessionId)
            .not.toHaveBeenCalled();

        expect(sessionService.createSession)
            .not.toHaveBeenCalled();

        expect(sessionService.revokeSession)
            .not.toHaveBeenCalled();

        expect(session.save).not.toHaveBeenCalled();
    });
});

// ============================================================================
// LOGIN — SESSION EXPIRY
// ============================================================================

describe('POST /login — session expiration', () => {
    it('fails closed when cookie.expires is missing', async () => {
        const session = makeFakeSession();

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
        });

        const res = makeRes();

        const { next } = await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(next).toHaveBeenCalledTimes(1);

        expect(sessionService.createSession)
            .not.toHaveBeenCalled();

        expect(sessionService.revokeSession)
            .not.toHaveBeenCalled();

        expect(session.destroy).toHaveBeenCalledTimes(1);

        expectCookieCleared(res);
    });

    it('fails closed when cookie.expires is invalid', async () => {
        const session = makeFakeSession({
            cookie: {
                expires: INVALID_EXPIRY,
            },
        });

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
        });

        const res = makeRes();

        const { next } = await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(next).toHaveBeenCalledTimes(1);

        expect(sessionService.createSession)
            .not.toHaveBeenCalled();

        expect(session.destroy).toHaveBeenCalledTimes(1);

        expectCookieCleared(res);
    });

    it('fails closed when cookie.expires is in the past', async () => {
        const session = makeFakeSession({
            cookie: {
                expires: PAST_EXPIRY,
            },
        });

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
        });

        const res = makeRes();

        const { next } = await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(next).toHaveBeenCalledTimes(1);

        expect(sessionService.createSession)
            .not.toHaveBeenCalled();

        expect(session.destroy).toHaveBeenCalledTimes(1);

        expectCookieCleared(res);
    });
});

// ============================================================================
// LOGIN — SESSION ID FAILURE
// ============================================================================

describe('POST /login — regenerated session ID integrity', () => {
    it('fails closed when regenerated sessionID is missing', async () => {
        const session = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },
        });

        const req = {
            ...makeReq({
                body: {
                    ...VALID_CREDENTIALS,
                },
                session,
            }),

            sessionID: undefined,
        };

        const res = makeRes();

        const { next } = await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(next).toHaveBeenCalledTimes(1);

        expect(sessionService.hashSessionId)
            .not.toHaveBeenCalled();

        expect(sessionService.createSession)
            .not.toHaveBeenCalled();

        expect(session.destroy).toHaveBeenCalledTimes(1);

        expectCookieCleared(res);
    });

    it('fails closed when regenerated sessionID is invalid', async () => {
        const session = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },
        });

        const req = {
            ...makeReq({
                body: {
                    ...VALID_CREDENTIALS,
                },
                session,
            }),

            sessionID: '',
        };

        const res = makeRes();

        const { next } = await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(next).toHaveBeenCalledTimes(1);

        expect(sessionService.createSession)
            .not.toHaveBeenCalled();

        expect(session.destroy).toHaveBeenCalledTimes(1);

        expectCookieCleared(res);
    });
});

// ============================================================================
// LOGIN — HASH FAILURE
// ============================================================================

describe('POST /login — session hash failure', () => {
    it('does not create a DB session when hashing fails', async () => {
        const hashError = new Error('hash failed');

        sessionService.hashSessionId.mockImplementation(() => {
            throw hashError;
        });

        const session = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },
        });

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
        });

        const res = makeRes();

        const { next } = await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(sessionService.createSession)
            .not.toHaveBeenCalled();

        expect(sessionService.revokeSession)
            .not.toHaveBeenCalled();

        expect(session.destroy).toHaveBeenCalledTimes(1);

        expectCookieCleared(res);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0][0])
            .toBe(hashError);
    });
});

// ============================================================================
// LOGIN — DB CREATE FAILURE
// ============================================================================

describe('POST /login — DB session creation failure', () => {
    it('destroys Express session and clears cookie', async () => {
        const dbError = new Error(
            'database create failed',
        );

        dbError.code = 'ER_DUP_ENTRY';

        sessionService.createSession.mockRejectedValue(
            dbError,
        );

        const session = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },
        });

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
        });

        const res = makeRes();

        const { next } = await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(sessionService.createSession)
            .toHaveBeenCalledTimes(1);

        expect(session.save).not.toHaveBeenCalled();

        expect(sessionService.revokeSession)
            .not.toHaveBeenCalled();

        expect(session.destroy).toHaveBeenCalledTimes(1);

        expectCookieCleared(res);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0][0])
            .toBe(dbError);

        expect(sendSuccess).not.toHaveBeenCalled();
    });

    it('never persists Express session when DB creation fails', async () => {
        sessionService.createSession.mockRejectedValue(
            new Error('DB unavailable'),
        );

        const session = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },
        });

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
        });

        const res = makeRes();

        await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(session.save).not.toHaveBeenCalled();
    });
});

// ============================================================================
// LOGIN — SAVE FAILURE / COMPENSATION
// ============================================================================

describe('POST /login — Express session save failure', () => {
    it('revokes the exact DB session that was created', async () => {
        const saveError = new Error(
            'express session save failed',
        );

        const session = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },

            saveError,
        });

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
        });

        sessionService.hashSessionId.mockReturnValue(
            NEW_SESSION_HASH,
        );

        sessionService.createSession.mockResolvedValue(
            undefined,
        );

        const res = makeRes();

        const { next } = await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(sessionService.createSession)
            .toHaveBeenCalledWith(
                42,
                NEW_SESSION_HASH,
                FUTURE_EXPIRY,
            );

        expect(sessionService.revokeSession)
            .toHaveBeenCalledTimes(1);

        expect(sessionService.revokeSession)
            .toHaveBeenCalledWith(
                NEW_SESSION_HASH,
            );

        expect(session.destroy).toHaveBeenCalledTimes(1);

        expectCookieCleared(res);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0][0])
            .toBe(saveError);

        expect(sendSuccess).not.toHaveBeenCalled();
    });

    it('does not expose compensation errors instead of the original save error', async () => {
        const saveError = new Error(
            'original save error',
        );

        const revokeError = new Error(
            'rollback error',
        );

        sessionService.revokeSession.mockRejectedValue(
            revokeError,
        );

        const session = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },

            saveError,
        });

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
        });

        const res = makeRes();

        const { next } = await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(session.destroy).toHaveBeenCalledTimes(1);

        expectCookieCleared(res);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0][0])
            .toBe(saveError);

        expect(next.mock.calls[0][0])
            .not.toBe(revokeError);
    });

    it('still destroys Express session when DB rollback fails', async () => {
        const saveError = new Error(
            'save failed',
        );

        const revokeError = new Error(
            'revoke failed',
        );

        sessionService.revokeSession.mockRejectedValue(
            revokeError,
        );

        const session = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },

            saveError,
        });

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
        });

        const res = makeRes();

        const { next } = await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(session.destroy).toHaveBeenCalledTimes(1);
        expectCookieCleared(res);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0][0])
            .toBe(saveError);
    });

    it('still clears cookie when rollback and destroy both fail', async () => {
        const saveError = new Error(
            'save failed',
        );

        sessionService.revokeSession.mockRejectedValue(
            new Error('rollback failed'),
        );

        const session = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },

            saveError,

            destroyError: new Error(
                'destroy failed',
            ),
        });

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
        });

        const res = makeRes();

        const { next } = await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(sessionService.revokeSession)
            .toHaveBeenCalledWith(
                NEW_SESSION_HASH,
            );

        expect(session.destroy)
            .toHaveBeenCalledTimes(1);

        expectCookieCleared(res);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0][0])
            .toBe(saveError);
    });
});

// ============================================================================
// LOGIN — SAFE USER PROJECTION
// ============================================================================

describe('POST /login — safe user projection', () => {
    it('returns exactly the explicitly allowed user fields', async () => {
        const session = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },
        });

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
        });

        const res = makeRes();

        await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(sendSuccess)
            .toHaveBeenCalledTimes(1);

        const payload =
            sendSuccess.mock.calls[0][1];

        const returnedUser =
            payload?.data?.user;

        expect(returnedUser).toBeTruthy();

        const expectedUser = Object.fromEntries(
            SAFE_USER_FIELDS
                .filter((field) =>
                    Object.prototype.hasOwnProperty.call(
                        RICH_USER,
                        field,
                    ),
                )
                .map((field) => [
                    field,
                    RICH_USER[field],
                ]),
        );

        expect(Object.keys(returnedUser).sort())
            .toEqual(
                Object.keys(expectedUser).sort(),
            );

        expect(returnedUser)
            .toEqual(expectedUser);
    });

    it('does not expose any known sensitive user field', async () => {
        const session = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },
        });

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
        });

        const res = makeRes();

        await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        const user =
            sendSuccess.mock.calls[0][1]
                ?.data?.user;

        for (const field of SENSITIVE_USER_FIELDS) {
            expect(
                Object.prototype.hasOwnProperty.call(
                    user,
                    field,
                ),
            ).toBe(false);
        }
    });

    it('does not expose arbitrary internal fields outside the allowlist', async () => {
        const internalUser = {
            ...RICH_USER,

            internalAdminFlag: true,
            permissions: [
                'user.read',
                'user.write',
            ],
            internalNotes: 'PRIVATE',
            databaseId: 'DB-INTERNAL-ID',
        };

        authService.login.mockResolvedValue(
            internalUser,
        );

        const session = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },
        });

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
        });

        const res = makeRes();

        await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        const user =
            sendSuccess.mock.calls[0][1]
                ?.data?.user;

        expect(Object.keys(user).sort())
            .toEqual(
                SAFE_USER_FIELDS
                    .filter((field) =>
                        Object.prototype.hasOwnProperty.call(
                            internalUser,
                            field,
                        ),
                    )
                    .sort(),
            );

        expect(user.internalAdminFlag)
            .toBeUndefined();

        expect(user.permissions)
            .toBeUndefined();

        expect(user.internalNotes)
            .toBeUndefined();

        expect(user.databaseId)
            .toBeUndefined();
    });
});

// ============================================================================
// LOGIN — USER OBJECT INTEGRITY
// ============================================================================

describe('POST /login — authenticated user integrity', () => {
    it('fails closed when auth service returns no user', async () => {
        authService.login.mockResolvedValue(null);

        const session = makeFakeSession();

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
        });

        const res = makeRes();

        const { next } = await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(next).toHaveBeenCalledTimes(1);

        expect(session.regenerate)
            .not.toHaveBeenCalled();

        expect(sessionService.createSession)
            .not.toHaveBeenCalled();

        expect(sendSuccess)
            .not.toHaveBeenCalled();
    });

    it('fails closed when authenticated user has invalid ID', async () => {
        authService.login.mockResolvedValue({
            ...RICH_USER,
            id: 0,
        });

        const session = makeFakeSession();

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
        });

        const res = makeRes();

        const { next } = await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(next).toHaveBeenCalledTimes(1);

        expect(sessionService.createSession)
            .not.toHaveBeenCalled();

        expect(sendSuccess)
            .not.toHaveBeenCalled();
    });
});

// ============================================================================
// LOGGING SECURITY
// ============================================================================

describe('logging security', () => {
    it('does not log credentials/session secrets on successful login', async () => {
        const session = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },
        });

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
            sessionID: NEW_SESSION_ID,
        });

        const res = makeRes();

        await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expectNoSensitiveLogging();
    });

    it('does not log raw session secrets during login failure compensation', async () => {
        sessionService.createSession.mockRejectedValue(
            new Error('DB failure'),
        );

        const session = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },
        });

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
            sessionID: NEW_SESSION_ID,
        });

        const res = makeRes();

        await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expectNoSensitiveLogging();
    });

    it('does not log raw session ID/hash during logout DB failure', async () => {
        sessionService.revokeSession.mockRejectedValue(
            new Error('DB unavailable'),
        );

        const session = makeFakeSession({
            userId: 42,
        });

        sessionService.hashSessionId
            .mockReturnValue(LOGOUT_SESSION_HASH);

        const req = makeReq({
            session,
            sessionID: LOGOUT_SESSION_ID,
        });

        sessionService.hashSessionId.mockReturnValue(
            LOGOUT_SESSION_HASH,
        );

        const res = makeRes();

        await invokeHandler(
            logoutHandler(),
            req,
            res,
        );

        expectNoSensitiveLogging();
    });
});

// ============================================================================
// LOGOUT — IDEMPOTENCY
// ============================================================================

describe('POST /logout — idempotency', () => {
    it('succeeds when sessionID is missing', async () => {
        const session = makeFakeSession({
            userId: 42,
        });

        const req = makeReq({
            session,
            sessionID: undefined,
        });

        const res = makeRes();

        const { next } = await invokeHandler(
            logoutHandler(),
            req,
            res,
        );

        expect(sessionService.hashSessionId)
            .not.toHaveBeenCalled();

        expect(sessionService.revokeSession)
            .not.toHaveBeenCalled();

        expect(session.destroy)
            .not.toHaveBeenCalled();

        expectCookieCleared(res);

        expect(sendSuccess)
            .toHaveBeenCalledTimes(1);

        expect(next)
            .not.toHaveBeenCalled();
    });

    it('attempts DB revocation even when userId is missing', async () => {
        const session = makeFakeSession({
            userId: undefined,
        });

        const req = makeReq({
            session,
            sessionID: LOGOUT_SESSION_ID,
        });

        sessionService.hashSessionId.mockReturnValue(
            LOGOUT_SESSION_HASH,
        );

        const res = makeRes();

        const { next } = await invokeHandler(
            logoutHandler(),
            req,
            res,
        );

        expect(sessionService.hashSessionId)
            .toHaveBeenCalledWith(
                LOGOUT_SESSION_ID,
            );

        expect(sessionService.revokeSession)
            .toHaveBeenCalledWith(
                LOGOUT_SESSION_HASH,
            );

        expect(session.destroy)
            .toHaveBeenCalledTimes(1);

        expectCookieCleared(res);

        expect(next)
            .not.toHaveBeenCalled();
    });

    it('does not require userId to clear the session', async () => {
        const session = makeFakeSession({
            userId: undefined,
        });

        const req = makeReq({
            session,
            sessionID: LOGOUT_SESSION_ID,
        });

        const res = makeRes();

        await invokeHandler(
            logoutHandler(),
            req,
            res,
        );

        expect(session.destroy)
            .toHaveBeenCalledTimes(1);

        expectCookieCleared(res);
    });
});

// ============================================================================
// LOGOUT — SUCCESS
// ============================================================================

describe('POST /logout — success', () => {
    it('revokes DB session, clears userId, destroys session and clears cookie', async () => {
        const session = makeFakeSession({
            userId: 42,
        });

        const req = makeReq({
            session,
            sessionID: LOGOUT_SESSION_ID,
        });

        sessionService.hashSessionId.mockReturnValue(
            LOGOUT_SESSION_HASH,
        );

        const res = makeRes();

        const { next } = await invokeHandler(
            logoutHandler(),
            req,
            res,
        );

        expect(sessionService.hashSessionId)
            .toHaveBeenCalledTimes(1);

        expect(sessionService.hashSessionId)
            .toHaveBeenCalledWith(
                LOGOUT_SESSION_ID,
            );

        expect(sessionService.revokeSession)
            .toHaveBeenCalledTimes(1);

        expect(sessionService.revokeSession)
            .toHaveBeenCalledWith(
                LOGOUT_SESSION_HASH,
            );

        expect(session.userId)
            .toBeUndefined();

        expect(session.destroy)
            .toHaveBeenCalledTimes(1);

        expectCookieCleared(res);

        expect(sendSuccess)
            .toHaveBeenCalledTimes(1);

        expect(next)
            .not.toHaveBeenCalled();
    });

    it('does not return the session ID/hash in the success response', async () => {
        const session = makeFakeSession({
            userId: 42,
        });

        const req = makeReq({
            session,
            sessionID: LOGOUT_SESSION_ID,
        });

        sessionService.hashSessionId.mockReturnValue(
            LOGOUT_SESSION_HASH,
        );

        const res = makeRes();

        await invokeHandler(
            logoutHandler(),
            req,
            res,
        );

        const serialized = JSON.stringify(
            sendSuccess.mock.calls[0] ?? [],
        );

        expect(serialized)
            .not.toContain(LOGOUT_SESSION_ID);

        expect(serialized)
            .not.toContain(LOGOUT_SESSION_HASH);
    });
});

// ============================================================================
// LOGOUT — DB REVOKE FAILURE
// ============================================================================

describe('POST /logout — DB revoke failure', () => {
    it('still destroys Express session and clears cookie', async () => {
        const revokeError = new Error(
            'database unavailable',
        );

        sessionService.revokeSession.mockRejectedValue(
            revokeError,
        );

        const session = makeFakeSession({
            userId: 42,
        });

        const req = makeReq({
            session,
            sessionID: LOGOUT_SESSION_ID,
        });

        sessionService.hashSessionId.mockReturnValue(
            LOGOUT_SESSION_HASH,
        );

        const res = makeRes();

        const { next } = await invokeHandler(
            logoutHandler(),
            req,
            res,
        );

        expect(sessionService.revokeSession)
            .toHaveBeenCalledWith(
                LOGOUT_SESSION_HASH,
            );

        expect(session.userId)
            .toBeUndefined();

        expect(session.destroy)
            .toHaveBeenCalledTimes(1);

        expectCookieCleared(res);

        expect(sendSuccess)
            .toHaveBeenCalledTimes(1);

        expect(next)
            .not.toHaveBeenCalled();
    });
});

// ============================================================================
// LOGOUT — HASH FAILURE
// ============================================================================

describe('POST /logout — session hash failure', () => {
    it('does not attempt DB revoke but still destroys/clears session', async () => {
        const hashError = new Error(
            'hash failed',
        );

        sessionService.hashSessionId.mockImplementation(
            () => {
                throw hashError;
            },
        );

        const session = makeFakeSession({
            userId: 42,
        });

        const req = makeReq({
            session,
            sessionID: LOGOUT_SESSION_ID,
        });

        const res = makeRes();

        const { next } = await invokeHandler(
            logoutHandler(),
            req,
            res,
        );

        expect(sessionService.revokeSession)
            .not.toHaveBeenCalled();

        expect(session.userId)
            .toBeUndefined();

        expect(session.destroy)
            .toHaveBeenCalledTimes(1);

        expectCookieCleared(res);

        expect(next).toHaveBeenCalledTimes(1);

        expect(next.mock.calls[0][0])
            .toBe(hashError);

        expect(sendSuccess)
            .not.toHaveBeenCalled();
    });
});

// ============================================================================
// LOGOUT — DESTROY FAILURE
// ============================================================================

describe('POST /logout — Express session destroy failure', () => {
    it('clears cookie and does not resurrect authenticated state', async () => {
        const destroyError = new Error(
            'destroy failed',
        );

        const session = makeFakeSession({
            userId: 42,
            destroyError,
        });

        const req = makeReq({
            session,
            sessionID: LOGOUT_SESSION_ID,
        });

        sessionService.hashSessionId.mockReturnValue(
            LOGOUT_SESSION_HASH,
        );

        const res = makeRes();

        const { next } = await invokeHandler(
            logoutHandler(),
            req,
            res,
        );

        expect(sessionService.revokeSession)
            .toHaveBeenCalledWith(
                LOGOUT_SESSION_HASH,
            );

        expect(session.userId)
            .toBeUndefined();

        expect(session.destroy)
            .toHaveBeenCalledTimes(1);

        expectCookieCleared(res);

        expect(sendSuccess)
            .toHaveBeenCalledTimes(1);

        expect(next)
            .not.toHaveBeenCalled();
    });
});

// ============================================================================
// LOGOUT — DESTROY + DB FAILURE
// ============================================================================

describe('POST /logout — combined cleanup failure', () => {
    it('still clears client cookie when both DB revoke and destroy fail', async () => {
        sessionService.revokeSession.mockRejectedValue(
            new Error('DB revoke failed'),
        );

        const session = makeFakeSession({
            userId: 42,
            destroyError: new Error(
                'Express destroy failed',
            ),
        });

        const req = makeReq({
            session,
            sessionID: LOGOUT_SESSION_ID,
        });

        sessionService.hashSessionId.mockReturnValue(
            LOGOUT_SESSION_HASH,
        );

        const res = makeRes();

        const { next } = await invokeHandler(
            logoutHandler(),
            req,
            res,
        );

        expect(session.userId)
            .toBeUndefined();

        expect(session.destroy)
            .toHaveBeenCalledTimes(1);

        expectCookieCleared(res);

        expect(sendSuccess)
            .toHaveBeenCalledTimes(1);

        expect(next)
            .not.toHaveBeenCalled();
    });
});

// ============================================================================
// LOGOUT — MISSING SESSION OBJECT
// ============================================================================

describe('POST /logout — missing session object', () => {
    it('does not crash when req.session is missing', async () => {
        const req = makeReq({
            session: undefined,
            sessionID: undefined,
        });

        const res = makeRes();

        const { next } = await invokeHandler(
            logoutHandler(),
            req,
            res,
        );

        /*
         * The route should remain idempotent and should not
         * attempt database operations when no session ID exists.
         */
        expect(sessionService.hashSessionId)
            .not.toHaveBeenCalled();

        expect(sessionService.revokeSession)
            .not.toHaveBeenCalled();

        expect(sendSuccess)
            .toHaveBeenCalledTimes(1);

        expect(next)
            .not.toHaveBeenCalled();

        expectCookieCleared(res);
    });
});

// ============================================================================
// COOKIE SECURITY
// ============================================================================

describe('session cookie clearing', () => {
    it('uses the exact configured session cookie name', async () => {
        const session = makeFakeSession({
            userId: 42,
            cookie: {
                path: '/',
            },
        });

        const req = makeReq({
            session,
            sessionID: LOGOUT_SESSION_ID,
        });

        const res = makeRes();

        await invokeHandler(
            logoutHandler(),
            req,
            res,
        );

        expectCookieCleared(res, {
            path: '/',
        });
    });

    it('preserves configured cookie path', async () => {
        const session = makeFakeSession({
            userId: 42,
            cookie: {
                path: '/app',
            },
        });

        const req = makeReq({
            session,
            sessionID: LOGOUT_SESSION_ID,
        });

        const res = makeRes();

        await invokeHandler(
            logoutHandler(),
            req,
            res,
        );

        expectCookieCleared(res, {
            path: '/app',
        });
    });

    it('preserves configured cookie domain', async () => {
        const session = makeFakeSession({
            userId: 42,
            cookie: {
                path: '/app',
                domain: '.tesnow.example',
            },
        });

        const req = makeReq({
            session,
            sessionID: LOGOUT_SESSION_ID,
        });

        const res = makeRes();

        await invokeHandler(
            logoutHandler(),
            req,
            res,
        );

        expectCookieCleared(res, {
            path: '/app',
            domain: '.tesnow.example',
        });
    });

    it('does not invent an unrelated cookie name', async () => {
        const session = makeFakeSession({
            userId: 42,
        });

        const req = makeReq({
            session,
            sessionID: LOGOUT_SESSION_ID,
        });

        const res = makeRes();

        await invokeHandler(
            logoutHandler(),
            req,
            res,
        );

        expect(res.state.clearedCookies[0].name)
            .toBe(SESSION_COOKIE_NAME);

        expect(res.state.clearedCookies[0].name)
            .not.toBe('connect.sid');
    });
});

// ============================================================================
// LOGOUT — ORDERING / CONSISTENCY
// ============================================================================

describe('POST /logout — operation ordering', () => {
    it('revokes DB session before destroying Express session', async () => {
        const events = [];

        const session = makeFakeSession({
            userId: 42,
            events,
        });

        sessionService.hashSessionId.mockImplementation(
            (id) => {
                events.push(`hash:${id}`);
                return LOGOUT_SESSION_HASH;
            },
        );

        sessionService.revokeSession.mockImplementation(
            async (hash) => {
                events.push(`db.revoke:${hash}`);
            },
        );

        session.destroy.mockImplementation(
            (callback) => {
                events.push('session.destroy');
                callback(null);
            },
        );

        const req = makeReq({
            session,
            sessionID: LOGOUT_SESSION_ID,
        });

        const res = makeRes();

        await invokeHandler(
            logoutHandler(),
            req,
            res,
        );

        expect(events).toEqual([
            `hash:${LOGOUT_SESSION_ID}`,
            `db.revoke:${LOGOUT_SESSION_HASH}`,
            'session.destroy',
        ]);
    });

    it('clears userId before Express session destruction', async () => {
        let userIdAtDestroy;

        const session = makeFakeSession({
            userId: 42,
        });

        session.destroy.mockImplementation(
            (callback) => {
                userIdAtDestroy = session.userId;
                callback(null);
            },
        );

        const req = makeReq({
            session,
            sessionID: LOGOUT_SESSION_ID,
        });

        const res = makeRes();

        await invokeHandler(
            logoutHandler(),
            req,
            res,
        );

        expect(userIdAtDestroy)
            .toBeUndefined();

        expect(session.userId)
            .toBeUndefined();
    });
});

// ============================================================================
// LOGIN — OPERATION ORDERING
// ============================================================================

describe('POST /login — operation ordering invariants', () => {
    it('follows regenerate → hash → DB create → save', async () => {
        const events = [];

        let currentSessionId = OLD_SESSION_ID;

        const session = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },

            events,

            onRegenerate: () => {
                currentSessionId = NEW_SESSION_ID;
            },
        });

        const req = {
            ...makeReq({
                body: {
                    ...VALID_CREDENTIALS,
                },
                session,
            }),

            get sessionID() {
                return currentSessionId;
            },
        };

        sessionService.hashSessionId.mockImplementation(
            (id) => {
                events.push(`hash:${id}`);
                return NEW_SESSION_HASH;
            },
        );

        sessionService.createSession.mockImplementation(
            async () => {
                events.push('db.create');
            },
        );

        session.save.mockImplementation(
            (callback) => {
                events.push('session.save');
                callback(null);
            },
        );

        const res = makeRes();

        await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(events).toEqual([
            'session.regenerate',
            `hash:${NEW_SESSION_ID}`,
            'db.create',
            'session.save',
        ]);
    });

    it('never saves Express session before DB session creation', async () => {
        const events = [];

        const session = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },

            events,
        });

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
        });

        sessionService.createSession.mockImplementation(
            async () => {
                events.push('db.create');
            },
        );

        session.save.mockImplementation(
            (callback) => {
                events.push('session.save');
                callback(null);
            },
        );

        const res = makeRes();

        await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        const dbIndex =
            events.indexOf('db.create');

        const saveIndex =
            events.indexOf('session.save');

        expect(dbIndex).toBeGreaterThanOrEqual(0);
        expect(saveIndex).toBeGreaterThanOrEqual(0);
        expect(dbIndex).toBeLessThan(saveIndex);
    });
});

// ============================================================================
// ERROR PROPAGATION
// ============================================================================

describe('error propagation safety', () => {
    it('forwards unexpected login errors exactly once', async () => {
        const unexpectedError = new Error(
            'unexpected login failure',
        );

        authService.login.mockRejectedValue(
            unexpectedError,
        );

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
        });

        const res = makeRes();

        const { next } = await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(next).toHaveBeenCalledTimes(1);

        expect(next.mock.calls[0][0])
            .toBe(unexpectedError);

        expect(sendSuccess)
            .not.toHaveBeenCalled();

        expect(res.state.jsonBody)
            .toBeNull();
    });

    it('does not call next after successful login', async () => {
        const session = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },
        });

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
        });

        const res = makeRes();

        const { next } = await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(sendSuccess)
            .toHaveBeenCalledTimes(1);

        expect(next)
            .not.toHaveBeenCalled();
    });

    it('does not call next after successful logout', async () => {
        const session = makeFakeSession({
            userId: 42,
        });

        const req = makeReq({
            session,
            sessionID: LOGOUT_SESSION_ID,
        });

        const res = makeRes();

        const { next } = await invokeHandler(
            logoutHandler(),
            req,
            res,
        );

        expect(sendSuccess)
            .toHaveBeenCalledTimes(1);

        expect(next)
            .not.toHaveBeenCalled();
    });
});

// ============================================================================
// SECURITY REGRESSION — NO CROSS-REQUEST STATE
// ============================================================================

describe('request isolation', () => {
    it('does not retain session/user state between login requests', async () => {
        const firstSession = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },
        });

        const firstReq = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session: firstSession,
        });

        const firstRes = makeRes();

        await invokeHandler(
            loginHandler(),
            firstReq,
            firstRes,
        );

        const secondSession = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },
        });

        const secondReq = makeReq({
            body: {
                username: 'bob',
                password: 'another-password',
            },
            session: secondSession,
        });

        authService.login.mockResolvedValue({
            ...RICH_USER,
            id: 84,
            username: 'bob',
        });

        const secondRes = makeRes();

        await invokeHandler(
            loginHandler(),
            secondReq,
            secondRes,
        );

        expect(firstReq.session.userId)
            .toBe(42);

        expect(secondReq.session.userId)
            .toBe(84);

        expect(firstReq.session)
            .not.toBe(secondReq.session);
    });
});

// ============================================================================
// FINAL SECURITY REGRESSION
// ============================================================================

describe('final auth route security invariants', () => {
    it('login never persists an unauthenticated/unsaved Express session', async () => {
        const saveError = new Error(
            'save failed',
        );

        const session = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },

            saveError,
        });

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
        });

        const res = makeRes();

        await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expect(sessionService.createSession)
            .toHaveBeenCalledTimes(1);

        expect(sessionService.revokeSession)
            .toHaveBeenCalledTimes(1);

        expect(session.destroy)
            .toHaveBeenCalledTimes(1);

        expectCookieCleared(res);
    });

    it('logout always attempts to invalidate server-side authentication when sessionID exists', async () => {
        const session = makeFakeSession({
            userId: undefined,
        });

        sessionService.hashSessionId
            .mockReturnValue(LOGOUT_SESSION_HASH);

        const req = makeReq({
            session,
            sessionID: LOGOUT_SESSION_ID,
        });

        const res = makeRes();

        await invokeHandler(
            logoutHandler(),
            req,
            res,
        );

        expect(sessionService.hashSessionId)
            .toHaveBeenCalledWith(
                LOGOUT_SESSION_ID,
            );

        expect(sessionService.revokeSession)
            .toHaveBeenCalledWith(
                LOGOUT_SESSION_HASH,
            );

        expect(session.destroy)
            .toHaveBeenCalledTimes(1);

        expectCookieCleared(res);
    });

    it('authentication secrets never cross the response boundary', async () => {
        const session = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },
        });

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
        });

        const res = makeRes();

        await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        const responseSerialized = JSON.stringify(
            res.state.jsonBody,
        );

        for (const sensitiveValue of [
            RICH_USER.password,
            RICH_USER.password_hash,
            RICH_USER.passwordHash,
            RICH_USER.passwordResetToken,
            RICH_USER.twoFactorSecret,
            RICH_USER.sessionToken,
            RICH_USER.accessToken,
            RICH_USER.refreshToken,
            RICH_USER.apiKey,
            RICH_USER.secret,
            RICH_USER.authorization,
            RICH_USER.cookie,
            NEW_SESSION_ID,
            NEW_SESSION_HASH,
        ]) {
            expect(responseSerialized)
                .not.toContain(sensitiveValue);
        }
    });

    it('authentication secrets never cross the logging boundary', async () => {
        const session = makeFakeSession({
            cookie: {
                expires: FUTURE_EXPIRY,
            },
        });

        const req = makeReq({
            body: {
                ...VALID_CREDENTIALS,
            },
            session,
            sessionID: NEW_SESSION_ID,
        });

        const res = makeRes();

        await invokeHandler(
            loginHandler(),
            req,
            res,
        );

        expectNoSensitiveLogging();
    });
});