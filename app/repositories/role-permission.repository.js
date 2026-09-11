/**
 * app/repositories/role-permission.repository.js
 * Role ↔ Permission junction data access.
 *
 * Repository rules:
 *  - Writes accept an optional `connection` for caller transactions.
 *  - No method starts, commits, or rolls back a transaction.
 */

import { getDbPool } from '../config/database.config.js';

export function createRolePermissionRepository(pool = getDbPool()) {
  return {
    // ------------------------------------------------------------------------
    // Existing methods (preserved)
    // ------------------------------------------------------------------------

    async findByRoleId(roleId) {
      if (!Number.isInteger(roleId) || roleId <= 0) {
        throw new Error('roleId must be a positive integer');
      }

      const [rows] = await pool.query(
        `SELECT
           p.id,
           p.uuid,
           p.name,
           p.slug,
           p.description
         FROM role_permissions rp
         INNER JOIN permissions p ON p.id = rp.permission_id
         WHERE rp.role_id = ?
         ORDER BY p.id ASC`,
        [roleId]
      );

      return rows;
    },

    async exists(roleId, permissionId, connection = pool) {
      if (!Number.isInteger(roleId) || roleId <= 0) {
        throw new Error('roleId must be a positive integer');
      }
      if (!Number.isInteger(permissionId) || permissionId <= 0) {
        throw new Error('permissionId must be a positive integer');
      }

      const [rows] = await connection.query(
        'SELECT 1 FROM role_permissions WHERE role_id = ? AND permission_id = ? LIMIT 1',
        [roleId, permissionId]
      );

      return rows.length > 0;
    },

    async grant(roleId, permissionId, connection = pool) {
      if (!Number.isInteger(roleId) || roleId <= 0) {
        throw new Error('roleId must be a positive integer');
      }
      if (!Number.isInteger(permissionId) || permissionId <= 0) {
        throw new Error('permissionId must be a positive integer');
      }

      const [result] = await connection.query(
        'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
        [roleId, permissionId]
      );

      return Boolean(result && result.affectedRows > 0);
    },

    async revoke(roleId, permissionId, connection = pool) {
      if (!Number.isInteger(roleId) || roleId <= 0) {
        throw new Error('roleId must be a positive integer');
      }
      if (!Number.isInteger(permissionId) || permissionId <= 0) {
        throw new Error('permissionId must be a positive integer');
      }

      const [result] = await connection.query(
        'DELETE FROM role_permissions WHERE role_id = ? AND permission_id = ?',
        [roleId, permissionId]
      );

      return Boolean(result && result.affectedRows > 0);
    },

    // ------------------------------------------------------------------------
    // NEW for Phase 3B-6 — Locking read
    // ------------------------------------------------------------------------

    /**
     * Lock the complete role_permissions range for a role and return its
     * permission IDs + slugs.
     *
     * Must be called inside an existing transaction.
     * Does not mutate data and does not start a transaction.
     *
     * Deterministic order: permission_id ASC.
     * Uses PK (role_id, permission_id) so the lock is row/range scoped,
     * not a full table lock.
     *
     * NOTE on FOR UPDATE scope: MySQL/MariaDB will also lock the joined
     * `permissions` rows. That table is reference data and is not written
     * in this flow, so this is safe. If strict minimal-locking is required,
     * split the read into two statements (lock rp, then read p separately).
     *
     * @param {number} roleId
     * @param {import('mysql2/promise').Connection} connection
     * @returns {Promise<{ permissionIds: number[], permissionSlugs: string[] }>}
     */
    async lockByRoleId(roleId, connection = pool) {
      if (!Number.isInteger(roleId) || roleId <= 0) {
        throw new Error('roleId must be a positive integer');
      }

      const [rows] = await connection.query(
        `SELECT rp.permission_id, p.slug AS permission_slug
         FROM role_permissions rp
         INNER JOIN permissions p ON p.id = rp.permission_id
         WHERE rp.role_id = ?
         ORDER BY rp.permission_id ASC
         FOR UPDATE`,
        [roleId]
      );

      const permissionIds = rows.map((r) => Number(r.permission_id));
      const permissionSlugs = rows
        .map((r) => r.permission_slug)
        .filter((s) => typeof s === 'string');

      return { permissionIds, permissionSlugs };
    },
  };
}

export default createRolePermissionRepository();