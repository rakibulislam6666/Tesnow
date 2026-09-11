/**
 * app/core/feature-flags.js
 * Lightweight feature flag utility for Tesnow
 * Provides safe, deterministic feature flag evaluation
 * 
 * IMPORTANT: This module is database-independent.
 * Feature flag configuration must be loaded from an external source
 * (database, config, bootstrap) and provided to the FeatureFlags instance.
 * 
 * @module feature-flags
 */

import { createHash } from 'node:crypto';

// ----------------------------------------------------------------------------
// 1. CONSTANTS
// ----------------------------------------------------------------------------

const MAX_KEY_LENGTH = 100;
const VALID_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9._\-]*$/;
const DEFAULT_ENVIRONMENT = 'development';
const DEFAULT_ROLLOUT = 100;
const MIN_ROLLOUT = 0;
const MAX_ROLLOUT = 100;

// ----------------------------------------------------------------------------
// 2. CUSTOM ERRORS
// ----------------------------------------------------------------------------

export class FeatureFlagError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'FeatureFlagError';
        this.code = options.code || 'FEATURE_FLAG_ERROR';
        if (options.details) {
            this.details = options.details;
        }
    }
}

export class InvalidFlagKeyError extends FeatureFlagError {
    constructor(key, options = {}) {
        super(`Invalid flag key: "${key}"`, {
            code: 'INVALID_FLAG_KEY',
            details: { key },
            ...options,
        });
        this.name = 'InvalidFlagKeyError';
    }
}

export class DuplicateFlagError extends FeatureFlagError {
    constructor(key, options = {}) {
        super(`Flag "${key}" already registered`, {
            code: 'DUPLICATE_FLAG',
            details: { key },
            ...options,
        });
        this.name = 'DuplicateFlagError';
    }
}

export class InvalidFlagDefinitionError extends FeatureFlagError {
    constructor(key, message, options = {}) {
        super(`Invalid definition for "${key}": ${message}`, {
            code: 'INVALID_FLAG_DEFINITION',
            details: { key },
            ...options,
        });
        this.name = 'InvalidFlagDefinitionError';
    }
}

// ----------------------------------------------------------------------------
// 3. VALIDATION HELPERS
// ----------------------------------------------------------------------------

function validateFlagKey(key) {
    if (typeof key !== 'string') {
        throw new InvalidFlagKeyError(key);
    }
    
    const trimmed = key.trim();
    if (trimmed.length === 0) {
        throw new InvalidFlagKeyError(key);
    }
    
    if (trimmed.length > MAX_KEY_LENGTH) {
        throw new InvalidFlagKeyError(trimmed, {
            message: `Key exceeds maximum length of ${MAX_KEY_LENGTH}`,
        });
    }
    
    // Prevent prototype pollution and dangerous keys
    if (trimmed === '__proto__' || trimmed === 'constructor' || trimmed === 'prototype') {
        throw new InvalidFlagKeyError(trimmed);
    }
    
    // Validate format: start with letter, then alphanumeric, dot, underscore, hyphen
    if (!VALID_KEY_PATTERN.test(trimmed)) {
        throw new InvalidFlagKeyError(trimmed, {
            message: 'Key must start with a letter and contain only alphanumeric, dot, underscore, or hyphen characters',
        });
    }
    
    return trimmed;
}

function validateEnvironment(environment) {
    if (typeof environment !== 'string') {
        return DEFAULT_ENVIRONMENT;
    }
    
    const trimmed = environment.trim();
    if (trimmed.length === 0) {
        return DEFAULT_ENVIRONMENT;
    }
    
    return trimmed;
}

function validateRollout(rollout) {
    if (rollout === null || rollout === undefined) {
        return DEFAULT_ROLLOUT;
    }
    
    if (typeof rollout !== 'number' || !Number.isFinite(rollout)) {
        throw new InvalidFlagDefinitionError(
            'unknown',
            `Rollout must be a finite number, got ${typeof rollout}`
        );
    }
    
    if (rollout < MIN_ROLLOUT || rollout > MAX_ROLLOUT) {
        throw new InvalidFlagDefinitionError(
            'unknown',
            `Rollout must be between ${MIN_ROLLOUT} and ${MAX_ROLLOUT}, got ${rollout}`
        );
    }
    
    // Ensure integer
    return Math.round(rollout);
}

function validateEnabled(enabled) {
    return typeof enabled === 'boolean' ? enabled : false;
}

function validateRoles(roles) {
    if (!Array.isArray(roles)) {
        return null;
    }
    
    const validRoles = [];
    for (const role of roles) {
        if (typeof role === 'string') {
            const trimmed = role.trim();
            if (trimmed.length > 0) {
                validRoles.push(trimmed);
            }
        }
    }
    
    return validRoles.length > 0 ? validRoles : null;
}

function validateConfig(config) {
    if (config === null || config === undefined) {
        return null;
    }
    
    if (typeof config !== 'object' || Array.isArray(config)) {
        throw new InvalidFlagDefinitionError(
            'unknown',
            'Config must be a plain object'
        );
    }
    
    // Shallow copy to prevent mutation
    return { ...config };
}

// ----------------------------------------------------------------------------
// 4. DEFINITION NORMALIZATION
// ----------------------------------------------------------------------------

function normalizeDefinition(key, definition) {
    if (!definition || typeof definition !== 'object') {
        throw new InvalidFlagDefinitionError(key, 'Definition must be an object');
    }
    
    const {
        enabled = false,
        environment = null,
        rollout = DEFAULT_ROLLOUT,
        roles = null,
        config = null,
    } = definition;
    
    // Validate and normalize each field
    const normalizedEnabled = validateEnabled(enabled);
    const normalizedEnvironment = environment !== null && environment !== undefined
        ? validateEnvironment(environment)
        : null;
    const normalizedRollout = validateRollout(rollout);
    const normalizedRoles = validateRoles(roles);
    const normalizedConfig = config !== null && config !== undefined
        ? validateConfig(config)
        : null;
    
    return {
        key: validateFlagKey(key),
        enabled: normalizedEnabled,
        environment: normalizedEnvironment,
        rollout: normalizedRollout,
        roles: normalizedRoles,
        config: normalizedConfig,
    };
}

// ----------------------------------------------------------------------------
// 5. HASHING HELPERS
// ----------------------------------------------------------------------------

function hashInput(flagKey, identity) {
    const input = `${flagKey}:${identity}`;
    const hash = createHash('sha256');
    hash.update(input);
    const digest = hash.digest('hex');
    
    // Convert first 8 hex chars to a number 0-99
    const bucket = parseInt(digest.substring(0, 8), 16) % 100;
    return bucket;
}

// ----------------------------------------------------------------------------
// 6. FEATURE FLAGS CLASS
// ----------------------------------------------------------------------------

export class FeatureFlags {
    /**
     * Create a new FeatureFlags instance
     * @param {Object} options - Configuration options
     * @param {string} options.environment - Current environment
     * @param {Object|Array} options.flags - Initial flags
     */
    constructor(options = {}) {
        const {
            environment = null,
            flags = null,
        } = options;
        
        this._flags = new Map();
        this._environment = validateEnvironment(environment || process.env.NODE_ENV || DEFAULT_ENVIRONMENT);
        
        if (flags) {
            this.load(flags);
        }
    }
    
    /**
     * Get the current environment
     * @returns {string} Current environment
     */
    getEnvironment() {
        return this._environment;
    }
    
    /**
     * Register a single feature flag
     * @param {string} key - Flag key
     * @param {Object} definition - Flag definition
     * @returns {this} FeatureFlags instance for chaining
     * @throws {InvalidFlagKeyError} If key is invalid
     * @throws {DuplicateFlagError} If flag already exists
     * @throws {InvalidFlagDefinitionError} If definition is invalid
     */
    register(key, definition) {
        const safeKey = validateFlagKey(key);
        
        if (this._flags.has(safeKey)) {
            throw new DuplicateFlagError(safeKey);
        }
        
        const normalized = normalizeDefinition(safeKey, definition);
        this._flags.set(safeKey, normalized);
        
        return this;
    }
    
    /**
     * Load multiple feature flags
     * @param {Object|Array} flags - Flags to load (Object or Array)
     * @returns {this} FeatureFlags instance for chaining
     * @throws {InvalidFlagKeyError} If any key is invalid
     * @throws {InvalidFlagDefinitionError} If any definition is invalid
     * 
     * @example
     * // Array format
     * flags.load([
     *   { key: 'feature_a', enabled: true },
     *   { key: 'feature_b', enabled: false }
     * ]);
     * 
     * // Object format
     * flags.load({
     *   feature_a: { enabled: true },
     *   feature_b: { enabled: false }
     * });
     */
    load(flags) {
        if (!flags || typeof flags !== 'object') {
            throw new FeatureFlagError('Flags must be an object or array', {
                code: 'INVALID_FLAGS_INPUT',
            });
        }
        
        // Normalize input to array of definitions
        let definitions = [];
        
        if (Array.isArray(flags)) {
            definitions = flags;
        } else {
            // Object format: { key: definition, ... }
            for (const [key, definition] of Object.entries(flags)) {
                if (definition && typeof definition === 'object') {
                    definitions.push({ key, ...definition });
                }
            }
        }
        
        // Validate all definitions first (atomic operation)
        const normalized = [];
        for (const def of definitions) {
            if (!def.key) {
                throw new InvalidFlagDefinitionError('unknown', 'Definition missing "key" field');
            }
            const safeKey = validateFlagKey(def.key);
            
            // Check for duplicate in this batch
            if (normalized.some(n => n.key === safeKey)) {
                throw new DuplicateFlagError(safeKey);
            }
            
            // Check for existing flag
            if (this._flags.has(safeKey)) {
                throw new DuplicateFlagError(safeKey);
            }
            
            const normalizedDef = normalizeDefinition(safeKey, def);
            normalized.push(normalizedDef);
        }
        
        // Apply all validated definitions
        for (const def of normalized) {
            this._flags.set(def.key, def);
        }
        
        return this;
    }
    
    /**
     * Update an existing feature flag
     * @param {string} key - Flag key
     * @param {Object} definition - New flag definition
     * @returns {this} FeatureFlags instance for chaining
     * @throws {InvalidFlagKeyError} If key is invalid
     * @throws {FeatureFlagError} If flag does not exist
     * @throws {InvalidFlagDefinitionError} If definition is invalid
     */
    update(key, definition) {
        const safeKey = validateFlagKey(key);
        
        if (!this._flags.has(safeKey)) {
            throw new FeatureFlagError(`Flag "${safeKey}" not found`, {
                code: 'FLAG_NOT_FOUND',
                details: { key: safeKey },
            });
        }
        
        // Get existing definition to preserve fields not provided
        const existing = this._flags.get(safeKey);
        const merged = {
            enabled: definition.enabled !== undefined ? definition.enabled : existing.enabled,
            environment: definition.environment !== undefined ? definition.environment : existing.environment,
            rollout: definition.rollout !== undefined ? definition.rollout : existing.rollout,
            roles: definition.roles !== undefined ? definition.roles : existing.roles,
            config: definition.config !== undefined ? definition.config : existing.config,
        };
        
        const normalized = normalizeDefinition(safeKey, merged);
        this._flags.set(safeKey, normalized);
        
        return this;
    }
    
    /**
     * Set a flag value (create or update)
     * @param {string} key - Flag key
     * @param {Object} definition - Flag definition
     * @returns {this} FeatureFlags instance for chaining
     */
    set(key, definition) {
        const safeKey = validateFlagKey(key);
        
        if (this._flags.has(safeKey)) {
            return this.update(safeKey, definition);
        }
        
        return this.register(safeKey, definition);
    }
    
    /**
     * Remove a feature flag
     * @param {string} key - Flag key
     * @returns {boolean} True if flag was removed
     */
    remove(key) {
        try {
            const safeKey = validateFlagKey(key);
            return this._flags.delete(safeKey);
        } catch {
            return false;
        }
    }
    
    /**
     * Clear all feature flags
     */
    clear() {
        this._flags.clear();
    }
    
    /**
     * Check if a flag exists
     * @param {string} key - Flag key
     * @returns {boolean} True if flag exists
     */
    has(key) {
        try {
            const safeKey = validateFlagKey(key);
            return this._flags.has(safeKey);
        } catch {
            return false;
        }
    }
    
    /**
     * Get all flag keys
     * @returns {string[]} Array of flag keys
     */
    keys() {
        return Array.from(this._flags.keys());
    }
    
    /**
     * Get a flag definition (safe copy)
     * @param {string} key - Flag key
     * @returns {Object|null} Flag definition or null if not found
     */
    get(key) {
        try {
            const safeKey = validateFlagKey(key);
            const definition = this._flags.get(safeKey);
            
            if (!definition) {
                return null;
            }
            
            // Return a safe copy
            return {
                key: definition.key,
                enabled: definition.enabled,
                environment: definition.environment,
                rollout: definition.rollout,
                roles: definition.roles ? [...definition.roles] : null,
                config: definition.config ? { ...definition.config } : null,
            };
        } catch {
            return null;
        }
    }
    
    /**
     * Get flag configuration (safe copy)
     * @param {string} key - Flag key
     * @returns {Object|null} Flag config or null if not found/no config
     */
    getConfig(key) {
        try {
            const safeKey = validateFlagKey(key);
            const definition = this._flags.get(safeKey);
            
            if (!definition || !definition.config) {
                return null;
            }
            
            return { ...definition.config };
        } catch {
            return null;
        }
    }
    
    /**
     * Check if a feature flag is enabled
     * @param {string} key - Flag key
     * @param {Object} context - Evaluation context
     * @param {string} context.userId - User ID for deterministic rollout
     * @param {Array} context.roleIds - User role IDs for role targeting
     * @param {Object} context.attributes - Additional attributes (reserved)
     * @param {boolean} context.defaultValue - Default value if flag not found
     * @returns {boolean} True if flag is enabled
     */
    isEnabled(key, context = {}) {
        // Validate context
        const {
            userId = null,
            roleIds = null,
            attributes = null,
            defaultValue = false,
        } = context;
        
        // Validate flag existence
        let definition;
        try {
            const safeKey = validateFlagKey(key);
            definition = this._flags.get(safeKey);
        } catch {
            return defaultValue;
        }
        
        if (!definition) {
            return defaultValue;
        }
        
        // Check enabled flag
        if (!definition.enabled) {
            return false;
        }
        
        // Check environment restriction
        if (definition.environment !== null && definition.environment !== undefined) {
            if (this._environment !== definition.environment) {
                return false;
            }
        }
        
        // Check roles
        if (definition.roles && definition.roles.length > 0) {
            if (!roleIds || !Array.isArray(roleIds) || roleIds.length === 0) {
                return false;
            }
            
            const userRoles = roleIds.map(r => typeof r === 'string' ? r.trim() : String(r));
            const hasMatchingRole = definition.roles.some(role => userRoles.includes(role));
            
            if (!hasMatchingRole) {
                return false;
            }
        }
        
        // Check rollout
        if (definition.rollout < 100) {
            // If rollout is 0, always disabled
            if (definition.rollout <= 0) {
                return false;
            }
            
            // Need a stable identity for rollout
            if (!userId || typeof userId !== 'string') {
                return false;
            }
            
            // Deterministic hash-based rollout
            const bucket = hashInput(definition.key, userId);
            
            if (bucket >= definition.rollout) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Check if multiple flags are enabled
     * @param {Object} flags - Map of flag keys to context
     * @param {Object} defaultContext - Default context for all flags
     * @returns {Object} Map of flag keys to enabled status
     * 
     * @example
     * const result = flags.areEnabled({
     *   feature_a: { userId: '123' },
     *   feature_b: {}
     * });
     * // { feature_a: true, feature_b: false }
     */
    areEnabled(flags, defaultContext = {}) {
        if (!flags || typeof flags !== 'object') {
            return {};
        }
        
        const result = {};
        
        for (const [key, context] of Object.entries(flags)) {
            const mergedContext = { ...defaultContext, ...(context || {}) };
            result[key] = this.isEnabled(key, mergedContext);
        }
        
        return result;
    }
    
    /**
     * Get all flag statuses
     * @param {Object} context - Evaluation context (shared across all flags)
     * @param {string} context.userId - User ID for deterministic rollout
     * @param {Array} context.roleIds - User role IDs for role targeting
     * @returns {Object} Map of flag keys to enabled status
     */
    getAllStatuses(context = {}) {
        const result = {};
        
        for (const [key] of this._flags) {
            result[key] = this.isEnabled(key, context);
        }
        
        return result;
    }
}

// ----------------------------------------------------------------------------
// 7. EXPORTS
// ----------------------------------------------------------------------------

export default FeatureFlags;