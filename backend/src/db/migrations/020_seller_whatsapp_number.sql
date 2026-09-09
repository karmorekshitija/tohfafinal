-- Migration 020: add whatsapp_number to seller_profiles and sellers tables
-- Safe: uses ADD COLUMN IF NOT EXISTS, no data loss possible

ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
