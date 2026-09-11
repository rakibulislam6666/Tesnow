/**
 * scripts/rollback.js
 *
 * Tesnow database rollback runner.
 *
 * Safely rolls back the latest applied migration (or an explicitly named
 * migration, provided it is the latest applied one) by executing its
 * matching `.down.sql` file, then removing its row from `schema_migrations`.
 *
 * Design goals: fail-closed, no destructive automatic recovery, no secret
 * leakage, deterministic ordering, parameterized SQL only, and an explicit,
 * exact human confirmation step before anything destructive happens.
 *
 * IMPORTANT MariaDB/MySQL behavior:
 * DDL statements (DROP TABLE, ALTER TABLE, CREATE TABLE, etc.) cause an
 * implicit commit in MariaDB/MySQL. A transaction started by this script
 * CANNOT roll back DDL that has already executed earlier in the same DOWN
 * migration if a later statement in that same file fails. Transactions are
 * still used so that any purely-DML portions benefit from atomicity, but this
 * script does NOT claim, and must never claim, that DDL execution here is
 * fully rollback-safe. If a DOWN migration partially executes and then fails,
 * the database may be left in a partially-rolled-back state that requires
 * manual inspection — this is reported clearly rather than hidden.
 *
 * This script never prints database credentials, ".env" contents, or other
 * secrets. It uses the project's existing central database configuration
 * exclusively (getDbPool()) and never opens a duplicate connection config.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';

import { getDbPool } from '../app/config/database.config.js';

// ---------------------------------------------------------------------------
// Constants / paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'database', 'migrations');
const SCHEMA_MIGRATIONS_TABLE = 'schema_migrations';
const REQUIRED_SCHEMA_MIGRATIONS_COLUMNS = ['migration', 'checksum', 'applied_at'];

const ADVISORY_LOCK_NAME = 'tesnow_database_migrations';
const ADVISORY_LOCK_TIMEOUT_SECONDS = 30;

// Exactly three numeric digits, underscore, a safe lowercase migration name
// (letters/digits/underscores only, starting with a letter), then `.sql`.
// This pattern cannot match `*.down.sql` files because the name segment does
// not permit a literal dot.
const UP_MIGRATION_PATTERN = /^(\d{3})_([a-z][a-z0-9_]*)\.sql$/;

// Accepted CLI target argument: a bare migration name, optionally with `.sql`.
const CLI_TARGET_PATTERN = /^\d{3}_[a-z][a-z0-9_]*(\.sql)?$/;

const EXACT_CONFIRMATION_TEXT = 'CONFIRM';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/** Base class for all rollback-related errors. */
export class RollbackError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RollbackError';
  }
}

/** Thrown when preflight validation of the migration set or CLI usage fails. */
export class RollbackValidationError extends RollbackError {
  constructor(message) {
    super(message);
    this.name = 'RollbackValidationError';
  }
}

/** Thrown when an already-applied migration's file contents no longer match its stored checksum. */
export class RollbackIntegrityError extends RollbackError {
  constructor(migrationFilename, appliedChecksum, currentChecksum) {
    super(
      [
        'ROLLBACK INTEGRITY ERROR',
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
        'Restore the original migration file before rolling back, or resolve this',
        'discrepancy manually. Refusing to roll back an altered migration.',
      ].join('\n')
    );
    this.name = 'RollbackIntegrityError';
    this.migrationFilename = migrationFilename;
    this.appliedChecksum = appliedChecksum;
    this.currentChecksum = currentChecksum;
  }
}

/** Thrown when the advisory lock cannot be acquired (likely a concurrent migrate/rollback run). */
export class RollbackLockError extends RollbackError {
  constructor(message) {
    super(message);
    this.name = 'RollbackLockError';
  }
}

/** Thrown when schema_migrations exists but does not match the expected column schema. */
export class SchemaCompatibilityError extends RollbackError {
  constructor(message) {
    super(message);
    this.name = 'SchemaCompatibilityError';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strips likely-sensitive substrings (password=..., secret=..., token=...)
 * out of an error message before it is ever logged or embedded in a thrown
 * error. Defense-in-depth: normal SQL/driver errors should never contain
 * credentials, but we never take that on faith.
 */
function sanitizeError(err) {
  const raw = (err && (err.sqlMessage || err.message)) || String(err);
  return raw.replace(/(password|pwd|secret|token)\s*=\s*['"]?[^'"\s]+['"]?/gi, '$1=[REDACTED]');
}

/**
 * Best-effort database name for display purposes only. Never reads or prints
 * a password/secret, and never reads or prints ".env" itself.
 */
function getDatabaseNameForDisplay() {
  const fromEnv =
    process.env.DB_NAME ||
    process.env.DB_DATABASE ||
    process.env.DATABASE_NAME ||
    process.env.MYSQL_DATABASE;

  return fromEnv || '(see app/config/database.config.js)';
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
 * terminators. Unterminated strings/identifiers/comments are detected and
 * rejected. This function deliberately does NOT use `sql.split(';')`.
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

  if (state === STATE.SINGLE_QUOTE) {
    throw new Error('Unterminated single-quoted string in SQL file');
  }
  if (state === STATE.DOUBLE_QUOTE) {
    throw new Error('Unterminated double-quoted string in SQL file');
  }
  if (state === STATE.BACKTICK) {
    throw new Error('Unterminated backtick-quoted identifier in SQL file');
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
 * `.down.sql` files are never treated as UP migrations. Performs
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
    throw new RollbackValidationError(
      `Migration directory does not exist or is not readable: "${resolvedDir}" (${sanitizeError(err)})`
    );
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
    // migrations directory.
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
    const downPath = path.resolve(resolvedDir, downFilename);

    if (path.dirname(downPath) !== resolvedDir) {
      invalid.push({ file: name, reason: 'Resolved rollback path escapes the migrations directory' });
      continue;
    }

    migrations.push({
      number: match[1],
      name: match[2],
      filename: name,
      filePath: resolvedPath,
      downFilename,
      downPath,
    });
  }

  migrations.sort((a, b) => (a.number < b.number ? -1 : a.number > b.number ? 1 : 0));

  return { migrations, invalid };
}

// ---------------------------------------------------------------------------
// Preflight validation
// ---------------------------------------------------------------------------

/**
 * Validates a discovered migration set before anything is executed:
 *   - invalid filenames (from discovery)
 *   - duplicate migration numbers
 *   - invalid/non-monotonic ordering
 *   - missing `.down.sql` rollback files
 *   - unreadable UP/DOWN files
 *   - empty UP/DOWN files
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
    let upContent;
    try {
      upContent = await readFile(migration.filePath, 'utf8');
    } catch (err) {
      errors.push(`Migration "${migration.filename}" is not readable: ${sanitizeError(err)}`);
      upContent = null;
    }
    if (upContent !== null && upContent.trim().length === 0) {
      errors.push(`Migration "${migration.filename}" is empty`);
    }

    let downContent;
    try {
      downContent = await readFile(migration.downPath, 'utf8');
    } catch {
      errors.push(`Missing rollback file for "${migration.filename}": expected "${migration.downFilename}"`);
      downContent = null;
    }
    if (downContent !== null && downContent.trim().length === 0) {
      errors.push(`Rollback file "${migration.downFilename}" is empty`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// schema_migrations inspection
// ---------------------------------------------------------------------------

/**
 * Inspects the schema_migrations table (if any) and reports whether its
 * column set is compatible with what this rollback system expects. Never
 * creates, alters, or drops the table.
 *
 * @param {import('mysql2/promise').Pool} pool
 * @returns {Promise<{exists: boolean, compatible: boolean, columns: string[], missing?: string[]}>}
 */
export async function inspectSchemaMigrationsTable(pool) {
  let tableRows;
  try {
    [tableRows] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
      [SCHEMA_MIGRATIONS_TABLE]
    );
  } catch (err) {
    throw new RollbackError(`Unable to inspect database schema: ${sanitizeError(err)}`);
  }

  const exists = Number(tableRows[0].cnt) > 0;
  if (!exists) {
    return { exists: false, compatible: false, columns: [] };
  }

  let columnRows;
  try {
    [columnRows] = await pool.query(
      'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
      [SCHEMA_MIGRATIONS_TABLE]
    );
  } catch (err) {
    throw new RollbackError(`Unable to inspect "${SCHEMA_MIGRATIONS_TABLE}" columns: ${sanitizeError(err)}`);
  }

  const columns = columnRows.map((row) => row.COLUMN_NAME);
  const missing = REQUIRED_SCHEMA_MIGRATIONS_COLUMNS.filter((col) => !columns.includes(col));

  return { exists: true, compatible: missing.length === 0, columns, missing };
}

function buildSchemaCompatibilityMessage(schemaInfo) {
  return [
    `The "${SCHEMA_MIGRATIONS_TABLE}" table exists but does not match the schema this rollback`,
    'system expects. Refusing to modify or recreate it automatically, since that could',
    'destroy migration history.',
    '',
    `Expected columns: ${REQUIRED_SCHEMA_MIGRATIONS_COLUMNS.join(', ')}`,
    `Found columns:    ${schemaInfo.columns.join(', ') || '(none)'}`,
    `Missing columns:  ${schemaInfo.missing.join(', ')}`,
    '',
    'This looks like a legacy or incompatible migration-tracking schema (for example, one',
    'using columns such as "migration_name", "batch", "execution_time_ms", or "executed_at"',
    'instead of "migration" / "checksum" / "applied_at").',
    '',
    'Recommended fix: write a one-time, manually-reviewed compatibility migration that maps',
    'the legacy columns onto the expected schema, or export the legacy history and reconcile',
    `it with "${SCHEMA_MIGRATIONS_TABLE}" by hand before using this rollback system.`,
  ].join('\n');
}

/**
 * Returns a Map of migration filename -> { checksum, appliedAt } for every
 * migration currently recorded in schema_migrations. Assumes the table has
 * already been confirmed to exist and be compatible.
 *
 * @param {import('mysql2/promise').Pool} pool
 * @returns {Promise<Map<string, {checksum: string, appliedAt: Date}>>}
 */
export async function getAppliedMigrations(pool) {
  let rows;
  try {
    [rows] = await pool.query(`SELECT migration, checksum, applied_at FROM ${SCHEMA_MIGRATIONS_TABLE}`);
  } catch (err) {
    throw new RollbackError(`Unable to read applied migration metadata: ${sanitizeError(err)}`);
  }

  const applied = new Map();
  for (const row of rows) {
    applied.set(row.migration, { checksum: row.checksum, appliedAt: row.applied_at });
  }
  return applied;
}

/**
 * Verifies that every already-applied migration's current UP file checksum
 * still matches what was recorded at apply time. Throws RollbackIntegrityError
 * on the first mismatch found (in numeric order) and stops before any SQL runs.
 *
 * @param {object[]} migrations
 * @param {Map<string, {checksum: string, appliedAt: Date}>} appliedMap
 */
export async function verifyAppliedChecksums(migrations, appliedMap) {
  for (const migration of migrations) {
    const record = appliedMap.get(migration.filename);
    if (!record) continue;

    let content;
    try {
      content = await readFile(migration.filePath, 'utf8');
    } catch (err) {
      throw new RollbackError(
        `Unable to read "${migration.filename}" to verify its checksum: ${sanitizeError(err)}`
      );
    }

    const currentChecksum = calculateChecksum(content);
    if (currentChecksum !== record.checksum) {
      throw new RollbackIntegrityError(migration.filename, record.checksum, currentChecksum);
    }
  }
}

// ---------------------------------------------------------------------------
// Target resolution
// ---------------------------------------------------------------------------

/**
 * Determines which migration should be rolled back.
 *
 * With no requested name, returns the latest applied migration. With a
 * requested name, the target must exist on disk, be currently applied, and
 * be the latest applied migration — rolling back an arbitrary "middle"
 * migration while later migrations remain applied is never permitted.
 *
 * @param {object[]} migrations - discovered UP migrations
 * @param {Map<string, {checksum: string, appliedAt: Date}>} appliedMap
 * @param {string|null} requestedArg - raw CLI argument, or null for "latest"
 * @returns {object} the migration entry to roll back
 */
export function resolveRollbackTarget(migrations, appliedMap, requestedArg) {
  const appliedMigrations = migrations
    .filter((m) => appliedMap.has(m.filename))
    .sort((a, b) => (a.number < b.number ? -1 : a.number > b.number ? 1 : 0));

  if (appliedMigrations.length === 0) {
    throw new RollbackValidationError('No applied migrations found. Nothing to roll back.');
  }

  const latest = appliedMigrations[appliedMigrations.length - 1];

  if (!requestedArg) {
    return latest;
  }

  const normalizedName = requestedArg.endsWith('.sql') ? requestedArg : `${requestedArg}.sql`;
  const target = migrations.find((m) => m.filename === normalizedName);

  if (!target) {
    throw new RollbackValidationError(
      `Migration "${requestedArg}" was not found in database/migrations/. ` +
        'Provide a valid migration name such as "024_create_feature_flags".'
    );
  }

  if (!appliedMap.has(target.filename)) {
    throw new RollbackValidationError(
      `Migration "${target.filename}" is not currently applied. Nothing to roll back.`
    );
  }

  if (target.filename !== latest.filename) {
    const mustRollBackFirst = appliedMigrations
      .filter((m) => m.number > target.number)
      .map((m) => m.filename)
      .reverse();

    throw new RollbackValidationError(
      [
        `Cannot roll back "${target.filename}" directly: it is not the latest applied migration.`,
        'The following migration(s) must be rolled back first, in this order:',
        ...mustRollBackFirst.map((f) => `  - ${f}`),
        '',
        'Run "node scripts/rollback.js" repeatedly, or target each one explicitly,',
        'to roll them back sequentially before rolling back an earlier migration.',
      ].join('\n')
    );
  }

  return target;
}

// ---------------------------------------------------------------------------
// Rollback execution
// ---------------------------------------------------------------------------

/**
 * Rolls back a single migration on an already-connected, lock-holding
 * database connection: reads and validates the DOWN file, executes its
 * statements sequentially inside a transaction, then deletes exactly the
 * corresponding schema_migrations row.
 *
 * Metadata is deleted ONLY after the DOWN SQL has fully succeeded, using a
 * parameterized DELETE. The migration name is never concatenated into SQL.
 *
 * NOTE: because DDL causes an implicit commit in MariaDB/MySQL, ROLLBACK
 * issued after a failed statement cannot undo DDL that already executed
 * earlier in this same DOWN file. See the file header for details.
 *
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {object} migration - entry from discoverMigrations()
 * @returns {Promise<{migration: string, statementsExecuted: number}>}
 */
export async function rollbackMigration(connection, migration) {
  let downContent;
  try {
    downContent = await readFile(migration.downPath, 'utf8');
  } catch (err) {
    throw new RollbackError(`Unable to read rollback file "${migration.downFilename}": ${sanitizeError(err)}`);
  }

  if (downContent.trim().length === 0) {
    throw new RollbackError(`Rollback file "${migration.downFilename}" is empty.`);
  }

  let statements;
  try {
    statements = splitSqlStatements(downContent);
  } catch (err) {
    throw new RollbackError(
      `Failed to parse rollback SQL in "${migration.downFilename}": ${sanitizeError(err)}`
    );
  }

  if (statements.length === 0) {
    throw new RollbackError(`Rollback file "${migration.downFilename}" contains no executable statements.`);
  }

  await connection.beginTransaction();

  try {
    for (let idx = 0; idx < statements.length; idx++) {
      try {
        await connection.query(statements[idx]);
      } catch (err) {
        throw new RollbackError(
          `Rollback of "${migration.filename}" failed at statement #${idx + 1} of ` +
            `"${migration.downFilename}": ${sanitizeError(err)}`
        );
      }
    }

    let deleteResult;
    try {
      [deleteResult] = await connection.query(
        `DELETE FROM ${SCHEMA_MIGRATIONS_TABLE} WHERE migration = ?`,
        [migration.filename]
      );
    } catch (err) {
      throw new RollbackError(
        `DOWN SQL for "${migration.filename}" succeeded, but removing its metadata row failed: ` +
          `${sanitizeError(err)}. Manual verification of ${SCHEMA_MIGRATIONS_TABLE} is required.`
      );
    }

    if (!deleteResult || deleteResult.affectedRows !== 1) {
      const actual = deleteResult ? deleteResult.affectedRows : 0;
      throw new RollbackError(
        `DOWN SQL for "${migration.filename}" succeeded, but expected to remove exactly 1 metadata ` +
          `row and removed ${actual}. Manual verification of ${SCHEMA_MIGRATIONS_TABLE} is required.`
      );
    }

    await connection.commit();

    return { migration: migration.filename, statementsExecuted: statements.length };
  } catch (err) {
    try {
      await connection.rollback();
    } catch {
      // Best-effort only: DDL statements already executed above may have
      // caused an implicit commit and cannot be undone by ROLLBACK.
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

/**
 * Parses and strictly validates CLI arguments.
 *
 * Valid:   node scripts/rollback.js
 *          node scripts/rollback.js 024_create_feature_flags
 * Invalid: extra arguments, path traversal, uppercase/space-containing input.
 *
 * @param {string[]} argv - process.argv
 * @returns {{target: string|null}}
 */
export function parseCliArgs(argv) {
  const args = argv.slice(2);
  const usage = 'Usage:\n  node scripts/rollback.js\n  node scripts/rollback.js <migration_name>';

  if (args.length > 1) {
    throw new RollbackValidationError(`Too many arguments.\n${usage}`);
  }

  if (args.length === 0) {
    return { target: null };
  }

  const arg = args[0];
  if (!CLI_TARGET_PATTERN.test(arg)) {
    throw new RollbackValidationError(`Invalid migration name: "${arg}"\n${usage}`);
  }

  return { target: arg };
}

// ---------------------------------------------------------------------------
// Confirmation
// ---------------------------------------------------------------------------

/**
 * Requires the operator to type the exact string CONFIRM in an interactive
 * terminal. Any other input, or a non-interactive environment, cancels the
 * operation. Nothing is executed before this resolves successfully.
 */
async function requestExactConfirmation() {
  if (!process.stdin.isTTY) {
    throw new RollbackValidationError(
      'Refusing to run in a non-interactive environment. Re-run this script from an ' +
        'interactive terminal and type CONFIRM manually.'
    );
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let answer;
  try {
    answer = await rl.question('Type CONFIRM to continue: ');
  } finally {
    rl.close();
  }

  if (answer !== EXACT_CONFIRMATION_TEXT) {
    throw new RollbackValidationError('Confirmation not received. Rollback cancelled.');
  }
}

// ---------------------------------------------------------------------------
// Exit code mapping
// ---------------------------------------------------------------------------

function mapErrorToExitCode(err) {
  if (err instanceof RollbackValidationError) return 2;
  if (err instanceof SchemaCompatibilityError) return 2;
  if (err instanceof RollbackIntegrityError) return 2;
  if (err instanceof RollbackLockError) return 1;
  if (err instanceof RollbackError) return 1;
  return 1;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const state = {
  pool: null,
  connection: null,
  lockHeld: false,
  transactionActive: false,
};

let shuttingDown = false;

async function handleShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\nReceived ${signal}. Attempting safe shutdown...`);

  if (state.connection && state.transactionActive) {
    try {
      await state.connection.rollback();
    } catch {
      // Best-effort only: DDL already executed may be implicitly committed.
    }
  }

  if (state.connection && state.lockHeld) {
    try {
      await state.connection.query('SELECT RELEASE_LOCK(?) AS released', [ADVISORY_LOCK_NAME]);
    } catch {
      // best-effort
    }
  }

  if (state.connection) {
    try {
      state.connection.release();
    } catch {
      // ignore
    }
  }

  if (state.pool) {
    try {
      await state.pool.end();
    } catch {
      // ignore
    }
  }

  console.log('Shutdown complete. Exiting.');
  process.exitCode = 130;
  process.exit(130);
}

process.once('SIGINT', () => {
  handleShutdown('SIGINT');
});
process.once('SIGTERM', () => {
  handleShutdown('SIGTERM');
});

async function main() {
  const startTime = process.hrtime.bigint();

  console.log('Tesnow Database Rollback');
  console.log('========================');
  console.log('');

  let exitCode = 0;

  try {
    const cliArgs = parseCliArgs(process.argv);

    const pool = getDbPool();
    state.pool = pool;

    console.log(`Database: ${getDatabaseNameForDisplay()}`);
    console.log(`Migration: ${cliArgs.target ?? '(latest applied)'}`);
    console.log('Status: Preflight validation');
    console.log('');

    const discovered = await discoverMigrations(MIGRATIONS_DIR);
    const validation = await validateMigrationSet(discovered);
    if (!validation.valid) {
      throw new RollbackValidationError(
        ['Migration preflight validation failed:', ...validation.errors.map((e) => `  - ${e}`)].join('\n')
      );
    }
    console.log('✓ Migration set validated');

    const schemaInfo = await inspectSchemaMigrationsTable(pool);

    if (!schemaInfo.exists) {
      console.log('');
      console.log(`No applied migrations found ("${SCHEMA_MIGRATIONS_TABLE}" table does not exist).`);
      console.log('Nothing to roll back.');
      return;
    }

    if (!schemaInfo.compatible) {
      throw new SchemaCompatibilityError(buildSchemaCompatibilityMessage(schemaInfo));
    }

    const appliedMap = await getAppliedMigrations(pool);
    if (appliedMap.size === 0) {
      console.log('');
      console.log('No applied migrations found.');
      console.log('Nothing to roll back.');
      return;
    }
    console.log('✓ Applied migrations verified');

    await verifyAppliedChecksums(discovered.migrations, appliedMap);
    console.log('✓ Checksums verified');

    const target = resolveRollbackTarget(discovered.migrations, appliedMap, cliArgs.target);
    console.log('');
    console.log(`Target migration: ${target.filename}`);
    console.log('');

    const connection = await pool.getConnection();
    state.connection = connection;

    try {
      console.log('Status: Acquiring advisory lock');
      let lockRows;
      try {
        [lockRows] = await connection.query('SELECT GET_LOCK(?, ?) AS lock_acquired', [
          ADVISORY_LOCK_NAME,
          ADVISORY_LOCK_TIMEOUT_SECONDS,
        ]);
      } catch (err) {
        throw new RollbackLockError(`Unable to acquire advisory lock: ${sanitizeError(err)}`);
      }

      if (!lockRows || Number(lockRows[0].lock_acquired) !== 1) {
        throw new RollbackLockError(
          `Unable to acquire advisory lock "${ADVISORY_LOCK_NAME}" within ` +
            `${ADVISORY_LOCK_TIMEOUT_SECONDS}s. Another migration or rollback may currently be running.`
        );
      }
      state.lockHeld = true;
      console.log('✓ Advisory lock acquired');

      console.log('');
      console.log('Rollback is DESTRUCTIVE and cannot be fully undone once executed.');
      await requestExactConfirmation();
      console.log('✓ Confirmation received');
      console.log('');
      console.log('Status: Executing rollback');

      state.transactionActive = true;
      const result = await rollbackMigration(connection, target);
      state.transactionActive = false;

      console.log('✓ DOWN migration executed');
      console.log('✓ Migration metadata removed');
      console.log('✓ Transaction committed');
      console.log('');
      console.log(`Rollback completed successfully. (${result.statementsExecuted} statement(s) executed)`);
    } finally {
      if (state.lockHeld) {
        try {
          await connection.query('SELECT RELEASE_LOCK(?) AS released', [ADVISORY_LOCK_NAME]);
        } catch {
          // best-effort
        }
        state.lockHeld = false;
      }
      connection.release();
      state.connection = null;
    }
  } catch (err) {
    exitCode = mapErrorToExitCode(err);
    console.log('');
    console.error('✗ Rollback failed safely.');
    console.error('');
    console.error(sanitizeError(err));
  } finally {
    const elapsedMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    console.log('');
    console.log(`Execution time: ${elapsedMs.toFixed(0)} ms`);

    if (state.pool) {
      try {
        await state.pool.end();
      } catch {
        // ignore close errors on shutdown
      }
    }

    if (!shuttingDown) {
      process.exitCode = exitCode;
    }
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