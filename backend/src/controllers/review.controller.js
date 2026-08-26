/**
 * Tohfa v2 — Review Controller
 * File: src/controllers/review.controller.js
 * Role: HTTP handlers for product/seller reviews — submit (delivered orders only,
 *       one per order), and list by seller or product.
 *       All SQL uses parameterized $1..$N syntax via the query() helper.
 */
'use strict';

const { query } = require('../config/db');
const { createNotification } = require('./notification.controller');

// Ensure review reply columns exist
let columnsChecked = false;
async function ensureReviewColumns() {
  if (columnsChecked) return;
  try {
    await query(`
      ALTER TABLE reviews 
      ADD COLUMN IF NOT EXISTS seller_reply TEXT,
      ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;
    `);
    columnsChecked = true;
  } catch (err) {
    // Column might already exist or permission error; continue safely
    columnsChecked = true;
  }
}

// ---------------------------------------------------------------------------
// POST /api/reviews
// ---------------------------------------------------------------------------
async function submitReview(req, res, next) {
  try {
    await ensureReviewColumns();
    const buyerId = req.user.id;
    const { order_id, orderId, product_id, productId, rating, comment, review } = req.body;

    const rawOrderId = order_id || orderId;
    const rawProductId = product_id || productId;
    const reviewRating = parseInt(rating, 10);
    const reviewComment = (comment || review || '').trim();

    if (!reviewRating || reviewRating < 1 || reviewRating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be an integer between 1 and 5.' });
    }

    let finalOrderId = rawOrderId;
    let finalSellerId = null;
    let finalProductId = rawProductId;

    if (finalOrderId) {
      // Verify order belongs to buyer and is delivered
      const { rows: orderRows } = await query(
        `SELECT o.id, o.seller_id, o.status, o.buyer_id
         FROM orders o
         WHERE o.id = $1 AND o.buyer_id = $2`,
        [finalOrderId, buyerId]
      );

      if (!orderRows.length || orderRows[0].status !== 'delivered') {
        return res.status(403).json({
          success: false,
          message: 'You can only review products you have purchased and received.',
        });
      }

      finalSellerId = orderRows[0].seller_id;

      if (!finalProductId) {
        const { rows: itemRows } = await query(
          'SELECT product_id FROM order_items WHERE order_id = $1 LIMIT 1',
          [finalOrderId]
        );
        finalProductId = itemRows[0]?.product_id || null;
      }
    } else if (finalProductId) {
      // Look up a delivered order containing this product purchased by the buyer
      const { rows: purchaseRows } = await query(
        `SELECT o.id AS order_id, o.seller_id
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         WHERE o.buyer_id = $1 AND oi.product_id = $2 AND o.status = 'delivered'
         ORDER BY o.delivered_at DESC NULLS LAST, o.created_at DESC
         LIMIT 1`,
        [buyerId, finalProductId]
      );

      if (!purchaseRows.length) {
        return res.status(403).json({
          success: false,
          message: 'You can only review products you have purchased and received.',
        });
      }

      finalOrderId = purchaseRows[0].order_id;
      finalSellerId = purchaseRows[0].seller_id;
    } else {
      return res.status(400).json({
        success: false,
        message: 'order_id or product_id is required to submit a verified review.',
      });
    }

    // Check if already reviewed for this order/product
    let existingQuery = 'SELECT id FROM reviews WHERE order_id = $1 AND buyer_id = $2';
    let existingParams = [finalOrderId, buyerId];

    if (finalProductId) {
      existingQuery = 'SELECT id FROM reviews WHERE buyer_id = $1 AND product_id = $2 AND order_id = $3';
      existingParams = [buyerId, finalProductId, finalOrderId];
    }

    const { rows: existing } = await query(existingQuery, existingParams).catch(async () => {
      return await query('SELECT id FROM reviews WHERE order_id = $1 AND buyer_id = $2', [finalOrderId, buyerId]);
    });

    if (existing.length) {
      return res.status(409).json({ success: false, message: 'You have already submitted a review for this purchase.' });
    }

    // Insert review
    let reviewRow;
    try {
      const { rows } = await query(
        `INSERT INTO reviews (order_id, product_id, buyer_id, seller_id, rating, comment)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, order_id, product_id, rating, comment, created_at`,
        [finalOrderId, finalProductId, buyerId, finalSellerId, reviewRating, reviewComment || null]
      );
      reviewRow = rows[0];
    } catch (insErr) {
      // Fallback if product_id column is omitted in older table
      const { rows } = await query(
        `INSERT INTO reviews (order_id, buyer_id, seller_id, rating, comment)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, order_id, rating, comment, created_at`,
        [finalOrderId, buyerId, finalSellerId, reviewRating, reviewComment || null]
      );
      reviewRow = rows[0];
    }

    // Update seller avg rating
    if (finalSellerId) {
      await query(
        `UPDATE seller_profiles
         SET avg_rating = (
           SELECT ROUND(AVG(rating)::numeric, 2)
           FROM reviews WHERE seller_id = $1
         ),
         review_count = (
           SELECT COUNT(*) FROM reviews WHERE seller_id = $1
         )
         WHERE user_id = $1`,
        [finalSellerId]
      ).catch(() => {});
    }

    return res.status(201).json({
      success: true,
      message: 'Verified review submitted successfully. Thank you for supporting handcrafted art!',
      data: { review: reviewRow },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/reviews/seller/:sellerId
// ---------------------------------------------------------------------------
async function getSellerReviews(req, res, next) {
  try {
    await ensureReviewColumns();
    const { sellerId } = req.params;
    const { page = '1', limit = '20' } = req.query;
    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(50, parseInt(limit, 10));
    const offset   = (pageNum - 1) * limitNum;

    const { rows } = await query(
      `SELECT r.id, r.order_id, r.rating, r.comment, r.seller_reply, r.replied_at, r.created_at,
              u.name AS buyer_name, u.profile_photo_url AS buyer_photo
       FROM reviews r
       JOIN users u ON u.id = r.buyer_id
       WHERE r.seller_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [sellerId, limitNum, offset]
    );

    const { rows: statsRows } = await query(
      `SELECT COUNT(*) AS total,
              ROUND(AVG(rating)::numeric, 2) AS avg_rating
       FROM reviews WHERE seller_id = $1`,
      [sellerId]
    );

    return res.json({
      success: true,
      data: {
        reviews: rows,
        total: parseInt(statsRows[0]?.total || 0, 10),
        avg_rating: parseFloat(statsRows[0]?.avg_rating) || 0,
        page: pageNum,
        limit: limitNum,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/reviews/product/:productId
// ---------------------------------------------------------------------------
async function getProductReviews(req, res, next) {
  try {
    await ensureReviewColumns();
    const { productId } = req.params;
    const { page = '1', limit = '20' } = req.query;
    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(50, parseInt(limit, 10));
    const offset   = (pageNum - 1) * limitNum;

    // Resolve seller_id for this product
    const { rows: pRows } = await query(
      'SELECT seller_id FROM products WHERE id = $1',
      [productId]
    );
    if (!pRows.length) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    // Reviews joined via order_items to find reviews for orders containing this product
    const { rows } = await query(
      `SELECT DISTINCT r.id, r.order_id, r.rating, r.comment, r.seller_reply, r.replied_at, r.created_at,
              u.name AS buyer_name, u.profile_photo_url AS buyer_photo
       FROM reviews r
       JOIN order_items oi ON oi.order_id = r.order_id AND oi.product_id = $1
       JOIN users u ON u.id = r.buyer_id
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [productId, limitNum, offset]
    );

    const { rows: statsRows } = await query(
      `SELECT COUNT(DISTINCT r.id) AS total,
              ROUND(AVG(r.rating)::numeric, 2) AS avg_rating
       FROM reviews r
       JOIN order_items oi ON oi.order_id = r.order_id AND oi.product_id = $1`,
      [productId]
    );

    return res.json({
      success: true,
      data: {
        reviews: rows,
        total: parseInt(statsRows[0]?.total || 0, 10),
        avg_rating: parseFloat(statsRows[0]?.avg_rating) || 0,
        page: pageNum,
        limit: limitNum,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/seller/reviews/:id/reply and POST /api/reviews/:id/reply
// ---------------------------------------------------------------------------
async function replyToReview(req, res, next) {
  try {
    await ensureReviewColumns();
    const { id } = req.params;
    const sellerId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const replyText = req.body.reply || req.body.seller_reply || req.body.comment;

    if (!replyText || !String(replyText).trim()) {
      return res.status(400).json({ success: false, message: 'Reply content is required.' });
    }

    // Verify review exists and seller owns it
    const { rows: reviewRows } = await query(
      'SELECT id, seller_id, buyer_id, order_id FROM reviews WHERE id = $1',
      [id]
    );

    if (!reviewRows.length) {
      return res.status(404).json({ success: false, message: 'Review not found.' });
    }

    const review = reviewRows[0];

    if (review.seller_id !== sellerId && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You can only reply to reviews for your own store/products.',
      });
    }

    const { rows: updatedRows } = await query(
      `UPDATE reviews
       SET seller_reply = $1, replied_at = NOW()
       WHERE id = $2
       RETURNING id, order_id, seller_id, buyer_id, rating, comment, seller_reply, replied_at`,
      [replyText.trim(), id]
    );

    const updatedReview = updatedRows[0];

    // Notify buyer
    if (review.buyer_id) {
      await createNotification(
        review.buyer_id,
        'review_reply',
        'Artisan Replied to Your Review 💬',
        `The artisan posted a response to your review on Order #${String(review.order_id).substring(0, 8).toUpperCase()}.`,
        { review_id: id, order_id: review.order_id, seller_reply: replyText.trim() }
      ).catch(e => console.warn('[Review Reply] Notification trigger failed:', e.message));
    }

    return res.json({
      success: true,
      message: 'Reply posted successfully',
      data: {
        review_id: id,
        reply: replyText.trim(),
        replied_at: updatedReview?.replied_at || new Date(),
        review: updatedReview,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { submitReview, getSellerReviews, getProductReviews, replyToReview };

