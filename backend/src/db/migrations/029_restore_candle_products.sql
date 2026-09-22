-- Migration 029: Restore Figurine Candle Products & Deactivate Duplicate Candle Categories
-- Reverses the product reassignment from migration 026 and deactivates duplicate/legacy 'candles' category.

DO $$
DECLARE
  v_category_id categories.id%TYPE;
BEGIN
  -- 1. Look up 'candles-aromatherapy' category ID
  SELECT id INTO v_category_id FROM categories WHERE slug = 'candles-aromatherapy' AND is_active = TRUE LIMIT 1;

  IF v_category_id IS NOT NULL THEN
    -- Restore the 9 candle products back to 'candles-aromatherapy'
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

    -- 2. Safely reassign any products pointing to duplicate/legacy 'candles' category (or its subcategories) to 'candles-aromatherapy'
    UPDATE products
    SET category_id = v_category_id
    WHERE category_id IN (
      SELECT id FROM categories 
      WHERE ((slug ILIKE '%candle%' OR name ILIKE '%candle%') AND slug != 'candles-aromatherapy')
         OR parent_id IN (SELECT id FROM categories WHERE (slug ILIKE '%candle%' OR name ILIKE '%candle%') AND slug != 'candles-aromatherapy')
    );

    -- 3. Deactivate duplicate/legacy category and subcategory rows
    UPDATE categories
    SET is_active = FALSE
    WHERE (slug ILIKE '%candle%' OR name ILIKE '%candle%') AND slug != 'candles-aromatherapy';

    UPDATE categories
    SET is_active = FALSE
    WHERE parent_id IN (
      SELECT id FROM categories WHERE (slug ILIKE '%candle%' OR name ILIKE '%candle%') AND slug != 'candles-aromatherapy'
    );
  END IF;
END $$;
