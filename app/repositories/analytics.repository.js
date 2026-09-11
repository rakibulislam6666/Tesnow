import { getDbPool } from '../config/database.config.js';

function validatePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

function validateDate(date, name) {
  if (!(date instanceof Date) || isNaN(date)) {
    throw new Error(`${name} must be a valid Date object`);
  }
  return date;
}

export function createAnalyticsRepository(pool = getDbPool()) {
  return {
    // Count events of a specific type, optionally within a date range
    async countByEventType(eventType, { startDate = null, endDate = null } = {}) {
      if (typeof eventType !== 'string' || eventType.trim() === '') {
        throw new Error('eventType must be a non-empty string');
      }
      let sql = 'SELECT COUNT(*) AS count FROM analytics_events WHERE event_type = ?';
      const params = [eventType];
      if (startDate) {
        const d = validateDate(startDate, 'startDate');
        sql += ' AND occurred_at >= ?';
        params.push(d);
      }
      if (endDate) {
        const d = validateDate(endDate, 'endDate');
        sql += ' AND occurred_at < ?';
        params.push(d);
      }
      const [rows] = await pool.query(sql, params);
      return Number(rows[0].count);
    },

    async countDistinctVisitors({ startDate = null, endDate = null } = {}) {
      let sql = 'SELECT COUNT(DISTINCT visitor_hash) AS count FROM analytics_events';
      const params = [];
      const conditions = [];
      if (startDate) {
        const d = validateDate(startDate, 'startDate');
        conditions.push('occurred_at >= ?');
        params.push(d);
      }
      if (endDate) {
        const d = validateDate(endDate, 'endDate');
        conditions.push('occurred_at < ?');
        params.push(d);
      }
      if (conditions.length) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
      const [rows] = await pool.query(sql, params);
      return Number(rows[0].count);
    },

    async countDistinctSessions({ startDate = null, endDate = null } = {}) {
      let sql = 'SELECT COUNT(DISTINCT session_hash) AS count FROM analytics_events';
      const params = [];
      const conditions = [];
      if (startDate) {
        const d = validateDate(startDate, 'startDate');
        conditions.push('occurred_at >= ?');
        params.push(d);
      }
      if (endDate) {
        const d = validateDate(endDate, 'endDate');
        conditions.push('occurred_at < ?');
        params.push(d);
      }
      if (conditions.length) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
      const [rows] = await pool.query(sql, params);
      return Number(rows[0].count);
    },

    // Daily traffic aggregation for a specific event type and date range
    async getTrafficByDate({ eventType, startDate = null, endDate = null }) {
      if (typeof eventType !== 'string' || eventType.trim() === '') {
        throw new Error('eventType must be a non-empty string');
      }
      let sql = `
        SELECT DATE(occurred_at) AS date, COUNT(*) AS count
        FROM analytics_events
        WHERE event_type = ?
      `;
      const params = [eventType];
      if (startDate) {
        const d = validateDate(startDate, 'startDate');
        sql += ' AND occurred_at >= ?';
        params.push(d);
      }
      if (endDate) {
        const d = validateDate(endDate, 'endDate');
        sql += ' AND occurred_at < ?';
        params.push(d);
      }
      sql += ' GROUP BY DATE(occurred_at) ORDER BY date ASC';
      const [rows] = await pool.query(sql, params);
      return rows;
    }
  };
}

export default createAnalyticsRepository();