-- Migration: 038_whatsapp_outbox.sql
-- Description: Creates whatsapp_outbox, whatsapp_opt_outs, marketing opt-in fields on users,
--              and manual-mode tracking columns.

CREATE TABLE IF NOT EXISTS whatsapp_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('seller_new_order', 'buyer_quote', 'buyer_proof', 'occasion_reminder', 'autoreply')),
  idempotency_key TEXT NOT NULL,
  recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  intended_to TEXT,
  sent_to TEXT,
  template_name TEXT,
  variables JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','sending','sent','delivered','read','failed',
    'suppressed','manual_pending','manual_done',
    'invalid_number','opted_out','no_consent'
  )),
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  provider_message_id TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  owner_email_status TEXT DEFAULT 'pending',
  owner_email_attempts INT NOT NULL DEFAULT 0,
  owner_emailed_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ,
  manual_done_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_outbox_idempotency_key ON whatsapp_outbox(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_status_next_attempt ON whatsapp_outbox(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_provider_message_id ON whatsapp_outbox(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_status_created ON whatsapp_outbox(status, created_at);

CREATE TABLE IF NOT EXISTS whatsapp_opt_outs (
  phone10 TEXT PRIMARY KEY,
  opted_out_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_marketing_opt_in_at TIMESTAMPTZ;

-- Idempotent additions for existing deployments that already ran the first version
ALTER TABLE whatsapp_outbox ADD COLUMN IF NOT EXISTS owner_email_status TEXT DEFAULT 'pending';
ALTER TABLE whatsapp_outbox ADD COLUMN IF NOT EXISTS owner_email_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE whatsapp_outbox ADD COLUMN IF NOT EXISTS owner_emailed_at TIMESTAMPTZ;
ALTER TABLE whatsapp_outbox ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;
ALTER TABLE whatsapp_outbox ADD COLUMN IF NOT EXISTS manual_done_at TIMESTAMPTZ;

-- Expand status CHECK to include manual_pending and manual_done
ALTER TABLE whatsapp_outbox DROP CONSTRAINT IF EXISTS whatsapp_outbox_status_check;
ALTER TABLE whatsapp_outbox ADD CONSTRAINT whatsapp_outbox_status_check
  CHECK (status IN (
    'pending','sending','sent','delivered','read','failed',
    'suppressed','manual_pending','manual_done',
    'invalid_number','opted_out','no_consent'
  ));
