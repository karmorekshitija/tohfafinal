/**
 * Tohfa v2 — Customization Controller
 * File: backend/src/controllers/customization.controller.js
 * Role: HTTP handlers for Open Customization configuration, buyer requests,
 *       seller quote generation, and buyer checkout conversion.
 */
'use strict';

const customizationService = require('../services/customization.service');
const { query } = require('../config/db');

/**
 * GET /api/customization/config/:productId
 * Public: returns seller-configured customization boundaries
 */
async function getConfig(req, res, next) {
  try {
    const { productId } = req.params;
    const config = await customizationService.getConfigForProduct(productId);
    return res.json({ success: true, data: config });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/customization/config
 * Seller saves/updates questions and constraints for a product
 */
async function saveConfig(req, res, next) {
  try {
    const sellerId = req.user.id;
    const { product_id, ...configData } = req.body;
    const result = await customizationService.saveConfig(product_id, sellerId, configData);
    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}


/**
 * POST /api/customization/proof
 * POST /api/customization/orders/:orderId/items/:itemId/proof
 * Seller uploads sample proof mockup / artwork URL
 */
async function uploadProof(req, res, next) {
  try {
    const sellerId = req.user.id;
    const itemId = req.params.itemId || req.body.itemId || req.body.orderItemId || req.body.order_item_id;
    const proofUrl = req.file ? req.file.path : (req.body.proof_image_url || req.body.proofImageUrl || req.body.proofUrl || req.body.image_url);
    const notes = req.body.notes || req.body.description || '';

    if (!itemId) {
      return res.status(400).json({ success: false, message: 'Item ID is required.' });
    }
    if (!proofUrl) {
      return res.status(400).json({ success: false, message: 'Proof image or proof_image_url is required.' });
    }

    const updated = await customizationService.uploadProof(itemId, sellerId, proofUrl, notes);
    return res.status(200).json({
      success: true,
      message: 'Proof uploaded successfully. Customer notified for approval.',
      data: updated
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/customization/proof/approve
 * POST /api/customization/orders/:orderId/items/:itemId/proof-status (when action=approve or status=buyer_approved)
 * Buyer approves proof
 */
async function approveProof(req, res, next) {
  try {
    const buyerId = req.user.id;
    const itemId = req.params.itemId || req.body.itemId || req.body.orderItemId || req.body.order_item_id;
    const feedback = req.body.feedback || req.body.notes || '';

    if (!itemId) {
      return res.status(400).json({ success: false, message: 'Item ID is required.' });
    }

    const updated = await customizationService.approveProof(itemId, buyerId, feedback);
    return res.status(200).json({
      success: true,
      message: 'Proof approved successfully. Artisan has been notified to begin crafting.',
      data: updated
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/customization/proof/reject
 * Buyer rejects proof and requests changes
 */
async function rejectProof(req, res, next) {
  try {
    const buyerId = req.user.id;
    const itemId = req.params.itemId || req.body.itemId || req.body.orderItemId || req.body.order_item_id;
    const reason = req.body.reason || req.body.feedback || req.body.notes || '';

    if (!itemId) {
      return res.status(400).json({ success: false, message: 'Item ID is required.' });
    }

    const updated = await customizationService.rejectProof(itemId, buyerId, reason);
    return res.status(200).json({
      success: true,
      message: 'Revision requested. Artisan has been notified.',
      data: updated
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST / PATCH /api/customization/orders/:orderId/items/:itemId/proof-status
 * Generic status transition handler for 5-step lifecycle
 */
async function updateProofStatus(req, res, next) {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const itemId = req.params.itemId || req.body.itemId || req.body.orderItemId;
    const { status, action, reason, feedback } = req.body;

    let targetStatus = status;
    if (action === 'approve' || action === 'buyer_approved') {
      targetStatus = 'buyer_approved';
    } else if (action === 'reject' || action === 'rejected') {
      targetStatus = 'pending_proof';
    }

    if (!targetStatus) {
      return res.status(400).json({ success: false, message: 'Status or action is required.' });
    }

    if (targetStatus === 'buyer_approved') {
      const updated = await customizationService.approveProof(itemId, userId, feedback);
      return res.json({ success: true, message: 'Proof approved.', data: updated });
    }

    if (targetStatus === 'pending_proof' && (reason || feedback || action === 'reject')) {
      const updated = await customizationService.rejectProof(itemId, userId, reason || feedback);
      return res.json({ success: true, message: 'Proof revision requested.', data: updated });
    }

    const updated = await customizationService.updateProofStatus(itemId, userId, userRole, targetStatus, req.body);
    return res.json({ success: true, message: `Status updated to ${targetStatus}.`, data: updated });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/customization/orders/:orderId/items/:itemId/proof
 * GET /api/customization/proof/:itemId
 * View proof details
 */
async function getProof(req, res, next) {
  try {
    const itemId = req.params.itemId || req.params.id;
    const result = await customizationService.getProofDetails(itemId, req.user.id, req.user.role);
    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getConfig,
  saveConfig,
  uploadProof,
  approveProof,
  rejectProof,
  updateProofStatus,
  getProof,
  getProofDetails: getProof,
};

