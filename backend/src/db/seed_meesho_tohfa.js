const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { query } = require('../config/db');

const SOURCE_DIR = '/Users/krinjal_agrawal/Desktop/meesho tohfa';
const DEST_DIR = '/Users/krinjal_agrawal/Desktop/tohfafinal/frontend/public/img/products/meesho_tohfa';
const DEST_PREFIX = '/img/products/meesho_tohfa';

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function getOrCreateSeller() {
  const email = 'tohfa_official@tohfa.com';
  let { rows } = await query('SELECT id FROM users WHERE email = $1', [email]);
  let userId;
  if (rows.length > 0) {
    userId = rows[0].id;
  } else {
    const res = await query(
      `INSERT INTO users (name, email, password_hash, role, is_active) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['Tohfa Official', email, 'dummyhash', 'seller', true]
    );
    userId = res.rows[0].id;
  }

  let sellerRes = await query('SELECT id FROM sellers WHERE user_id = $1', [userId]);
  if (sellerRes.rows.length === 0) {
    await query(
      `INSERT INTO sellers (user_id, store_name, slug, verification_status, is_approved, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, 'Tohfa Official Store', 'tohfa-official', 'verified', true, true]
    );
  }

  let profileRes = await query('SELECT id FROM seller_profiles WHERE user_id = $1', [userId]);
  if (profileRes.rows.length === 0) {
    await query(
      `INSERT INTO seller_profiles (user_id, store_name, slug, is_approved, verification_status, is_active, is_tohfa_original)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, 'Tohfa Official Store', 'tohfa-official', true, 'verified', true, true]
    );
  }

  return userId;
}

async function getOrCreateCategory(name) {
  const slug = slugify(name);
  let { rows } = await query('SELECT id FROM categories WHERE slug = $1', [slug]);
  if (rows.length > 0) {
    return rows[0].id;
  }
  const res = await query(
    `INSERT INTO categories (name, slug, is_active) VALUES ($1, $2, $3) RETURNING id`,
    [name, slug, true]
  );
  return res.rows[0].id;
}

function inferCategory(folderName, parentName) {
  const check = (folderName + ' ' + (parentName || '')).toLowerCase();
  if (check.includes('candle')) return 'Candles';
  if (check.includes('crochet')) return 'Handcrafted';
  if (check.includes('nail')) return 'Nails';
  if (check.includes('clip')) return 'Hair Accessories';
  return 'Gifts';
}

function titleCase(str) {
  return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

// Random pricing between 200 and 900
function getRandomPrice() {
  return Math.floor(Math.random() * (900 - 200 + 1) + 200);
}

let sellerId = null;

async function createProduct(productDir, productNameRaw, parentFolderName) {
  const files = fs.readdirSync(productDir).filter(f => !f.startsWith('.') && f.match(/\.(jpg|jpeg|png)$/i));
  if (files.length === 0) return;

  const destFolder = path.join(DEST_DIR, slugify(productNameRaw));
  await ensureDir(destFolder);

  const imageUrls = [];
  for (const [index, file] of files.entries()) {
    const ext = path.extname(file);
    const newName = `${index + 1}${ext}`;
    const srcFile = path.join(productDir, file);
    const dstFile = path.join(destFolder, newName);
    fs.copyFileSync(srcFile, dstFile);
    imageUrls.push(`${DEST_PREFIX}/${slugify(productNameRaw)}/${newName}`);
  }

  // Format name nicely
  let productName = titleCase(productNameRaw.replace(/_/g, ' '));
  const catName = inferCategory(productNameRaw, parentFolderName);
  
  // If product name is like "Dog", append Category for clarity, e.g. "Dog Candle"
  if (productName.length < 10 && !productName.toLowerCase().includes(catName.toLowerCase().substring(0,4))) {
    productName += ' ' + (catName.endsWith('s') ? catName.substring(0, catName.length - 1) : catName);
  }

  const productSlug = slugify(productName) + '-' + crypto.randomBytes(4).toString('hex');
  const categoryId = await getOrCreateCategory(catName);
  const basePrice = getRandomPrice();

  console.log(`Inserting: ${productName} (${imageUrls.length} images)`);

  const { rows } = await query(
    `INSERT INTO products 
      (seller_id, category_id, name, slug, description, base_price, stock_quantity, images, is_tohfa_original, tohfa_special_badge, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [
      sellerId, 
      categoryId, 
      productName, 
      productSlug, 
      `Beautiful handcrafted ${productName}. Meesho Tohfa Special Edition.`, 
      basePrice, 
      50, // stock 
      imageUrls, 
      true, 
      'Meesho Tohfa', 
      'active'
    ]
  );
  const productId = rows[0].id;

  for (const [index, url] of imageUrls.entries()) {
    await query(
      `INSERT INTO product_images (product_id, url, sort_order) VALUES ($1, $2, $3)`,
      [productId, url, index]
    );
  }
}

async function processDirectory(baseDir, parentFolderName) {
  const entries = fs.readdirSync(baseDir, { withFileTypes: true }).filter(e => !e.name.startsWith('.'));
  const subDirs = entries.filter(e => e.isDirectory());
  const files = entries.filter(e => e.isFile() && e.name.match(/\.(jpg|jpeg|png)$/i));

  if (files.length > 0) {
    // This folder has images, treat it as a product
    await createProduct(baseDir, path.basename(baseDir), parentFolderName);
  }

  for (const dir of subDirs) {
    await processDirectory(path.join(baseDir, dir.name), path.basename(baseDir));
  }
}

async function start() {
  await ensureDir(DEST_DIR);
  sellerId = await getOrCreateSeller();
  console.log(`Using seller ID: ${sellerId}`);

  await processDirectory(SOURCE_DIR, 'Meesho Tohfa');

  console.log('Seed complete!');
  process.exit(0);
}

start().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
