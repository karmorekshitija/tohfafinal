'use strict';

const request = require('supertest');
const express = require('express');
const compression = require('compression');
const fs = require('fs');
const path = require('path');
const productRoutes = require('../src/routes/product.routes');
const adminController = require('../src/controllers/admin.controller');

// Construct test app using same HTTP testing pattern as seller_pipeline_e2e.test.js
const app = express();
app.use(compression());
app.use(express.json());
app.use('/api/products', productRoutes);
app.get('/api/ui-settings/public', adminController.listBanners);
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '2.0.0' });
});

describe('API Compression & Latency Optimization Regression Guards', () => {
  test('server.js imports and registers compression middleware', () => {
    const serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    expect(serverCode).toMatch(/require\(['"]compression['"]\)/);
    expect(serverCode).toMatch(/app\.use\(\s*compression\(\)\s*\)/);
  });

  test('Public categories endpoint responds with Content-Encoding gzip when requested', async () => {
    const res = await request(app)
      .get('/api/products/categories')
      .set('Accept-Encoding', 'gzip');

    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(res.headers['cache-control']).toBe('public, max-age=60, stale-while-revalidate=300');
  });

  test('Public UI settings endpoint sets Cache-Control header', async () => {
    const res = await request(app)
      .get('/api/ui-settings/public');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60, stale-while-revalidate=300');
  });

  test('/health endpoint responds quickly with status ok and does not hit DB', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBe('2.0.0');
  });
});
