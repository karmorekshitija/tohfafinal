'use strict';
const { query } = require('../config/db');

async function updateSellerBanners() {
  console.log('Updating seller banners in database...');
  const r1 = await query("UPDATE sellers SET banner_url = '/img/default-seller-banner.png' WHERE banner_url IS NULL OR banner_url = '/uploads/banners/default-banner.png' OR banner_url = '/img/categories/artisan_showcase.jpg'");
  console.log(`Updated sellers: ${r1.rowCount} rows`);
  const r2 = await query("UPDATE seller_profiles SET banner_url = '/img/default-seller-banner.png' WHERE banner_url IS NULL OR banner_url = '/uploads/banners/default-banner.png' OR banner_url = '/img/categories/artisan_showcase.jpg'");
  console.log(`Updated seller_profiles: ${r2.rowCount} rows`);
  const r3 = await query("UPDATE users SET cover_photo_url = '/img/default-seller-banner.png' WHERE role = 'seller' AND (cover_photo_url IS NULL OR cover_photo_url = '/uploads/banners/default-banner.png' OR cover_photo_url = '/img/categories/artisan_showcase.jpg')");
  console.log(`Updated seller users: ${r3.rowCount} rows`);
  console.log('All seller banners updated successfully.');
}

if (require.main === module) {
  updateSellerBanners().then(() => process.exit(0)).catch(err => { console.error('Error:', err); process.exit(1); });
}
module.exports = { updateSellerBanners };
