-- Migration: 037_set_special_shops_capacity_limit.sql
-- Description: Expand concurrent order capacity limit of Tohfa Special admin-managed shops to 1000 orders each.

UPDATE seller_profiles
SET capacity_limit = 1000
WHERE seller_type = 'special'
   OR is_admin_managed = TRUE
   OR is_tohfa_original = TRUE
   OR store_name IN ('The Candle Story', 'Nails Diva', 'Crochet Lady');
