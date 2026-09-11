/**
 * app/middleware/rbac.js
 * Express middleware to enforce permission checks.
 *
 * This middleware must be used AFTER authentication and admin authorization,
 * i.e., after req.admin has been set.
 */

import { AuthenticationError, AuthorizationError } from '../core/errors.js';
import { createChildLogger } from '../core/logger.js';
import { getRequestId } from '../core/request-context.js';
import rbacService from '../services/auth/rbac.service.js';

const logger = createChildLogger({ module: 'rbac-middleware' });

/**
 * Factory that returns an Express middleware function.
 * The middleware checks if the authenticated admin has the specified permission.
 *
 * @param {string} permissionSlug - The permission slug required for the route.
 * @returns {Function} Express middleware.
 */
export function authorizePermission(permissionSlug) {
  // Normalize permission slug at factory creation time
  if (typeof permissionSlug !== 'string') {
    throw new Error('permissionSlug must be a string');
  }
  const trimmedSlug = permissionSlug.trim();
  if (trimmedSlug === '') {
    throw new Error('permissionSlug must be a non-empty string');
  }

  return async (req, res, next) => {
    try {
      const requestId = getRequestId() || req.id;

      // 1. Ensure admin authorization middleware ran and attached req.admin
      if (!req.admin || !req.admin.admin_id) {
        throw new AuthenticationError('Authentication required');
      }

      const adminId = req.admin.admin_id;

      // 2. Check permission (trimmed slug is already stored)
      const hasPermission = await rbacService.hasPermission(adminId, trimmedSlug);

      if (!hasPermission) {
        // Fail‑closed: deny access without revealing why.
        throw new AuthorizationError('Insufficient permissions');
      }

      // 3. Log and continue
      logger.debug({ adminId, permissionSlug: trimmedSlug, requestId }, 'Permission granted');
      next();
    } catch (err) {
      // Propagate errors to the central error handler.
      next(err);
    }
  };
}

// Add default export to support both named and default imports.
export default authorizePermission;