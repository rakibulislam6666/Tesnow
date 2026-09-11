/**
 * app/middleware/validation.js
 *
 * Generic request validation middleware.
 *
 * Architecture:
 *
 *   Route
 *     ↓
 *   Validation Middleware
 *     ↓
 *   Validator
 *     ↓
 *   req.validated
 *     ↓
 *   Controller
 *
 * Responsibilities:
 *   - Execute configured validators.
 *   - Validate request body/query/params independently.
 *   - Store normalized validator output in req.validated.
 *   - Forward validation/application errors to next(error).
 *
 * Non-responsibilities:
 *   - Authentication.
 *   - Authorization.
 *   - Business logic.
 *   - SQL/database access.
 *   - HTTP response generation.
 *   - Sanitization beyond what the validator itself performs.
 *
 * Configuration contract:
 *   - Configuration is validated ONCE at middleware creation, not per
 *     request.
 *   - Only `body`, `query`, and `params` are accepted. Unknown keys are
 *     rejected with a TypeError so a typo (e.g. `bdoy`) or an unintended
 *     part (e.g. `headers`) cannot silently disable validation.
 *   - An empty configuration is rejected: a middleware that silently
 *     validates nothing is worse than one that fails to be created.
 *
 * Execution contract:
 *   - Validators run sequentially in a fixed order: body → query → params.
 *   - Each validator's return value is stored under the same key on
 *     `req.validated`, without cloning, merging, or coercing.
 *   - A validator may return an object, a scalar, or any other value.
 *     `req.validated.<part>` will equal exactly what was returned.
 *   - Validators may be synchronous or asynchronous.
 *
 * Security contract:
 *   - `req.body`, `req.query`, and `req.params` are never mutated.
 *   - Raw request values are never merged into `req.validated`.
 *   - Only functions supplied by application code are executed; nothing
 *     is evaluated dynamically.
 *   - The `req.validated` container is frozen after population; the
 *     values it holds are not deep-frozen.
 *   - Errors are forwarded unchanged via `next(error)`; the centralized
 *     error handler owns classification and response shaping.
 */

// ----------------------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------------------

/**
 * Allowed request parts, in deterministic execution order.
 *
 * `body` first because it is the most common source of validation
 * failures on write endpoints; `params` last because route params are
 * typically small and already constrained by the URL shape.
 */
const REQUEST_PARTS = Object.freeze(['body', 'query', 'params']);

const REQUEST_PART_SET = new Set(REQUEST_PARTS);

// ----------------------------------------------------------------------------
// CONFIGURATION VALIDATION
// ----------------------------------------------------------------------------

/**
 * Validate middleware configuration.
 *
 * Runs once at middleware creation so invalid route configuration fails
 * at startup rather than during request handling.
 *
 * Rejects:
 *   - non-plain-object configuration
 *   - unknown keys (typos or unsupported request parts)
 *   - non-function validators
 *   - empty configuration (at least one validator is required)
 *
 * @param {object} validators
 * @throws {TypeError}
 */
function assertValidators(validators) {
    if (
        validators === null ||
        typeof validators !== 'object' ||
        Array.isArray(validators)
    ) {
        throw new TypeError('Validation configuration must be a plain object.');
    }

    let configuredCount = 0;

    for (const key of Object.keys(validators)) {
        if (!REQUEST_PART_SET.has(key)) {
            throw new TypeError(`Unsupported request part: "${key}".`);
        }

        if (typeof validators[key] !== 'function') {
            throw new TypeError(
                `Validator for "${key}" must be a function.`,
            );
        }

        configuredCount += 1;
    }

    if (configuredCount === 0) {
        throw new TypeError(
            'Validation configuration must include at least one validator (body, query, or params).',
        );
    }
}

// ----------------------------------------------------------------------------
// MIDDLEWARE FACTORY
// ----------------------------------------------------------------------------

/**
 * Create generic request validation middleware.
 *
 * Example:
 *
 *   validate({
 *       body: createCategoryBody,
 *       query: listPublicCategoriesQuery,
 *   })
 *
 * The validator's return value becomes the corresponding
 * `req.validated` property, without transformation.
 *
 * @param {{
 *   body?: Function,
 *   query?: Function,
 *   params?: Function
 * }} validators
 *
 * @returns {Function} Express-compatible middleware
 */
export function validate(validators = {}) {
    assertValidators(validators);

    // Precompute the configured parts once. This is the hot path's only
    // configuration-derived work, and it is frozen so no caller can
    // mutate the plan after creation.
    const configuredParts = Object.freeze(
        REQUEST_PARTS.filter((part) =>
            Object.prototype.hasOwnProperty.call(validators, part),
        ),
    );

    return async function validationMiddleware(req, res, next) {
        try {
            const validated = {};

            for (const part of configuredParts) {
                const validator = validators[part];
                const input = req[part];
                const result = await validator(input);
                validated[part] = result;
            }

            // Freeze the container only. The validator's returned value is
            // not deep-frozen: it may be a large object, a shared reference,
            // or an immutable scalar, and deep-freezing would cost more
            // than it protects.
            req.validated = Object.freeze(validated);

            return next();
        } catch (error) {
            // Forward unchanged. The centralized error handler owns final
            // classification; ValidationError.details is preserved intact.
            return next(error);
        }
    };
}

// ----------------------------------------------------------------------------
// CONVENIENCE HELPERS
// ----------------------------------------------------------------------------

/**
 * Validate request body only.
 *
 * @param {Function} validator
 * @returns {Function}
 */
export function validateBody(validator) {
    return validate({ body: validator });
}

/**
 * Validate request query only.
 *
 * @param {Function} validator
 * @returns {Function}
 */
export function validateQuery(validator) {
    return validate({ query: validator });
}

/**
 * Validate request params only.
 *
 * @param {Function} validator
 * @returns {Function}
 */
export function validateParams(validator) {
    return validate({ params: validator });
}

/**
 * Validate body + query.
 *
 * Convenience helper for endpoints that accept both.
 *
 * @param {Function} bodyValidator
 * @param {Function} queryValidator
 * @returns {Function}
 */
export function validateBodyAndQuery(bodyValidator, queryValidator) {
    return validate({
        body: bodyValidator,
        query: queryValidator,
    });
}

/**
 * Validate params + query.
 *
 * Convenience helper for endpoints that use route parameters and
 * query-string filters/pagination.
 *
 * @param {Function} paramsValidator
 * @param {Function} queryValidator
 * @returns {Function}
 */
export function validateParamsAndQuery(paramsValidator, queryValidator) {
    return validate({
        params: paramsValidator,
        query: queryValidator,
    });
}

/**
 * Validate params + body.
 *
 * @param {Function} paramsValidator
 * @param {Function} bodyValidator
 * @returns {Function}
 */
export function validateParamsAndBody(paramsValidator, bodyValidator) {
    return validate({
        params: paramsValidator,
        body: bodyValidator,
    });
}

/**
 * Validate params + query + body.
 *
 * @param {Function} paramsValidator
 * @param {Function} queryValidator
 * @param {Function} bodyValidator
 * @returns {Function}
 */
export function validateRequest(
    paramsValidator,
    queryValidator,
    bodyValidator,
) {
    return validate({
        params: paramsValidator,
        query: queryValidator,
        body: bodyValidator,
    });
}

// ----------------------------------------------------------------------------
// DEFAULT EXPORT
// ----------------------------------------------------------------------------

export default validate;