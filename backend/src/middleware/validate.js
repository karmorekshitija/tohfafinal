/**
 * Tohfa v2 — Request Validation Middleware
 * File: backend/src/middleware/validate.js
 * Role: Joi-based request body/query/param validation.
 *       Usage: router.post('/path', validate(schema), controller)
 */
'use strict';

const Joi = require('joi');

/**
 * Validate req.body against a Joi schema.
 * Throws a 400 error if validation fails.
 * @param {import('joi').ObjectSchema} schema
 * @param {'body'|'query'|'params'} target
 */
function validate(schema, target = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[target], {
      abortEarly: true,     // stop at first error
      stripUnknown: true,   // remove unknown fields
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message.replace(/"/g, ''),
        field:   error.details[0].context?.key,
      });
    }

    req[target] = value;   // replace with sanitized values
    next();
  };
}

// ---------------------------------------------------------------------------
// SHARED SCHEMAS — reused across multiple routes
// ---------------------------------------------------------------------------

const schemas = {
  // Auth
  register: Joi.object({
    name:            Joi.string().trim().min(2).max(150).optional(),
    full_name:       Joi.string().trim().min(2).max(150).optional(),
    email:           Joi.string().email().lowercase().trim().required(),
    password:        Joi.string().min(6).max(128).required(),
    phone:           Joi.string().optional().allow('', null),
    role:            Joi.string().valid('buyer', 'seller', 'admin', 'master_admin').default('buyer'),
    storeName:       Joi.string().trim().max(200).optional().allow(''),
    store_name:      Joi.string().trim().max(200).optional().allow(''),
    craftSpecialty:  Joi.string().trim().max(200).optional().allow(''),
    craft_specialty: Joi.string().trim().max(200).optional().allow(''),
    bio:             Joi.string().trim().max(1000).optional().allow(''),
  }).or('name', 'full_name'),

  signupSeller: Joi.object({
    name:            Joi.string().trim().min(2).max(150).optional(),
    full_name:       Joi.string().trim().min(2).max(150).optional(),
    email:           Joi.string().email().lowercase().trim().required(),
    password:        Joi.string().min(6).max(128).required(),
    phone:           Joi.string().optional().allow('', null),
    storeName:       Joi.string().trim().max(200).optional().allow(''),
    store_name:      Joi.string().trim().max(200).optional().allow(''),
    craftSpecialty:  Joi.string().trim().max(200).optional().allow(''),
    craft_specialty: Joi.string().trim().max(200).optional().allow(''),
    bio:             Joi.string().trim().max(1000).optional().allow(''),
  }).or('name', 'full_name'),

  login: Joi.object({
    email:      Joi.string().lowercase().trim().optional().allow(''),
    username:   Joi.string().trim().optional().allow(''),
    identifier: Joi.string().trim().optional().allow(''),
    phone:      Joi.string().trim().optional().allow(''),
    password:   Joi.string().required(),
  }).or('email', 'username', 'identifier', 'phone'),

  adminLogin: Joi.object({
    email:      Joi.string().lowercase().trim().optional().allow(''),
    username:   Joi.string().trim().optional().allow(''),
    identifier: Joi.string().trim().optional().allow(''),
    password:   Joi.string().required(),
  }).or('email', 'username', 'identifier'),

  forgotPassword: Joi.object({
    email: Joi.string().email().lowercase().trim().required(),
  }),

  resetPassword: Joi.object({
    token:    Joi.string().required(),
    password: Joi.string().min(6).max(128).required(),
  }),

  // Product
  createProduct: Joi.object({
    name:                Joi.string().trim().min(3).max(200).required(),
    description:         Joi.string().trim().max(5000).optional().allow(''),
    category_id:         Joi.string().uuid().optional().allow(null, ''),
    base_price:          Joi.number().min(0).required(),
    stock_quantity:      Joi.number().integer().min(0).default(10),
    low_stock_threshold: Joi.number().integer().min(0).default(3),
    customization_mode:  Joi.string().valid('none', 'fixed', 'open').default('none'),
  }),

  // Address
  address: Joi.object({
    label:          Joi.string().trim().max(50).optional().allow(''),
    tag:            Joi.string().trim().max(50).optional().allow(''),
    address_type:   Joi.string().trim().max(50).optional().allow(''),
    name:           Joi.string().trim().min(2).max(100).optional(),
    recipient_name: Joi.string().trim().min(2).max(100).optional(),
    full_name:      Joi.string().trim().min(2).max(100).optional(),
    phone:          Joi.string().pattern(/^[0-9+\s-]{8,20}$/).required(),
    line1:          Joi.string().trim().min(2).max(200).optional(),
    address_line1:  Joi.string().trim().min(2).max(200).optional(),
    line2:          Joi.string().trim().max(200).optional().allow(''),
    address_line2:  Joi.string().trim().max(200).optional().allow(''),
    landmark:       Joi.string().trim().max(200).optional().allow(''),
    city:           Joi.string().trim().min(2).max(100).required(),
    state:          Joi.string().trim().min(2).max(100).required(),
    pincode:        Joi.string().pattern(/^\d{6}$/).required(),
    is_default:     Joi.boolean().optional(),
  }).or('name', 'recipient_name', 'full_name').or('line1', 'address_line1'),

  // Occasion
  occasion: Joi.object({
    label:          Joi.string().trim().min(2).max(100).optional(),
    title:          Joi.string().trim().min(2).max(100).optional(),
    name:           Joi.string().trim().min(2).max(100).optional(),
    person_name:    Joi.string().trim().max(100).optional().allow(''),
    occasion_date:  Joi.date().iso().optional(),
    date:           Joi.date().iso().optional(),
    reminder_days:  Joi.number().integer().min(0).max(90).optional(),
  }).or('label', 'title', 'name').or('occasion_date', 'date'),

  // Review
  review: Joi.object({
    order_id:  Joi.string().uuid().required(),
    rating:    Joi.number().integer().min(1).max(5).required(),
    comment:   Joi.string().trim().max(1000).optional().allow(''),
  }),

  // Customization request (buyer)
  customizationRequest: Joi.object({
    product_id:   Joi.string().uuid().required(),
    requirements: Joi.object().required(),
    budget:       Joi.number().min(0).optional(),
    deadline:     Joi.date().iso().optional(),
  }),

  // Customization quote (seller)
  customizationQuote: Joi.object({
    quote_amount:     Joi.number().min(0).required(),
    quote_turnaround: Joi.string().trim().max(100).required(),
  }),

  // Cart item
  cartItem: Joi.object({
    product_id:        Joi.string().uuid().required(),
    variant_id:        Joi.string().uuid().optional().allow(null),
    quantity:          Joi.number().integer().min(1).max(99).default(1),
    customization_data: Joi.object().optional().allow(null),
  }),

  // Open customization config (seller)
  openCustomizationConfig: Joi.object({
    allowed_types:      Joi.array().items(Joi.string()).min(1).required(),
    instructions:       Joi.string().trim().max(1000).optional().allow(''),
    ref_image_mode:     Joi.string().valid('required', 'optional', 'na').default('optional'),
    budget_min:         Joi.number().min(0).optional().allow(null),
    budget_max:         Joi.number().min(0).optional().allow(null),
    turnaround_days:    Joi.string().trim().max(100).optional().allow(''),
    quote_window_hours: Joi.number().integer().min(1).max(168).default(48),
  }),
};

module.exports = { validate, schemas };
