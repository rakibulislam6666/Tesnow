/**
 * ============================================================
 * TESNOW — DATABASE CONFIGURATION
 * ============================================================
 *
 * Production-ready MySQL configuration module.
 *
 * Responsibilities:
 * - Load environment configuration
 * - Validate database settings
 * - Lazily create a MySQL connection pool
 * - Provide safe configuration information
 * - Provide a database connectivity test
 *
 * Security:
 * - Database password is never exported
 * - Database password is never logged
 * - Placeholder passwords are rejected
 * - Numeric configuration values are strictly validated
 * - Multiple SQL statements are disabled
 * - Database connection is NOT attempted on module import
 *
 * Future-ready for:
 * - Transactions
 * - Repositories
 * - Migrations
 * - Health checks
 * - Graceful shutdown
 * ============================================================
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Known placeholder passwords that must never be used.
 */
const PLACEHOLDER_PASSWORDS = new Set([
  'CHANGE_ME_DATABASE_PASSWORD',
  'YOUR_SECURE_DB_PASSWORD_HERE',
  'YOUR_DB_PASSWORD_HERE',
  'YOUR_PASSWORD_HERE',
  'CHANGE_ME',
  'changeme',
  'password',
  'your_password_here',
]);

/**
 * Internal pool state.
 *
 * The pool remains null until getDbPool() is called.
 */
let pool = null;

/**
 * Internal validated configuration.
 *
 * This is intentionally never exported directly because
 * it contains the database password.
 */
let databaseConfig = null;

/**
 * Check whether a value contains only decimal digits.
 *
 * @param {string} value
 * @returns {boolean}
 */
function isStrictInteger(value) {
  return /^\d+$/.test(value.trim());
}

/**
 * Parse and validate a required numeric environment value.
 *
 * @param {string} name
 * @param {string|undefined} rawValue
 * @param {number} defaultValue
 * @param {number} minimum
 * @param {number} maximum
 * @returns {number}
 */
function parseIntegerEnv(
  name,
  rawValue,
  defaultValue,
  minimum,
  maximum = Number.MAX_SAFE_INTEGER
) {
  const value = rawValue?.trim() || String(defaultValue);

  if (!isStrictInteger(value)) {
    throw new Error(`${name} must contain only numeric digits.`);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be a valid safe integer.`);
  }

  if (parsed < minimum || parsed > maximum) {
    throw new Error(
      `${name} must be between ${minimum} and ${maximum}.`
    );
  }

  return parsed;
}

/**
 * Validate database environment configuration.
 *
 * This function does not create a connection.
 *
 * @returns {Object}
 * @throws {Error}
 */
function validateDatabaseConfig() {
  const requiredFields = [
    'DB_HOST',
    'DB_NAME',
    'DB_USER',
  ];

  const missingFields = requiredFields.filter((name) => {
    const value = process.env[name];
    return !value || value.trim() === '';
  });

  if (missingFields.length > 0) {
    throw new Error(
      `Missing required database configuration: ${missingFields.join(', ')}`
    );
  }

  const host = process.env.DB_HOST.trim();
  const database = process.env.DB_NAME.trim();
  const user = process.env.DB_USER.trim();

  /**
   * Password must always exist and must never use
   * known placeholder values.
   */
  const rawPassword = process.env.DB_PASSWORD;

  if (!rawPassword || rawPassword.trim() === '') {
    throw new Error(
      'DB_PASSWORD is required and cannot be empty.'
    );
  }

  const password = rawPassword.trim();

  const isPlaceholder = [...PLACEHOLDER_PASSWORDS].some(
    (placeholder) =>
      password.toLowerCase() === placeholder.toLowerCase()
  );

  if (isPlaceholder) {
    throw new Error(
      'DB_PASSWORD contains a placeholder value. Please set a secure password.'
    );
  }

  const port = parseIntegerEnv(
    'DB_PORT',
    process.env.DB_PORT,
    3306,
    1,
    65535
  );

  const connectionLimit = parseIntegerEnv(
    'DB_CONNECTION_LIMIT',
    process.env.DB_CONNECTION_LIMIT,
    10,
    1,
    1000
  );

  const queueLimit = parseIntegerEnv(
    'DB_QUEUE_LIMIT',
    process.env.DB_QUEUE_LIMIT,
    0,
    0,
    Number.MAX_SAFE_INTEGER
  );

  const connectTimeout = parseIntegerEnv(
    'DB_CONNECT_TIMEOUT',
    process.env.DB_CONNECT_TIMEOUT,
    10000,
    1,
    300000
  );

  return {
    host,
    port,
    database,
    user,
    password,

    connectionLimit,
    queueLimit,
    connectTimeout,

    charset: 'utf8mb4',
    timezone: '+00:00',

    /**
     * Security:
     * Prevent execution of multiple SQL statements
     * through a single query call.
     */
    multipleStatements: false,

    /**
     * Return DATE/DATETIME values as strings.
     * This avoids implicit timezone conversion surprises.
     */
    dateStrings: true,

    /**
     * TCP keep-alive helps long-running server processes.
     */
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  };
}

/**
 * Return validated internal configuration.
 *
 * Validation is cached after the first successful call.
 *
 * @returns {Object}
 */
function getValidatedConfig() {
  if (!databaseConfig) {
    databaseConfig = validateDatabaseConfig();
  }

  return databaseConfig;
}

/**
 * Lazily create and return the MySQL connection pool.
 *
 * IMPORTANT:
 * Calling this function creates the pool, but it does not
 * explicitly establish a database connection immediately.
 *
 * @returns {import('mysql2/promise').Pool}
 */
function getDbPool() {
  if (pool) {
    return pool;
  }

  const config = getValidatedConfig();

  pool = mysql.createPool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,

    connectionLimit: config.connectionLimit,
    queueLimit: config.queueLimit,
    connectTimeout: config.connectTimeout,

    charset: config.charset,
    timezone: config.timezone,

    multipleStatements: config.multipleStatements,
    dateStrings: config.dateStrings,

    enableKeepAlive: config.enableKeepAlive,
    keepAliveInitialDelay: config.keepAliveInitialDelay,
  });

  /**
   * mysql2 pool error handler.
   *
   * Only safe diagnostic fields are logged.
   * Passwords and credentials are never logged.
   */
  pool.on('error', (error) => {
    console.error('Database pool error:', {
      code: error?.code || 'UNKNOWN',
      errno: error?.errno ?? null,
      sqlState: error?.sqlState ?? null,
    });
  });

  return pool;
}

/**
 * Return a safe database configuration object.
 *
 * The password is intentionally excluded.
 *
 * @returns {Object}
 */
function getSafeConfig() {
  const config = getValidatedConfig();

  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,

    connectionLimit: config.connectionLimit,
    queueLimit: config.queueLimit,
    connectTimeout: config.connectTimeout,

    charset: config.charset,
    timezone: config.timezone,

    multipleStatements: config.multipleStatements,
    dateStrings: config.dateStrings,

    enableKeepAlive: config.enableKeepAlive,
    keepAliveInitialDelay: config.keepAliveInitialDelay,

    hasPassword: true,
    environment: process.env.NODE_ENV || 'development',
  };
}

/**
 * Test the database connection.
 *
 * - Gets the pool lazily
 * - Acquires one connection
 * - Executes a safe read-only test query
 * - Always releases the connection in finally
 * - Never exposes credentials
 *
 * @returns {Promise<Object>}
 * @throws {Error}
 */
async function testDatabaseConnection() {
  let connection = null;

  try {
    const dbPool = getDbPool();

    connection = await dbPool.getConnection();

    const [rows] = await connection.query(
      'SELECT 1 AS test, CONNECTION_ID() AS connection_id, NOW() AS server_time'
    );

    return {
      success: true,
      message: 'Database connection successful',
      connectionId: rows[0]?.connection_id ?? null,
      serverTime: rows[0]?.server_time ?? null,
      database: getValidatedConfig().database,
    };
  } catch (error) {
    /**
     * Only safe diagnostic information is logged.
     */
    console.error('Database connection test failed:', {
      code: error?.code || 'UNKNOWN',
      errno: error?.errno ?? null,
      sqlState: error?.sqlState ?? null,
    });

    let message = 'Database connection failed.';

    switch (error?.code) {
      case 'ECONNREFUSED':
        message =
          'Database connection refused. Check the database host and port.';
        break;

      case 'ER_ACCESS_DENIED_ERROR':
        message =
          'Database access denied. Check the database username and password.';
        break;

      case 'ER_BAD_DB_ERROR':
        message =
          'Database does not exist. Check the database name.';
        break;

      case 'ETIMEDOUT':
        message =
          'Database connection timed out. Check the network and database server.';
        break;

      case 'ENOTFOUND':
        message =
          'Database host could not be resolved. Check DB_HOST.';
        break;

      default:
        break;
    }

    throw new Error(message);
  } finally {
    /**
     * Always release the connection back to the pool.
     */
    if (connection) {
      try {
        connection.release();
      } catch (releaseError) {
        console.error('Database connection release failed:', {
          code: releaseError?.code || 'UNKNOWN',
        });
      }
    }
  }
}

/**
 * Public API of this module.
 */
export default {
  getDbPool,
  getSafeConfig,
  testDatabaseConnection,
  validateConfig: validateDatabaseConfig,
};

export {
  getDbPool,
  getSafeConfig,
  testDatabaseConnection,
  validateDatabaseConfig,
};

export const validateDbConfig = validateDatabaseConfig;