/**
 * Tohfa v2 — Occasion Controller
 * File: src/controllers/occasion.controller.js
 * Role: HTTP handlers for buyer occasions (gift reminders) — list, create, update, delete.
 *       Supports field aliases (label/title/name, occasion_date/date, reminder_days).
 *       All SQL uses parameterized $1..$N syntax via the query() helper.
 */
'use strict';

const { query } = require('../config/db');

function formatOccasion(row) {
  if (!row) return null;
  const label = row.label || row.title || row.name || 'Special Occasion';
  const occasionDate = row.occasion_date || row.date;

  return {
    id: row.id,
    user_id: row.user_id,
    label: label,
    title: label,
    name: label,
    person_name: row.person_name || null,
    occasion_date: occasionDate,
    date: occasionDate,
    reminder_days: row.reminder_days !== undefined ? row.reminder_days : 7,
    created_at: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// GET /api/occasions & GET /api/occasion
// ---------------------------------------------------------------------------
async function getOccasions(req, res, next) {
  try {
    const userId = req.user.id;

    const { rows } = await query(
      `SELECT id, user_id, label, person_name, occasion_date, created_at
       FROM occasions
       WHERE user_id = $1
       ORDER BY occasion_date ASC`,
      [userId]
    );

    const occasions = rows.map(formatOccasion);
    return res.json({
      success: true,
      data: {
        occasions,
        total: occasions.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/occasions & POST /api/occasion/new
// ---------------------------------------------------------------------------
async function createOccasion(req, res, next) {
  try {
    const userId = req.user.id;
    const {
      label, title, name,
      person_name, recipient_name,
      occasion_date, date,
      reminder_days,
    } = req.body;

    const finalLabel = (label || title || name || 'Special Occasion').trim();
    const finalPersonName = (person_name || recipient_name || '').trim() || null;
    const finalDate = occasion_date || date;

    if (!finalDate) {
      return res.status(400).json({ success: false, message: 'Occasion date is required.' });
    }

    const { rows } = await query(
      `INSERT INTO occasions (user_id, label, person_name, occasion_date)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, label, person_name, occasion_date, created_at`,
      [userId, finalLabel, finalPersonName, finalDate]
    );

    return res.status(201).json({
      success: true,
      message: 'Occasion reminder saved successfully.',
      data: { occasion: formatOccasion(rows[0]) },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PUT /api/occasions/:id
// ---------------------------------------------------------------------------
async function updateOccasion(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const {
      label, title, name,
      person_name, recipient_name,
      occasion_date, date,
    } = req.body;

    const finalLabel = label || title || name || null;
    const finalPersonName = person_name !== undefined ? (person_name || recipient_name || null) : null;
    const finalDate = occasion_date || date || null;

    const { rows } = await query(
      `UPDATE occasions
       SET label         = COALESCE($1, label),
           person_name   = COALESCE($2, person_name),
           occasion_date = COALESCE($3, occasion_date)
       WHERE id = $4 AND user_id = $5
       RETURNING id, user_id, label, person_name, occasion_date, created_at`,
      [finalLabel ? finalLabel.trim() : null, finalPersonName, finalDate, id, userId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Occasion not found.' });
    }

    return res.json({
      success: true,
      message: 'Occasion updated successfully.',
      data: { occasion: formatOccasion(rows[0]) },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/occasions/:id
// ---------------------------------------------------------------------------
async function deleteOccasion(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { rowCount } = await query(
      'DELETE FROM occasions WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (!rowCount) {
      return res.status(404).json({ success: false, message: 'Occasion not found.' });
    }

    return res.json({ success: true, data: { message: 'Occasion deleted.' } });
  } catch (err) {
    next(err);
  }
}

module.exports = { getOccasions, createOccasion, updateOccasion, deleteOccasion };
