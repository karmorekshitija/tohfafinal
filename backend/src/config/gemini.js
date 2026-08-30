/**
 * Tohfa v2 — Google Gemini AI Client
 * File: backend/src/config/gemini.js
 * Role: Initializes Gemini generative model with safe dev fallback.
 */
'use strict';
const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY;
let geminiModel = null;

if (apiKey && apiKey !== 'YOUR_GEMINI_API_KEY') {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  } catch (e) {
    console.warn('[Gemini] Init skipped:', e.message);
  }
}

module.exports = { geminiModel };
