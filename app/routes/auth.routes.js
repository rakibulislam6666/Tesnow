/**
 * app/routes/auth.routes.js
 *
 * HTTP route definitions for authentication endpoints.
 *
 * Responsibilities:
 *   - Declare POST /login and POST /logout.
 *   - Delegate request handling to the authentication controller.
 *
 * Non-responsibilities:
 *   - Credential validation.
 *   - Authentication workflow.
 *   - Session regeneration, persistence, or revocation.
 *   - Cookie handling.
 *   - Error serialization.
 *   - Business rules, SQL, or repository access.
 *
 * Workflow ownership:
 *   - app/controllers/auth.controller.js owns the login/logout orchestration.
 *   - app/services/auth/* owns authentication and session business logic.
 *   - app/core/errors.js and the centralized error middleware own error
 *     serialization.
 *
 * This file must remain a thin binding layer.
 */

import express from 'express';
import authController from '../controllers/auth.controller.js';

const router = express.Router();

// ----------------------------------------------------------------------------
// POST /login
// ----------------------------------------------------------------------------

/**
 * Authenticate credentials and establish an authenticated Express session.
 *
 * All validation, credential verification, session regeneration, session
 * persistence, cleanup, and response shaping are handled by the controller.
 */
router.post('/login', authController.login);

// ----------------------------------------------------------------------------
// POST /logout
// ----------------------------------------------------------------------------

/**
 * Revoke the current server-side session and clear the authentication cookie.
 *
 * Idempotent by contract: a request with no active session still receives a
 * successful logout response and any residual cookie is cleared.
 */
router.post('/logout', authController.logout);

export default router;
export { router };