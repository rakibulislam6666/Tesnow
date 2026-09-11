import { randomUUID } from 'node:crypto';
import { getDbPool } from '../config/database.config.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

function validatePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

function validateLimit(limit) {
  const val = validatePositiveInteger(limit, 'limit');
  if (val > MAX_LIMIT) throw new Error(`limit cannot exceed ${MAX_LIMIT}`);
  return val;
}

export function createAuditRepository(pool = getDbPool()) {
  return {
    async findRecent({ limit = DEFAULT_LIMIT, offset = 0 }) {
      const safeLimit = validateLimit(limit);
      const safeOffset = validatePositiveInteger(offset, 'offset');

      const [rows] = await pool.query(
        `SELECT
          audit_logs.id,
          audit_logs.action,
          audit_logs.entity_type,
          audit_logs.created_at,
          COALESCE(u.username, au.username) AS actor_name
        FROM audit_logs
        LEFT JOIN users u ON audit_logs.actor_user_id = u.id
        LEFT JOIN admins a ON audit_logs.actor_admin_id = a.id
        LEFT JOIN users au ON a.user_id = au.id
        ORDER BY audit_logs.created_at DESC, audit_logs.id DESC
        LIMIT ? OFFSET ?`,
        [safeLimit, safeOffset]
      );
      return rows;
    },

    /**
     * Insert an audit log entry.
     * Can be called inside a transaction by passing a connection.
     *
     * @param {Object} entry
     * @param {string} entry.action - Short action code (e.g. 'create', 'update', 'delete').
     * @param {string} entry.entityType - Entity type (e.g. 'role').
     * @param {number|null} [entry.entityId]
     * @param {Object|null} [entry.beforeData]
     * @param {Object|null} [entry.afterData]
     * @param {number|null} [entry.actorUserId]
     * @param {number|null} [entry.actorAdminId]
     * @param {string|null} [entry.requestId]
     * @param {import('mysql2/promise').Connection} [connection]
     * @returns {Promise<number|null>} Inserted audit log ID or null.
     */
    async log(entry, connection = pool) {
      if (!entry || typeof entry !== 'object') {
        throw new Error('audit entry must be an object');
      }
      const {
        action,
        entityType,
        entityId = null,
        beforeData = null,
        afterData = null,
        actorUserId = null,
        actorAdminId = null,
        requestId = null,
      } = entry;

      if (typeof action !== 'string' || action.trim() === '') {
        throw new Error('action must be a non-empty string');
      }
      if (typeof entityType !== 'string' || entityType.trim() === '') {
        throw new Error('entityType must be a non-empty string');
      }

      const uuid = randomUUID();

      const [result] = await connection.query(
        `INSERT INTO audit_logs
          (uuid, actor_user_id, actor_admin_id, action, entity_type, entity_id,
           before_data, after_data, request_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid,
          actorUserId,
          actorAdminId,
          action,
          entityType,
          entityId,
          beforeData ? JSON.stringify(beforeData) : null,
          afterData ? JSON.stringify(afterData) : null,
          requestId,
        ]
      );

      return result ? result.insertId : null;
    },
  };
}

export default createAuditRepository();