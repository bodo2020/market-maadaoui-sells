import { supabase } from '@/integrations/supabase/client';

export type HomeSectionType = 'hero_banners' | 'categories' | 'featured_products' | 'product_collection' | 'smart_recommendations';
export type HomeAudienceSegment = 'all' | 'guest' | 'new' | 'returning' | 'active' | 'loyal' | 'inactive';
export type HomeExperimentVariant = 'A' | 'B';

export interface HomePageRecord {
  id: string;
  name: string;
  status: 'draft' | 'published' | 'archived';
  version: number;
  is_default: boolean;
  published_at?: string | null;
  updated_at?: string | null;
}

export interface HomeSectionRecord {
  id: string;
  section_key: string;
  home_page_id: string;
  section_type: HomeSectionType;
  title?: string | null;
  subtitle?: string | null;
  sort_order: number;
  is_active: boolean;
  data_source: Record<string, unknown>;
  display_config: Record<string, unknown>;
  starts_at?: string | null;
  ends_at?: string | null;
  branch_ids: string[];
  audience_segments: HomeAudienceSegment[];
  experiment_key?: string | null;
  experiment_variant?: HomeExperimentVariant | null;
}

export interface HomeBuilderCollection { id: string; title: string; active: boolean | null; }
export interface HomeBuilderBranch { id: string; name: string; active: boolean | null; }

export interface HomeBuilderState {
  draft: HomePageRecord;
  published: HomePageRecord | null;
  sections: HomeSectionRecord[];
  collections: HomeBuilderCollection[];
  branches: HomeBuilderBranch[];
}

export interface HomeSectionAnalytics {
  section_key: string;
  experiment_key: string | null;
  experiment_variant: HomeExperimentVariant | null;
  impressions: number;
  clicks: number;
  add_to_carts: number;
  ctr: number;
  add_to_cart_rate: number;
  orders: number;
  delivered_orders: number;
  cancelled_orders: number;
  gross_order_value: number;
  revenue: number;
  order_conversion_rate: number;
  performance_score: number;
}

export interface SmartReorderResult {
  applied: boolean;
  reason?: string;
  changed_sections?: number;
  eligible_sections: number;
  impressions: number;
  minimum_impressions?: number;
  days?: number;
}

const db = supabase as any;

export const fetchHomeBuilderState = async (): Promise<HomeBuilderState> => {
  const [draftResult, publishedResult, collectionsResult, branchesResult] = await Promise.all([
    db.from('home_pages').select('*').eq('is_default', true).eq('status', 'draft').order('version', { ascending: false }).limit(1).maybeSingle(),
    db.from('home_pages').select('*').eq('is_default', true).eq('status', 'published').order('version', { ascending: false }).limit(1).maybeSingle(),
    db.from('product_collections').select('id,title,active').order('position'),
    db.from('branches').select('id,name,active').eq('active', true).order('name'),
  ]);

  if (draftResult.error) throw draftResult.error;
  if (!draftResult.data) throw new Error('لا توجد مسودة للصفحة الرئيسية');
  if (publishedResult.error) throw publishedResult.error;
  if (collectionsResult.error) throw collectionsResult.error;
  if (branchesResult.error) throw branchesResult.error;

  const sectionsResult = await db
    .from('home_sections')
    .select('*')
    .eq('home_page_id', draftResult.data.id)
    .order('sort_order', { ascending: true });
  if (sectionsResult.error) throw sectionsResult.error;

  return {
    draft: draftResult.data,
    published: publishedResult.data || null,
    sections: (sectionsResult.data || []).map((section: HomeSectionRecord) => ({
      ...section,
      audience_segments: section.audience_segments?.length ? section.audience_segments : ['all'],
      experiment_key: section.experiment_key || null,
      experiment_variant: section.experiment_variant || null,
    })),
    collections: collectionsResult.data || [],
    branches: branchesResult.data || [],
  };
};

export const fetchHomeAnalytics = async (days = 30): Promise<HomeSectionAnalytics[]> => {
  const { data, error } = await db.rpc('get_home_section_analytics', { p_days: Math.max(1, Math.min(days, 365)) });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    section_key: String(row.section_key),
    experiment_key: row.experiment_key ? String(row.experiment_key) : null,
    experiment_variant: row.experiment_variant === 'A' || row.experiment_variant === 'B' ? row.experiment_variant : null,
    impressions: Number(row.impressions || 0),
    clicks: Number(row.clicks || 0),
    add_to_carts: Number(row.add_to_carts || 0),
    ctr: Number(row.ctr || 0),
    add_to_cart_rate: Number(row.add_to_cart_rate || 0),
    orders: Number(row.orders || 0),
    delivered_orders: Number(row.delivered_orders || 0),
    cancelled_orders: Number(row.cancelled_orders || 0),
    gross_order_value: Number(row.gross_order_value || 0),
    revenue: Number(row.revenue || 0),
    order_conversion_rate: Number(row.order_conversion_rate || 0),
    performance_score: Number(row.performance_score || 0),
  }));
};

export const createHomeSection = async (pageId: string, values: Partial<HomeSectionRecord>) => {
  const { data, error } = await db.from('home_sections').insert({
    home_page_id: pageId,
    section_type: values.section_type,
    title: values.title || null,
    subtitle: values.subtitle || null,
    sort_order: values.sort_order ?? 0,
    is_active: values.is_active ?? true,
    data_source: values.data_source || {},
    display_config: values.display_config || {},
    starts_at: values.starts_at || null,
    ends_at: values.ends_at || null,
    branch_ids: values.branch_ids || [],
    audience_segments: values.audience_segments?.length ? values.audience_segments : ['all'],
    experiment_key: values.experiment_key || null,
    experiment_variant: values.experiment_key ? (values.experiment_variant || 'A') : null,
  }).select('*').single();
  if (error) throw error;
  return data as HomeSectionRecord;
};

export const updateHomeSection = async (id: string, patch: Partial<HomeSectionRecord>) => {
  const normalizedPatch = {
    ...patch,
    ...(patch.audience_segments ? { audience_segments: patch.audience_segments.length ? patch.audience_segments : ['all'] } : {}),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db.from('home_sections').update(normalizedPatch).eq('id', id).select('*').single();
  if (error) throw error;
  return data as HomeSectionRecord;
};

export const deleteHomeSection = async (id: string) => {
  const { error } = await db.from('home_sections').delete().eq('id', id);
  if (error) throw error;
};

export const reorderHomeSections = async (sections: HomeSectionRecord[]) => {
  const updates = sections.map((section, index) => db.from('home_sections').update({ sort_order: (index + 1) * 10, updated_at: new Date().toISOString() }).eq('id', section.id));
  const results = await Promise.all(updates);
  const failure = results.find(result => result.error);
  if (failure?.error) throw failure.error;
};

export const smartReorderHomeDraft = async (pageId: string, days = 30): Promise<SmartReorderResult> => {
  const { data, error } = await db.rpc('smart_reorder_home_draft', {
    p_page_id: pageId,
    p_days: Math.max(1, Math.min(days, 365)),
  });
  if (error) throw error;
  return data as SmartReorderResult;
};

export const publishHomePage = async (pageId: string) => {
  const { data, error } = await db.rpc('publish_home_page', { p_page_id: pageId });
  if (error) throw error;
  return data as { published_page_id: string; new_draft_page_id: string; published_version: number; draft_version: number };
};