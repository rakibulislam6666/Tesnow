/**
 * app/controllers/admin/role.controller.js
 * Role management endpoints – read-only foundation, CRUD, and
 * role ↔ permission management.
 *
 * These handlers are JSON/API-style.
 */

import {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendNotFound,
  sendValidationError,
} from '../../core/response.js';
import rbacService from '../../services/auth/rbac.service.js';

// Fields a client must never send on role CRUD endpoints.
// Their presence is rejected with a validation error rather than silently ignored.
const FORBIDDEN_FIELDS = [
  'id',
  'uuid',
  'is_system_role',
  'isSystemRole',
  'created_at',
  'updated_at',
  'deleted_at',
];

function rejectForbiddenFields(body, res) {
  if (!body || typeof body !== 'object') return false;
  for (const field of FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      sendValidationError(
        res,
        `Field "${field}" is not allowed`,
        { [field]: 'Not permitted' }
      );
      return true;
    }
  }
  return false;
}

/**
 * Reject any field not in the allowed list. Used on strict single-purpose
 * endpoints such as POST /roles/:id/permissions.
 */
function rejectUnexpectedFields(body, allowedFields, res) {
  if (!body || typeof body !== 'object') return false;
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) {
      sendValidationError(
        res,
        `Field "${key}" is not allowed`,
        { [key]: 'Not permitted' }
      );
      return true;
    }
  }
  return false;
}

/**
 * Strictly normalize a numeric/string ID to a positive safe integer, or null.
 * Consistent with the service-layer convention used in 3B-5A/5B.
 */
function normalizePositiveId(raw) {
  let num;
  if (typeof raw === 'string') {
    if (!/^\d+$/.test(raw)) return null;
    num = Number(raw);
  } else {
    num = raw;
  }
  if (!Number.isSafeInteger(num) || num <= 0) return null;
  return num;
}

function extractActor(req) {
  return {
    userId: req.user && req.user.id !== undefined ? req.user.id : null,
    adminId: req.admin && req.admin.admin_id !== undefined ? req.admin.admin_id : null,
  };
}

// ----------------------------------------------------------------------------
// Role CRUD handlers
// ----------------------------------------------------------------------------

/**
 * GET /admin/roles
 */
export async function listRoles(req, res, next) {
  try {
    const roles = await rbacService.getRoles();
    return sendSuccess(res, {
      data: roles,
      message: 'Roles retrieved successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /admin/roles/:id
 */
export async function getRole(req, res, next) {
  try {
    const role = await rbacService.getRole(req.params.id);
    if (!role) {
      return sendNotFound(res, 'Role not found');
    }
    return sendSuccess(res, {
      data: role,
      message: 'Role retrieved successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /admin/roles
 */
export async function createRole(req, res, next) {
  try {
    if (rejectForbiddenFields(req.body, res)) return;

    const { name, slug, description } = req.body || {};
    const role = await rbacService.createRole(
      { name, slug, description },
      extractActor(req)
    );

    return sendCreated(res, role, 'Role created successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /admin/roles/:id
 */
export async function updateRole(req, res, next) {
  try {
    if (rejectForbiddenFields(req.body, res)) return;

    const { name, slug, description } = req.body || {};
    const role = await rbacService.updateRole(
      req.params.id,
      { name, slug, description },
      extractActor(req)
    );

    return sendSuccess(res, {
      data: role,
      message: 'Role updated successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /admin/roles/:id
 */
export async function deleteRole(req, res, next) {
  try {
    await rbacService.deleteRole(req.params.id, extractActor(req));
    return sendNoContent(res);
  } catch (error) {
    next(error);
  }
}

// ----------------------------------------------------------------------------
// Role ↔ Permission handlers (Phase 3B-5C)
// ----------------------------------------------------------------------------

/**
 * GET /admin/roles/:id/permissions
 */
export async function listRolePermissions(req, res, next) {
  try {
    const result = await rbacService.getRolePermissions(req.params.id);
    return sendSuccess(res, {
      data: result,
      message: 'Role permissions retrieved successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /admin/roles/:id/permissions
 * Body: { permissionId: <positive integer> }
 */
export async function grantPermissionToRole(req, res, next) {
  try {
    // Only "permissionId" is allowed in the body.
    if (rejectUnexpectedFields(req.body, ['permissionId'], res)) return;

    if (!req.body || typeof req.body !== 'object'
        || !Object.prototype.hasOwnProperty.call(req.body, 'permissionId')) {
      return sendValidationError(res, 'permissionId is required', {
        permissionId: 'Required',
      });
    }

    const normalizedPermissionId = normalizePositiveId(req.body.permissionId);
    if (normalizedPermissionId === null) {
      return sendValidationError(res, 'permissionId must be a positive integer', {
        permissionId: 'Invalid value',
      });
    }

    const result = await rbacService.grantPermissionToRole(
      req.params.id,
      normalizedPermissionId,
      extractActor(req)
    );

    return sendCreated(res, result, 'Permission granted successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /admin/roles/:id/permissions/:permissionId
 */
export async function revokePermissionFromRole(req, res, next) {
  try {
    const normalizedPermissionId = normalizePositiveId(req.params.permissionId);
    if (normalizedPermissionId === null) {
      return sendValidationError(res, 'permissionId must be a positive integer', {
        permissionId: 'Invalid value',
      });
    }

    const result = await rbacService.revokePermissionFromRole(
      req.params.id,
      normalizedPermissionId,
      extractActor(req)
    );

    return sendSuccess(res, {
      data: result,
      message: 'Permission revoked successfully',
    });
  } catch (error) {
    next(error);
  }
}

export default {
  listRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  listRolePermissions,
  grantPermissionToRole,
  revokePermissionFromRole,
};