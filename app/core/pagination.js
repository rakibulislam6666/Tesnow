/**
 * app/core/pagination.js
 * Pagination utility for Tesnow
 * Parses, validates, and calculates pagination metadata
 * 
 * @module pagination
 */

// ----------------------------------------------------------------------------
// 1. CONSTANTS
// ----------------------------------------------------------------------------

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

// ----------------------------------------------------------------------------
// 2. HELPER FUNCTIONS
// ----------------------------------------------------------------------------

/**
 * Safely parse a value to an integer
 * @param {*} value - Value to parse
 * @param {number} defaultValue - Default value if parsing fails
 * @param {number} maxValue - Maximum allowed value
 * @param {number} minValue - Minimum allowed value
 * @returns {number} Safe integer value
 */
function safeParseInt(value, defaultValue, maxValue = Infinity, minValue = 1) {
    // Handle null, undefined, empty string
    if (value === null || value === undefined || value === '') {
        return defaultValue;
    }
    
    // Convert to string for parsing
    let strValue = String(value).trim();
    
    // Handle special strings
    if (strValue === '') {
        return defaultValue;
    }
    
    // Handle numeric strings with leading zeros (allow but parse as number)
    // Use Number() for parsing, then check if it's a safe integer
    const num = Number(strValue);
    
    // Check for NaN, Infinity, -Infinity
    if (!Number.isFinite(num)) {
        return defaultValue;
    }
    
    // Check if it's an integer (allow decimals, but floor them)
    // We want to floor decimal values rather than reject them
    const intValue = Math.floor(num);
    
    // Check if the integer is safe
    if (!Number.isSafeInteger(intValue)) {
        return defaultValue;
    }
    
    // Check min/max bounds
    if (intValue < minValue) {
        return minValue;
    }
    
    if (intValue > maxValue) {
        return maxValue;
    }
    
    return intValue;
}

/**
 * Parse page value from query
 * @param {*} page - Page value from query
 * @param {number} defaultPage - Default page value
 * @returns {number} Safe page number
 */
function parsePage(page, defaultPage = DEFAULT_PAGE) {
    return safeParseInt(page, defaultPage, Infinity, 1);
}

/**
 * Parse limit value from query
 * @param {*} limit - Limit value from query
 * @param {number} defaultLimit - Default limit value
 * @param {number} maxLimit - Maximum allowed limit
 * @returns {number} Safe limit value
 */
function parseLimit(limit, defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT) {
    return safeParseInt(limit, defaultLimit, maxLimit, 1);
}

/**
 * Parse total value
 * @param {*} total - Total number of records
 * @returns {number} Safe total value
 */
function parseTotal(total) {
    // If total is null, undefined, or not provided, return 0
    if (total === null || total === undefined) {
        return 0;
    }
    
    // Convert to number
    let num = Number(total);
    
    // Check for NaN, Infinity, -Infinity
    if (!Number.isFinite(num) || Number.isNaN(num)) {
        return 0;
    }
    
    // Floor the value (total should be an integer)
    num = Math.floor(num);
    
    // If negative, set to 0
    if (num < 0) {
        return 0;
    }
    
    // Check if safe integer
    if (!Number.isSafeInteger(num)) {
        return 0;
    }
    
    return num;
}

// ----------------------------------------------------------------------------
// 3. CORE PAGINATION FUNCTIONS
// ----------------------------------------------------------------------------

/**
 * Calculate total pages
 * @param {number} total - Total number of records
 * @param {number} limit - Items per page
 * @returns {number} Total pages
 */
export function calculateTotalPages(total, limit) {
    // Ensure total and limit are valid numbers
    const safeTotal = parseTotal(total);
    const safeLimit = parseLimit(limit, DEFAULT_LIMIT, MAX_LIMIT);
    
    // If total is 0, return 0
    if (safeTotal === 0) {
        return 0;
    }
    
    // Calculate total pages
    return Math.ceil(safeTotal / safeLimit);
}

/**
 * Create pagination object from input
 * @param {Object} options - Pagination options
 * @param {number|string} options.page - Current page number
 * @param {number|string} options.limit - Items per page
 * @param {number|string} options.total - Total number of records
 * @param {number} options.defaultPage - Default page (optional)
 * @param {number} options.defaultLimit - Default limit (optional)
 * @param {number} options.maxLimit - Maximum limit (optional)
 * @returns {Object} Pagination metadata
 */
export function createPagination(options = {}) {
    const {
        page: rawPage,
        limit: rawLimit,
        total: rawTotal,
        defaultPage = DEFAULT_PAGE,
        defaultLimit = DEFAULT_LIMIT,
        maxLimit = MAX_LIMIT,
    } = options;
    
    // Parse values
    const page = parsePage(rawPage, defaultPage);
    const limit = parseLimit(rawLimit, defaultLimit, maxLimit);
    const total = parseTotal(rawTotal);
    
    // Calculate offset
    let offset = 0;
    if (page > 0 && limit > 0) {
        // Calculate offset with safe integer checks
        const calculatedOffset = (page - 1) * limit;
        // Check if offset is a safe integer
        if (Number.isSafeInteger(calculatedOffset) && calculatedOffset >= 0) {
            offset = calculatedOffset;
        } else {
            // If offset would be unsafe, set to 0
            offset = 0;
        }
    }
    
    // Calculate total pages
    const totalPages = calculateTotalPages(total, limit);
    
    // Calculate navigation state
    const hasNext = page < totalPages && totalPages > 0;
    const hasPrevious = page > 1 && totalPages > 0;
    
    // Calculate next and previous page numbers
    let nextPage = null;
    let previousPage = null;
    
    if (hasNext) {
        nextPage = page + 1;
    }
    
    if (hasPrevious) {
        previousPage = page - 1;
    }
    
    // Build result object
    const result = {
        page,
        limit,
        offset,
        total,
        totalPages,
        hasNext,
        hasPrevious,
    };
    
    // Only add nextPage/previousPage if they exist
    if (nextPage !== null) {
        result.nextPage = nextPage;
    }
    
    if (previousPage !== null) {
        result.previousPage = previousPage;
    }
    
    // Freeze to prevent mutation
    return Object.freeze(result);
}

/**
 * Parse pagination query from Express request query
 * @param {Object} query - Express request query object
 * @param {Object} options - Additional options
 * @param {number} options.defaultPage - Default page (optional)
 * @param {number} options.defaultLimit - Default limit (optional)
 * @param {number} options.maxLimit - Maximum limit (optional)
 * @returns {Object} Parsed pagination query
 */
export function parsePaginationQuery(query = {}, options = {}) {
    const {
        defaultPage = DEFAULT_PAGE,
        defaultLimit = DEFAULT_LIMIT,
        maxLimit = MAX_LIMIT,
    } = options;
    
    // Extract page and limit from query
    const rawPage = query.page !== undefined ? query.page : undefined;
    const rawLimit = query.limit !== undefined ? query.limit : undefined;
    
    // Parse values
    const page = parsePage(rawPage, defaultPage);
    const limit = parseLimit(rawLimit, defaultLimit, maxLimit);
    
    // Return parsed values
    return Object.freeze({
        page,
        limit,
    });
}

/**
 * Create pagination metadata from query and total
 * @param {Object} query - Express request query
 * @param {number|string} total - Total number of records
 * @param {Object} options - Additional options
 * @param {number} options.defaultPage - Default page (optional)
 * @param {number} options.defaultLimit - Default limit (optional)
 * @param {number} options.maxLimit - Maximum limit (optional)
 * @returns {Object} Complete pagination metadata
 */
export function createPaginationFromQuery(query = {}, total = 0, options = {}) {
    const {
        defaultPage = DEFAULT_PAGE,
        defaultLimit = DEFAULT_LIMIT,
        maxLimit = MAX_LIMIT,
    } = options;
    
    // Parse query
    const parsed = parsePaginationQuery(query, { defaultPage, defaultLimit, maxLimit });
    
    // Create pagination with total
    return createPagination({
        page: parsed.page,
        limit: parsed.limit,
        total,
        defaultPage,
        defaultLimit,
        maxLimit,
    });
}

// ----------------------------------------------------------------------------
// 4. EXPORTS
// ----------------------------------------------------------------------------

export default {
    DEFAULT_PAGE,
    DEFAULT_LIMIT,
    MAX_LIMIT,
    parsePaginationQuery,
    createPagination,
    createPaginationFromQuery,
    calculateTotalPages,
    parsePage,
    parseLimit,
    parseTotal,
};