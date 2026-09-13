-- Migration 023: persist unpaid busy-artisan order requests.

CREATE TABLE IF NOT EXISTS overflow_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  address_id    UUID REFERENCES addresses(id) ON DELETE SET NULL,
  cart_item_ids UUID[] NOT NULL DEFAULT '{}',
  items_snapshot JSONB NOT NULL DEFAULT '[]',
  total_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'declined', 'converted', 'cancelled')),
  seller_note   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_overflow_orders_buyer_id ON overflow_orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_overflow_orders_seller_status ON overflow_orders(seller_id, status);
