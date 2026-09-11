/**
 * app/core/events.js
 * Lightweight in-process Event Bus for Tesnow
 * Provides decoupled communication between application modules
 * 
 * IMPORTANT: This is an IN-PROCESS event system.
 * Events are NOT durable, NOT persisted, NOT guaranteed after process crash,
 * and NOT distributed across multiple Node.js processes.
 * For distributed events, use Redis, RabbitMQ, Kafka, or similar.
 * 
 * @module events
 */

// ----------------------------------------------------------------------------
// 1. CUSTOM ERRORS
// ----------------------------------------------------------------------------

export class EventBusError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'EventBusError';
        this.code = options.code || 'EVENT_BUS_ERROR';
        if (options.details) {
            this.details = options.details;
        }
    }
}

export class InvalidEventNameError extends EventBusError {
    constructor(name, options = {}) {
        super(`Invalid event name: "${name}"`, {
            code: 'INVALID_EVENT_NAME',
            details: { name },
            ...options,
        });
        this.name = 'InvalidEventNameError';
    }
}

export class InvalidListenerError extends EventBusError {
    constructor(options = {}) {
        super('Listener must be a function', {
            code: 'INVALID_LISTENER',
            ...options,
        });
        this.name = 'InvalidListenerError';
    }
}

export class MaxListenersExceededError extends EventBusError {
    constructor(eventName, count, max, options = {}) {
        super(`Max listeners (${max}) exceeded for event "${eventName}" (${count} listeners)`, {
            code: 'MAX_LISTENERS_EXCEEDED',
            details: { eventName, count, max },
            ...options,
        });
        this.name = 'MaxListenersExceededError';
    }
}

// ----------------------------------------------------------------------------
// 2. VALIDATION HELPERS
// ----------------------------------------------------------------------------

const MAX_EVENT_NAME_LENGTH = 100;

function validateEventName(name) {
    if (typeof name !== 'string') {
        throw new InvalidEventNameError(name);
    }
    
    const trimmed = name.trim();
    if (trimmed.length === 0) {
        throw new InvalidEventNameError(name);
    }
    
    if (trimmed.length > MAX_EVENT_NAME_LENGTH) {
        throw new InvalidEventNameError(trimmed, {
            message: `Event name exceeds maximum length of ${MAX_EVENT_NAME_LENGTH}`,
        });
    }
    
    // Prevent prototype pollution
    if (trimmed === '__proto__' || trimmed === 'constructor' || trimmed === 'prototype') {
        throw new InvalidEventNameError(trimmed);
    }
    
    return trimmed;
}

function validateListener(listener) {
    if (typeof listener !== 'function') {
        throw new InvalidListenerError();
    }
}

// ----------------------------------------------------------------------------
// 3. EVENT BUS CLASS
// ----------------------------------------------------------------------------

export class EventBus {
    /**
     * Create a new EventBus instance
     * @param {Object} options - Configuration options
     * @param {number} options.maxListeners - Maximum listeners per event (default: 50)
     * @param {Function} options.onWarning - Warning callback for max listeners
     */
    constructor(options = {}) {
        const {
            maxListeners = 50,
            onWarning = null,
        } = options;
        
        this._listeners = new Map();
        this._maxListeners = typeof maxListeners === 'number' && maxListeners > 0 ? maxListeners : 50;
        this._onWarning = typeof onWarning === 'function' ? onWarning : null;
        this._disposed = false;
        this._emitDepth = 0;
        this._pendingAdditions = new Map();
        this._pendingRemovals = new Map();
    }
    
    /**
     * Register a listener for an event
     * @param {string} eventName - Event name
     * @param {Function} listener - Listener function
     * @returns {Function} Unsubscribe function
     * @throws {InvalidEventNameError} If event name is invalid
     * @throws {InvalidListenerError} If listener is not a function
     * @throws {MaxListenersExceededError} If max listeners exceeded
     * @throws {EventBusError} If event bus is disposed
     */
    on(eventName, listener) {
        if (this._disposed) {
            throw new EventBusError('Event bus has been disposed', {
                code: 'EVENT_BUS_DISPOSED',
            });
        }
        
        const safeName = validateEventName(eventName);
        validateListener(listener);
        
        if (!this._listeners.has(safeName)) {
            this._listeners.set(safeName, new Set());
        }
        
        const listeners = this._listeners.get(safeName);
        
        // Check max listeners
        if (listeners.size >= this._maxListeners) {
            const error = new MaxListenersExceededError(safeName, listeners.size, this._maxListeners);
            
            if (this._onWarning) {
                this._onWarning(error.message);
            } else {
                // In production, just log warning but still add the listener
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(`[EventBus] ${error.message}`);
                }
            }
        }
        
        // If we're currently emitting, defer the addition
        if (this._emitDepth > 0) {
            if (!this._pendingAdditions.has(safeName)) {
                this._pendingAdditions.set(safeName, []);
            }
            this._pendingAdditions.get(safeName).push(listener);
        } else {
            listeners.add(listener);
        }
        
        // Return unsubscribe function
        return () => {
            this.off(safeName, listener);
        };
    }
    
    /**
     * Register a one-time listener for an event
     * @param {string} eventName - Event name
     * @param {Function} listener - Listener function
     * @returns {Function} Unsubscribe function
     * @throws {InvalidEventNameError} If event name is invalid
     * @throws {InvalidListenerError} If listener is not a function
     * @throws {EventBusError} If event bus is disposed
     */
    once(eventName, listener) {
        if (this._disposed) {
            throw new EventBusError('Event bus has been disposed', {
                code: 'EVENT_BUS_DISPOSED',
            });
        }
        
        const safeName = validateEventName(eventName);
        validateListener(listener);
        
        // Create wrapper that removes itself after execution
        const wrapper = (...args) => {
            // Remove the wrapper before executing to handle self-removal
            this.off(safeName, wrapper);
            
            // Execute the original listener
            return listener(...args);
        };
        
        // Store reference to original listener for cleanup
        wrapper._originalListener = listener;
        
        return this.on(safeName, wrapper);
    }
    
    /**
     * Remove a listener from an event
     * @param {string} eventName - Event name
     * @param {Function} listener - Listener function to remove
     * @returns {boolean} True if listener was removed
     * @throws {InvalidEventNameError} If event name is invalid
     * @throws {InvalidListenerError} If listener is not a function
     */
    off(eventName, listener) {
        if (this._disposed) {
            return false;
        }
        
        const safeName = validateEventName(eventName);
        validateListener(listener);
        
        const listeners = this._listeners.get(safeName);
        if (!listeners) {
            return false;
        }
        
        // If we're currently emitting, defer the removal
        if (this._emitDepth > 0) {
            if (!this._pendingRemovals.has(safeName)) {
                this._pendingRemovals.set(safeName, []);
            }
            this._pendingRemovals.get(safeName).push(listener);
            return true;
        }
        
        // Remove the listener
        const removed = listeners.delete(listener);
        
        // Also check if any wrapper has this listener as its original
        if (!removed) {
            // Remove wrappers that have this listener as the original
            for (const wrapper of listeners) {
                if (wrapper._originalListener === listener) {
                    listeners.delete(wrapper);
                    return true;
                }
            }
        }
        
        // Clean up empty event sets
        if (listeners.size === 0) {
            this._listeners.delete(safeName);
        }
        
        return removed;
    }
    
    /**
     * Emit an event synchronously
     * @param {string} eventName - Event name
     * @param {*} payload - Event payload
     * @returns {boolean} True if any listeners were called
     * @throws {InvalidEventNameError} If event name is invalid
     * @throws {EventBusError} If event bus is disposed
     * 
     * Note: If a listener throws, the error will propagate to the caller.
     * Events are emitted in registration order.
     */
    emit(eventName, payload) {
        if (this._disposed) {
            throw new EventBusError('Event bus has been disposed', {
                code: 'EVENT_BUS_DISPOSED',
            });
        }
        
        const safeName = validateEventName(eventName);
        const listeners = this._listeners.get(safeName);
        
        if (!listeners || listeners.size === 0) {
            return false;
        }
        
        // Take a snapshot of current listeners
        // This prevents issues with listeners being added/removed during emit
        const snapshot = Array.from(listeners);
        
        // Track emit depth for deferral
        this._emitDepth++;
        
        try {
            let called = false;
            
            for (const listener of snapshot) {
                // Check if listener still exists (may have been removed)
                if (!listeners.has(listener)) {
                    continue;
                }
                
                called = true;
                listener(payload);
            }
            
            // Process pending additions and removals
            this._applyPendingChanges();
            
            return called;
        } finally {
            this._emitDepth--;
        }
    }
    
    /**
     * Emit an event asynchronously
     * @param {string} eventName - Event name
     * @param {*} payload - Event payload
     * @returns {Promise<boolean>} True if any listeners were called
     * @throws {InvalidEventNameError} If event name is invalid
     * @throws {EventBusError} If event bus is disposed
     * 
     * Note: Listeners are executed sequentially in registration order.
     * If a listener rejects, the error will propagate to the caller.
     */
    async emitAsync(eventName, payload) {
        if (this._disposed) {
            throw new EventBusError('Event bus has been disposed', {
                code: 'EVENT_BUS_DISPOSED',
            });
        }
        
        const safeName = validateEventName(eventName);
        const listeners = this._listeners.get(safeName);
        
        if (!listeners || listeners.size === 0) {
            return false;
        }
        
        // Take a snapshot of current listeners
        const snapshot = Array.from(listeners);
        
        // Track emit depth for deferral
        this._emitDepth++;
        
        try {
            let called = false;
            
            for (const listener of snapshot) {
                // Check if listener still exists
                if (!listeners.has(listener)) {
                    continue;
                }
                
                called = true;
                await listener(payload);
            }
            
            // Process pending additions and removals
            this._applyPendingChanges();
            
            return called;
        } finally {
            this._emitDepth--;
        }
    }
    
    /**
     * Apply pending changes (additions/removals) made during emit
     * @private
     */
    _applyPendingChanges() {
        // Process pending additions
        for (const [eventName, listeners] of this._pendingAdditions) {
            const existing = this._listeners.get(eventName);
            if (existing) {
                for (const listener of listeners) {
                    existing.add(listener);
                }
            }
        }
        this._pendingAdditions.clear();
        
        // Process pending removals
        for (const [eventName, listeners] of this._pendingRemovals) {
            const existing = this._listeners.get(eventName);
            if (existing) {
                for (const listener of listeners) {
                    existing.delete(listener);
                }
                if (existing.size === 0) {
                    this._listeners.delete(eventName);
                }
            }
        }
        this._pendingRemovals.clear();
    }
    
    /**
     * Check if an event has any listeners
     * @param {string} eventName - Event name
     * @returns {boolean} True if event has listeners
     * @throws {InvalidEventNameError} If event name is invalid
     */
    has(eventName) {
        if (this._disposed) {
            return false;
        }
        
        const safeName = validateEventName(eventName);
        const listeners = this._listeners.get(safeName);
        return listeners ? listeners.size > 0 : false;
    }
    
    /**
     * Get the number of listeners for an event
     * @param {string} eventName - Event name
     * @returns {number} Number of listeners
     * @throws {InvalidEventNameError} If event name is invalid
     */
    listenerCount(eventName) {
        if (this._disposed) {
            return 0;
        }
        
        const safeName = validateEventName(eventName);
        const listeners = this._listeners.get(safeName);
        return listeners ? listeners.size : 0;
    }
    
    /**
     * Get all registered event names
     * @returns {string[]} Array of event names
     */
    eventNames() {
        if (this._disposed) {
            return [];
        }
        return Array.from(this._listeners.keys());
    }
    
    /**
     * Remove all listeners for a specific event
     * @param {string} eventName - Event name
     * @returns {boolean} True if event existed and was cleared
     * @throws {InvalidEventNameError} If event name is invalid
     */
    clearEvent(eventName) {
        if (this._disposed) {
            return false;
        }
        
        const safeName = validateEventName(eventName);
        
        if (this._listeners.has(safeName)) {
            this._listeners.delete(safeName);
            return true;
        }
        
        return false;
    }
    
    /**
     * Remove all listeners from all events
     */
    clear() {
        if (this._disposed) {
            return;
        }
        
        this._listeners.clear();
        this._pendingAdditions.clear();
        this._pendingRemovals.clear();
    }
    
    /**
     * Check if the event bus is disposed
     * @returns {boolean} True if disposed
     */
    isDisposed() {
        return this._disposed;
    }
    
    /**
     * Dispose the event bus, removing all listeners
     * After disposal, no new listeners can be added and no events can be emitted
     */
    dispose() {
        if (this._disposed) {
            return;
        }
        
        this.clear();
        this._disposed = true;
    }
}

// ----------------------------------------------------------------------------
// 4. EXPORTS
// ----------------------------------------------------------------------------

export default EventBus;