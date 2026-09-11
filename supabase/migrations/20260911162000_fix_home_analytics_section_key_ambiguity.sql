-- Fix PL/pgSQL ambiguity between the RETURNS TABLE output variable `section_key`
-- and columns with the same name inside get_home_section_analytics.
-- Keep every reference explicitly qualified and avoid USING(section_key).

CREATE OR REPLACE FUNCTION public.get_home_section_analytics(p_days integer DEFAULT 30)
RETURNS TABLE(
  section_key uuid,
  experiment_key text,
  experiment_variant text,
  impressions bigint,
  clicks bigint,
  add_to_carts bigint,
  ctr numeric,
  add_to_cart_rate numeric,
  orders bigint,
  delivered_orders bigint,
  cancelled_orders bigint,
  gross_order_value numeric,
  revenue numeric,
  order_conversion_rate numeric,
  performance_score numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.can_manage_home_content() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  WITH params AS (
    SELECT now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365))) AS since_at
  ),
  event_metrics AS (
    SELECT
      e.section_key,
      count(DISTINCT e.session_key) FILTER (WHERE e.event_type = 'impression')::bigint AS impressions,
      count(DISTINCT e.session_key) FILTER (WHERE e.event_type = 'click')::bigint AS clicks,
      count(DISTINCT e.session_key) FILTER (WHERE e.event_type = 'add_to_cart')::bigint AS add_to_carts
    FROM public.home_section_events e
    CROSS JOIN params p
    WHERE e.created_at >= p.since_at
    GROUP BY e.section_key
  ),
  order_metrics AS (
    SELECT
      a.section_key,
      count(*) FILTER (WHERE o.status::text <> 'cancelled')::bigint AS orders,
      count(*) FILTER (WHERE o.status::text = 'delivered' AND o.payment_status::text = 'paid')::bigint AS delivered_orders,
      count(*) FILTER (WHERE o.status::text = 'cancelled')::bigint AS cancelled_orders,
      coalesce(sum(o.total) FILTER (WHERE o.status::text <> 'cancelled'), 0)::numeric AS gross_order_value,
      coalesce(sum(greatest(o.total - coalesce(o.shipping_cost, 0), 0)) FILTER (
        WHERE o.status::text = 'delivered' AND o.payment_status::text = 'paid'
      ), 0)::numeric AS revenue
    FROM private.home_order_attributions a
    JOIN public.online_orders o ON o.id = a.order_id
    CROSS JOIN params p
    WHERE a.attributed_at >= p.since_at
    GROUP BY a.section_key
  ),
  metric_keys AS (
    SELECT em.section_key FROM event_metrics em
    UNION
    SELECT om.section_key FROM order_metrics om
  ),
  meta AS (
    SELECT DISTINCT ON (s.section_key)
      s.section_key,
      s.experiment_key,
      s.experiment_variant
    FROM public.home_sections s
    ORDER BY s.section_key, s.updated_at DESC, s.id DESC
  ),
  base AS (
    SELECT
      k.section_key,
      m.experiment_key,
      m.experiment_variant,
      coalesce(em.impressions, 0)::bigint AS impressions,
      coalesce(em.clicks, 0)::bigint AS clicks,
      coalesce(em.add_to_carts, 0)::bigint AS add_to_carts,
      coalesce(om.orders, 0)::bigint AS orders,
      coalesce(om.delivered_orders, 0)::bigint AS delivered_orders,
      coalesce(om.cancelled_orders, 0)::bigint AS cancelled_orders,
      coalesce(om.gross_order_value, 0)::numeric AS gross_order_value,
      coalesce(om.revenue, 0)::numeric AS revenue
    FROM metric_keys k
    LEFT JOIN event_metrics em ON em.section_key = k.section_key
    LEFT JOIN order_metrics om ON om.section_key = k.section_key
    LEFT JOIN meta m ON m.section_key = k.section_key
  ),
  rates AS (
    SELECT
      b.section_key,
      b.experiment_key,
      b.experiment_variant,
      b.impressions,
      b.clicks,
      b.add_to_carts,
      b.orders,
      b.delivered_orders,
      b.cancelled_orders,
      b.gross_order_value,
      b.revenue,
      CASE WHEN b.impressions = 0 THEN 0::numeric ELSE round(b.clicks::numeric * 100 / b.impressions, 2) END AS ctr,
      CASE WHEN b.impressions = 0 THEN 0::numeric ELSE round(b.add_to_carts::numeric * 100 / b.impressions, 2) END AS add_to_cart_rate,
      CASE WHEN b.impressions = 0 THEN 0::numeric ELSE round(b.orders::numeric * 100 / b.impressions, 2) END AS order_conversion_rate
    FROM base b
  )
  SELECT
    r.section_key,
    r.experiment_key,
    r.experiment_variant,
    r.impressions,
    r.clicks,
    r.add_to_carts,
    r.ctr,
    r.add_to_cart_rate,
    r.orders,
    r.delivered_orders,
    r.cancelled_orders,
    r.gross_order_value,
    r.revenue,
    r.order_conversion_rate,
    round(
      r.order_conversion_rate * 5
      + r.add_to_cart_rate * 2
      + r.ctr * 0.5
      + least(50::numeric, ln(1 + greatest(r.revenue, 0)) * 5),
      2
    ) AS performance_score
  FROM rates r;
END;
$function$;
