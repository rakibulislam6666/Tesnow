/**
 * app/routes/public.routes.js
 * Public, unauthenticated web routes for Tesnow
 * 
 * @module routes/public.routes
 */

import express from 'express';
import { home } from '../controllers/home.controller.js';

const router = express.Router();
router.get('/', home);

// Future public routes will be defined here:
// GET /
// GET /posts
// GET /post/:slug
// GET /category/:slug
// GET /tag/:slug
// GET /search
// GET /about
// GET /contact
// GET /privacy
// GET /terms
// GET /cookies
// GET /sitemap.xml
// GET /robots.txt

export default router;
export { router };