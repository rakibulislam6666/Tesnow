import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import session from 'express-session';
import pinoHttp from 'pino-http';

import { getDbPool } from '../config/database.config.js';
import rootRouter from '../routes/index.routes.js';

// Configuration
import appConfig from '../config/app.config.js';
import securityConfig from '../config/security.config.js';
import sessionConfig, { getSessionSecret } from '../config/session.config.js';
import corsConfig from '../config/cors.config.js';
import uploadConfig from '../config/upload.config.js';
import rateLimitConfig from '../config/rate-limit.config.js';

// Core
import logger from './logger.js';
import {
    NotFoundError,
    RateLimitError,
    normalizeError,
    getHttpStatus,
    toSafeErrorResponse,
    prepareErrorForLogging,
} from './errors.js';
import { generateRequestId } from './constants.js';
import { runWithRequestContext } from './request-context.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '../..');

const app = express();

const NODE_ENV = appConfig.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// ============================================================================
// SHARED HELPERS
// ============================================================================

/**
 * Return a bounded string safe for headers, logs and templates.
 *
 * This is NOT a secret-redaction function.
 * Secret/error sanitization belongs to errors.js.
 *
 * @param {unknown} value
 * @param {number} maxLen
 * @returns {string}
 */
function sanitizeForDisplay(value, maxLen = 256) {
    if (typeof value !== 'string' || value.length === 0) {
        return '';
    }

    // eslint-disable-next-line no-control-regex
    const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '');

    if (cleaned.length <= maxLen) {
        return cleaned;
    }

    return `${cleaned.slice(0, maxLen)}...`;
}

/**
 * Determine whether the response should be JSON.
 *
 * Explicit API paths have priority.
 * Accept:  must never automatically turn a browser request into JSON.
 *
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function prefersJson(req) {
    const requestPath = typeof req.path === 'string' ? req.path : '';

    if (requestPath === '/api' || requestPath.startsWith('/api/')) {
        return true;
    }

    const accept = req.headers.accept;

    if (typeof accept === 'string') {
        const acceptsJson = accept.includes('application/json');
        const acceptsHtml = accept.includes('text/html');

        if (acceptsJson && !acceptsHtml) {
            return true;
        }
    }

    return false;
}

/**
 * Return a safe pathname for logs.
 *
 * Query strings are intentionally excluded because they may contain:
 * - tokens
 * - reset codes
 * - signed URLs
 * - API keys
 * - session identifiers
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
function safeLogPath(req) {
    const pathname =
        typeof req.path === 'string' && req.path.length > 0
            ? req.path
            : '/';

    return sanitizeForDisplay(pathname, 512);
}

/**
 * Safely obtain request user ID for error context.
 *
 * @param {import('express').Request} req
 * @returns {string|number|null}
 */
function getRequestUserId(req) {
    const userId = req.user?.id ?? req.session?.userId;

    if (typeof userId === 'string') {
        return sanitizeForDisplay(userId, 128);
    }

    if (typeof userId === 'number' && Number.isSafeInteger(userId)) {
        return userId;
    }

    return null;
}

// ============================================================================
// BASIC EXPRESS HARDENING
// ============================================================================

app.disable('x-powered-by');

if (appConfig.TRUST_PROXY !== undefined) {
    app.set('trust proxy', appConfig.TRUST_PROXY);
} else {
    app.set('trust proxy', false);
}

// ============================================================================
// REQUEST ID + REQUEST CONTEXT
// ============================================================================

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;

/**
 * Resolve a safe request ID.
 *
 * Arrays, objects, empty values and malformed IDs are rejected.
 *
 * @param {unknown} value
 * @returns {string}
 */
function resolveRequestId(value) {
    if (typeof value === 'string' && REQUEST_ID_PATTERN.test(value)) {
        return value;
    }

    return generateRequestId();
}

app.use((req, res, next) => {
    const requestId = resolveRequestId(req.headers['x-request-id']);

    req.id = requestId;

    res.setHeader('X-Request-ID', requestId);

    runWithRequestContext({ requestId }, () => {
        next();
    });
});

// ============================================================================
// HTTP LOGGING
// ============================================================================

if (logger && typeof logger.pinoHttp === 'function') {
    app.use(
        pinoHttp({
            logger,

            genReqId: (req) => req.id,

            /**
             * Never serialize complete request/response objects.
             */
            serializers: {
                req: (req) => ({
                    id: sanitizeForDisplay(req.id, 128),
                    method: sanitizeForDisplay(req.method, 16),
                    path: safeLogPath(req),
                }),

                res: (res) => ({
                    statusCode:
                        Number.isInteger(res.statusCode) &&
                        res.statusCode >= 100 &&
                        res.statusCode <= 599
                            ? res.statusCode
                            : 500,
                }),

                /**
                 * IMPORTANT:
                 *
                 * pino-http can otherwise serialize the raw Error object.
                 * Never expose message/stack/cause here.
                 *
                 * Detailed error logging is handled exclusively by the
                 * centralized error handler through errors.js.
                 */
                err: () => ({
                    type: 'request_error',
                }),
            },

            redact: {
                paths: [
                    'req.headers.authorization',
                    'req.headers.cookie',
                    'req.headers["x-api-key"]',
                    'req.headers["x-auth-token"]',
                    'req.headers["proxy-authorization"]',

                    'req.body.password',
                    'req.body.token',
                    'req.body.accessToken',
                    'req.body.refreshToken',
                    'req.body.secret',
                    'req.body.apiKey',
                    'req.body.creditCard',
                    'req.body.cvv',
                    'req.body.newPassword',
                    'req.body.currentPassword',
                    'req.body.confirmPassword',
                ],
                censor: '***REDACTED***',
            },

            customLogLevel: (req, res, err) => {
                if (res.statusCode >= 500 || err) {
                    return 'error';
                }

                if (res.statusCode >= 400) {
                    return 'warn';
                }

                return 'info';
            },

            customSuccessMessage: (req, res) =>
                `${req.method} ${safeLogPath(req)} ${res.statusCode}`,

            /**
             * Never include err.message here.
             */
            customErrorMessage: (req, res) =>
                `${req.method} ${safeLogPath(req)} ${res.statusCode} - request_error`,
        })
    );
} else {
    /**
     * Safe fallback when pino-http is unavailable.
     */
    app.use((req, res, next) => {
        const start = Date.now();

        res.on('finish', () => {
            const durationMs = Math.max(0, Date.now() - start);

            const entry = {
                level:
                    res.statusCode >= 500
                        ? 'error'
                        : res.statusCode >= 400
                          ? 'warn'
                          : 'info',
                msg: 'request',
                requestId: sanitizeForDisplay(req.id, 128),
                method: sanitizeForDisplay(req.method, 16),
                path: safeLogPath(req),
                status: res.statusCode,
                durationMs,
            };

            try {
                // eslint-disable-next-line no-console
                console.log(JSON.stringify(entry));
            } catch {
                // Logging must never crash the request lifecycle.
            }
        });

        next();
    });
}

// ============================================================================
// SECURITY HEADERS
// ============================================================================

const helmetConfig = {
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],

            /*
             * Existing EJS views currently require inline scripts/styles.
             * unsafe-eval is deliberately NOT allowed.
             *
             * Future hardening target:
             * nonce/hash based CSP.
             */
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],

            imgSrc: ["'self'", 'data:', 'https:'],
            fontSrc: ["'self'"],
            connectSrc: ["'self'"],
            frameSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],

            upgradeInsecureRequests: IS_PRODUCTION ? [] : null,
        },

        reportOnly: !IS_PRODUCTION,
    },

    xContentTypeOptions: true,

    referrerPolicy: {
        policy: 'strict-origin-when-cross-origin',
    },

    hsts: IS_PRODUCTION
        ? {
              maxAge: 31536000,
              includeSubDomains: true,
              preload: true,
          }
        : false,

    frameguard: {
        action: 'deny',
    },

    dnsPrefetchControl: {
        allow: false,
    },

    permissionsPolicy: {
        features: {
            geolocation: ["'self'"],
            microphone: ["'none'"],
            camera: ["'none'"],
            payment: ["'self'"],
            syncXhr: ["'self'"],
        },
    },

    /*
     * Keep disabled because the application may need to embed content.
     * frameguard still protects the application from clickjacking.
     */
    crossOriginEmbedderPolicy: false,
};

app.use(helmet(helmetConfig));

// ============================================================================
// CORS
// ============================================================================

/**
 * Validate an HTTP origin exactly.
 *
 * @param {unknown} candidate
 * @returns {boolean}
 */
function isValidHttpOrigin(candidate) {
    if (typeof candidate !== 'string' || candidate.length === 0) {
        return false;
    }

    try {
        const url = new URL(candidate);

        return (
            (url.protocol === 'http:' || url.protocol === 'https:') &&
            url.origin === candidate
        );
    } catch {
        return false;
    }
}

const DEV_LOCALHOST_ORIGIN =
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

function buildCorsOptions() {
    const configuredOrigins = Array.isArray(corsConfig?.ALLOWED_ORIGINS)
        ? corsConfig.ALLOWED_ORIGINS
        : [];

    const allowCredentials = corsConfig?.CREDENTIALS === true;

    const validOrigins = configuredOrigins.filter(isValidHttpOrigin);

    const invalidOrigins = configuredOrigins.filter(
        (origin) => !isValidHttpOrigin(origin)
    );

    if (
        invalidOrigins.length > 0 &&
        logger &&
        typeof logger.warn === 'function'
    ) {
        logger.warn(
            {
                invalidOrigins: invalidOrigins.map((origin) =>
                    sanitizeForDisplay(String(origin), 128)
                ),
            },
            'Ignoring invalid CORS origins'
        );
    }

    const allowedOriginSet = new Set(validOrigins);

    const originValidator = (origin, callback) => {
        /*
         * No Origin means this is not a browser CORS request.
         */
        if (!origin) {
            callback(null, true);
            return;
        }

        if (allowedOriginSet.has(origin)) {
            callback(null, true);
            return;
        }

        if (!IS_PRODUCTION && DEV_LOCALHOST_ORIGIN.test(origin)) {
            callback(null, true);
            return;
        }

        callback(null, false);
    };

    return {
        origin: originValidator,
        credentials: allowCredentials,
        optionsSuccessStatus: 200,

        methods: [
            'GET',
            'HEAD',
            'PUT',
            'PATCH',
            'POST',
            'DELETE',
            'OPTIONS',
        ],

        allowedHeaders: [
            'Origin',
            'X-Requested-With',
            'Content-Type',
            'Accept',
            'Authorization',
            'X-Request-ID',
            'X-CSRF-Token',
            'X-API-Key',
        ],

        exposedHeaders: [
            'X-Request-ID',
            'X-RateLimit-Limit',
            'X-RateLimit-Remaining',
        ],

        maxAge: 86400,
    };
}

const corsOptions = buildCorsOptions();

app.use(cors(corsOptions));

app.options('/{*splat}', cors(corsOptions));

// ============================================================================
// COOKIE PARSER
// ============================================================================

const cookieSecret = securityConfig.COOKIE_SECRET || '';

if (!cookieSecret && IS_PRODUCTION) {
    logger.error('Cookie secret is required in production');
    throw new Error('Cookie secret is required in production');
}

app.use(
    cookieParser(cookieSecret, {
        decode: (value) => {
            try {
                return decodeURIComponent(value);
            } catch {
                /*
                 * Preserve malformed cookie value as-is rather than
                 * crashing the entire request.
                 */
                return value;
            }
        },
    })
);

// ============================================================================
// BODY PARSERS
// ============================================================================

app.use(
    express.json({
        limit: '1mb',
        strict: true,
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: '1mb',
        parameterLimit: 1000,
    })
);

// ============================================================================
// SESSION
// ============================================================================

const sessionSecret = getSessionSecret();

const sessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,

    name: 'tesnow.sid',

    cookie: {
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: IS_PRODUCTION ? 'strict' : 'lax',
        maxAge:
            sessionConfig.MAX_AGE || 24 * 60 * 60 * 1000,
        path: '/',
        domain: sessionConfig.DOMAIN || undefined,
    },

    store: sessionConfig.STORE || undefined,
};

if (!sessionOptions.secret && IS_PRODUCTION) {
    logger.error('Session secret is required in production');
    throw new Error('Session secret is required in production');
}

if (!sessionOptions.store) {
    if (IS_PRODUCTION) {
        logger.error('External session store is required in production');
        throw new Error('External session store is required in production');
    }

    sessionOptions.store = new session.MemoryStore();

    logger.warn(
        'Using MemoryStore for sessions - not suitable for production'
    );
}

/*
 * Preserve the exact Express trust-proxy semantics.
 *
 * Do NOT coerce this to Boolean.
 */
if (appConfig.TRUST_PROXY !== undefined) {
    sessionOptions.proxy = appConfig.TRUST_PROXY;
}

app.use(session(sessionOptions));

// ============================================================================
// RATE LIMITING
// ============================================================================

const RATE_LIMIT_EXEMPT_PATHS = new Set([
    '/live',
    '/health',
]);

const globalRateLimiter = rateLimit({
    windowMs:
        rateLimitConfig.WINDOW_MS ||
        15 * 60 * 1000,

    max:
        rateLimitConfig.MAX_REQUESTS ||
        100,

    standardHeaders: 'draft-7',
    legacyHeaders: false,

    skip: (req) =>
        RATE_LIMIT_EXEMPT_PATHS.has(req.path),

    keyGenerator: (req) => {
        if (!req.ip) {
            return 'unknown';
        }

        return ipKeyGenerator(req.ip);
    },

    handler: (req, res) => {
        const error = new RateLimitError(
            'Too many requests, please try again later.'
        );

        const response = toSafeErrorResponse(error, {
            development: !IS_PRODUCTION,
            requestId: req.id,
        });

        res.status(429).json(response);
    },
});

app.use(globalRateLimiter);

// ============================================================================
// STATIC FILES
// ============================================================================

const publicDir = path.join(PROJECT_ROOT, 'public');

app.use(
    '/static',
    express.static(publicDir, {
        maxAge: IS_PRODUCTION ? '30d' : 0,
        index: false,
        dotfiles: 'deny',
        etag: true,
        lastModified: true,

        setHeaders: (res) => {
            if (IS_PRODUCTION) {
                res.setHeader(
                    'Cache-Control',
                    'public, max-age=2592000'
                );
            }
        },
    })
);

// ============================================================================
// UPLOAD DIRECTORY
// ============================================================================

/**
 * Resolve and validate upload directory.
 *
 * This prevents obvious application-source exposure through:
 * - project root
 * - filesystem root
 * - ancestors of project root
 *
 * Symlink containment must additionally be handled by the upload service.
 *
 * @param {unknown} rawDir
 * @returns {string|null}
 */
function resolveSafeUploadDir(rawDir) {
    if (typeof rawDir !== 'string' || rawDir.length === 0) {
        return null;
    }

    const resolved = path.resolve(rawDir);
    const filesystemRoot = path.parse(resolved).root;

    if (resolved === PROJECT_ROOT) {
        return null;
    }

    if (resolved === filesystemRoot) {
        return null;
    }

    /*
     * Reject directories that are ancestors of PROJECT_ROOT.
     */
    const projectPrefix = `${PROJECT_ROOT}${path.sep}`;
    const resolvedPrefix = `${resolved}${path.sep}`;

    if (projectPrefix.startsWith(resolvedPrefix)) {
        return null;
    }

    return resolved;
}

const safeUploadDir = resolveSafeUploadDir(
    uploadConfig.UPLOAD_DIR
);

if (safeUploadDir) {
    app.use(
        '/uploads',
        express.static(safeUploadDir, {
            maxAge: IS_PRODUCTION ? '1d' : 0,
            index: false,
            dotfiles: 'deny',
            etag: true,
            lastModified: true,

            setHeaders: (res) => {
                res.setHeader(
                    'X-Content-Type-Options',
                    'nosniff'
                );

                /*
                 * Defense-in-depth for untrusted uploaded content.
                 *
                 * The upload service is still responsible for:
                 * - MIME validation
                 * - extension validation
                 * - content validation
                 * - random filenames
                 * - size limits
                 * - symlink-safe containment
                 */
                res.setHeader(
                    'Content-Security-Policy',
                    "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox"
                );
            },
        })
    );
} else if (
    uploadConfig.UPLOAD_DIR &&
    logger &&
    typeof logger.warn === 'function'
) {
    logger.warn(
        'Configured UPLOAD_DIR failed path-safety validation; /uploads was not mounted'
    );
}

// ============================================================================
// VIEW ENGINE
// ============================================================================

app.set('view engine', 'ejs');

const viewsDir = path.join(PROJECT_ROOT, 'views');

app.set('views', viewsDir);
app.set('view cache', IS_PRODUCTION);

// ============================================================================
// HEALTH / LIVENESS / READINESS
// ============================================================================

/**
 * Liveness endpoint.
 *
 * Must remain cheap and dependency-free.
 */
app.get('/live', (req, res) => {
    res.json({
        success: true,
        status: 'alive',
        timestamp: new Date().toISOString(),
        requestId: req.id,
    });
});

/**
 * Readiness endpoint.
 *
 * Performs a lightweight database connectivity check.
 *
 * Client receives only safe status information.
 * Detailed diagnostics are sanitized before logging.
 */
app.get('/ready', async (req, res) => {
    try {
        const pool = getDbPool();

        const connection = await pool.getConnection();

        try {
            await connection.query('SELECT 1');
        } finally {
            connection.release();
        }

        res.status(200).json({
            success: true,
            status: 'ready',
            database: 'ready',
            timestamp: new Date().toISOString(),
            requestId: req.id,
        });
    } catch (error) {
        /*
         * Never expose database details to the client.
         *
         * Still create a normalized + sanitized server-side diagnostic.
         */
        try {
            const normalized = normalizeError(error, {
                requestId: req.id,
                userId: getRequestUserId(req),
            });

            const logEntry = prepareErrorForLogging(
                normalized,
                {
                    requestId: req.id,
                    method: req.method,
                    path: safeLogPath(req),
                    ip: req.ip,
                    userAgent: sanitizeForDisplay(
                        req.get('user-agent'),
                        256
                    ),
                }
            );

            if (
                logger &&
                typeof logger.error === 'function'
            ) {
                logger.error(
                    logEntry,
                    'Readiness database check failed'
                );
            }
        } catch {
            /*
             * Diagnostics must never prevent the 503 response.
             */
        }

        res.status(503).json({
            success: false,
            status: 'not_ready',
            database: 'unavailable',
            timestamp: new Date().toISOString(),
            requestId: req.id,
        });
    }
});

/**
 * High-level health endpoint.
 *
 * No infrastructure details are exposed in production.
 */
app.get('/health', (req, res) => {
    const response = {
        success: true,
        status: 'ok',
        timestamp: new Date().toISOString(),
        requestId: req.id,
    };

    if (!IS_PRODUCTION) {
        response.environment = NODE_ENV;
    }

    res.json(response);
});

// ============================================================================
// APPLICATION ROUTES
// ============================================================================

app.use('/', rootRouter);

// ============================================================================
// 404 HANDLER
// ============================================================================

app.use((req, res) => {
    if (prefersJson(req)) {
        const response = toSafeErrorResponse(
            new NotFoundError('Resource not found'),
            {
                development: !IS_PRODUCTION,
                requestId: req.id,
            }
        );

        res.status(404).json(response);
        return;
    }

    res.status(404);

    if (typeof res.render === 'function') {
        res.render(
            'errors/404',
            {
                title: 'Page Not Found',
                requestId: req.id,
                user: req.user || null,
            },
            (renderError, html) => {
                if (res.headersSent) {
                    return;
                }

                if (renderError) {
                    res.type('text/plain').send(
                        'Page Not Found'
                    );
                    return;
                }

                res.send(html);
            }
        );

        return;
    }

    res.type('text/plain').send('Page Not Found');
});

// ============================================================================
// CENTRAL ERROR HANDLER
// ============================================================================

/**
 * Centralized application error handler.
 *
 * Error flow:
 *
 * thrown error
 *     ↓
 * normalizeError()
 *     ↓
 * prepareErrorForLogging()
 *     ↓
 * getHttpStatus()
 *     ↓
 * toSafeErrorResponse()
 */
app.use((err, req, res, next) => {
    /*
     * Once headers are sent, Express's final handler must take over.
     */
    if (res.headersSent) {
        next(err);
        return;
    }

    const requestId = req.id || null;

    let normalized;

    try {
        normalized = normalizeError(err, {
            requestId,
            userId: getRequestUserId(req),
        });
    } catch {
        /*
         * normalizeError itself should normally never fail.
         * If it does, avoid leaking the original error.
         */
        normalized = normalizeError(
            new Error('Internal server error'),
            {
                requestId,
                userId: null,
            }
        );
    }

    /*
     * Prepare sanitized diagnostic information.
     */
    let logEntry;

    try {
        logEntry = prepareErrorForLogging(
            normalized,
            {
                requestId,
                method: req.method,
                path: safeLogPath(req),
                ip: req.ip,
                userAgent: sanitizeForDisplay(
                    req.get('user-agent'),
                    256
                ),
            }
        );
    } catch {
        /*
         * Logging preparation must never break error handling.
         */
        logEntry = {
            timestamp: new Date().toISOString(),

            error: {
                code: normalized.code,
                statusCode: getHttpStatus(normalized),
                isOperational: normalized.isOperational,
                requestId,
            },

            context: {
                requestId,
                method: sanitizeForDisplay(
                    req.method,
                    16
                ),
                path: safeLogPath(req),
            },
        };
    }

    /*
     * Server-side structured logging.
     */
    try {
        if (
            logger &&
            typeof logger.error === 'function'
        ) {
            logger.error(logEntry);
        } else {
            // eslint-disable-next-line no-console
            console.error(
                JSON.stringify(logEntry)
            );
        }
    } catch {
        /*
         * Logging must never cause another application error.
         */
    }

    const statusCode = getHttpStatus(normalized);

    /*
     * Client-safe response is controlled exclusively by errors.js.
     */
    const responseBody = toSafeErrorResponse(
        normalized,
        {
            development: !IS_PRODUCTION,
            includeStack: !IS_PRODUCTION,
            requestId,
        }
    );

    if (prefersJson(req)) {
        res.status(statusCode).json(responseBody);
        return;
    }

    res.status(statusCode);

    if (typeof res.render === 'function') {
        const safeMessage =
            responseBody?.error?.message ||
            'An unexpected error occurred.';

        res.render(
            'errors/error',
            {
                title: `Error ${statusCode}`,
                statusCode,
                message: safeMessage,
                requestId,
                user: req.user || null,
            },
            (renderError, html) => {
                if (res.headersSent) {
                    return;
                }

                if (renderError) {
                    res.type('text/plain').send(
                        `Error ${statusCode}: ${safeMessage}`
                    );
                    return;
                }

                res.send(html);
            }
        );

        return;
    }

    res.type('text/plain').send(
        `Error ${statusCode}: ${safeMessage}`
    );
});

// ============================================================================
// EXPORT
// ============================================================================

export default app;