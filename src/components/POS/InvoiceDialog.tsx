import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { siteConfig } from "@/config/site";
import type { Sale } from "@/types";
import { Bluetooth, Printer, ReceiptText, X } from "lucide-react";
import { bluetoothPrinterService } from "@/services/bluetoothPrinterService";
import { buildCustomerInvoiceText } from "@/services/invoiceTextPrintService";
import {
  getInvoicePrintPreferences,
  printSaleInvoice,
  saveInvoicePrintPreferences,
  type InvoicePaperSize,
  type InvoicePrintPreferences,
} from "@/services/retailPrintService";
import { toast } from "sonner";

interface InvoiceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale | null;
  previewMode?: boolean;
  settings?: {
    footer?: string;
    website?: string;
    fontSize?: string;
    showVat?: boolean;
    template?: string;
    notes?: string;
    paymentInstructions?: string;
    logoChoice?: string;
    customLogoUrl?: string | null;
    logo?: string | null;
  };
}

const paperLabels: Record<InvoicePaperSize, string> = {
  "58mm": "حراري 58 مم",
  "80mm": "حراري 80 مم",
  a4: "A4",
};

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}`;
}

function quantityLabel(item: Sale["items"][number]) {
  if (Number(item.weight || 0) > 0) {
    return `${Number(item.weight).toLocaleString("ar-EG", { maximumFractionDigits: 3 })} كجم`;
  }
  return Number(item.quantity || 0).toLocaleString("ar-EG", { maximumFractionDigits: 3 });
}

const InvoiceDialog: React.FC<InvoiceDialogProps> = ({ isOpen, onClose, sale, previewMode = false, settings }) => {
  const [preferences, setPreferences] = useState<InvoicePrintPreferences>(() => getInvoicePrintPreferences());
  const [bleBusy, setBleBusy] = useState(false);

  useEffect(() => {
    if (isOpen) setPreferences(getInvoicePrintPreferences());
  }, [isOpen]);

  const meta = useMemo(() => {
    if (!sale) return null;
    const extra = sale as Sale & Record<string, any>;
    const loyalty = Number(extra.loyalty_voucher_amount || 0);
    const customerFee = Number(extra.customer_payment_fee_amount || 0);
    const amountPaid = Math.max(
      0,
      Number(extra.amount_charged ?? extra.amount_due ?? (Number(sale.total || 0) - loyalty + customerFee)),
    );
    const paymentName = String(
      extra.payment_method_name ||
        (sale.payment_method === "cash" ? "نقدي" : sale.payment_method === "card" ? "بطاقة بنكية" : "دفع مختلط"),
    );
    const returns = Array.isArray(extra.invoice_returns) ? extra.invoice_returns : [];
    return { extra, loyalty, customerFee, amountPaid, paymentName, returns };
  }, [sale]);

  if (!sale || !meta) return null;

  const invoiceSettings = { ...siteConfig.invoice, ...(settings || {}) };
  const logoUrl = invoiceSettings.logoChoice === "none"
    ? null
    : invoiceSettings.logoChoice === "custom"
      ? invoiceSettings.customLogoUrl
      : siteConfig.logoUrl;
  const saleDate = new Date(sale.date);
  const formattedDate = saleDate.toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" });
  const formattedTime = saleDate.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  const is58 = preferences.paperSize === "58mm";
  const isA4 = preferences.paperSize === "a4";

  const updatePreference = <K extends keyof InvoicePrintPreferences>(key: K, value: InvoicePrintPreferences[K]) => {
    setPreferences(prev => saveInvoicePrintPreferences({ ...prev, [key]: value }));
  };

  const handleDesignedPrint = () => {
    const opened = printSaleInvoice(sale, preferences, {
      footer: invoiceSettings.footer,
      website: invoiceSettings.website,
      showVat: invoiceSettings.showVat,
      notes: invoiceSettings.notes,
      paymentInstructions: invoiceSettings.paymentInstructions,
      logoChoice: invoiceSettings.logoChoice,
      customLogoUrl: invoiceSettings.customLogoUrl,
    });
    if (!opened) toast.error("المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع.");
  };

  const handleQuickBlePrint = async () => {
    try {
      setBleBusy(true);
      const text = buildCustomerInvoiceText(sale, invoiceSettings.footer || undefined);
      const success = await bluetoothPrinterService.printText(text);
      if (!success) toast.info("استخدم الطباعة المصممة من الزر الرئيسي.");
    } finally {
      setBleBusy(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent dir="rtl" className="max-h-[94vh] w-[96vw] max-w-6xl overflow-hidden p-0">
        <DialogHeader className="border-b bg-white px-5 py-4 sm:px-7">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><ReceiptText className="h-5 w-5" /></span>
              <div>
                <DialogTitle className="text-right text-xl font-black">{previewMode ? "معاينة الفاتورة" : "فاتورة المبيعات"}</DialogTitle>
                <p className="mt-1 text-xs text-slate-500">معاينة حرارية أبيض وأسود · {sale.invoice_number}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
          </div>
        </DialogHeader>

        <div className="grid max-h-[calc(94vh-78px)] min-h-0 lg:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="order-2 overflow-y-auto border-t bg-slate-50 p-5 lg:order-1 lg:border-l lg:border-t-0">
            <div className="space-y-5">
              <div>
                <p className="text-sm font-black text-slate-900">إعدادات الطباعة</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">الإعدادات محفوظة على الجهاز الحالي، وكل مقاس حراري له تصميم مستقل يناسب عرضه.</p>
              </div>

              <label className="block space-y-2">
                <span className="text-xs font-bold text-slate-600">مقاس الورق</span>
                <select className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-emerald-500" value={preferences.paperSize} onChange={e => updatePreference("paperSize", e.target.value as InvoicePaperSize)}>
                  <option value="58mm">حراري 58 مم</option>
                  <option value="80mm">حراري 80 مم</option>
                  <option value="a4">A4</option>
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-bold text-slate-600">عدد النسخ</span>
                <select className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-emerald-500" value={preferences.copies} onChange={e => updatePreference("copies", Number(e.target.value))}>
                  <option value={1}>نسخة واحدة</option><option value={2}>نسختان</option><option value={3}>3 نسخ</option>
                </select>
              </label>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                <label className="flex cursor-pointer items-center justify-between gap-3"><span className="text-sm font-bold">إظهار الشعار</span><Checkbox checked={preferences.showLogo} onCheckedChange={value => updatePreference("showLogo", Boolean(value))} /></label>
                <label className="flex cursor-pointer items-center justify-between gap-3"><span className="text-sm font-bold">باركود رقم الفاتورة</span><Checkbox checked={preferences.showInvoiceBarcode} onCheckedChange={value => updatePreference("showInvoiceBarcode", Boolean(value))} /></label>
                <label className="flex cursor-pointer items-center justify-between gap-3"><span className="text-sm font-bold">تقليل المسافات بين الأصناف</span><Checkbox checked={preferences.compactItems} onCheckedChange={value => updatePreference("compactItems", Boolean(value))} /></label>
              </div>

              <div className="rounded-2xl border border-slate-300 bg-white p-4">
                <p className="text-xs text-slate-500">الطباعة الحالية</p>
                <p className="mt-1 font-black text-slate-950">{paperLabels[preferences.paperSize]} · {preferences.copies} نسخة</p>
                {preferences.paperSize !== "a4" && <p className="mt-2 text-[11px] leading-5 text-slate-500">القالب الحراري يستخدم أسود فقط بدون خلفيات ملونة أو مساحات سوداء كبيرة.</p>}
              </div>

              <Button className="h-12 w-full gap-2 bg-[#005931] font-black hover:bg-[#004725]" onClick={handleDesignedPrint}>
                <Printer className="h-4 w-4" />طباعة الفاتورة الحرارية
              </Button>

              {bluetoothPrinterService.hasDirectBlePrinting() && (
                <Button variant="outline" className="h-11 w-full gap-2" disabled={bleBusy} onClick={handleQuickBlePrint}>
                  <Bluetooth className="h-4 w-4" />{bleBusy ? "جارٍ الإرسال..." : "طباعة بلوتوث سريعة"}
                </Button>
              )}

              <p className="text-[11px] leading-5 text-slate-500">لأفضل نتيجة عربية وشعار وباركود استخدم زر الطباعة الحرارية. الطباعة المباشرة BLE تظل خيارًا سريعًا للطابعات النصية المتوافقة.</p>
            </div>
          </aside>

          <main className="order-1 min-h-0 overflow-y-auto bg-zinc-200 p-4 sm:p-7 lg:order-2">
            <div
              className={`mx-auto bg-white text-black shadow-[0_10px_35px_rgba(0,0,0,0.14)] [font-family:Cairo,Tahoma,Arial,sans-serif] ${
                isA4 ? "max-w-[820px] p-8 sm:p-12" : is58 ? "max-w-[330px] p-3" : "max-w-[455px] p-4"
              }`}
            >
              <header className="border-b-2 border-black pb-2 text-center">
                {preferences.showLogo && logoUrl && (
                  <img
                    src={logoUrl}
                    alt={siteConfig.name}
                    className={`mx-auto mb-1 object-contain grayscale contrast-200 ${is58 ? "max-h-9 max-w-[48%]" : "max-h-12 max-w-[55%]"}`}
                  />
                )}
                <h2 className={`${is58 ? "text-base" : isA4 ? "text-2xl" : "text-xl"} font-black leading-tight text-black`}>{siteConfig.name}</h2>
                <p className="mt-0.5 text-[9px] font-black text-black">مش مجرد ماركت</p>
                <div className={`mt-1 space-y-0.5 text-black ${is58 ? "text-[8px]" : "text-[9px]"}`}>
                  {siteConfig.address && <p>{siteConfig.address}</p>}
                  {siteConfig.phone && <p>هاتف: {siteConfig.phone}</p>}
                  {invoiceSettings.showVat && siteConfig.vatNumber && <p>الرقم الضريبي: {siteConfig.vatNumber}</p>}
                  {invoiceSettings.website && <p>{invoiceSettings.website}</p>}
                </div>
              </header>

              <section className="border-b border-dashed border-black py-2 text-center">
                <p className="text-[8px] font-bold">فاتورة مبيعات</p>
                <p className={`${is58 ? "text-xs" : "text-sm"} mt-0.5 break-all font-black`}>#{sale.invoice_number}</p>
                <span className="mt-1 inline-block border border-black px-2 py-0.5 text-[8px] font-black">مدفوعة</span>
              </section>

              <section className={`grid border-b border-dashed border-black py-2 ${is58 ? "grid-cols-2" : "grid-cols-4"} gap-x-3 gap-y-1.5`}>
                <div><span className="block text-[7px]">التاريخ</span><strong className="block text-[9px]">{formattedDate}</strong></div>
                <div><span className="block text-[7px]">الوقت</span><strong className="block text-[9px]">{formattedTime}</strong></div>
                <div><span className="block text-[7px]">الكاشير</span><strong className="block break-words text-[9px]">{sale.cashier_name || "—"}</strong></div>
                <div><span className="block text-[7px]">الدفع</span><strong className="block break-words text-[9px]">{meta.paymentName}</strong></div>
              </section>

              {(sale.customer_name || sale.customer_phone) && (
                <section className="flex flex-wrap items-baseline gap-x-2 border-b border-dashed border-black py-1.5 text-[8px]">
                  <span>العميل:</span>
                  <strong>{sale.customer_name || "عميل عام"}</strong>
                  {sale.customer_phone && <span dir="ltr" className="font-bold">{sale.customer_phone}</span>}
                </section>
              )}

              {is58 ? (
                <section className="mt-1">
                  <div className="border-b-2 border-black py-1 text-center text-[8px] font-black">الأصناف</div>
                  {sale.items.map((item, index) => (
                    <div key={`${item.product.id}-${index}`} className={`border-b border-dashed border-black ${preferences.compactItems ? "py-1.5" : "py-2"}`}>
                      <p className="break-words text-[9px] font-black leading-4">{item.product.name}</p>
                      <div className="mt-0.5 flex items-baseline justify-between gap-2 text-[8px]">
                        <span className="whitespace-nowrap">{quantityLabel(item)} × {money(item.price)}</span>
                        <strong className="whitespace-nowrap text-[9px]">{money(item.total)}</strong>
                      </div>
                      {(item.product.barcode || Number(item.discount || 0) > 0) && (
                        <div className="mt-0.5 flex justify-between gap-2 text-[7px]">
                          {item.product.barcode ? <span className="break-all">باركود: {item.product.barcode}</span> : <span />}
                          {Number(item.discount || 0) > 0 && <strong>خصم: {money(item.discount)}</strong>}
                        </div>
                      )}
                    </div>
                  ))}
                </section>
              ) : (
                <div className="mt-1 overflow-hidden">
                  <table className="w-full table-fixed border-collapse text-[9px]">
                    <thead>
                      <tr className="border-y-2 border-black text-[8px]">
                        <th className="w-[43%] py-1 text-right">الصنف</th>
                        <th className="w-[16%] py-1 text-center">الكمية</th>
                        <th className="w-[19%] py-1 text-center">سعر الوحدة</th>
                        <th className="w-[22%] py-1 text-left">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sale.items.map((item, index) => (
                        <tr key={`${item.product.id}-${index}`} className="border-b border-dashed border-black align-top">
                          <td className={`${preferences.compactItems ? "py-1" : "py-2"} pl-1 font-black`}>
                            {item.product.name}
                            {item.product.barcode && <span className="mt-0.5 block break-all text-[7px] font-normal">{item.product.barcode}</span>}
                            {Number(item.discount || 0) > 0 && <span className="mt-0.5 block text-[7px] font-bold">خصم {money(item.discount)}</span>}
                          </td>
                          <td className={`${preferences.compactItems ? "py-1" : "py-2"} text-center`}>{quantityLabel(item)}</td>
                          <td className={`${preferences.compactItems ? "py-1" : "py-2"} text-center`}>{money(item.price)}</td>
                          <td className={`${preferences.compactItems ? "py-1" : "py-2"} text-left font-black`}>{money(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <section className="mt-2 space-y-1 border-t-2 border-black pt-2 text-[9px]">
                <div className="flex justify-between gap-3"><span>المجموع الفرعي</span><strong>{money(sale.subtotal)}</strong></div>
                {Number(sale.discount || 0) > 0 && <div className="flex justify-between gap-3"><span>خصومات المنتجات</span><strong>- {money(sale.discount)}</strong></div>}
                {meta.loyalty > 0 && <div className="flex justify-between gap-3"><span>كوبون / رصيد ولاء</span><strong>- {money(meta.loyalty)}</strong></div>}
                {meta.customerFee > 0 && <div className="flex justify-between gap-3"><span>رسوم وسيلة الدفع</span><strong>+ {money(meta.customerFee)}</strong></div>}
                <div className={`mt-2 flex justify-between gap-3 border-y-4 border-double border-black py-2 font-black ${is58 ? "text-[11px]" : "text-sm"}`}>
                  <span>المدفوع فعليًا</span><strong>{money(meta.amountPaid)}</strong>
                </div>
              </section>

              <section className="mt-2 space-y-1 border-b border-dashed border-black pb-2 text-[8px]">
                <div className="flex justify-between gap-3"><span>طريقة الدفع</span><strong>{meta.paymentName}</strong></div>
                {meta.extra.payment_reference && <div className="flex justify-between gap-3"><span>مرجع العملية</span><strong dir="ltr" className="break-all text-left">{meta.extra.payment_reference}</strong></div>}
                {Number(meta.extra.cash_amount || 0) > 0 && sale.payment_method === "mixed" && <div className="flex justify-between gap-3"><span>نقدي</span><strong>{money(meta.extra.cash_amount)}</strong></div>}
                {Number(meta.extra.card_amount || 0) > 0 && sale.payment_method === "mixed" && <div className="flex justify-between gap-3"><span>بطاقة / إلكتروني</span><strong>{money(meta.extra.card_amount)}</strong></div>}
              </section>

              {meta.returns.length > 0 && (
                <div className="mt-2 border-y-4 border-double border-black py-1.5 text-center text-[8px] font-black">
                  تنبيه: تحتوي الفاتورة على {meta.returns.length.toLocaleString("ar-EG")} عملية مرتجع مسجلة.
                </div>
              )}

              {invoiceSettings.notes && <div className="mt-2 border-t border-dashed border-black pt-2 text-[8px]"><strong>ملاحظات:</strong><p className="mt-0.5 whitespace-pre-wrap">{invoiceSettings.notes}</p></div>}
              {invoiceSettings.paymentInstructions && <div className="mt-2 border-t border-dashed border-black pt-2 text-[8px]"><strong>تعليمات:</strong><p className="mt-0.5 whitespace-pre-wrap">{invoiceSettings.paymentInstructions}</p></div>}

              {preferences.showInvoiceBarcode && <div className="mt-3 border-t border-dashed border-black pt-2 text-center text-[7px] font-bold">سيظهر باركود رقم الفاتورة هنا عند الطباعة</div>}

              <footer className="mt-2 border-t-2 border-black pt-2 text-center">
                <p className="text-[10px] font-black text-black">{invoiceSettings.footer || "شكراً لزيارتكم!"}</p>
                <p className="mt-0.5 text-[7px] text-black">احتفظ بالفاتورة للرجوع إليها عند الحاجة</p>
              </footer>
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InvoiceDialog;
