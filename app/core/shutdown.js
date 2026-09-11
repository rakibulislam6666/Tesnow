/**
 * app/core/shutdown.js
 * Centralized graceful shutdown utility for Tesnow
 * Coordinates safe application shutdown for HTTP server, database, and custom resources
 * 
 * @module shutdown
 */

// ----------------------------------------------------------------------------
// 1. CONSTANTS
// ----------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_PRIORITY = 100;
const STATE_IDLE = 'idle';
const STATE_SHUTTING_DOWN = 'shutting_down';
const STATE_COMPLETED = 'completed';
const STATE_FAILED = 'failed';
const STATE_TIMED_OUT = 'timed_out';

// ----------------------------------------------------------------------------
// 2. CUSTOM ERRORS
// ----------------------------------------------------------------------------

export class ShutdownError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'ShutdownError';
        this.code = options.code || 'SHUTDOWN_ERROR';
        if (options.details) {
            this.details = options.details;
        }
    }
}

export class ShutdownTimeoutError extends ShutdownError {
    constructor(timeoutMs, options = {}) {
        super(`Shutdown timed out after ${timeoutMs}ms`, {
            code: 'SHUTDOWN_TIMEOUT',
            details: { timeoutMs },
            ...options,
        });
        this.name = 'ShutdownTimeoutError';
    }
}

export class DuplicateCleanupError extends ShutdownError {
    constructor(name, options = {}) {
        super(`Cleanup handler "${name}" already registered`, {
            code: 'DUPLICATE_CLEANUP',
            details: { name },
            ...options,
        });
        this.name = 'DuplicateCleanupError';
    }
}

export class CleanupNotFoundError extends ShutdownError {
    constructor(name, options = {}) {
        super(`Cleanup handler "${name}" not found`, {
            code: 'CLEANUP_NOT_FOUND',
            details: { name },
            ...options,
        });
        this.name = 'CleanupNotFoundError';
    }
}

// ----------------------------------------------------------------------------
// 3. HELPER FUNCTIONS
// ----------------------------------------------------------------------------

/**
 * Validate a cleanup name
 * @param {string} name - Cleanup handler name
 * @returns {string} Validated name
 */
function validateCleanupName(name) {
    if (typeof name !== 'string') {
        throw new ShutdownError('Cleanup name must be a string', {
            code: 'INVALID_CLEANUP_NAME',
            details: { name },
        });
    }
    
    const trimmed = name.trim();
    if (trimmed.length === 0) {
        throw new ShutdownError('Cleanup name cannot be empty', {
            code: 'INVALID_CLEANUP_NAME',
        });
    }
    
    return trimmed;
}

/**
 * Validate a timeout value
 * @param {number} timeout - Timeout in milliseconds
 * @returns {number} Validated timeout
 */
function validateTimeout(timeout) {
    if (typeof timeout !== 'number' || !Number.isFinite(timeout)) {
        return DEFAULT_TIMEOUT_MS;
    }
    
    if (timeout < 0) {
        return DEFAULT_TIMEOUT_MS;
    }
    
    return Math.floor(timeout);
}

/**
 * Validate a priority value
 * @param {number} priority - Priority value
 * @returns {number} Validated priority
 */
function validatePriority(priority) {
    if (typeof priority !== 'number' || !Number.isInteger(priority) || priority < 0) {
        return DEFAULT_PRIORITY;
    }
    return priority;
}

/**
 * Format duration for logging
 * @param {number} startTime - Start time in milliseconds
 * @param {number} endTime - End time in milliseconds
 * @returns {number} Duration in milliseconds
 */
function calculateDuration(startTime, endTime) {
    return Math.max(0, endTime - startTime);
}

// ----------------------------------------------------------------------------
// 4. SHUTDOWN MANAGER CLASS
// ----------------------------------------------------------------------------

export class ShutdownManager {
    /**
     * Create a new ShutdownManager instance
     * @param {Object} options - Configuration options
     * @param {number} options.timeout - Global shutdown timeout in milliseconds
     * @param {Object} options.logger - Logger instance (optional)
     * @param {Array} options.cleanups - Initial cleanup handlers
     */
    constructor(options = {}) {
        const {
            timeout = DEFAULT_TIMEOUT_MS,
            logger = null,
            cleanups = [],
        } = options;
        
        this._timeout = validateTimeout(timeout);
        this._logger = logger;
        this._cleanups = new Map();
        this._state = STATE_IDLE;
        this._shutdownPromise = null;
        this._shutdownReason = null;
        this._shutdownStartTime = null;
        this._shutdownEndTime = null;
        this._cleanupResults = [];
        this._cleanupErrors = [];
        
        // Register initial cleanups if provided
        if (Array.isArray(cleanups)) {
            for (const cleanup of cleanups) {
                if (cleanup && typeof cleanup === 'object') {
                    const { name, handler, priority, timeout: handlerTimeout } = cleanup;
                    if (name && handler) {
                        try {
                            this.register(name, handler, { priority, timeout: handlerTimeout });
                        } catch {
                            // Ignore registration errors during construction
                        }
                    }
                }
            }
        }
    }
    
    /**
     * Register a cleanup handler
     * @param {string} name - Handler name
     * @param {Function} handler - Cleanup function
     * @param {Object} options - Handler options
     * @param {number} options.priority - Execution priority (lower = earlier)
     * @param {number} options.timeout - Handler-specific timeout
     * @returns {this} ShutdownManager instance
     * @throws {DuplicateCleanupError} If handler already registered
     */
    register(name, handler, options = {}) {
        const safeName = validateCleanupName(name);
        
        if (typeof handler !== 'function') {
            throw new ShutdownError('Cleanup handler must be a function', {
                code: 'INVALID_CLEANUP_HANDLER',
                details: { name: safeName },
            });
        }
        
        if (this._state === STATE_SHUTTING_DOWN) {
            throw new ShutdownError(`Cannot register cleanup "${safeName}" during shutdown`, {
                code: 'SHUTDOWN_IN_PROGRESS',
                details: { name: safeName },
            });
        }
        
        if (this._cleanups.has(safeName)) {
            throw new DuplicateCleanupError(safeName);
        }
        
        const priority = validatePriority(options.priority);
        const timeout = options.timeout !== undefined ? validateTimeout(options.timeout) : null;
        
        this._cleanups.set(safeName, {
            name: safeName,
            handler,
            priority,
            timeout,
            executed: false,
            startTime: null,
            endTime: null,
            success: null,
            error: null,
        });
        
        return this;
    }
    
    /**
     * Unregister a cleanup handler
     * @param {string} name - Handler name
     * @returns {boolean} True if handler was removed
     */
    unregister(name) {
        const safeName = validateCleanupName(name);
        
        if (this._state === STATE_SHUTTING_DOWN) {
            return false;
        }
        
        return this._cleanups.delete(safeName);
    }
    
    /**
     * Check if a cleanup handler is registered
     * @param {string} name - Handler name
     * @returns {boolean} True if handler exists
     */
    has(name) {
        try {
            const safeName = validateCleanupName(name);
            return this._cleanups.has(safeName);
        } catch {
            return false;
        }
    }
    
    /**
     * Get all registered cleanup names
     * @returns {string[]} Array of cleanup names
     */
    getCleanupNames() {
        return Array.from(this._cleanups.keys());
    }
    
    /**
     * Execute all registered cleanup handlers
     * @param {string} reason - Shutdown reason
     * @param {Object} options - Shutdown options
     * @param {number} options.timeout - Override global timeout
     * @param {boolean} options.throwOnError - Throw on cleanup errors
     * @returns {Promise<Object>} Shutdown result
     */
    async shutdown(reason = 'manual', options = {}) {
        // Check if already shutting down
        if (this._state === STATE_SHUTTING_DOWN) {
            // Return existing promise if available
            if (this._shutdownPromise) {
                return this._shutdownPromise;
            }
            // Fallback: wait for shutdown to complete
            return new Promise((resolve) => {
                const checkState = () => {
                    if (this._state !== STATE_SHUTTING_DOWN) {
                        resolve(this._getShutdownResult());
                    } else {
                        setTimeout(checkState, 100);
                    }
                };
                checkState();
            });
        }
        
        // Already completed or failed
        if (this._state === STATE_COMPLETED || this._state === STATE_FAILED || this._state === STATE_TIMED_OUT) {
            return this._getShutdownResult();
        }
        
        // Start shutdown
        this._state = STATE_SHUTTING_DOWN;
        this._shutdownReason = typeof reason === 'string' ? reason : 'manual';
        this._shutdownStartTime = Date.now();
        this._cleanupResults = [];
        this._cleanupErrors = [];
        
        const timeout = validateTimeout(options.timeout || this._timeout);
        
        // Create shutdown promise
        this._shutdownPromise = this._executeShutdown(timeout, options.throwOnError || false);
        
        try {
            const result = await this._shutdownPromise;
            return result;
        } catch (error) {
            // If shutdown throws, state is already updated in _executeShutdown
            throw error;
        }
    }
    
    /**
     * Execute the shutdown process
     * @private
     * @param {number} timeout - Shutdown timeout
     * @param {boolean} throwOnError - Throw on cleanup errors
     * @returns {Promise<Object>} Shutdown result
     */
    async _executeShutdown(timeout, throwOnError) {
        const startTime = Date.now();
        let timedOut = false;
        
        // Get handlers sorted by priority
        const handlers = Array.from(this._cleanups.values())
            .sort((a, b) => a.priority - b.priority);
        
        // Create timeout promise
        const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => {
                timedOut = true;
                resolve(null);
            }, timeout);
        });
        
        // Execute cleanup handlers with timeout
        const cleanupPromise = (async () => {
            for (const handler of handlers) {
                if (this._state === STATE_TIMED_OUT) {
                    break;
                }
                
                handler.startTime = Date.now();
                
                try {
                    // Check if handler has specific timeout
                    const handlerTimeout = handler.timeout !== null ? handler.timeout : timeout;
                    
                    // Execute handler with timeout if needed
                    if (handlerTimeout > 0 && handlerTimeout < Infinity) {
                        const handlerTimeoutPromise = new Promise((_, reject) => {
                            setTimeout(() => {
                                reject(new ShutdownTimeoutError(handlerTimeout, {
                                    details: { handler: handler.name },
                                }));
                            }, handlerTimeout);
                        });
                        
                        await Promise.race([
                            handler.handler(),
                            handlerTimeoutPromise,
                        ]);
                    } else {
                        await handler.handler();
                    }
                    
                    handler.success = true;
                    handler.error = null;
                } catch (error) {
                    handler.success = false;
                    handler.error = error;
                    this._cleanupErrors.push({
                        name: handler.name,
                        error,
                    });
                    
                    // Log error if logger is available
                    if (this._logger && typeof this._logger.error === 'function') {
                        this._logger.error({
                            err: error,
                            handler: handler.name,
                        }, `Cleanup handler "${handler.name}" failed`);
                    }
                } finally {
                    handler.endTime = Date.now();
                    handler.executed = true;
                    this._cleanupResults.push({
                        name: handler.name,
                        success: handler.success,
                        durationMs: calculateDuration(handler.startTime, handler.endTime),
                        error: handler.error,
                    });
                }
            }
            
            return null;
        })();
        
        // Race cleanup against timeout
        await Promise.race([
            cleanupPromise,
            timeoutPromise,
        ]);
        
        // Update state based on timeout
        if (timedOut) {
            this._state = STATE_TIMED_OUT;
        } else {
            // Check if any handlers failed
            const hasErrors = this._cleanupErrors.length > 0;
            this._state = hasErrors ? STATE_FAILED : STATE_COMPLETED;
        }
        
        this._shutdownEndTime = Date.now();
        
        // Build result
        const result = this._getShutdownResult();
        
        // If throwOnError and there were errors, throw
        if (throwOnError && this._cleanupErrors.length > 0) {
            const error = new ShutdownError('One or more cleanup handlers failed', {
                code: 'CLEANUP_ERRORS',
                details: {
                    errors: this._cleanupErrors.map(e => ({
                        name: e.name,
                        message: e.error.message,
                    })),
                },
            });
            error.result = result;
            throw error;
        }
        
        return result;
    }
    
    /**
     * Get the shutdown result
     * @private
     * @returns {Object} Shutdown result
     */
    _getShutdownResult() {
        const durationMs = calculateDuration(this._shutdownStartTime, this._shutdownEndTime);
        const isCompleted = this._state === STATE_COMPLETED;
        const hasErrors = this._cleanupErrors.length > 0;
        
        return {
            success: this._state === STATE_COMPLETED,
            state: this._state,
            reason: this._shutdownReason,
            durationMs,
            timedOut: this._state === STATE_TIMED_OUT,
            cleanedUp: this._cleanupResults.filter(r => r.success).map(r => r.name),
            failed: this._cleanupResults.filter(r => !r.success).map(r => ({
                name: r.name,
                error: r.error ? r.error.message : 'Unknown error',
            })),
            errors: this._cleanupErrors.map(e => ({
                name: e.name,
                message: e.error ? e.error.message : 'Unknown error',
            })),
        };
    }
    
    /**
     * Check if shutdown is in progress
     * @returns {boolean} True if shutting down
     */
    isShuttingDown() {
        return this._state === STATE_SHUTTING_DOWN;
    }
    
    /**
     * Check if shutdown has completed
     * @returns {boolean} True if shutdown completed
     */
    isShutdownComplete() {
        return this._state === STATE_COMPLETED || 
               this._state === STATE_FAILED || 
               this._state === STATE_TIMED_OUT;
    }
    
    /**
     * Get the current state
     * @returns {string} Current state
     */
    getState() {
        return this._state;
    }
    
    /**
     * Reset shutdown state (primarily for testing)
     * @returns {this} ShutdownManager instance
     * @throws {ShutdownError} If shutdown is in progress
     */
    reset() {
        if (this._state === STATE_SHUTTING_DOWN) {
            throw new ShutdownError('Cannot reset while shutdown is in progress', {
                code: 'SHUTDOWN_IN_PROGRESS',
            });
        }
        
        this._state = STATE_IDLE;
        this._shutdownPromise = null;
        this._shutdownReason = null;
        this._shutdownStartTime = null;
        this._shutdownEndTime = null;
        this._cleanupResults = [];
        this._cleanupErrors = [];
        
        // Reset handler execution state
        for (const handler of this._cleanups.values()) {
            handler.executed = false;
            handler.startTime = null;
            handler.endTime = null;
            handler.success = null;
            handler.error = null;
        }
        
        return this;
    }
    
    /**
     * Get the shutdown timeout
     * @returns {number} Timeout in milliseconds
     */
    getTimeout() {
        return this._timeout;
    }
    
    /**
     * Set the shutdown timeout
     * @param {number} timeout - Timeout in milliseconds
     * @returns {this} ShutdownManager instance
     */
    setTimeout(timeout) {
        if (this._state === STATE_SHUTTING_DOWN) {
            throw new ShutdownError('Cannot change timeout during shutdown', {
                code: 'SHUTDOWN_IN_PROGRESS',
            });
        }
        this._timeout = validateTimeout(timeout);
        return this;
    }
}

// ----------------------------------------------------------------------------
// 5. HELPER FUNCTIONS FOR COMMON RESOURCES
// ----------------------------------------------------------------------------

/**
 * Create a cleanup handler for an HTTP server
 * @param {Object} server - HTTP server instance
 * @param {Object} options - Server shutdown options
 * @param {number} options.gracePeriod - Grace period for active connections
 * @returns {Function} Cleanup handler
 */
export function createServerCleanup(server, options = {}) {
    const { gracePeriod = 0 } = options;
    
    return async function cleanupServer() {
        return new Promise(async(resolve, reject) => {
            if (!server || typeof server.close !== 'function') {
                resolve();
                return;
            }
            
            // Check if server is already closed
            if (server.listening === false) {
                resolve();
                return;
            }
            
            // If grace period is specified, wait before closing
            if (gracePeriod > 0) {
                await new Promise(resolve => setTimeout(resolve, gracePeriod));
            }
            
            server.close((error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    };
}

/**
 * Create a cleanup handler for a database pool
 * @param {Object} pool - Database pool instance
 * @param {Object} options - Pool shutdown options
 * @param {number} options.gracePeriod - Grace period for active connections
 * @returns {Function} Cleanup handler
 */
export function createPoolCleanup(pool, options = {}) {
    const { gracePeriod = 0 } = options;
    
    return async function cleanupPool() {
        if (!pool || typeof pool.end !== 'function') {
            return;
        }
        
        if (gracePeriod > 0) {
            await new Promise(resolve => setTimeout(resolve, gracePeriod));
        }
        
        await pool.end();
    };
}

// ----------------------------------------------------------------------------
// 6. SIGNAL HANDLING
// ----------------------------------------------------------------------------

/**
 * Install signal handlers for graceful shutdown
 * @param {ShutdownManager} manager - Shutdown manager instance
 * @param {Object} options - Signal handling options
 * @param {Array} options.signals - Signals to handle
 * @param {Function} options.onSignal - Optional signal handler callback
 * @returns {Function} Uninstall function
 */
export function installSignalHandlers(manager, options = {}) {
    const {
        signals = ['SIGINT', 'SIGTERM'],
        onSignal = null,
    } = options;
    
    if (!(manager instanceof ShutdownManager)) {
        throw new ShutdownError('Invalid shutdown manager instance', {
            code: 'INVALID_MANAGER',
        });
    }
    
    const signalHandlers = new Map();
    
    for (const signal of signals) {
        if (typeof signal !== 'string') continue;
        
        const handler = async () => {
            if (manager.isShuttingDown()) {
                return;
            }
            
            if (onSignal && typeof onSignal === 'function') {
                try {
                    await onSignal(signal);
                } catch {
                    // Ignore callback errors during signal handling
                }
            }
            
            try {
                await manager.shutdown(signal);
            } catch {
                // Shutdown errors are handled by the manager
            }
        };
        
        process.on(signal, handler);
        signalHandlers.set(signal, handler);
    }
    
    // Return uninstall function
    return function uninstallSignalHandlers() {
        for (const [signal, handler] of signalHandlers) {
            process.off(signal, handler);
        }
        signalHandlers.clear();
    };
}

// ----------------------------------------------------------------------------
// 7. DEFAULT MANAGER
// ----------------------------------------------------------------------------

// Lazy default manager instance
let defaultManager = null;

/**
 * Get the default shutdown manager
 * @param {Object} options - Manager options
 * @returns {ShutdownManager} Default manager instance
 */
export function getDefaultManager(options = {}) {
    if (!defaultManager) {
        defaultManager = new ShutdownManager(options);
    }
    return defaultManager;
}

/**
 * Reset the default manager (for testing)
 */
function resetDefaultManager() {
    if (defaultManager && defaultManager.isShuttingDown()) {
        throw new ShutdownError('Cannot reset default manager while shutdown is in progress', {
            code: 'SHUTDOWN_IN_PROGRESS',
        });
    }
    defaultManager = null;
}

// ----------------------------------------------------------------------------
// 8. EXPORTS
// ----------------------------------------------------------------------------


export default {
    ShutdownManager,
    getDefaultManager,
    resetDefaultManager,
    installSignalHandlers,
    createServerCleanup,
    createPoolCleanup,
    STATE_IDLE,
    STATE_SHUTTING_DOWN,
    STATE_COMPLETED,
    STATE_FAILED,
    STATE_TIMED_OUT,
};