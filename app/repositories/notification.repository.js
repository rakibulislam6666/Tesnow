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

export function createNotificationRepository(pool = getDbPool()) {
  return {
    // Requires userId to avoid exposing all notifications.
    // Optionally filter by type.
    async findRecent({ userId, type = null, limit = DEFAULT_LIMIT, offset = 0 }) {
      if (!userId || !Number.isInteger(userId) || userId <= 0) {
        throw new Error('userId must be a positive integer');
      }
      const safeLimit = validateLimit(limit);
      const safeOffset = validatePositiveInteger(offset, 'offset');

      let sql = `
        SELECT
          id,
          user_id,
          type,
          title,
          message,
          related_entity_type,
          related_entity_id,
          action_url,
          is_read,
          read_at,
          created_at,
          updated_at
        FROM notifications
        WHERE user_id = ? AND deleted_at IS NULL
      `;
      const params = [userId];
      if (type) {
        if (typeof type !== 'string' || type.trim() === '') {
          throw new Error('type must be a non-empty string');
        }
        sql += ' AND type = ?';
        params.push(type);
      }
      sql += ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?';
      params.push(safeLimit, safeOffset);

      const [rows] = await pool.query(sql, params);
      return rows;
    }
  };
}

export default createNotificationRepository();