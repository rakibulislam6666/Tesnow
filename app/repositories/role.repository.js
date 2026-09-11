/**
 * app/repositories/role.repository.js
 * Role and permission data access.
 *
 * Repository rules:
 *  - No method starts, commits, or rolls back a transaction.
 *  - Locking methods take an explicit `connection` and use `FOR UPDATE`.
 */

import { randomUUID } from 'node:crypto';
import { getDbPool } from '../config/database.config.js';
import { ADMIN_STATUS } from '../core/constants.js';

const ROLE_COLUMNS = `
  id,
  uuid,
  name,
  slug,
  description,
  is_system_role,
  created_at,
  updated_at
`;

export function createRoleRepository(pool = getDbPool()) {
  return {
    // ------------------------------------------------------------------------
    // Existing methods (preserved)
    // ------------------------------------------------------------------------

    async hasPermission(adminId, permissionSlug) {
      if (!Number.isInteger(adminId) || adminId <= 0) {
        throw new Error('adminId must be a positive integer');
      }
      if (typeof permissionSlug !== 'string' || permissionSlug.trim() === '') {
        throw new Error('permissionSlug must be a non-empty string');
      }

      const [rows] = await pool.query(
        `SELECT EXISTS (
          SELECT 1
          FROM admins a
          JOIN admin_roles ar ON a.id = ar.admin_id
          JOIN roles r ON ar.role_id = r.id
          JOIN role_permissions rp ON r.id = rp.role_id
          JOIN permissions p ON rp.permission_id = p.id
          WHERE a.id = ?
            AND a.deleted_at IS NULL
            AND a.status = ?
            AND r.deleted_at IS NULL
            AND p.slug = ?
        ) AS has_permission`,
        [adminId, ADMIN_STATUS.ACTIVE, permissionSlug]
      );

      return Boolean(rows[0] && rows[0].has_permission);
    },

    async findAll() {
      const [rows] = await pool.query(
        `SELECT ${ROLE_COLUMNS}
        FROM roles
        WHERE deleted_at IS NULL
        ORDER BY id ASC`
      );
      return rows;
    },

    async findById(id) {
      if (!Number.isInteger(id) || id <= 0) {
        throw new Error('id must be a positive integer');
      }

      const [rows] = await pool.query(
        `SELECT ${ROLE_COLUMNS}
        FROM roles
        WHERE id = ?
          AND deleted_at IS NULL
        LIMIT 1`,
        [id]
      );

      return rows[0] || null;
    },

    async create({ name, slug, description }, connection = pool) {
      if (typeof name !== 'string' || name.trim() === '') {
        throw new Error('name must be a non-empty string');
      }
      if (typeof slug !== 'string' || slug.trim() === '') {
        throw new Error('slug must be a non-empty string');
      }

      const cleanName = name.trim();
      const cleanSlug = slug.trim();
      const cleanDescription = (description === undefined || description === null)
        ? null
        : (typeof description === 'string' ? description.trim() : null);

      const uuid = randomUUID();

      const [result] = await connection.query(
        `INSERT INTO roles (uuid, name, slug, description, is_system_role)
         VALUES (?, ?, ?, ?, 0)`,
        [uuid, cleanName, cleanSlug, cleanDescription]
      );

      if (!result || !result.insertId) {
        return null;
      }

      const [rows] = await connection.query(
        `SELECT ${ROLE_COLUMNS}
        FROM roles
        WHERE id = ?
        LIMIT 1`,
        [result.insertId]
      );

      return rows[0] || null;
    },

    async update(id, patch, connection = pool) {
      if (!Number.isInteger(id) || id <= 0) {
        throw new Error('id must be a positive integer');
      }
      if (!patch || typeof patch !== 'object') {
        throw new Error('patch must be an object');
      }

      const fields = [];
      const params = [];

      if (patch.name !== undefined) {
        fields.push('name = ?');
        params.push(patch.name);
      }
      if (patch.slug !== undefined) {
        fields.push('slug = ?');
        params.push(patch.slug);
      }
      if (patch.description !== undefined) {
        fields.push('description = ?');
        params.push(patch.description);
      }

      if (fields.length === 0) {
        const [rows] = await connection.query(
          `SELECT ${ROLE_COLUMNS}
          FROM roles
          WHERE id = ?
            AND deleted_at IS NULL
          LIMIT 1`,
          [id]
        );
        return rows[0] || null;
      }

      params.push(id);
      await connection.query(
        `UPDATE roles
         SET ${fields.join(', ')}
         WHERE id = ?
           AND deleted_at IS NULL`,
        params
      );

      const [rows] = await connection.query(
        `SELECT ${ROLE_COLUMNS}
        FROM roles
        WHERE id = ?
          AND deleted_at IS NULL
        LIMIT 1`,
        [id]
      );

      return rows[0] || null;
    },

    async delete(id, connection = pool) {
      if (!Number.isInteger(id) || id <= 0) {
        throw new Error('id must be a positive integer');
      }

      const [result] = await connection.query(
        `UPDATE roles
         SET deleted_at = NOW()
         WHERE id = ?
           AND deleted_at IS NULL`,
        [id]
      );

      return Boolean(result && result.affectedRows > 0);
    },

    // ------------------------------------------------------------------------
    // NEW for Phase 3B-6 — Locking reads
    // ------------------------------------------------------------------------

    /**
     * Lock a non-deleted role row by ID.
     * Must be called inside an existing transaction.
     *
     * @param {number} id
     * @param {import('mysql2/promise').Connection} connection
     * @returns {Promise<Object|null>}
     */
    async findByIdForUpdate(id, connection = pool) {
      if (!Number.isInteger(id) || id <= 0) {
        throw new Error('id must be a positive integer');
      }

      const [rows] = await connection.query(
        `SELECT ${ROLE_COLUMNS}
        FROM roles
        WHERE id = ?
          AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE`,
        [id]
      );

      return rows[0] || null;
    },

    /**
     * Lock a non-deleted role row by slug.
     * Must be called inside an existing transaction.
     */
    async findBySlugForUpdate(slug, connection = pool) {
      if (typeof slug !== 'string' || slug.trim() === '') {
        throw new Error('slug must be a non-empty string');
      }

      const cleanSlug = slug.trim();

      const [rows] = await connection.query(
        `SELECT ${ROLE_COLUMNS}
        FROM roles
        WHERE slug = ?
          AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE`,
        [cleanSlug]
      );

      return rows[0] || null;
    },

    /**
     * Lock the caller's complete RBAC state inside the current transaction.
     *
     * Deterministic order:
     *   1. admin_roles rows for the caller, ORDER BY role_id ASC
     *   2. roles rows for those role IDs, ORDER BY id ASC
     *   3. role_permissions rows for the active role IDs,
     *      ORDER BY role_id ASC, permission_id ASC
     *
     * Deleted roles are ignored for effective authorization.
     *
     * Does NOT perform authorization — only returns the locked snapshot.
     *
     * @param {number} callerAdminId
     * @param {import('mysql2/promise').Connection} connection
     * @returns {Promise<{
     *   roleSlugs: Set<string>,
     *   permissionSlugs: Set<string>,
     *   activeRoleIds: number[]
     * }>}
     */
    async lockCallerAuthStateForUpdate(callerAdminId, connection = pool) {
      if (!Number.isInteger(callerAdminId) || callerAdminId <= 0) {
        throw new Error('callerAdminId must be a positive integer');
      }

      // 1. Lock admin_roles rows for this admin (PK prefix).
      const [arRows] = await connection.query(
        `SELECT role_id
         FROM admin_roles
         WHERE admin_id = ?
         ORDER BY role_id ASC
         FOR UPDATE`,
        [callerAdminId]
      );

      const roleIds = Array.from(
        new Set(arRows.map((r) => Number(r.role_id)))
      ).sort((a, b) => a - b);

      if (roleIds.length === 0) {
        return {
          roleSlugs: new Set(),
          permissionSlugs: new Set(),
          activeRoleIds: [],
        };
      }

      // 2. Lock role rows in id ASC order.
      const rolePlaceholders = roleIds.map(() => '?').join(', ');
      const [roleRows] = await connection.query(
        `SELECT id, slug, deleted_at
         FROM roles
         WHERE id IN (${rolePlaceholders})
         ORDER BY id ASC
         FOR UPDATE`,
        roleIds
      );

      const activeRoles = roleRows
        .filter((r) => !r.deleted_at)
        .sort((a, b) => Number(a.id) - Number(b.id));

      const activeRoleIds = activeRoles.map((r) => Number(r.id));
      const roleSlugs = new Set(activeRoles.map((r) => r.slug));

      if (activeRoleIds.length === 0) {
        return {
          roleSlugs,
          permissionSlugs: new Set(),
          activeRoleIds: [],
        };
      }

      // 3. Lock role_permissions rows for the active roles,
      //    deterministic order role_id ASC, permission_id ASC.
      const rpPlaceholders = activeRoleIds.map(() => '?').join(', ');
      const [rpRows] = await connection.query(
        `SELECT rp.role_id, rp.permission_id, p.slug AS permission_slug
         FROM role_permissions rp
         INNER JOIN permissions p ON p.id = rp.permission_id
         WHERE rp.role_id IN (${rpPlaceholders})
         ORDER BY rp.role_id ASC, rp.permission_id ASC
         FOR UPDATE`,
        activeRoleIds
      );

      const permissionSlugs = new Set(
        rpRows.map((r) => r.permission_slug).filter((s) => typeof s === 'string')
      );

      return { roleSlugs, permissionSlugs, activeRoleIds };
    },
  };
}

export default createRoleRepository();