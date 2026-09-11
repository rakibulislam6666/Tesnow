/**
 * database/seeders/role_permissions.seeder.js
 * Seeds the approved role‑permission assignments (119 total) into the role_permissions table.
 *
 * This seeder is idempotent – it checks each mapping by role_id and permission_id,
 * and inserts only missing ones. It does not modify or delete existing mappings.
 *
 * @param {import('mysql2/promise').Connection} connection - A database connection supplied by the seed runner.
 * @returns {Promise<{ inserted: number, skipped: number }>}
 */

// ----------------------------------------------------------------------------
// 1. AUTHORITATIVE ROLE → PERMISSION MATRIX
// ----------------------------------------------------------------------------

// All approved current permission slugs
const ALL_PERMISSIONS = [
  'dashboard.read',
  'post.read',
  'post.create',
  'post.update',
  'post.delete',
  'post.restore',
  'post.publish',
  'post.schedule',
  'category.read',
  'category.create',
  'category.update',
  'category.delete',
  'tag.read',
  'tag.create',
  'tag.update',
  'tag.delete',
  'media.read',
  'media.create',
  'media.update',
  'media.delete',
  'comment.read',
  'comment.approve',
  'comment.reject',
  'comment.delete',
  'user.read',
  'user.create',
  'user.update',
  'user.delete',
  'user.suspend',
  'user.verify',
  'user.force_password_reset',
  'user_post.read',
  'notification.read',
  'notification.create',
  'notification.delete',
  'analytics.read',
  'audit_log.read',
  'security.read',
  'security.sessions.read',
  'report.read',
  'report.resolve',
  'report.dismiss',
  'setting.read',
  'setting.update',
  'system.read',
  'role.read',
  'permission.read',
  'role.create',
  'role.update',
  'role.delete',
  'role.permission.read',
  'role.permission.grant',
  'role.permission.revoke',
];

// Matrix: role slug → array of permission slugs
const ROLE_PERMISSIONS = {
  super_admin: ALL_PERMISSIONS, // all 53

  content_manager: [
    'dashboard.read',
    'post.read',
    'post.create',
    'post.update',
    'post.delete',
    'post.restore',
    'post.publish',
    'post.schedule',
    'category.read',
    'category.create',
    'category.update',
    'category.delete',
    'tag.read',
    'tag.create',
    'tag.update',
    'tag.delete',
    'media.read',
    'media.create',
    'media.update',
    'media.delete',
    'comment.read',
    'comment.approve',
    'comment.reject',
    'comment.delete',
  ],

  user_manager: [
    'dashboard.read',
    'user.read',
    'user.create',
    'user.update',
    'user.delete',
    'user.suspend',
    'user.verify',
    'user.force_password_reset',
    'user_post.read',
    'notification.read',
    'notification.create',
    'notification.delete',
  ],

  moderator: [
    'dashboard.read',
    'comment.read',
    'comment.approve',
    'comment.reject',
    'comment.delete',
    'report.read',
    'report.resolve',
    'report.dismiss',
  ],

  analytics_viewer: [
    'dashboard.read',
    'analytics.read',
    'system.read',
    'post.read',
    'user.read',
    'comment.read',
  ],

  settings_manager: [
    'dashboard.read',
    'setting.read',
    'setting.update',
  ],

  viewer: [
    'dashboard.read',
    'post.read',
    'category.read',
    'tag.read',
    'media.read',
    'comment.read',
  ],

  auditor: [
    'dashboard.read',
    'audit_log.read',
    'security.read',
    'security.sessions.read',
    'post.read',
    'user.read',
    'comment.read',
  ],
};

// ----------------------------------------------------------------------------
// 2. SEEDER FUNCTION
// ----------------------------------------------------------------------------

/**
 * Seeds the role_permissions table with the approved role‑permission assignments.
 *
 * @param {import('mysql2/promise').Connection} connection - A database connection.
 * @returns {Promise<{ inserted: number, skipped: number }>}
 */
export async function seedRolePermissions(connection) {
  // 1. Resolve all role IDs by slug.
  const roleSlugs = Object.keys(ROLE_PERMISSIONS);
  const roleIdMap = new Map();

  for (const slug of roleSlugs) {
    const [rows] = await connection.query(
      'SELECT id FROM roles WHERE slug = ? AND deleted_at IS NULL LIMIT 1',
      [slug]
    );
    if (rows.length === 0) {
      throw new Error(`Required role not found: "${slug}"`);
    }
    roleIdMap.set(slug, rows[0].id);
  }

  // 2. Resolve all permission IDs by slug.
  const allPermissionSlugs = Object.values(ROLE_PERMISSIONS).flat();
  const uniquePermissionSlugs = [...new Set(allPermissionSlugs)];
  const permissionIdMap = new Map();

  for (const slug of uniquePermissionSlugs) {
    const [rows] = await connection.query(
      'SELECT id FROM permissions WHERE slug = ? LIMIT 1',
      [slug]
    );
    if (rows.length === 0) {
      throw new Error(`Required permission not found: "${slug}"`);
    }
    permissionIdMap.set(slug, rows[0].id);
  }

  // 3. Insert assignments.
  let inserted = 0;
  let skipped = 0;

  for (const [roleSlug, permissionSlugs] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleIdMap.get(roleSlug);

    for (const permSlug of permissionSlugs) {
      const permissionId = permissionIdMap.get(permSlug);

      // Check if the mapping already exists.
      const [exists] = await connection.query(
        'SELECT 1 FROM role_permissions WHERE role_id = ? AND permission_id = ? LIMIT 1',
        [roleId, permissionId]
      );

      if (exists.length > 0) {
        skipped += 1;
        continue;
      }

      // Insert the mapping.
      await connection.query(
        'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
        [roleId, permissionId]
      );
      inserted += 1;
    }
  }

  return { inserted, skipped };
}

// ----------------------------------------------------------------------------
// 3. DEFAULT EXPORT
// ----------------------------------------------------------------------------

export default seedRolePermissions;