-- Add brand to products and color to categories

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS brand text;

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS color text;
