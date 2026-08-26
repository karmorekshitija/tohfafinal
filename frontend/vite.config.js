import { resolve, join } from 'path';
import { readdirSync, statSync } from 'fs';
import { defineConfig } from 'vite';

/**
 * Tohfa v2 — Vite Multi-Page App Config
 * File: frontend/vite.config.js
 *
 * Automatically discovers all .html files under src/ and registers
 * them as Vite entry points. Includes dev server rewrite middleware
 * so clean paths like /buyer/desktop/home.html resolve to /src/buyer/desktop/home.html.
 */

function findHtmlFiles(dir, base = dir) {
  const entries = {};
  for (const item of readdirSync(dir)) {
    const full = join(dir, item);
    if (statSync(full).isDirectory()) {
      Object.assign(entries, findHtmlFiles(full, base));
    } else if (item.endsWith('.html')) {
      const rel = full.replace(base, '').replace(/\\/g, '/').replace(/^\//, '');
      const name = rel.replace(/\.html$/, '').replace(/\//g, '-');
      entries[name] = full;
    }
  }
  return entries;
}

const srcDir = resolve(__dirname, 'src');
const htmlEntries = {
  main: resolve(__dirname, 'index.html'),
  ...findHtmlFiles(srcDir),
};

const routeRewritePlugin = () => ({
  name: 'route-rewrite-plugin',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      let [pathname, query] = req.url.split('?');
      if (pathname === '/buyer/zipgift.html' || pathname === '/src/buyer/zipgift.html') {
        pathname = '/buyer/zip-gift.html';
      }
      if (
        pathname.startsWith('/buyer/') ||
        pathname.startsWith('/seller/') ||
        pathname.startsWith('/admin/') ||
        pathname.startsWith('/auth/') ||
        pathname.startsWith('/styles/') ||
        pathname.startsWith('/js/')
      ) {
        req.url = '/src' + pathname + (query ? '?' + query : '');
      }
      next();
    });
  },
});

export default defineConfig({
  root: __dirname,
  publicDir: resolve(__dirname, 'public'),
  plugins: [routeRewritePlugin()],

  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: htmlEntries,
    },
  },

  resolve: {
    alias: {
      '@styles': resolve(__dirname, 'src/styles'),
      '@js':     resolve(__dirname, 'src/js'),
      '@assets': resolve(__dirname, 'src/assets'),
      '/src':    resolve(__dirname, 'src'),
      '/buyer':  resolve(__dirname, 'src/buyer'),
      '/seller': resolve(__dirname, 'src/seller'),
      '/admin':  resolve(__dirname, 'src/admin'),
      '/auth':   resolve(__dirname, 'src/auth'),
      '/components': resolve(__dirname, 'src/components'),
    },
  },

  server: {
    port: 5173,
    host: true,
    open: false,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      }
    }
  },
});
