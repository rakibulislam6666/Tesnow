/**
 * app/controllers/admin/permission.controller.js
 * Read-only permission management endpoint.
 *
 * This handler is JSON/API-style.
 */

import { sendSuccess } from '../../core/response.js';
import rbacService from '../../services/auth/rbac.service.js';

/**
 * GET /admin/permissions
 * List all permissions.
 */
export async function listPermissions(req, res, next) {
  try {
    const permissions = await rbacService.getPermissions();
    return sendSuccess(res, {
      data: permissions,
      message: 'Permissions retrieved successfully',
    });
  } catch (error) {
    next(error);
  }
}

export default {
  listPermissions,
};