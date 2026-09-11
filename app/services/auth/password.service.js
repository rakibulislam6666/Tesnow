/**
 * app/services/auth/password.service.js
 * Secure password hashing and verification using bcryptjs.
 */

import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

/**
 * Hash a plaintext password.
 * @param {string} password - Plaintext password.
 * @returns {Promise<string>} Hashed password.
 */
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
  return await bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a plaintext password against a hash.
 * @param {string} password - Plaintext password.
 * @param {string} hash - Stored password hash.
 * @returns {Promise<boolean>} True if password matches hash.
 */
export async function verifyPassword(password, hash) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
  if (typeof hash !== 'string' || hash.length === 0) {
    throw new Error('Hash must be a non-empty string');
  }
  return await bcrypt.compare(password, hash);
}

export default {
  hashPassword,
  verifyPassword,
};