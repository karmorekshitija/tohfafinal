/**
 * Tohfa v2 — Sitemap Routes
 * File: backend/src/routes/sitemap.routes.js
 * Role: Mounts dynamic XML sitemap endpoint for search engines and crawlers.
 */
'use strict';

const express = require('express');
const router  = express.Router();
const { generateSitemap } = require('../controllers/sitemap.controller');

// GET /api/sitemap.xml (or /sitemap.xml)
router.get('/', generateSitemap);
router.get('/sitemap.xml', generateSitemap);

module.exports = router;
