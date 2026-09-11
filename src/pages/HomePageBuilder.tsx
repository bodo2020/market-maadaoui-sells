import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowDown, ArrowUp, CalendarClock, Eye, EyeOff, FolderOpen, GripVertical,
  Image as ImageIcon, Layers3, Loader2, Package, Pencil, Plus, Send, Store,
  Trash2, X,
} from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  createHomeSection, deleteHomeSection, fetchHomeBuilderState, HomeBuilderBranch,
  HomeBuilderCollection, HomeBuilderState, HomeSectionRecord, HomeSectionType,
  publishHomePage, reorderHomeSections, updateHomeSection,
} from '@/services/supabase/homePageBuilderService';

const typeMeta: Record<HomeSectionType, { label: string; description: string; icon: React.ElementType; defaultTitle: string }> = {
  hero_banners: { label: 'بانرات رئيسية', description: 'يعرض البانرات المفعلة من صفحة الإعلانات', icon: ImageIcon, defaultTitle: 'العروض' },
  categories: { label: 'الأقسام', description: 'شريط الأقسام الرئيسية مع عرض الكل', icon: Layers3, defaultTitle: 'تسوق حسب القسم' },
  featured_products: { label: 'منتجات مميزة', description: 'مجموعة تلقائية من منتجات الفرع المتاحة', icon: Package, defaultTitle: 'منتجات مميزة' },
  product_collection: { label: 'مجموعة منتجات', description: 'يربط بمجموعة منتجات موجودة في النظام', icon: FolderOpen, defaultTitle: 'مختارات المعداوي' },
};

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
  featured_limit: number;
  starts_at: string;
  ends_at: string;
  branch_ids: string[];
}

const emptyEditor = (): EditorState => ({
  section_type: 'product_collection', title: '', subtitle: '', is_active: true,
  collection_id: '', featured_limit: 12, starts_at: '', ends_at: '', branch_ids: [],
});

const HomePageBuilder = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<HomeBuilderState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HomeSectionRecord | null>(null);
  const [editor, setEditor] = useState<EditorState>(emptyEditor());
  const [dragId, setDragId] = useState<string | null>(null);

  const load = async () => {
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

  useEffect(() => { void load(); }, []);

  const sections = state?.sections || [];
  const collectionsById = useMemo(() => new Map((state?.collections || []).map(item => [item.id, item])), [state?.collections]);
  const branchesById = useMemo(() => new Map((state?.branches || []).map(item => [item.id, item])), [state?.branches]);

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
      featured_limit: Number(source.limit || 12),
      starts_at: toLocalInput(section.starts_at),
      ends_at: toLocalInput(section.ends_at),
      branch_ids: section.branch_ids || [],
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
    if (editor.section_type === 'featured_products') source.limit = Math.max(3, Math.min(24, editor.featured_limit || 12));
    const display = { layout: editor.section_type === 'hero_banners' ? 'slider' : 'horizontal' };
    const patch = {
      section_type: editor.section_type,
      title: editor.title.trim() || typeMeta[editor.section_type].defaultTitle,
      subtitle: editor.subtitle.trim() || null,
      is_active: editor.is_active,
      data_source: source,
      display_config: display,
      starts_at: toIso(editor.starts_at),
      ends_at: toIso(editor.ends_at),
      branch_ids: editor.branch_ids,
    } as Partial<HomeSectionRecord>;

    try {
      setSaving(true);
      if (editor.id) await updateHomeSection(editor.id, patch);
      else await createHomeSection(state.draft.id, { ...patch, sort_order: sections.length ? Math.max(...sections.map(item => item.sort_order)) + 10 : 10 });
      toast.success(editor.id ? 'تم تحديث الجزء' : 'تم إضافة الجزء');
      setEditorOpen(false);
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر حفظ الجزء');
    } finally { setSaving(false); }
  };

  const toggleSection = async (section: HomeSectionRecord) => {
    try {
      await updateHomeSection(section.id, { is_active: !section.is_active });
      setState(current => current ? { ...current, sections: current.sections.map(item => item.id === section.id ? { ...item, is_active: !item.is_active } : item) } : current);
      toast.success(!section.is_active ? 'تم إظهار الجزء' : 'تم إخفاء الجزء');
    } catch { toast.error('تعذر تغيير حالة الجزء'); }
  };

  const persistOrder = async (next: HomeSectionRecord[]) => {
    setState(current => current ? { ...current, sections: next.map((item, index) => ({ ...item, sort_order: (index + 1) * 10 })) } : current);
    try {
      await reorderHomeSections(next);
    } catch {
      toast.error('تعذر حفظ الترتيب');
      await load();
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
      await load();
    } catch { toast.error('تعذر حذف الجزء'); }
    finally { setSaving(false); }
  };

  const publish = async () => {
    if (!state) return;
    try {
      setSaving(true);
      const result = await publishHomePage(state.draft.id);
      toast.success(`تم نشر الصفحة الرئيسية v${result.published_version}`);
      setPublishOpen(false);
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر نشر الصفحة الرئيسية');
    } finally { setSaving(false); }
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

  if (loading) return <MainLayout><div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-primary" /></div></MainLayout>;
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
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">رتّب تجربة العميل، اخفِ أو أظهر الأجزاء، حدد المواعيد والفروع ثم عاين الصفحة قبل النشر. التعديل يتم على المسودة ولا يظهر للعملاء إلا بعد النشر.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate('/banners')}><ImageIcon className="ml-2 h-4 w-4" />البانرات</Button>
            <Button variant="outline" onClick={() => navigate('/product-collections')}><FolderOpen className="ml-2 h-4 w-4" />المجموعات</Button>
            <Button variant="outline" onClick={() => setPreviewOpen(true)}><Eye className="ml-2 h-4 w-4" />معاينة</Button>
            <Button onClick={() => setPublishOpen(true)} className="bg-[#005931] hover:bg-[#004525]"><Send className="ml-2 h-4 w-4" />نشر</Button>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between gap-3">
          <div><h2 className="text-lg font-black">ترتيب الصفحة</h2><p className="text-xs text-muted-foreground">اسحب الجزء أو استخدم الأسهم لتغيير مكانه</p></div>
          <Button onClick={() => openNew()}><Plus className="ml-2 h-4 w-4" />إضافة جزء</Button>
        </div>

        <div className="space-y-3">
          {sections.map((section, index) => {
            const meta = typeMeta[section.section_type];
            const Icon = meta.icon;
            const collection = section.section_type === 'product_collection' ? collectionsById.get(String(section.data_source?.collection_id || '')) : null;
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
                <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
                  <div className="flex items-center gap-3 md:min-w-[330px]">
                    <GripVertical className="hidden h-5 w-5 cursor-grab text-muted-foreground md:block" />
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-[#005931]"><Icon className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><strong className="truncate text-base">{section.title || meta.defaultTitle}</strong><Badge variant="secondary">{meta.label}</Badge></div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{collection ? `المجموعة: ${collection.title}` : meta.description}</p>
                    </div>
                  </div>

                  <div className="grid min-w-0 flex-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                    <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2"><CalendarClock className="h-4 w-4 shrink-0" /><span className="truncate">{scheduleLabel(section)}</span></div>
                    <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2"><Store className="h-4 w-4 shrink-0" /><span className="truncate">{branchLabel(section)}</span></div>
                  </div>

                  <div className="flex shrink-0 items-center justify-between gap-1 md:justify-end">
                    <div className="ml-2 flex items-center gap-2 rounded-xl border px-2 py-1.5"><Switch checked={section.is_active} onCheckedChange={() => toggleSection(section)} /><span className="text-xs font-semibold">{section.is_active ? 'ظاهر' : 'مخفي'}</span></div>
                    <Button variant="ghost" size="icon" disabled={index === 0} onClick={() => move(index, -1)} aria-label="تحريك لأعلى"><ArrowUp className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" disabled={index === sections.length - 1} onClick={() => move(index, 1)} aria-label="تحريك لأسفل"><ArrowDown className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(section)} aria-label="تعديل"><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteTarget(section)} aria-label="حذف"><Trash2 className="h-4 w-4" /></Button>
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
          <DialogHeader><DialogTitle>{editor.id ? 'تعديل جزء' : 'إضافة جزء جديد'}</DialogTitle><DialogDescription>حدد المحتوى ومتى وأين يظهر للعملاء.</DialogDescription></DialogHeader>
          <div className="grid gap-5 py-2">
            <div className="grid gap-2"><Label>نوع الجزء</Label><select value={editor.section_type} onChange={e => { const type = e.target.value as HomeSectionType; setEditor(value => ({ ...value, section_type: type, title: value.id ? value.title : typeMeta[type].defaultTitle, collection_id: type === 'product_collection' ? value.collection_id : '' })); }} className="h-10 rounded-md border bg-background px-3 text-sm" disabled={Boolean(editor.id)}>{(Object.keys(typeMeta) as HomeSectionType[]).map(type => <option key={type} value={type}>{typeMeta[type].label}</option>)}</select></div>
            <div className="grid gap-2 sm:grid-cols-2"><div className="grid gap-2"><Label>العنوان</Label><Input value={editor.title} onChange={e => setEditor(v => ({ ...v, title: e.target.value }))} /></div><div className="grid gap-2"><Label>وصف صغير (اختياري)</Label><Input value={editor.subtitle} onChange={e => setEditor(v => ({ ...v, subtitle: e.target.value }))} /></div></div>

            {editor.section_type === 'product_collection' && <div className="grid gap-2"><Label>مجموعة المنتجات</Label><select value={editor.collection_id} onChange={e => setEditor(v => ({ ...v, collection_id: e.target.value }))} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="">اختر مجموعة…</option>{state.collections.filter(c => c.active !== false).map((item: HomeBuilderCollection) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><Button type="button" variant="link" className="h-auto w-fit p-0" onClick={() => navigate('/product-collections')}>إدارة مجموعات المنتجات</Button></div>}
            {editor.section_type === 'featured_products' && <div className="grid gap-2"><Label>عدد المنتجات (3 - 24)</Label><Input type="number" min={3} max={24} value={editor.featured_limit} onChange={e => setEditor(v => ({ ...v, featured_limit: Number(e.target.value) }))} /></div>}
            {editor.section_type === 'hero_banners' && <div className="rounded-2xl border border-dashed bg-muted/30 p-4 text-sm"><p>هذا الجزء يعرض البانرات المفعلة والصالحة زمنيًا من نظام الإعلانات الحالي.</p><Button type="button" variant="link" className="mt-2 h-auto p-0" onClick={() => navigate('/banners')}>إدارة البانرات الآن</Button></div>}

            <div className="grid gap-3"><div><Label>الجدولة</Label><p className="text-xs text-muted-foreground">اتركها فارغة ليظهر الجزء دائمًا.</p></div><div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-2"><Label>يبدأ من</Label><Input type="datetime-local" value={editor.starts_at} onChange={e => setEditor(v => ({ ...v, starts_at: e.target.value }))} /></div><div className="grid gap-2"><Label>ينتهي في</Label><Input type="datetime-local" value={editor.ends_at} onChange={e => setEditor(v => ({ ...v, ends_at: e.target.value }))} /></div></div></div>

            <div className="grid gap-3"><div><Label>الفروع</Label><p className="text-xs text-muted-foreground">بدون اختيار = يظهر في كل الفروع.</p></div><div className="grid max-h-44 gap-2 overflow-y-auto rounded-2xl border p-3 sm:grid-cols-2">{state.branches.map((branch: HomeBuilderBranch) => { const checked = editor.branch_ids.includes(branch.id); return <label key={branch.id} className="flex cursor-pointer items-center gap-2 rounded-xl p-2 hover:bg-muted"><Checkbox checked={checked} onCheckedChange={() => setEditor(v => ({ ...v, branch_ids: checked ? v.branch_ids.filter(id => id !== branch.id) : [...v.branch_ids, branch.id] }))} /><span className="text-sm">{branch.name}</span></label>; })}</div></div>
            <label className="flex items-center justify-between rounded-2xl border p-4"><div><strong className="text-sm">إظهار الجزء</strong><p className="text-xs text-muted-foreground">يمكن حفظه مخفيًا وتجهيزه للنشر لاحقًا.</p></div><Switch checked={editor.is_active} onCheckedChange={checked => setEditor(v => ({ ...v, is_active: checked }))} /></label>
          </div>
          <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>إلغاء</Button><Button onClick={saveEditor} disabled={saving} className="bg-[#005931] hover:bg-[#004525]">{saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle>معاينة مسودة الصفحة</DialogTitle><DialogDescription>ترتيب تقريبي لشاشة الموبايل قبل النشر.</DialogDescription></DialogHeader>
          <div className="mx-auto max-h-[70vh] w-full max-w-[390px] overflow-y-auto rounded-[32px] border-[6px] border-slate-900 bg-[#f6f8f7] p-3 shadow-2xl">
            <div className="mb-3 h-10 rounded-2xl bg-white shadow-sm" />
            {sections.filter(s => s.is_active).map(section => { const meta = typeMeta[section.section_type]; const Icon = meta.icon; return <div key={section.id} className={`mb-3 rounded-2xl border bg-white p-3 shadow-sm ${section.section_type === 'hero_banners' ? 'h-28' : ''}`}><div className="mb-2 flex items-center gap-2 text-[#005931]"><Icon className="h-4 w-4" /><strong className="text-xs">{section.title || meta.defaultTitle}</strong></div>{section.section_type === 'hero_banners' ? <div className="h-16 rounded-xl bg-gradient-to-l from-emerald-700 to-emerald-400" /> : section.section_type === 'categories' ? <div className="flex gap-2">{[1,2,3,4].map(x => <div key={x} className="h-12 w-12 rounded-full bg-emerald-50" />)}</div> : <div className="grid grid-cols-3 gap-2">{[1,2,3].map(x => <div key={x} className="h-20 rounded-xl bg-slate-100" />)}</div>}</div>; })}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}><AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>نشر المسودة v{state.draft.version}؟</AlertDialogTitle><AlertDialogDescription>الترتيب الحالي سيظهر فورًا للعملاء. النسخة المنشورة الحالية ستُحفظ كنسخة مؤرشفة وسيتم إنشاء مسودة جديدة تلقائيًا.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>إلغاء</AlertDialogCancel><AlertDialogAction onClick={publish} disabled={saving} className="bg-[#005931] hover:bg-[#004525]">{saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}نشر الآن</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={open => !open && setDeleteTarget(null)}><AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>حذف الجزء من المسودة؟</AlertDialogTitle><AlertDialogDescription>لن يتأثر الإصدار المنشور الحالي حتى تضغط نشر.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>إلغاء</AlertDialogCancel><AlertDialogAction onClick={confirmDelete} disabled={saving} className="bg-destructive text-destructive-foreground">حذف</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </MainLayout>
  );
};

export default HomePageBuilder;
