/**
 * app/repositories/security.repository.js
 * Security event logging – durable, independent of the caller's transaction.
 *
 * This repository follows the project's existing factory/singleton pattern.
 */

import { randomUUID } from 'node:crypto';
import { getDbPool } from '../config/database.config.js';

const VALID_SEVERITIES = new Set(['info', 'low', 'medium', 'high', 'critical']);

export function createSecurityRepository(pool = getDbPool()) {
  return {
    /**
     * Insert a security event.
     *
     * @param {Object} event
     * @param {number|null} [event.userId]
     * @param {string} event.eventType - Short event type identifier.
     * @param {string} [event.severity='info'] - info|low|medium|high|critical
     * @param {boolean} [event.isSuccess=true]
     * @param {string|null} [event.requestId]
     * @param {Object|null} [event.metadata]
     * @param {import('mysql2/promise').Connection} [connection]
     * @returns {Promise<number|null>} Inserted event ID or null.
     */
    async logEvent(event, connection = pool) {
      if (!event || typeof event !== 'object') {
        throw new Error('security event must be an object');
      }
      const {
        userId = null,
        eventType,
        severity = 'info',
        isSuccess = true,
        requestId = null,
        metadata = null,
      } = event;

      if (typeof eventType !== 'string' || eventType.trim() === '') {
        throw new Error('eventType must be a non-empty string');
      }
      if (!VALID_SEVERITIES.has(severity)) {
        throw new Error(
          `severity must be one of: ${Array.from(VALID_SEVERITIES).join(', ')}`
        );
      }

      const uuid = randomUUID();

      const [result] = await connection.query(
        `INSERT INTO security_events
          (uuid, user_id, event_type, severity, is_success, request_id, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid,
          userId,
          eventType,
          severity,
          isSuccess ? 1 : 0,
          requestId,
          metadata ? JSON.stringify(metadata) : null,
        ]
      );

      return result ? result.insertId : null;
    },
  };
}

export default createSecurityRepository();