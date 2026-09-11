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

export function createCommentRepository(pool = getDbPool()) {
  return {
    async countAll() {
      const [rows] = await pool.query(
        'SELECT COUNT(*) AS count FROM comments WHERE deleted_at IS NULL'
      );
      return Number(rows[0].count);
    },

    async countPending() {
      const [rows] = await pool.query(
        "SELECT COUNT(*) AS count FROM comments WHERE status = 'pending' AND deleted_at IS NULL"
      );
      return Number(rows[0].count);
    },

    async findRecent({ limit = DEFAULT_LIMIT, offset = 0 }) {
      const safeLimit = validateLimit(limit);
      const safeOffset = validatePositiveInteger(offset, 'offset');

      const [rows] = await pool.query(
        `SELECT
          comments.id,
          comments.content,
          comments.status,
          comments.created_at,
          posts.title AS post_title,
          COALESCE(users.username, comments.guest_name) AS commenter_name
        FROM comments
        LEFT JOIN posts ON comments.post_id = posts.id
        LEFT JOIN users ON comments.user_id = users.id
        WHERE comments.deleted_at IS NULL
        ORDER BY comments.created_at DESC, comments.id DESC
        LIMIT ? OFFSET ?`,
        [safeLimit, safeOffset]
      );
      return rows;
    }
  };
}

export default createCommentRepository();