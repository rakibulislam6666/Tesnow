/**
 * app/routes/index.routes.js
 *
 * Root route composer for Tesnow.
 *
 * Responsibilities:
 *   - Instantiate the root Express router.
 *   - Mount each route group at its established prefix.
 *   - Preserve mount order so prefix-scoped routers cannot be shadowed
 *     by the public router mounted at `/`.
 *
 * Non-responsibilities:
 *   - Business logic, controllers, services, repositories.
 *   - Middleware composition, authentication, authorization.
 *   - Validation, session handling, response or error serialization.
 */

import express from 'express';

import systemRouter from './system.routes.js';
import apiRouter from './api.routes.js';
import authRouter from './auth.routes.js';
import userRouter from './user.routes.js';
import adminRouter from './admin.routes.js';
import publicRouter from './public.routes.js';

const router = express.Router();

// Prefix-scoped routers are mounted before the public router so their
// paths cannot be shadowed by a broader public handler at `/`.
router.use('/system', systemRouter);
router.use('/api', apiRouter);
router.use('/auth', authRouter);
router.use('/user', userRouter);
router.use('/admin', adminRouter);

// Public router is mounted last by design.
router.use('/', publicRouter);

export default router;
export { router };