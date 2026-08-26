/**
 * Tohfa v2 - Database Seed Script
 * File: backend/src/db/seed.js
 * Run: node backend/src/db/seed.js  (from project root)
 *
 * Creates: 4 categories, demo buyer, demo seller, admin user, 4 sample products
 */

"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const bcrypt = require("bcrypt");
const { pool, query } = require("../config/db");

const SALT_ROUNDS = 10;

async function seed() {
  console.log("\n Tohfa Seed Script Starting...\n");

  // CATEGORIES
  console.log("Seeding categories...");
  const categories = [
    { name: "Handmade Jewelry", slug: "handmade-jewelry", sort_order: 1 },
    { name: "Home Decor",       slug: "home-decor",       sort_order: 2 },
    { name: "Festive Gifts",    slug: "festive-gifts",     sort_order: 3 },
    { name: "Custom Art",       slug: "custom-art",        sort_order: 4 },
  ];

  const categoryIds = {};
  for (const cat of categories) {
    const { rows } = await query(
      `INSERT INTO categories (name, slug, sort_order, is_active)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order
       RETURNING id, name`,
      [cat.name, cat.slug, cat.sort_order]
    );
    categoryIds[cat.slug] = rows[0].id;
    console.log("  Category: " + rows[0].name);
  }

  // SELLER USER
  console.log("\nSeeding demo seller...");
  const sellerHash = await bcrypt.hash("Password@123", SALT_ROUNDS);
  const { rows: sellerRows } = await query(
    `INSERT INTO users (name, email, password_hash, role, phone, is_active)
     VALUES ($1, $2, $3, 'seller', $4, TRUE)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name, email`,
    ["Artisan Ananya", "seller@thetohfa.in", sellerHash, "9876543210"]
  );
  const seller = sellerRows[0];
  console.log("  Seller: " + seller.email);

  await query(
    `INSERT INTO seller_profiles
       (user_id, store_name, bio, whatsapp_number, seller_type, is_approved, store_visibility)
     VALUES ($1, $2, $3, $4, 'regular', TRUE, TRUE)
     ON CONFLICT (user_id) DO UPDATE
       SET store_name = EXCLUDED.store_name, is_approved = TRUE`,
    [seller.id, "Ananya Artisan Studio", "Handcrafted jewelry from the heart of Rajasthan.", "9876543210"]
  );

  // BUYER USER
  console.log("\nSeeding demo buyer...");
  const buyerHash = await bcrypt.hash("Password@123", SALT_ROUNDS);
  const { rows: buyerRows } = await query(
    `INSERT INTO users (name, email, password_hash, role, phone, is_active)
     VALUES ($1, $2, $3, 'buyer', $4, TRUE)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name, email`,
    ["Rahul Buyer", "buyer@thetohfa.in", buyerHash, "9123456789"]
  );
  console.log("  Buyer: " + buyerRows[0].email);

  // ADMIN USER
  console.log("\nSeeding admin...");
  const adminEmail = process.env.ADMIN_EMAIL || "admin@thetohfa.in";
  const adminPassword = process.env.ADMIN_PASSWORD || "AdminTohfa@2026";
  const adminHash = await bcrypt.hash(adminPassword, SALT_ROUNDS);
  const { rows: adminRows } = await query(
    `INSERT INTO users (name, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, 'admin', TRUE)
     ON CONFLICT (email) DO UPDATE SET role = 'admin'
     RETURNING id, name, email`,
    ["Tohfa Admin", adminEmail, adminHash]
  );
  console.log("  Admin: " + adminRows[0].email);

  // SAMPLE PRODUCTS
  console.log("\nSeeding sample products...");
  const sampleProducts = [
    {
      name: "Handcrafted Silver Filigree Earrings",
      description: "Delicate silver filigree earrings handcrafted by skilled artisans in Rajasthan. Each pair is unique and made using traditional techniques passed down through generations. Perfect as a thoughtful gift for someone special.",
      base_price: 1299,
      category_slug: "handmade-jewelry",
      customization_mode: "fixed",
      image_url: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800&q=80",
    },
    {
      name: "Handpainted Terracotta Vase Set",
      description: "A beautiful set of 3 terracotta vases hand-painted with traditional Indian motifs. These stunning pieces bring warmth and artisan character to any living space. Each vase is individually crafted and painted, making them truly unique home decor items.",
      base_price: 2499,
      category_slug: "home-decor",
      customization_mode: "none",
      image_url: "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=800&q=80",
    },
    {
      name: "Diya and Rangoli Festival Gift Box",
      description: "Celebrate every festival with this beautifully curated gift box featuring 6 handcrafted clay diyas, premium rangoli colors, and a personalized handwritten card. Thoughtfully packaged in a reusable bamboo box. Perfect for Diwali and Navratri.",
      base_price: 899,
      category_slug: "festive-gifts",
      customization_mode: "fixed",
      image_url: "https://images.unsplash.com/photo-1604849329176-f9b43e0e8e5e?w=800&q=80",
    },
    {
      name: "Custom Portrait Illustration",
      description: "Commission a beautifully illustrated custom portrait of you, your family, or pets. Available in watercolor, line art, and bold pop-art styles. Delivered as a high-resolution digital file within 5-7 days. Makes an incredibly personal and lasting gift.",
      base_price: 1899,
      category_slug: "custom-art",
      customization_mode: "open",
      image_url: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=800&q=80",
    },
  ];

  for (const p of sampleProducts) {
    const catId = categoryIds[p.category_slug];
    const { rows: prodRows } = await query(
      `INSERT INTO products
         (seller_id, name, description, category_id, base_price, customization_mode, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       RETURNING id, name`,
      [seller.id, p.name, p.description, catId, p.base_price, p.customization_mode]
    );
    const product = prodRows[0];
    await query(
      `INSERT INTO product_images (product_id, url, sort_order)
       VALUES ($1, $2, 0)`,
      [product.id, p.image_url]
    );
    console.log("  Product: " + product.name + " (Rs " + p.base_price + ")");
  }

  console.log("\n Seed completed!\n");
  console.log("Demo credentials:");
  console.log("  Buyer:  buyer@thetohfa.in  / Password@123");
  console.log("  Seller: seller@thetohfa.in / Password@123");
  console.log("  Admin:  " + adminEmail + " / " + adminPassword + "\n");

  await pool.end();
}

seed().catch((err) => {
  console.error("\nSeed failed:", err.message);
  process.exit(1);
});
