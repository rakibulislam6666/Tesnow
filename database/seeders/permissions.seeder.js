/**
 * database/seeders/permissions.seeder.js
 * Seeds the current permissions catalog (53 permissions) into the permissions table.
 *
 * This seeder is idempotent – it checks each permission by `slug` and inserts only missing ones.
 *
 * @param {import('mysql2/promise').Connection} connection - A database connection supplied by the seed runner.
 * @returns {Promise<{ inserted: number, skipped: number }>}
 */

import { randomUUID } from 'node:crypto';

// ----------------------------------------------------------------------------
// 1. AUTHORITATIVE CURRENT PERMISSION CATALOG
// ----------------------------------------------------------------------------

const PERMISSIONS = [
  // Dashboard
  { slug: 'dashboard.read', name: 'View Dashboard', description: 'Allows viewing the admin dashboard overview.' },

  // Posts
  { slug: 'post.read', name: 'View Posts', description: 'Allows viewing posts in the admin area.' },
  { slug: 'post.create', name: 'Create Posts', description: 'Allows creating new posts.' },
  { slug: 'post.update', name: 'Update Posts', description: 'Allows editing existing posts.' },
  { slug: 'post.delete', name: 'Delete Posts', description: 'Allows permanently deleting posts.' },
  { slug: 'post.restore', name: 'Restore Posts', description: 'Allows restoring soft‑deleted posts.' },
  { slug: 'post.publish', name: 'Publish Posts', description: 'Allows publishing or unpublishing posts.' },
  { slug: 'post.schedule', name: 'Schedule Posts', description: 'Allows setting scheduled publishing times for posts.' },

  // Categories
  { slug: 'category.read', name: 'View Categories', description: 'Allows viewing categories.' },
  { slug: 'category.create', name: 'Create Categories', description: 'Allows creating new categories.' },
  { slug: 'category.update', name: 'Update Categories', description: 'Allows editing categories.' },
  { slug: 'category.delete', name: 'Delete Categories', description: 'Allows deleting categories.' },

  // Tags
  { slug: 'tag.read', name: 'View Tags', description: 'Allows viewing tags.' },
  { slug: 'tag.create', name: 'Create Tags', description: 'Allows creating new tags.' },
  { slug: 'tag.update', name: 'Update Tags', description: 'Allows editing tags.' },
  { slug: 'tag.delete', name: 'Delete Tags', description: 'Allows deleting tags.' },

  // Media
  { slug: 'media.read', name: 'View Media', description: 'Allows viewing media files.' },
  { slug: 'media.create', name: 'Upload Media', description: 'Allows uploading new media files.' },
  { slug: 'media.update', name: 'Update Media Metadata', description: 'Allows editing media metadata.' },
  { slug: 'media.delete', name: 'Delete Media', description: 'Allows deleting media files.' },

  // Comments
  { slug: 'comment.read', name: 'View Comments', description: 'Allows viewing comments.' },
  { slug: 'comment.approve', name: 'Approve Comments', description: 'Allows approving pending comments.' },
  { slug: 'comment.reject', name: 'Reject Comments', description: 'Allows rejecting pending comments.' },
  { slug: 'comment.delete', name: 'Delete Comments', description: 'Allows deleting comments.' },

  // Users
  { slug: 'user.read', name: 'View Users', description: 'Allows viewing user accounts.' },
  { slug: 'user.create', name: 'Create Users', description: 'Allows creating new user accounts.' },
  { slug: 'user.update', name: 'Update Users', description: 'Allows editing user profiles.' },
  { slug: 'user.delete', name: 'Delete Users', description: 'Allows permanently deleting user accounts.' },
  { slug: 'user.suspend', name: 'Suspend Users', description: 'Allows suspending or unsuspending users.' },
  { slug: 'user.verify', name: 'Verify Users', description: 'Allows manually verifying user accounts.' },
  { slug: 'user.force_password_reset', name: 'Force Password Reset', description: 'Allows forcing a password reset for users.' },

  // User Posts
  { slug: 'user_post.read', name: 'View User Posts', description: 'Allows viewing posts owned by users.' },

  // Notifications
  { slug: 'notification.read', name: 'View Notifications', description: 'Allows viewing system notifications.' },
  { slug: 'notification.create', name: 'Create Notifications', description: 'Allows sending system notifications.' },
  { slug: 'notification.delete', name: 'Delete Notifications', description: 'Allows deleting notifications.' },

  // Analytics
  { slug: 'analytics.read', name: 'View Analytics', description: 'Allows viewing analytics dashboards and data.' },

  // Audit Logs
  { slug: 'audit_log.read', name: 'View Audit Logs', description: 'Allows viewing the audit trail.' },

  // Security
  { slug: 'security.read', name: 'View Security Overview', description: 'Allows viewing security events and overview.' },
  { slug: 'security.sessions.read', name: 'View Active Sessions', description: 'Allows viewing active sessions.' },

  // Reports
  { slug: 'report.read', name: 'View Reports', description: 'Allows viewing user reports.' },
  { slug: 'report.resolve', name: 'Resolve Reports', description: 'Allows resolving reports.' },
  { slug: 'report.dismiss', name: 'Dismiss Reports', description: 'Allows dismissing reports.' },

  // Settings
  { slug: 'setting.read', name: 'View Settings', description: 'Allows viewing site settings.' },
  { slug: 'setting.update', name: 'Update Settings', description: 'Allows editing site settings.' },

  // System Health
  { slug: 'system.read', name: 'View System Health', description: 'Allows viewing system health and status.' },

  // RBAC Management (read)
  { slug: 'role.read', name: 'View Roles', description: 'Allows viewing roles.' },
  { slug: 'permission.read', name: 'View Permissions', description: 'Allows viewing permissions.' },

  // RBAC Management (role CRUD)
  { slug: 'role.create', name: 'Create Roles', description: 'Allows creating new roles.' },
  { slug: 'role.update', name: 'Update Roles', description: 'Allows editing non-system roles.' },
  { slug: 'role.delete', name: 'Delete Roles', description: 'Allows soft-deleting non-system roles.' },

  // RBAC Management (role ↔ permission)
  { slug: 'role.permission.read', name: 'View Role Permissions', description: 'Allows viewing permissions assigned to a role.' },
  { slug: 'role.permission.grant', name: 'Grant Permission to Role', description: 'Allows granting a permission to a role.' },
  { slug: 'role.permission.revoke', name: 'Revoke Permission from Role', description: 'Allows revoking a permission from a role.' },
];

// ----------------------------------------------------------------------------
// 2. SEEDER FUNCTION
// ----------------------------------------------------------------------------

/**
 * Seeds the permissions table with the current permission catalog.
 *
 * @param {import('mysql2/promise').Connection} connection - A database connection.
 * @returns {Promise<{ inserted: number, skipped: number }>}
 */
export async function seedPermissions(connection) {
  let inserted = 0;
  let skipped = 0;

  for (const { slug, name, description } of PERMISSIONS) {
    // 1. Check if the permission already exists by slug.
    const [rows] = await connection.query(
      'SELECT id FROM permissions WHERE slug = ? LIMIT 1',
      [slug]
    );

    if (rows.length > 0) {
      // Slug exists – skip without modifying.
      skipped += 1;
      continue;
    }

    // 2. Insert the new permission.
    const uuid = randomUUID();
    await connection.query(
      'INSERT INTO permissions (uuid, name, slug, description) VALUES (?, ?, ?, ?)',
      [uuid, name, slug, description]
    );

    inserted += 1;
  }

  return { inserted, skipped };
}

// ----------------------------------------------------------------------------
// 3. DEFAULT EXPORT
// ----------------------------------------------------------------------------

export default seedPermissions;