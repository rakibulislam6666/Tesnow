/**
 * scripts/migrate.js
 *
 * Tesnow database migration runner.
 *
 * Discovers UP migration files in database/migrations/, validates the full
 * migration set (naming, duplicates, missing rollbacks, readability), verifies
 * the integrity of already-applied migrations via SHA-256 checksum, and then
 * applies any pending migrations in strict numeric order.
 *
 * IMPORTANT MariaDB/MySQL behavior:
 * DDL statements (CREATE TABLE, ALTER TABLE, DROP TABLE, etc.) cause an implicit
 * commit in MariaDB/MySQL. A transaction started by this script CANNOT roll back
 * DDL that has already executed earlier in the same migration if a later
 * statement fails. Transactions are still used here so that any purely-DML
 * portions of a migration benefit from atomicity, but correctness for DDL-heavy
 * migrations depends on migration files being small, sequential, and idempotent
 * (e.g. `CREATE TABLE IF NOT EXISTS`). This script does NOT claim or pretend
 * that DDL execution is fully rollback-safe.
 *
 * This script never prints database passwords or other connection secrets.
 * It uses the project's existing central database configuration exclusively
 * (getDbPool()) and never opens its own connection or duplicates .env loading.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

import { getDbPool } from '../app/config/database.config.js';

// ---------------------------------------------------------------------------
// Constants / paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'database', 'migrations');
const SCHEMA_MIGRATIONS_TABLE = 'schema_migrations';

// Exactly three numeric digits, underscore, a safe lowercase migration name
// (letters/digits/underscores only, starting with a letter), then `.sql`.
// This pattern cannot match `*.down.sql` files because the name segment does
// not permit a literal dot.
const UP_MIGRATION_PATTERN = /^(\d{3})_([a-z][a-z0-9_]*)\.sql$/;

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class MigrationError extends Error {
  constructor(migrationFilename, statementNumber, message) {
    super(
      statementNumber
        ? `Migration "${migrationFilename}" failed at statement #${statementNumber}: ${message}`
        : `Migration "${migrationFilename}" failed: ${message}`
    );
    this.name = 'MigrationError';
    this.migrationFilename = migrationFilename;
    this.statementNumber = statementNumber ?? null;
  }
}

export class MigrationIntegrityError extends Error {
  constructor(migrationFilename, appliedChecksum, currentChecksum) {
    super(
      [
        'MIGRATION INTEGRITY ERROR',
        '',
        'Migration:',
        migrationFilename,
        '',
        'This migration was already applied but its file contents have changed.',
        '',
        'Applied checksum:',
        appliedChecksum,
        '',
        'Current checksum:',
        currentChecksum,
        '',
        'Restore the original migration file or create a new migration.',
        'Do NOT edit an already-applied migration.',
      ].join('\n')
    );
    this.name = 'MigrationIntegrityError';
    this.migrationFilename = migrationFilename;
    this.appliedChecksum = appliedChecksum;
    this.currentChecksum = currentChecksum;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strips likely-sensitive substrings (password=..., secret=..., token=...)
 * out of an error message before it is ever logged. Defense-in-depth: normal
 * SQL/driver errors from this script should never contain credentials, but we
 * never want to take that on faith.
 */
function sanitizeError(err) {
  const raw = (err && (err.sqlMessage || err.message)) || String(err);
  return raw.replace(/(password|pwd|secret|token)\s*=\s*['"]?[^'"\s]+['"]?/gi, '$1=[REDACTED]');
}

/**
 * Best-effort database name for display purposes only. Never reads or prints
 * a password/secret. Falls back gracefully since mysql2 does not expose a
 * stable public API for introspecting pool connection options.
 */
function getDatabaseNameForDisplay() {
  const fromEnv =
    process.env.DB_NAME ||
    process.env.DB_DATABASE ||
    process.env.DATABASE_NAME ||
    process.env.MYSQL_DATABASE;

  if (fromEnv) return fromEnv;
  return '(see app/config/database.config.js)';
}

// ---------------------------------------------------------------------------
// SQL statement splitter
// ---------------------------------------------------------------------------

/**
 * Safely splits a SQL file's contents into individual statements.
 *
 * Correctly tracks state across:
 *   - single-quoted strings ('...') including backslash escapes and doubled '' escapes
 *   - double-quoted strings ("...") including backslash escapes and doubled "" escapes
 *   - backtick-quoted identifiers (`...`) including doubled `` escapes
 *   - `-- line comments`
 *   - `# line comments`
 *   - `/* block comments *\/`
 *
 * Semicolons inside any of the above are never treated as statement
 * terminators. This function deliberately does NOT use `sql.split(';')`.
 *
 * @param {string} sql
 * @returns {string[]} non-empty, trimmed SQL statements, in order
 */
export function splitSqlStatements(sql) {
  const STATE = Object.freeze({
    NONE: 0,
    SINGLE_QUOTE: 1,
    DOUBLE_QUOTE: 2,
    BACKTICK: 3,
    LINE_COMMENT: 4,
    BLOCK_COMMENT: 5,
  });

  let state = STATE.NONE;
  let current = '';
  const statements = [];

  const len = sql.length;
  let i = 0;

  while (i < len) {
    const ch = sql[i];
    const next = i + 1 < len ? sql[i + 1] : '';

    switch (state) {
      case STATE.NONE: {
        if (ch === "'") {
          state = STATE.SINGLE_QUOTE;
          current += ch;
          i += 1;
          continue;
        }
        if (ch === '"') {
          state = STATE.DOUBLE_QUOTE;
          current += ch;
          i += 1;
          continue;
        }
        if (ch === '`') {
          state = STATE.BACKTICK;
          current += ch;
          i += 1;
          continue;
        }
        if (ch === '-' && next === '-') {
          state = STATE.LINE_COMMENT;
          i += 2;
          continue;
        }
        if (ch === '#') {
          state = STATE.LINE_COMMENT;
          i += 1;
          continue;
        }
        if (ch === '/' && next === '*') {
          state = STATE.BLOCK_COMMENT;
          i += 2;
          continue;
        }
        if (ch === ';') {
          statements.push(current);
          current = '';
          i += 1;
          continue;
        }
        current += ch;
        i += 1;
        continue;
      }

      case STATE.SINGLE_QUOTE: {
        if (ch === '\\' && next !== '') {
          current += ch + next;
          i += 2;
          continue;
        }
        if (ch === "'" && next === "'") {
          current += "''";
          i += 2;
          continue;
        }
        if (ch === "'") {
          state = STATE.NONE;
          current += ch;
          i += 1;
          continue;
        }
        current += ch;
        i += 1;
        continue;
      }

      case STATE.DOUBLE_QUOTE: {
        if (ch === '\\' && next !== '') {
          current += ch + next;
          i += 2;
          continue;
        }
        if (ch === '"' && next === '"') {
          current += '""';
          i += 2;
          continue;
        }
        if (ch === '"') {
          state = STATE.NONE;
          current += ch;
          i += 1;
          continue;
        }
        current += ch;
        i += 1;
        continue;
      }

      case STATE.BACKTICK: {
        if (ch === '`' && next === '`') {
          current += '``';
          i += 2;
          continue;
        }
        if (ch === '`') {
          state = STATE.NONE;
          current += ch;
          i += 1;
          continue;
        }
        current += ch;
        i += 1;
        continue;
      }

      case STATE.LINE_COMMENT: {
        if (ch === '\n') {
          state = STATE.NONE;
          current += ch;
        }
        i += 1;
        continue;
      }

      case STATE.BLOCK_COMMENT: {
        if (ch === '*' && next === '/') {
          state = STATE.NONE;
          i += 2;
          continue;
        }
        i += 1;
        continue;
      }

      default: {
        i += 1;
      }
    }
  }

  if (state === STATE.SINGLE_QUOTE || state === STATE.DOUBLE_QUOTE || state === STATE.BACKTICK) {
    throw new Error('Unterminated string or identifier literal in SQL file');
  }
  if (state === STATE.BLOCK_COMMENT) {
    throw new Error('Unterminated block comment in SQL file');
  }

  if (current.trim().length > 0) {
    statements.push(current);
  }

  return statements.map((s) => s.trim()).filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// Checksums
// ---------------------------------------------------------------------------

/**
 * Calculates the SHA-256 checksum (hex-encoded) of the exact file contents.
 * @param {string} content
 * @returns {string}
 */
export function calculateChecksum(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/**
 * Discovers UP migration files (`NNN_name.sql`) in the migrations directory.
 * `.down.sql` files are never treated as UP migrations. Performs basic
 * path-traversal and symlink-target checks so every migration resolves to a
 * real file inside the migrations directory.
 *
 * @param {string} [migrationsDir]
 * @returns {Promise<{migrations: object[], invalid: {file:string, reason:string}[]}>}
 */
export async function discoverMigrations(migrationsDir = MIGRATIONS_DIR) {
  const resolvedDir = path.resolve(migrationsDir);
  const invalid = [];
  const migrations = [];

  let entries;
  try {
    entries = await readdir(resolvedDir, { withFileTypes: true });
  } catch (err) {
    throw new Error(`Unable to read migrations directory "${resolvedDir}": ${sanitizeError(err)}`);
  }

  for (const entry of entries) {
    const name = entry.name;

    // Never treat rollback files as UP migrations.
    if (name.endsWith('.down.sql')) continue;
    if (!name.endsWith('.sql')) continue;

    const match = UP_MIGRATION_PATTERN.exec(name);
    if (!match) {
      invalid.push({ file: name, reason: 'Filename does not match required pattern NNN_name.sql' });
      continue;
    }

    const resolvedPath = path.resolve(resolvedDir, name);

    // Defense-in-depth: reject anything that would resolve outside the
    // migrations directory (should not be reachable via a plain readdir
    // basename, but we verify anyway).
    if (path.dirname(resolvedPath) !== resolvedDir) {
      invalid.push({ file: name, reason: 'Resolved path escapes the migrations directory' });
      continue;
    }

    try {
      const stats = await lstat(resolvedPath);
      if (stats.isSymbolicLink()) {
        const real = await realpath(resolvedPath);
        if (path.dirname(real) !== resolvedDir) {
          invalid.push({ file: name, reason: 'Symlink target escapes the migrations directory' });
          continue;
        }
      } else if (!stats.isFile()) {
        invalid.push({ file: name, reason: 'Not a regular file' });
        continue;
      }
    } catch (err) {
      invalid.push({ file: name, reason: `Unable to stat file: ${sanitizeError(err)}` });
      continue;
    }

    const downFilename = name.replace(/\.sql$/, '.down.sql');

    migrations.push({
      number: match[1],
      name: match[2],
      filename: name,
      filePath: resolvedPath,
      downFilename,
      downPath: path.resolve(resolvedDir, downFilename),
    });
  }

  migrations.sort((a, b) => (a.number < b.number ? -1 : a.number > b.number ? 1 : 0));

  return { migrations, invalid };
}

// ---------------------------------------------------------------------------
// Preflight validation
// ---------------------------------------------------------------------------

/**
 * Validates a discovered migration set before anything is applied:
 *   - invalid filenames (from discovery)
 *   - duplicate migration numbers
 *   - missing `.down.sql` rollback files
 *   - unreadable migration/rollback files
 *   - invalid ordering
 *
 * @param {{migrations: object[], invalid: object[]}} discovered
 * @returns {Promise<{valid: boolean, errors: string[]}>}
 */
export async function validateMigrationSet(discovered) {
  const { migrations, invalid } = discovered;
  const errors = invalid.map((i) => `${i.file}: ${i.reason}`);

  const seenNumbers = new Map();
  for (const migration of migrations) {
    if (seenNumbers.has(migration.number)) {
      errors.push(
        `Duplicate migration number "${migration.number}": "${seenNumbers.get(migration.number)}" and "${migration.filename}"`
      );
    } else {
      seenNumbers.set(migration.number, migration.filename);
    }
  }

  for (let i = 1; i < migrations.length; i++) {
    if (migrations[i].number < migrations[i - 1].number) {
      errors.push(
        `Invalid migration ordering between "${migrations[i - 1].filename}" and "${migrations[i].filename}"`
      );
    }
  }

  for (const migration of migrations) {
    try {
      await readFile(migration.filePath);
    } catch (err) {
      errors.push(`Migration "${migration.filename}" is not readable: ${sanitizeError(err)}`);
      continue;
    }

    try {
      await readFile(migration.downPath);
    } catch {
      errors.push(`Missing rollback file for "${migration.filename}": expected "${migration.downFilename}"`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Database state
// ---------------------------------------------------------------------------

/**
 * Creates the schema_migrations metadata table if it does not already exist.
 * Uses the caller-provided pool; never opens a separate connection.
 */
async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA_MIGRATIONS_TABLE} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      migration VARCHAR(255) NOT NULL,
      checksum CHAR(64) NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_schema_migrations_migration (migration),
      INDEX idx_schema_migrations_applied_at (applied_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

/**
 * Returns a Map of migration filename -> stored checksum for every migration
 * already recorded in schema_migrations. Ensures the table exists first.
 *
 * @param {import('mysql2/promise').Pool} pool
 * @returns {Promise<Map<string, string>>}
 */
export async function getAppliedMigrations(pool) {
  await ensureMigrationsTable(pool);

  const [rows] = await pool.query(`SELECT migration, checksum FROM ${SCHEMA_MIGRATIONS_TABLE}`);

  const applied = new Map();
  for (const row of rows) {
    applied.set(row.migration, row.checksum);
  }
  return applied;
}

/**
 * Verifies that every already-applied migration's current file checksum
 * still matches what was recorded at apply time. Throws MigrationIntegrityError
 * and stops on the first mismatch found, per migration in numeric order.
 *
 * @param {object[]} migrations
 * @param {Map<string, string>} applied
 */
async function verifyAppliedChecksums(migrations, applied) {
  for (const migration of migrations) {
    const appliedChecksum = applied.get(migration.filename);
    if (!appliedChecksum) continue;

    const content = await readFile(migration.filePath, 'utf8');
    const currentChecksum = calculateChecksum(content);

    if (currentChecksum !== appliedChecksum) {
      throw new MigrationIntegrityError(migration.filename, appliedChecksum, currentChecksum);
    }
  }
}

// ---------------------------------------------------------------------------
// Migration execution
// ---------------------------------------------------------------------------

/**
 * Applies a single migration that is not yet recorded in schema_migrations.
 * Reads the file, computes its checksum, splits it into statements, executes
 * them sequentially, and records the migration as applied.
 *
 * NOTE: because DDL causes an implicit commit in MariaDB/MySQL, the
 * transaction started here cannot guarantee rollback of DDL statements that
 * already executed earlier in this same migration if a later statement
 * fails. See the file header for details.
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {object} migration - entry from discoverMigrations()
 * @returns {Promise<{migration: string, status: 'applied', checksum: string}>}
 */
export async function applyMigration(pool, migration) {
  let content;
  try {
    content = await readFile(migration.filePath, 'utf8');
  } catch (err) {
    throw new MigrationError(migration.filename, null, `Unable to read migration file: ${sanitizeError(err)}`);
  }

  const checksum = calculateChecksum(content);

  let statements;
  try {
    statements = splitSqlStatements(content);
  } catch (err) {
    throw new MigrationError(migration.filename, null, `Failed to parse SQL: ${sanitizeError(err)}`);
  }

  if (statements.length === 0) {
    throw new MigrationError(migration.filename, null, 'Migration file contains no executable statements');
  }

  const connection = await pool.getConnection();

  try {
    // Transaction covers this migration's statements on a best-effort basis.
    // Any DDL among them implicitly commits and cannot be undone by rollback().
    await connection.beginTransaction();

    for (let idx = 0; idx < statements.length; idx++) {
      const statement = statements[idx];
      try {
        await connection.query(statement);
      } catch (err) {
        try {
          await connection.rollback();
        } catch {
          // Best-effort only: prior DDL in this loop may already be
          // implicitly committed and cannot be rolled back at this point.
        }
        throw new MigrationError(migration.filename, idx + 1, sanitizeError(err));
      }
    }

    try {
      await connection.query(`INSERT INTO ${SCHEMA_MIGRATIONS_TABLE} (migration, checksum) VALUES (?, ?)`, [
        migration.filename,
        checksum,
      ]);
    } catch (err) {
      try {
        await connection.rollback();
      } catch {
        // best-effort, see note above
      }
      if (err && err.code === 'ER_DUP_ENTRY') {
        throw new MigrationError(
          migration.filename,
          null,
          'Migration was already recorded as applied (possible concurrent migration run)'
        );
      }
      throw new MigrationError(migration.filename, null, `Failed to record migration: ${sanitizeError(err)}`);
    }

    await connection.commit();

    return { migration: migration.filename, status: 'applied', checksum };
  } finally {
    connection.release();
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Runs the full migration flow: preflight validation, integrity verification
 * of already-applied migrations, and sequential application of pending
 * migrations in numeric order. Stops immediately on the first failure.
 *
 * @param {object} [options]
 * @param {import('mysql2/promise').Pool} [options.pool] - defaults to getDbPool()
 * @param {string} [options.migrationsDir] - defaults to database/migrations/
 * @param {Console} [options.logger] - defaults to console
 * @returns {Promise<{migration: string, status: string, checksum: string}[]>}
 */
export async function runMigrations({ pool: providedPool, migrationsDir = MIGRATIONS_DIR, logger = console } = {}) {
  const pool = providedPool ?? getDbPool();

  const discovered = await discoverMigrations(migrationsDir);
  const { valid, errors } = await validateMigrationSet(discovered);

  if (!valid) {
    throw new Error(['Migration preflight validation failed:', ...errors.map((e) => `  - ${e}`)].join('\n'));
  }

  const applied = await getAppliedMigrations(pool);

  // Stop immediately if any already-applied migration's file has changed.
  await verifyAppliedChecksums(discovered.migrations, applied);

  const pending = discovered.migrations.filter((m) => !applied.has(m.filename));

  logger.log('Tesnow Database Migration');
  logger.log('─'.repeat(28));
  logger.log(`Database: ${getDatabaseNameForDisplay()}`);
  logger.log(`Pending migrations: ${pending.length}`);
  logger.log('');

  if (pending.length === 0) {
    logger.log('No pending migrations.');
    logger.log('Database is up to date.');
    return [];
  }

  const results = [];

  for (let i = 0; i < pending.length; i++) {
    const migration = pending[i];
    logger.log(`[${i + 1}/${pending.length}] ${migration.filename}`);

    try {
      // eslint-disable-next-line no-await-in-loop -- migrations must run sequentially, in order
      const result = await applyMigration(pool, migration);
      results.push(result);
      logger.log('      ✓ applied');
    } catch (err) {
      logger.log('      ✗ failed');
      logger.log('');
      logger.error(err.message);
      throw err;
    }
  }

  logger.log('');
  logger.log(`All ${results.length} pending migration(s) applied successfully.`);

  return results;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
  let pool;
  let shuttingDown = false;

  const handleSignal = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\nReceived ${signal}. Finishing current operation and exiting...`);
    process.exitCode = 130;
  };

  process.once('SIGINT', () => handleSignal('SIGINT'));
  process.once('SIGTERM', () => handleSignal('SIGTERM'));

  try {
    pool = getDbPool();
    await runMigrations({ pool });
    if (!shuttingDown) {
      process.exitCode = 0;
    }
  } catch (err) {
    process.exitCode = 1;
  }
}

const isDirectlyExecuted = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isDirectlyExecuted) {
  main();
}
