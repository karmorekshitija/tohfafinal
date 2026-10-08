/**
 * Tohfa v2 — Tanya AI Assistant Controller
 * File: backend/src/controllers/tanya.controller.js
 * Role: HTTP endpoint for Gemini-powered gift recommendations and concierge chat.
 */
'use strict';

const tanyaService = require('../services/tanya.service');

/**
 * POST /api/tanya/chat
 * POST /api/tanya/message
 */
async function chat(req, res, next) {
  try {
    const { message, prompt, conversationHistory, history = [] } = req.body;
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

    const MAX_HISTORY_TURNS = 20;
    const safeHistory = Array.isArray(conversationHistory || history) 
      ? (conversationHistory || history).slice(-MAX_HISTORY_TURNS) 
      : [];

    const result = await tanyaService.chat(userMessage, safeHistory);

    if (!result.success) {
      return res.status(result.statusCode || 500).json({
        success: false,
        message: result.message
      });
    }

    return res.json({
      success: true,
      data: {
        reply: result.data.reply,
        message: result.data.reply,
        products: result.data.products || [],
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  chat,
};
