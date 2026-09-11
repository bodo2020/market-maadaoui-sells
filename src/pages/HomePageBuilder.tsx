import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarClock,
  Eye,
  FolderOpen,
  GripVertical,
  Image as ImageIcon,
  Layers3,
  Loader2,
  MousePointerClick,
  Package,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Store,
  Trash2,
  Users,
} from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  createHomeSection,
  deleteHomeSection,
  fetchHomeAnalytics,
  fetchHomeBuilderState,
  HomeAudienceSegment,
  HomeBuilderBranch,
  HomeBuilderCollection,
  HomeBuilderState,
  HomeSectionAnalytics,
  HomeSectionRecord,
  HomeSectionType,
  publishHomePage,
  reorderHomeSections,
  updateHomeSection,
} from '@/services/supabase/homePageBuilderService';

const typeMeta: Record<HomeSectionType, { label: string; description: string; icon: React.ElementType; defaultTitle: string }> = {
  hero_banners: { label: 'بانرات رئيسية', description: 'يعرض البانرات المفعلة من صفحة الإعلانات', icon: ImageIcon, defaultTitle: 'العروض' },
  categories: { label: 'الأقسام', description: 'شريط الأقسام الرئيسية مع عرض الكل', icon: Layers3, defaultTitle: 'تسوق حسب القسم' },
  featured_products: { label: 'منتجات مميزة', description: 'منتجات متاحة من كتالوج الفرع', icon: Package, defaultTitle: 'منتجات مميزة' },
  product_collection: { label: 'مجموعة منتجات', description: 'يربط بمجموعة منتجات موجودة في النظام', icon: FolderOpen, defaultTitle: 'مختارات المعداوي' },
  smart_recommendations: { label: 'توصيات ذكية', description: 'تتغير حسب مشتريات العميل وتعود للأكثر طلبًا للزائر', icon: Sparkles, defaultTitle: 'مقترحة ليك' },
};

const audienceMeta: Array<{ value: HomeAudienceSegment; label: string; description: string }> = [
  { value: 'all', label: 'كل العملاء', description: 'بدون تخصيص' },
  { value: 'guest', label: 'الزوار', description: 'غير مسجلين دخول' },
  { value: 'new', label: 'عملاء جدد', description: 'لم يطلبوا بعد' },
  { value: 'returning', label: 'عملاء متكررون', description: 'لديهم طلب سابق' },
  { value: 'active', label: 'عملاء نشطون', description: 'آخر طلب خلال 30 يوم' },
  { value: 'loyal', label: 'عملاء أوفياء', description: '5 طلبات أو أكثر' },
  { value: 'inactive', label: 'غير نشطين', description: 'آخر طلب أقدم من 30 يوم' },
];

const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
};

const toIso = (value: string) => value ? new Date(value).toISOString() : null;

interface EditorState {
  id?: string;
  section_type: HomeSectionType;
  title: string;
  subtitle: string;
  is_active: boolean;
  collection_id: string;
  product_limit: number;
  starts_at: string;
  ends_at: string;
  branch_ids: string[];
  audience_segments: HomeAudienceSegment[];
}

const emptyEditor = (): EditorState => ({
  section_type: 'product_collection',
  title: '',
  subtitle: '',
  is_active: true,
  collection_id: '',
  product_limit: 12,
  starts_at: '',
  ends_at: '',
  branch_ids: [],
  audience_segments: ['all'],
});

const HomePageBuilder = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<HomeBuilderState | null>(null);
  const [analytics, setAnalytics] = useState<HomeSectionAnalytics[]>([]);
  const [analyticsDays, setAnalyticsDays] = useState(30);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HomeSectionRecord | null>(null);
  const [editor, setEditor] = useState<EditorState>(emptyEditor());
  const [dragId, setDragId] = useState<string | null>(null);

  const loadBuilder = async () => {
    try {
      setLoading(true);
      setState(await fetchHomeBuilderState());
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'تعذر تحميل إعداد الصفحة الرئيسية');
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async (days = analyticsDays) => {
    try {
      setAnalyticsLoading(true);
      setAnalytics(await fetchHomeAnalytics(days));
    } catch (error) {
      console.error(error);
      setAnalytics([]);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadBuilder(), loadAnalytics(30)]);
  }, []);

  useEffect(() => {
    void loadAnalytics(analyticsDays);
  }, [analyticsDays]);

  const sections = state?.sections || [];
  const collectionsById = useMemo(() => new Map((state?.collections || []).map(item => [item.id, item])), [state?.collections]);
  const branchesById = useMemo(() => new Map((state?.branches || []).map(item => [item.id, item])), [state?.branches]);
  const analyticsByKey = useMemo(() => new Map(analytics.map(item => [item.section_key, item])), [analytics]);
  const analyticsTotals = useMemo(() => {
    const impressions = analytics.reduce((sum, item) => sum + item.impressions, 0);
    const clicks = analytics.reduce((sum, item) => sum + item.clicks, 0);
    return { impressions, clicks, ctr: impressions ? Number(((clicks * 100) / impressions).toFixed(2)) : 0 };
  }, [analytics]);

  const openNew = (type: HomeSectionType = 'product_collection') => {
    setEditor({ ...emptyEditor(), section_type: type, title: typeMeta[type].defaultTitle });
    setEditorOpen(true);
  };

  const openEdit = (section: HomeSectionRecord) => {
    const source = section.data_source || {};
    setEditor({
      id: section.id,
      section_type: section.section_type,
      title: section.title || '',
      subtitle: section.subtitle || '',
      is_active: section.is_active,
      collection_id: typeof source.collection_id === 'string' ? source.collection_id : '',
      product_limit: Number(source.limit || 12),
      starts_at: toLocalInput(section.starts_at),
      ends_at: toLocalInput(section.ends_at),
      branch_ids: section.branch_ids || [],
      audience_segments: section.audience_segments?.length ? section.audience_segments : ['all'],
    });
    setEditorOpen(true);
  };

  const saveEditor = async () => {
    if (!state) return;
    if (editor.section_type === 'product_collection' && !editor.collection_id) {
      toast.error('اختار مجموعة المنتجات');
      return;
    }
    if (editor.starts_at && editor.ends_at && new Date(editor.ends_at) <= new Date(editor.starts_at)) {
      toast.error('وقت النهاية لازم يكون بعد وقت البداية');
      return;
    }

    const source: Record<string, unknown> = {};
    if (editor.section_type === 'product_collection') source.collection_id = editor.collection_id;
    if (editor.section_type === 'featured_products' || editor.section_type === 'smart_recommendations') {
      source.limit = Math.max(3, Math.min(24, editor.product_limit || 12));
    }
    const patch = {
      section_type: editor.section_type,
      title: editor.title.trim() || typeMeta[editor.section_type].defaultTitle,
      subtitle: editor.subtitle.trim() || null,
      is_active: editor.is_active,
      data_source: source,
      display_config: { layout: editor.section_type === 'hero_banners' ? 'slider' : 'horizontal' },
      starts_at: toIso(editor.starts_at),
      ends_at: toIso(editor.ends_at),
      branch_ids: editor.branch_ids,
      audience_segments: editor.audience_segments.length ? editor.audience_segments : ['all'],
    } as Partial<HomeSectionRecord>;

    try {
      setSaving(true);
      if (editor.id) await updateHomeSection(editor.id, patch);
      else await createHomeSection(state.draft.id, { ...patch, sort_order: sections.length ? Math.max(...sections.map(item => item.sort_order)) + 10 : 10 });
      toast.success(editor.id ? 'تم تحديث الجزء' : 'تم إضافة الجزء');
      setEditorOpen(false);
      await loadBuilder();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر حفظ الجزء');
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = async (section: HomeSectionRecord) => {
    try {
      await updateHomeSection(section.id, { is_active: !section.is_active });
      setState(current => current ? { ...current, sections: current.sections.map(item => item.id === section.id ? { ...item, is_active: !item.is_active } : item) } : current);
      toast.success(!section.is_active ? 'تم إظهار الجزء' : 'تم إخفاء الجزء');
    } catch {
      toast.error('تعذر تغيير حالة الجزء');
    }
  };

  const persistOrder = async (next: HomeSectionRecord[]) => {
    setState(current => current ? { ...current, sections: next.map((item, index) => ({ ...item, sort_order: (index + 1) * 10 })) } : current);
    try {
      await reorderHomeSections(next);
    } catch {
      toast.error('تعذر حفظ الترتيب');
      await loadBuilder();
    }
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    void persistOrder(next);
  };

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return setDragId(null);
    const from = sections.findIndex(item => item.id === dragId);
    const to = sections.findIndex(item => item.id === targetId);
    if (from < 0 || to < 0) return setDragId(null);
    const next = [...sections];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDragId(null);
    void persistOrder(next);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setSaving(true);
      await deleteHomeSection(deleteTarget.id);
      toast.success('تم حذف الجزء من المسودة');
      setDeleteTarget(null);
      await loadBuilder();
    } catch {
      toast.error('تعذر حذف الجزء');
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!state) return;
    try {
      setSaving(true);
      const result = await publishHomePage(state.draft.id);
      toast.success(`تم نشر الصفحة الرئيسية v${result.published_version}`);
      setPublishOpen(false);
      await loadBuilder();
      await loadAnalytics(analyticsDays);
    } catch (error: any) {
      toast.error(error?.message || 'تعذر نشر الصفحة الرئيسية');
    } finally {
      setSaving(false);
    }
  };

  const scheduleLabel = (section: HomeSectionRecord) => {
    if (!section.starts_at && !section.ends_at) return 'بدون جدول زمني';
    const start = section.starts_at ? new Date(section.starts_at).toLocaleString('ar-EG') : 'الآن';
    const end = section.ends_at ? new Date(section.ends_at).toLocaleString('ar-EG') : 'بدون نهاية';
    return `${start} ← ${end}`;
  };

  const branchLabel = (section: HomeSectionRecord) => {
    if (!section.branch_ids?.length) return 'كل الفروع';
    return section.branch_ids.map(id => branchesById.get(id)?.name).filter(Boolean).join('، ') || `${section.branch_ids.length} فرع`;
  };

  const audienceLabel = (section: HomeSectionRecord) => {
    const segments = section.audience_segments?.length ? section.audience_segments : ['all'];
    if (segments.includes('all')) return 'كل العملاء';
    return segments.map(segment => audienceMeta.find(item => item.value === segment)?.label).filter(Boolean).join('، ');
  };

  const toggleAudience = (segment: HomeAudienceSegment) => {
    setEditor(current => {
      if (segment === 'all') return { ...current, audience_segments: ['all'] };
      const base = current.audience_segments.filter(item => item !== 'all');
      const exists = base.includes(segment);
      const next = exists ? base.filter(item => item !== segment) : [...base, segment];
      return { ...current, audience_segments: next.length ? next : ['all'] };
    });
  };

  if (loading) {
    return <MainLayout><div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-primary" /></div></MainLayout>;
  }
  if (!state) return <MainLayout><div className="p-6 text-center">تعذر تحميل إعداد الصفحة الرئيسية</div></MainLayout>;

  return (
    <MainLayout>
      <div className="container mx-auto max-w-7xl p-4 md:p-6" dir="rtl">
        <div className="mb-6 flex flex-col gap-4 rounded-3xl border bg-gradient-to-l from-emerald-50 to-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">مسودة v{state.draft.version}</Badge>
              {state.published && <Badge variant="outline">المنشور v{state.published.version}</Badge>}
            </div>
            <h1 className="text-2xl font-black text-slate-950 md:text-3xl">إدارة الصفحة الرئيسية</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">تحكم في ترتيب المحتوى، الجمهور المستهدف، الفروع والجدولة، وشاهد أداء كل جزء قبل ما تقرر تعدله أو تنشر نسخة جديدة.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate('/banners')}><ImageIcon className="ml-2 h-4 w-4" />البانرات</Button>
            <Button variant="outline" onClick={() => navigate('/product-collections')}><FolderOpen className="ml-2 h-4 w-4" />المجموعات</Button>
            <Button variant="outline" onClick={() => setPreviewOpen(true)}><Eye className="ml-2 h-4 w-4" />معاينة</Button>
            <Button onClick={() => setPublishOpen(true)} className="bg-[#005931] hover:bg-[#004525]"><Send className="ml-2 h-4 w-4" />نشر</Button>
          </div>
        </div>

        <section className="mb-6 rounded-3xl border bg-white p-4 shadow-sm md:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="flex items-center gap-2 text-lg font-black"><BarChart3 className="h-5 w-5 text-[#005931]" />أداء الصفحة</h2><p className="mt-1 text-xs text-muted-foreground">المشاهدة تُحسب عند ظهور 25% من الجزء على شاشة العميل.</p></div>
            <select value={analyticsDays} onChange={event => setAnalyticsDays(Number(event.target.value))} className="h-10 rounded-xl border bg-background px-3 text-sm">
              <option value={7}>آخر 7 أيام</option>
              <option value={30}>آخر 30 يوم</option>
              <option value={90}>آخر 90 يوم</option>
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-emerald-50 p-4"><div className="flex items-center gap-2 text-xs font-semibold text-emerald-800"><Eye className="h-4 w-4" />المشاهدات</div><strong className="mt-2 block text-2xl text-slate-950">{analyticsLoading ? '…' : analyticsTotals.impressions.toLocaleString('ar-EG')}</strong></div>
            <div className="rounded-2xl bg-sky-50 p-4"><div className="flex items-center gap-2 text-xs font-semibold text-sky-800"><MousePointerClick className="h-4 w-4" />النقرات</div><strong className="mt-2 block text-2xl text-slate-950">{analyticsLoading ? '…' : analyticsTotals.clicks.toLocaleString('ar-EG')}</strong></div>
            <div className="rounded-2xl bg-violet-50 p-4"><div className="flex items-center gap-2 text-xs font-semibold text-violet-800"><BarChart3 className="h-4 w-4" />CTR</div><strong className="mt-2 block text-2xl text-slate-950">{analyticsLoading ? '…' : `${analyticsTotals.ctr}%`}</strong></div>
          </div>
        </section>

        <div className="mb-4 flex items-center justify-between gap-3">
          <div><h2 className="text-lg font-black">ترتيب الصفحة</h2><p className="text-xs text-muted-foreground">اسحب الجزء أو استخدم الأسهم، واضغط تعديل لتخصيص الجمهور والفروع.</p></div>
          <Button onClick={() => openNew()}><Plus className="ml-2 h-4 w-4" />إضافة جزء</Button>
        </div>

        <div className="space-y-3">
          {sections.map((section, index) => {
            const meta = typeMeta[section.section_type];
            const Icon = meta.icon;
            const collection = section.section_type === 'product_collection' ? collectionsById.get(String(section.data_source?.collection_id || '')) : null;
            const stats = analyticsByKey.get(section.section_key);
            return (
              <Card
                key={section.id}
                draggable
                onDragStart={() => setDragId(section.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={event => event.preventDefault()}
                onDrop={() => handleDrop(section.id)}
                className={`transition ${dragId === section.id ? 'opacity-50 ring-2 ring-primary/30' : ''} ${section.is_active ? '' : 'opacity-65'}`}
              >
                <CardContent className="flex flex-col gap-4 p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center">
                    <div className="flex items-center gap-3 md:min-w-[330px]">
                      <GripVertical className="hidden h-5 w-5 cursor-grab text-muted-foreground md:block" />
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-[#005931]"><Icon className="h-5 w-5" /></div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><strong className="truncate text-base">{section.title || meta.defaultTitle}</strong><Badge variant="secondary">{meta.label}</Badge></div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{collection ? `المجموعة: ${collection.title}` : meta.description}</p>
                      </div>
                    </div>

                    <div className="grid min-w-0 flex-1 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                      <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2"><CalendarClock className="h-4 w-4 shrink-0" /><span className="truncate">{scheduleLabel(section)}</span></div>
                      <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2"><Store className="h-4 w-4 shrink-0" /><span className="truncate">{branchLabel(section)}</span></div>
                      <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2"><Users className="h-4 w-4 shrink-0" /><span className="truncate">{audienceLabel(section)}</span></div>
                    </div>

                    <div className="flex shrink-0 items-center justify-between gap-1 md:justify-end">
                      <div className="ml-2 flex items-center gap-2 rounded-xl border px-2 py-1.5"><Switch checked={section.is_active} onCheckedChange={() => toggleSection(section)} /><span className="text-xs font-semibold">{section.is_active ? 'ظاهر' : 'مخفي'}</span></div>
                      <Button variant="ghost" size="icon" disabled={index === 0} onClick={() => move(index, -1)} aria-label="تحريك لأعلى"><ArrowUp className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" disabled={index === sections.length - 1} onClick={() => move(index, 1)} aria-label="تحريك لأسفل"><ArrowDown className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(section)} aria-label="تعديل"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteTarget(section)} aria-label="حذف"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t pt-3 text-xs">
                    <Badge variant="outline"><Eye className="ml-1 h-3.5 w-3.5" />{stats?.impressions || 0} مشاهدة</Badge>
                    <Badge variant="outline"><MousePointerClick className="ml-1 h-3.5 w-3.5" />{stats?.clicks || 0} نقرة</Badge>
                    <Badge variant="outline">CTR {stats?.ctr || 0}%</Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {!sections.length && <Card><CardContent className="p-10 text-center text-muted-foreground">المسودة فاضية. أضف أول جزء للصفحة الرئيسية.</CardContent></Card>}
        </div>
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>{editor.id ? 'تعديل جزء' : 'إضافة جزء جديد'}</DialogTitle><DialogDescription>حدد المحتوى والجمهور والوقت والفروع قبل النشر.</DialogDescription></DialogHeader>
          <div className="grid gap-5 py-2">
            <div className="grid gap-2">
              <Label>نوع الجزء</Label>
              <select
                value={editor.section_type}
                onChange={event => {
                  const type = event.target.value as HomeSectionType;
                  setEditor(value => ({ ...value, section_type: type, title: value.id ? value.title : typeMeta[type].defaultTitle, collection_id: type === 'product_collection' ? value.collection_id : '' }));
                }}
                className="h-10 rounded-md border bg-background px-3 text-sm"
                disabled={Boolean(editor.id)}
              >
                {(Object.keys(typeMeta) as HomeSectionType[]).map(type => <option key={type} value={type}>{typeMeta[type].label}</option>)}
              </select>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2"><Label>العنوان</Label><Input value={editor.title} onChange={event => setEditor(value => ({ ...value, title: event.target.value }))} /></div>
              <div className="grid gap-2"><Label>وصف صغير (اختياري)</Label><Input value={editor.subtitle} onChange={event => setEditor(value => ({ ...value, subtitle: event.target.value }))} /></div>
            </div>

            {editor.section_type === 'product_collection' && (
              <div className="grid gap-2">
                <Label>مجموعة المنتجات</Label>
                <select value={editor.collection_id} onChange={event => setEditor(value => ({ ...value, collection_id: event.target.value }))} className="h-10 rounded-md border bg-background px-3 text-sm">
                  <option value="">اختر مجموعة…</option>
                  {state.collections.filter(item => item.active !== false).map((item: HomeBuilderCollection) => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
                <Button type="button" variant="link" className="h-auto w-fit p-0" onClick={() => navigate('/product-collections')}>إدارة مجموعات المنتجات</Button>
              </div>
            )}

            {(editor.section_type === 'featured_products' || editor.section_type === 'smart_recommendations') && (
              <div className="grid gap-2">
                <Label>عدد المنتجات (3 - 24)</Label>
                <Input type="number" min={3} max={24} value={editor.product_limit} onChange={event => setEditor(value => ({ ...value, product_limit: Number(event.target.value) }))} />
                {editor.section_type === 'smart_recommendations' && <p className="text-xs leading-5 text-muted-foreground">للعميل المسجل: الاقتراحات تعتمد على الأقسام اللي اشترى منها قبل كده. للزائر أو بدون تاريخ شراء: تظهر المنتجات الأكثر طلبًا.</p>}
              </div>
            )}

            {editor.section_type === 'hero_banners' && (
              <div className="rounded-2xl border border-dashed bg-muted/30 p-4 text-sm">
                <p>هذا الجزء يعرض البانرات المفعلة والصالحة زمنيًا من نظام الإعلانات الحالي.</p>
                <Button type="button" variant="link" className="mt-2 h-auto p-0" onClick={() => navigate('/banners')}>إدارة البانرات الآن</Button>
              </div>
            )}

            <div className="grid gap-3">
              <div><Label>الجمهور المستهدف</Label><p className="text-xs text-muted-foreground">تقدر تجمع أكثر من نوع. اختيار «كل العملاء» يلغي التخصيص.</p></div>
              <div className="grid gap-2 rounded-2xl border p-3 sm:grid-cols-2">
                {audienceMeta.map(item => {
                  const checked = editor.audience_segments.includes(item.value);
                  return (
                    <label key={item.value} className="flex cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-muted">
                      <Checkbox checked={checked} onCheckedChange={() => toggleAudience(item.value)} />
                      <span><strong className="block text-sm">{item.label}</strong><span className="text-xs text-muted-foreground">{item.description}</span></span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3">
              <div><Label>الجدولة</Label><p className="text-xs text-muted-foreground">اتركها فارغة ليظهر الجزء دائمًا.</p></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2"><Label>يبدأ من</Label><Input type="datetime-local" value={editor.starts_at} onChange={event => setEditor(value => ({ ...value, starts_at: event.target.value }))} /></div>
                <div className="grid gap-2"><Label>ينتهي في</Label><Input type="datetime-local" value={editor.ends_at} onChange={event => setEditor(value => ({ ...value, ends_at: event.target.value }))} /></div>
              </div>
            </div>

            <div className="grid gap-3">
              <div><Label>الفروع</Label><p className="text-xs text-muted-foreground">بدون اختيار = يظهر في كل الفروع.</p></div>
              <div className="grid max-h-44 gap-2 overflow-y-auto rounded-2xl border p-3 sm:grid-cols-2">
                {state.branches.map((branch: HomeBuilderBranch) => {
                  const checked = editor.branch_ids.includes(branch.id);
                  return <label key={branch.id} className="flex cursor-pointer items-center gap-2 rounded-xl p-2 hover:bg-muted"><Checkbox checked={checked} onCheckedChange={() => setEditor(value => ({ ...value, branch_ids: checked ? value.branch_ids.filter(id => id !== branch.id) : [...value.branch_ids, branch.id] }))} /><span className="text-sm">{branch.name}</span></label>;
                })}
              </div>
            </div>

            <label className="flex items-center justify-between rounded-2xl border p-4"><div><strong className="text-sm">إظهار الجزء</strong><p className="text-xs text-muted-foreground">يمكن حفظه مخفيًا وتجهيزه للنشر لاحقًا.</p></div><Switch checked={editor.is_active} onCheckedChange={checked => setEditor(value => ({ ...value, is_active: checked }))} /></label>
          </div>
          <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>إلغاء</Button><Button onClick={saveEditor} disabled={saving} className="bg-[#005931] hover:bg-[#004525]">{saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle>معاينة مسودة الصفحة</DialogTitle><DialogDescription>معاينة ترتيب المحتوى قبل النشر. الاستهداف يُطبّق فعليًا في تطبيق العميل بعد النشر.</DialogDescription></DialogHeader>
          <div className="mx-auto max-h-[70vh] w-full max-w-[390px] overflow-y-auto rounded-[32px] border-[6px] border-slate-900 bg-[#f6f8f7] p-3 shadow-2xl">
            <div className="mb-3 h-10 rounded-2xl bg-white shadow-sm" />
            {sections.filter(section => section.is_active).map(section => {
              const meta = typeMeta[section.section_type];
              const Icon = meta.icon;
              return (
                <div key={section.id} className={`mb-3 rounded-2xl border bg-white p-3 shadow-sm ${section.section_type === 'hero_banners' ? 'h-28' : ''}`}>
                  <div className="mb-2 flex items-center gap-2"><Icon className="h-4 w-4 text-[#005931]" /><strong className="text-sm">{section.title || meta.defaultTitle}</strong></div>
                  <div className="h-12 rounded-xl bg-gradient-to-l from-emerald-50 to-slate-50" />
                  <p className="mt-2 truncate text-[10px] text-muted-foreground">{audienceLabel(section)} · {branchLabel(section)}</p>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader><AlertDialogTitle>نشر الصفحة الرئيسية؟</AlertDialogTitle><AlertDialogDescription>سيتم استبدال النسخة المنشورة بالمسودة v{state.draft.version}، ثم إنشاء مسودة جديدة تلقائيًا. الاستهداف والجدولة سيبدآن فورًا حسب الإعدادات.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>إلغاء</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={event => { event.preventDefault(); void publish(); }} className="bg-[#005931] hover:bg-[#004525]">{saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}نشر الآن</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader><AlertDialogTitle>حذف الجزء من المسودة؟</AlertDialogTitle><AlertDialogDescription>الحذف يؤثر على المسودة فقط ولن يغيّر النسخة المنشورة حتى تعمل نشر.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>إلغاء</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={event => { event.preventDefault(); void confirmDelete(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حذف</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
};

export default HomePageBuilder;
