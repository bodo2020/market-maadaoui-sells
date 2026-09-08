import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, Eye, FileText, RefreshCw, ReceiptText, RotateCcw, Search, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { useToast } from "@/hooks/use-toast";
import InvoiceDialog from "@/components/POS/InvoiceDialog";
import PosPrinterRuntime from "@/components/POS/PosPrinterRuntime";
import PosQuickReturnDialog from "@/components/POS/PosQuickReturnDialog";
import PosPendingCardRefunds from "@/components/POS/PosPendingCardRefunds";
import { currentStaffHasPermission } from "@/services/supabase/staffAuthService";
import {
  getPosInvoiceSale,
  listPosInvoicesV2,
  type PosInvoiceListItem,
} from "@/services/supabase/posInvoiceService";
import type { Sale } from "@/types";

function money(value: number) {
  return `${Number(value || 0).toFixed(2)} ج.م`;
}

function paymentLabel(invoice: PosInvoiceListItem) {
  if (invoice.payment_method_name) return invoice.payment_method_name;
  if (invoice.payment_method_type === "digital_wallet") return "محفظة رقمية";
  if (invoice.payment_method_type === "card" || invoice.payment_method === "card") return "بطاقة بنكية";
  if (invoice.payment_method === "mixed") return "دفع مختلط";
  return "نقدي";
}

function returnLabel(invoice: PosInvoiceListItem) {
  if (invoice.returned_amount <= 0) return null;
  if (invoice.returned_amount + 0.005 >= invoice.total) return "مرتجع بالكامل";
  return `مرتجع ${money(invoice.returned_amount)}`;
}

export default function PosRecentSales() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { currentBranchId } = useBranchStore();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [invoices, setInvoices] = useState<PosInvoiceListItem[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [returnSale, setReturnSale] = useState<Sale | null>(null);
  const [detailLoadingSaleId, setDetailLoadingSaleId] = useState<string | null>(null);

  const canRefund = useMemo(
    () => user?.role === "super_admin" || currentStaffHasPermission("sales.refund"),
    [user?.role, currentBranchId],
  );

  const load = useCallback(async (query = "") => {
    if (!user?.id || !currentBranchId) return;
    setLoading(true);
    try {
      setInvoices(await listPosInvoicesV2(currentBranchId, query, 30));
    } catch (error: any) {
      setInvoices([]);
      toast({
        title: "تعذر تحميل الفواتير",
        description: error?.message || "راجع الاتصال وصلاحية الفرع الحالي.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id, currentBranchId, toast]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void load(search), 250);
    return () => window.clearTimeout(timer);
  }, [open, search, load]);

  useEffect(() => {
    const onSaleCompleted = () => {
      if (open) void load(search);
    };
    window.addEventListener("pos:sale-completed", onSaleCompleted);
    return () => window.removeEventListener("pos:sale-completed", onSaleCompleted);
  }, [open, search, load]);

  const openSnapshot = async (invoice: PosInvoiceListItem, mode: "view" | "return") => {
    setDetailLoadingSaleId(invoice.sale_id);
    try {
      const sale = await getPosInvoiceSale(invoice.sale_id);
      if (mode === "return") setReturnSale(sale);
      else setSelectedSale(sale);
    } catch (error: any) {
      toast({
        title: "تعذر فتح نسخة الفاتورة",
        description: error?.message || "حاول تحديث سجل الفواتير.",
        variant: "destructive",
      });
    } finally {
      setDetailLoadingSaleId(null);
    }
  };

  if (!user?.id || !currentBranchId) return null;

  return (
    <>
      <PosPrinterRuntime />
      {canRefund && <PosPendingCardRefunds />}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="fixed right-3 top-20 z-[70] gap-1.5 bg-white/95 shadow-md backdrop-blur"
        onClick={() => setOpen(true)}
      >
        <ReceiptText className="h-4 w-4" /> الفواتير
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" dir="rtl" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader className="text-right">
            <div className="flex items-start justify-between gap-3">
              <div>
                <SheetTitle>فواتيري</SheetTitle>
                <SheetDescription>
                  نسخ محفوظة من الفواتير كما صدرت وقت البيع{canRefund ? " · المرتجع متاح حسب الصلاحية" : ""}.
                </SheetDescription>
              </div>
              <Button variant="outline" size="icon" disabled={loading} onClick={() => void load(search)}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </SheetHeader>

          <div className="relative mt-5">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="pr-9"
              placeholder="ابحث برقم الفاتورة أو العميل أو الهاتف أو مرجع الدفع"
            />
          </div>

          <div className="mt-4 space-y-2">
            {loading && invoices.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" /> جاري تحميل الفواتير
              </div>
            ) : invoices.length === 0 ? (
              <div className="rounded-2xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                {search.trim() ? "مفيش فاتورة مطابقة للبحث." : "مفيش فواتير متاحة للحساب الحالي."}
              </div>
            ) : invoices.map(invoice => {
              const returned = returnLabel(invoice);
              const loadingDetail = detailLoadingSaleId === invoice.sale_id;
              return (
                <div key={invoice.invoice_id} className="rounded-2xl border bg-white p-4 shadow-sm transition hover:border-[#005931]/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-bold">{invoice.invoice_number}</span>
                        <Badge variant="secondary" className="gap-1">
                          <WalletCards className="h-3 w-3" /> {paymentLabel(invoice)}
                        </Badge>
                        {returned && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">{returned}</Badge>}
                        {invoice.pending_refund_count > 0 && <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-800">رد إلكتروني معلق</Badge>}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock3 className="h-3.5 w-3.5" />
                          {new Date(invoice.sale_date).toLocaleDateString("ar-EG", { day: "2-digit", month: "2-digit" })}
                          {" · "}
                          {new Date(invoice.sale_date).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {invoice.item_count} صنف</span>
                        {invoice.customer_name && <span>{invoice.customer_name}</span>}
                      </div>

                      {invoice.payment_reference && (
                        <div className="mt-2 text-[11px] text-muted-foreground">مرجع الدفع: {invoice.payment_reference}</div>
                      )}
                    </div>

                    <div className="shrink-0 text-left">
                      <div className="text-lg font-black text-[#005931]">{money(invoice.total)}</div>
                      {Math.abs(invoice.amount_charged - invoice.total) > 0.005 && (
                        <div className="mt-1 text-[11px] text-muted-foreground">المحصّل {money(invoice.amount_charged)}</div>
                      )}
                    </div>
                  </div>

                  <div className={`mt-3 grid gap-2 ${canRefund ? "grid-cols-2" : "grid-cols-1"}`}>
                    <Button variant="outline" size="sm" disabled={loadingDetail} onClick={() => void openSnapshot(invoice, "view")}>
                      {loadingDetail ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} عرض الفاتورة
                    </Button>
                    {canRefund && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={loadingDetail || invoice.returned_amount + 0.005 >= invoice.total}
                        className="border-amber-200 text-amber-800 hover:bg-amber-50 hover:text-amber-900"
                        onClick={() => void openSnapshot(invoice, "return")}
                      >
                        <RotateCcw className="h-4 w-4" /> {invoice.returned_amount + 0.005 >= invoice.total ? "تم ردها" : "مرتجع"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      <InvoiceDialog isOpen={Boolean(selectedSale)} onClose={() => setSelectedSale(null)} sale={selectedSale} />
      <PosQuickReturnDialog
        open={Boolean(returnSale)}
        onOpenChange={next => { if (!next) setReturnSale(null); }}
        sale={returnSale}
        onSuccess={() => {
          setReturnSale(null);
          void load(search);
        }}
      />
    </>
  );
}
