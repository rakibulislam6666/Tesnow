/**
 * app/repositories/admin.repository.js
 * Admin identity data access – checks if a user is an active admin,
 * plus transaction-aware CRUD / role-assignment methods used by the
 * admin service locking layer (Phase 3B-6).
 *
 * Repository rules:
 *  - No method starts, commits, or rolls back a transaction.
 *  - Methods accept an optional `connection` for participation in the
 *    caller's transaction (default = shared pool).
 *  - No global pool is used when a transaction connection is supplied.
 */

import { randomUUID } from 'node:crypto';
import { getDbPool } from '../config/database.config.js';
import { ADMIN_STATUS, USER_STATUS } from '../core/constants.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

// Whitelist for updateUserFields — must match the actual `users` schema.
const ALLOWED_USER_FIELDS = new Set([
  'username',
  'email',
  'password_hash',
  'status',
]);

function validatePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function validateLimit(limit) {
  const val = validatePositiveInteger(limit, 'limit');
  if (val > MAX_LIMIT) throw new Error(`limit cannot exceed ${MAX_LIMIT}`);
  return val;
}

function validateOffset(offset) {
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error('offset must be a non-negative integer');
  }
  return offset;
}

export function createAdminRepository(pool = getDbPool()) {
  return {
    // ------------------------------------------------------------------------
    // Existing method (preserved)
    // ------------------------------------------------------------------------

    /**
     * Find an active admin record for a given user ID.
     */
    async findActiveAdminByUserId(userId) {
      validatePositiveInteger(userId, 'userId');

      const [rows] = await pool.query(
        `SELECT
          a.id AS admin_id,
          a.user_id,
          a.status AS admin_status
        FROM admins a
        INNER JOIN users u ON a.user_id = u.id
        WHERE a.user_id = ?
          AND a.deleted_at IS NULL
          AND a.status = ?
          AND u.deleted_at IS NULL
          AND u.status = ?`,
        [userId, ADMIN_STATUS.ACTIVE, USER_STATUS.ACTIVE]
      );

      return rows[0] || null;
    },

    // ------------------------------------------------------------------------
    // NEW for Phase 3B-6 — Create
    // ------------------------------------------------------------------------

    /**
     * Create an admin row for an existing user.
     * Uses `admin_uuid` (NOT `uuid`).
     *
     * @param {Object} data - { userId }
     * @param {import('mysql2/promise').Connection} [connection]
     * @returns {Promise<Object|null>}
     */
    async createAdmin({ userId } = {}, connection = pool) {
      validatePositiveInteger(userId, 'userId');

      const adminUuid = randomUUID();

      const [result] = await connection.query(
        `INSERT INTO admins (admin_uuid, user_id, status)
         VALUES (?, ?, ?)`,
        [adminUuid, userId, ADMIN_STATUS.ACTIVE]
      );

      if (!result || !result.insertId) {
        return null;
      }

      const [rows] = await connection.query(
        `SELECT id, admin_uuid, user_id, status, created_at, updated_at
         FROM admins
         WHERE id = ?
         LIMIT 1`,
        [result.insertId]
      );

      return rows[0] || null;
    },

    // ------------------------------------------------------------------------
    // NEW for Phase 3B-6 — Reads
    // ------------------------------------------------------------------------

    /**
     * Read an admin together with the owning user's display fields.
     * Does NOT lock.
     *
     * @param {number} id - Admin ID.
     * @param {import('mysql2/promise').Connection} [connection]
     */
    async findByIdWithUser(id, connection = pool) {
      validatePositiveInteger(id, 'id');

      const [rows] = await connection.query(
        `SELECT
          a.id AS admin_id,
          a.admin_uuid,
          a.user_id,
          a.status AS admin_status,
          a.deleted_at AS admin_deleted_at,
          a.created_at AS admin_created_at,
          u.id AS user_id_ref,
          u.uuid AS user_uuid,
          u.username,
          u.email,
          u.status AS user_status,
          u.deleted_at AS user_deleted_at
        FROM admins a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE a.id = ?
        LIMIT 1`,
        [id]
      );

      return rows[0] || null;
    },

    /**
     * Lock the admin row AND its owning user row with FOR UPDATE.
     * Must be called inside an existing transaction.
     *
     * @param {number} id - Admin ID.
     * @param {import('mysql2/promise').Connection} connection
     */
    async findByIdForUpdate(id, connection = pool) {
      validatePositiveInteger(id, 'id');

      const [rows] = await connection.query(
        `SELECT
          a.id AS admin_id,
          a.admin_uuid,
          a.user_id,
          a.status AS admin_status,
          a.deleted_at AS admin_deleted_at,
          u.id AS user_id_ref,
          u.status AS user_status,
          u.deleted_at AS user_deleted_at
        FROM admins a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE a.id = ?
        FOR UPDATE`,
        [id]
      );

      return rows[0] || null;
    },

    /**
     * Paginated admin list (excludes soft-deleted admins/users).
     */
    async listAdmins({ limit = DEFAULT_LIMIT, offset = 0 } = {}, connection = pool) {
      const safeLimit = validateLimit(limit);
      const safeOffset = validateOffset(offset);

      const [rows] = await connection.query(
        `SELECT
          a.id AS admin_id,
          a.admin_uuid,
          a.user_id,
          a.status AS admin_status,
          a.created_at AS admin_created_at,
          u.username,
          u.email,
          u.status AS user_status
        FROM admins a
        INNER JOIN users u ON a.user_id = u.id
        WHERE a.deleted_at IS NULL
          AND u.deleted_at IS NULL
        ORDER BY a.id ASC
        LIMIT ? OFFSET ?`,
        [safeLimit, safeOffset]
      );

      return rows;
    },

    /**
     * Count non-soft-deleted admins with non-soft-deleted users.
     */
    async countAdmins(connection = pool) {
      const [rows] = await connection.query(
        `SELECT COUNT(*) AS count
         FROM admins a
         INNER JOIN users u ON a.user_id = u.id
         WHERE a.deleted_at IS NULL
           AND u.deleted_at IS NULL`
      );

      return Number(rows[0].count);
    },

    /**
     * True if the admin is active/non-deleted and its user is active/non-deleted.
     */
    async isActiveAdmin(adminId, connection = pool) {
      validatePositiveInteger(adminId, 'adminId');

      const [rows] = await connection.query(
        `SELECT EXISTS (
          SELECT 1
          FROM admins a
          INNER JOIN users u ON a.user_id = u.id
          WHERE a.id = ?
            AND a.deleted_at IS NULL
            AND a.status = ?
            AND u.deleted_at IS NULL
            AND u.status = ?
        ) AS is_active`,
        [adminId, ADMIN_STATUS.ACTIVE, USER_STATUS.ACTIVE]
      );

      return Boolean(rows[0] && rows[0].is_active);
    },

    // ------------------------------------------------------------------------
    // NEW for Phase 3B-6 — Updates
    // ------------------------------------------------------------------------

    /**
     * Update a whitelisted set of fields on the owning user row.
     * Whitelist is restricted to columns that actually exist on `users`.
     */
    async updateUserFields(userId, fields, connection = pool) {
      validatePositiveInteger(userId, 'userId');

      if (!fields || typeof fields !== 'object') {
        throw new Error('fields must be an object');
      }

      const sets = [];
      const params = [];

      for (const [key, value] of Object.entries(fields)) {
        if (!ALLOWED_USER_FIELDS.has(key)) continue;
        sets.push(`${key} = ?`);
        params.push(value);
      }

      if (sets.length === 0) {
        return false;
      }

      params.push(userId);

      const [result] = await connection.query(
        `UPDATE users SET ${sets.join(', ')}
         WHERE id = ? AND deleted_at IS NULL`,
        params
      );

      return Boolean(result && result.affectedRows > 0);
    },

    /**
     * Update an admin's status.
     */
    async updateAdminStatus(adminId, status, connection = pool) {
      validatePositiveInteger(adminId, 'adminId');

      if (typeof status !== 'string' || status.trim() === '') {
        throw new Error('status must be a non-empty string');
      }

      const [result] = await connection.query(
        `UPDATE admins SET status = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [status, adminId]
      );

      return Boolean(result && result.affectedRows > 0);
    },

    /**
     * Soft-delete an admin row (sets deleted_at = NOW()).
     */
    async softDeleteAdmin(adminId, connection = pool) {
      validatePositiveInteger(adminId, 'adminId');

      const [result] = await connection.query(
        `UPDATE admins SET deleted_at = NOW()
         WHERE id = ? AND deleted_at IS NULL`,
        [adminId]
      );

      return Boolean(result && result.affectedRows > 0);
    },

    // ------------------------------------------------------------------------
    // NEW for Phase 3B-6 — Admin ↔ Role junction
    // ------------------------------------------------------------------------

    /**
     * List roles currently assigned to an admin (excludes soft-deleted roles).
     */
    async listAdminRoles(adminId, connection = pool) {
      validatePositiveInteger(adminId, 'adminId');

      const [rows] = await connection.query(
        `SELECT
          r.id,
          r.uuid,
          r.name,
          r.slug,
          r.description,
          r.is_system_role,
          r.created_at,
          r.updated_at
        FROM admin_roles ar
        INNER JOIN roles r ON ar.role_id = r.id
        WHERE ar.admin_id = ?
          AND r.deleted_at IS NULL
        ORDER BY r.id ASC`,
        [adminId]
      );

      return rows;
    },

    /**
     * True if the admin currently has the given role assignment.
     */
    async hasRole(adminId, roleId, connection = pool) {
      validatePositiveInteger(adminId, 'adminId');
      validatePositiveInteger(roleId, 'roleId');

      const [rows] = await connection.query(
        `SELECT EXISTS (
          SELECT 1 FROM admin_roles
          WHERE admin_id = ? AND role_id = ?
        ) AS has_role`,
        [adminId, roleId]
      );

      return Boolean(rows[0] && rows[0].has_role);
    },

    /**
     * Idempotently assign a role to an admin.
     * Depends on PK (admin_id, role_id) — INSERT IGNORE is safe here.
     */
    async assignRole(adminId, roleId, connection = pool) {
      validatePositiveInteger(adminId, 'adminId');
      validatePositiveInteger(roleId, 'roleId');

      const [result] = await connection.query(
        `INSERT IGNORE INTO admin_roles (admin_id, role_id)
         VALUES (?, ?)`,
        [adminId, roleId]
      );

      return Boolean(result && result.affectedRows > 0);
    },

    /**
     * Remove a role assignment from an admin.
     */
    async revokeRole(adminId, roleId, connection = pool) {
      validatePositiveInteger(adminId, 'adminId');
      validatePositiveInteger(roleId, 'roleId');

      const [result] = await connection.query(
        `DELETE FROM admin_roles WHERE admin_id = ? AND role_id = ?`,
        [adminId, roleId]
      );

      return Boolean(result && result.affectedRows > 0);
    },

    /**
     * Count active, non-deleted admins whose user is active and non-deleted
     * and who hold the given role.
     */
    async countActiveAdminsWithRole(roleId, connection = pool) {
      validatePositiveInteger(roleId, 'roleId');

      const [rows] = await connection.query(
        `SELECT COUNT(*) AS count
         FROM admin_roles ar
         INNER JOIN admins a ON ar.admin_id = a.id
         INNER JOIN users u ON a.user_id = u.id
         WHERE ar.role_id = ?
           AND a.deleted_at IS NULL
           AND a.status = ?
           AND u.deleted_at IS NULL
           AND u.status = ?`,
        [roleId, ADMIN_STATUS.ACTIVE, USER_STATUS.ACTIVE]
      );

      return Number(rows[0].count);
    },
  };
}

export default createAdminRepository();