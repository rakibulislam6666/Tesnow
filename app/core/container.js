/**
 * app/core/container.js
 * Lightweight Dependency Injection Container for Tesnow
 * Provides controlled dependency registration and resolution
 * 
 * @module container
 */

// ----------------------------------------------------------------------------
// 1. CUSTOM ERRORS
// ----------------------------------------------------------------------------

export class ContainerError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'ContainerError';
        this.code = options.code || 'CONTAINER_ERROR';
        if (options.details) {
            this.details = options.details;
        }
    }
}

export class DependencyNotFoundError extends ContainerError {
    constructor(name, options = {}) {
        super(`Dependency "${name}" not found`, {
            code: 'DEPENDENCY_NOT_FOUND',
            details: { name },
            ...options,
        });
        this.name = 'DependencyNotFoundError';
    }
}

export class DuplicateDependencyError extends ContainerError {
    constructor(name, options = {}) {
        super(`Dependency "${name}" already registered`, {
            code: 'DUPLICATE_DEPENDENCY',
            details: { name },
            ...options,
        });
        this.name = 'DuplicateDependencyError';
    }
}

export class CircularDependencyError extends ContainerError {
    constructor(name, chain, options = {}) {
        const chainStr = chain.join(' -> ');
        super(`Circular dependency detected: ${chainStr} -> ${name}`, {
            code: 'CIRCULAR_DEPENDENCY',
            details: { name, chain },
            ...options,
        });
        this.name = 'CircularDependencyError';
    }
}

export class InvalidDefinitionError extends ContainerError {
    constructor(name, message, options = {}) {
        super(`Invalid definition for "${name}": ${message}`, {
            code: 'INVALID_DEFINITION',
            details: { name },
            ...options,
        });
        this.name = 'InvalidDefinitionError';
    }
}

// ----------------------------------------------------------------------------
// 2. VALIDATION HELPERS
// ----------------------------------------------------------------------------

const VALID_TYPES = new Set(['value', 'singleton', 'factory']);

function validateName(name) {
    if (typeof name !== 'string') {
        throw new ContainerError('Dependency name must be a string', {
            code: 'INVALID_NAME',
            details: { name },
        });
    }
    
    const trimmed = name.trim();
    if (trimmed.length === 0) {
        throw new ContainerError('Dependency name cannot be empty', {
            code: 'INVALID_NAME',
        });
    }
    
    // Prevent prototype pollution
    if (trimmed === '__proto__' || trimmed === 'constructor' || trimmed === 'prototype') {
        throw new ContainerError(`Invalid dependency name: "${trimmed}"`, {
            code: 'INVALID_NAME',
            details: { name: trimmed },
        });
    }
    
    return trimmed;
}

function validateDefinition(name, definition) {
    if (!definition || typeof definition !== 'object') {
        throw new InvalidDefinitionError(name, 'Definition must be an object');
    }
    
    const { type, value, factory, dispose } = definition;
    
    if (!type || typeof type !== 'string') {
        throw new InvalidDefinitionError(name, 'Type is required and must be a string');
    }
    
    if (!VALID_TYPES.has(type)) {
        throw new InvalidDefinitionError(
            name,
            `Type must be one of: ${Array.from(VALID_TYPES).join(', ')}`
        );
    }
    
    if (type === 'value') {
        if (!('value' in definition)) {
            throw new InvalidDefinitionError(name, 'Value type requires a "value" property');
        }
    } else if (type === 'singleton' || type === 'factory') {
        if (!factory || typeof factory !== 'function') {
            throw new InvalidDefinitionError(name, `${type} type requires a "factory" function`);
        }
    }
    
    // Validate dispose if provided
    if (dispose !== undefined && typeof dispose !== 'function') {
        throw new InvalidDefinitionError(name, 'Dispose must be a function if provided');
    }
}

function isPromise(value) {
    return value && typeof value === 'object' && typeof value.then === 'function';
}

// ----------------------------------------------------------------------------
// 3. DEPENDENCY RECORD
// ----------------------------------------------------------------------------

class DependencyRecord {
    constructor(definition) {
        this.type = definition.type;
        this.factory = definition.factory || null;
        this.value = definition.type === 'value' ? definition.value : null;
        this.dispose = definition.dispose || null;
        this.instance = null;
        this.resolving = false;
        this.initialized = false;
    }
}

// ----------------------------------------------------------------------------
// 4. CONTAINER CLASS
// ----------------------------------------------------------------------------

export class Container {
    constructor() {
        this._registry = new Map();
        this._resolving = new Set();
        this._disposed = false;
    }
    
    /**
     * Register a dependency
     * @param {string} name - Dependency name
     * @param {Object} definition - Dependency definition
     * @param {string} definition.type - Type: 'value', 'singleton', or 'factory'
     * @param {*} definition.value - Value for 'value' type
     * @param {Function} definition.factory - Factory function for 'singleton'/'factory' types
     * @param {Function} definition.dispose - Optional dispose function
     * @returns {this} Container instance for chaining
     * @throws {DuplicateDependencyError} If dependency already registered
     * @throws {InvalidDefinitionError} If definition is invalid
     */
    register(name, definition) {
        if (this._disposed) {
            throw new ContainerError('Container has been disposed', {
                code: 'CONTAINER_DISPOSED',
            });
        }
        
        const safeName = validateName(name);
        
        if (this._registry.has(safeName)) {
            throw new DuplicateDependencyError(safeName);
        }
        
        validateDefinition(safeName, definition);
        
        // Create a copy of the definition to prevent mutation
        const record = new DependencyRecord(definition);
        this._registry.set(safeName, record);
        
        return this;
    }
    
    /**
     * Register a value dependency (convenience method)
     * @param {string} name - Dependency name
     * @param {*} value - Value to register
     * @returns {this} Container instance for chaining
     */
    registerValue(name, value) {
        return this.register(name, {
            type: 'value',
            value,
        });
    }
    
    /**
     * Register a singleton dependency (convenience method)
     * @param {string} name - Dependency name
     * @param {Function} factory - Factory function
     * @param {Function} dispose - Optional dispose function
     * @returns {this} Container instance for chaining
     */
    registerSingleton(name, factory, dispose = null) {
        const definition = { type: 'singleton', factory };
        if (dispose) {
            definition.dispose = dispose;
        }
        return this.register(name, definition);
    }
    
    /**
     * Register a factory dependency (convenience method)
     * @param {string} name - Dependency name
     * @param {Function} factory - Factory function
     * @returns {this} Container instance for chaining
     */
    registerFactory(name, factory) {
        return this.register(name, {
            type: 'factory',
            factory,
        });
    }
    
    /**
     * Check if a dependency is registered
     * @param {string} name - Dependency name
     * @returns {boolean} True if registered
     */
    has(name) {
        if (this._disposed) {
            return false;
        }
        
        try {
            const safeName = validateName(name);
            return this._registry.has(safeName);
        } catch {
            return false;
        }
    }
    
    /**
     * Resolve a dependency synchronously
     * @param {string} name - Dependency name
     * @param {Set} chain - Resolution chain for circular detection (internal)
     * @returns {*} Resolved dependency
     * @throws {DependencyNotFoundError} If dependency not found
     * @throws {CircularDependencyError} If circular dependency detected
     * @throws {ContainerError} If container is disposed or resolution fails
     */
    resolve(name, chain = new Set()) {
        if (this._disposed) {
            throw new ContainerError('Container has been disposed', {
                code: 'CONTAINER_DISPOSED',
            });
        }
        
        const safeName = validateName(name);
        const record = this._registry.get(safeName);
        
        if (!record) {
            throw new DependencyNotFoundError(safeName);
        }
        
        // Circular dependency detection
        if (chain.has(safeName)) {
            const chainArray = Array.from(chain);
            throw new CircularDependencyError(safeName, chainArray);
        }
        
        // Handle different types
        if (record.type === 'value') {
            return record.value;
        }
        
        if (record.type === 'singleton') {
            // Return cached instance if available
            if (record.initialized) {
                return record.instance;
            }
            
            // Check if currently resolving (async)
            if (record.resolving) {
                throw new ContainerError(
                    `Dependency "${safeName}" is currently being resolved asynchronously. Use resolveAsync() instead.`,
                    {
                        code: 'ASYNC_RESOLUTION_PENDING',
                        details: { name: safeName },
                    }
                );
            }
            
            // Create singleton instance
            try {
                record.resolving = true;
                const newChain = new Set(chain);
                newChain.add(safeName);
                
                const result = record.factory({
                    resolve: (depName) => this.resolve(depName, newChain),
                    has: (depName) => this.has(depName),
                });
                
                // Check for async result
                if (isPromise(result)) {
                    throw new ContainerError(
                        `Singleton "${safeName}" factory returned a Promise. Use resolveAsync() instead.`,
                        {
                            code: 'ASYNC_FACTORY',
                            details: { name: safeName },
                        }
                    );
                }
                
                record.instance = result;
                record.initialized = true;
                record.resolving = false;
                
                return result;
            } catch (error) {
                record.resolving = false;
                if (error instanceof ContainerError) {
                    throw error;
                }
                throw new ContainerError(`Failed to resolve "${safeName}"`, {
                    code: 'RESOLUTION_ERROR',
                    details: { name: safeName },
                    cause: error,
                });
            }
        }
        
        if (record.type === 'factory') {
            // Factory - create new instance each time
            try {
                const newChain = new Set(chain);
                newChain.add(safeName);
                
                const result = record.factory({
                    resolve: (depName) => this.resolve(depName, newChain),
                    has: (depName) => this.has(depName),
                });
                
                // Check for async result
                if (isPromise(result)) {
                    throw new ContainerError(
                        `Factory "${safeName}" returned a Promise. Use resolveAsync() instead.`,
                        {
                            code: 'ASYNC_FACTORY',
                            details: { name: safeName },
                        }
                    );
                }
                
                return result;
            } catch (error) {
                if (error instanceof ContainerError) {
                    throw error;
                }
                throw new ContainerError(`Failed to resolve "${safeName}"`, {
                    code: 'RESOLUTION_ERROR',
                    details: { name: safeName },
                    cause: error,
                });
            }
        }
        
        throw new ContainerError(`Unknown dependency type: ${record.type}`, {
            code: 'UNKNOWN_TYPE',
            details: { name: safeName, type: record.type },
        });
    }
    
    /**
     * Resolve a dependency asynchronously
     * Supports both sync and async factories
     * @param {string} name - Dependency name
     * @param {Set} chain - Resolution chain for circular detection (internal)
     * @param {Map} pending - Pending async resolutions for concurrency safety (internal)
     * @returns {Promise<*>} Resolved dependency
     * @throws {DependencyNotFoundError} If dependency not found
     * @throws {CircularDependencyError} If circular dependency detected
     * @throws {ContainerError} If container is disposed or resolution fails
     */
    async resolveAsync(name, chain = new Set(), pending = new Map()) {
        if (this._disposed) {
            throw new ContainerError('Container has been disposed', {
                code: 'CONTAINER_DISPOSED',
            });
        }
        
        const safeName = validateName(name);
        const record = this._registry.get(safeName);
        
        if (!record) {
            throw new DependencyNotFoundError(safeName);
        }
        
        // Circular dependency detection
        if (chain.has(safeName)) {
            const chainArray = Array.from(chain);
            throw new CircularDependencyError(safeName, chainArray);
        }
        
        // Handle value type
        if (record.type === 'value') {
            return record.value;
        }
        
        // Handle singleton
        if (record.type === 'singleton') {
            // Return cached instance if available
            if (record.initialized) {
                return record.instance;
            }
            
            // Check if currently resolving (async) - use pending map for concurrency
            if (pending.has(safeName)) {
                return pending.get(safeName);
            }
            
            // Create singleton instance
            record.resolving = true;
            const newChain = new Set(chain);
            newChain.add(safeName);
            
            const createPromise = (async () => {
                try {
                    const result = await record.factory({
                        resolve: (depName) => this.resolve(depName, newChain),
                        resolveAsync: (depName) => this.resolveAsync(depName, newChain, pending),
                        has: (depName) => this.has(depName),
                    });
                    
                    record.instance = result;
                    record.initialized = true;
                    record.resolving = false;
                    pending.delete(safeName);
                    
                    return result;
                } catch (error) {
                    record.resolving = false;
                    pending.delete(safeName);
                    if (error instanceof ContainerError) {
                        throw error;
                    }
                    throw new ContainerError(`Failed to resolve "${safeName}"`, {
                        code: 'RESOLUTION_ERROR',
                        details: { name: safeName },
                        cause: error,
                    });
                }
            })();
            
            pending.set(safeName, createPromise);
            return createPromise;
        }
        
        // Handle factory
        if (record.type === 'factory') {
            // Factory - create new instance each time
            try {
                const newChain = new Set(chain);
                newChain.add(safeName);
                
                const result = await record.factory({
                    resolve: (depName) => this.resolve(depName, newChain),
                    resolveAsync: (depName) => this.resolveAsync(depName, newChain, pending),
                    has: (depName) => this.has(depName),
                });
                
                return result;
            } catch (error) {
                if (error instanceof ContainerError) {
                    throw error;
                }
                throw new ContainerError(`Failed to resolve "${safeName}"`, {
                    code: 'RESOLUTION_ERROR',
                    details: { name: safeName },
                    cause: error,
                });
            }
        }
        
        throw new ContainerError(`Unknown dependency type: ${record.type}`, {
            code: 'UNKNOWN_TYPE',
            details: { name: safeName, type: record.type },
        });
    }
    
    /**
     * Remove a dependency from the container
     * @param {string} name - Dependency name
     * @returns {boolean} True if removed, false if not found
     */
    remove(name) {
        if (this._disposed) {
            return false;
        }
        
        try {
            const safeName = validateName(name);
            if (!this._registry.has(safeName)) {
                return false;
            }
            
            const record = this._registry.get(safeName);
            
            // If it's a singleton with an instance, we should dispose it
            if (record.type === 'singleton' && record.initialized && record.instance !== null) {
                // We don't auto-dispose on remove to avoid unexpected side effects
                // Caller should explicitly dispose if needed
            }
            
            this._registry.delete(safeName);
            return true;
        } catch {
            return false;
        }
    }
    
    /**
     * Clear all dependencies from the container
     * Disposes singleton instances if they have dispose functions
     * @returns {Promise<void>}
     */
    async clear() {
        if (this._disposed) {
            return;
        }
        
        // Collect all singleton instances with dispose
        const toDispose = [];
        for (const [name, record] of this._registry) {
            if (record.type === 'singleton' && record.initialized && record.instance !== null) {
                if (record.dispose && typeof record.dispose === 'function') {
                    toDispose.push({
                        name,
                        instance: record.instance,
                        dispose: record.dispose,
                    });
                }
            }
        }
        
        // Dispose in reverse order (children before parents)
        // We don't have dependency order info, so we'll dispose in registration order
        // and handle errors gracefully
        for (const item of toDispose) {
            try {
                await item.dispose(item.instance);
            } catch (error) {
                // Log error but continue
                console.error(`Error disposing "${item.name}":`, error);
            }
        }
        
        this._registry.clear();
        this._resolving.clear();
    }
    
    /**
     * Override an existing dependency (for testing)
     * @param {string} name - Dependency name
     * @param {Object} definition - Dependency definition
     * @returns {this} Container instance for chaining
     * @throws {DependencyNotFoundError} If dependency not found
     * @throws {InvalidDefinitionError} If definition is invalid
     */
    override(name, definition) {
        if (this._disposed) {
            throw new ContainerError('Container has been disposed', {
                code: 'CONTAINER_DISPOSED',
            });
        }
        
        const safeName = validateName(name);
        
        if (!this._registry.has(safeName)) {
            throw new DependencyNotFoundError(safeName);
        }
        
        validateDefinition(safeName, definition);
        
        const record = this._registry.get(safeName);
        
        // If it's a singleton with an instance, we need to clean up
        if (record.type === 'singleton' && record.initialized && record.instance !== null) {
            if (record.dispose && typeof record.dispose === 'function') {
                // Async disposal - we'll need to handle this carefully
                // For sync override, we'll dispose synchronously if possible
                try {
                    const result = record.dispose(record.instance);
                    if (isPromise(result)) {
                        // If dispose is async, we can't wait for it here
                        // Just let it run in the background
                        result.catch(() => {});
                    }
                } catch {
                    // Ignore dispose errors during override
                }
            }
        }
        
        // Replace with new definition
        const newRecord = new DependencyRecord(definition);
        this._registry.set(safeName, newRecord);
        
        return this;
    }
    
    /**
     * Get all registered dependency names
     * @returns {string[]} Array of dependency names
     */
    getNames() {
        if (this._disposed) {
            return [];
        }
        return Array.from(this._registry.keys());
    }
    
    /**
     * Check if container has been disposed
     * @returns {boolean} True if disposed
     */
    isDisposed() {
        return this._disposed;
    }
    
    /**
     * Dispose the container and all singleton instances
     * @returns {Promise<void>}
     */
    async dispose() {
        if (this._disposed) {
            return;
        }
        
        await this.clear();
        this._disposed = true;
    }
}

// ----------------------------------------------------------------------------
// 5. EXPORTS
// ----------------------------------------------------------------------------

export default Container;