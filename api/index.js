/**
 * Tohfa v2 — Vercel Serverless Function Bridge
 * File: api/index.js
 * Role: Bridges Express backend app into Vercel Serverless Functions.
 */
'use strict';

const app = require('../backend/server');

module.exports = app;
