-- Migration: 031_fix_category_parent_hierarchy.sql
-- Description: Disconnect top-level independent categories from parent hierarchies (e.g. couples)
-- Set independent top-level categories to have parent_id = NULL

UPDATE categories 
SET parent_id = NULL 
WHERE parent_id IS NOT NULL 
  AND slug IN (
    'anniversary-gifts', 
    'candles', 
    'customized-gifts', 
    'flowers', 
    'hampers', 
    'home-decor',
    'ceramics',
    'woodcraft',
    'jewellery',
    'skincare',
    'art-prints'
  );
