-- Migration 024: remove alternate-format copies of the same product image.
-- Keep the earliest row when only the file extension differs (for example .JPG/.webp).

DELETE FROM product_images duplicate
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY product_id,
             LOWER(REGEXP_REPLACE(SPLIT_PART(url, '?', 1), '\.(jpe?g|png|webp)$', '', 'i'))
           ORDER BY sort_order, created_at, id
         ) AS row_number
  FROM product_images
) ranked
WHERE duplicate.id = ranked.id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_images_product_normalized_url
  ON product_images (
    product_id,
    LOWER(REGEXP_REPLACE(SPLIT_PART(url, '?', 1), '\.(jpe?g|png|webp)$', '', 'i'))
  );
