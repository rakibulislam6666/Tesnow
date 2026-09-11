/**
 * scripts/seed.js
 * Tesnow database seed runner – orchestrates the RBAC seeders inside a single transaction.
 *
 * Execution order:
 *   1. permissions.seeder.js
 *   2. roles.seeder.js
 *   3. role_permissions.seeder.js
 *   4. admin_roles.seeder.js
 *
 * If any seeder fails, the entire transaction is rolled back.
 */

import { getDbPool } from '../app/config/database.config.js';
import seedPermissions from '../database/seeders/permissions.seeder.js';
import seedRoles from '../database/seeders/roles.seeder.js';
import seedRolePermissions from '../database/seeders/role_permissions.seeder.js';
import seedAdminRoles from '../database/seeders/admin_roles.seeder.js';

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main() {
  let pool;
  let connection;

  try {
    // 1. Acquire pool and connection
    pool = getDbPool();
    connection = await pool.getConnection();

    // 2. Begin transaction
    await connection.beginTransaction();

    console.log('Tesnow Database Seeder');
    console.log('──────────────────────');

    // 3. Run seeders in order
    const permResult = await seedPermissions(connection);
    console.log(`Permissions: inserted ${permResult.inserted}, skipped ${permResult.skipped}`);

    const roleResult = await seedRoles(connection);
    console.log(`Roles: inserted ${roleResult.inserted}, skipped ${roleResult.skipped}`);

    const rpResult = await seedRolePermissions(connection);
    console.log(`Role Permissions: inserted ${rpResult.inserted}, skipped ${rpResult.skipped}`);

    const arResult = await seedAdminRoles(connection);
    console.log(`Admin Roles: inserted ${arResult.inserted}, skipped ${arResult.skipped}`);

    // 4. Commit transaction
    await connection.commit();

    console.log('──────────────────────');
    console.log('Seed completed successfully.');
  } catch (error) {
    // 5. Rollback transaction if it was started
    if (connection) {
      try {
        await connection.rollback();
      } catch (_) {
        // Rollback failure – not much we can do; original error is more important.
      }
    }

    // 6. Report failure and set exit code
    console.error('──────────────────────');
    console.error('Seed failed:');
    console.error(error.message);
    // Preserve the original error stack if available (in development)
    if (error.stack) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  } finally {
    // 7. Always release the connection and close the pool
    if (connection) {
      try {
        connection.release();
      } catch (_) {
        // Ignore release errors
      }
    }
    if (pool) {
      try {
        await pool.end();
      } catch (_) {
        // Ignore pool end errors
      }
    }
  }
}

// ----------------------------------------------------------------------------
// Execute
// ----------------------------------------------------------------------------

main();