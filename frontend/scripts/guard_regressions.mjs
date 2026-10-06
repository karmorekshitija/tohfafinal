import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, '..');

const IGNORE_PATTERNS = [
  'node_modules',
  'dist',
  '.git',
  'scripts'
];

/**
 * Rules array for regression guarding.
 *
 * Supported rule shapes:
 * 1. Pattern forbid rule:
 *    {
 *      id: 'rule-id',
 *      description: 'Human-readable description',
 *      dirs: ['src', 'public'],       // Directories relative to frontend/
 *      include: ['.js', '.html'],     // File extensions to inspect
 *      forbid: /regex-pattern/,       // Forbidden RegExp
 *      allowFiles: ['src/exempt.js']  // Paths relative to frontend/ exempt from rule
 *    }
 *
 * 2. lineRule:
 *    {
 *      id: 'rule-id',
 *      description: 'Human-readable description',
 *      files: ['src/app.js'],         // Files or directories relative to frontend/
 *      whenLineMatches: /regex/,      // Pattern that triggers check on a line
 *      mustAlsoContain: 'string',     // Substring that must be present on that line
 *      allowFiles: ['src/exempt.js']  // Optional exempt files
 *    }
 */
export const RULES = [
  {
    id: 'no-time-based-greeting',
    dirs: ['src/seller'],
    forbid: /Good (morning|afternoon|evening)/i
  },
  {
    id: 'no-fake-seller-data',
    dirs: ['src/seller'],
    forbid: /MOCK_DATA|Petrichor|Monsoon Curated|Seller Workshop|2\.4x revenue|avg production time is|highest satisfaction rating/
  },
  {
    id: 'no-authstorage-getitem',
    dirs: ['src'],
    forbid: /authStorage\??\.getItem/
  },
  {
    id: 'single-view-store-handler',
    dirs: ['src'],
    forbid: /getElementById\(\s*['"]view-store-btn['"]\s*\)/,
    allowFiles: ['src/components/seller-components.js']
  },
  {
    id: 'no-dashboard-fallback-for-view-store',
    dirs: ['src/seller'],
    forbid: /location\.href\s*=\s*['"]\/seller\/dashboard\.html['"]/,
    allowFiles: ['src/seller/analytics.html', 'src/seller/payouts.html', 'src/seller/profile.html']
  },
  {
    id: 'orders-tabs-no-shrink',
    files: ['src/seller/orders.html'],
    whenLineMatches: /filter-btn.*whitespace-nowrap/,
    mustAlsoContain: 'shrink-0'
  },
  {
    id: 'hero-uses-webp',
    dirs: ['src/buyer', '.'],
    include: ['home.html', 'index.html'],
    forbid: /<img[^>]+src=["']\/img\/botanical-hero\.png/
  },
  {
    id: 'chartjs-pinned-deferred',
    dirs: ['src/seller'],
    forbid: /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js"><\/script>/
  },
  {
    id: 'variant-placeholder-short',
    files: ['src/seller/add-product.js'],
    forbid: /placeholder="e\.g\.\s*Size:\s*Large/
  },
  {
    id: 'rupee-glyph-font-sans-fallback',
    files: ['src/seller/add-product.js'],
    whenLineMatches: /Price.*\(\+.*₹.*\)/,
    mustAlsoContain: 'font-sans'
  },
  {
    id: 'variant-photos-picker-not-text-input',
    files: ['src/seller/add-product.js'],
    forbid: /variant-images-input/
  },
  {
    id: 'special-shop-admin-managed-onboarding',
    files: ['../backend/src/utils/sellerOnboarding.js'],
    whenLineMatches: /isAdminManaged\s*=\s*Boolean/,
    mustAlsoContain: 'is_admin_managed'
  },
  {
    id: 'edit-product-variant-photos-not-text-input',
    files: ['src/seller/edit-product.html'],
    forbid: /variant-images-input/
  },
  {
    id: 'edit-product-rupee-glyph-font-sans-fallback',
    files: ['src/seller/edit-product.html'],
    whenLineMatches: /Price.*\(\+.*₹.*\)/,
    mustAlsoContain: 'font-sans'
  },
  {
    id: 'edit-product-variants-builder-panel-present',
    files: ['src/seller/edit-product.html'],
    whenLineMatches: /id="variants-builder-panel"/,
    mustAlsoContain: 'variants-builder-panel'
  }
];

function isIgnored(filePath) {
  const rel = path.relative(FRONTEND_ROOT, filePath).replace(/\\/g, '/');
  const parts = rel.split('/').filter(Boolean);
  return parts.some(part => IGNORE_PATTERNS.includes(part));
}

function matchesExtension(fileName, includeExtensions) {
  if (!includeExtensions || includeExtensions.length === 0) return true;
  const ext = path.extname(fileName).toLowerCase();
  const lowerName = fileName.toLowerCase();
  return includeExtensions.some(inc => {
    const incLower = inc.toLowerCase();
    if (lowerName === incLower) return true;
    const norm = incLower.startsWith('.') ? incLower : `.${incLower}`;
    return ext === norm;
  });
}

function collectFiles(targetPath, includeExtensions = null) {
  let results = [];
  if (!fs.existsSync(targetPath)) return results;
  if (isIgnored(targetPath)) return results;

  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORE_PATTERNS.includes(entry.name)) continue;
      const fullPath = path.join(targetPath, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(collectFiles(fullPath, includeExtensions));
      } else if (entry.isFile()) {
        if (matchesExtension(entry.name, includeExtensions)) {
          results.push(fullPath);
        }
      }
    }
  } else if (stat.isFile()) {
    if (matchesExtension(path.basename(targetPath), includeExtensions)) {
      results.push(targetPath);
    }
  }
  return results;
}

function runGuards() {
  const violations = [];

  for (const rule of RULES) {
    const targetPaths = [];
    if (Array.isArray(rule.files)) {
      targetPaths.push(...rule.files);
    } else if (typeof rule.files === 'string') {
      targetPaths.push(rule.files);
    }

    if (Array.isArray(rule.dirs)) {
      targetPaths.push(...rule.dirs);
    } else if (typeof rule.dirs === 'string') {
      targetPaths.push(rule.dirs);
    }

    if (targetPaths.length === 0) {
      targetPaths.push('src', 'public');
    }

    let filesToScan = [];
    for (const target of targetPaths) {
      const fullPath = path.resolve(FRONTEND_ROOT, target);
      filesToScan.push(...collectFiles(fullPath, rule.include));
    }

    // Deduplicate files
    filesToScan = [...new Set(filesToScan)];

    const allowList = new Set(
      (rule.allowFiles || []).map(f => path.normalize(f).replace(/\\/g, '/'))
    );

    const forbidRegex = rule.forbid instanceof RegExp
      ? rule.forbid
      : (typeof rule.forbid === 'string' ? new RegExp(rule.forbid) : null);

    const whenRegex = rule.whenLineMatches instanceof RegExp
      ? rule.whenLineMatches
      : (typeof rule.whenLineMatches === 'string' ? new RegExp(rule.whenLineMatches) : null);

    const mustContain = typeof rule.mustAlsoContain === 'string' ? rule.mustAlsoContain : null;

    for (const filePath of filesToScan) {
      const relPath = path.relative(FRONTEND_ROOT, filePath).replace(/\\/g, '/');
      if (allowList.has(relPath)) {
        continue;
      }

      let content;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch (err) {
        continue;
      }

      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        let lineViolated = false;

        // Check standard forbid rule
        if (forbidRegex) {
          forbidRegex.lastIndex = 0;
          if (forbidRegex.test(line)) {
            violations.push({
              id: rule.id,
              description: rule.description,
              file: relPath,
              line: lineNum,
              content: line.trim()
            });
            lineViolated = true;
          }
        }

        // Check lineRule
        if (!lineViolated && whenRegex && mustContain !== null) {
          whenRegex.lastIndex = 0;
          if (whenRegex.test(line) && !line.includes(mustContain)) {
            violations.push({
              id: rule.id,
              description: rule.description,
              file: relPath,
              line: lineNum,
              content: line.trim()
            });
          }
        }
      }
    }
  }

// Pre-existing images larger than 300 KB without .webp sibling allow-list.
// Tested against current repository: 0 violations found. Maintained here so only NEW offenders fail.
const ALLOWED_HEAVY_IMAGES_WITHOUT_WEBP = new Set([
  // No pre-existing images in frontend/public/img > 300KB lack a .webp sibling
]);

function checkImageBudget(violations) {
  const imgDir = path.resolve(FRONTEND_ROOT, 'public', 'img');
  if (!fs.existsSync(imgDir)) return;

  function scan(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.png', '.jpg', '.jpeg'].includes(ext)) {
          const stat = fs.statSync(fullPath);
          const sizeKB = stat.size / 1024;
          if (sizeKB > 300) {
            const relPath = path.relative(FRONTEND_ROOT, fullPath).replace(/\\/g, '/');
            if (ALLOWED_HEAVY_IMAGES_WITHOUT_WEBP.has(relPath) || ALLOWED_HEAVY_IMAGES_WITHOUT_WEBP.has(entry.name)) {
              continue;
            }
            const baseName = path.basename(entry.name, ext);
            const webpSibling = path.join(dir, `${baseName}.webp`);
            if (!fs.existsSync(webpSibling)) {
              violations.push({
                id: 'image-budget-webp-required',
                description: `Image exceeds 300 KB (${Math.round(sizeKB)} KB) and has no .webp sibling`,
                file: relPath,
                line: 1,
                content: `${entry.name} (${Math.round(sizeKB)} KB)`
              });
            }
          }
        }
      }
    }
  }

  scan(imgDir);
}

function checkClassicScripts(violations) {
  const htmlFiles = collectFiles(path.resolve(FRONTEND_ROOT, 'src'), ['.html'])
    .concat(collectFiles(path.resolve(FRONTEND_ROOT, 'index.html'), ['.html']));

  const scriptTagRegex = /<script\b([^>]*)>/gi;

  for (const filePath of htmlFiles) {
    const relPath = path.relative(FRONTEND_ROOT, filePath).replace(/\\/g, '/');
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      scriptTagRegex.lastIndex = 0;
      let match;
      while ((match = scriptTagRegex.exec(line)) !== null) {
        const attrs = match[1];
        const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
        if (!srcMatch) continue;
        const src = srcMatch[1].trim();

        // Skip external scripts
        if (/^(https?:|\/\/)/i.test(src)) continue;

        // Skip ES module scripts
        const typeMatch = attrs.match(/\btype=["']([^"']+)["']/i);
        if (typeMatch && typeMatch[1].toLowerCase() === 'module') continue;

        // Local script without type="module" must exist in public/ or dist/
        const cleanPath = src.split('?')[0].split('#')[0];
        const publicTarget = src.startsWith('/')
          ? path.resolve(FRONTEND_ROOT, 'public', cleanPath.replace(/^\//, ''))
          : path.resolve(FRONTEND_ROOT, 'public', cleanPath);
        const distTarget = src.startsWith('/')
          ? path.resolve(FRONTEND_ROOT, 'dist', cleanPath.replace(/^\//, ''))
          : path.resolve(FRONTEND_ROOT, 'dist', cleanPath);

        const existsInPublic = fs.existsSync(publicTarget);
        const existsInDist = fs.existsSync(distTarget);

        if (!existsInPublic && !existsInDist) {
          violations.push({
            id: 'unbundled-script-missing',
            description: `Local <script src="${src}"> without type="module" must exist in public/ or dist/ build output`,
            file: relPath,
            line: lineNum,
            content: line.trim()
          });
        }
      }
    }
  }
}

  checkImageBudget(violations);
  checkClassicScripts(violations);

  if (violations.length > 0) {
    console.error(`\n❌ Found ${violations.length} regression violation(s):\n`);
    for (const v of violations) {
      console.error(`[${v.id}] ${v.file}:${v.line}`);
      console.error(`  Line: ${v.content}`);
      if (v.description) {
        console.error(`  Reason: ${v.description}`);
      }
      console.error('');
    }
    process.exit(1);
  }

  console.log(`guard_regressions: OK (${RULES.length} rules)`);
  process.exit(0);
}

runGuards();
