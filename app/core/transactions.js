/**
 * app/core/transactions.js
 * Database transaction utility for Tesnow
 * Provides safe, reusable transaction lifecycle management
 * 
 * @module transactions
 */

import { getDbPool } from '../config/database.config.js';

// ----------------------------------------------------------------------------
// 1. CONSTANTS
// ----------------------------------------------------------------------------

// Valid isolation levels for MariaDB/MySQL
const VALID_ISOLATION_LEVELS = new Set([
    'READ UNCOMMITTED',
    'READ COMMITTED',
    'REPEATABLE READ',
    'SERIALIZABLE',
]);

// Default isolation level (use database default)
const DEFAULT_ISOLATION_LEVEL = null;

// ----------------------------------------------------------------------------
// 2. HELPER FUNCTIONS
// ----------------------------------------------------------------------------

/**
 * Validate that the callback is a function
 * @param {*} callback - The callback to validate
 * @throws {TypeError} If callback is not a function
 */
function validateCallback(callback) {
    if (typeof callback !== 'function') {
        throw new TypeError('Transaction callback must be a function');
    }
}

/**
 * Validate isolation level against allowed values
 * @param {string} isolationLevel - Isolation level to validate
 * @returns {string|null} Validated isolation level or null
 * @throws {Error} If isolation level is invalid
 */
function validateIsolationLevel(isolationLevel) {
    if (isolationLevel === null || isolationLevel === undefined) {
        return null;
    }
    
    const normalized = String(isolationLevel).toUpperCase().trim();
    
    if (!VALID_ISOLATION_LEVELS.has(normalized)) {
        throw new Error(`Invalid isolation level: ${isolationLevel}. Must be one of: ${Array.from(VALID_ISOLATION_LEVELS).join(', ')}`);
    }
    
    return normalized;
}

/**
 * Set transaction isolation level if specified
 * @param {Object} connection - MySQL connection
 * @param {string|null} isolationLevel - Isolation level to set
 * @returns {Promise<void>}
 */
async function setIsolationLevel(connection, isolationLevel) {
    if (isolationLevel) {
        await connection.execute(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
    }
}

/**
 * Safely release a connection
 * @param {Object} connection - MySQL connection to release
 */
function safeRelease(connection) {
    if (connection && typeof connection.release === 'function') {
        try {
            connection.release();
        } catch {
            // Ignore release errors - connection is likely already released
        }
    }
}

/**
 * Safe rollback with error handling
 * @param {Object} connection - MySQL connection
 * @returns {Promise<boolean>} True if rollback succeeded, false otherwise
 */
async function safeRollback(connection) {
    if (!connection || typeof connection.rollback !== 'function') {
        return false;
    }
    
    try {
        await connection.rollback();
        return true;
    } catch {
        // Rollback failed - connection may be in an invalid state
        return false;
    }
}

/**
 * Safe commit with error handling
 * @param {Object} connection - MySQL connection
 * @returns {Promise<boolean>} True if commit succeeded, false otherwise
 */
async function safeCommit(connection) {
    if (!connection || typeof connection.commit !== 'function') {
        return false;
    }
    
    try {
        await connection.commit();
        return true;
    } catch {
        return false;
    }
}

// ----------------------------------------------------------------------------
// 3. CORE TRANSACTION FUNCTIONS
// ----------------------------------------------------------------------------

/**
 * Execute a callback within a database transaction
 * 
 * @param {Function} callback - Async function that receives the connection
 * @param {Object} options - Transaction options
 * @param {Object} options.connection - Existing connection to use (optional)
 * @param {string} options.isolationLevel - Transaction isolation level (optional)
 * @param {boolean} options.readOnly - Set transaction as read-only (optional)
 * @returns {Promise<*>} Result of the callback
 * 
 * @example
 * // Basic usage
 * const result = await withTransaction(async (connection) => {
 *   await connection.execute('INSERT INTO posts (title) VALUES (?)', ['My Post']);
 *   const [rows] = await connection.execute('SELECT LAST_INSERT_ID() as id');
 *   return rows[0].id;
 * });
 * 
 * @example
 * // With existing connection (nested transaction)
 * const result = await withTransaction(async (connection) => {
 *   // Outer transaction
 *   return await withTransaction(async (innerConn) => {
 *     // Uses the same connection
 *     await innerConn.execute('...');
 *   }, { connection });
 * }, { isolationLevel: 'SERIALIZABLE' });
 */
export async function withTransaction(callback, options = {}) {
    // Validate callback
    validateCallback(callback);
    
    // Extract options
    const {
        connection: providedConnection = null,
        isolationLevel: rawIsolationLevel = DEFAULT_ISOLATION_LEVEL,
        readOnly: rawReadOnly = false,
    } = options;
    
    // Validate isolation level
    const isolationLevel = validateIsolationLevel(rawIsolationLevel);
    const readOnly = typeof rawReadOnly === 'boolean' ? rawReadOnly : false;
    
    // Determine if we own the connection
    const ownsConnection = !providedConnection;
    let connection = providedConnection;
    let connectionAcquired = false;
    
    try {
        // Acquire connection if not provided
        if (ownsConnection) {
            const pool = getDbPool();
            connection = await pool.getConnection();
            connectionAcquired = true;
        }
        
        // Begin transaction
        if (ownsConnection) {
            // Set isolation level before beginning transaction
            if (isolationLevel) {
                await setIsolationLevel(connection, isolationLevel);
            }
            
            // Set read-only if requested
            if (readOnly) {
                await connection.execute('SET TRANSACTION READ ONLY');
            }
            
            await connection.beginTransaction();
        }
        
        // Execute callback with connection
        let callbackResult;
        let callbackError = null;
        
        try {
            callbackResult = await callback(connection);
        } catch (error) {
            callbackError = error;
        }
        
        // Handle callback error
        if (callbackError) {
            // Rollback if we own the transaction
            if (ownsConnection) {
                const rollbackSuccess = await safeRollback(connection);
                
                if (!rollbackSuccess) {
                    // Rollback failed - connection may be in invalid state
                    // We still need to release, but we'll preserve the original error
                    safeRelease(connection);
                    connection = null;
                    throw callbackError;
                }
                
                // Release connection after rollback
                safeRelease(connection);
                connection = null;
            }
            
            // Propagate the original error
            throw callbackError;
        }
        
        // Commit transaction if we own it
        if (ownsConnection) {
            const commitSuccess = await safeCommit(connection);
            
            if (!commitSuccess) {
                // Commit failed - attempt rollback
                await safeRollback(connection);
                safeRelease(connection);
                connection = null;
                
                // Throw a clear error
                const commitError = new Error('Transaction commit failed');
                commitError.code = 'COMMIT_FAILED';
                commitError.cause = callbackError || null;
                throw commitError;
            }
            
            // Release connection after successful commit
            safeRelease(connection);
            connection = null;
        }
        
        // Return callback result
        return callbackResult;
        
    } catch (error) {
        // Handle errors during connection acquisition, begin, or transaction setup
        // Clean up any acquired connection
        if (ownsConnection && connectionAcquired && connection) {
            try {
                // Attempt rollback if transaction might have been started
                await safeRollback(connection);
            } catch {
                // Ignore rollback errors during error handling
            } finally {
                safeRelease(connection);
            }
        } else if (!ownsConnection && connection) {
            // We don't own this connection - don't release it
            // But we should ensure it's not in an invalid state
            // The caller owns the lifecycle
        }
        
        // Re-throw the error
        throw error;
    }
}

/**
 * Execute a callback within a transaction with automatic retry on deadlock
 * 
 * @param {Function} callback - Async function that receives the connection
 * @param {Object} options - Transaction options
 * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
 * @param {number} options.retryDelay - Delay in ms between retries (default: 100)
 * @param {Object} options.connection - Existing connection to use (optional)
 * @param {string} options.isolationLevel - Transaction isolation level (optional)
 * @param {boolean} options.readOnly - Set transaction as read-only (optional)
 * @returns {Promise<*>} Result of the callback
 * 
 * @example
 * const result = await withTransactionRetry(async (connection) => {
 *   await connection.execute('UPDATE accounts SET balance = balance - ? WHERE id = ?', [100, 1]);
 *   await connection.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [100, 2]);
 *   return { success: true };
 * }, { maxRetries: 3 });
 */
export async function withTransactionRetry(callback, options = {}) {
    const {
        maxRetries = 3,
        retryDelay = 100,
        ...transactionOptions
    } = options;
    
    // Validate retry parameters
    const maxAttempts = Math.max(1, Math.min(maxRetries, 10));
    const delay = Math.max(0, Math.min(retryDelay, 5000));
    
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxAttempts + 1; attempt++) {
        try {
            return await withTransaction(callback, transactionOptions);
        } catch (error) {
            lastError = error;
            
            // Check if this is a retryable deadlock error
            const isDeadlock = error.code === 'ER_LOCK_DEADLOCK' ||
                              error.code === 'DEADLOCK' ||
                              (error.errno === 1213) ||
                              (error.sqlState === '40001');
            
            // Check if this is a lock timeout
            const isLockTimeout = error.code === 'ER_LOCK_WAIT_TIMEOUT' ||
                                 error.errno === 1205;
            
            // Only retry on transient database errors
            const isRetryable = isDeadlock || isLockTimeout;
            
            if (isRetryable && attempt <= maxAttempts) {
                // Wait before retry (with jitter to reduce contention)
                const jitter = Math.random() * 0.5 + 0.75; // 0.75-1.25 multiplier
                const waitTime = delay * attempt * jitter;
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            
            // Not retryable or max attempts reached
            throw error;
        }
    }
    
    // Should never reach here, but TypeScript safety
    throw lastError;
}

// ----------------------------------------------------------------------------
// 4. EXPORTS
// ----------------------------------------------------------------------------

export default {
    withTransaction,
    withTransactionRetry,
    VALID_ISOLATION_LEVELS,
};