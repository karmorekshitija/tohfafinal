import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = [
  path.join(FRONTEND_ROOT, 'src'),
  path.join(FRONTEND_ROOT, 'public')
];
const ROOT_FILES = [
  path.join(FRONTEND_ROOT, 'index.html')
];

const IGNORE_PATTERNS = [
  'categoryLinks.js',
  'node_modules',
  'dist',
  'scripts',
  '.git'
];

const DEAD_SLUGS = [
  'slug=jewellery',
  'slug=candles-fragrance',
  'slug=art-portraits',
  'slug=hampers',
  'slug=home-decor-wall-art',
  'slug=nails"',
  "slug=nails'",
  'slug=nails&',
  'slug=couples"',
  "slug=couples'",
  'slug=floral-botanicals'
];

function getFilesToScan(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (IGNORE_PATTERNS.some(p => fullPath.includes(p))) continue;

    if (entry.isDirectory()) {
      results = results.concat(getFilesToScan(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.html') || entry.name.endsWith('.js'))) {
      results.push(fullPath);
    }
  }
  return results;
}

let allFiles = [...ROOT_FILES.filter(f => fs.existsSync(f))];
for (const dir of SCAN_DIRS) {
  allFiles = allFiles.concat(getFilesToScan(dir));
}

let violations = [];

// Regex patterns to detect bare category links without parameters
const BARE_CATEGORY_PATTERNS = [
  /href\s*=\s*["'](?:\/buyer\/)?category(?:\.html)?["']/g,
  /window\.location(?:\.href)?\s*=\s*["'](?:\/buyer\/)?category(?:\.html)?["']/g,
  /window\.location\.replace\(["'](?:\/buyer\/)?category(?:\.html)?["']\)/g
];

for (const file of allFiles) {
  const relativePath = path.relative(FRONTEND_ROOT, file);
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check for bare category links
    for (const pat of BARE_CATEGORY_PATTERNS) {
      pat.lastIndex = 0;
      if (pat.test(line)) {
        violations.push({
          file: relativePath,
          line: lineNum,
          content: line.trim(),
          rule: 'Bare category.html link without slug parameter. Use ALL_CATEGORIES_URL (/buyer/categories.html) or categoryUrl().'
        });
      }
    }

    // Check for dead slugs
    for (const deadSlug of DEAD_SLUGS) {
      if (line.includes(deadSlug)) {
        violations.push({
          file: relativePath,
          line: lineNum,
          content: line.trim(),
          rule: `Dead / retired category slug found: "${deadSlug}". Use dynamic categories or active slug.`
        });
      }
    }
  }
}

console.log(`[check_category_links] Scanned ${allFiles.length} files across frontend.`);

if (violations.length > 0) {
  console.error(`\n❌ Found ${violations.length} category link violation(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    Code: ${v.content}`);
    console.error(`    Reason: ${v.rule}\n`);
  }
  process.exit(1);
} else {
  console.log('✅ All category links and slugs are strictly valid. Zero dead/bare links found.\n');
  process.exit(0);
}
