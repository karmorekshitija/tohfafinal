-- Migration 026: Recategorise Figurine Candles
-- One-time data migration moved out of server boot auto_sync.js into an idempotent migration.

DO $$
DECLARE
  v_category_id INTEGER;
BEGIN
  SELECT id INTO v_category_id FROM categories WHERE slug = 'handcrafted-figurines' AND is_active = TRUE LIMIT 1;

  IF v_category_id IS NOT NULL THEN
    UPDATE products 
    SET category_id = v_category_id
    WHERE name IN (
      'Stacked Puppies Candle',
      'Golden Retriever Round Candle',
      'Chess Knight Horse Candle',
      'Stacked Owls Candle',
      'Swan Relief Pillar Candle',
      'Mother & Child Relief Candle',
      'Madonna Bust Candle',
      'Enchanted Cottage Candle',
      'Embracing Couple Candle'
    )
    AND (category_id IS NULL OR category_id != v_category_id);
  END IF;
END $$;
