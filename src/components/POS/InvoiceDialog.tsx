import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    const amountPaid = Math.max(0, Number(extra.amount_charged ?? extra.amount_due ?? (Number(sale.total || 0) - loyalty + customerFee)));
    const paymentName = String(extra.payment_method_name || (sale.payment_method === "cash" ? "نقدي" : sale.payment_method === "card" ? "بطاقة بنكية" : "دفع مختلط"));
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
  const formattedDate = saleDate.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });

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
                <p className="mt-1 text-xs text-slate-500">نسخة محفوظة من Invoice V2 · {sale.invoice_number}</p>
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
                <p className="mt-1 text-xs leading-5 text-slate-500">الإعدادات محفوظة على الجهاز الحالي، لذلك كل كاشير يقدر يثبت مقاس طابعته مرة واحدة.</p>
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
                <label className="flex cursor-pointer items-center justify-between gap-3"><span className="text-sm font-bold">صفوف أصناف مضغوطة</span><Checkbox checked={preferences.compactItems} onCheckedChange={value => updatePreference("compactItems", Boolean(value))} /></label>
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-xs text-emerald-800">الطباعة الحالية</p>
                <p className="mt-1 font-black text-emerald-950">{paperLabels[preferences.paperSize]} · {preferences.copies} نسخة</p>
              </div>

              <Button className="h-12 w-full gap-2 bg-[#005931] font-black hover:bg-[#004725]" onClick={handleDesignedPrint}>
                <Printer className="h-4 w-4" />طباعة الفاتورة المصممة
              </Button>

              {bluetoothPrinterService.hasDirectBlePrinting() && (
                <Button variant="outline" className="h-11 w-full gap-2" disabled={bleBusy} onClick={handleQuickBlePrint}>
                  <Bluetooth className="h-4 w-4" />{bleBusy ? "جارٍ الإرسال..." : "طباعة بلوتوث سريعة"}
                </Button>
              )}

              <p className="text-[11px] leading-5 text-slate-500">للغة العربية واللوجو والتنسيق الكامل استخدم زر الطباعة المصممة. الطباعة المباشرة عبر BLE مخصصة للطابعات المتوافقة مع النص المباشر.</p>
            </div>
          </aside>

          <main className="order-1 min-h-0 overflow-y-auto bg-slate-100 p-4 sm:p-7 lg:order-2">
            <div className={`mx-auto bg-white shadow-xl ${preferences.paperSize === "a4" ? "max-w-[820px] rounded-[28px] p-8 sm:p-12" : preferences.paperSize === "58mm" ? "max-w-[360px] rounded-2xl p-4" : "max-w-[470px] rounded-2xl p-5"}`}>
              <div className="border-b-2 border-[#005931] pb-4 text-center">
                {preferences.showLogo && logoUrl && <img src={logoUrl} alt={siteConfig.name} className="mx-auto mb-3 max-h-14 max-w-[65%] object-contain" />}
                <h2 className="text-xl font-black text-[#005931]">{siteConfig.name}</h2>
                <p className="mt-1 text-[11px] font-bold">مش مجرد ماركت</p>
                {siteConfig.address && <p className="mt-2 text-[11px] text-slate-500">{siteConfig.address}</p>}
                {siteConfig.phone && <p className="text-[11px] text-slate-500">هاتف: {siteConfig.phone}</p>}
              </div>

              <div className="flex items-start justify-between gap-4 border-b border-dashed py-4">
                <div><p className="text-[10px] text-slate-500">فاتورة مبيعات</p><p className="mt-1 font-black">#{sale.invoice_number}</p></div>
                <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">مدفوعة</Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 py-4 text-xs sm:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-2"><span className="block text-[9px] text-slate-500">التاريخ</span><strong>{formattedDate}</strong></div>
                <div className="rounded-xl bg-slate-50 p-2"><span className="block text-[9px] text-slate-500">الكاشير</span><strong>{sale.cashier_name || "—"}</strong></div>
                <div className="rounded-xl bg-slate-50 p-2 sm:col-span-2"><span className="block text-[9px] text-slate-500">الدفع</span><strong>{meta.paymentName}</strong></div>
              </div>

              {(sale.customer_name || sale.customer_phone) && <div className="mb-4 rounded-xl border bg-slate-50 p-3 text-xs"><span className="text-[9px] text-slate-500">العميل</span><p className="font-black">{sale.customer_name || "عميل عام"}</p>{sale.customer_phone && <p className="text-slate-500">{sale.customer_phone}</p>}</div>}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[340px] table-fixed text-xs">
                  <thead><tr className="border-b text-[10px] text-slate-500"><th className="w-[42%] py-2 text-right">الصنف</th><th className="py-2 text-center">الكمية</th><th className="py-2 text-center">السعر</th><th className="py-2 text-left">الإجمالي</th></tr></thead>
                  <tbody>{sale.items.map((item, index) => <tr key={`${item.product.id}-${index}`} className="border-b border-dashed"><td className="py-2.5 font-bold">{item.product.name}{item.product.barcode && <span className="mt-1 block text-[8px] font-normal text-slate-400">{item.product.barcode}</span>}</td><td className="py-2.5 text-center">{item.weight ? `${Number(item.weight).toLocaleString("ar-EG", { maximumFractionDigits: 3 })} كجم` : Number(item.quantity).toLocaleString("ar-EG")}</td><td className="py-2.5 text-center">{money(item.price)}</td><td className="py-2.5 text-left font-black">{money(item.total)}</td></tr>)}</tbody>
                </table>
              </div>

              <div className="mt-4 space-y-2 border-t-2 border-slate-900 pt-3 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">المجموع الفرعي</span><strong>{money(sale.subtotal)}</strong></div>
                {Number(sale.discount || 0) > 0 && <div className="flex justify-between text-emerald-700"><span>خصومات المنتجات</span><strong>- {money(sale.discount)}</strong></div>}
                {meta.loyalty > 0 && <div className="flex justify-between text-emerald-700"><span>كوبون/رصيد ولاء</span><strong>- {money(meta.loyalty)}</strong></div>}
                {meta.customerFee > 0 && <div className="flex justify-between text-amber-700"><span>رسوم وسيلة الدفع</span><strong>+ {money(meta.customerFee)}</strong></div>}
                <div className="mt-2 flex justify-between rounded-xl bg-[#005931] p-3 text-sm text-white"><span className="font-black">المدفوع فعليًا</span><strong>{money(meta.amountPaid)}</strong></div>
              </div>

              <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-xs">
                <div className="flex justify-between gap-3"><span className="text-slate-500">طريقة الدفع</span><strong>{meta.paymentName}</strong></div>
                {meta.extra.payment_reference && <div className="mt-2 flex justify-between gap-3"><span className="text-slate-500">مرجع العملية</span><strong className="break-all text-left">{meta.extra.payment_reference}</strong></div>}
              </div>

              {meta.returns.length > 0 && <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-3 text-center text-xs font-bold text-orange-800">تحتوي الفاتورة على {meta.returns.length.toLocaleString("ar-EG")} عملية مرتجع مسجلة.</div>}
              <div className="mt-6 border-t border-dashed pt-4 text-center"><p className="text-sm font-black text-[#005931]">{invoiceSettings.footer || "شكراً لزيارتكم!"}</p><p className="mt-1 text-[9px] text-slate-400">احتفظ بالفاتورة للرجوع إليها عند الحاجة</p></div>
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InvoiceDialog;
