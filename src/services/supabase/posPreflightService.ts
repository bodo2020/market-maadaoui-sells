import { supabase } from "@/integrations/supabase/client";
import type { CartItem } from "@/types";

export type PosPreflightResult = {
  ok: true;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  repriced: boolean;
  inventory_branch_id: string;
  pricing_branch_id: string;
  checked_at: string;
};

type PosPreflightFailure = {
  ok: false;
  code: string;
  product_id?: string;
  product_name?: string;
  available?: number;
  requested?: number;
  pack_size?: number;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

function failureMessage(result: PosPreflightFailure) {
  switch (result.code) {
    case "POS_SHIFT_REQUIRED":
      return "لا توجد وردية POS مفتوحة للكاشير الحالي.";
    case "PRODUCT_UNAVAILABLE":
      return `${result.product_name || "أحد المنتجات"}: المنتج لم يعد متاحًا في الفرع.`;
    case "INSUFFICIENT_STOCK":
      return `${result.product_name || "أحد المنتجات"}: المتاح الآن ${Number(result.available || 0)} والمطلوب ${Number(result.requested || 0)}.`;
    case "BULK_UNAVAILABLE":
      return `${result.product_name || "المنتج"}: إعداد الجملة لم يعد متاحًا.`;
    case "INVALID_BULK_QUANTITY":
      return `${result.product_name || "المنتج"}: كمية الجملة لازم تكون عبوة كاملة${result.pack_size ? ` (${result.pack_size} وحدة)` : ""}.`;
    case "INVALID_QUANTITY":
      return `${result.product_name || "المنتج"}: الكمية أو الوزن غير صحيح.`;
    default:
      return "تعذر مراجعة السلة قبل الدفع.";
  }
}

export async function preflightPosCart(branchId: string, items: CartItem[]): Promise<PosPreflightResult> {
  const { data, error } = await rpc("preflight_pos_sale", {
    p_branch_id: branchId,
    p_items: items,
  });

  if (error) {
    if (error.message?.includes("BRANCH_ACCESS_DENIED")) throw new Error("ليس لديك صلاحية البيع على الفرع الحالي.");
    if (error.message?.includes("INVALID_SALE")) throw new Error("السلة غير صالحة للدفع. راجع المنتجات والكميات.");
    throw new Error(error.message || "تعذر مراجعة السلة قبل الدفع.");
  }

  if (!data || typeof data !== "object") throw new Error("تعذر قراءة نتيجة مراجعة السلة.");
  const result = data as PosPreflightResult | PosPreflightFailure;
  if (!result.ok) throw new Error(failureMessage(result));
  if (!Array.isArray(result.items)) throw new Error("نتيجة مراجعة السلة غير مكتملة.");
  return result;
}
