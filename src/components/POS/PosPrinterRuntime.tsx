import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Power, Printer, RefreshCw, ReceiptText, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Sale } from "@/types";
import { useBranchStore } from "@/stores/branchStore";
import { bluetoothPrinterService, type PrinterConnectionStatus } from "@/services/bluetoothPrinterService";
import { buildCustomerInvoiceText } from "@/services/invoiceTextPrintService";

function autoPrintKey(branchId: string) {
  return `pos:auto-print:${branchId}`;
}

function readAutoPrint(branchId: string) {
  try {
    return localStorage.getItem(autoPrintKey(branchId)) === "1";
  } catch {
    return false;
  }
}

export default function PosPrinterRuntime() {
  const { currentBranchId } = useBranchStore();
  const [status, setStatus] = useState<PrinterConnectionStatus>(() => bluetoothPrinterService.getStatus());
  const [busy, setBusy] = useState(false);
  const [autoPrint, setAutoPrint] = useState(() => currentBranchId ? readAutoPrint(currentBranchId) : false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const autoPrintRef = useRef(autoPrint);

  const refreshStatus = () => setStatus(bluetoothPrinterService.getStatus());

  useEffect(() => {
    autoPrintRef.current = autoPrint;
  }, [autoPrint]);

  useEffect(() => {
    const next = currentBranchId ? readAutoPrint(currentBranchId) : false;
    setAutoPrint(next);
    autoPrintRef.current = next;
    refreshStatus();
  }, [currentBranchId]);

  const printSale = async (sale: Sale) => {
    const text = buildCustomerInvoiceText(sale);
    const ok = await bluetoothPrinterService.printText(text);
    refreshStatus();
    return ok;
  };

  useEffect(() => {
    const onSaleCompleted = (event: Event) => {
      const sale = (event as CustomEvent<Sale>).detail;
      if (!sale?.id) return;
      setLastSale(sale);
      const current = bluetoothPrinterService.getStatus();
      setStatus(current);
      if (autoPrintRef.current && current.connected && current.directBlePrinting) {
        void printSale(sale);
      }
    };
    window.addEventListener("pos:sale-completed", onSaleCompleted);
    return () => window.removeEventListener("pos:sale-completed", onSaleCompleted);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F10" || !lastSale || busy) return;
      event.preventDefault();
      void printSale(lastSale);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [lastSale, busy]);

  const connect = async () => {
    try {
      setBusy(true);
      await bluetoothPrinterService.connectPrinter();
    } finally {
      setBusy(false);
      refreshStatus();
    }
  };

  const disconnect = async () => {
    try {
      setBusy(true);
      await bluetoothPrinterService.disconnectPrinter();
      if (currentBranchId) localStorage.setItem(autoPrintKey(currentBranchId), "0");
      setAutoPrint(false);
    } finally {
      setBusy(false);
      refreshStatus();
    }
  };

  const testPrint = async () => {
    try {
      setBusy(true);
      await bluetoothPrinterService.testPrint();
    } finally {
      setBusy(false);
      refreshStatus();
    }
  };

  const toggleAutoPrint = () => {
    if (!currentBranchId || !status.connected || !status.directBlePrinting) return;
    const next = !autoPrint;
    setAutoPrint(next);
    autoPrintRef.current = next;
    localStorage.setItem(autoPrintKey(currentBranchId), next ? "1" : "0");
  };

  const savedButOffline = Boolean(status.name && !status.connected);
  const label = status.connected
    ? status.directBlePrinting ? "الطابعة جاهزة" : "الطابعة مربوطة"
    : savedButOffline ? "إعادة ربط الطابعة" : "ربط الطابعة";

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`fixed left-3 top-20 z-[70] bg-white/95 shadow-md backdrop-blur ${status.connected ? "border-emerald-200 text-[#005931]" : savedButOffline ? "border-amber-200 text-amber-800" : ""}`}
        >
          <Printer className="h-4 w-4" />
          <span className="hidden sm:inline">{label}</span>
          <span className={`h-2 w-2 rounded-full ${status.connected ? "bg-emerald-500" : savedButOffline ? "bg-amber-500" : "bg-slate-300"}`} />
        </Button>
      </SheetTrigger>

      <SheetContent side="left" dir="rtl" className="w-full overflow-y-auto sm:max-w-sm">
        <SheetHeader className="text-right">
          <SheetTitle>طابعة الكاشير</SheetTitle>
          <SheetDescription>ربط واختبار الطابعة والتحكم في الطباعة التلقائية بعد البيع.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className={`rounded-2xl border p-4 ${status.connected ? "border-emerald-200 bg-emerald-50/60" : savedButOffline ? "border-amber-200 bg-amber-50/60" : "bg-slate-50"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-bold">
                  {status.connected ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Printer className="h-5 w-5 text-slate-500" />}
                  {status.name || "لا توجد طابعة مربوطة"}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {status.connected
                    ? status.directBlePrinting ? "متصلة — طباعة مباشرة BLE متاحة" : "متصلة — الطباعة عبر نافذة النظام"
                    : savedButOffline ? "الطابعة محفوظة على الجهاز، وتحتاج إعادة ربط بعد فتح المتصفح." : "اضغط ربط الطابعة واختر الطابعة الحرارية."}
                </p>
              </div>
              {status.connected && <Badge className="bg-[#005931]">متصلة</Badge>}
            </div>
          </div>

          {!status.connected ? (
            <Button className="h-12 w-full bg-[#005931] hover:bg-[#004a29]" onClick={() => void connect()} disabled={busy}>
              {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              {savedButOffline ? "إعادة ربط الطابعة" : "ربط طابعة Bluetooth"}
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-11" onClick={() => void testPrint()} disabled={busy}>
                <ReceiptText className="h-4 w-4" /> اختبار طباعة
              </Button>
              <Button variant="outline" className="h-11 text-red-600" onClick={() => void disconnect()} disabled={busy}>
                <Power className="h-4 w-4" /> فصل
              </Button>
            </div>
          )}

          <div className="rounded-2xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-semibold"><Zap className="h-4 w-4 text-amber-600" /> طباعة تلقائية</div>
                <p className="mt-1 text-xs text-muted-foreground">بعد نجاح البيع، ابعت الفاتورة مباشرة للطابعة بدون فتح نافذة الفاتورة.</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={autoPrint ? "default" : "outline"}
                className={autoPrint ? "bg-[#005931] hover:bg-[#004a29]" : ""}
                disabled={!status.connected || !status.directBlePrinting}
                onClick={toggleAutoPrint}
              >
                {autoPrint ? "مفعلة" : "مقفولة"}
              </Button>
            </div>
            {!status.directBlePrinting && (
              <p className="mt-3 text-[11px] text-amber-700">الطباعة التلقائية تحتاج طابعة تدعم الكتابة المباشرة BLE. الطباعة العادية تفضل متاحة من زر الفاتورة.</p>
            )}
          </div>

          {lastSale && (
            <Button variant="outline" className="h-12 w-full" onClick={() => void printSale(lastSale)} disabled={busy}>
              <ReceiptText className="h-4 w-4" /> طباعة آخر فاتورة · {lastSale.invoice_number} · F10
            </Button>
          )}

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>بعد إعادة تشغيل Chrome قد تحتاج تضغط «إعادة ربط» مرة واحدة؛ المتصفح لا يسمح بإعادة فتح Bluetooth سرًا بدون تفاعل المستخدم.</AlertDescription>
          </Alert>
        </div>
      </SheetContent>
    </Sheet>
  );
}
