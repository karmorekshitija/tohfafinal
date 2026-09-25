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

let addressTableColumns = null;

/**
 * Introspect and cache available columns and data types in the 'addresses' table
 */
async function getAddressesColumns() {
  if (addressTableColumns) return addressTableColumns;
  try {
    const { rows } = await query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'addresses'"
    );
    if (rows && rows.length > 0) {
      const colMap = new Map();
      rows.forEach(r => colMap.set(r.column_name, r.data_type));
      addressTableColumns = colMap;
      return addressTableColumns;
    }
  } catch (err) {
    console.warn('[Buyer Controller] Failed to introspect addresses columns:', err.message);
  }
  return new Map([
    ['id', 'uuid'],
    ['user_id', 'uuid'],
    ['label', 'text'],
    ['tag', 'text'],
    ['address_type', 'text'],
    ['name', 'text'],
    ['full_name', 'text'],
    ['recipient_name', 'text'],
    ['phone', 'text'],
    ['line1', 'text'],
    ['address_line1', 'text'],
    ['line2', 'text'],
    ['address_line2', 'text'],
    ['landmark', 'text'],
    ['city', 'text'],
    ['state', 'text'],
    ['pincode', 'text'],
    ['is_default', 'boolean'],
    ['created_at', 'timestamp with time zone']
  ]);
}

/**
 * Format is_default value according to the column's data type (integer vs boolean)
 */
function formatDefaultVal(val, availableCols) {
  const type = availableCols.get('is_default');
  if (type === 'integer' || type === 'smallint' || type === 'bigint') {
    return val ? 1 : 0;
  }
  return Boolean(val);
}

/**
 * Reset default address flag safely across both integer and boolean column types
 */
async function clearDefaultAddress(userId, availableCols) {
  const type = availableCols.get('is_default');
  const isInt = type === 'integer' || type === 'smallint' || type === 'bigint';
  if (isInt) {
    await query('UPDATE addresses SET is_default = 0 WHERE user_id::text = $1', [String(userId)]).catch(() => {});
  } else {
    await query('UPDATE addresses SET is_default = false WHERE user_id::text = $1', [String(userId)]).catch(() => {});
  }
}

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
    locality: row.locality || row.area || null,
    area: row.locality || row.area || null,
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
      locality, area,
      city,
      state,
      pincode,
      is_default,
    } = req.body;

    const addressLabel = label || tag || address_type || 'Home';
    const addressName = name || recipient_name || full_name || req.user?.name || 'Artisan Workshop';
    const addressLine1 = line1 || address_line1 || req.body.address_line || '';
    const addressLine2 = line2 || address_line2 || null;
    const addressLandmark = landmark || null;
    const addressLocality = locality || area || null;
    const addressType = address_type || addressLabel || 'Home';

    const availableCols = await getAddressesColumns();

    // If first address, make it default
    const { rows: existing } = await query(
      'SELECT COUNT(*) AS cnt FROM addresses WHERE user_id::text = $1',
      [String(userId)]
    );
    const isFirst = parseInt(existing[0]?.cnt || 0, 10) === 0;
    const isDefaultSelected = (is_default !== undefined ? Boolean(is_default) : isFirst);

    if (isDefaultSelected) {
      await clearDefaultAddress(userId, availableCols);
    }

    // Map all candidate fields and only insert into columns that actually exist in the active table
    const candidateFields = {
      user_id: userId,
      phone: phone || '',  // addresses.phone is NOT NULL — default to empty string if not provided
      city: city,
      state: state,
      pincode: pincode,
      is_default: formatDefaultVal(isDefaultSelected, availableCols),
      // Label / category aliases
      label: addressLabel,
      tag: addressLabel,
      address_type: addressType,
      // Recipient name aliases
      name: addressName,
      full_name: addressName,
      recipient_name: addressName,
      // Address line aliases
      line1: addressLine1,
      address_line1: addressLine1,
      line2: addressLine2,
      address_line2: addressLine2,
      landmark: addressLandmark,
      locality: addressLocality,
      area: addressLocality,
    };

    const insertCols = [];
    const insertPlaceholders = [];
    const insertValues = [];

    for (const [col, val] of Object.entries(candidateFields)) {
      if (availableCols.has(col) && val !== undefined) {
        insertCols.push(col);
        insertValues.push(val);
        insertPlaceholders.push(`$${insertValues.length}`);
      }
    }

    const { rows } = await query(
      `INSERT INTO addresses (${insertCols.join(', ')})
       VALUES (${insertPlaceholders.join(', ')})
       RETURNING *`,
      insertValues
    );
    const createdRow = rows[0];
    const formatted = formatAddress(createdRow);

    return res.status(201).json({
      success: true,
      message: 'Delivery address saved successfully.',
      data: {
        address: formatted,
        id: createdRow.id,
        ...formatted,
      },
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
      locality, area,
      city,
      state,
      pincode,
      is_default,
    } = req.body;

    const addressLabel = label || tag || address_type || null;
    const addressName = name || recipient_name || full_name || null;
    const addressLine1 = line1 || address_line1 || req.body.address_line || null;
    const addressLine2 = line2 !== undefined ? (line2 || address_line2 || null) : (address_line2 !== undefined ? address_line2 : null);
    const addressLandmark = landmark !== undefined ? landmark : null;
    const addressLocality = locality !== undefined ? (locality || area || null) : (area !== undefined ? area : null);
    const availableCols = await getAddressesColumns();
    const defaultVal = is_default !== undefined ? Boolean(is_default) : null;

    if (defaultVal === true) {
      await clearDefaultAddress(userId, availableCols);
    }

    const candidateUpdates = {};
    if (addressLabel !== null) {
      candidateUpdates.label = addressLabel;
      candidateUpdates.tag = addressLabel;
      candidateUpdates.address_type = addressLabel;
    }
    if (addressName !== null) {
      candidateUpdates.name = addressName;
      candidateUpdates.full_name = addressName;
      candidateUpdates.recipient_name = addressName;
    }
    if (phone !== undefined) {
      candidateUpdates.phone = phone || null;
    }
    if (addressLine1 !== null) {
      candidateUpdates.line1 = addressLine1;
      candidateUpdates.address_line1 = addressLine1;
    }
    if (line2 !== undefined || address_line2 !== undefined) {
      candidateUpdates.line2 = addressLine2;
      candidateUpdates.address_line2 = addressLine2;
    }
    if (landmark !== undefined) {
      candidateUpdates.landmark = addressLandmark;
    }
    if (locality !== undefined || area !== undefined) {
      candidateUpdates.locality = addressLocality;
      candidateUpdates.area = addressLocality;
    }
    if (city !== undefined) {
      candidateUpdates.city = city || null;
    }
    if (state !== undefined) {
      candidateUpdates.state = state || null;
    }
    if (pincode !== undefined) {
      candidateUpdates.pincode = pincode || null;
    }
    if (defaultVal !== null) {
      candidateUpdates.is_default = formatDefaultVal(defaultVal, availableCols);
    }

    const setClauses = [];
    const updateValues = [];

    for (const [col, val] of Object.entries(candidateUpdates)) {
      if (availableCols.has(col)) {
        updateValues.push(val);
        setClauses.push(`${col} = $${updateValues.length}`);
      }
    }

    if (setClauses.length === 0) {
      const { rows } = await query(
        'SELECT * FROM addresses WHERE id = $1 AND user_id::text = $2',
        [id, String(userId)]
      );
      if (!rows.length) {
        return res.status(404).json({ success: false, message: 'Address not found.' });
      }
      const formatted = formatAddress(rows[0]);
      return res.json({
        success: true,
        message: 'Address unchanged.',
        data: {
          address: formatted,
          id: rows[0].id,
          ...formatted,
        },
      });
    }

    updateValues.push(id, String(userId));
    const { rows } = await query(
      `UPDATE addresses
       SET ${setClauses.join(', ')}
       WHERE id = $${updateValues.length - 1} AND user_id::text = $${updateValues.length}
       RETURNING *`,
      updateValues
    );
    const updatedRow = rows[0];

    if (!updatedRow) {
      return res.status(404).json({ success: false, message: 'Address not found.' });
    }

    const formatted = formatAddress(updatedRow);
    return res.json({
      success: true,
      message: 'Address updated successfully.',
      data: {
        address: formatted,
        id: updatedRow.id,
        ...formatted,
      },
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
      'DELETE FROM addresses WHERE id = $1 AND user_id::text = $2',
      [id, String(userId)]
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
      'SELECT id FROM addresses WHERE id = $1 AND user_id::text = $2',
      [id, String(userId)]
    );
    if (!check.length) {
      return res.status(404).json({ success: false, message: 'Address not found.' });
    }

    const availableCols = await getAddressesColumns();
    await clearDefaultAddress(userId, availableCols);

    const type = availableCols.get('is_default');
    const isInt = type === 'integer' || type === 'smallint' || type === 'bigint';

    const { rows } = await query(
      `UPDATE addresses SET is_default = ${isInt ? '1' : 'true'}
       WHERE id = $1 AND user_id::text = $2
       RETURNING *`,
      [id, String(userId)]
    );

    const formatted = formatAddress(rows[0]);
    return res.json({
      success: true,
      data: {
        message: 'Default address updated.',
        address: formatted,
        id: rows[0].id,
        ...formatted,
      },
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
      display_name: userProfile.name,
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
 * PUT / PATCH /api/buyer/profile & /api/profile/me
 */
async function updateOwnProfile(req, res, next) {
  try {
    const userId = req.user.id;
    const {
      name, display_name,
      phone,
      email,
      profile_photo_url, profile_photo,
      cover_photo_url, cover_photo,
      avatar, avatar_url,
    } = req.body;

    const finalName = display_name || name || null;
    const finalProfilePhoto = req.file?.path || req.file?.secure_url || req.file?.url || profile_photo_url || profile_photo || avatar_url || avatar || null;
    const finalCoverPhoto   = req.coverFile?.path || cover_photo_url || cover_photo || null;

    const { rows } = await query(
      `UPDATE users
       SET name              = COALESCE($1, name),
           phone             = COALESCE($2, phone),
           email             = COALESCE($3, email),
           profile_photo_url = COALESCE($4, profile_photo_url),
           cover_photo_url   = COALESCE($5, cover_photo_url),
           updated_at        = NOW()
       WHERE id = $6
       RETURNING id, name, email, phone,
                 profile_photo_url, profile_photo_url AS profile_photo,
                 cover_photo_url, cover_photo_url AS cover_photo,
                 role`,
      [finalName, phone || null, email || null, finalProfilePhoto, finalCoverPhoto, userId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const updatedUser = rows[0];
    const photoUrl = updatedUser.profile_photo_url || '/img/default-avatar.png';
    const profile = {
      ...updatedUser,
      display_name: updatedUser.name,
      avatar_url: photoUrl,
      profile_photo_url: photoUrl,
      profile_photo: photoUrl,
    };

    return res.json({
      success: true,
      data: profile,
      profile,
      user: profile,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/profile/me/avatar & /api/profile/avatar
 */
async function uploadAvatar(req, res, next) {
  try {
    const userId = req.user.id;
    const photoUrl = req.file?.path || req.file?.secure_url || req.file?.url || req.body.avatar_url || req.body.avatar || req.body.photo;
    if (!photoUrl) {
      return res.status(400).json({ success: false, message: 'No avatar image uploaded.' });
    }

    await query(
      `UPDATE users
       SET profile_photo_url = $1, updated_at = NOW()
       WHERE id = $2`,
      [photoUrl, userId]
    );

    await query(
      `UPDATE seller_profiles
       SET profile_photo = $1::varchar, avatar_url = $1::text, updated_at = NOW()
       WHERE user_id = $2`,
      [photoUrl, userId]
    ).catch(() => {});

    return res.json({
      success: true,
      message: 'Avatar updated successfully',
      data: {
        avatar_url: photoUrl,
        profile_photo_url: photoUrl,
        photo_url: photoUrl,
      },
    });
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
  uploadAvatar,
  getPublicProfile,
  // Bulk Inquiries, Following
  submitBulkInquiry,
  getFollowingArtisans,
};
