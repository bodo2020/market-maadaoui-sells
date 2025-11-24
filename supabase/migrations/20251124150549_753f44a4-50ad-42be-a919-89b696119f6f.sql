-- المرحلة 1: إنشاء جدول مناطق التوصيل المرسومة على الخريطة
CREATE TABLE IF NOT EXISTS public.branch_delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  zone_name TEXT NOT NULL,
  polygon_coordinates JSONB NOT NULL, -- GeoJSON format for polygon
  delivery_price NUMERIC NOT NULL DEFAULT 0,
  estimated_time TEXT,
  priority INTEGER DEFAULT 1,
  color TEXT DEFAULT '#3B82F6', -- blue color
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- إضافة indexes للأداء
CREATE INDEX IF NOT EXISTS idx_branch_delivery_zones_branch_id ON public.branch_delivery_zones(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_delivery_zones_is_active ON public.branch_delivery_zones(is_active);

-- Enable RLS
ALTER TABLE public.branch_delivery_zones ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view active delivery zones"
  ON public.branch_delivery_zones
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage delivery zones"
  ON public.branch_delivery_zones
  FOR ALL
  USING (
    is_super_admin() OR 
    is_admin() OR 
    has_branch_access(auth.uid(), branch_id)
  )
  WITH CHECK (
    is_super_admin() OR 
    is_admin() OR 
    has_branch_access(auth.uid(), branch_id)
  );

-- دالة للتحقق من وجود نقطة داخل مضلع (Point in Polygon)
CREATE OR REPLACE FUNCTION public.check_point_in_delivery_zone(
  p_lat NUMERIC,
  p_lng NUMERIC
)
RETURNS TABLE(
  zone_id UUID,
  zone_name TEXT,
  branch_id UUID,
  branch_name TEXT,
  delivery_price NUMERIC,
  estimated_time TEXT,
  priority INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    z.id,
    z.zone_name,
    z.branch_id,
    b.name as branch_name,
    z.delivery_price,
    z.estimated_time,
    z.priority
  FROM public.branch_delivery_zones z
  INNER JOIN public.branches b ON b.id = z.branch_id
  WHERE z.is_active = true
    AND b.active = true
    -- التحقق من وجود النقطة داخل المضلع باستخدام ray casting algorithm
    AND (
      SELECT COUNT(*) % 2 = 1
      FROM (
        SELECT 
          jsonb_array_elements(z.polygon_coordinates->'coordinates'->0) as coord
      ) coords
      CROSS JOIN LATERAL (
        SELECT 
          (coord->>0)::NUMERIC as lng,
          (coord->>1)::NUMERIC as lat
      ) point
      CROSS JOIN LATERAL (
        SELECT 
          LEAD(point.lng) OVER (ORDER BY ordinality) as next_lng,
          LEAD(point.lat) OVER (ORDER BY ordinality) as next_lat
        FROM jsonb_array_elements(z.polygon_coordinates->'coordinates'->0) WITH ORDINALITY
      ) next_point
      WHERE 
        next_lng IS NOT NULL
        AND ((point.lat > p_lat) != (next_point.next_lat > p_lat))
        AND (p_lng < (next_point.next_lng - point.lng) * (p_lat - point.lat) / 
             (next_point.next_lat - point.lat) + point.lng)
    )
  ORDER BY z.priority ASC, z.created_at ASC
  LIMIT 1;
END;
$$;

-- Trigger لتحديث updated_at
CREATE OR REPLACE FUNCTION public.update_branch_delivery_zones_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_branch_delivery_zones_updated_at
  BEFORE UPDATE ON public.branch_delivery_zones
  FOR EACH ROW
  EXECUTE FUNCTION public.update_branch_delivery_zones_updated_at();

-- إضافة عمود delivery_zone_id في جدول online_orders
ALTER TABLE public.online_orders
ADD COLUMN IF NOT EXISTS delivery_zone_id UUID REFERENCES public.branch_delivery_zones(id);