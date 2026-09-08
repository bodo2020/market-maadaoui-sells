import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import type { Sale } from "@/types";
import type { POSLoyaltyCustomer, POSLoyaltyVoucher } from "@/services/supabase/loyaltyService";

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

/**
 * Loyalty scanning now lives exclusively inside POSCheckoutModernDialog.
 * This runtime component only keeps the post-sale loyalty toast so the
 * product barcode reader can never compete with customer/coupon barcodes.
 */
export default function POSCustomerLoyaltyBridge() {
  const { toast } = useToast();

  useEffect(() => {
    const onSaleCompleted = (event: Event) => {
      const sale = (event as CustomEvent<Sale>).detail;
      const earned = Number(sale?.loyalty_points_earned || 0);
      if (earned > 0) {
        toast({
          title: `+ ${earned.toLocaleString("ar-EG")} نقطة ولاء`,
          description: "النقاط اتحسبت على صافي المنتجات بعد كوبون الخصم.",
        });
      }
    };
    window.addEventListener("pos:sale-completed", onSaleCompleted as EventListener);
    return () => window.removeEventListener("pos:sale-completed", onSaleCompleted as EventListener);
  }, [toast]);

  return null;
}
