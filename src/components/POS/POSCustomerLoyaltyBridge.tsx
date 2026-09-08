import { useCallback, useEffect, useState } from "react";
import { Gift, ScanLine, X } from "lucide-react";
import { useBranchStore } from "@/stores/branchStore";
import { useToast } from "@/hooks/use-toast";
import {
  isCustomerLoyaltyBarcode,
  lookupPOSLoyaltyCustomer,
  type POSLoyaltyCustomer,
} from "@/services/supabase/loyaltyService";
import type { Sale } from "@/types";

const DEFAULT_TAB_ID = "tab-default";

function activeTabId() {
  return localStorage.getItem("pos_active_tab") || DEFAULT_TAB_ID;
}

export function posLoyaltyContextKey(branchId: string, tabId: string) {
  return `pos-loyalty-customer:${branchId}:${tabId}`;
}

function readStored(branchId: string, tabId: string): POSLoyaltyCustomer | null {
  try {
    const raw = localStorage.getItem(posLoyaltyContextKey(branchId, tabId));
    return raw ? JSON.parse(raw) as POSLoyaltyCustomer : null;
  } catch {
    return null;
  }
}

export default function POSCustomerLoyaltyBridge() {
  const { currentBranchId } = useBranchStore();
  const { toast } = useToast();
  const [tabId, setTabId] = useState(() => activeTabId());
  const [customer, setCustomer] = useState<POSLoyaltyCustomer | null>(null);
  const [lastEarned, setLastEarned] = useState(0);

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
    if (!currentBranchId) {
      setCustomer(null);
      return;
    }
    setCustomer(readStored(currentBranchId, tabId));
  }, [currentBranchId, tabId]);

  const clearCustomer = useCallback(() => {
    if (currentBranchId) {
      try { localStorage.removeItem(posLoyaltyContextKey(currentBranchId, tabId)); } catch { /* noop */ }
    }
    setCustomer(null);
  }, [currentBranchId, tabId]);

  const linkBarcode = useCallback(async (barcode: string) => {
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
      } catch { /* server linkage still happens through checkout payload when available */ }
      setTabId(currentTab);
      setCustomer(linked);
      setLastEarned(0);
      toast({
        title: `تم ربط ${linked.name || "العميل"}`,
        description: `${Number(linked.points_balance || 0).toLocaleString("ar-EG")} نقطة · رصيد ${Number(linked.redeemable_credit_egp || 0).toFixed(2)} ج.م`,
      });
      return true;
    } catch (error: any) {
      toast({ title: "تعذر ربط العميل", description: error?.message || "حاول مرة تانية.", variant: "destructive" });
      return true;
    }
  }, [currentBranchId, toast]);

  useEffect(() => {
    if (!currentBranchId) return;
    let buffer = "";
    let lastKeyAt = 0;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        const code = buffer.trim();
        buffer = "";
        if (isCustomerLoyaltyBarcode(code)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          void linkBarcode(code);
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
  }, [currentBranchId, linkBarcode]);

  useEffect(() => {
    const onCameraBarcode = (event: Event) => {
      const custom = event as CustomEvent<{ barcode?: string }>;
      const barcode = custom.detail?.barcode?.trim() || "";
      if (!isCustomerLoyaltyBarcode(barcode)) return;
      custom.preventDefault();
      void linkBarcode(barcode);
    };
    window.addEventListener("pos:camera-barcode", onCameraBarcode as EventListener);
    return () => window.removeEventListener("pos:camera-barcode", onCameraBarcode as EventListener);
  }, [linkBarcode]);

  useEffect(() => {
    const onSaleCompleted = (event: Event) => {
      const sale = (event as CustomEvent<Sale>).detail;
      const earned = Number(sale?.loyalty_points_earned || 0);
      if (earned > 0) {
        setLastEarned(earned);
        toast({ title: `+ ${earned.toLocaleString("ar-EG")} نقطة ولاء`, description: "تمت إضافة النقاط لحساب العميل مع الفاتورة." });
      }
      if (currentBranchId) {
        try { localStorage.removeItem(posLoyaltyContextKey(currentBranchId, activeTabId())); } catch { /* noop */ }
      }
      setCustomer(null);
    };
    window.addEventListener("pos:sale-completed", onSaleCompleted as EventListener);
    return () => window.removeEventListener("pos:sale-completed", onSaleCompleted as EventListener);
  }, [currentBranchId, toast]);

  if (!currentBranchId) return null;

  if (!customer) {
    return (
      <div className="fixed bottom-20 left-4 z-[70] hidden items-center gap-2 rounded-2xl border bg-white/95 px-3 py-2 text-xs font-semibold text-slate-600 shadow-lg backdrop-blur sm:flex" dir="rtl">
        <ScanLine className="h-4 w-4 text-[#005931]" />
        {lastEarned > 0 ? `تمت إضافة ${lastEarned.toLocaleString("ar-EG")} نقطة` : "امسح باركود العميل لربطه بالفاتورة"}
      </div>
    );
  }

  return (
    <div className="fixed bottom-20 left-3 z-[70] w-[min(340px,calc(100vw-24px))] rounded-2xl border border-emerald-200 bg-white p-3 shadow-2xl" dir="rtl">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#005931]"><Gift className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold text-[#005931]">عميل الفاتورة</div>
          <div className="truncate font-bold">{customer.name || "عميل المعداوي"}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">{customer.membership_number}</div>
        </div>
        <button type="button" onClick={clearCustomer} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="إزالة العميل من الفاتورة"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[10px] text-slate-500">النقاط</div><div className="font-black text-[#005931]">{Number(customer.points_balance || 0).toLocaleString("ar-EG")}</div></div>
        <div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[10px] text-slate-500">الرصيد المتاح</div><div className="font-black text-[#005931]">{Number(customer.redeemable_credit_egp || 0).toFixed(2)} ج.م</div></div>
      </div>
    </div>
  );
}
