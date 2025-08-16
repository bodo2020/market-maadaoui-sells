-- Add wholesale_price column to products table
ALTER TABLE products ADD COLUMN wholesale_price DECIMAL(10,2) DEFAULT 0;