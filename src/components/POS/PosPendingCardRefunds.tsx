import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, WalletCards } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useBranchStore } from "@/stores/branchStore";
import { confirmPosCardRefund } from "@/services/supabase/posReturnService";
import { listBranchPendingPosCardRefunds, type BranchPendingPosCardRefund } from "@/services/supabase/posPendingCardRefundService";

function money(value: number) {
  return `${Number(value || 0).toFixed(2)} ج.م`;
}

function methodName(row: BranchPendingPosCardRefund) {
  return row.payment_method_name || "وسيلة الدفع الإلكترونية";
}

export default function PosPendingCardRefunds() {
  const { currentBranchId } = useBranchStore();
  const [rows, setRows] = useState<BranchPendingPosCardRefund[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [references, setReferences] = useState<Record<string, string>>({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!currentBranchId) return;
    if (!quiet) setLoading(true);
    try {
      setRows(await listBranchPendingPosCardRefunds(currentBranchId));
      setError(null);
    } catch (e: any) {
      if (!quiet) setError(e.message || "تعذر تحميل ردود الدفع الإلكتروني المعلقة");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [currentBranchId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!currentBranchId) return;
    const refresh = () => { if (document.visibilityState === "visible") void load(true); };
    const timer = window.setInterval(refresh, 30000);
    const onReturn = () => void load(true);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pos:return-completed", onReturn);
    window.addEventListener("pos:return-card-confirmed", onReturn);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pos:return-completed", onReturn);
      window.removeEventListener("pos:return-card-confirmed", onReturn);
    };
  }, [currentBranchId, load]);

  const confirm = async (row: BranchPendingPosCardRefund) => {
    const reference = (references[row.id] || "").trim();
    if (reference.length < 3) {
      setError(`اكتب مرجع رد ${methodName(row)} قبل التأكيد.`);
      return;
    }
    try {
      setConfirmingId(row.id);
      setError(null);
      await confirmPosCardRefund(row.id, reference);
      setRows(prev => prev.filter(item => item.id !== row.id));
      setReferences(prev => { const next = { ...prev }; delete next[row.id]; return next; });
    } catch (e: any) {
      setError(e.message || `تعذر تأكيد رد ${methodName(row)}`);
    } finally {
      setConfirmingId(null);
    }
  };

  if (!currentBranchId || rows.length === 0) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="fixed right-3 top-32 z-[70] border-amber-300 bg-amber-50 text-amber-900 shadow-md backdrop-blur hover:bg-amber-100 hover:text-amber-950"
        onClick={() => { setOpen(true); void load(); }}
      >
        <WalletCards className="h-4 w-4" /> ردود إلكترونية معلقة <Badge className="bg-amber-700 text-white">{rows.length}</Badge>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" dir="rtl" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader className="text-right">
            <SheetTitle>ردود دفع إلكترونية معلقة</SheetTitle>
            <SheetDescription>نفّذ الرد على نفس وسيلة الدفع الأصلية، ثم سجل مرجع العملية هنا لإكمال المرتجع ماليًا وتحديث حساب التسوية.</SheetDescription>
          </SheetHeader>

          {error && <Alert variant="destructive" className="mt-4"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

          <div className="mt-5 space-y-3">
            {loading && rows.length === 0 ? (
              <div className="flex justify-center gap-2 py-12 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" /> جاري التحميل</div>
            ) : rows.map(row => (
              <div key={row.id} className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold">{row.invoice_number}</div>
                    <div className="mt-1"><Badge variant="outline" className="bg-white">{methodName(row)}</Badge></div>
                    <div className="mt-1 text-xs text-muted-foreground">{row.employee_name || "الكاشير"}{row.device_name ? ` · ${row.device_name}` : ""}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString("ar-EG")}</div>
                    {row.payment_reference && <div className="mt-1 text-xs text-muted-foreground">مرجع البيع: {row.payment_reference}</div>}
                  </div>
                  <div className="text-xl font-black text-amber-900">{money(row.amount)}</div>
                </div>
                <div className="mt-4 space-y-2">
                  <Label htmlFor={`refund-ref-${row.id}`}>مرجع رد {methodName(row)}</Label>
                  <Input
                    id={`refund-ref-${row.id}`}
                    value={references[row.id] || ""}
                    onChange={event => setReferences(prev => ({ ...prev, [row.id]: event.target.value }))}
                    placeholder="مثال: REF-123456"
                  />
                  <Button className="w-full bg-[#005931] hover:bg-[#004a29]" disabled={confirmingId === row.id || (references[row.id] || "").trim().length < 3} onClick={() => void confirm(row)}>
                    {confirmingId === row.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />} تأكيد رد {methodName(row)}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}