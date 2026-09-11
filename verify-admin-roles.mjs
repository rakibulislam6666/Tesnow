import { getDbPool } from './app/config/database.config.js';

try {
  const pool = getDbPool();

  const [tables] = await pool.query(
    "SHOW TABLES LIKE 'admin_roles'"
  );

  if (tables.length === 0) {
    console.log('ADMIN_ROLES: NOT FOUND');
    await pool.end();
    process.exit(1);
  }

  console.log('ADMIN_ROLES: EXISTS');

  const [create] = await pool.query(
    'SHOW CREATE TABLE admin_roles'
  );

  console.log('\n===== SHOW CREATE TABLE =====');
  console.log(create[0]['Create Table']);

  const [indexes] = await pool.query(
    'SHOW INDEX FROM admin_roles'
  );

  console.log('\n===== SHOW INDEX =====');

  for (const index of indexes) {
    console.log(
      'Key:', index.Key_name,
      '| Column:', index.Column_name,
      '| Non_unique:', index.Non_unique,
      '| Seq:', index.Seq_in_index
    );
  }

  await pool.end();

  console.log('\nVERIFICATION: COMPLETE');
} catch (error) {
  console.error('\nVERIFICATION: FAILED');
  console.error(error);
  process.exit(1);
}
