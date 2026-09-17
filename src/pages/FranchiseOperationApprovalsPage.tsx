import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Clock3, Loader2, RefreshCw, ShieldCheck, Store, XCircle } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useBranchStore } from '@/stores/branchStore';
import { fetchApprovalCenterV1, type ApprovalItem } from '@/services/supabase/approvalCenterV1Service';
import { claimOperationsTask, startOperationsTask } from '@/services/supabase/operationsTaskService';
import {
  decideFranchiseOperation,
  fetchFranchiseOperationRequest,
  type FranchiseOperationRequest,
} from '@/services/supabase/franchiseOperationsService';

function requestTypeLabel(type?: string | null) {
  const labels: Record<string, string> = {
    price_change: 'تسعير / عرض',
    catalog_add: 'إضافة منتج',
    catalog_remove: 'إزالة منتج',
    branch_settings: 'إعدادات فرع',
    order_status: 'حالة طلب',
    inventory_adjustment: 'تعديل مخزون',
  };
  return type ? labels[type] || type : 'طلب Franchise';
}

function statusLabel(status?: string | null) {
  const labels: Record<string, string> = { pending: 'بانتظار القرار', applied: 'تم التطبيق', rejected: 'مرفوض', failed: 'فشل التطبيق', cancelled: 'ملغي' };
  return status ? labels[status] || status : '—';
}

function payloadLines(payload?: Record<string, unknown> | null) {
  if (!payload) return [] as string[];
  const result: string[] = [];
  const labels: Record<string, string> = {
    sale_price: 'سعر البيع', offer_price: 'سعر العرض', discount_percentage: 'نسبة الخصم', action: 'الإجراء',
    address: 'العنوان', phone: 'الهاتف', email: 'البريد', opens_at: 'الفتح', closes_at: 'الإغلاق',
    delivery_fee: 'رسوم التوصيل', min_order_amount: 'الحد الأدنى', estimated_delivery_minutes: 'زمن التوصيل',
    expected_status: 'الحالة الحالية', target_status: 'الحالة المطلوبة', note: 'ملاحظة المشغّل',
  };
  Object.entries(payload).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    if (['pricing_source_branch_id', 'inventory_source_branch_id'].includes(key)) return;
    result.push(`${labels[key] || key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
  });
  return result;
}

export default function FranchiseOperationApprovalsPage() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [selectedTask, setSelectedTask] = useState<ApprovalItem | null>(null);
  const [detail, setDetail] = useState<FranchiseOperationRequest | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ['franchise-operation-approvals-v1', currentBranchId],
    queryFn: () => fetchApprovalCenterV1(currentBranchId as string, 'all', 200),
    enabled: Boolean(currentBranchId),
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });

  const items = useMemo(
    () => (query.data?.items || []).filter((item) => item.source_kind === 'franchise_operation'),
    [query.data?.items],
  );

  const pending = items.filter((item) => ['open', 'claimed', 'in_progress', 'failed'].includes(item.status));
  const completed = items.filter((item) => item.status === 'completed');

  const openRequest = async (item: ApprovalItem) => {
    setBusy(true);
    try {
      if (item.status === 'open' && item.can_claim) await claimOperationsTask(item.id);
      try { await startOperationsTask(item.id); } catch { /* request may already be in progress */ }
      const request = await fetchFranchiseOperationRequest(item.source_id);
      setSelectedTask(item);
      setDetail(request);
      setNote('');
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر فتح طلب الـFranchise.');
    } finally { setBusy(false); }
  };

  const decide = async (decision: 'approve' | 'reject') => {
    if (!detail || busy) return;
    if (note.trim().length < 3) return toast.error('اكتب سبب القرار أو نتيجة المراجعة.');
    setBusy(true);
    try {
      await decideFranchiseOperation(detail.id, decision, note);
      toast.success(decision === 'approve' ? 'تم اعتماد الطلب وتطبيق التغيير بنجاح.' : 'تم رفض طلب الـFranchise.');
      setSelectedTask(null); setDetail(null); setNote('');
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تسجيل القرار.');
      await query.refetch();
    } finally { setBusy(false); }
  };

  return <MainLayout>
    <div dir='rtl' className='mx-auto max-w-[1450px] space-y-5 py-5'>
      <section className='rounded-3xl border border-emerald-100 bg-gradient-to-l from-emerald-50 to-white p-5 shadow-sm md:p-7'>
        <div className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
          <div><div className='flex items-center gap-2'><ShieldCheck className='h-6 w-6 text-[#005931]' /><h1 className='text-2xl font-black'>موافقات تشغيل الـFranchise</h1></div><p className='mt-2 text-sm font-bold text-slate-500'>{currentBranchName || 'اختر الفرع'} · التسعير والعروض والكتالوج وإعدادات الفرع التي تحتاج اعتماد المعداوي.</p></div>
          <Button variant='outline' onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />تحديث</Button>
        </div>
        <div className='mt-5 grid grid-cols-2 gap-3 md:max-w-md'><div className='rounded-2xl border bg-white p-4'><div className='text-xs font-black text-slate-400'>بانتظار القرار</div><div className='mt-1 text-3xl font-black'>{pending.length.toLocaleString('ar-EG')}</div></div><div className='rounded-2xl border bg-white p-4'><div className='text-xs font-black text-slate-400'>مكتملة</div><div className='mt-1 text-3xl font-black'>{completed.length.toLocaleString('ar-EG')}</div></div></div>
      </section>

      {!currentBranchId ? <div className='rounded-3xl border border-dashed bg-white p-10 text-center font-bold text-slate-500'>اختر فرعًا من أعلى النظام أولًا.</div>
        : query.isLoading ? <div className='flex min-h-64 items-center justify-center'><Loader2 className='h-8 w-8 animate-spin text-[#005931]' /></div>
        : query.isError ? <div className='rounded-3xl border border-red-200 bg-red-50 p-6 font-bold text-red-800'>{query.error instanceof Error ? query.error.message : 'تعذر تحميل طلبات الـFranchise.'}</div>
        : items.length === 0 ? <div className='rounded-3xl border border-dashed bg-white p-12 text-center'><Store className='mx-auto h-10 w-10 text-[#005931]' /><h2 className='mt-3 text-lg font-black'>لا توجد طلبات Franchise لهذا الفرع</h2><p className='mt-1 text-sm font-bold text-slate-500'>أي تعديل حساس من بوابة المشغّل سيظهر هنا تلقائيًا.</p></div>
        : <div className='space-y-3'>{items.map((item) => {
          const active = ['open', 'claimed', 'in_progress', 'failed'].includes(item.status);
          return <Card key={item.id} className='rounded-3xl'><CardContent className='flex flex-col gap-4 p-5 lg:flex-row lg:items-center'><div className='min-w-0 flex-1'><div className='flex flex-wrap gap-2'><Badge className={active ? 'bg-amber-600' : 'bg-emerald-600'}>{active ? 'بانتظار القرار' : 'مكتمل'}</Badge><Badge variant='outline'>{item.priority === 'high' ? 'أولوية عالية' : 'عادية'}</Badge></div><h3 className='mt-3 text-lg font-black'>{item.title}</h3>{item.description ? <p className='mt-1 text-sm font-bold text-slate-500'>{item.description}</p> : null}<p className='mt-2 text-xs font-bold text-slate-400'>{new Date(item.created_at).toLocaleString('ar-EG')}</p>{item.resolution_note ? <div className='mt-3 rounded-xl bg-slate-50 p-3 text-sm font-bold'>القرار: {item.resolution_note}</div> : null}</div>{active ? <Button disabled={busy} onClick={() => void openRequest(item)}>{busy ? <Loader2 className='ml-2 h-4 w-4 animate-spin' /> : <ShieldCheck className='ml-2 h-4 w-4' />}مراجعة واتخاذ قرار</Button> : <CheckCircle2 className='h-6 w-6 text-emerald-600' />}</CardContent></Card>;
        })}</div>}
    </div>

    <Dialog open={Boolean(selectedTask)} onOpenChange={(open) => { if (!open && !busy) { setSelectedTask(null); setDetail(null); setNote(''); } }}>
      <DialogContent dir='rtl' className='max-w-xl'>
        <DialogHeader><DialogTitle>قرار طلب Franchise</DialogTitle></DialogHeader>
        {!detail ? <div className='flex min-h-40 items-center justify-center'><Loader2 className='h-7 w-7 animate-spin' /></div> : <div className='space-y-4'>
          <div className='rounded-2xl border bg-slate-50 p-4'><div className='flex flex-wrap gap-2'><Badge variant='outline'>{requestTypeLabel(detail.request_type)}</Badge><Badge>{statusLabel(detail.status)}</Badge></div><h3 className='mt-3 font-black'>{detail.merchant_name || 'Franchise'} · {detail.branch_name || 'الفرع'}</h3>{detail.product_name ? <p className='mt-1 text-sm font-bold text-slate-500'>المنتج: {detail.product_name}</p> : null}</div>
          <div className='space-y-2 rounded-2xl border p-4'>{payloadLines(detail.payload).length ? payloadLines(detail.payload).map((line) => <p key={line} className='text-sm font-bold text-slate-700'>{line}</p>) : <p className='text-sm font-bold text-slate-500'>لا توجد تفاصيل إضافية.</p>}</div>
          <div className='rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm font-bold leading-6 text-blue-900'>الاعتماد يطبق التغيير Server-side على نفس الـmerchant والفرع فقط. الرفض يغلق الطلب بدون تنفيذ التغيير.</div>
          <div><Label>ملاحظة القرار</Label><Textarea autoFocus value={note} onChange={(event) => setNote(event.target.value)} placeholder='ما الذي تمت مراجعته ولماذا تم الاعتماد أو الرفض؟' /></div>
        </div>}
        <DialogFooter className='gap-2 sm:justify-start'><Button variant='outline' disabled={busy} onClick={() => { setSelectedTask(null); setDetail(null); setNote(''); }}>إغلاق</Button><Button variant='destructive' disabled={busy || !detail} onClick={() => void decide('reject')}>{busy ? <Loader2 className='ml-2 h-4 w-4 animate-spin' /> : <XCircle className='ml-2 h-4 w-4' />}رفض</Button><Button disabled={busy || !detail} onClick={() => void decide('approve')}>{busy ? <Loader2 className='ml-2 h-4 w-4 animate-spin' /> : <CheckCircle2 className='ml-2 h-4 w-4' />}اعتماد وتطبيق</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </MainLayout>;
}
