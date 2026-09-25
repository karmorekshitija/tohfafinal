/**
 * Tohfa v2 — Tanya AI Assistant Controller
 * File: backend/src/controllers/tanya.controller.js
 * Role: HTTP endpoint for Gemini-powered gift recommendations.
 */
'use strict';

const tanyaService = require('../services/tanya.service');

/**
 * POST /api/tanya/chat
 * POST /api/tanya/message
 * Public endpoint (rate-limited)
 */
async function chat(req, res, next) {
  try {
    const { message, prompt, history = [] } = req.body;
    const userMessage = (message || prompt || '').trim();

    if (!userMessage) {
      return res.status(400).json({
        success: false,
        message: 'Message is required.',
      });
    }

    if (userMessage.length > 600) {
      return res.status(400).json({
        success: false,
        message: 'Message exceeds maximum length of 600 characters.',
      });
    }

    // S-07: Cap history to last 20 turns to prevent input token-bomb attacks
    const MAX_HISTORY_TURNS = 20;
    const safeHistory = Array.isArray(history) ? history.slice(-MAX_HISTORY_TURNS) : [];

    const { reply, products = [] } = await tanyaService.chat(userMessage, safeHistory);
    return res.json({
      success: true,
      data: {
        reply,
        message: reply,
        products,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  chat,
};

