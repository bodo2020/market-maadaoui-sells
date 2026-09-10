import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Gift, PackageCheck, RefreshCw, ScanLine, Ticket, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import BarcodeScanner from "@/components/POS/BarcodeScanner";
import InvoiceDialog from "@/components/POS/InvoiceDialog";
import PaymentMethodBrand from "@/components/payments/PaymentMethodBrand";
import type { CartItem, Sale } from "@/types";
import { siteConfig } from "@/config/site";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { useToast } from "@/hooks/use-toast";
import { preflightPosCart } from "@/services/supabase/posPreflightService";
import { clearConfirmedModernPosSale, submitModernPosSale } from "@/services/supabase/posCheckoutV2Service";
import { calculatePOSPaymentFee, fetchPOSPaymentMethods, type POSPaymentMethod } from "@/services/supabase/posPaymentMethodService";
import {
  isCustomerLoyaltyBarcode,
  isLoyaltyVoucherBarcode,
  lookupPOSLoyaltyCustomer,
  lookupPOSLoyaltyVoucher,
  type POSLoyaltyCustomer,
  type POSLoyaltyVoucher,
} from "@/services/supabase/loyaltyService";
import {
  posLoyaltyContextKey,
  posVoucherContextKey,
  readPOSLoyaltyCustomer,
  readPOSLoyaltyVoucher,
} from "@/components/POS/POSCustomerLoyaltyBridge";

type ScanTarget = "customer" | "voucher" | null;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checkoutId: string;
  items: CartItem[];
  total: number;
  onRepriced: (items: CartItem[]) => void;
  onSaleCommitted?: (sale: Sale) => void;
  onStartNewSale: () => void;
};

function money(value: number) {
  return `${Number(value || 0).toFixed(2)} ${siteConfig.currency}`;
}

export default function POSCheckoutModernDialog({ open, onOpenChange, checkoutId, items, total, onRepriced, onSaleCommitted, onStartNewSale }: Props) {
  const { user } = useAuth();
  const { currentBranchId } = useBranchStore();
  const { toast } = useToast();
  const [customer, setCustomer] = useState<POSLoyaltyCustomer | null>(null);
  const [voucher, setVoucher] = useState<POSLoyaltyVoucher | null>(null);
  const [methods, setMethods] = useState<POSPaymentMethod[]>([]);
  const [methodId, setMethodId] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [cashTendered, setCashTendered] = useState("");
  const [scanTarget, setScanTarget] = useState<ScanTarget>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [loadingMethods, setLoadingMethods] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sale, setSale] = useState<Sale | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const scanTargetRef = useRef<ScanTarget>(null);

  const activeMethods = useMemo(() => methods.filter(row => row.active).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ar")), [methods]);
  const selectedMethod = useMemo(() => activeMethods.find(row => row.id === methodId) || null, [activeMethods, methodId]);
  const voucherAmount = voucher ? Math.max(0, Math.min(Number(voucher.remaining_value_egp || 0), Number(total || 0))) : 0;
  const baseDue = Math.max(0, Number((Number(total || 0) - voucherAmount).toFixed(2)));
  const paymentPreview = useMemo(() => calculatePOSPaymentFee(selectedMethod, baseDue), [selectedMethod, baseDue]);
  const amountToCollect = paymentPreview.amountCharged;
  const isCash = selectedMethod?.method_type === "cash";
  const change = isCash ? Math.max(0, Number(cashTendered || 0) - amountToCollect) : 0;
  const expectedPoints = customer ? Math.floor(baseDue) : 0;

  const syncContexts = useCallback(() => {
    if (!currentBranchId) return;
    setCustomer(readPOSLoyaltyCustomer(currentBranchId, checkoutId));
    setVoucher(readPOSLoyaltyVoucher(currentBranchId, checkoutId));
  }, [currentBranchId, checkoutId]);

  const notifyContextChanged = () => window.dispatchEvent(new CustomEvent("pos:loyalty-voucher-changed"));

  const storeCustomer = useCallback((next: POSLoyaltyCustomer | null) => {
    if (!currentBranchId) return;
    try {
      if (next) localStorage.setItem(posLoyaltyContextKey(currentBranchId, checkoutId), JSON.stringify(next));
      else localStorage.removeItem(posLoyaltyContextKey(currentBranchId, checkoutId));
      localStorage.removeItem(posVoucherContextKey(currentBranchId, checkoutId));
    } catch { /* server payload remains authoritative */ }
    setCustomer(next);
    setVoucher(null);
    notifyContextChanged();
  }, [currentBranchId, checkoutId]);

  const storeVoucher = useCallback((next: POSLoyaltyVoucher | null) => {
    if (!currentBranchId) return;
    try {
      if (next) localStorage.setItem(posVoucherContextKey(currentBranchId, checkoutId), JSON.stringify(next));
      else localStorage.removeItem(posVoucherContextKey(currentBranchId, checkoutId));
    } catch { /* noop */ }
    setVoucher(next);
    notifyContextChanged();
  }, [currentBranchId, checkoutId]);

  const loadMethods = useCallback(async () => {
    if (!currentBranchId) return;
    setLoadingMethods(true);
    try {
      const rows = await fetchPOSPaymentMethods(currentBranchId);
      const active = rows.filter(row => row.active);
      setMethods(rows);
      const cash = active.find(row => row.method_type === "cash");
      const fallback = cash || active[0];
      setMethodId(current => active.some(row => row.id === current) ? current : fallback?.id || "");
    } catch (err: any) {
      setError(err?.message || "تعذر تحميل وسائل الدفع.");
    } finally {
      setLoadingMethods(false);
    }
  }, [currentBranchId]);

  useEffect(() => {
    if (!open) return;
    setSale(null);
    setError(null);
    setPaymentReference("");
    setScanTarget(null);
    syncContexts();
    void loadMethods();
  }, [open, syncContexts, loadMethods]);

  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new CustomEvent("pos:modern-checkout-state", { detail: { open: true } }));
    return () => { window.dispatchEvent(new CustomEvent("pos:modern-checkout-state", { detail: { open: false } })); };
  }, [open]);

  useEffect(() => {
    if (!open || !selectedMethod) return;
    if (selectedMethod.method_type === "cash") setCashTendered(paymentPreview.amountCharged.toFixed(2));
  }, [open, selectedMethod?.id, paymentPreview.amountCharged]);

  const handleBarcode = useCallback(async (raw: string) => {
    const barcode = raw.trim();
    const target = scanTargetRef.current;
    if (!currentBranchId || !barcode || !target) return;
    setError(null);
    try {
      if (target === "customer") {
        if (!isCustomerLoyaltyBarcode(barcode)) throw new Error("ده مش باركود عميل. امسح بطاقة العميل اللي تبدأ بـ 299.");
        const linked = await lookupPOSLoyaltyCustomer(barcode, currentBranchId);
        if (!linked) throw new Error("باركود العميل غير معروف.");
        storeCustomer(linked);
        toast({ title: `تم ربط ${linked.name || "العميل"}`, description: `${Number(linked.points_balance || 0).toLocaleString("ar-EG")} نقطة متاحة` });
      } else {
        if (!customer) throw new Error("امسح بطاقة العميل الأول قبل كوبون الخصم.");
        if (!isLoyaltyVoucherBarcode(barcode)) throw new Error("ده مش باركود كوبون خصم. امسح كوبون الخصم اللي يبدأ بـ 298.");
        const linked = await lookupPOSLoyaltyVoucher(barcode, currentBranchId, customer.customer_id);
        if (!linked) throw new Error("كوبون الخصم غير موجود أو غير متاح.");
        storeVoucher(linked);
        toast({ title: "تم إضافة كوبون الخصم", description: `${linked.voucher_code} · رصيد ${Number(linked.remaining_value_egp || 0).toFixed(2)} ج.م` });
      }
      setScanTarget(null);
      scanTargetRef.current = null;
    } catch (err: any) {
      setError(err?.message || "تعذر قراءة الباركود.");
    }
  }, [currentBranchId, customer, storeCustomer, storeVoucher, toast]);

  const beginScan = (target: Exclude<ScanTarget, null>, camera = false) => {
    scanTargetRef.current = target;
    setScanTarget(target);
    if (camera) setCameraOpen(true);
  };

  useEffect(() => {
    if (!open || !scanTarget) return;
    document.documentElement.dataset.posCheckoutScanTarget = scanTarget;
    let buffer = "";
    let lastKeyAt = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        scanTargetRef.current = null;
        setScanTarget(null);
        return;
      }
      if (event.key === "Enter") {
        const code = buffer.trim();
        buffer = "";
        if (code) {
          event.preventDefault();
          event.stopImmediatePropagation();
          void handleBarcode(code);
        }
        return;
      }
      if (/^[0-9]$/.test(event.key)) {
        const now = Date.now();
        if (now - lastKeyAt > 140) buffer = "";
        buffer += event.key;
        lastKeyAt = now;
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      delete document.documentElement.dataset.posCheckoutScanTarget;
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, scanTarget, handleBarcode]);

  const paymentValid = useMemo(() => {
    if (!selectedMethod) return false;
    if (selectedMethod.require_reference && !paymentReference.trim()) return false;
    if (amountToCollect <= 0) return true;
    if (selectedMethod.method_type === "cash") return Number(cashTendered || 0) >= amountToCollect;
    return true;
  }, [selectedMethod, paymentReference, cashTendered, amountToCollect]);

  const completeSale = async () => {
    if (!currentBranchId || !user?.id || !selectedMethod || !paymentValid || processing || !items.length) return;
    setProcessing(true);
    setError(null);
    try {
      const checked = await preflightPosCart(currentBranchId, items);
      if (checked.repriced || Math.abs(Number(checked.total) - Number(total)) > 0.009) {
        onRepriced(checked.items);
        setError("تم تحديث سعر أو عرض في السلة. راجع الإجمالي وكوبون الخصم ثم أكد البيع مرة أخرى.");
        return;
      }
      const profit = checked.items.reduce((sum, item) => {
        const qty = item.weight ?? item.quantity;
        return sum + Number(item.total || 0) - Number(item.product.purchase_price || 0) * Number(qty || 0);
      }, 0);
      const payload = {
        date: new Date().toISOString(),
        items: checked.items,
        subtotal: checked.subtotal,
        discount: checked.discount,
        total: checked.total,
        profit,
        payment_method: selectedMethod.method_type === "cash" ? "cash" : "card",
        cash_amount: 0,
        card_amount: 0,
        customer_name: customer?.name || undefined,
        customer_phone: customer?.phone || undefined,
        invoice_number: "PENDING",
        cashier_name: user.name,
        branch_id: currentBranchId,
      } as Omit<Sale, "id" | "created_at" | "updated_at">;
      const confirmed = await submitModernPosSale(payload, checkoutId, {
        paymentMethodId: selectedMethod.id,
        paymentReference: paymentReference.trim() || null,
      });
      setSale(confirmed as Sale);
      setCustomer(null);
      setVoucher(null);
      onSaleCommitted?.(confirmed as Sale);
      toast({ title: "تم البيع بنجاح", description: `فاتورة ${(confirmed as Sale).invoice_number}` });
    } catch (err: any) {
      setError(err?.message || "تعذر إتمام البيع.");
      toast({ title: "تعذر إتمام البيع", description: err?.message || "راجع البيانات وحاول مرة أخرى.", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const startNewSale = () => {
    if (user?.id && currentBranchId) clearConfirmedModernPosSale(user.id, currentBranchId, checkoutId);
    setSale(null);
    setCustomer(null);
    setVoucher(null);
    setPaymentReference("");
    onStartNewSale();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={next => { if (!processing) onOpenChange(next); }}>
        <DialogContent dir="rtl" className="max-h-[94vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{sale ? "تمت عملية البيع" : "إتمام البيع"}</DialogTitle>
          </DialogHeader>

          {sale ? (
            <div className="space-y-5 py-2">
              <div className="rounded-3xl bg-emerald-50 p-6 text-center text-emerald-950">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white"><Check className="h-7 w-7 text-[#005931]" /></div>
                <div className="text-xl font-black">تم تسجيل الفاتورة</div>
                <div className="mt-1 text-sm">{sale.invoice_number}</div>
                <div className="mt-3 text-2xl font-black">{money(Number((sale as any).amount_charged ?? sale.amount_due ?? sale.total))}</div>
                <div className="mt-1 text-xs text-emerald-800">{(sale as any).payment_method_name || selectedMethod?.name || "وسيلة الدفع"}</div>
                {Number(sale.loyalty_points_earned || 0) > 0 && <div className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-sm font-bold">+ {Number(sale.loyalty_points_earned || 0).toLocaleString("ar-EG")} نقطة للعميل</div>}
              </div>
              <Button variant="outline" className="h-12 w-full" onClick={() => setInvoiceOpen(true)}><PackageCheck className="ml-2 h-4 w-4" />عرض وطباعة الفاتورة</Button>
              <Button className="h-12 w-full bg-[#005931]" onClick={startNewSale}>عملية بيع جديدة</Button>
            </div>
          ) : (
            <div className="space-y-5">
              {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

              <section className="rounded-3xl border p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div><div className="text-xs font-bold text-[#005931]">1 · العميل والولاء</div><div className="font-black">هل الفاتورة مرتبطة بعميل؟</div></div>
                  <Gift className="h-5 w-5 text-[#005931]" />
                </div>
                {customer ? (
                  <div className="rounded-2xl bg-emerald-50 p-4">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1"><div className="font-black">{customer.name || "عميل المعداوي"}</div><div className="mt-1 text-xs text-muted-foreground">{customer.membership_number || customer.phone || "عميل مرتبط"}</div></div>
                      <Button variant="ghost" size="icon" onClick={() => storeCustomer(null)} aria-label="إزالة العميل"><X className="h-4 w-4" /></Button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-center"><div className="rounded-xl bg-white p-2"><div className="text-[10px] text-muted-foreground">الرصيد</div><div className="font-black text-[#005931]">{Number(customer.points_balance || 0).toLocaleString("ar-EG")} نقطة</div></div><div className="rounded-xl bg-white p-2"><div className="text-[10px] text-muted-foreground">متوقع من الفاتورة</div><div className="font-black text-[#005931]">+ {expectedPoints.toLocaleString("ar-EG")} نقطة</div></div></div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">البيع بدون عميل مسموح، لكن <strong>لن تُضاف أي نقاط ولاء</strong> ولن يمكن استخدام كوبون خصم.</div>
                    <div className="grid grid-cols-2 gap-2"><Button variant={scanTarget === "customer" ? "default" : "outline"} className={scanTarget === "customer" ? "bg-[#005931]" : ""} onClick={() => beginScan("customer")}><ScanLine className="ml-2 h-4 w-4" />{scanTarget === "customer" ? "في انتظار الباركود..." : "اسكان بطاقة العميل"}</Button><Button variant="outline" onClick={() => beginScan("customer", true)}>كاميرا</Button></div>
                    {scanTarget === "customer" && <div className="text-center text-xs font-semibold text-[#005931]">القارئ مخصص الآن لباركود العميل 299… فقط</div>}
                  </div>
                )}
              </section>

              <section className={`rounded-3xl border p-4 ${!customer ? "opacity-55" : ""}`}>
                <div className="mb-3 flex items-center justify-between gap-3"><div><div className="text-xs font-bold text-[#005931]">2 · كوبون الخصم</div><div className="font-black">اسكان منفصل بعد العميل</div></div><Ticket className="h-5 w-5 text-[#005931]" /></div>
                {!customer ? <div className="text-sm text-muted-foreground">اربط العميل أولًا لتفعيل كوبون الخصم.</div> : voucher ? (
                  <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4"><Ticket className="h-5 w-5 text-[#005931]" /><div className="min-w-0 flex-1"><div className="font-black">{voucher.voucher_code}</div><div className="text-xs text-emerald-800">خصم حتى {money(voucherAmount)} · الرصيد {money(Number(voucher.remaining_value_egp || 0))}</div></div><Button variant="ghost" size="icon" onClick={() => storeVoucher(null)}><X className="h-4 w-4" /></Button></div>
                ) : (
                  <div className="space-y-3"><div className="grid grid-cols-2 gap-2"><Button variant={scanTarget === "voucher" ? "default" : "outline"} className={scanTarget === "voucher" ? "bg-[#005931]" : ""} onClick={() => beginScan("voucher")}><ScanLine className="ml-2 h-4 w-4" />{scanTarget === "voucher" ? "في انتظار الكوبون..." : "اسكان كوبون الخصم"}</Button><Button variant="outline" onClick={() => beginScan("voucher", true)}>كاميرا</Button></div>{scanTarget === "voucher" && <div className="text-center text-xs font-semibold text-[#005931]">القارئ مخصص الآن لكوبون الخصم 298… فقط</div>}</div>
                )}
              </section>

              <section className="rounded-3xl border p-4">
                <div className="mb-3"><div className="text-xs font-bold text-[#005931]">3 · وسيلة الدفع</div><div className="font-black">اختر طريقة التحصيل</div></div>
                {loadingMethods ? <div className="flex justify-center py-5"><RefreshCw className="h-5 w-5 animate-spin text-[#005931]" /></div> : activeMethods.length === 0 ? <Alert variant="destructive"><AlertDescription>لا توجد وسيلة دفع مفعلة للفرع. فعّل واحدة من صفحة وسائل الدفع.</AlertDescription></Alert> : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{activeMethods.map(method => { const active = method.id === methodId; return <button key={method.id} type="button" onClick={() => { setMethodId(method.id); setPaymentReference(""); }} className={`flex min-h-[104px] flex-col items-center justify-center rounded-2xl border p-3 text-center transition ${active ? "border-[#005931] bg-emerald-50 text-[#005931] ring-1 ring-[#005931]/20" : "bg-white hover:bg-slate-50"}`}><PaymentMethodBrand method={method} compact className="border-0 shadow-none" /><div className="mt-2 text-sm font-black">{method.name}</div>{method.fee_type !== "none" && method.fee_value > 0 && <div className="mt-1 text-[10px]">رسوم {method.fee_type === "percent" ? `${method.fee_value}%` : money(method.fee_value)}</div>}</button>; })}</div>
                )}
                {selectedMethod?.require_reference && <div className="mt-3 space-y-2"><Label>الرقم المرجعي للعملية</Label><Input value={paymentReference} onChange={e => setPaymentReference(e.target.value)} placeholder="رقم العملية / الإيصال" dir="ltr" /></div>}
                {selectedMethod && paymentPreview.fee > 0 && <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-950"><div className="flex justify-between"><span>رسوم {selectedMethod.name}</span><strong>{money(paymentPreview.fee)}</strong></div><div className="mt-1 text-xs">{selectedMethod.fee_bearer === "customer" ? "تُضاف على المبلغ المطلوب من العميل." : "تتحملها المنشأة وتُخصم من صافي الربح."}</div></div>}
                {selectedMethod?.method_type === "cash" && amountToCollect > 0 && <div className="mt-3 space-y-2"><Label>المبلغ المستلم</Label><Input inputMode="decimal" value={cashTendered} onChange={e => setCashTendered(e.target.value)} className="h-12 text-xl font-black" /><div className="rounded-2xl bg-emerald-50 p-3 text-center"><div className="text-xs text-emerald-800">الباقي للعميل</div><div className="text-2xl font-black text-[#005931]">{money(change)}</div></div></div>}
              </section>

              <div className="rounded-3xl bg-slate-50 p-4">
                <div className="flex items-center justify-between text-sm"><span>إجمالي المنتجات</span><strong>{money(total)}</strong></div>
                {voucherAmount > 0 && <div className="mt-2 flex items-center justify-between text-sm text-emerald-700"><span>كوبون خصم</span><strong>- {money(voucherAmount)}</strong></div>}
                {paymentPreview.customerFee > 0 && <div className="mt-2 flex items-center justify-between text-sm text-amber-700"><span>رسوم وسيلة الدفع</span><strong>+ {money(paymentPreview.customerFee)}</strong></div>}
                <div className="mt-3 flex items-center justify-between border-t pt-3"><span className="font-black">المطلوب تحصيله</span><strong className="text-2xl text-[#005931]">{money(amountToCollect)}</strong></div>
                <div className="mt-2 flex flex-wrap gap-2"><Badge variant={customer ? "default" : "secondary"} className={customer ? "bg-[#005931]" : ""}>{customer ? `عميل مرتبط · +${expectedPoints} نقطة متوقعة` : "بدون عميل · 0 نقطة"}</Badge>{voucher && <Badge variant="outline">كوبون خصم مطبق</Badge>}</div>
              </div>

              <Button className="h-14 w-full bg-[#005931] text-base hover:bg-[#004a29]" disabled={!paymentValid || processing || !activeMethods.length} onClick={() => void completeSale()}>{processing ? <RefreshCw className="ml-2 h-5 w-5 animate-spin" /> : <Check className="ml-2 h-5 w-5" />}{processing ? "جاري تسجيل البيع..." : `تأكيد البيع · ${money(amountToCollect)}`}</Button>
              <div className="text-center text-[11px] text-muted-foreground">العميل اختياري · كوبون الخصم لا يعمل بدون عميل · الرسوم يعيد السيرفر حسابها وقت الحفظ</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <BarcodeScanner isOpen={cameraOpen} onClose={() => setCameraOpen(false)} onScan={barcode => { setCameraOpen(false); void handleBarcode(barcode); }} />
      <InvoiceDialog isOpen={invoiceOpen} onClose={() => setInvoiceOpen(false)} sale={sale} />
    </>
  );
}
