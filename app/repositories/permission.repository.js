/**
 * app/repositories/permission.repository.js
 * Permission data access – read-only.
 *
 * This repository follows the project's existing factory/singleton pattern.
 */

import { getDbPool } from '../config/database.config.js';

export function createPermissionRepository(pool = getDbPool()) {
  return {
    /**
     * List all permissions.
     * Note: the permissions table has no deleted_at column.
     *
     * @returns {Promise<Array>} Array of permission objects.
     */
    async findAll() {
      const [rows] = await pool.query(
        `SELECT
          id,
          uuid,
          name,
          slug,
          description
        FROM permissions
        ORDER BY id ASC`
      );
      return rows;
    },

    /**
     * Get a single permission by ID.
     * Strict positive-integer validation.
     *
     * @param {number} id - Permission ID.
     * @returns {Promise<Object|null>} Permission object or null if not found.
     */
    async findById(id) {
      if (!Number.isInteger(id) || id <= 0) {
        throw new Error('id must be a positive integer');
      }

      const [rows] = await pool.query(
        `SELECT
          id,
          uuid,
          name,
          slug,
          description
        FROM permissions
        WHERE id = ?
        LIMIT 1`,
        [id]
      );

      return rows[0] || null;
    },
  };
}

// Default singleton instance using the default database pool.
export default createPermissionRepository();