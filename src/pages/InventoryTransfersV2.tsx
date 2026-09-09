import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  Send,
  Truck,
  Warehouse,
  X,
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBranchStore } from "@/stores/branchStore";
import {
  cancelInventoryTransferV2,
  createInventoryTransferV2,
  dispatchInventoryTransferV2,
  fetchInventoryTransferWorkspaceV2,
  receiveInventoryTransferV2,
  searchInventoryTransferProductsV2,
  type InventoryTransferProductV2,
  type InventoryTransferV2,
} from "@/services/supabase/inventoryTransfersV2Service";

const qty = (value: number | null | undefined) => Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 3 });

function dt(value?: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "—";
  }
}

function statusBadge(status: string, hasVariance = false) {
  if (status === "pending") return <Badge className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50">بانتظار الشحن</Badge>;
  if (status === "in_transit") return <Badge className="border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-50">في الطريق</Badge>;
  if (status === "completed" && hasVariance) return <Badge className="border-red-200 bg-red-50 text-red-700 hover:bg-red-50">مستلم بفرق</Badge>;
  if (status === "completed") return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">مكتمل</Badge>;
  if (status === "cancelled") return <Badge variant="outline" className="text-slate-500">ملغي</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

type CartItem = { product: InventoryTransferProductV2; quantity: string };
type StatusFilter = "all" | "active" | "pending" | "in_transit" | "completed" | "cancelled" | "variance";

export default function InventoryTransfersV2() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [directionFilter, setDirectionFilter] = useState<"all" | "outgoing" | "incoming">("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [createRequestId, setCreateRequestId] = useState("");
  const [targetBranchId, setTargetBranchId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);

  const [dispatchTransfer, setDispatchTransfer] = useState<InventoryTransferV2 | null>(null);
  const [dispatchRequestId, setDispatchRequestId] = useState("");
  const [receiveTransfer, setReceiveTransfer] = useState<InventoryTransferV2 | null>(null);
  const [receiveRequestId, setReceiveRequestId] = useState("");
  const [receivedQty, setReceivedQty] = useState<Record<string, string>>({});
  const [receiveNote, setReceiveNote] = useState("");
  const [cancelTransfer, setCancelTransfer] = useState<InventoryTransferV2 | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);

  const workspaceQuery = useQuery({
    queryKey: ["inventory-transfers-v2", currentBranchId],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchInventoryTransferWorkspaceV2(currentBranchId as string, 100),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const productQuery = useQuery({
    queryKey: ["inventory-transfer-products-v2", currentBranchId, productSearch.trim()],
    enabled: Boolean(currentBranchId && createOpen),
    queryFn: () => searchInventoryTransferProductsV2(currentBranchId as string, productSearch, 30),
    staleTime: 15_000,
  });

  const data = workspaceQuery.data;
  const canTransfer = Boolean(data?.permissions.can_transfer);

  const transfers = useMemo(() => {
    return (data?.transfers || []).filter((transfer) => {
      const variance = transfer.items.some((item) => Math.abs(Number(item.variance_quantity || 0)) > 0.0005);
      const statusOk = statusFilter === "all"
        || (statusFilter === "active" && ["pending", "in_transit"].includes(transfer.status))
        || (statusFilter === "variance" && variance)
        || transfer.status === statusFilter;
      const direction = transfer.from_branch_id === currentBranchId ? "outgoing" : transfer.to_branch_id === currentBranchId ? "incoming" : "all";
      return statusOk && (directionFilter === "all" || direction === directionFilter);
    });
  }, [data?.transfers, statusFilter, directionFilter, currentBranchId]);

  const openCreate = () => {
    setCreateRequestId(crypto.randomUUID());
    setTargetBranchId("");
    setExpectedDate("");
    setNotes("");
    setProductSearch("");
    setCart([]);
    setCreateOpen(true);
  };

  const addProduct = (product: InventoryTransferProductV2) => {
    if (cart.some((item) => item.product.product_id === product.product_id)) return;
    setCart((items) => [...items, { product, quantity: "1" }]);
  };

  const updateCartQty = (productId: string, value: string) => {
    setCart((items) => items.map((item) => item.product.product_id === productId ? { ...item, quantity: value } : item));
  };

  const createTransfer = async () => {
    if (!currentBranchId || !createRequestId || busy) return;
    if (!targetBranchId) return toast.error("اختر فرع الوجهة.");
    if (!cart.length) return toast.error("أضف منتجًا واحدًا على الأقل للتحويل.");
    const items = cart.map((item) => ({ product_id: item.product.product_id, quantity: Number(item.quantity) }));
    const invalid = cart.some((item) => {
      const value = Number(item.quantity);
      return !Number.isFinite(value) || value <= 0 || Math.round(value * 1000) !== value * 1000 || value > item.product.quantity;
    });
    if (invalid) return toast.error("راجع كميات التحويل؛ يجب ألا تتجاوز الرصيد المتاح وبحد أقصى 3 منازل عشرية.");
    setBusy(true);
    try {
      const result = await createInventoryTransferV2({
        requestId: createRequestId,
        fromBranchId: currentBranchId,
        toBranchId: targetBranchId,
        items,
        notes,
        expectedArrivalDate: expectedDate || null,
      });
      toast.success(`تم إنشاء التحويل ${result.transfer_number}. ظهرت مهمة التجهيز لفرع المصدر.`);
      setCreateOpen(false);
      await workspaceQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنشاء التحويل.");
    } finally {
      setBusy(false);
    }
  };

  const openDispatch = (transfer: InventoryTransferV2) => {
    setDispatchTransfer(transfer);
    setDispatchRequestId(crypto.randomUUID());
  };

  const confirmDispatch = async () => {
    if (!dispatchTransfer || !dispatchRequestId || busy) return;
    setBusy(true);
    try {
      await dispatchInventoryTransferV2(dispatchTransfer.id, dispatchRequestId);
      toast.success(`تم شحن ${dispatchTransfer.transfer_number} وخصم الكميات من مخزون المصدر.`);
      setDispatchTransfer(null);
      await workspaceQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر شحن التحويل.");
    } finally {
      setBusy(false);
    }
  };

  const openReceive = (transfer: InventoryTransferV2) => {
    const defaults: Record<string, string> = {};
    transfer.items.forEach((item) => { defaults[item.id] = String(item.dispatched_quantity ?? item.quantity); });
    setReceivedQty(defaults);
    setReceiveNote("");
    setReceiveRequestId(crypto.randomUUID());
    setReceiveTransfer(transfer);
  };

  const confirmReceive = async () => {
    if (!receiveTransfer || !receiveRequestId || busy) return;
    const items = receiveTransfer.items.map((item) => ({ item_id: item.id, received_quantity: Number(receivedQty[item.id]) }));
    const invalid = receiveTransfer.items.some((item) => {
      const value = Number(receivedQty[item.id]);
      const sent = Number(item.dispatched_quantity ?? item.quantity);
      return !Number.isFinite(value) || value < 0 || value > sent || Math.round(value * 1000) !== value * 1000;
    });
    if (invalid) return toast.error("راجع الكميات المستلمة. لا يمكن تسجيل كمية أكبر من المشحونة في هذه المرحلة.");
    const hasVariance = receiveTransfer.items.some((item) => Number(receivedQty[item.id]) !== Number(item.dispatched_quantity ?? item.quantity));
    setBusy(true);
    try {
      await receiveInventoryTransferV2(receiveTransfer.id, receiveRequestId, items, receiveNote);
      toast.success(hasVariance ? "تم الاستلام وتسجيل فرق؛ أُنشئت مهمة مراجعة تلقائيًا." : "تم استلام التحويل ومطابقة كل الكميات.");
      setReceiveTransfer(null);
      await workspaceQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر استلام التحويل.");
    } finally {
      setBusy(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelTransfer || busy) return;
    if (cancelReason.trim().length < 3) return toast.error("اكتب سبب الإلغاء.");
    setBusy(true);
    try {
      await cancelInventoryTransferV2(cancelTransfer.id, cancelReason);
      toast.success("تم إلغاء التحويل قبل الشحن بدون أي حركة مخزون.");
      setCancelTransfer(null);
      setCancelReason("");
      await workspaceQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إلغاء التحويل.");
    } finally {
      setBusy(false);
    }
  };

  if (!currentBranchId) {
    return <MainLayout><div className="p-6" dir="rtl"><Card><CardContent className="p-10 text-center">اختر فرعًا أولًا لعرض التحويلات.</CardContent></Card></div></MainLayout>;
  }

  const summaryCards = [
    { label: "بانتظار الشحن", value: data?.summary.pending || 0, icon: Clock3, filter: "pending" as StatusFilter },
    { label: "صادر في الطريق", value: data?.summary.in_transit_out || 0, icon: ArrowUpRight, filter: "in_transit" as StatusFilter },
    { label: "وارد في الطريق", value: data?.summary.in_transit_in || 0, icon: ArrowDownLeft, filter: "in_transit" as StatusFilter },
    { label: "مكتمل آخر 30 يوم", value: data?.summary.completed_30d || 0, icon: CheckCircle2, filter: "completed" as StatusFilter },
  ];

  return (
    <MainLayout>
      <div className="space-y-5 p-4 md:p-6" dir="rtl">
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="bg-gradient-to-l from-slate-950 via-emerald-950 to-emerald-800 px-5 py-6 text-white md:px-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mb-2 flex flex-wrap gap-2"><Badge className="border-white/20 bg-white/10 text-white hover:bg-white/10">Inventory Transfers V2</Badge><Badge className="border-white/20 bg-white/10 text-white hover:bg-white/10">{currentBranchName || "الفرع الحالي"}</Badge></div>
                <h1 className="text-2xl font-bold md:text-3xl">تحويلات المخزون بين الفروع</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/90">طلب → تجهيز وشحن → خصم ذري من المصدر → استلام فعلي → إضافة للوجهة. أي نقص عند الاستلام يتحول تلقائيًا لمهمة مراجعة.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => workspaceQuery.refetch()}><RefreshCw className={`ml-2 h-4 w-4 ${workspaceQuery.isFetching ? "animate-spin" : ""}`} /> تحديث</Button>
                {canTransfer ? <Button onClick={openCreate} className="bg-white text-emerald-950 hover:bg-emerald-50"><Plus className="ml-2 h-4 w-4" /> تحويل جديد</Button> : null}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map(({ label, value, icon: Icon, filter }) => (
            <button key={label} onClick={() => setStatusFilter(filter)} className="rounded-2xl border bg-card p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{qty(value)}</p></div><div className="rounded-xl bg-muted p-2.5"><Icon className="h-5 w-5" /></div></div>
            </button>
          ))}
        </section>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div><CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5" /> سجل التحويلات</CardTitle><CardDescription>التحويلات مرتبطة بمصدر المخزون الحقيقي لكل فرع، وليس بمجرد اسم الفرع.</CardDescription></div>
              <div className="flex flex-wrap gap-2">
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">النشطة</SelectItem><SelectItem value="all">الكل</SelectItem><SelectItem value="pending">بانتظار الشحن</SelectItem><SelectItem value="in_transit">في الطريق</SelectItem><SelectItem value="completed">مكتملة</SelectItem><SelectItem value="variance">بها فرق</SelectItem><SelectItem value="cancelled">ملغاة</SelectItem></SelectContent></Select>
                <Select value={directionFilter} onValueChange={(v) => setDirectionFilter(v as typeof directionFilter)}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل الاتجاهات</SelectItem><SelectItem value="outgoing">صادر</SelectItem><SelectItem value="incoming">وارد</SelectItem></SelectContent></Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {workspaceQuery.isLoading ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div> : workspaceQuery.isError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-800"><AlertTriangle className="mx-auto mb-2 h-7 w-7" /><p>{workspaceQuery.error instanceof Error ? workspaceQuery.error.message : "تعذر تحميل التحويلات."}</p></div>
            ) : !transfers.length ? (
              <div className="rounded-xl border border-dashed p-10 text-center"><Truck className="mx-auto h-9 w-9 text-muted-foreground" /><p className="mt-3 font-medium">لا توجد تحويلات بهذه الفلاتر</p><p className="mt-1 text-sm text-muted-foreground">أنشئ تحويلًا جديدًا أو غيّر الفلاتر.</p></div>
            ) : (
              <div className="space-y-3">
                {transfers.map((transfer) => {
                  const outgoing = transfer.from_branch_id === currentBranchId;
                  const incoming = transfer.to_branch_id === currentBranchId;
                  const hasVariance = transfer.items.some((item) => Math.abs(Number(item.variance_quantity || 0)) > 0.0005);
                  return (
                    <div key={transfer.id} className="rounded-2xl border p-4">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {statusBadge(transfer.status, hasVariance)}
                            <Badge variant="outline">{outgoing ? "صادر" : incoming ? "وارد" : "مرتبط بمصدر المخزون"}</Badge>
                            <span className="font-mono text-xs text-muted-foreground">{transfer.transfer_number}</span>
                          </div>
                          <div className="mt-3 flex items-center gap-3">
                            <Warehouse className="h-5 w-5 text-muted-foreground" />
                            <p className="font-semibold">{transfer.from_branch_name} <span className="mx-2 text-muted-foreground">←</span> {transfer.to_branch_name}</p>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">أنشئ {dt(transfer.created_at)} · {transfer.created_by_name || "المستخدم"}{transfer.dispatched_at ? ` · شُحن ${dt(transfer.dispatched_at)}` : ""}{transfer.received_at ? ` · استُلم ${dt(transfer.received_at)}` : ""}</p>
                          {transfer.notes ? <p className="mt-2 rounded-lg bg-muted/40 p-2 text-sm">{transfer.notes}</p> : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {outgoing && transfer.status === "pending" && canTransfer ? <Button size="sm" onClick={() => openDispatch(transfer)}><Send className="ml-2 h-4 w-4" /> شحن</Button> : null}
                          {incoming && transfer.status === "in_transit" && canTransfer ? <Button size="sm" onClick={() => openReceive(transfer)}><CheckCircle2 className="ml-2 h-4 w-4" /> استلام</Button> : null}
                          {outgoing && transfer.status === "pending" && canTransfer ? <Button size="sm" variant="outline" onClick={() => { setCancelTransfer(transfer); setCancelReason(""); }}><X className="ml-2 h-4 w-4" /> إلغاء</Button> : null}
                        </div>
                      </div>

                      <div className="mt-4 overflow-hidden rounded-xl border">
                        {transfer.items.map((item, index) => (
                          <div key={item.id} className={`grid gap-2 p-3 text-sm sm:grid-cols-[1fr_auto_auto] ${index ? "border-t" : ""}`}>
                            <div><p className="font-medium">{item.product_name}</p><p className="mt-1 text-xs text-muted-foreground">{item.barcode || "بدون باركود"}</p></div>
                            <div className="sm:text-left"><span className="text-xs text-muted-foreground">المطلوب/المشحون</span><p className="font-semibold">{qty(item.dispatched_quantity ?? item.quantity)} {item.unit_of_measure}</p></div>
                            <div className="sm:min-w-32 sm:text-left"><span className="text-xs text-muted-foreground">المستلم</span><p className={`font-semibold ${Number(item.variance_quantity || 0) !== 0 ? "text-red-700" : ""}`}>{item.received_quantity == null ? "—" : `${qty(item.received_quantity)} ${item.unit_of_measure}`}{item.variance_quantity != null && Math.abs(item.variance_quantity) > 0.0005 ? ` (${item.variance_quantity > 0 ? "+" : ""}${qty(item.variance_quantity)})` : ""}</p></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => !open && setCreateOpen(false)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl" dir="rtl">
          <DialogHeader><DialogTitle>تحويل مخزون جديد</DialogTitle><DialogDescription>اختر فرعًا بمصدر مخزون مختلف، ثم أضف المنتجات والكميات المطلوبة.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2"><Label>فرع الوجهة</Label><Select value={targetBranchId} onValueChange={setTargetBranchId}><SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger><SelectContent>{(data?.target_branches || []).map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>موعد وصول متوقع</Label><Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>ملاحظات</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="سبب التحويل أو تعليمات التجهيز..." rows={2} /></div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-xl border p-3">
                <div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="بحث باسم المنتج أو الباركود أو الرف" className="pr-9" /></div>
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {productQuery.isFetching ? <div className="p-5 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : (productQuery.data || []).map((product) => {
                    const selected = cart.some((item) => item.product.product_id === product.product_id);
                    return <button key={product.product_id} disabled={selected} onClick={() => addProduct(product)} className="flex w-full items-center gap-3 rounded-lg border p-2 text-right transition hover:bg-muted/40 disabled:opacity-50">
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-muted">{product.image_url ? <img src={product.image_url} alt="" className="h-full w-full object-cover" /> : <Package className="h-4 w-4" />}</div>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{product.name}</p><p className="text-xs text-muted-foreground">متاح {qty(product.quantity)} {product.unit_of_measure}</p></div>
                      <Plus className="h-4 w-4" />
                    </button>;
                  })}
                </div>
              </div>
              <div className="space-y-2 rounded-xl border p-3">
                <p className="font-medium">أصناف التحويل ({cart.length})</p>
                {!cart.length ? <div className="p-8 text-center text-sm text-muted-foreground">لم تضف منتجات بعد.</div> : cart.map((item) => (
                  <div key={item.product.product_id} className="grid grid-cols-[1fr_110px_auto] items-center gap-2 rounded-lg bg-muted/35 p-2">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{item.product.name}</p><p className="text-xs text-muted-foreground">متاح {qty(item.product.quantity)}</p></div>
                    <Input type="number" min="0.001" max={item.product.quantity} step="0.001" value={item.quantity} onChange={(e) => updateCartQty(item.product.product_id, e.target.value)} />
                    <Button variant="ghost" size="sm" onClick={() => setCart((items) => items.filter((row) => row.product.product_id !== item.product.product_id))}><X className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start"><Button onClick={createTransfer} disabled={busy || !targetBranchId || !cart.length}>{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Truck className="ml-2 h-4 w-4" />} إنشاء التحويل</Button><Button variant="outline" disabled={busy} onClick={() => setCreateOpen(false)}>إلغاء</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(dispatchTransfer)} onOpenChange={(open) => !open && setDispatchTransfer(null)}>
        <DialogContent dir="rtl"><DialogHeader><DialogTitle>تأكيد شحن التحويل</DialogTitle><DialogDescription>{dispatchTransfer?.transfer_number} · إلى {dispatchTransfer?.to_branch_name}</DialogDescription></DialogHeader><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">عند التأكيد سيتم خصم الكميات المشحونة من مخزون المصدر فورًا وبشكل ذري. لو تغير الرصيد وأصبح غير كافٍ، العملية كلها ستتوقف بدون خصم جزئي.</div><DialogFooter className="gap-2 sm:justify-start"><Button onClick={confirmDispatch} disabled={busy}>{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Send className="ml-2 h-4 w-4" />} تأكيد الشحن</Button><Button variant="outline" onClick={() => setDispatchTransfer(null)} disabled={busy}>رجوع</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={Boolean(receiveTransfer)} onOpenChange={(open) => !open && setReceiveTransfer(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" dir="rtl">
          <DialogHeader><DialogTitle>استلام تحويل المخزون</DialogTitle><DialogDescription>{receiveTransfer?.transfer_number} · من {receiveTransfer?.from_branch_name}</DialogDescription></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">أدخل ما استلمته فعليًا. أي نقص عن المشحون سيُسجل كفرق ويولد مهمة مراجعة تلقائيًا؛ لن يتم تعديل الفرق مرة ثانية عند إغلاق مهمة المراجعة.</div>
            {(receiveTransfer?.items || []).map((item) => {
              const sent = Number(item.dispatched_quantity ?? item.quantity);
              const actual = Number(receivedQty[item.id] ?? sent);
              const variance = actual - sent;
              return <div key={item.id} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_140px_120px] sm:items-center"><div><p className="font-medium">{item.product_name}</p><p className="mt-1 text-xs text-muted-foreground">مشحون {qty(sent)} {item.unit_of_measure}</p></div><Input type="number" min="0" max={sent} step="0.001" value={receivedQty[item.id] ?? ""} onChange={(e) => setReceivedQty((state) => ({ ...state, [item.id]: e.target.value }))} /><Badge variant="outline" className={Math.abs(variance) > 0.0005 ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>{Math.abs(variance) > 0.0005 ? `فرق ${variance > 0 ? "+" : ""}${qty(variance)}` : "مطابق"}</Badge></div>;
            })}
            <div className="space-y-2"><Label>ملاحظة الاستلام</Label><Textarea value={receiveNote} onChange={(e) => setReceiveNote(e.target.value)} placeholder="حالة الشحنة أو سبب أي فرق ظاهر..." rows={3} /></div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start"><Button onClick={confirmReceive} disabled={busy}>{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="ml-2 h-4 w-4" />} تأكيد الاستلام</Button><Button variant="outline" onClick={() => setReceiveTransfer(null)} disabled={busy}>رجوع</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(cancelTransfer)} onOpenChange={(open) => !open && setCancelTransfer(null)}>
        <DialogContent dir="rtl"><DialogHeader><DialogTitle>إلغاء التحويل</DialogTitle><DialogDescription>{cancelTransfer?.transfer_number}</DialogDescription></DialogHeader><div className="space-y-2"><Label>سبب الإلغاء</Label><Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} placeholder="اكتب سبب الإلغاء..." /></div><DialogFooter className="gap-2 sm:justify-start"><Button variant="destructive" onClick={confirmCancel} disabled={busy}>{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <X className="ml-2 h-4 w-4" />} إلغاء التحويل</Button><Button variant="outline" onClick={() => setCancelTransfer(null)} disabled={busy}>رجوع</Button></DialogFooter></DialogContent>
      </Dialog>
    </MainLayout>
  );
}
