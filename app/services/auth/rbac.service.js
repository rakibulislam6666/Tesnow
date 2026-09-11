/**
 * app/services/auth/rbac.service.js
 * RBAC business logic – permission checking, read-only foundation,
 * role CRUD, and role ↔ permission management.
 *
 * This service is HTTP‑agnostic and does not access req/res/session.
 */

import { createChildLogger } from '../../core/logger.js';
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../../core/errors.js';
import { withTransaction } from '../../core/transactions.js';
import {
  getRequestId,
  getUserId,
  getAdminId,
} from '../../core/request-context.js';
import roleRepository from '../../repositories/role.repository.js';
import permissionRepository from '../../repositories/permission.repository.js';
import rolePermissionRepository from '../../repositories/role-permission.repository.js';
import auditRepository from '../../repositories/audit.repository.js';
import securityRepository from '../../repositories/security.repository.js';

const logger = createChildLogger({ module: 'rbac-service' });

// ----------------------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------------------

/**
 * Strictly normalize a numeric/string ID to a positive safe integer, or null.
 * Accepts: numeric positive safe integer, or digit-only string.
 * Rejects: empty, non-digits, decimals, zero, negatives, unsafe integers.
 */
function normalizePositiveId(rawId) {
  let numId;

  if (typeof rawId === 'string') {
    if (!/^\d+$/.test(rawId)) {
      return null;
    }
    numId = Number(rawId);
  } else {
    numId = rawId;
  }

  if (!Number.isSafeInteger(numId) || numId <= 0) {
    return null;
  }

  return numId;
}

function snapshotRole(role) {
  if (!role) return null;
  return {
    name: role.name,
    slug: role.slug,
    description: role.description,
    is_system_role: Boolean(role.is_system_role),
  };
}

// ----------------------------------------------------------------------------
// Factory
// ----------------------------------------------------------------------------

export function createRbacService(
  roleRepo = roleRepository,
  permissionRepo = permissionRepository,
  auditRepo = auditRepository,
  securityRepo = securityRepository,
  rolePermissionRepo = rolePermissionRepository
) {
  return {
    /**
     * Check if an admin has a specific permission.
     */
    async hasPermission(adminId, permissionSlug) {
      if (!Number.isInteger(adminId) || adminId <= 0) {
        throw new Error('adminId must be a positive integer');
      }

      if (typeof permissionSlug !== 'string') {
        throw new Error('permissionSlug must be a string');
      }
      const trimmed = permissionSlug.trim();
      if (trimmed === '') {
        throw new Error('permissionSlug must be a non-empty string');
      }

      const result = await roleRepo.hasPermission(adminId, trimmed);

      logger.debug({ adminId, permissionSlug: trimmed, result }, 'Permission checked');

      return result;
    },

    /**
     * List all non‑deleted roles.
     */
    async getRoles() {
      return await roleRepo.findAll();
    },

    /**
     * Get a single non‑deleted role by ID.
     * Returns null for invalid or unknown IDs.
     */
    async getRole(id) {
      const numId = normalizePositiveId(id);
      if (numId === null) {
        return null;
      }
      return await roleRepo.findById(numId);
    },

    /**
     * List all permissions.
     */
    async getPermissions() {
      return await permissionRepo.findAll();
    },

    // ------------------------------------------------------------------------
    // Role CRUD (Phase 3B-5B)
    // ------------------------------------------------------------------------

    async createRole({ name, slug, description } = {}, actor = {}) {
      if (typeof name !== 'string' || name.trim() === '') {
        throw new ValidationError('name is required and must be a non-empty string');
      }
      if (typeof slug !== 'string' || slug.trim() === '') {
        throw new ValidationError('slug is required and must be a non-empty string');
      }
      if (description !== undefined && description !== null && typeof description !== 'string') {
        throw new ValidationError('description must be a string or null');
      }

      const cleanName = name.trim();
      const cleanSlug = slug.trim();
      const cleanDescription = (description === undefined || description === null)
        ? null
        : description.trim();

      const requestId = getRequestId();
      const actorUserId = actor.userId !== undefined ? actor.userId : getUserId();
      const actorAdminId = actor.adminId !== undefined ? actor.adminId : getAdminId();

      return await withTransaction(async (connection) => {
        const role = await roleRepo.create(
          { name: cleanName, slug: cleanSlug, description: cleanDescription },
          connection
        );

        if (!role) {
          throw new Error('Role creation failed');
        }

        await auditRepo.log(
          {
            action: 'create',
            entityType: 'role',
            entityId: role.id,
            beforeData: null,
            afterData: snapshotRole(role),
            actorUserId,
            actorAdminId,
            requestId,
          },
          connection
        );

        return role;
      });
    },

    async updateRole(id, patch = {}, actor = {}) {
      const numId = normalizePositiveId(id);
      if (numId === null) {
        throw new NotFoundError('Role not found');
      }

      const existing = await roleRepo.findById(numId);
      if (!existing) {
        throw new NotFoundError('Role not found');
      }

      if (Boolean(existing.is_system_role)) {
        try {
          await securityRepo.logEvent({
            userId: actor.userId !== undefined ? actor.userId : getUserId(),
            eventType: 'role.system_role_tamper_attempt',
            severity: 'high',
            isSuccess: false,
            requestId: getRequestId(),
            metadata: {
              roleId: numId,
              roleSlug: existing.slug,
              operation: 'update',
            },
          });
        } catch (logError) {
          logger.error(
            { err: logError, roleId: numId },
            'Failed to log system-role tamper attempt'
          );
        }
        throw new AuthorizationError('System roles cannot be modified');
      }

      const cleanPatch = {};

      if (patch.name !== undefined) {
        if (typeof patch.name !== 'string' || patch.name.trim() === '') {
          throw new ValidationError('name must be a non-empty string');
        }
        cleanPatch.name = patch.name.trim();
      }

      if (patch.slug !== undefined) {
        if (typeof patch.slug !== 'string' || patch.slug.trim() === '') {
          throw new ValidationError('slug must be a non-empty string');
        }
        cleanPatch.slug = patch.slug.trim();
      }

      if (patch.description !== undefined) {
        if (patch.description !== null && typeof patch.description !== 'string') {
          throw new ValidationError('description must be a string or null');
        }
        cleanPatch.description = (patch.description === null)
          ? null
          : patch.description.trim();
      }

      if (Object.keys(cleanPatch).length === 0) {
        throw new ValidationError('At least one field must be provided');
      }

      const requestId = getRequestId();
      const actorUserId = actor.userId !== undefined ? actor.userId : getUserId();
      const actorAdminId = actor.adminId !== undefined ? actor.adminId : getAdminId();

      return await withTransaction(async (connection) => {
        const updated = await roleRepo.update(numId, cleanPatch, connection);
        if (!updated) {
          throw new NotFoundError('Role not found');
        }

        await auditRepo.log(
          {
            action: 'update',
            entityType: 'role',
            entityId: numId,
            beforeData: snapshotRole(existing),
            afterData: snapshotRole(updated),
            actorUserId,
            actorAdminId,
            requestId,
          },
          connection
        );

        return updated;
      });
    },

    async deleteRole(id, actor = {}) {
      const numId = normalizePositiveId(id);
      if (numId === null) {
        throw new NotFoundError('Role not found');
      }

      const existing = await roleRepo.findById(numId);
      if (!existing) {
        throw new NotFoundError('Role not found');
      }

      if (Boolean(existing.is_system_role)) {
        try {
          await securityRepo.logEvent({
            userId: actor.userId !== undefined ? actor.userId : getUserId(),
            eventType: 'role.system_role_tamper_attempt',
            severity: 'high',
            isSuccess: false,
            requestId: getRequestId(),
            metadata: {
              roleId: numId,
              roleSlug: existing.slug,
              operation: 'delete',
            },
          });
        } catch (logError) {
          logger.error(
            { err: logError, roleId: numId },
            'Failed to log system-role tamper attempt'
          );
        }
        throw new AuthorizationError('System roles cannot be deleted');
      }

      const requestId = getRequestId();
      const actorUserId = actor.userId !== undefined ? actor.userId : getUserId();
      const actorAdminId = actor.adminId !== undefined ? actor.adminId : getAdminId();

      await withTransaction(async (connection) => {
        const deleted = await roleRepo.delete(numId, connection);
        if (!deleted) {
          throw new NotFoundError('Role not found');
        }

        await auditRepo.log(
          {
            action: 'delete',
            entityType: 'role',
            entityId: numId,
            beforeData: snapshotRole(existing),
            afterData: null,
            actorUserId,
            actorAdminId,
            requestId,
          },
          connection
        );
      });

      return true;
    },

    // ------------------------------------------------------------------------
    // Role ↔ Permission (Phase 3B-5C)
    // ------------------------------------------------------------------------

    /**
     * Read a role's assigned permissions.
     */
    async getRolePermissions(roleId) {
      const numRoleId = normalizePositiveId(roleId);
      if (numRoleId === null) {
        throw new ValidationError('roleId must be a positive integer');
      }

      const role = await roleRepo.findById(numRoleId);
      if (!role) {
        throw new NotFoundError('Role not found');
      }

      const permissions = await rolePermissionRepo.findByRoleId(numRoleId);

      return { role, permissions };
    },

    /**
     * Grant a permission to a role.
     * Self-escalation prevention: the caller must already possess the target permission.
     */
    async grantPermissionToRole(roleId, permissionId, actor = {}) {
      const numRoleId = normalizePositiveId(roleId);
      if (numRoleId === null) {
        throw new ValidationError('roleId must be a positive integer');
      }
      const numPermissionId = normalizePositiveId(permissionId);
      if (numPermissionId === null) {
        throw new ValidationError('permissionId must be a positive integer');
      }

      const role = await roleRepo.findById(numRoleId);
      if (!role) {
        throw new NotFoundError('Role not found');
      }

      // System-role protection — durable security event, independent of any transaction.
      if (Boolean(role.is_system_role)) {
        try {
          await securityRepo.logEvent({
            userId: actor.userId !== undefined ? actor.userId : getUserId(),
            eventType: 'role.system_role_tamper_attempt',
            severity: 'high',
            isSuccess: false,
            requestId: getRequestId(),
            metadata: {
              roleId: numRoleId,
              roleSlug: role.slug,
              permissionId: numPermissionId,
              operation: 'grant',
            },
          });
        } catch (logError) {
          logger.error(
            { err: logError, roleId: numRoleId, permissionId: numPermissionId },
            'Failed to log system-role tamper attempt'
          );
        }
        throw new AuthorizationError('System role permissions cannot be modified');
      }

      const permission = await permissionRepo.findById(numPermissionId);
      if (!permission) {
        throw new NotFoundError('Permission not found');
      }

      // Self-escalation prevention.
      const callerAdminId = actor.adminId !== undefined ? actor.adminId : getAdminId();
      if (!callerAdminId) {
        throw new AuthorizationError('Caller admin identity is required');
      }

      const callerPossesses = await roleRepo.hasPermission(callerAdminId, permission.slug);
      if (!callerPossesses) {
        throw new AuthorizationError(
          'Cannot grant a permission you do not possess'
        );
      }

      const requestId = getRequestId();
      const actorUserId = actor.userId !== undefined ? actor.userId : getUserId();

      await withTransaction(async (connection) => {
        const already = await rolePermissionRepo.exists(
          numRoleId,
          numPermissionId,
          connection
        );
        if (already) {
          throw new ConflictError('Permission already granted to this role');
        }

        const granted = await rolePermissionRepo.grant(
          numRoleId,
          numPermissionId,
          connection
        );
        if (!granted) {
          throw new Error('Failed to grant permission');
        }

        await auditRepo.log(
          {
            action: 'grant',
            entityType: 'role_permission',
            entityId: numRoleId,
            beforeData: null,
            afterData: {
              roleId: numRoleId,
              permissionId: numPermissionId,
              permissionSlug: permission.slug,
            },
            actorUserId,
            actorAdminId: callerAdminId,
            requestId,
          },
          connection
        );
      });

      const permissions = await rolePermissionRepo.findByRoleId(numRoleId);
      return { role, permissions };
    },

    /**
     * Revoke a permission from a role.
     */
    async revokePermissionFromRole(roleId, permissionId, actor = {}) {
      const numRoleId = normalizePositiveId(roleId);
      if (numRoleId === null) {
        throw new ValidationError('roleId must be a positive integer');
      }
      const numPermissionId = normalizePositiveId(permissionId);
      if (numPermissionId === null) {
        throw new ValidationError('permissionId must be a positive integer');
      }

      const role = await roleRepo.findById(numRoleId);
      if (!role) {
        throw new NotFoundError('Role not found');
      }

      // System-role protection — durable security event.
      if (Boolean(role.is_system_role)) {
        try {
          await securityRepo.logEvent({
            userId: actor.userId !== undefined ? actor.userId : getUserId(),
            eventType: 'role.system_role_tamper_attempt',
            severity: 'high',
            isSuccess: false,
            requestId: getRequestId(),
            metadata: {
              roleId: numRoleId,
              roleSlug: role.slug,
              permissionId: numPermissionId,
              operation: 'revoke',
            },
          });
        } catch (logError) {
          logger.error(
            { err: logError, roleId: numRoleId, permissionId: numPermissionId },
            'Failed to log system-role tamper attempt'
          );
        }
        throw new AuthorizationError('System role permissions cannot be modified');
      }

      const permission = await permissionRepo.findById(numPermissionId);
      if (!permission) {
        throw new NotFoundError('Permission not found');
      }

      const requestId = getRequestId();
      const actorUserId = actor.userId !== undefined ? actor.userId : getUserId();
      const actorAdminId = actor.adminId !== undefined ? actor.adminId : getAdminId();

      await withTransaction(async (connection) => {
        const removed = await rolePermissionRepo.revoke(
          numRoleId,
          numPermissionId,
          connection
        );
        if (!removed) {
          throw new NotFoundError('Permission is not assigned to this role');
        }

        await auditRepo.log(
          {
            action: 'revoke',
            entityType: 'role_permission',
            entityId: numRoleId,
            beforeData: {
              roleId: numRoleId,
              permissionId: numPermissionId,
              permissionSlug: permission.slug,
            },
            afterData: null,
            actorUserId,
            actorAdminId,
            requestId,
          },
          connection
        );
      });

      const permissions = await rolePermissionRepo.findByRoleId(numRoleId);
      return { role, permissions };
    },
  };
}

// Default singleton instance.
export default createRbacService();