import { useCallback, useEffect, useState } from "react";
import { Gift, ScanLine, Ticket, X } from "lucide-react";
import { useBranchStore } from "@/stores/branchStore";
import { useToast } from "@/hooks/use-toast";
import {
  isCustomerLoyaltyBarcode,
  isLoyaltyVoucherBarcode,
  lookupPOSLoyaltyCustomer,
  lookupPOSLoyaltyVoucher,
  type POSLoyaltyCustomer,
  type POSLoyaltyVoucher,
} from "@/services/supabase/loyaltyService";
import type { Sale } from "@/types";

const DEFAULT_TAB_ID = "tab-default";

function activeTabId() {
  return localStorage.getItem("pos_active_tab") || DEFAULT_TAB_ID;
}

export function posLoyaltyContextKey(branchId: string, tabId: string) {
  return `pos-loyalty-customer:${branchId}:${tabId}`;
}

export function posVoucherContextKey(branchId: string, tabId: string) {
  return `pos-loyalty-voucher:${branchId}:${tabId}`;
}

function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

export function readPOSLoyaltyCustomer(branchId: string, tabId = activeTabId()) {
  return readStored<POSLoyaltyCustomer>(posLoyaltyContextKey(branchId, tabId));
}

export function readPOSLoyaltyVoucher(branchId: string, tabId = activeTabId()) {
  return readStored<POSLoyaltyVoucher>(posVoucherContextKey(branchId, tabId));
}

function notifyVoucherChanged() {
  window.dispatchEvent(new CustomEvent("pos:loyalty-voucher-changed"));
}

export default function POSCustomerLoyaltyBridge() {
  const { currentBranchId } = useBranchStore();
  const { toast } = useToast();
  const [tabId, setTabId] = useState(() => activeTabId());
  const [customer, setCustomer] = useState<POSLoyaltyCustomer | null>(null);
  const [voucher, setVoucher] = useState<POSLoyaltyVoucher | null>(null);
  const [lastEarned, setLastEarned] = useState(0);
  const [modernCheckoutOpen, setModernCheckoutOpen] = useState(false);

  useEffect(() => {
    const refresh = () => {
      const nextTab = activeTabId();
      setTabId(previous => previous === nextTab ? previous : nextTab);
    };
    refresh();
    const timer = window.setInterval(refresh, 400);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onState = (event: Event) => setModernCheckoutOpen(Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open));
    window.addEventListener("pos:modern-checkout-state", onState as EventListener);
    return () => window.removeEventListener("pos:modern-checkout-state", onState as EventListener);
  }, []);

  useEffect(() => {
    if (!currentBranchId) {
      setCustomer(null);
      setVoucher(null);
      return;
    }
    setCustomer(readPOSLoyaltyCustomer(currentBranchId, tabId));
    setVoucher(readPOSLoyaltyVoucher(currentBranchId, tabId));
  }, [currentBranchId, tabId]);

  const clearVoucher = useCallback(() => {
    if (currentBranchId) {
      try { localStorage.removeItem(posVoucherContextKey(currentBranchId, tabId)); } catch { /* noop */ }
    }
    setVoucher(null);
    notifyVoucherChanged();
  }, [currentBranchId, tabId]);

  const clearCustomer = useCallback(() => {
    if (currentBranchId) {
      try {
        localStorage.removeItem(posLoyaltyContextKey(currentBranchId, tabId));
        localStorage.removeItem(posVoucherContextKey(currentBranchId, tabId));
      } catch { /* noop */ }
    }
    setCustomer(null);
    setVoucher(null);
    notifyVoucherChanged();
  }, [currentBranchId, tabId]);

  const linkCustomerBarcode = useCallback(async (barcode: string) => {
    if (!currentBranchId || !isCustomerLoyaltyBarcode(barcode)) return false;
    try {
      const linked = await lookupPOSLoyaltyCustomer(barcode, currentBranchId);
      if (!linked) {
        toast({ title: "باركود العميل غير معروف", description: "راجع بطاقة العميل وحاول مرة تانية.", variant: "destructive" });
        return true;
      }
      const currentTab = activeTabId();
      try {
        localStorage.setItem(posLoyaltyContextKey(currentBranchId, currentTab), JSON.stringify(linked));
        localStorage.removeItem(posVoucherContextKey(currentBranchId, currentTab));
      } catch { /* noop */ }
      setTabId(currentTab);
      setCustomer(linked);
      setVoucher(null);
      setLastEarned(0);
      notifyVoucherChanged();
      toast({ title: `تم ربط ${linked.name || "العميل"}`, description: `${Number(linked.points_balance || 0).toLocaleString("ar-EG")} نقطة · يقدر يحوّل نقاطه لكوبون خصم من التطبيق` });
      return true;
    } catch (error: any) {
      toast({ title: "تعذر ربط العميل", description: error?.message || "حاول مرة تانية.", variant: "destructive" });
      return true;
    }
  }, [currentBranchId, toast]);

  const linkVoucherBarcode = useCallback(async (barcode: string) => {
    if (!currentBranchId || !isLoyaltyVoucherBarcode(barcode)) return false;
    const currentTab = activeTabId();
    const linkedCustomer = readPOSLoyaltyCustomer(currentBranchId, currentTab);
    if (!linkedCustomer) {
      toast({ title: "امسح بطاقة العميل الأول", description: "لازم نربط العميل بالفاتورة قبل استخدام كوبون الخصم.", variant: "destructive" });
      return true;
    }
    try {
      const linkedVoucher = await lookupPOSLoyaltyVoucher(barcode, currentBranchId, linkedCustomer.customer_id);
      if (!linkedVoucher) {
        toast({ title: "كوبون الخصم غير موجود", variant: "destructive" });
        return true;
      }
      try { localStorage.setItem(posVoucherContextKey(currentBranchId, currentTab), JSON.stringify(linkedVoucher)); } catch { /* noop */ }
      setTabId(currentTab);
      setCustomer(linkedCustomer);
      setVoucher(linkedVoucher);
      notifyVoucherChanged();
      toast({ title: "تم إضافة كوبون الخصم للفاتورة", description: `${linkedVoucher.voucher_code} · متبقي ${Number(linkedVoucher.remaining_value_egp || 0).toFixed(2)} ج.م` });
      return true;
    } catch (error: any) {
      toast({ title: "تعذر استخدام كوبون الخصم", description: error?.message || "راجع الكوبون وحاول مرة تانية.", variant: "destructive" });
      return true;
    }
  }, [currentBranchId, toast]);

  const processLoyaltyBarcode = useCallback(async (barcode: string) => {
    if (isCustomerLoyaltyBarcode(barcode)) return linkCustomerBarcode(barcode);
    if (isLoyaltyVoucherBarcode(barcode)) return linkVoucherBarcode(barcode);
    return false;
  }, [linkCustomerBarcode, linkVoucherBarcode]);

  useEffect(() => {
    if (!currentBranchId) return;
    let buffer = "";
    let lastKeyAt = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.documentElement.dataset.posCheckoutScanTarget) return;
      if (event.key === "Enter") {
        const code = buffer.trim();
        buffer = "";
        if (isCustomerLoyaltyBarcode(code) || isLoyaltyVoucherBarcode(code)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          void processLoyaltyBarcode(code);
        }
        return;
      }
      if (/^[0-9]$/.test(event.key)) {
        const now = Date.now();
        if (now - lastKeyAt > 120) buffer = "";
        buffer += event.key;
        lastKeyAt = now;
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [currentBranchId, processLoyaltyBarcode]);

  useEffect(() => {
    const onCameraBarcode = (event: Event) => {
      if (document.documentElement.dataset.posCheckoutScanTarget) return;
      const custom = event as CustomEvent<{ barcode?: string }>;
      const barcode = custom.detail?.barcode?.trim() || "";
      if (!isCustomerLoyaltyBarcode(barcode) && !isLoyaltyVoucherBarcode(barcode)) return;
      custom.preventDefault();
      void processLoyaltyBarcode(barcode);
    };
    window.addEventListener("pos:camera-barcode", onCameraBarcode as EventListener);
    return () => window.removeEventListener("pos:camera-barcode", onCameraBarcode as EventListener);
  }, [processLoyaltyBarcode]);

  useEffect(() => {
    const onSaleCompleted = (event: Event) => {
      const sale = (event as CustomEvent<Sale>).detail;
      const earned = Number(sale?.loyalty_points_earned || 0);
      if (earned > 0) {
        setLastEarned(earned);
        toast({ title: `+ ${earned.toLocaleString("ar-EG")} نقطة ولاء`, description: "النقاط اتحسبت على صافي المنتجات بعد كوبون الخصم." });
      }
      if (currentBranchId) {
        try {
          localStorage.removeItem(posLoyaltyContextKey(currentBranchId, activeTabId()));
          localStorage.removeItem(posVoucherContextKey(currentBranchId, activeTabId()));
        } catch { /* noop */ }
      }
      setCustomer(null);
      setVoucher(null);
      notifyVoucherChanged();
    };
    window.addEventListener("pos:sale-completed", onSaleCompleted as EventListener);
    return () => window.removeEventListener("pos:sale-completed", onSaleCompleted as EventListener);
  }, [currentBranchId, toast]);

  if (!currentBranchId || modernCheckoutOpen) return null;

  if (!customer) {
    return (
      <div className="fixed bottom-20 left-4 z-[70] hidden items-center gap-2 rounded-2xl border bg-white/95 px-3 py-2 text-xs font-semibold text-slate-600 shadow-lg backdrop-blur sm:flex" dir="rtl">
        <ScanLine className="h-4 w-4 text-[#005931]" />
        {lastEarned > 0 ? `تمت إضافة ${lastEarned.toLocaleString("ar-EG")} نقطة` : "العميل وكوبون الخصم يتم ربطهم في إتمام البيع"}
      </div>
    );
  }

  return (
    <div className="fixed bottom-20 left-3 z-[70] w-[min(360px,calc(100vw-24px))] rounded-2xl border border-emerald-200 bg-white p-3 shadow-2xl" dir="rtl">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#005931]"><Gift className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1"><div className="text-[11px] font-semibold text-[#005931]">عميل الفاتورة</div><div className="truncate font-bold">{customer.name || "عميل المعداوي"}</div><div className="mt-0.5 text-[11px] text-slate-500">{customer.membership_number}</div></div>
        <button type="button" onClick={clearCustomer} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="إزالة العميل من الفاتورة"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[10px] text-slate-500">النقاط</div><div className="font-black text-[#005931]">{Number(customer.points_balance || 0).toLocaleString("ar-EG")}</div></div>
        <div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[10px] text-slate-500">قابل للتحويل</div><div className="font-black text-[#005931]">{Number(customer.redeemable_credit_egp || 0).toFixed(2)} ج.م</div></div>
      </div>
      {voucher ? (
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <Ticket className="h-5 w-5 shrink-0 text-[#005931]" />
          <div className="min-w-0 flex-1"><div className="truncate text-xs font-bold">{voucher.voucher_code}</div><div className="text-[11px] text-emerald-700">رصيد كوبون الخصم {Number(voucher.remaining_value_egp || 0).toFixed(2)} ج.م</div></div>
          <button type="button" onClick={clearVoucher} className="rounded-lg p-2 text-emerald-700 hover:bg-white" aria-label="إزالة كوبون الخصم"><X className="h-4 w-4" /></button>
        </div>
      ) : <div className="mt-2 rounded-xl border border-dashed px-3 py-2 text-center text-[11px] text-slate-500">كوبون الخصم يتم مسحه بعد تأكيد العميل داخل إتمام البيع</div>}
    </div>
  );
}
