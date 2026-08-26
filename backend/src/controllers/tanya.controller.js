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

    const reply = await tanyaService.chat(userMessage, history);
    return res.json({
      success: true,
      data: {
        reply,
        message: reply,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  chat,
};

