import { getDbPool } from '../config/database.config.js';

export function createReportRepository(pool = getDbPool()) {
  return {
    async countAll() {
      const [rows] = await pool.query(
        'SELECT COUNT(*) AS count FROM reports WHERE deleted_at IS NULL'
      );
      return Number(rows[0].count);
    },

    async countPending() {
      const [rows] = await pool.query(
        "SELECT COUNT(*) AS count FROM reports WHERE status = 'pending' AND deleted_at IS NULL"
      );
      return Number(rows[0].count);
    }
  };
}

export default createReportRepository();