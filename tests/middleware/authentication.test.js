import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    AuthenticationErrorMock,
    createChildLoggerMock,
    getRequestIdMock,
    authServiceMock,
    sessionServiceMock,
} = vi.hoisted(() => {
    const logger = {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    };

    return {
        AuthenticationErrorMock: class AuthenticationError extends Error {
            constructor(message = 'Authentication required') {
                super(message);
                this.name = 'AuthenticationError';
                this.code = 'AUTHENTICATION_ERROR';
                this.statusCode = 401;
                this.isOperational = true;
            }
        },

        createChildLoggerMock: vi.fn(() => logger),

        getRequestIdMock: vi.fn(() => 'test-request-id'),

        authServiceMock: {
            getAuthenticatedUser: vi.fn(),
        },

        sessionServiceMock: {
            hashSessionId: vi.fn(),
            validateSession: vi.fn(),
            touchSessionActivity: vi.fn(),
        },
    };
});

vi.mock('../../app/core/errors.js', () => ({
    AuthenticationError: AuthenticationErrorMock,
}));

vi.mock('../../app/core/logger.js', () => ({
    createChildLogger: createChildLoggerMock,
}));

vi.mock('../../app/core/request-context.js', () => ({
    getRequestId: getRequestIdMock,
    setUserContext: vi.fn(),
}));

vi.mock('../../app/services/auth/auth.service.js', () => ({
    default: authServiceMock,
}));

vi.mock('../../app/services/auth/session.service.js', () => ({
    default: sessionServiceMock,
}));

const { authenticate } = await import(
    '../../app/middleware/authentication.js'
);

const SESSION_ID = 'session-id-123';
const SESSION_HASH = 'a'.repeat(64);
const REQUEST_ID = 'test-request-id';

const USER = Object.freeze({
    id: 42,
    username: 'alice',
    email: 'alice@example.com',
    status: 'active',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
});

const VALIDATION = Object.freeze({
    valid: true,
    userId: 42,
    sessionRecordId: 1001,
    lastActivityAt: new Date('2026-09-11T00:00:00.000Z'),
});

function createSession(overrides = {}) {
    return {
        userId: 42,
        cookie: {
            path: '/',
            domain: undefined,
        },
        destroy: vi.fn((callback) => {
            callback?.(null);
        }),
        ...overrides,
    };
}

function createResponse() {
    return {
        clearCookie: vi.fn(),
    };
}

function createRequest(overrides = {}) {
    return {
        id: 'request-object-id',
        sessionID: SESSION_ID,
        session: createSession(),
        ...overrides,
    };
}

function createNext() {
    return vi.fn();
}

describe('authentication middleware', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        getRequestIdMock.mockReturnValue(REQUEST_ID);

        sessionServiceMock.hashSessionId.mockReturnValue(
            SESSION_HASH,
        );

        sessionServiceMock.validateSession.mockResolvedValue(
            VALIDATION,
        );

        sessionServiceMock.touchSessionActivity.mockResolvedValue(
            undefined,
        );

        authServiceMock.getAuthenticatedUser.mockResolvedValue(
            USER,
        );
    });

    describe('successful authentication', () => {
        it('authenticates a valid session and user', async () => {
            const req = createRequest();
            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(
                sessionServiceMock.hashSessionId,
            ).toHaveBeenCalledTimes(1);

            expect(
                sessionServiceMock.hashSessionId,
            ).toHaveBeenCalledWith(SESSION_ID);

            expect(
                sessionServiceMock.validateSession,
            ).toHaveBeenCalledTimes(1);

            expect(
                sessionServiceMock.validateSession,
            ).toHaveBeenCalledWith(
                SESSION_HASH,
                42,
            );

            expect(
                authServiceMock.getAuthenticatedUser,
            ).toHaveBeenCalledTimes(1);

            expect(
                authServiceMock.getAuthenticatedUser,
            ).toHaveBeenCalledWith(42);

            expect(req.user).toEqual(USER);

            expect(next).toHaveBeenCalledTimes(1);
            expect(next).toHaveBeenCalledWith();
        });

        it('does not replace the authenticated user with unsafe data', async () => {
            const req = createRequest();
            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(req.user).toBe(USER);
        });

        it('touches session activity on successful authentication', async () => {
            const req = createRequest();
            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            /*
             * touchSessionActivity is intentionally best-effort.
             * The middleware must not wait for a failure to become an
             * authentication failure.
             */
            expect(
                sessionServiceMock.touchSessionActivity,
            ).toHaveBeenCalledTimes(1);

            expect(
                sessionServiceMock.touchSessionActivity,
            ).toHaveBeenCalledWith(
                VALIDATION.sessionRecordId,
                VALIDATION.lastActivityAt,
            );
        });
    });

    describe('request/session boundary validation', () => {
        it('rejects when req.session is missing', async () => {
            const req = createRequest({
                session: undefined,
            });
            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(next.mock.calls[0][0]).toBeInstanceOf(
                AuthenticationErrorMock,
            );

            expect(
                sessionServiceMock.hashSessionId,
            ).not.toHaveBeenCalled();

            expect(
                authServiceMock.getAuthenticatedUser,
            ).not.toHaveBeenCalled();
        });

        it('rejects when session userId is missing', async () => {
            const req = createRequest({
                session: createSession({
                    userId: undefined,
                }),
            });

            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(next.mock.calls[0][0]).toBeInstanceOf(
                AuthenticationErrorMock,
            );

            expect(
                sessionServiceMock.hashSessionId,
            ).not.toHaveBeenCalled();

            expect(
                authServiceMock.getAuthenticatedUser,
            ).not.toHaveBeenCalled();
        });

        it('rejects when sessionID is missing', async () => {
            const req = createRequest({
                sessionID: undefined,
            });

            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(next.mock.calls[0][0]).toBeInstanceOf(
                AuthenticationErrorMock,
            );

            expect(
                sessionServiceMock.hashSessionId,
            ).not.toHaveBeenCalled();

            expect(
                authServiceMock.getAuthenticatedUser,
            ).not.toHaveBeenCalled();
        });

        it('rejects when sessionID is empty', async () => {
            const req = createRequest({
                sessionID: '',
            });

            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(next.mock.calls[0][0]).toBeInstanceOf(
                AuthenticationErrorMock,
            );

            expect(
                sessionServiceMock.hashSessionId,
            ).not.toHaveBeenCalled();
        });
    });

    describe('session validation failures', () => {
        it('rejects when session validation returns invalid', async () => {
            sessionServiceMock.validateSession.mockResolvedValue({
                valid: false,
                reason: 'revoked',
            });

            const req = createRequest();
            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(next.mock.calls[0][0]).toBeInstanceOf(
                AuthenticationErrorMock,
            );

            expect(
                authServiceMock.getAuthenticatedUser,
            ).not.toHaveBeenCalled();
        });

        it('rejects an expired session', async () => {
            sessionServiceMock.validateSession.mockResolvedValue({
                valid: false,
                reason: 'expired',
            });

            const req = createRequest();
            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(next.mock.calls[0][0]).toBeInstanceOf(
                AuthenticationErrorMock,
            );

            expect(
                authServiceMock.getAuthenticatedUser,
            ).not.toHaveBeenCalled();
        });

        it('rejects a revoked session', async () => {
            sessionServiceMock.validateSession.mockResolvedValue({
                valid: false,
                reason: 'revoked',
            });

            const req = createRequest();
            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(next.mock.calls[0][0]).toBeInstanceOf(
                AuthenticationErrorMock,
            );

            expect(
                authServiceMock.getAuthenticatedUser,
            ).not.toHaveBeenCalled();
        });
    });

    describe('authenticated-user validation', () => {
        it('rejects when the authenticated user no longer exists', async () => {
            authServiceMock.getAuthenticatedUser.mockResolvedValue(
                null,
            );

            const req = createRequest();
            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(next.mock.calls[0][0]).toBeInstanceOf(
                AuthenticationErrorMock,
            );
        });

        it('does not call next without an error on user failure', async () => {
            authServiceMock.getAuthenticatedUser.mockResolvedValue(
                null,
            );

            const req = createRequest();
            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(next.mock.calls[0]).toHaveLength(1);
            expect(next.mock.calls[0][0]).toBeInstanceOf(
                AuthenticationErrorMock,
            );
        });
    });

    describe('session invalidation', () => {
        it('destroys the Express session after invalid authentication', async () => {
            sessionServiceMock.validateSession.mockResolvedValue({
                valid: false,
                reason: 'revoked',
            });

            const session = createSession();
            const req = createRequest({ session });
            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(session.destroy).toHaveBeenCalledTimes(1);
        });

        it('clears the session cookie after invalid authentication', async () => {
            sessionServiceMock.validateSession.mockResolvedValue({
                valid: false,
                reason: 'revoked',
            });

            const session = createSession({
                cookie: {
                    path: '/auth',
                    domain: 'example.com',
                },
            });

            const req = createRequest({ session });
            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(res.clearCookie).toHaveBeenCalledTimes(1);

            expect(res.clearCookie).toHaveBeenCalledWith(
                'tesnow.sid',
                expect.objectContaining({
                    path: '/auth',
                    domain: 'example.com',
                }),
            );
        });

        it('does not allow session destruction failure to escape', async () => {
            sessionServiceMock.validateSession.mockResolvedValue({
                valid: false,
                reason: 'revoked',
            });

            const session = createSession({
                destroy: vi.fn((callback) => {
                    callback?.(new Error('destroy failed'));
                }),
            });

            const req = createRequest({ session });
            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(next.mock.calls[0][0]).toBeInstanceOf(
                AuthenticationErrorMock,
            );
        });

        it('does not allow cookie-clearing failure to escape', async () => {
            sessionServiceMock.validateSession.mockResolvedValue({
                valid: false,
                reason: 'revoked',
            });

            const req = createRequest();
            const res = createResponse();

            res.clearCookie.mockImplementation(() => {
                throw new Error('clear cookie failed');
            });

            const next = createNext();

            await authenticate(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(next.mock.calls[0][0]).toBeInstanceOf(
                AuthenticationErrorMock,
            );
        });
    });

    describe('hashing failures', () => {
        it('propagates session hash errors through next', async () => {
            const hashError = new Error(
                'session hashing failed',
            );

            sessionServiceMock.hashSessionId.mockImplementation(
                () => {
                    throw hashError;
                },
            );

            const req = createRequest();
            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(next.mock.calls[0][0]).toBe(hashError);
        });

        it('never calls user lookup when session hashing fails', async () => {
            sessionServiceMock.hashSessionId.mockImplementation(
                () => {
                    throw new Error('hash failure');
                },
            );

            const req = createRequest();
            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(
                authServiceMock.getAuthenticatedUser,
            ).not.toHaveBeenCalled();
        });
    });

    describe('service error propagation', () => {
        it('propagates session validation errors', async () => {
            const validationError = new Error(
                'session repository unavailable',
            );

            sessionServiceMock.validateSession.mockRejectedValue(
                validationError,
            );

            const req = createRequest();
            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(next.mock.calls[0][0]).toBe(validationError);
        });

        it('propagates authenticated-user lookup errors', async () => {
            const userLookupError = new Error(
                'user repository unavailable',
            );

            authServiceMock.getAuthenticatedUser.mockRejectedValue(
                userLookupError,
            );

            const req = createRequest();
            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(next.mock.calls[0][0]).toBe(userLookupError);
        });
    });

    describe('request context', () => {
        it('uses the request context request ID when available', async () => {
            getRequestIdMock.mockReturnValue(REQUEST_ID);

            const req = createRequest();
            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(getRequestIdMock).toHaveBeenCalledTimes(1);
        });

        it('falls back to req.id when request context has no ID', async () => {
            getRequestIdMock.mockReturnValue(null);

            const req = createRequest({
                id: 'fallback-request-id',
            });

            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.user).toEqual(USER);
        });
    });

    describe('touch activity behavior', () => {
        it('does not turn touch failure into authentication failure', async () => {
            sessionServiceMock.touchSessionActivity.mockRejectedValue(
                new Error('touch failed'),
            );

            const req = createRequest();
            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(req.user).toEqual(USER);
            expect(next).toHaveBeenCalledTimes(1);
            expect(next).toHaveBeenCalledWith();
        });
    });

    describe('security invariants', () => {
        it('does not expose session hashes through req.user', async () => {
            const req = createRequest();
            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(req.user).toEqual(USER);
            expect(req.user).not.toHaveProperty(
                'session_hash',
            );
            expect(req.user).not.toHaveProperty(
                'session_token_hash',
            );
        });

        it('does not call authentication service before session validation', async () => {
            const order = [];

            sessionServiceMock.hashSessionId.mockImplementation(
                () => {
                    order.push('hash');
                    return SESSION_HASH;
                },
            );

            sessionServiceMock.validateSession.mockImplementation(
                async () => {
                    order.push('validate');
                    return VALIDATION;
                },
            );

            authServiceMock.getAuthenticatedUser.mockImplementation(
                async () => {
                    order.push('user');
                    return USER;
                },
            );

            const req = createRequest();
            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(order).toEqual([
                'hash',
                'validate',
                'user',
            ]);
        });

        it('never authenticates using the raw session ID', async () => {
            const req = createRequest();
            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(
                sessionServiceMock.validateSession,
            ).not.toHaveBeenCalledWith(
                SESSION_ID,
                42,
            );
        });

        it('does not call next more than once', async () => {
            const req = createRequest();
            const res = createResponse();
            const next = createNext();

            await authenticate(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
        });
    });
});
