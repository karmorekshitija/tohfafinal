/**
 * Verification test script for product variants, images, and recommendations
 */
'use strict';

const { query } = require('./config/db');
const { getProduct, getRecommendations } = require('./controllers/product.controller');

async function verify() {
  console.log('🔍 Verifying Product 140 (Couple Candle)...');

  const req140 = { params: { id: '140' } };
  let product140Data = null;
  const res140 = {
    status: (code) => ({ json: (data) => console.log('res 140 status:', code, data) }),
    json: (payload) => { product140Data = payload; }
  };
  await getProduct(req140, res140, (err) => console.error(err));

  if (product140Data && product140Data.success) {
    const p = product140Data.data.product;
    console.log('✅ Product 140 Name:', p.name);
    console.log('✅ Product 140 Direct/Product-Level Images (' + p.images.length + '):', p.images.map(i => i.url));
    console.log('✅ Product 140 Variants Count:', p.variants.length);
    p.variants.forEach((v, i) => {
      console.log(`   Variant [${i + 1}] "${v.variant_name}":`);
      console.log(`     Primary Image: ${v.image_url}`);
      console.log(`     Images Array (${v.images?.length || 0}):`, v.images);
    });
  } else {
    console.error('❌ Failed to fetch product 140:', product140Data);
  }

  console.log('\n🔍 Verifying Product 141 (Press-On Nails)...');
  const req141 = { params: { id: '141' } };
  let product141Data = null;
  const res141 = {
    status: (code) => ({ json: (data) => console.log('res 141 status:', code, data) }),
    json: (payload) => { product141Data = payload; }
  };
  await getProduct(req141, res141, (err) => console.error(err));

  if (product141Data && product141Data.success) {
    const p = product141Data.data.product;
    console.log('✅ Product 141 Name:', p.name);
    console.log('✅ Product 141 Direct/Product-Level Images (' + p.images.length + '):', p.images.map(i => i.url));
    console.log('✅ Product 141 Variants Count:', p.variants.length);
    p.variants.forEach((v, i) => {
      console.log(`   Variant [${i + 1}] "${v.variant_name}":`);
      console.log(`     Primary Image: ${v.image_url}`);
      console.log(`     Images Array (${v.images?.length || 0}):`, v.images);
    });
  }

  console.log('\n🔍 Verifying Recommendations for Product 140 ("More like this")...');
  let recs140Data = null;
  const resRecs140 = {
    status: (code) => ({ json: (data) => console.log('res recs status:', code, data) }),
    json: (payload) => { recs140Data = payload; }
  };
  await getRecommendations(req140, resRecs140, (err) => console.error(err));

  if (recs140Data && recs140Data.success) {
    const recs = recs140Data.data || [];
    console.log(`✅ Recommendations Count: ${recs.length} products`);
    recs.forEach((r, idx) => {
      console.log(`   [${idx + 1}] ID: ${r.id} | "${r.name}" | Price: ₹${r.price} | Store: ${r.store_name} | Img: ${r.image_url}`);
    });
  } else {
    console.error('❌ Failed to fetch recommendations:', recs140Data);
  }

  process.exit(0);
}

verify().catch(e => {
  console.error('❌ Verification script error:', e);
  process.exit(1);
});
