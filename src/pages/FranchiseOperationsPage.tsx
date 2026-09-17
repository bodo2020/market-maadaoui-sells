import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock3,
  Loader2,
  PackagePlus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tag,
  TriangleAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { fetchMyFranchisePortalIdentity } from '@/services/supabase/franchisePortalService';
import {
  adjustFranchiseInventory,
  advanceFranchiseOrder,
  cancelMyFranchiseOperationRequest,
  fetchFranchiseOperationsWorkspace,
  requestFranchiseBranchSettings,
  requestFranchiseCatalogChange,
  searchFranchiseCatalog,
  setFranchisePrice,
  type FranchiseCatalogSearchItem,
  type FranchiseOperationsProduct,
} from '@/services/supabase/franchiseOperationsService';

function money(value?: number | null) {
  return `${Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
}

function qty(value?: number | null) {
  return Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 3 });
}

function requestTypeLabel(type: string) {
  const labels: Record<string, string> = {
    inventory_adjustment: 'تعديل مخزون',
    price_change: 'تعديل سعر / عرض',
    catalog_add: 'إضافة منتج',
    catalog_remove: 'إزالة منتج',
    branch_settings: 'إعدادات فرع',
    order_status: 'حالة طلب',
  };
  return labels[type] || type;
}

function requestStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: 'بانتظار الموافقة',
    approved: 'معتمد',
    rejected: 'مرفوض',
    applied: 'تم التطبيق',
    failed: 'فشل التطبيق',
    cancelled: 'ملغي',
  };
  return labels[status] || status;
}

function nextOrderStatus(status: string) {
  if (status === 'pending') return { value: 'confirmed', label: 'تأكيد الطلب' };
  if (status === 'confirmed') return { value: 'preparing', label: 'بدء التجهيز' };
  if (status === 'preparing') return { value: 'ready', label: 'جاهز للتسليم' };
  return null;
}

export default function FranchiseOperationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { merchantId } = useParams<{ merchantId: string }>();
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [productSearch, setProductSearch] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [inventoryProduct, setInventoryProduct] = useState<FranchiseOperationsProduct | null>(null);
  const [inventoryDelta, setInventoryDelta] = useState('');
  const [inventoryNote, setInventoryNote] = useState('');
  const [priceProduct, setPriceProduct] = useState<FranchiseOperationsProduct | null>(null);
  const [salePrice, setSalePrice] = useState('');
  const [offerPrice, setOfferPrice] = useState('');
  const [isOffer, setIsOffer] = useState(false);
  const [priceNote, setPriceNote] = useState('');
  const [catalogItem, setCatalogItem] = useState<FranchiseCatalogSearchItem | null>(null);
  const [catalogPrice, setCatalogPrice] = useState('');
  const [catalogNote, setCatalogNote] = useState('');
  const [settingsNote, setSettingsNote] = useState('');

  const identityQuery = useQuery({
    queryKey: ['franchise-portal-identity'],
    queryFn: fetchMyFranchisePortalIdentity,
    staleTime: 30_000,
    retry: false,
  });
  const selectedMerchantId = merchantId || identityQuery.data?.default_merchant_id || '';

  const workspaceQuery = useQuery({
    queryKey: ['franchise-operations-v1', selectedMerchantId, selectedBranchId, productSearch],
    queryFn: () => fetchFranchiseOperationsWorkspace(selectedMerchantId, selectedBranchId || null, productSearch || null),
    enabled: Boolean(selectedMerchantId),
    staleTime: 10_000,
    refetchInterval: 30_000,
    retry: false,
  });

  useEffect(() => {
    if (!selectedBranchId && workspaceQuery.data?.selected_branch_id) setSelectedBranchId(workspaceQuery.data.selected_branch_id);
  }, [selectedBranchId, workspaceQuery.data?.selected_branch_id]);

  const branch = useMemo(
    () => workspaceQuery.data?.branches.find((item) => item.id === (selectedBranchId || workspaceQuery.data?.selected_branch_id)),
    [selectedBranchId, workspaceQuery.data],
  );

  const catalogQuery = useQuery({
    queryKey: ['franchise-catalog-search-v1', selectedMerchantId, selectedBranchId, catalogSearch],
    queryFn: () => searchFranchiseCatalog(selectedMerchantId, selectedBranchId, catalogSearch, 40),
    enabled: Boolean(selectedMerchantId && selectedBranchId && catalogSearch.trim().length >= 2),
    staleTime: 10_000,
    retry: false,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['franchise-operations-v1'] });
    await workspaceQuery.refetch();
  };

  const runMutation = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: async () => { await refresh(); },
  });

  const submitInventory = async () => {
    if (!inventoryProduct || !selectedMerchantId || !selectedBranchId) return;
    const delta = Number(inventoryDelta);
    if (!Number.isFinite(delta) || delta === 0) return toast.error('اكتب كمية تعديل صحيحة غير صفرية.');
    if (inventoryNote.trim().length < 3) return toast.error('اكتب سبب التعديل بوضوح.');
    try {
      await runMutation.mutateAsync(() => adjustFranchiseInventory({
        merchantId: selectedMerchantId,
        branchId: selectedBranchId,
        productId: inventoryProduct.product_id,
        delta,
        reasonCode: 'manual_correction',
        note: inventoryNote,
      }));
      toast.success('تم تحديث المخزون وتسجيل الحركة بنجاح.');
      setInventoryProduct(null); setInventoryDelta(''); setInventoryNote('');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر تعديل المخزون.'); }
  };

  const submitPrice = async () => {
    if (!priceProduct || !selectedMerchantId || !selectedBranchId) return;
    const sale = Number(salePrice);
    const offer = isOffer ? Number(offerPrice) : null;
    if (!Number.isFinite(sale) || sale <= 0) return toast.error('اكتب سعر بيع صحيح.');
    if (isOffer && (!Number.isFinite(offer) || !offer || offer <= 0 || offer >= sale)) return toast.error('سعر العرض لازم يكون أكبر من صفر وأقل من سعر البيع.');
    try {
      const result = await runMutation.mutateAsync(() => setFranchisePrice({
        merchantId: selectedMerchantId,
        branchId: selectedBranchId,
        productId: priceProduct.product_id,
        salePrice: sale,
        offerPrice: offer,
        isOffer,
        note: priceNote,
      }));
      const mode = (result as { mode?: string }).mode;
      toast.success(mode === 'approval_required' ? 'تم إرسال التعديل للمعداوي للموافقة.' : 'تم تحديث السعر مباشرة.');
      setPriceProduct(null); setSalePrice(''); setOfferPrice(''); setIsOffer(false); setPriceNote('');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر تحديث السعر.'); }
  };

  const submitCatalogAdd = async () => {
    if (!catalogItem || !selectedMerchantId || !selectedBranchId) return;
    const price = Number(catalogPrice);
    if (!Number.isFinite(price) || price <= 0) return toast.error('اكتب سعر بيع صحيح للمنتج.');
    try {
      const result = await runMutation.mutateAsync(() => requestFranchiseCatalogChange({
        merchantId: selectedMerchantId,
        branchId: selectedBranchId,
        productId: catalogItem.product_id,
        action: 'add',
        salePrice: price,
        note: catalogNote,
      }));
      toast.success((result as { mode?: string }).mode === 'approval_required' ? 'تم إرسال طلب إضافة المنتج للموافقة.' : 'تمت إضافة المنتج.');
      setCatalogItem(null); setCatalogPrice(''); setCatalogNote('');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر إرسال طلب الإضافة.'); }
  };

  const removeCatalogProduct = async (product: FranchiseOperationsProduct) => {
    if (!selectedMerchantId || !selectedBranchId) return;
    try {
      const result = await runMutation.mutateAsync(() => requestFranchiseCatalogChange({
        merchantId: selectedMerchantId,
        branchId: selectedBranchId,
        productId: product.product_id,
        action: 'remove',
        note: 'طلب إزالة المنتج من كتالوج الفرع',
      }));
      toast.success((result as { mode?: string }).mode === 'approval_required' ? 'تم إرسال طلب إزالة المنتج للموافقة.' : 'تمت إزالة المنتج.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر إرسال طلب الإزالة.'); }
  };

  const updateBranchSettings = async () => {
    if (!branch || !selectedMerchantId || !selectedBranchId) return;
    const address = (document.getElementById('franchise-address') as HTMLInputElement | null)?.value || '';
    const phone = (document.getElementById('franchise-phone') as HTMLInputElement | null)?.value || '';
    const email = (document.getElementById('franchise-email') as HTMLInputElement | null)?.value || '';
    const opensAt = (document.getElementById('franchise-opens') as HTMLInputElement | null)?.value || '';
    const closesAt = (document.getElementById('franchise-closes') as HTMLInputElement | null)?.value || '';
    const deliveryFee = Number((document.getElementById('franchise-delivery-fee') as HTMLInputElement | null)?.value || branch.delivery_fee || 0);
    const minimum = Number((document.getElementById('franchise-min-order') as HTMLInputElement | null)?.value || branch.min_order_amount || 0);
    const eta = Number((document.getElementById('franchise-eta') as HTMLInputElement | null)?.value || branch.estimated_delivery_minutes || 30);
    try {
      await runMutation.mutateAsync(() => requestFranchiseBranchSettings({
        merchantId: selectedMerchantId,
        branchId: selectedBranchId,
        settings: { address, phone, email, opens_at: opensAt, closes_at: closesAt, delivery_fee: deliveryFee, min_order_amount: minimum, estimated_delivery_minutes: eta },
        note: settingsNote || 'تحديث إعدادات تشغيل الفرع',
      }));
      toast.success('تم إرسال إعدادات الفرع للمعداوي للمراجعة.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر إرسال إعدادات الفرع.'); }
  };

  if (identityQuery.isLoading || workspaceQuery.isLoading) {
    return <div dir='rtl' className='grid min-h-screen place-items-center bg-slate-50'><div className='text-center'><Loader2 className='mx-auto h-8 w-8 animate-spin text-[#005931]' /><p className='mt-3 font-bold text-slate-500'>جارٍ تحميل مركز التشغيل…</p></div></div>;
  }

  if (identityQuery.error || workspaceQuery.error || !workspaceQuery.data) {
    const error = identityQuery.error || workspaceQuery.error;
    return <div dir='rtl' className='grid min-h-screen place-items-center bg-slate-50 p-6'><div className='max-w-lg rounded-3xl border border-red-100 bg-white p-8 text-center shadow-sm'><TriangleAlert className='mx-auto h-10 w-10 text-red-600' /><h1 className='mt-4 text-xl font-black'>تعذر فتح مركز التشغيل</h1><p className='mt-2 text-sm font-bold text-slate-500'>{error instanceof Error ? error.message : 'راجع الصلاحيات وحاول مرة أخرى.'}</p><Button className='mt-5' variant='outline' onClick={() => navigate(selectedMerchantId ? `/franchise-portal/${selectedMerchantId}` : '/franchise-portal')}><ArrowRight className='ml-2 h-4 w-4' />العودة للبوابة</Button></div></div>;
  }

  const data = workspaceQuery.data;
  const agreement = data.agreement;

  return <div dir='rtl' className='min-h-screen bg-slate-50 text-slate-950'>
    <header className='sticky top-0 z-30 border-b bg-white/95 backdrop-blur'>
      <div className='mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-3 sm:px-6'>
        <Button variant='outline' size='sm' onClick={() => navigate(`/franchise-portal/${selectedMerchantId}`)}><ArrowRight className='ml-2 h-4 w-4' />الرئيسية</Button>
        <div className='flex h-10 w-10 items-center justify-center rounded-2xl bg-[#005931] text-white'><Store className='h-5 w-5' /></div>
        <div className='min-w-0 flex-1'><p className='font-black'>مركز تشغيل الـFranchise</p><p className='text-xs font-bold text-slate-500'>المخزون · الأسعار · الكتالوج · الطلبات · الفرع</p></div>
        <Button variant='outline' size='sm' onClick={() => void refresh()} disabled={workspaceQuery.isFetching}><RefreshCw className={`ml-2 h-4 w-4 ${workspaceQuery.isFetching ? 'animate-spin' : ''}`} />تحديث</Button>
      </div>
    </header>

    <main className='mx-auto max-w-[1500px] space-y-5 px-4 py-6 sm:px-6'>
      <section className='rounded-3xl border border-emerald-100 bg-gradient-to-l from-emerald-50 to-white p-5 shadow-sm'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
          <div><div className='flex flex-wrap gap-2'><Badge className='bg-[#005931] hover:bg-[#005931]'>SELF-SERVICE</Badge><Badge variant='outline'>Pricing: {agreement.pricing_policy}</Badge><Badge variant='outline'>Catalog: {agreement.catalog_policy}</Badge></div><h1 className='mt-3 text-2xl font-black'>تشغيل الفرع بصلاحيات العقد</h1><p className='mt-2 text-sm font-bold text-slate-500'>التعديلات الآمنة تُنفّذ مباشرة، والتعديلات الحساسة تتحول تلقائيًا لموافقة المعداوي.</p></div>
          <div className='min-w-[240px]'><Label className='mb-1 block'>الفرع</Label><select value={selectedBranchId || data.selected_branch_id} onChange={(event) => setSelectedBranchId(event.target.value)} className='h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold'>{data.branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        </div>
      </section>

      <Tabs defaultValue='inventory' className='space-y-4'>
        <TabsList className='h-auto w-full justify-start overflow-x-auto rounded-2xl bg-white p-1 shadow-sm'>
          <TabsTrigger value='inventory'><Boxes className='ml-2 h-4 w-4' />المخزون والأسعار</TabsTrigger>
          <TabsTrigger value='catalog'><PackagePlus className='ml-2 h-4 w-4' />الكتالوج</TabsTrigger>
          <TabsTrigger value='orders'><ShoppingBag className='ml-2 h-4 w-4' />الطلبات</TabsTrigger>
          <TabsTrigger value='branch'><Settings2 className='ml-2 h-4 w-4' />إعدادات الفرع</TabsTrigger>
          <TabsTrigger value='requests'><ShieldCheck className='ml-2 h-4 w-4' />طلبات الموافقة</TabsTrigger>
        </TabsList>

        <TabsContent value='inventory' className='space-y-4'>
          <div className='flex flex-col gap-3 rounded-3xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center'><div className='relative flex-1'><Search className='absolute right-3 top-3 h-4 w-4 text-slate-400' /><Input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder='ابحث باسم المنتج أو الباركود' className='pr-10' /></div><Badge variant='outline'>{data.products.length.toLocaleString('ar-EG')} منتج</Badge></div>
          <div className='grid gap-3 lg:grid-cols-2'>
            {data.products.map((product) => <Card key={product.product_id} className='rounded-3xl border-slate-100 shadow-sm'><CardContent className='p-5'><div className='flex items-start justify-between gap-3'><div className='min-w-0'><h3 className='font-black'>{product.name}</h3><p className='mt-1 text-xs font-bold text-slate-400'>{product.barcode || 'بدون باركود'}</p></div><Badge variant='outline'>{product.listing_status}</Badge></div><div className='mt-4 grid grid-cols-3 gap-2 text-center'><div className='rounded-2xl bg-slate-50 p-3'><p className='text-[10px] font-black text-slate-400'>الرصيد</p><p className='mt-1 text-lg font-black'>{qty(product.quantity)}</p></div><div className='rounded-2xl bg-slate-50 p-3'><p className='text-[10px] font-black text-slate-400'>السعر</p><p className='mt-1 text-sm font-black'>{money(product.sale_price)}</p></div><div className={product.is_offer ? 'rounded-2xl bg-emerald-50 p-3' : 'rounded-2xl bg-slate-50 p-3'}><p className='text-[10px] font-black text-slate-400'>العرض</p><p className='mt-1 text-sm font-black'>{product.is_offer ? money(product.offer_price) : '—'}</p></div></div><div className='mt-4 flex flex-wrap gap-2'><Button size='sm' variant='outline' disabled={!agreement.can_manage_inventory} onClick={() => { setInventoryProduct(product); setInventoryDelta(''); setInventoryNote(''); }}>تعديل المخزون</Button><Button size='sm' onClick={() => { setPriceProduct(product); setSalePrice(String(product.sale_price || '')); setOfferPrice(String(product.offer_price || '')); setIsOffer(product.is_offer); setPriceNote(''); }}><Tag className='ml-2 h-4 w-4' />السعر والعرض</Button><Button size='sm' variant='ghost' className='text-red-700' onClick={() => void removeCatalogProduct(product)}>طلب إزالة</Button></div></CardContent></Card>)}
          </div>
          {data.products.length === 0 ? <div className='rounded-3xl border border-dashed bg-white p-10 text-center text-sm font-bold text-slate-500'>لا توجد منتجات مطابقة داخل الفرع.</div> : null}
        </TabsContent>

        <TabsContent value='catalog' className='space-y-4'>
          <Card className='rounded-3xl'><CardHeader><CardTitle>إضافة منتج من كتالوج المعداوي</CardTitle></CardHeader><CardContent><div className='relative'><Search className='absolute right-3 top-3 h-4 w-4 text-slate-400' /><Input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder='اكتب حرفين على الأقل من الاسم أو الباركود' className='pr-10' /></div></CardContent></Card>
          {catalogQuery.isFetching ? <div className='flex justify-center p-8'><Loader2 className='h-7 w-7 animate-spin text-[#005931]' /></div> : <div className='grid gap-3 lg:grid-cols-2'>{(catalogQuery.data || []).map((item) => <Card key={item.product_id} className='rounded-3xl'><CardContent className='flex items-center gap-4 p-4'><div className='min-w-0 flex-1'><h3 className='font-black'>{item.name}</h3><p className='mt-1 text-xs font-bold text-slate-400'>{item.barcode || 'بدون باركود'} · السعر الافتراضي {money(item.default_price)}</p></div>{item.already_listed ? <Badge variant='outline'>مضاف بالفعل</Badge> : <Button size='sm' onClick={() => { setCatalogItem(item); setCatalogPrice(String(item.default_price || '')); setCatalogNote(''); }}>طلب إضافة</Button>}</CardContent></Card>)}</div>}
        </TabsContent>

        <TabsContent value='orders' className='space-y-3'>
          {data.orders.map((order) => { const next = nextOrderStatus(order.status); return <Card key={order.id} className='rounded-3xl'><CardContent className='flex flex-col gap-4 p-5 lg:flex-row lg:items-center'><div className='min-w-0 flex-1'><div className='flex flex-wrap gap-2'><Badge>{order.status}</Badge><Badge variant='outline'>{order.payment_status}</Badge></div><p className='mt-2 font-black'>طلب #{order.id.slice(0, 8)}</p><p className='mt-1 text-sm font-bold text-slate-500'>{money(order.total)} · {new Date(order.created_at).toLocaleString('ar-EG')}</p></div>{next ? <Button disabled={runMutation.isPending} onClick={async () => { try { const result = await runMutation.mutateAsync(() => advanceFranchiseOrder({ merchantId: selectedMerchantId, orderId: order.id, targetStatus: next.value, note: 'تحديث حالة الطلب من بوابة Franchise' })); toast.success((result as { mode?: string }).mode === 'approval_required' ? 'تم إرسال الانتقال للموافقة.' : 'تم تحديث حالة الطلب.'); } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر تحديث الطلب.'); } }}>{next.label}</Button> : <Badge variant='outline'>لا توجد خطوة تشغيلية متاحة من البوابة</Badge>}</CardContent></Card>; })}
          {data.orders.length === 0 ? <div className='rounded-3xl border border-dashed bg-white p-10 text-center text-sm font-bold text-slate-500'>لا توجد طلبات لهذا الفرع حاليًا.</div> : null}
        </TabsContent>

        <TabsContent value='branch'>
          {branch ? <Card className='rounded-3xl'><CardHeader><CardTitle>تحديث بيانات تشغيل {branch.name}</CardTitle></CardHeader><CardContent className='space-y-4'><div className='grid gap-4 md:grid-cols-2'><div><Label>العنوان</Label><Input id='franchise-address' defaultValue={branch.address || ''} /></div><div><Label>الهاتف</Label><Input id='franchise-phone' defaultValue={branch.phone || ''} /></div><div><Label>البريد الإلكتروني</Label><Input id='franchise-email' defaultValue={branch.email || ''} /></div><div className='grid grid-cols-2 gap-2'><div><Label>الفتح</Label><Input id='franchise-opens' type='time' defaultValue={branch.opens_at?.slice(0, 5) || ''} /></div><div><Label>الإغلاق</Label><Input id='franchise-closes' type='time' defaultValue={branch.closes_at?.slice(0, 5) || ''} /></div></div><div><Label>رسوم التوصيل</Label><Input id='franchise-delivery-fee' type='number' min='0' step='0.01' defaultValue={branch.delivery_fee} /></div><div><Label>الحد الأدنى للطلب</Label><Input id='franchise-min-order' type='number' min='0' step='0.01' defaultValue={branch.min_order_amount} /></div><div><Label>زمن التوصيل المتوقع بالدقائق</Label><Input id='franchise-eta' type='number' min='1' defaultValue={branch.estimated_delivery_minutes || 30} /></div></div><div><Label>ملاحظة للمراجعة</Label><Textarea value={settingsNote} onChange={(event) => setSettingsNote(event.target.value)} placeholder='وضح سبب التعديل إن لزم' /></div><div className='rounded-2xl border border-amber-100 bg-amber-50 p-3 text-sm font-bold text-amber-900'>تعديلات بيانات الفرع لا تُطبق مباشرة؛ تذهب للمعداوي للموافقة لحماية إعدادات التوصيل والتشغيل.</div><Button onClick={() => void updateBranchSettings()} disabled={runMutation.isPending}><ShieldCheck className='ml-2 h-4 w-4' />إرسال للموافقة</Button></CardContent></Card> : null}
        </TabsContent>

        <TabsContent value='requests' className='space-y-3'>
          {data.requests.map((request) => <Card key={request.id} className='rounded-3xl'><CardContent className='flex flex-col gap-4 p-5 lg:flex-row lg:items-center'><div className='min-w-0 flex-1'><div className='flex flex-wrap gap-2'><Badge variant='outline'>{requestTypeLabel(request.request_type)}</Badge><Badge className={request.status === 'applied' ? 'bg-emerald-600' : request.status === 'rejected' ? 'bg-red-600' : request.status === 'pending' ? 'bg-amber-600' : 'bg-slate-600'}>{requestStatusLabel(request.status)}</Badge></div><p className='mt-2 text-xs font-bold text-slate-500'>{new Date(request.created_at).toLocaleString('ar-EG')}</p>{request.decision_note ? <p className='mt-2 rounded-xl bg-slate-50 p-3 text-sm font-bold'>{request.decision_note}</p> : null}</div>{request.status === 'pending' ? <Button variant='outline' size='sm' disabled={runMutation.isPending} onClick={async () => { try { await runMutation.mutateAsync(() => cancelMyFranchiseOperationRequest(request.id)); toast.success('تم إلغاء الطلب.'); } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر إلغاء الطلب.'); } }}>إلغاء طلبي</Button> : request.status === 'applied' ? <CheckCircle2 className='h-6 w-6 text-emerald-600' /> : <Clock3 className='h-6 w-6 text-slate-400' />}</CardContent></Card>)}
          {data.requests.length === 0 ? <div className='rounded-3xl border border-dashed bg-white p-10 text-center text-sm font-bold text-slate-500'>لا توجد طلبات موافقة سابقة لهذا الفرع.</div> : null}
        </TabsContent>
      </Tabs>
    </main>

    <Dialog open={Boolean(inventoryProduct)} onOpenChange={(open) => !open && setInventoryProduct(null)}><DialogContent dir='rtl'><DialogHeader><DialogTitle>تعديل مخزون {inventoryProduct?.name}</DialogTitle></DialogHeader><div className='space-y-4'><div><Label>التغيير في الكمية</Label><Input type='number' step='0.001' value={inventoryDelta} onChange={(event) => setInventoryDelta(event.target.value)} placeholder='مثال: 5 أو -2' /></div><div><Label>سبب التعديل</Label><Textarea value={inventoryNote} onChange={(event) => setInventoryNote(event.target.value)} placeholder='مثال: تصحيح استلام أو جرد يدوي' /></div></div><DialogFooter><Button variant='outline' onClick={() => setInventoryProduct(null)}>إلغاء</Button><Button onClick={() => void submitInventory()} disabled={runMutation.isPending}>{runMutation.isPending ? <Loader2 className='ml-2 h-4 w-4 animate-spin' /> : null}حفظ التعديل</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(priceProduct)} onOpenChange={(open) => !open && setPriceProduct(null)}><DialogContent dir='rtl'><DialogHeader><DialogTitle>السعر والعرض — {priceProduct?.name}</DialogTitle></DialogHeader><div className='space-y-4'><div><Label>سعر البيع</Label><Input type='number' min='0.01' step='0.01' value={salePrice} onChange={(event) => setSalePrice(event.target.value)} /></div><label className='flex items-center gap-2 rounded-xl border p-3 font-bold'><input type='checkbox' checked={isOffer} onChange={(event) => setIsOffer(event.target.checked)} />تفعيل عرض</label>{isOffer ? <div><Label>سعر العرض</Label><Input type='number' min='0.01' step='0.01' value={offerPrice} onChange={(event) => setOfferPrice(event.target.value)} /></div> : null}<div><Label>ملاحظة</Label><Textarea value={priceNote} onChange={(event) => setPriceNote(event.target.value)} /></div>{isOffer && agreement.promotion_policy !== 'independent' ? <div className='rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900'>العروض في عقدك تحتاج موافقة المعداوي. الحد المسجل للخصم {agreement.max_discount_percentage}%.</div> : null}</div><DialogFooter><Button variant='outline' onClick={() => setPriceProduct(null)}>إلغاء</Button><Button onClick={() => void submitPrice()} disabled={runMutation.isPending}>حفظ</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(catalogItem)} onOpenChange={(open) => !open && setCatalogItem(null)}><DialogContent dir='rtl'><DialogHeader><DialogTitle>إضافة {catalogItem?.name}</DialogTitle></DialogHeader><div className='space-y-4'><div><Label>سعر البيع المقترح</Label><Input type='number' min='0.01' step='0.01' value={catalogPrice} onChange={(event) => setCatalogPrice(event.target.value)} /></div><div><Label>ملاحظة</Label><Textarea value={catalogNote} onChange={(event) => setCatalogNote(event.target.value)} placeholder='سبب الإضافة أو ملاحظة للمراجعة' /></div>{agreement.catalog_policy !== 'independent' ? <div className='rounded-xl bg-blue-50 p-3 text-sm font-bold text-blue-900'>الكتالوج في عقدك {agreement.catalog_policy}؛ الطلب سيذهب للموافقة قبل الإضافة.</div> : null}</div><DialogFooter><Button variant='outline' onClick={() => setCatalogItem(null)}>إلغاء</Button><Button onClick={() => void submitCatalogAdd()} disabled={runMutation.isPending}>إرسال الطلب</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
