import { useCallback, useEffect, useRef, useState } from 'react';
import { Printer, RefreshCw, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useBranchStore } from '@/stores/branchStore';
import { posThermalPrinter } from '@/native/posNative';
import { printSaleInvoice } from '@/services/retailPrintService';
import type { Sale } from '@/types';

type Printer = { address: string; name: string };
type Selection = { address: string | null; name: string | null; paperSize: string };

export default function NativePrinterRuntime() {
  const { currentBranchId } = useBranchStore();
  const key = `pos:auto-print:${currentBranchId || ''}`;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [devices, setDevices] = useState<Printer[]>([]);
  const [paperSize, setPaperSize] = useState<'58mm' | '80mm'>('80mm');
  const [auto, setAuto] = useState(() => localStorage.getItem(key) === '1');
  const [busy, setBusy] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const autoRef = useRef(auto);
  const selectedRef = useRef(selection);

  useEffect(() => { autoRef.current = auto; selectedRef.current = selection; }, [auto, selection]);
  useEffect(() => {
    setAuto(localStorage.getItem(key) === '1');
    void posThermalPrinter.getSelected().then(value => {
      setSelection(value);
      setPaperSize(value.paperSize === '58mm' ? '58mm' : '80mm');
    }).catch(() => toast.error('تعذر قراءة إعدادات الطابعة'));
  }, [key]);

  const print = useCallback(async (sale: Sale) => {
    const ok = await printSaleInvoice(sale);
    if (!ok) toast.error('تعذرت الطباعة. افحص تشغيل الطابعة واقتران Bluetooth.');
  }, []);

  useEffect(() => {
    const completed = (event: Event) => {
      const sale = (event as CustomEvent<Sale>).detail;
      if (!sale?.id) return;
      setLastSale(sale);
      if (autoRef.current && selectedRef.current?.address) void print(sale);
    };
    const printError = (event: Event) => toast.error((event as CustomEvent<string>).detail);
    window.addEventListener('pos:sale-completed', completed);
    window.addEventListener('pos:print-error', printError);
    return () => { window.removeEventListener('pos:sale-completed', completed); window.removeEventListener('pos:print-error', printError); };
  }, [print]);

  const refresh = async () => {
    setBusy(true);
    try {
      const result = await posThermalPrinter.listPaired({ operation: 'list' });
      setDevices(result.devices);
      if (!result.devices.length) toast.info('اقرن الطابعة من إعدادات Bluetooth في أندرويد أولًا.');
    } catch (error) { toast.error((error as Error).message || 'تعذر عرض الطابعات المقترنة'); }
    finally { setBusy(false); }
  };

  const choose = async (device: Printer) => {
    setBusy(true);
    try {
      const value = await posThermalPrinter.select({ operation: 'save', address: device.address, paperSize });
      setSelection(value); toast.success(`تم حفظ ${value.name}. الطباعة التالية هتتوجه لها مباشرة.`);
    } catch (error) { toast.error((error as Error).message || 'تعذر اختيار الطابعة'); }
    finally { setBusy(false); }
  };

  return <Sheet>
    <SheetTrigger asChild><Button variant="outline" size="sm" className="fixed left-3 top-[calc(5rem+var(--pos-inset-top,0px))] z-[70] bg-white shadow-md"><Printer className="h-4 w-4" />{selection?.name || 'إعداد الطابعة'}</Button></SheetTrigger>
    <SheetContent side="left" dir="rtl" className="w-full overflow-y-auto sm:max-w-sm">
      <SheetHeader className="text-right"><SheetTitle>طباعة أندرويد</SheetTitle></SheetHeader>
      <div className="mt-6 space-y-4 text-sm">
        <p>الطابعة الحرارية المقترنة ببلوتوث بتتحفظ على الجهاز مرة واحدة، والفواتير بتطبع مباشرة من التطبيق. لو مفيش طابعة مختارة، زر الفاتورة بيفتح طباعة أندرويد.</p>
        <div className="rounded-xl bg-slate-50 p-3">الطابعة الحالية: <strong>{selection?.name || 'طباعة النظام'}</strong></div>
        <div className="flex gap-2"><Button variant={paperSize === '58mm' ? 'default' : 'outline'} onClick={() => setPaperSize('58mm')}>58 مم</Button><Button variant={paperSize === '80mm' ? 'default' : 'outline'} onClick={() => setPaperSize('80mm')}>80 مم</Button></div>
        <Button variant="outline" disabled={busy} onClick={() => void refresh()}><RefreshCw className="h-4 w-4" /> عرض الطابعات المقترنة</Button>
        {devices.map(device => <Button key={device.address} variant="outline" className="w-full justify-start" disabled={busy} onClick={() => void choose(device)}>{device.name}{selection?.address === device.address ? ' ✓' : ''}</Button>)}
        {selection?.address && <>
          <Button variant="outline" className="w-full" disabled={!lastSale || busy} onClick={() => lastSale && void print(lastSale)}><ReceiptText className="h-4 w-4" /> طباعة آخر فاتورة</Button>
          <Button variant={auto ? 'default' : 'outline'} className="w-full" onClick={() => { const next = !auto; setAuto(next); autoRef.current = next; localStorage.setItem(key, next ? '1' : '0'); }}>الطباعة التلقائية بعد البيع: {auto ? 'مفعلة' : 'متوقفة'}</Button>
          <Button variant="ghost" className="w-full" onClick={() => void posThermalPrinter.clear().then(() => { setSelection(null); setAuto(false); localStorage.setItem(key, '0'); })}>إلغاء الطابعة المحفوظة واستخدام طباعة النظام</Button>
        </>}
      </div>
    </SheetContent>
  </Sheet>;
}
