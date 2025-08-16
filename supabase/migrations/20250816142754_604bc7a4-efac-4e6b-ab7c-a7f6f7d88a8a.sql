-- Remove wholesale_price column from products table
ALTER TABLE products DROP COLUMN IF EXISTS wholesale_price;