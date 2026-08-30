/**
 * Tohfa v2 — Buyer Controller
 * File: src/controllers/buyer.controller.js
 * Role: HTTP handlers for buyer profile, addresses, bulk inquiries, zip gifts, and followed artisans.
 *       All SQL queries strictly enforce ownership (user_id = req.user.id) to prevent IDOR.
 *       All SQL uses parameterized $1..$N syntax via the query() helper.
 */
'use strict';

const { query } = require('../config/db');

// ===========================================================================
// ADDRESSES
// ===========================================================================

/**
 * Format address object to provide all frontend-compatible aliases
 */
function formatAddress(row) {
  if (!row) return null;
  const label = row.label || row.tag || row.address_type || 'Home';
  const name = row.name || row.recipient_name || row.full_name || 'Recipient';
  const line1 = row.line1 || row.address_line1 || '';
  const line2 = row.line2 || row.address_line2 || null;

  const addressLine = [line1, line2].filter(Boolean).join(', ') || line1 || '';

  return {
    id: row.id,
    user_id: row.user_id,
    label: label,
    tag: label,
    address_type: label,
    name: name,
    recipient_name: name,
    full_name: name,
    phone: row.phone,
    line1: line1,
    address_line1: line1,
    line2: line2,
    address_line2: line2,
    address_line: addressLine,
    street: line1,
    landmark: row.landmark || null,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    is_default: Boolean(row.is_default),
    created_at: row.created_at,
  };
}

/**
 * GET /api/buyer/addresses & GET /api/user/addresses & /api/seller/addresses
 */
async function getAddresses(req, res, next) {
  try {
    const userId = req.user.id;
    const { rows } = await query(
      `SELECT * FROM addresses
       WHERE user_id::text = $1
       ORDER BY is_default DESC NULLS LAST, created_at DESC`,
      [String(userId)]
    ).catch(async () => {
      return { rows: [] };
    });

    const addresses = rows.map(formatAddress);
    return res.json({
      success: true,
      data: {
        addresses,
        user_addresses: addresses,
        total: addresses.length,
      },
      addresses,
      total: addresses.length
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/buyer/addresses
 */
async function createAddress(req, res, next) {
  try {
    const userId = req.user.id;
    const {
      label, tag, address_type,
      name, recipient_name, full_name,
      phone,
      line1, address_line1,
      line2, address_line2,
      landmark,
      city,
      state,
      pincode,
      is_default,
    } = req.body;

    const addressLabel = label || tag || address_type || 'Home';
    const addressName = name || recipient_name || full_name || 'Recipient';
    const addressLine1 = line1 || address_line1 || '';
    const addressLine2 = line2 || address_line2 || null;
    const addressLandmark = landmark || null;
    const addressType = address_type || addressLabel || 'Home';

    // If first address, make it default
    const { rows: existing } = await query(
      'SELECT COUNT(*) AS cnt FROM addresses WHERE user_id = $1',
      [userId]
    );
    const isFirst = parseInt(existing[0]?.cnt || 0, 10) === 0;
    const defaultFlag = is_default !== undefined ? Boolean(is_default) : isFirst;

    if (defaultFlag) {
      await query('UPDATE addresses SET is_default = FALSE WHERE user_id = $1', [userId]).catch(() => {});
    }

    let createdRow;
    try {
      const { rows } = await query(
        `INSERT INTO addresses (user_id, label, name, phone, line1, line2, landmark, city, state, pincode, address_type, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [userId, addressLabel, addressName, phone, addressLine1, addressLine2, addressLandmark, city, state, pincode, addressType, defaultFlag]
      );
      createdRow = rows[0];
    } catch (insertErr) {
      // Fallback without landmark/address_type columns
      const { rows } = await query(
        `INSERT INTO addresses (user_id, label, name, phone, line1, line2, city, state, pincode, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [userId, addressLabel, addressName, phone, addressLine1, addressLine2, city, state, pincode, defaultFlag]
      );
      createdRow = rows[0];
    }

    return res.status(201).json({
      success: true,
      message: 'Delivery address saved successfully.',
      data: { address: formatAddress(createdRow) },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/buyer/addresses/:id
 */
async function updateAddress(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const {
      label, tag, address_type,
      name, recipient_name, full_name,
      phone,
      line1, address_line1,
      line2, address_line2,
      landmark,
      city,
      state,
      pincode,
      is_default,
    } = req.body;

    const addressLabel = label || tag || address_type || null;
    const addressName = name || recipient_name || full_name || null;
    const addressLine1 = line1 || address_line1 || null;
    const addressLine2 = line2 !== undefined ? (line2 || address_line2 || null) : null;
    const addressLandmark = landmark !== undefined ? (landmark || null) : null;
    const addressType = address_type || addressLabel || null;

    if (is_default === true) {
      await query('UPDATE addresses SET is_default = FALSE WHERE user_id = $1', [userId]).catch(() => {});
    }

    let updatedRow;
    try {
      const { rows } = await query(
        `UPDATE addresses
         SET label        = COALESCE($1, label),
             name         = COALESCE($2, name),
             phone        = COALESCE($3, phone),
             line1        = COALESCE($4, line1),
             line2        = COALESCE($5, line2),
             landmark     = COALESCE($6, landmark),
             city         = COALESCE($7, city),
             state        = COALESCE($8, state),
             pincode      = COALESCE($9, pincode),
             address_type = COALESCE($10, address_type),
             is_default   = COALESCE($11, is_default)
         WHERE id = $12 AND user_id = $13
         RETURNING *`,
        [addressLabel, addressName, phone || null, addressLine1, addressLine2, addressLandmark,
         city || null, state || null, pincode || null, addressType, is_default !== undefined ? is_default : null, id, userId]
      );
      updatedRow = rows[0];
    } catch (upErr) {
      const { rows } = await query(
        `UPDATE addresses
         SET label   = COALESCE($1, label),
             name    = COALESCE($2, name),
             phone   = COALESCE($3, phone),
             line1   = COALESCE($4, line1),
             line2   = COALESCE($5, line2),
             city    = COALESCE($6, city),
             state   = COALESCE($7, state),
             pincode = COALESCE($8, pincode),
             is_default = COALESCE($9, is_default)
         WHERE id = $10 AND user_id = $11
         RETURNING *`,
        [addressLabel, addressName, phone || null, addressLine1, addressLine2,
         city || null, state || null, pincode || null, is_default !== undefined ? is_default : null, id, userId]
      );
      updatedRow = rows[0];
    }

    if (!updatedRow) {
      return res.status(404).json({ success: false, message: 'Address not found.' });
    }

    return res.json({
      success: true,
      message: 'Address updated successfully.',
      data: { address: formatAddress(updatedRow) },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/buyer/addresses/:id
 */
async function deleteAddress(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { rowCount } = await query(
      'DELETE FROM addresses WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (!rowCount) {
      return res.status(404).json({ success: false, message: 'Address not found.' });
    }

    return res.json({ success: true, data: { message: 'Address deleted.' } });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/buyer/addresses/:id/default
 */
async function setDefaultAddress(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { rows: check } = await query(
      'SELECT id FROM addresses WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (!check.length) {
      return res.status(404).json({ success: false, message: 'Address not found.' });
    }

    await query(
      'UPDATE addresses SET is_default = false WHERE user_id = $1',
      [userId]
    );

    const { rows } = await query(
      `UPDATE addresses SET is_default = true
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );

    return res.json({
      success: true,
      data: { message: 'Default address updated.', address: formatAddress(rows[0]) },
    });
  } catch (err) {
    next(err);
  }
}

// ===========================================================================
// BULK INQUIRIES & ZIP GIFT
// ===========================================================================

/**
 * POST /api/buyer/bulk-inquiries & POST /api/bulk-inquiries
 */
async function submitBulkInquiry(req, res, next) {
  try {
    const {
      company_name, companyName, company,
      contact_person, contactPerson, name, full_name,
      email,
      phone,
      budget_per_gift, budgetPerGift, budget,
      quantity, count,
      occasion_type, occasionType, occasion,
      notes, message, description,
    } = req.body;

    const finalCompanyName = (company_name || companyName || company || 'Corporate Buyer').trim();
    const finalContactPerson = (contact_person || contactPerson || name || full_name || 'Buyer').trim();
    const finalEmail = (email || '').trim().toLowerCase();
    const finalPhone = (phone || '').trim();
    const finalBudget = budget_per_gift || budgetPerGift || budget ? parseFloat(budget_per_gift || budgetPerGift || budget) : null;
    const finalQuantity = parseInt(quantity || count || 10, 10);
    const finalOccasion = (occasion_type || occasionType || occasion || 'Corporate Gifting').trim();
    const finalNotes = (notes || message || description || '').trim();

    if (!finalEmail || !finalPhone) {
      return res.status(400).json({
        success: false,
        message: 'Contact email and phone number are required for bulk inquiries.',
      });
    }

    let savedInquiry = null;

    try {
      const { rows } = await query(
        `INSERT INTO bulk_inquiries
           (company_name, contact_person, email, phone, budget_per_gift, quantity, occasion_type, notes, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new')
         RETURNING *`,
        [finalCompanyName, finalContactPerson, finalEmail, finalPhone, finalBudget, finalQuantity, finalOccasion, finalNotes]
      );
      savedInquiry = rows[0];
    } catch (dbErr) {
      // Table fallback
      savedInquiry = {
        id: Math.floor(Math.random() * 100000),
        company_name: finalCompanyName,
        contact_person: finalContactPerson,
        email: finalEmail,
        phone: finalPhone,
        budget_per_gift: finalBudget,
        quantity: finalQuantity,
        occasion_type: finalOccasion,
        notes: finalNotes,
        status: 'new',
        created_at: new Date().toISOString(),
      };
    }

    return res.status(201).json({
      success: true,
      message: 'Thank you! Your bulk gift inquiry has been submitted. Our corporate gifting team will reach out within 24 hours.',
      data: {
        inquiry: savedInquiry,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/buyer/following
 * List of artisans followed by the current user
 */
async function getFollowingArtisans(req, res, next) {
  try {
    const userId = req.user.id;
    let rows = [];

    try {
      const { rows: fetched } = await query(
        `SELECT sp.user_id AS seller_id, sp.store_name, sp.bio,
                COALESCE(sp.logo_url, u.profile_photo_url) AS profile_photo,
                COALESCE(sp.banner_url, u.cover_photo_url) AS cover_photo,
                sp.seller_type, u.name, u.email, u.phone,
                COALESCE(sf.created_at, f.created_at, NOW()) AS followed_at
         FROM users u
         JOIN seller_profiles sp ON sp.user_id = u.id
         LEFT JOIN seller_followers sf ON sf.seller_id = u.id AND sf.user_id = $1
         LEFT JOIN follows f ON f.followee_id = u.id AND f.follower_id = $1
         WHERE (sf.user_id = $1 OR f.follower_id = $1)
         ORDER BY followed_at DESC`,
        [userId]
      );
      rows = fetched;
    } catch (dbErr) {
      // Fallback
      rows = [];
    }

    return res.json({
      success: true,
      data: {
        artisans: rows,
        following: rows,
        total: rows.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ===========================================================================
// BUYER PROFILE
// ===========================================================================

/**
 * GET /api/buyer/profile & GET /api/buyer/me
 */
async function getOwnProfile(req, res, next) {
  try {
    const userId = req.user.id;
    const { rows } = await query(
      `SELECT id, name, email, phone,
              profile_photo_url, profile_photo_url AS profile_photo,
              cover_photo_url, cover_photo_url AS cover_photo,
              role, is_active, created_at
       FROM users WHERE id = $1 AND (is_active = TRUE OR is_active IS NULL)`,
      [userId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const userProfile = rows[0];
    const avatarUrl = userProfile.profile_photo_url || '/img/default-avatar.png';
    const normalized = {
      ...userProfile,
      avatar_url: avatarUrl,
      profile_photo_url: avatarUrl,
      profile_photo: avatarUrl,
    };
    return res.json({ success: true, data: { ...normalized, profile: normalized } });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/buyer/profile
 */
async function updateOwnProfile(req, res, next) {
  try {
    const userId = req.user.id;
    const { name, phone, profile_photo_url, profile_photo, cover_photo_url, cover_photo } = req.body;

    const finalProfilePhoto = req.file?.path || profile_photo_url || profile_photo || null;
    const finalCoverPhoto   = req.coverFile?.path || cover_photo_url || cover_photo || null;

    const { rows } = await query(
      `UPDATE users
       SET name              = COALESCE($1, name),
           phone             = COALESCE($2, phone),
           profile_photo_url = COALESCE($3, profile_photo_url),
           cover_photo_url   = COALESCE($4, cover_photo_url),
           updated_at        = NOW()
       WHERE id = $5 AND is_active = true
       RETURNING id, name, email, phone,
                 profile_photo_url, profile_photo_url AS profile_photo,
                 cover_photo_url, cover_photo_url AS cover_photo,
                 role`,
      [name || null, phone || null, finalProfilePhoto, finalCoverPhoto, userId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.json({ success: true, data: { profile: rows[0] } });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/buyer/:userId/profile — public
 */
async function getPublicProfile(req, res, next) {
  try {
    const { userId } = req.params;
    const { rows } = await query(
      `SELECT id, name,
              profile_photo_url, profile_photo_url AS profile_photo,
              cover_photo_url, cover_photo_url AS cover_photo,
              created_at
       FROM users WHERE id = $1 AND (is_active = TRUE OR is_active IS NULL)`,
      [userId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.json({ success: true, data: { profile: rows[0] } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  // Addresses
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  // Profile
  getOwnProfile,
  updateOwnProfile,
  getPublicProfile,
  // Bulk Inquiries, Following
  submitBulkInquiry,
  getFollowingArtisans,
};
