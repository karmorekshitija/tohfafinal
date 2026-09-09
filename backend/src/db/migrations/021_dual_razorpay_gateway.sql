-- Migration: 018_dual_razorpay_gateway.sql
-- Description: Add gateway_account to payments table to support multi-account failover / dual Razorpay gateways.

ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_account VARCHAR(20) DEFAULT 'primary';

CREATE INDEX IF NOT EXISTS idx_payments_gateway_account ON payments(gateway_account);
