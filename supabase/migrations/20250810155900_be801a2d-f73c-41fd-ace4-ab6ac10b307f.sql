-- Harden functions created in last migration by fixing search_path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_products_total_quantity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE v_product uuid; v_total int;
BEGIN
  v_product := COALESCE(NEW.product_id, OLD.product_id);
  SELECT COALESCE(SUM(quantity),0) INTO v_total FROM public.inventory WHERE product_id = v_product;
  UPDATE public.products SET quantity = v_total, updated_at = now() WHERE id = v_product;
  RETURN COALESCE(NEW, OLD);
END;$$;