/**
 * app/middleware/authorization.js
 * Admin authorization middleware – checks if the authenticated user is an active administrator.
 *
 * This middleware must be used AFTER the authentication middleware.
 * It assumes req.user is set and contains the authenticated user's safe data.
 */

import { AuthenticationError, AuthorizationError } from '../core/errors.js';
import { createChildLogger } from '../core/logger.js';
import { getRequestId, setAdminContext } from '../core/request-context.js';
import adminRepository from '../repositories/admin.repository.js';

const logger = createChildLogger({ module: 'authorization-middleware' });

/**
 * Express middleware that authorizes admin access.
 *
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Next middleware.
 */
export async function authorizeAdmin(req, res, next) {
  try {
    const requestId = getRequestId() || req.id;

    // 1. Ensure authentication middleware ran and attached a user
    if (!req.user || !req.user.id) {
      throw new AuthenticationError('Authentication required');
    }

    // 2. Look up the admin identity using the repository
    const admin = await adminRepository.findActiveAdminByUserId(req.user.id);

    // 3. If no active admin record, deny access
    if (!admin) {
      throw new AuthorizationError('Admin access required');
    }

    // 4. Attach the trusted admin identity to the request
    req.admin = admin; // { admin_id, user_id, admin_status }

    // 5. Update the request context for logging (optional)
    setAdminContext(admin.admin_id, {
      userId: req.user.id,
      // Extras can be added if needed
    });

    logger.debug({ userId: req.user.id, adminId: admin.admin_id, requestId }, 'Admin authorization successful');

    // 6. Continue to the admin route handler
    next();
  } catch (err) {
    // Pass errors to the central error handler
    next(err);
  }
}

export default authorizeAdmin;