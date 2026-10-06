/**
 * Verification test for Bug 6: Product Variant Editing and Parity
 * Tests that updateProduct and upsertVariants accept variant payloads with
 * variant_name, additional_price, stock_qty, images array, and image_url,
 * and that getProduct returns them accurately.
 */
'use strict';

const { query } = require('../src/config/db');
const { createProduct, updateProduct, getProduct, upsertVariants } = require('../src/controllers/product.controller');

async function runTests() {
  console.log('🧪 Starting Bug 6 Variant Editing Verification Tests...\n');

  // Step 1: Find test seller and category
  const { rows: sellers } = await query('SELECT id, user_id FROM sellers LIMIT 1');
  const testSeller = sellers[0];
  const sellerId = testSeller?.user_id || testSeller?.id || 1;
  const { rows: categories } = await query('SELECT id FROM categories LIMIT 1');
  const categoryId = categories[0]?.id || 1;
  console.log(`👤 Using seller user_id: ${sellerId}, seller_id: ${testSeller?.id}, category_id: ${categoryId}`);

  let createdProductId = null;

  try {
    // Step 2: Create product with initial variants
    console.log('\n--- 1. Creating Product with Initial Variant ---');
    const mockReqCreate = {
      user: { id: sellerId, role: 'seller' },
      seller: testSeller,
      body: {
        name: 'Artisan Ceramic Vase ' + Date.now(),
        description: 'Handcrafted glazed vase with distinct finishes.',
        base_price: 1200,
        stock_quantity: 15,
        category_id: categoryId,
        variants: [
          {
            variant_name: 'Glossy White / Small',
            additional_price: 0,
            stock_qty: 10,
            images: ['https://example.com/vase-white-1.jpg', 'https://example.com/vase-white-2.jpg']
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
      if (err) throw err;
    });

    createdProductId = createResponse?.data?.data?.product?.id;
    if (!createdProductId) {
      throw new Error('Failed to create initial product: ' + JSON.stringify(createResponse));
    }
    console.log(`✅ Product created with ID: ${createdProductId}`);

    // Step 3: Test updateProduct (simulating PATCH /api/seller/listings/:id and PUT /api/products/:id)
    console.log('\n--- 2. Updating Product Variants via updateProduct (PATCH/PUT) ---');
    const updatedVariants = [
      {
        variant_name: 'Glossy White / Medium',
        additional_price: 250,
        stock_qty: 8,
        images: ['https://example.com/vase-white-med-1.jpg', 'https://example.com/vase-white-med-2.jpg', 'https://example.com/vase-white-med-3.jpg'],
        image_url: 'https://example.com/vase-white-med-1.jpg'
      },
      {
        variant_name: 'Terracotta Matte / Large',
        additional_price: 500,
        stock_qty: 4,
        images: ['https://example.com/vase-terracotta-1.jpg'],
        image_url: 'https://example.com/vase-terracotta-1.jpg'
      }
    ];

    const mockReqUpdate = {
      params: { id: String(createdProductId) },
      user: { id: sellerId, role: 'seller' },
      seller: testSeller,
      body: {
        price: 1350,
        stock: 12,
        variants: updatedVariants
      }
    };

    let updateResponse = null;
    const mockResUpdate = {
      status: (code) => ({
        json: (data) => { updateResponse = { code, data }; }
      }),
      json: (data) => { updateResponse = { code: 200, data }; }
    };

    await updateProduct(mockReqUpdate, mockResUpdate, (err) => {
      if (err) throw err;
    });

    if (!updateResponse || updateResponse.code >= 400) {
      throw new Error('updateProduct failed: ' + JSON.stringify(updateResponse));
    }
    console.log('✅ updateProduct successfully processed variant updates');

    // Step 4: Verify with getProduct (simulating GET /api/seller/listings/:id)
    console.log('\n--- 3. Verifying Variants Output in getProduct ---');
    const mockReqGet = { params: { id: String(createdProductId) } };
    let getResponse = null;
    const mockResGet = {
      status: (code) => ({
        json: (data) => { getResponse = { code, data }; }
      }),
      json: (data) => { getResponse = { code: 200, data }; }
    };

    await getProduct(mockReqGet, mockResGet, (err) => {
      if (err) throw err;
    });

    const fetchedProduct = getResponse?.data?.data?.product || getResponse?.data?.product;
    if (!fetchedProduct || !Array.isArray(fetchedProduct.variants)) {
      throw new Error('getProduct returned invalid variants: ' + JSON.stringify(getResponse));
    }

    console.log(`✅ getProduct returned ${fetchedProduct.variants.length} variants`);
    if (fetchedProduct.variants.length !== 2) {
      throw new Error(`Expected 2 variants, got ${fetchedProduct.variants.length}`);
    }

    const [v1, v2] = fetchedProduct.variants;
    console.log('   Variant 1:', {
      name: v1.variant_name,
      additional_price: v1.additional_price,
      stock_qty: v1.stock_qty,
      image_url: v1.image_url,
      images_count: v1.images?.length
    });

    if (v1.variant_name !== 'Glossy White / Medium') throw new Error('v1 name mismatch');
    if (Number(v1.additional_price) !== 250) throw new Error('v1 additional_price mismatch');
    if (Number(v1.stock_qty) !== 8) throw new Error('v1 stock_qty mismatch');
    if (v1.images.length !== 3) throw new Error('v1 images count mismatch');
    if (v1.image_url !== 'https://example.com/vase-white-med-1.jpg') throw new Error('v1 image_url mismatch');

    console.log('   Variant 2:', {
      name: v2.variant_name,
      additional_price: v2.additional_price,
      stock_qty: v2.stock_qty,
      image_url: v2.image_url,
      images_count: v2.images?.length
    });

    if (v2.variant_name !== 'Terracotta Matte / Large') throw new Error('v2 name mismatch');
    if (Number(v2.additional_price) !== 500) throw new Error('v2 additional_price mismatch');
    if (Number(v2.stock_qty) !== 4) throw new Error('v2 stock_qty mismatch');
    if (v2.images.length !== 1) throw new Error('v2 images count mismatch');

    // Step 5: Test upsertVariants route (POST /api/products/:id/variants)
    console.log('\n--- 4. Testing POST /api/products/:id/variants (upsertVariants) ---');
    const upsertVariantsList = [
      {
        variant_name: 'Glossy Cobalt Blue / Solo Size',
        additional_price: 400,
        stock_qty: 6,
        images: ['https://example.com/vase-blue-1.jpg', 'https://example.com/vase-blue-2.jpg']
      }
    ];

    const mockReqUpsert = {
      params: { id: String(createdProductId) },
      user: { id: sellerId, role: 'seller' },
      seller: testSeller,
      body: { variants: upsertVariantsList }
    };

    let upsertResponse = null;
    const mockResUpsert = {
      status: (code) => ({
        json: (data) => { upsertResponse = { code, data }; }
      }),
      json: (data) => { upsertResponse = { code: 200, data }; }
    };

    await upsertVariants(mockReqUpsert, mockResUpsert, (err) => {
      if (err) throw err;
    });

    if (!upsertResponse || upsertResponse.code >= 400) {
      throw new Error('upsertVariants failed: ' + JSON.stringify(upsertResponse));
    }
    console.log('✅ upsertVariants accepted payload and succeeded');

    // Verify again with getProduct
    await getProduct(mockReqGet, mockResGet, (err) => {
      if (err) throw err;
    });

    const finalProduct = getResponse?.data?.data?.product || getResponse?.data?.product;
    if (finalProduct.variants.length !== 1 || finalProduct.variants[0].variant_name !== 'Glossy Cobalt Blue / Solo Size') {
      throw new Error('upsertVariants result verification failed');
    }
    console.log('✅ Successfully verified upsertVariants updated variants');

  } finally {
    // Step 6: Cleanup
    console.log('\n--- 5. Cleanup ---');
    if (createdProductId) {
      await query('DELETE FROM product_variants WHERE product_id = $1', [createdProductId]);
      await query('DELETE FROM products WHERE id = $1', [createdProductId]);
      console.log(`✅ Deleted test product ${createdProductId}`);
    }
  }

  console.log('\n🎉 ALL BUG 6 VARIANT EDITING VERIFICATION TESTS PASSED!\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
