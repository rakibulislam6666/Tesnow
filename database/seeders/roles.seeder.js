/**
 * database/seeders/roles.seeder.js
 * Seeds the approved current role catalog (8 roles) into the roles table.
 *
 * This seeder is idempotent – it checks each role by `slug` and inserts only missing ones.
 *
 * @param {import('mysql2/promise').Connection} connection - A database connection supplied by the seed runner.
 * @returns {Promise<{ inserted: number, skipped: number }>}
 */

import { randomUUID } from 'node:crypto';

// ----------------------------------------------------------------------------
// 1. AUTHORITATIVE CURRENT ROLE CATALOG
// ----------------------------------------------------------------------------

const ROLES = [
  {
    slug: 'super_admin',
    name: 'Super Administrator',
    description: 'Full system control – has all current permissions. System role.',
    isSystemRole: true,
  },
  {
    slug: 'content_manager',
    name: 'Content Manager',
    description: 'Manages posts, categories, tags, media, and comments.',
    isSystemRole: false,
  },
  {
    slug: 'user_manager',
    name: 'User Manager',
    description: 'Manages user accounts, user posts, and notifications.',
    isSystemRole: false,
  },
  {
    slug: 'moderator',
    name: 'Moderator',
    description: 'Moderates comments and handles user reports.',
    isSystemRole: false,
  },
  {
    slug: 'analytics_viewer',
    name: 'Analytics Viewer',
    description: 'Views analytics dashboards, system health, and basic operational context (read-only).',
    isSystemRole: false,
  },
  {
    slug: 'settings_manager',
    name: 'Settings Manager',
    description: 'Manages site settings.',
    isSystemRole: false,
  },
  {
    slug: 'viewer',
    name: 'Viewer',
    description: 'Read‑only access to operational content (posts, categories, tags, media, comments).',
    isSystemRole: false,
  },
  {
    slug: 'auditor',
    name: 'Auditor',
    description: 'Read‑only access to audit logs, security events, and active sessions.',
    isSystemRole: false,
  },
];

// ----------------------------------------------------------------------------
// 2. SEEDER FUNCTION
// ----------------------------------------------------------------------------

/**
 * Seeds the roles table with the current role catalog.
 *
 * @param {import('mysql2/promise').Connection} connection - A database connection.
 * @returns {Promise<{ inserted: number, skipped: number }>}
 */
export async function seedRoles(connection) {
  let inserted = 0;
  let skipped = 0;

  for (const { slug, name, description, isSystemRole } of ROLES) {
    // 1. Check if the role already exists by slug.
    const [rows] = await connection.query(
      'SELECT id FROM roles WHERE slug = ? LIMIT 1',
      [slug]
    );

    if (rows.length > 0) {
      // Slug exists – skip without modifying.
      skipped += 1;
      continue;
    }

    // 2. Insert the new role.
    const uuid = randomUUID();
    await connection.query(
      `INSERT INTO roles (uuid, name, slug, description, is_system_role)
       VALUES (?, ?, ?, ?, ?)`,
      [uuid, name, slug, description, isSystemRole]
    );

    inserted += 1;
  }

  return { inserted, skipped };
}

// ----------------------------------------------------------------------------
// 3. DEFAULT EXPORT
// ----------------------------------------------------------------------------

export default seedRoles;