import { supabase } from '@/integrations/supabase/client';

export type HomeSectionType = 'hero_banners' | 'categories' | 'featured_products' | 'product_collection';

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
    sections: sectionsResult.data || [],
    collections: collectionsResult.data || [],
    branches: branchesResult.data || [],
  };
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
  }).select('*').single();
  if (error) throw error;
  return data as HomeSectionRecord;
};

export const updateHomeSection = async (id: string, patch: Partial<HomeSectionRecord>) => {
  const { data, error } = await db.from('home_sections').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
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

export const publishHomePage = async (pageId: string) => {
  const { data, error } = await db.rpc('publish_home_page', { p_page_id: pageId });
  if (error) throw error;
  return data as { published_page_id: string; new_draft_page_id: string; published_version: number; draft_version: number };
};
