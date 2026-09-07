import { useCallback, useEffect, useState } from "react";
import { Clock3, CreditCard, FileText, RefreshCw, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import InvoiceDialog from "@/components/POS/InvoiceDialog";
import PosPrinterRuntime from "@/components/POS/PosPrinterRuntime";
import type { CartItem, Sale } from "@/types";

function money(value: number) {
  return `${Number(value || 0).toFixed(2)} ج.م`;
}

function paymentLabel(method?: string) {
  if (method === "card") return "بطاقة";
  if (method === "mixed") return "مختلط";
  return "نقدي";
}

export default function PosRecentSales() {
  const { user } = useAuth();
  const { currentBranchId } = useBranchStore();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || !currentBranchId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("branch_id", currentBranchId)
        .eq("cashier_id", user.id)
        .order("date", { ascending: false })
        .limit(10);
      if (error) throw error;
      setSales((data || []).map((row: any) => ({
        ...row,
        items: (Array.isArray(row.items) ? row.items : []) as CartItem[],
        payment_method: row.payment_method === "card" || row.payment_method === "mixed" ? row.payment_method : "cash",
      })) as Sale[]);
    } catch {
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, currentBranchId]);

  useEffect(() => {
    const onSaleCompleted = (event: Event) => {
      const sale = (event as CustomEvent<Sale>).detail;
      if (!sale?.id || sale.branch_id !== currentBranchId) return;
      setSales(prev => [sale, ...prev.filter(row => row.id !== sale.id)].slice(0, 10));
    };
    window.addEventListener("pos:sale-completed", onSaleCompleted);
    return () => window.removeEventListener("pos:sale-completed", onSaleCompleted);
  }, [currentBranchId]);

  const openPanel = () => {
    setOpen(true);
    void load();
  };

  if (!user?.id || !currentBranchId) return null;

  return (
    <>
      <PosPrinterRuntime />

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="fixed right-3 top-20 z-[70] bg-white/95 shadow-md backdrop-blur"
        onClick={openPanel}
      >
        <ReceiptText className="h-4 w-4" /> آخر الفواتير
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" dir="rtl" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader className="text-right">
            <div className="flex items-center justify-between gap-3">
              <div>
                <SheetTitle>آخر فواتيري</SheetTitle>
                <SheetDescription>آخر 10 عمليات بيع على الفرع الحالي.</SheetDescription>
              </div>
              <Button variant="outline" size="icon" disabled={loading} onClick={() => void load()}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </SheetHeader>

          <div className="mt-5 space-y-2">
            {loading && sales.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" /> جاري تحميل الفواتير
              </div>
            ) : sales.length === 0 ? (
              <div className="rounded-2xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                مفيش فواتير حديثة للكاشير الحالي.
              </div>
            ) : sales.map(sale => (
              <button
                key={sale.id}
                type="button"
                className="w-full rounded-2xl border bg-white p-4 text-right shadow-sm transition hover:border-[#005931]/30 hover:bg-emerald-50/30"
                onClick={() => setSelectedSale(sale)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-bold">{sale.invoice_number}</span>
                      <Badge variant="secondary">{paymentLabel(sale.payment_method)}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {new Date(sale.date).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {sale.items?.length || 0} صنف</span>
                      {sale.payment_method !== "cash" && <span className="flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" /> {paymentLabel(sale.payment_method)}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-lg font-black text-[#005931]">{money(sale.total)}</div>
                </div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <InvoiceDialog isOpen={Boolean(selectedSale)} onClose={() => setSelectedSale(null)} sale={selectedSale} />
    </>
  );
}
