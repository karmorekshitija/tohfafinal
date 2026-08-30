/**
 * Verification test for generic (non-color-specific) product variants
 */
'use strict';

const { query } = require('../src/config/db');
const { createProduct, getProduct } = require('../src/controllers/product.controller');

async function runTests() {
  console.log('🧪 Starting Generic Variants Verification Tests...\n');

  // Step 1: Find a test seller
  const { rows: sellers } = await query('SELECT id, user_id FROM seller_profiles LIMIT 1');
  const sellerId = sellers[0]?.user_id || 1;
  console.log(`👤 Using seller user_id: ${sellerId}`);

  // Step 2: Test Create Product with non-color variants
  console.log('\n--- 1. Testing Product Creation with Non-Color Variants ---');
  let createdProductId = null;
  const mockReqCreate = {
    user: { id: sellerId, role: 'seller' },
    seller: { id: sellerId },
    body: {
      name: 'Custom Oak Coffee Table ' + Date.now(),
      description: 'Handcrafted solid oak coffee table with size and finish options.',
      base_price: 4999.00,
      stock_quantity: 20,
      category_id: null,
      variants: [
        {
          variant_name: 'Size: Standard (100x60cm)',
          additional_price: 0,
          stock_qty: 10,
          images: ['/img/products/table-standard-1.jpeg', '/img/products/table-standard-2.jpeg']
        },
        {
          variant_name: 'Size: Large (120x70cm) / Finish: Walnut Stain',
          additional_price: 1500,
          stock_qty: 5,
          images: ['/img/products/table-large-1.jpeg']
        },
        {
          variant_label: 'Material: Reclaimed Teak / Style: Nordic',
          additional_price: 2500,
          stock_qty: 5
        }
      ]
    }
  };

  let createResponse = null;
  const mockResCreate = {
    status: (code) => ({
      json: (data) => { createResponse = { code, data }; }
    }),
    json: (data) => { createResponse = { code: 200, data }; }
  };

  await createProduct(mockReqCreate, mockResCreate, (err) => {
    console.error('❌ Error during createProduct:', err);
  });

  if (!createResponse || !createResponse.data?.data?.product) {
    throw new Error('Failed to create product: ' + JSON.stringify(createResponse));
  }

  createdProductId = createResponse.data.data.product.id;
  console.log(`✅ Product created with ID: ${createdProductId}`);

  // Step 3: Fetch the product and verify variants structure
  console.log('\n--- 2. Testing Product Detail API Output ---');
  const mockReqGet = { params: { id: String(createdProductId) } };
  let getResponse = null;
  const mockResGet = {
    status: (code) => ({
      json: (data) => { getResponse = { code, data }; }
    }),
    json: (data) => { getResponse = { code: 200, data }; }
  };

  await getProduct(mockReqGet, mockResGet, (err) => {
    console.error('❌ Error during getProduct:', err);
  });

  const product = getResponse?.data?.data?.product || getResponse?.data?.product;
  if (!product) {
    throw new Error('Failed to fetch product details: ' + JSON.stringify(getResponse));
  }

  console.log(`✅ Fetched Product: "${product.name}"`);
  console.log(`✅ Total Variants: ${product.variants?.length}`);

  if (product.variants.length !== 3) {
    throw new Error(`Expected 3 variants, found ${product.variants.length}`);
  }

  // Verify variant 1
  const v1 = product.variants[0];
  console.log(`   [Variant 1]:`, {
    variant_name: v1.variant_name,
    color_name: v1.color_name,
    color_hex: v1.color_hex,
    additional_price: v1.additional_price,
    stock_qty: v1.stock_qty,
    images: v1.images
  });
  if (v1.variant_name !== 'Size: Standard (100x60cm)') throw new Error('Variant 1 name mismatch');
  if (v1.color_name !== null) throw new Error('Variant 1 color_name should be null');
  if (v1.color_hex !== null) throw new Error('Variant 1 color_hex should be null');
  if (v1.images.length !== 2) throw new Error('Variant 1 images count mismatch');

  // Verify variant 2
  const v2 = product.variants[1];
  console.log(`   [Variant 2]:`, {
    variant_name: v2.variant_name,
    color_name: v2.color_name,
    color_hex: v2.color_hex,
    additional_price: v2.additional_price,
    stock_qty: v2.stock_qty,
    images: v2.images
  });
  if (v2.variant_name !== 'Size: Large (120x70cm) / Finish: Walnut Stain') throw new Error('Variant 2 name mismatch');
  if (Number(v2.additional_price) !== 1500) throw new Error('Variant 2 additional_price mismatch');

  // Verify variant 3 (created with variant_label alias)
  const v3 = product.variants[2];
  console.log(`   [Variant 3]:`, {
    variant_name: v3.variant_name,
    color_name: v3.color_name,
    color_hex: v3.color_hex,
    additional_price: v3.additional_price,
    stock_qty: v3.stock_qty
  });
  if (v3.variant_name !== 'Material: Reclaimed Teak / Style: Nordic') throw new Error('Variant 3 name mismatch');

  // Step 4: Test Cart addition with generic variant
  console.log('\n--- 3. Testing Cart Item Association with Generic Variant ---');
  const { rows: buyerUser } = await query('SELECT id FROM users LIMIT 1');
  const buyerId = buyerUser[0]?.id || sellerId;

  try {
    // Insert cart item
    await query(
      `INSERT INTO cart_items (user_id, buyer_id, product_id, variant_id, quantity)
       VALUES ($1, $1, $2, $3, 1)`,
      [buyerId, createdProductId, v2.id]
    );

    const { rows: cartRows } = await query(
      `SELECT ci.id, ci.variant_id, pv.variant_name, pv.additional_price
       FROM cart_items ci
       LEFT JOIN product_variants pv ON pv.id = ci.variant_id
       WHERE ci.buyer_id = $1 AND ci.product_id = $2`,
      [buyerId, createdProductId]
    );

    console.log(`✅ Cart item linked to variant:`, cartRows[0]);
    if (cartRows[0].variant_name !== 'Size: Large (120x70cm) / Finish: Walnut Stain') {
      throw new Error('Cart item variant_name mismatch');
    }
  } finally {
    // Step 5: Clean up test product
    console.log('\n--- 4. Cleanup ---');
    if (createdProductId) {
      await query('DELETE FROM cart_items WHERE product_id = $1', [createdProductId]);
      await query('DELETE FROM product_variants WHERE product_id = $1', [createdProductId]);
      await query('DELETE FROM products WHERE id = $1', [createdProductId]);
      console.log('✅ Test product cleaned up successfully.');
    }
  }

  // Also clean up any lingering test product 253 or 254
  await query("DELETE FROM products WHERE name LIKE 'Custom Oak Coffee Table%'");

  console.log('\n🎉 ALL GENERIC VARIANT VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
