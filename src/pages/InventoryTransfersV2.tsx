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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const qty = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 3 });

const money = (value: number | null | undefined) =>
  `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

function dt(value?: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

function statusBadge(status: string) {
  if (status === "requested") return <Badge className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50">بانتظار التجهيز</Badge>;
  if (status === "dispatched") return <Badge className="border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-50">تم الشحن</Badge>;
  if (status === "received_with_variance") return <Badge className="border-red-200 bg-red-50 text-red-700 hover:bg-red-50">مستلم بفرق</Badge>;
  if (status === "received") return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">مستلم ومطابق</Badge>;
  if (status === "cancelled") return <Badge variant="outline" className="text-slate-500">ملغي</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

type CartItem = { product: InventoryTransferProductV2; quantity: string };
type StatusFilter = "active" | "requested" | "dispatched" | "received" | "variance" | "cancelled" | "all";

type DirectionFilter = "all" | "outgoing" | "incoming";

export default function InventoryTransfersV2() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [createRequestId, setCreateRequestId] = useState("");
  const [targetBranchId, setTargetBranchId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);

  const [dispatchTransfer, setDispatchTransfer] = useState<InventoryTransferV2 | null>(null);
  const [dispatchNote, setDispatchNote] = useState("");
  const [receiveTransfer, setReceiveTransfer] = useState<InventoryTransferV2 | null>(null);
  const [receivedQty, setReceivedQty] = useState<Record<string, string>>({});
  const [receiveNote, setReceiveNote] = useState("");
  const [cancelTransfer, setCancelTransfer] = useState<InventoryTransferV2 | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);

  const workspaceQuery = useQuery({
    queryKey: ["inventory-transfers-v2", currentBranchId, statusFilter],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchInventoryTransferWorkspaceV2(currentBranchId as string, statusFilter, 100),
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
      const direction = transfer.from_branch_id === currentBranchId ? "outgoing" : "incoming";
      return directionFilter === "all" || directionFilter === direction;
    });
  }, [data?.transfers, currentBranchId, directionFilter]);

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

    const invalid = cart.some((item) => {
      const value = Number(item.quantity);
      return !Number.isFinite(value) || value <= 0 || Math.round(value * 1000) !== value * 1000 || value > item.product.quantity;
    });
    if (invalid) return toast.error("راجع الكميات؛ يجب ألا تتجاوز الرصيد المتاح وبحد أقصى 3 منازل عشرية.");

    setBusy(true);
    try {
      const result = await createInventoryTransferV2({
        requestId: createRequestId,
        fromBranchId: currentBranchId,
        toBranchId: targetBranchId,
        items: cart.map((item) => ({ product_id: item.product.product_id, quantity: Number(item.quantity) })),
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
    setDispatchNote("");
  };

  const confirmDispatch = async () => {
    if (!dispatchTransfer || busy) return;
    setBusy(true);
    try {
      await dispatchInventoryTransferV2(dispatchTransfer.id, dispatchNote);
      toast.success(`تم شحن ${dispatchTransfer.transfer_number} وخصم الكميات ذريًا من مخزون المصدر.`);
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
    transfer.items.forEach((item) => { defaults[item.product_id] = String(item.quantity); });
    setReceivedQty(defaults);
    setReceiveNote("");
    setReceiveTransfer(transfer);
  };

  const confirmReceive = async () => {
    if (!receiveTransfer || busy) return;
    const invalid = receiveTransfer.items.some((item) => {
      const value = Number(receivedQty[item.product_id]);
      return !Number.isFinite(value) || value < 0 || Math.round(value * 1000) !== value * 1000;
    });
    if (invalid) return toast.error("راجع الكميات المستلمة؛ يجب أن تكون صفر أو أكثر وبحد أقصى 3 منازل عشرية.");

    const items = receiveTransfer.items.map((item) => ({
      product_id: item.product_id,
      quantity: Number(receivedQty[item.product_id]),
    }));
    const hasVariance = receiveTransfer.items.some((item) => Number(receivedQty[item.product_id]) !== Number(item.quantity));

    setBusy(true);
    try {
      const result = await receiveInventoryTransferV2(receiveTransfer.id, items, receiveNote);
      toast.success(result.has_variance || hasVariance
        ? "تم الاستلام وتسجيل الفرق، وأُنشئت مهمة مراجعة تلقائيًا."
        : "تم استلام التحويل ومطابقة كل الكميات.");
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
    if (cancelReason.trim().length < 3) return toast.error("اكتب سبب إلغاء واضحًا.");
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
    return (
      <MainLayout>
        <div className="p-6" dir="rtl">
          <Card><CardContent className="p-10 text-center">اختر فرعًا أولًا لعرض تحويلات المخزون.</CardContent></Card>
        </div>
      </MainLayout>
    );
  }

  const summaryCards = [
    { label: "بانتظار التجهيز", value: data?.summary.requested || 0, icon: Clock3, filter: "requested" as StatusFilter },
    { label: "تم شحنها", value: data?.summary.dispatched || 0, icon: Truck, filter: "dispatched" as StatusFilter },
    { label: "مستلمة", value: data?.summary.received || 0, icon: CheckCircle2, filter: "received" as StatusFilter },
    { label: "مستلمة بفرق", value: data?.summary.received_with_variance || 0, icon: AlertTriangle, filter: "variance" as StatusFilter },
  ];

  return (
    <MainLayout>
      <div className="space-y-5 p-4 md:p-6" dir="rtl">
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="bg-gradient-to-l from-slate-950 via-emerald-950 to-emerald-800 px-5 py-6 text-white md:px-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mb-2 flex flex-wrap gap-2">
                  <Badge className="border-white/20 bg-white/10 text-white hover:bg-white/10">Inventory Transfers V2</Badge>
                  <Badge className="border-white/20 bg-white/10 text-white hover:bg-white/10">{currentBranchName || "الفرع الحالي"}</Badge>
                </div>
                <h1 className="text-2xl font-bold md:text-3xl">تحويلات المخزون بين الفروع</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/90">
                  طلب → تجهيز وشحن → خصم ذري من المصدر → استلام فعلي → إضافة للوجهة. أي فرق في الاستلام يتحول تلقائيًا لمهمة مراجعة ولا يُخفى داخل تعديل صامت.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => workspaceQuery.refetch()}>
                  <RefreshCw className={`ml-2 h-4 w-4 ${workspaceQuery.isFetching ? "animate-spin" : ""}`} /> تحديث
                </Button>
                {canTransfer ? (
                  <Button onClick={openCreate} className="bg-white text-emerald-950 hover:bg-emerald-50">
                    <Plus className="ml-2 h-4 w-4" /> تحويل جديد
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {data?.data_quality.shared_inventory_targets_excluded ? (
          <Alert>
            <Warehouse className="h-4 w-4" />
            <AlertDescription>الفروع التي تشترك في نفس مصدر المخزون مستبعدة تلقائيًا من الوجهات؛ لأنها تستخدم نفس الرصيد ولا تحتاج حركة تحويل فعلية.</AlertDescription>
          </Alert>
        ) : null}

        {workspaceQuery.isError ? (
          <Alert variant="destructive"><AlertDescription>{workspaceQuery.error instanceof Error ? workspaceQuery.error.message : "تعذر تحميل تحويلات المخزون."}</AlertDescription></Alert>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map(({ label, value, icon: Icon, filter }) => (
            <button
              key={label}
              onClick={() => setStatusFilter(filter)}
              className="rounded-2xl border bg-card p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>
                <div className="rounded-2xl bg-primary/10 p-3 text-primary"><Icon className="h-5 w-5" /></div>
              </div>
            </button>
          ))}
        </section>

        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {([
                  ["active", "نشطة"], ["requested", "بانتظار التجهيز"], ["dispatched", "تم الشحن"],
                  ["received", "مستلمة"], ["variance", "بفرق"], ["cancelled", "ملغاة"], ["all", "الكل"],
                ] as Array<[StatusFilter, string]>).map(([value, label]) => (
                  <Button key={value} size="sm" variant={statusFilter === value ? "default" : "outline"} onClick={() => setStatusFilter(value)}>{label}</Button>
                ))}
              </div>
              <Select value={directionFilter} onValueChange={(value) => setDirectionFilter(value as DirectionFilter)}>
                <SelectTrigger className="w-full lg:w-[190px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">صادر ووارد</SelectItem>
                  <SelectItem value="outgoing">صادر من الفرع</SelectItem>
                  <SelectItem value="incoming">وارد إلى الفرع</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <section className="space-y-3">
          {workspaceQuery.isLoading ? (
            <div className="flex min-h-52 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
          ) : transfers.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">لا توجد تحويلات مطابقة للفلاتر الحالية.</CardContent></Card>
          ) : transfers.map((transfer) => (
            <Card key={transfer.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-lg">{transfer.transfer_number}</CardTitle>
                      {statusBadge(transfer.status)}
                      <Badge variant="outline">{transfer.direction === "outgoing" ? "صادر" : "وارد"}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {transfer.from_branch_name} ← {transfer.to_branch_name} · {transfer.items_count} صنف · {qty(transfer.total_measure)} وحدة قياس
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">طلب {dt(transfer.requested_at || transfer.created_at)} · قيمة تكلفة تقريبية {money(transfer.total_cost_value)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {transfer.can_dispatch ? <Button size="sm" onClick={() => openDispatch(transfer)}><Send className="ml-2 h-4 w-4" /> تجهيز وشحن</Button> : null}
                    {transfer.can_receive ? <Button size="sm" onClick={() => openReceive(transfer)}><ArrowDownLeft className="ml-2 h-4 w-4" /> استلام فعلي</Button> : null}
                    {transfer.can_cancel ? <Button size="sm" variant="outline" onClick={() => { setCancelTransfer(transfer); setCancelReason(""); }}><X className="ml-2 h-4 w-4" /> إلغاء</Button> : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-muted/60 text-muted-foreground"><tr><th className="px-3 py-2 text-right">المنتج</th><th className="px-3 py-2 text-left">المطلوب</th><th className="px-3 py-2 text-left">المستلم</th><th className="px-3 py-2 text-left">الفرق</th><th className="px-3 py-2 text-left">رصيد المصدر عند الطلب</th></tr></thead>
                    <tbody>{transfer.items.map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="px-3 py-3"><p className="font-semibold">{item.product_name}</p><p className="text-xs text-muted-foreground">{item.barcode || "بدون باركود"} · {item.unit}</p></td>
                        <td className="px-3 py-3 text-left font-semibold">{qty(item.quantity)}</td>
                        <td className="px-3 py-3 text-left">{item.received_quantity == null ? "—" : qty(item.received_quantity)}</td>
                        <td className={`px-3 py-3 text-left font-semibold ${Math.abs(Number(item.variance_quantity || 0)) > 0.0005 ? "text-red-600" : ""}`}>{item.variance_quantity == null ? "—" : qty(item.variance_quantity)}</td>
                        <td className="px-3 py-3 text-left">{item.source_quantity_snapshot == null ? "—" : qty(item.source_quantity_snapshot)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>

                <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                  <span>الشحن: {dt(transfer.dispatched_at)}{transfer.dispatched_by_name ? ` · ${transfer.dispatched_by_name}` : ""}</span>
                  <span>الاستلام: {dt(transfer.received_at)}{transfer.received_by_name ? ` · ${transfer.received_by_name}` : ""}</span>
                  <span>الوصول المتوقع: {transfer.expected_arrival_date || "—"}</span>
                </div>
                {transfer.notes ? <p className="rounded-xl bg-muted/50 p-3 text-sm">{transfer.notes}</p> : null}
                {transfer.cancel_reason ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">سبب الإلغاء: {transfer.cancel_reason}</p> : null}
              </CardContent>
            </Card>
          ))}
        </section>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto" dir="rtl">
            <DialogHeader><DialogTitle>إنشاء تحويل مخزون</DialogTitle><DialogDescription>اختَر فرعًا بمصدر مخزون مستقل، ثم المنتجات والكميات المطلوب تجهيزها.</DialogDescription></DialogHeader>
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="space-y-2"><Label>فرع الوجهة</Label><Select value={targetBranchId} onValueChange={setTargetBranchId}><SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger><SelectContent>{(data?.target_branches || []).map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>الوصول المتوقع</Label><Input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} /></div>
                <div className="space-y-2"><Label>ملاحظات</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="سبب التحويل أو تعليمات التجهيز" /></div>
                <div className="space-y-2">
                  <Label>بحث المنتجات</Label>
                  <div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pr-9" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="اسم، باركود أو رف" /></div>
                  <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border p-2">
                    {productQuery.isFetching ? <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : (productQuery.data || []).map((product) => (
                      <button key={product.product_id} onClick={() => addProduct(product)} className="flex w-full items-center justify-between rounded-lg border p-3 text-right hover:bg-muted/50">
                        <div><p className="font-semibold">{product.name}</p><p className="text-xs text-muted-foreground">{product.barcode || "بدون باركود"} · متاح {qty(product.quantity)} {product.unit_of_measure}</p></div><Plus className="h-4 w-4 text-primary" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <Label>المنتجات المختارة ({cart.length})</Label>
                {cart.length === 0 ? <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">لم تضف منتجات بعد.</div> : cart.map((item) => (
                  <div key={item.product.product_id} className="rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.product.name}</p><p className="text-xs text-muted-foreground">متاح {qty(item.product.quantity)} {item.product.unit_of_measure}</p></div><Button size="icon" variant="ghost" onClick={() => setCart((rows) => rows.filter((row) => row.product.product_id !== item.product.product_id))}><X className="h-4 w-4" /></Button></div>
                    <div className="mt-3"><Label>الكمية</Label><Input type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => updateCartQty(item.product.product_id, event.target.value)} /></div>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button><Button disabled={busy} onClick={createTransfer}>{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Plus className="ml-2 h-4 w-4" />}إنشاء التحويل</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(dispatchTransfer)} onOpenChange={(open) => !open && setDispatchTransfer(null)}>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>تأكيد تجهيز وشحن التحويل</DialogTitle><DialogDescription>عند التأكيد سيتم خصم الكميات ذريًا من مخزون المصدر وإنشاء مهمة استلام لفرع الوجهة.</DialogDescription></DialogHeader>
            <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mb-2 h-5 w-5" />سيتم التحقق من الرصيد مرة أخرى لحظة الشحن. لو تغير الرصيد ولم يعد كافيًا ستتوقف العملية بالكامل.</div>
            <div className="space-y-2"><Label>ملاحظة الشحن</Label><Textarea value={dispatchNote} onChange={(event) => setDispatchNote(event.target.value)} placeholder="اختياري" /></div>
            <DialogFooter><Button variant="outline" onClick={() => setDispatchTransfer(null)}>رجوع</Button><Button disabled={busy} onClick={confirmDispatch}>{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Send className="ml-2 h-4 w-4" />}تأكيد الشحن</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(receiveTransfer)} onOpenChange={(open) => !open && setReceiveTransfer(null)}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" dir="rtl">
            <DialogHeader><DialogTitle>الاستلام الفعلي للتحويل</DialogTitle><DialogDescription>اكتب ما وصل فعليًا. أي اختلاف عن الكمية المشحونة سيتحول تلقائيًا إلى مهمة مراجعة.</DialogDescription></DialogHeader>
            <div className="space-y-2">{receiveTransfer?.items.map((item) => {
              const actual = Number(receivedQty[item.product_id] || 0);
              const variance = actual - Number(item.quantity);
              return (
                <div key={item.id} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-3"><div><p className="font-semibold">{item.product_name}</p><p className="text-xs text-muted-foreground">مشحون {qty(item.quantity)} {item.unit}</p></div><Badge variant={Math.abs(variance) > 0.0005 ? "destructive" : "outline"}>فرق {qty(variance)}</Badge></div>
                  <Input className="mt-3" type="number" min="0" step="0.001" value={receivedQty[item.product_id] ?? ""} onChange={(event) => setReceivedQty((values) => ({ ...values, [item.product_id]: event.target.value }))} />
                </div>
              );
            })}</div>
            <div className="space-y-2"><Label>ملاحظة الاستلام</Label><Textarea value={receiveNote} onChange={(event) => setReceiveNote(event.target.value)} placeholder="سبب أي فرق أو ملاحظة على الشحنة" /></div>
            <DialogFooter><Button variant="outline" onClick={() => setReceiveTransfer(null)}>رجوع</Button><Button disabled={busy} onClick={confirmReceive}>{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Package className="ml-2 h-4 w-4" />}تأكيد الاستلام</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(cancelTransfer)} onOpenChange={(open) => !open && setCancelTransfer(null)}>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>إلغاء التحويل</DialogTitle><DialogDescription>الإلغاء متاح قبل الشحن فقط، ولا ينتج عنه أي حركة مخزون.</DialogDescription></DialogHeader>
            <div className="space-y-2"><Label>سبب الإلغاء</Label><Textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="اكتب سببًا واضحًا" /></div>
            <DialogFooter><Button variant="outline" onClick={() => setCancelTransfer(null)}>رجوع</Button><Button variant="destructive" disabled={busy} onClick={confirmCancel}>{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <X className="ml-2 h-4 w-4" />}تأكيد الإلغاء</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
