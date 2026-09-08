import { supabase } from "@/integrations/supabase/client";
import type { CartItem, Sale } from "@/types";

export interface PosInvoiceListItem {
  invoice_id: string;
  sale_id: string;
  invoice_number: string;
  sale_date: string;
  cashier_id?: string | null;
  cashier_name?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  subtotal: number;
  discount: number;
  total: number;
  loyalty_voucher_amount: number;
  amount_charged: number;
  payment_method: string;
  payment_method_id?: string | null;
  payment_method_code?: string | null;
  payment_method_name?: string | null;
  payment_method_type?: string | null;
  payment_fee_amount: number;
  customer_payment_fee_amount: number;
  merchant_payment_fee_amount: number;
  payment_reference?: string | null;
  item_count: number;
  returned_amount: number;
  return_count: number;
  pending_refund_count: number;
}

function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeListRow(row: any): PosInvoiceListItem {
  return {
    ...row,
    subtotal: num(row?.subtotal),
    discount: num(row?.discount),
    total: num(row?.total),
    loyalty_voucher_amount: num(row?.loyalty_voucher_amount),
    amount_charged: num(row?.amount_charged),
    payment_fee_amount: num(row?.payment_fee_amount),
    customer_payment_fee_amount: num(row?.customer_payment_fee_amount),
    merchant_payment_fee_amount: num(row?.merchant_payment_fee_amount),
    item_count: num(row?.item_count),
    returned_amount: num(row?.returned_amount),
    return_count: num(row?.return_count),
    pending_refund_count: num(row?.pending_refund_count),
  };
}

export async function listPosInvoicesV2(branchId: string, search = "", limit = 30): Promise<PosInvoiceListItem[]> {
  const { data, error } = await (supabase as any).rpc("list_pos_invoices_v2", {
    p_branch_id: branchId,
    p_limit: limit,
    p_search: search.trim() || null,
  });

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return rows.map(normalizeListRow);
}

export async function getPosInvoiceSale(saleId: string): Promise<Sale> {
  const { data, error } = await (supabase as any).rpc("get_pos_invoice_snapshot", {
    p_sale_id: saleId,
  });

  if (error) throw error;
  const payload = data || {};
  const invoice = payload.invoice || {};
  const rawItems = Array.isArray(payload.items) ? payload.items : [];

  if (!invoice?.sale_id) throw new Error("تعذر تحميل نسخة الفاتورة المحفوظة.");

  const items: CartItem[] = rawItems.map((line: any) => ({
    product: {
      id: line.product_id || `invoice-${line.id}`,
      name: line.product_name || "صنف",
      barcode: line.barcode || null,
      image_urls: [],
      quantity: 0,
      price: num(line.unit_price),
      purchase_price: num(line.purchase_price),
      is_offer: false,
      bulk_enabled: line.sale_mode === "bulk",
      bulk_quantity: null,
      bulk_price: null,
      bulk_barcode: null,
      created_at: invoice.sale_date,
      is_bulk: line.sale_mode === "bulk",
      unit_of_measure: line.unit_of_measure || null,
      base_unit: line.unit_of_measure || null,
    } as any,
    quantity: num(line.quantity),
    weight: line.weight == null ? null : num(line.weight),
    price: num(line.unit_price),
    discount: num(line.discount),
    total: num(line.line_total),
    isBulk: line.sale_mode === "bulk",
  }));

  const legacyPaymentMethod: Sale["payment_method"] =
    invoice.payment_method === "cash"
      ? "cash"
      : invoice.payment_method === "mixed"
        ? "mixed"
        : "card";

  return {
    id: invoice.sale_id,
    invoice_number: invoice.invoice_number,
    date: invoice.sale_date,
    customer_id: invoice.customer_id || null,
    customer_name: invoice.customer_name || undefined,
    customer_phone: invoice.customer_phone || undefined,
    source_channel: invoice.source_channel || "store",
    loyalty_points_earned: num(invoice.loyalty_points_earned),
    loyalty_voucher_id: invoice.loyalty_voucher_id || null,
    loyalty_voucher_amount: num(invoice.loyalty_voucher_amount),
    amount_due: num(invoice.amount_charged),
    payment_method: legacyPaymentMethod,
    total: num(invoice.total),
    subtotal: num(invoice.subtotal),
    discount: num(invoice.discount),
    items,
    cashier_id: invoice.cashier_id || undefined,
    cashier_name: invoice.cashier_name || undefined,
    branch_id: invoice.branch_id || undefined,
    created_at: invoice.snapshot_created_at || invoice.sale_date,
    updated_at: invoice.snapshot_created_at || invoice.sale_date,
    cash_amount: num(invoice.cash_amount),
    card_amount: num(invoice.card_amount),
    profit: num(invoice.profit),
    payment_method_id: invoice.payment_method_id,
    payment_method_code: invoice.payment_method_code,
    payment_method_name: invoice.payment_method_name,
    payment_method_type: invoice.payment_method_type,
    payment_fee_amount: num(invoice.payment_fee_amount),
    payment_fee_bearer: invoice.payment_fee_bearer,
    customer_payment_fee_amount: num(invoice.customer_payment_fee_amount),
    merchant_payment_fee_amount: num(invoice.merchant_payment_fee_amount),
    amount_charged: num(invoice.amount_charged),
    digital_wallet_amount: num(invoice.digital_wallet_amount),
    net_profit_after_payment_fee: num(invoice.net_profit_after_payment_fee),
    payment_reference: invoice.payment_reference,
    invoice_returns: Array.isArray(payload.returns) ? payload.returns : [],
  } as Sale;
}
