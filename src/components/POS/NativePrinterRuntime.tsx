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
type UsbPrinter = { deviceId: number; vendorId: number; productId: number; name: string; permission: boolean };
type Selection = {
  address: string | null;
  name: string | null;
  paperSize: string;
  transport?: 'bluetooth' | 'usb';
  usbDeviceId?: number | null;
};
type PrintMetrics = {
  mode?: string;
  prepareMs?: number;
  sendMs?: number;
  totalMs?: number;
  persistentConnection?: boolean;
  printer?: string;
  paperSize?: string;
  transport?: 'bluetooth' | 'usb';
};

export default function NativePrinterRuntime() {
  const { currentBranchId } = useBranchStore();
  const key = `pos:auto-print:${currentBranchId || ''}`;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [devices, setDevices] = useState<Printer[]>([]);
  const [usbDevices, setUsbDevices] = useState<UsbPrinter[]>([]);
  const [paperSize, setPaperSize] = useState<'58mm' | '80mm'>('80mm');
  const [auto, setAuto] = useState(() => localStorage.getItem(key) === '1');
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<PrintMetrics | null>(null);
  const autoRef = useRef(auto);
  const selectedRef = useRef(selection);
  const printingRef = useRef(false);

  useEffect(() => { autoRef.current = auto; selectedRef.current = selection; }, [auto, selection]);
  useEffect(() => {
    setAuto(localStorage.getItem(key) === '1');
    void (async () => {
      try {
        let value = await posThermalPrinter.getSelected();

        // Keep a WebView-side backup so APK updates/reinstalls that preserve app data
        // can restore the thermal printer instead of silently falling back to system print.
        const backupRaw = localStorage.getItem('pos:thermal-printer-backup');
        if (!value.address && value.transport !== 'usb') {
          let restored = false;
          if (backupRaw) {
            try {
              const backup = JSON.parse(backupRaw) as { address?: string; paperSize?: '58mm' | '80mm' };
              if (backup.address) {
                value = await posThermalPrinter.select({
                  operation: 'save',
                  address: backup.address,
                  paperSize: backup.paperSize === '58mm' ? '58mm' : '80mm',
                });
                restored = true;
              }
            } catch {
              // Continue to safe paired-device auto detection below.
            }
          }

          if (!restored) {
            try {
              const paired = await posThermalPrinter.listPaired({ operation: 'list' });
              const xp = paired.devices.filter(device => device.name?.toUpperCase().includes('XP-P323B'));
              if (xp.length === 1) {
                value = await posThermalPrinter.select({
                  operation: 'save',
                  address: xp[0].address,
                  paperSize: value.paperSize === '58mm' ? '58mm' : '80mm',
                });
                localStorage.setItem('pos:thermal-printer-backup', JSON.stringify({
                  address: xp[0].address,
                  name: xp[0].name,
                  paperSize: value.paperSize === '58mm' ? '58mm' : '80mm',
                }));
              }
            } catch {
              // Bluetooth may be off or permission may not be granted yet.
            }
          }
        }

        setSelection(value);
        selectedRef.current = value;
        setPaperSize(value.paperSize === '58mm' ? '58mm' : '80mm');
      } catch {
        toast.error('تعذر قراءة إعدادات الطابعة');
      }
    })();
  }, [key]);

  const print = useCallback(async (sale: Sale) => {
    if (printingRef.current) return;
    printingRef.current = true; setPrinting(true); setPrintError(null);
    try {
      const ok = await printSaleInvoice(sale);
      if (!ok) setPrintError(current => current || 'تعذرت الطباعة؛ شغّل اختبار اتصال الطابعة لمعرفة السبب.');
      else { setPrintError(null); toast.success('تم إرسال الفاتورة للطابعة'); }
    } finally { printingRef.current = false; setPrinting(false); }
  }, []);

  useEffect(() => {
    const completed = (event: Event) => {
      const sale = (event as CustomEvent<Sale>).detail;
      if (!sale?.id) return;
      setLastSale(sale);
      if (autoRef.current && (selectedRef.current?.address || selectedRef.current?.transport === 'usb')) void print(sale);
    };
    const onPrintError = (event: Event) => setPrintError((event as CustomEvent<string>).detail);
    const onPrintMetrics = (event: Event) => setMetrics((event as CustomEvent<PrintMetrics>).detail);
    window.addEventListener('pos:sale-completed', completed);
    window.addEventListener('pos:print-error', onPrintError);
    window.addEventListener('pos:print-metrics', onPrintMetrics);
    return () => {
      window.removeEventListener('pos:sale-completed', completed);
      window.removeEventListener('pos:print-error', onPrintError);
      window.removeEventListener('pos:print-metrics', onPrintMetrics);
    };
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

  const refreshUsb = async () => {
    setBusy(true);
    try {
      const result = await posThermalPrinter.listUsb();
      setUsbDevices(result.devices);
      if (!result.devices.length) toast.info('وصّل الطابعة بكابل USB OTG ثم افتح القائمة مرة أخرى.');
    } catch (error) { toast.error((error as Error).message || 'تعذر عرض طابعات USB'); }
    finally { setBusy(false); }
  };

  const choose = async (device: Printer) => {
    setBusy(true);
    try {
      const value = await posThermalPrinter.select({ operation: 'save', address: device.address, paperSize });
      localStorage.setItem('pos:thermal-printer-backup', JSON.stringify({
        address: device.address,
        name: value.name || device.name,
        paperSize,
      }));
      setSelection(value);
      selectedRef.current = value;
      toast.success(`تم حفظ ${value.name}. الطباعة التالية هتتوجه لها مباشرة.`);
    } catch (error) { toast.error((error as Error).message || 'تعذر اختيار الطابعة'); }
    finally { setBusy(false); }
  };

  const chooseUsb = async (device: UsbPrinter) => {
    setBusy(true);
    try {
      const value = await posThermalPrinter.selectUsb({ deviceId: device.deviceId, paperSize });
      localStorage.removeItem('pos:thermal-printer-backup');
      setSelection(value);
      selectedRef.current = value;
      toast.success(`تم تفعيل USB Fast Mode على ${value.name || device.name}.`);
    } catch (error) { toast.error((error as Error).message || 'تعذر اختيار طابعة USB'); }
    finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true); setPrintError(null);
    try {
      await posThermalPrinter.testConnection({ operation: 'test' });
      toast.success('اتصال الطابعة نجح واتبعثت ورقة اختبار صغيرة.');
    } catch (error) { setPrintError((error as Error)?.message || 'تعذر اختبار الاتصال'); }
    finally { setBusy(false); }
  };

  return <Sheet>
    <SheetTrigger asChild><Button variant="outline" size="sm" className="fixed left-3 top-[calc(5rem+var(--pos-inset-top,0px))] z-[70] bg-white shadow-md"><Printer className="h-4 w-4" />{selection?.name || 'إعداد الطابعة'}</Button></SheetTrigger>
    <SheetContent side="left" dir="rtl" className="w-full overflow-y-auto sm:max-w-sm">
      <SheetHeader className="text-right"><SheetTitle>طباعة أندرويد</SheetTitle></SheetHeader>
      <div className="mt-6 space-y-4 text-sm">
        {printError && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-red-800">{printError}</div>}
        <p>اختَر Bluetooth للطباعة اللاسلكية أو USB/OTG لأسرع استجابة. الاختيار بيتحفظ على الجهاز، ولو مفيش طابعة مباشرة مختارة يفضل مسار طباعة أندرويد العادي متاح.</p>
        <div className="rounded-xl bg-slate-50 p-3 space-y-1">
          <div>الطابعة الحالية: <strong>{selection?.name || 'طباعة النظام'}</strong></div>
          {selection?.name?.toUpperCase().includes('XP-P323B') && <div className="text-xs font-semibold text-emerald-700">وضع XP-P323B السريع مفعّل تلقائيًا</div>}
          {selection?.transport === 'usb' && <div className="text-xs font-semibold text-emerald-700">USB Fast Mode — أسرع مسار على أندرويد</div>}
        </div>
        {metrics && <div className="rounded-xl border bg-white p-3 text-xs leading-6">
          <div className="font-bold text-slate-800">آخر قياس للطباعة</div>
          <div className="grid grid-cols-2 gap-x-3">
            <span>تجهيز الفاتورة</span><strong dir="ltr">{Math.round(metrics.prepareMs || 0)} ms</strong>
            <span>إرسال للطابعة</span><strong dir="ltr">{Math.round(metrics.sendMs || 0)} ms</strong>
            <span>الإجمالي</span><strong dir="ltr">{Math.round(metrics.totalMs || 0)} ms</strong>
            <span>نوع الاتصال</span><strong>{metrics.transport === 'usb' ? 'USB' : 'Bluetooth'}</strong>
            <span>الاتصال المستمر</span><strong>{metrics.persistentConnection ? 'نعم' : 'لا'}</strong>
          </div>
        </div>}
        <div className="flex gap-2"><Button variant={paperSize === '58mm' ? 'default' : 'outline'} onClick={() => setPaperSize('58mm')}>58 مم</Button><Button variant={paperSize === '80mm' ? 'default' : 'outline'} onClick={() => setPaperSize('80mm')}>80 مم</Button></div>
        <div className="grid gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void refresh()}><RefreshCw className="h-4 w-4" /> طابعات Bluetooth</Button>
          {devices.map(device => <Button key={device.address} variant="outline" className="w-full justify-start" disabled={busy} onClick={() => void choose(device)}>{device.name}{selection?.transport !== 'usb' && selection?.address === device.address ? ' ✓' : ''}</Button>)}
        </div>
        <div className="grid gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void refreshUsb()}><RefreshCw className="h-4 w-4" /> طابعات USB / OTG</Button>
          {usbDevices.map(device => <Button key={device.deviceId} variant="outline" className="w-full justify-start" disabled={busy} onClick={() => void chooseUsb(device)}>{device.name}{selection?.transport === 'usb' && selection?.usbDeviceId === device.deviceId ? ' ✓' : ''}</Button>)}
        </div>
        {(selection?.address || selection?.transport === 'usb') && <>
          <Button variant="outline" className="w-full" disabled={busy || printing} onClick={() => void test()}>اختبار اتصال وطباعة الطابعة</Button>
          <Button variant="outline" className="w-full" disabled={!lastSale || busy || printing} onClick={() => lastSale && void print(lastSale)}><ReceiptText className="h-4 w-4" /> {printing ? 'جاري إرسال الفاتورة…' : 'طباعة آخر فاتورة'}</Button>
          <Button variant={auto ? 'default' : 'outline'} className="w-full" onClick={() => { const next = !auto; setAuto(next); autoRef.current = next; localStorage.setItem(key, next ? '1' : '0'); }}>الطباعة التلقائية بعد البيع: {auto ? 'مفعلة' : 'متوقفة'}</Button>
          <Button variant="ghost" className="w-full" onClick={() => void posThermalPrinter.clear().then(() => { setSelection(null); setAuto(false); localStorage.setItem(key, '0'); })}>إلغاء الطابعة المحفوظة واستخدام طباعة النظام</Button>
        </>}
      </div>
    </SheetContent>
  </Sheet>;
}
