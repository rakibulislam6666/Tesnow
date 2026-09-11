/**
 * database/seeders/admin_roles.seeder.js
 * Seeds admin-role assignments based on an explicit mapping.
 *
 * The mapping is intentionally empty until an authoritative admin-role assignment policy is defined.
 * This seeder is idempotent – it checks each mapping and inserts only missing ones.
 *
 * @param {import('mysql2/promise').Connection} connection - A database connection supplied by the seed runner.
 * @returns {Promise<{ inserted: number, skipped: number }>}
 */

// ----------------------------------------------------------------------------
// 1. AUTHORITATIVE ADMIN → ROLE MAPPING
// ----------------------------------------------------------------------------

/**
 * ADMIN_ROLE_MAPPINGS defines which admin (by admin_uuid) gets which role (by role slug).
 *
 * This is currently empty. To add a mapping, use the following structure:
 *
 * {
 *   adminUuid: 'explicit-admin-uuid',
 *   roleSlug: 'explicit-role-slug'
 * }
 *
 * The admin must exist, be active, and have an active associated user.
 * The role must exist and not be soft-deleted.
 */
const ADMIN_ROLE_MAPPINGS = [];

// ----------------------------------------------------------------------------
// 2. SEEDER FUNCTION
// ----------------------------------------------------------------------------

/**
 * Seeds the admin_roles table with the configured admin-role mappings.
 *
 * @param {import('mysql2/promise').Connection} connection - A database connection.
 * @returns {Promise<{ inserted: number, skipped: number }>}
 */
export async function seedAdminRoles(connection) {
  // If no mappings are configured, return immediately.
  if (ADMIN_ROLE_MAPPINGS.length === 0) {
    return { inserted: 0, skipped: 0 };
  }

  let inserted = 0;
  let skipped = 0;

  for (const mapping of ADMIN_ROLE_MAPPINGS) {
    const { adminUuid, roleSlug } = mapping;

    // 1. Resolve admin ID by admin_uuid, ensuring active user and admin.
    const [adminRows] = await connection.query(
      `SELECT a.id
       FROM admins a
       JOIN users u ON a.user_id = u.id
       WHERE a.admin_uuid = ?
         AND a.status = 'active'
         AND a.deleted_at IS NULL
         AND u.status = 'active'
         AND u.deleted_at IS NULL
       LIMIT 1`,
      [adminUuid]
    );

    if (adminRows.length === 0) {
      // Admin not found or not active – skip this mapping.
      skipped += 1;
      continue;
    }
    const adminId = adminRows[0].id;

    // 2. Resolve role ID by slug, ensuring it is not soft-deleted.
    const [roleRows] = await connection.query(
      'SELECT id FROM roles WHERE slug = ? AND deleted_at IS NULL LIMIT 1',
      [roleSlug]
    );

    if (roleRows.length === 0) {
      // Role not found or soft-deleted – skip this mapping.
      skipped += 1;
      continue;
    }
    const roleId = roleRows[0].id;

    // 3. Check if the assignment already exists.
    const [exists] = await connection.query(
      'SELECT 1 FROM admin_roles WHERE admin_id = ? AND role_id = ? LIMIT 1',
      [adminId, roleId]
    );

    if (exists.length > 0) {
      // Already assigned – skip.
      skipped += 1;
      continue;
    }

    // 4. Insert the new assignment.
    await connection.query(
      'INSERT INTO admin_roles (admin_id, role_id) VALUES (?, ?)',
      [adminId, roleId]
    );
    inserted += 1;
  }

  return { inserted, skipped };
}

// ----------------------------------------------------------------------------
// 3. DEFAULT EXPORT
// ----------------------------------------------------------------------------

export default seedAdminRoles;