import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    AuthenticationErrorMock,
    createChildLoggerMock,
    USER_STATUS_MOCK,
    userRepositoryMock,
    verifyPasswordMock,
} = vi.hoisted(() => ({
    AuthenticationErrorMock: class AuthenticationError extends Error {
        constructor(message) {
            super(message);
            this.name = 'AuthenticationError';
            this.code = 'AUTHENTICATION_ERROR';
        }
    },

    createChildLoggerMock: vi.fn(() => ({
        warn: vi.fn(),
        info: vi.fn(),
    })),

    USER_STATUS_MOCK: {
        ACTIVE: 'active',
        INACTIVE: 'inactive',
    },

    userRepositoryMock: {
        findByUsernameOrEmail: vi.fn(),
        findById: vi.fn(),
    },

    verifyPasswordMock: vi.fn(),
}));

vi.mock('../../app/core/errors.js', () => ({
    AuthenticationError: AuthenticationErrorMock,
}));

vi.mock('../../app/core/logger.js', () => ({
    createChildLogger: createChildLoggerMock,
}));

vi.mock('../../app/core/constants.js', () => ({
    USER_STATUS: USER_STATUS_MOCK,
}));

vi.mock('../../app/repositories/user.repository.js', () => ({
    default: userRepositoryMock,
}));

vi.mock('../../app/services/auth/password.service.js', () => ({
    verifyPassword: verifyPasswordMock,
}));

const { createAuthService } = await import(
    '../../app/services/auth/auth.service.js'
);

const VALID_PASSWORD = 'correct horse battery staple';
const VALID_HASH = '$2b$10$valid-test-password-hash';

const BASE_USER = Object.freeze({
    id: 42,
    username: 'alice',
    email: 'alice@example.com',
    password_hash: VALID_HASH,
    status: USER_STATUS_MOCK.ACTIVE,
    deleted_at: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
});

function makeUser(overrides = {}) {
    return {
        ...BASE_USER,
        ...overrides,
    };
}

describe('auth.service', () => {
    let service;

    beforeEach(() => {
        vi.clearAllMocks();

        userRepositoryMock.findByUsernameOrEmail.mockResolvedValue(
            makeUser(),
        );

        userRepositoryMock.findById.mockResolvedValue(makeUser());

        verifyPasswordMock.mockResolvedValue(true);

        service = createAuthService(userRepositoryMock);
    });

    describe('factory contract', () => {
        it('creates a frozen service', () => {
            expect(service).toBeDefined();
            expect(Object.isFrozen(service)).toBe(true);
        });

        it('exposes the expected service methods', () => {
            expect(typeof service.login).toBe('function');
            expect(typeof service.getAuthenticatedUser).toBe(
                'function',
            );
        });

        it('fails fast when repository has no required methods', () => {
    expect(() => createAuthService({})).toThrow(
        'userRepository.findByUsernameOrEmail must be a function',
    );
});

        it('fails fast when repository is not an object', () => {
            expect(() => createAuthService(null)).toThrow(
                'createAuthService requires a user repository',
            );
        });

        it('fails fast when findByUsernameOrEmail is missing', () => {
            expect(() =>
                createAuthService({
                    findById: vi.fn(),
                }),
            ).toThrow(
                'userRepository.findByUsernameOrEmail must be a function',
            );
        });

        it('fails fast when findById is missing', () => {
            expect(() =>
                createAuthService({
                    findByUsernameOrEmail: vi.fn(),
                }),
            ).toThrow(
                'userRepository.findById must be a function',
            );
        });
    });

    describe('login input validation', () => {
        it('rejects a non-string identifier', async () => {
            await expect(
                service.login(null, VALID_PASSWORD),
            ).rejects.toBeInstanceOf(AuthenticationErrorMock);

            expect(
                userRepositoryMock.findByUsernameOrEmail,
            ).not.toHaveBeenCalled();

            expect(verifyPasswordMock).not.toHaveBeenCalled();
        });

        it('rejects an empty identifier', async () => {
            await expect(
                service.login('', VALID_PASSWORD),
            ).rejects.toThrow('Invalid credentials');

            expect(
                userRepositoryMock.findByUsernameOrEmail,
            ).not.toHaveBeenCalled();
        });

        it('rejects a non-string password', async () => {
            await expect(
                service.login('alice', null),
            ).rejects.toThrow('Invalid credentials');

            expect(
                userRepositoryMock.findByUsernameOrEmail,
            ).not.toHaveBeenCalled();
        });

        it('rejects an empty password', async () => {
            await expect(
                service.login('alice', ''),
            ).rejects.toThrow('Invalid credentials');

            expect(
                userRepositoryMock.findByUsernameOrEmail,
            ).not.toHaveBeenCalled();
        });

        it('does not trim or modify a valid password', async () => {
            const password = ' password with spaces ';

            await service.login('alice', password);

            expect(verifyPasswordMock).toHaveBeenCalledWith(
                password,
                VALID_HASH,
            );
        });

        it('does not trim or modify the identifier', async () => {
            const identifier = '  alice  ';

            await service.login(identifier, VALID_PASSWORD);

            expect(
                userRepositoryMock.findByUsernameOrEmail,
            ).toHaveBeenCalledWith(identifier);
        });
    });

    describe('successful login', () => {
        it('authenticates an active user', async () => {
            const result = await service.login(
                'alice',
                VALID_PASSWORD,
            );

            expect(result).toEqual({
                id: 42,
                username: 'alice',
                email: 'alice@example.com',
                status: 'active',
                created_at: BASE_USER.created_at,
            });
        });

        it('performs exactly one repository lookup', async () => {
            await service.login('alice', VALID_PASSWORD);

            expect(
                userRepositoryMock.findByUsernameOrEmail,
            ).toHaveBeenCalledTimes(1);
        });

        it('performs exactly one password verification', async () => {
            await service.login('alice', VALID_PASSWORD);

            expect(verifyPasswordMock).toHaveBeenCalledTimes(1);
        });

        it('passes the exact password and stored hash to verification', async () => {
            await service.login('alice', VALID_PASSWORD);

            expect(verifyPasswordMock).toHaveBeenCalledWith(
                VALID_PASSWORD,
                VALID_HASH,
            );
        });

        it('returns only explicitly allowlisted user fields', async () => {
            const user = makeUser({
                password: 'should-never-leak',
                password_hash: VALID_HASH,
                reset_token: 'secret-reset-token',
                api_key: 'secret-api-key',
                refresh_token: 'secret-refresh-token',
                internal_secret: 'secret',
                permissions: ['admin'],
            });

            userRepositoryMock.findByUsernameOrEmail.mockResolvedValue(
                user,
            );

            const result = await service.login(
                'alice',
                VALID_PASSWORD,
            );

            expect(result).toEqual({
                id: 42,
                username: 'alice',
                email: 'alice@example.com',
                status: 'active',
                created_at: BASE_USER.created_at,
            });

            expect(result).not.toHaveProperty('password');
            expect(result).not.toHaveProperty('password_hash');
            expect(result).not.toHaveProperty('reset_token');
            expect(result).not.toHaveProperty('api_key');
            expect(result).not.toHaveProperty('refresh_token');
            expect(result).not.toHaveProperty('internal_secret');
            expect(result).not.toHaveProperty('permissions');
        });

        it('does not mutate the repository user object', async () => {
            const user = makeUser();

            const before = {
                ...user,
            };

            await service.login('alice', VALID_PASSWORD);

            expect(user).toEqual(before);
        });
    });

    describe('authentication failure behavior', () => {
        it('returns the same generic error for an unknown identifier', async () => {
            userRepositoryMock.findByUsernameOrEmail.mockResolvedValue(
                null,
            );

            await expect(
                service.login('unknown', VALID_PASSWORD),
            ).rejects.toThrow('Invalid credentials');

            expect(verifyPasswordMock).not.toHaveBeenCalled();
        });

        it('returns the same generic error for a wrong password', async () => {
            verifyPasswordMock.mockResolvedValue(false);

            await expect(
                service.login('alice', 'wrong-password'),
            ).rejects.toThrow('Invalid credentials');
        });

        it('does not reveal inactive-account state', async () => {
            userRepositoryMock.findByUsernameOrEmail.mockResolvedValue(
                makeUser({
                    status: USER_STATUS_MOCK.INACTIVE,
                }),
            );

            await expect(
                service.login('alice', VALID_PASSWORD),
            ).rejects.toThrow('Invalid credentials');

            expect(verifyPasswordMock).toHaveBeenCalledTimes(1);
        });

        it('does not reveal deleted-account state', async () => {
            userRepositoryMock.findByUsernameOrEmail.mockResolvedValue(
                makeUser({
                    deleted_at: new Date(
                        '2026-08-01T00:00:00.000Z',
                    ),
                }),
            );

            await expect(
                service.login('alice', VALID_PASSWORD),
            ).rejects.toThrow('Invalid credentials');

            expect(verifyPasswordMock).not.toHaveBeenCalled();
        });

        it('uses the same public error message for account-state failures', async () => {
            const inactiveUser = makeUser({
                status: USER_STATUS_MOCK.INACTIVE,
            });

            userRepositoryMock.findByUsernameOrEmail.mockResolvedValue(
                inactiveUser,
            );

            await expect(
                service.login('alice', VALID_PASSWORD),
            ).rejects.toThrow('Invalid credentials');
        });
    });

    describe('malformed repository data', () => {
        it('fails closed for a missing user ID', async () => {
            userRepositoryMock.findByUsernameOrEmail.mockResolvedValue(
                makeUser({
                    id: undefined,
                }),
            );

            await expect(
                service.login('alice', VALID_PASSWORD),
            ).rejects.toThrow('Invalid credentials');

            expect(verifyPasswordMock).not.toHaveBeenCalled();
        });

        it('fails closed for a string user ID', async () => {
            userRepositoryMock.findByUsernameOrEmail.mockResolvedValue(
                makeUser({
                    id: '42',
                }),
            );

            await expect(
                service.login('alice', VALID_PASSWORD),
            ).rejects.toThrow('Invalid credentials');

            expect(verifyPasswordMock).not.toHaveBeenCalled();
        });

        it('fails closed for an unsafe integer user ID', async () => {
            userRepositoryMock.findByUsernameOrEmail.mockResolvedValue(
                makeUser({
                    id: Number.MAX_SAFE_INTEGER + 1,
                }),
            );

            await expect(
                service.login('alice', VALID_PASSWORD),
            ).rejects.toThrow('Invalid credentials');

            expect(verifyPasswordMock).not.toHaveBeenCalled();
        });

        it('fails closed for zero user ID', async () => {
            userRepositoryMock.findByUsernameOrEmail.mockResolvedValue(
                makeUser({
                    id: 0,
                }),
            );

            await expect(
                service.login('alice', VALID_PASSWORD),
            ).rejects.toThrow('Invalid credentials');

            expect(verifyPasswordMock).not.toHaveBeenCalled();
        });

        it('fails closed for a missing password hash', async () => {
            userRepositoryMock.findByUsernameOrEmail.mockResolvedValue(
                makeUser({
                    password_hash: undefined,
                }),
            );

            await expect(
                service.login('alice', VALID_PASSWORD),
            ).rejects.toThrow('Invalid credentials');

            expect(verifyPasswordMock).not.toHaveBeenCalled();
        });

        it('fails closed for an empty password hash', async () => {
            userRepositoryMock.findByUsernameOrEmail.mockResolvedValue(
                makeUser({
                    password_hash: '',
                }),
            );

            await expect(
                service.login('alice', VALID_PASSWORD),
            ).rejects.toThrow('Invalid credentials');

            expect(verifyPasswordMock).not.toHaveBeenCalled();
        });

        it('fails closed for a missing status', async () => {
            userRepositoryMock.findByUsernameOrEmail.mockResolvedValue(
                makeUser({
                    status: undefined,
                }),
            );

            await expect(
                service.login('alice', VALID_PASSWORD),
            ).rejects.toThrow('Invalid credentials');

            expect(verifyPasswordMock).not.toHaveBeenCalled();
        });

        it('fails closed when deleted_at is undefined', async () => {
            userRepositoryMock.findByUsernameOrEmail.mockResolvedValue(
                makeUser({
                    deleted_at: undefined,
                }),
            );

            await expect(
                service.login('alice', VALID_PASSWORD),
            ).rejects.toThrow('Invalid credentials');

            expect(verifyPasswordMock).not.toHaveBeenCalled();
        });

        it('fails closed for a null repository result object', async () => {
            userRepositoryMock.findByUsernameOrEmail.mockResolvedValue(
                null,
            );

            await expect(
                service.login('alice', VALID_PASSWORD),
            ).rejects.toThrow('Invalid credentials');
        });

        it('fails closed for a primitive repository result', async () => {
            userRepositoryMock.findByUsernameOrEmail.mockResolvedValue(
                'unexpected-user',
            );

            await expect(
                service.login('alice', VALID_PASSWORD),
            ).rejects.toThrow('Invalid credentials');

            expect(verifyPasswordMock).not.toHaveBeenCalled();
        });
    });

    describe('error propagation', () => {
        it('does not convert repository errors into authentication errors', async () => {
            const databaseError = new Error(
                'database connection failed',
            );

            userRepositoryMock.findByUsernameOrEmail.mockRejectedValue(
                databaseError,
            );

            await expect(
                service.login('alice', VALID_PASSWORD),
            ).rejects.toBe(databaseError);

            expect(verifyPasswordMock).not.toHaveBeenCalled();
        });

        it('does not convert password-service errors into authentication errors', async () => {
            const passwordServiceError = new Error(
                'password verification failed',
            );

            verifyPasswordMock.mockRejectedValue(
                passwordServiceError,
            );

            await expect(
                service.login('alice', VALID_PASSWORD),
            ).rejects.toBe(passwordServiceError);
        });
    });

    describe('getAuthenticatedUser', () => {
        it('returns a safe user for a valid active user', async () => {
            const result =
                await service.getAuthenticatedUser(42);

            expect(result).toEqual({
                id: 42,
                username: 'alice',
                email: 'alice@example.com',
                status: 'active',
                created_at: BASE_USER.created_at,
            });
        });

        it('does not perform password verification', async () => {
            await service.getAuthenticatedUser(42);

            expect(verifyPasswordMock).not.toHaveBeenCalled();
        });

        it('rejects a string user ID', async () => {
            await expect(
                service.getAuthenticatedUser('42'),
            ).resolves.toBeNull();

            expect(
                userRepositoryMock.findById,
            ).not.toHaveBeenCalled();
        });

        it('rejects zero user ID', async () => {
            await expect(
                service.getAuthenticatedUser(0),
            ).resolves.toBeNull();

            expect(
                userRepositoryMock.findById,
            ).not.toHaveBeenCalled();
        });

        it('rejects negative user ID', async () => {
            await expect(
                service.getAuthenticatedUser(-1),
            ).resolves.toBeNull();

            expect(
                userRepositoryMock.findById,
            ).not.toHaveBeenCalled();
        });

        it('rejects an unsafe integer user ID', async () => {
            await expect(
                service.getAuthenticatedUser(
                    Number.MAX_SAFE_INTEGER + 1,
                ),
            ).resolves.toBeNull();

            expect(
                userRepositoryMock.findById,
            ).not.toHaveBeenCalled();
        });

        it('returns null for a missing user', async () => {
            userRepositoryMock.findById.mockResolvedValue(null);

            await expect(
                service.getAuthenticatedUser(42),
            ).resolves.toBeNull();
        });

        it('returns null for a deleted user', async () => {
            userRepositoryMock.findById.mockResolvedValue(
                makeUser({
                    deleted_at: new Date(
                        '2026-08-01T00:00:00.000Z',
                    ),
                }),
            );

            await expect(
                service.getAuthenticatedUser(42),
            ).resolves.toBeNull();
        });

        it('returns null for an inactive user', async () => {
            userRepositoryMock.findById.mockResolvedValue(
                makeUser({
                    status: USER_STATUS_MOCK.INACTIVE,
                }),
            );

            await expect(
                service.getAuthenticatedUser(42),
            ).resolves.toBeNull();
        });

        it('fails closed for an invalid authenticated-user row', async () => {
            userRepositoryMock.findById.mockResolvedValue(
                makeUser({
                    id: Number.MAX_SAFE_INTEGER + 1,
                }),
            );

            await expect(
                service.getAuthenticatedUser(42),
            ).resolves.toBeNull();
        });

        it('fails closed when deleted_at is undefined', async () => {
            userRepositoryMock.findById.mockResolvedValue(
                makeUser({
                    deleted_at: undefined,
                }),
            );

            await expect(
                service.getAuthenticatedUser(42),
            ).resolves.toBeNull();
        });

        it('uses an explicit safe projection', async () => {
            userRepositoryMock.findById.mockResolvedValue(
                makeUser({
                    password: 'secret',
                    password_hash: VALID_HASH,
                    reset_token: 'secret-reset-token',
                    api_key: 'secret-api-key',
                }),
            );

            const result =
                await service.getAuthenticatedUser(42);

            expect(result).toEqual({
                id: 42,
                username: 'alice',
                email: 'alice@example.com',
                status: 'active',
                created_at: BASE_USER.created_at,
            });

            expect(result).not.toHaveProperty('password');
            expect(result).not.toHaveProperty('password_hash');
            expect(result).not.toHaveProperty('reset_token');
            expect(result).not.toHaveProperty('api_key');
        });

        it('propagates repository errors', async () => {
            const databaseError = new Error(
                'database unavailable',
            );

            userRepositoryMock.findById.mockRejectedValue(
                databaseError,
            );

            await expect(
                service.getAuthenticatedUser(42),
            ).rejects.toBe(databaseError);
        });
    });

    describe('security invariants', () => {
        it('never returns the password hash from login', async () => {
            const result = await service.login(
                'alice',
                VALID_PASSWORD,
            );

            expect(result).not.toHaveProperty('password_hash');
        });

        it('never returns the password hash from authenticated-user lookup', async () => {
            const result =
                await service.getAuthenticatedUser(42);

            expect(result).not.toHaveProperty('password_hash');
        });

        it('does not mutate the password argument', async () => {
            const password = '  exact password  ';

            await service.login('alice', password);

            expect(verifyPasswordMock).toHaveBeenCalledWith(
                password,
                VALID_HASH,
            );
        });

        it('does not coerce user IDs', async () => {
            await service.getAuthenticatedUser('42');

            expect(
                userRepositoryMock.findById,
            ).not.toHaveBeenCalled();
        });

        it('verifies the password before checking account eligibility', async () => {
            const callOrder = [];

            const user = makeUser({
                status: USER_STATUS_MOCK.INACTIVE,
            });

            userRepositoryMock.findByUsernameOrEmail.mockImplementation(
                async () => {
                    callOrder.push('repository');
                    return user;
                },
            );

            verifyPasswordMock.mockImplementation(async () => {
                callOrder.push('password');
                return true;
            });

            await expect(
                service.login('alice', VALID_PASSWORD),
            ).rejects.toThrow('Invalid credentials');

            expect(callOrder).toEqual([
                'repository',
                'password',
            ]);
        });
    });
});
