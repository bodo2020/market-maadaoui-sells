import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Printer, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { siteConfig } from "@/config/site";
import { fetchStoreSettings } from "@/services/supabase/storeService";
import { bluetoothPrinterService } from "@/services/bluetoothPrinterService";
import { fetchOnlineOrderFinalReceipt, type OnlineOrderFinalReceipt, type OnlineOrderReceiptLine } from "@/services/supabase/onlineOrderReceiptService";
import type { Order } from "@/types";

type Props = { isOpen: boolean; onClose: () => void; order: Order | null };

const money = (value?: number | null) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const qty = (value?: number | null) => Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 3 });
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch] || ch));

const lineLabel = (line: OnlineOrderReceiptLine) => {
  if (line.kind === "substitution") return "بديل معتمد";
  if (line.kind === "shortage") return "غير متوفر";
  if (line.kind === "picked") return "تم التجهيز";
  if (line.kind === "pending") return "لم يُحسم بعد";
  return "مطلوب";
};

const adjustmentLabel = (state: string) => {
  if (state === "settled") return "تمت التسوية";
  if (state === "applied_to_order_total") return "طُبق على الإجمالي";
  if (state === "pending_collection") return "بانتظار تحصيل";
  if (state === "pending_refund") return "بانتظار رد";
  if (state === "not_required") return "بدون فرق مالي";
  return state;
};

function customerValue(receipt: OnlineOrderFinalReceipt | undefined, key: string, fallback?: string | null) {
  const value = receipt?.customer_snapshot?.[key];
  return typeof value === "string" && value.trim() ? value : fallback || "";
}

function generateText(receipt: OnlineOrderFinalReceipt, order: Order, store: any) {
  const finalState = receipt.is_final_fulfillment && !receipt.has_pending_finance ? "إيصال نهائي" : "مسودة تشغيلية";
  const lines = [
    store?.name || siteConfig.name,
    finalState,
    "================================",
    `طلب: #${receipt.tracking_number || receipt.order_id.slice(0, 8)}`,
    `الفرع: ${receipt.branch_name || "—"}`,
    `العميل: ${customerValue(receipt, "name", order.customer_name) || "غير مسجل"}`,
    "================================",
  ];
  receipt.items.forEach(item => {
    const prefix = item.kind === "substitution" ? "[بديل] " : item.kind === "shortage" ? "[ناقص] " : item.kind === "pending" ? "[معلق] " : "";
    lines.push(`${prefix}${item.product_name}`);
    if (item.kind === "shortage") lines.push(`  ${qty(item.quantity)} × ${money(item.unit_price)} = غير محتسب`);
    else lines.push(`  ${qty(item.quantity)} × ${money(item.unit_price)} = ${money(item.line_total)}`);
    if (item.substituted_from) lines.push(`  بديل عن: ${item.substituted_from}`);
  });
  lines.push("================================");
  if (receipt.shipping_cost) lines.push(`التوصيل: ${money(receipt.shipping_cost)}`);
  if (receipt.loyalty_voucher_amount) lines.push(`خصم الولاء: -${money(receipt.loyalty_voucher_amount)}`);
  lines.push(`الإجمالي الحالي: ${money(receipt.current_total)}`);
  if (receipt.has_pending_finance) {
    lines.push(`تسويات معلقة: ${receipt.pending_financial_delta > 0 ? "+" : ""}${money(receipt.pending_financial_delta)}`);
    lines.push(`الإجمالي بعد التسوية: ${money(receipt.projected_total)}`);
  }
  lines.push(`الدفع: ${receipt.payment_method || "—"} / ${receipt.payment_status}`);
  lines.push("================================");
  if (!receipt.is_final_fulfillment) lines.push("تنبيه: التجهيز لم يُحسم بالكامل بعد.");
  if (receipt.has_pending_finance) lines.push("تنبيه: توجد تسوية مالية معلقة.");
  lines.push("", "", "");
  return lines.join("\n");
}

function generateHtml(receipt: OnlineOrderFinalReceipt, order: Order, store: any) {
  const isFinal = receipt.is_final_fulfillment && !receipt.has_pending_finance;
  const rows = receipt.items.map(item => `
    <tr class="${item.kind}">
      <td><strong>${escapeHtml(item.product_name)}</strong>${item.substituted_from ? `<small>بديل عن: ${escapeHtml(item.substituted_from)}</small>` : ""}<span class="tag">${escapeHtml(lineLabel(item))}</span></td>
      <td>${escapeHtml(qty(item.quantity))}</td>
      <td>${escapeHtml(money(item.unit_price))}</td>
      <td>${item.kind === "shortage" ? `<span class="muted">غير محتسب</span>` : escapeHtml(money(item.line_total))}</td>
    </tr>`).join("");
  const adjustments = receipt.financial_adjustments.length ? `
    <section class="adjustments"><h3>التسويات المالية</h3>${receipt.financial_adjustments.map(adj => `<div><span>${adj.kind === "substitution" ? "فرق بديل" : "نقص صنف"} · ${escapeHtml(adjustmentLabel(adj.settlement_state))}</span><strong class="${adj.signed_amount < 0 ? "minus" : "plus"}">${adj.signed_amount > 0 ? "+" : ""}${escapeHtml(money(adj.signed_amount))}</strong></div>`).join("")}</section>` : "";
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>إيصال الطلب ${escapeHtml(receipt.tracking_number || receipt.order_id.slice(0, 8))}</title><style>
    *{box-sizing:border-box}body{font-family:Cairo,Tahoma,Arial,sans-serif;margin:0;background:#fff;color:#15231d}.page{max-width:820px;margin:auto;padding:28px}.head{text-align:center;border-bottom:3px solid #005931;padding-bottom:18px}.head h1{margin:4px 0;color:#005931}.state{display:inline-block;margin-top:8px;padding:5px 12px;border-radius:99px;font-weight:700;background:${isFinal ? "#dcfce7" : "#fef3c7"};color:${isFinal ? "#166534" : "#92400e"}}.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:20px 0}.box{border:1px solid #e2e8f0;border-radius:12px;padding:10px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right}th{background:#f8fafc}.tag{display:inline-block;font-size:10px;margin-right:8px;padding:2px 7px;border-radius:10px;background:#eef2f7;color:#475569}small{display:block;color:#64748b;margin-top:3px}.shortage{background:#fff7ed}.substitution{background:#f0fdf4}.pending{background:#fffbeb}.muted{color:#94a3b8}.summary{margin-top:20px;margin-right:auto;max-width:380px}.summary div,.adjustments div{display:flex;justify-content:space-between;gap:20px;padding:7px 0}.total{border-top:2px solid #005931;margin-top:8px;padding-top:12px!important;font-size:20px;color:#005931}.projected{font-weight:800}.warning{margin-top:16px;border:1px solid #f59e0b;background:#fffbeb;padding:12px;border-radius:12px;color:#92400e}.adjustments{margin-top:20px;border-top:1px dashed #cbd5e1;padding-top:14px}.adjustments h3{margin:0 0 8px}.minus{color:#047857}.plus{color:#b45309}.foot{text-align:center;color:#64748b;margin-top:28px;border-top:1px solid #e5e7eb;padding-top:15px}@media print{.page{padding:0}.no-print{display:none}}
  </style></head><body><main class="page"><header class="head"><h1>${escapeHtml(store?.name || siteConfig.name)}</h1>${store?.address ? `<div>${escapeHtml(store.address)}</div>` : ""}<div class="state">${isFinal ? "إيصال نهائي" : "مسودة تشغيلية - غير نهائية"}</div></header><section class="meta"><div class="box"><strong>رقم الطلب</strong><br>#${escapeHtml(receipt.tracking_number || receipt.order_id.slice(0, 8))}<br><small>${escapeHtml(new Date(receipt.created_at).toLocaleString("ar-EG"))}</small></div><div class="box"><strong>الفرع</strong><br>${escapeHtml(receipt.branch_name || "—")}<br><small>الدفع: ${escapeHtml(receipt.payment_method || "—")} · ${escapeHtml(receipt.payment_status)}</small></div><div class="box"><strong>العميل</strong><br>${escapeHtml(customerValue(receipt, "name", order.customer_name) || "غير مسجل")}<br><small>${escapeHtml(customerValue(receipt, "phone", order.customer_phone))}</small></div><div class="box"><strong>التوصيل</strong><br>${escapeHtml(receipt.shipping_address || order.shipping_address || "—")}</div></section><table><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>القيمة</th></tr></thead><tbody>${rows}</tbody></table>${adjustments}<section class="summary">${receipt.shipping_cost ? `<div><span>التوصيل</span><strong>${escapeHtml(money(receipt.shipping_cost))}</strong></div>` : ""}${receipt.loyalty_voucher_amount ? `<div><span>خصم الولاء</span><strong>-${escapeHtml(money(receipt.loyalty_voucher_amount))}</strong></div>` : ""}<div class="total"><span>الإجمالي الحالي</span><strong>${escapeHtml(money(receipt.current_total))}</strong></div>${receipt.has_pending_finance ? `<div><span>تسويات معلقة</span><strong>${receipt.pending_financial_delta > 0 ? "+" : ""}${escapeHtml(money(receipt.pending_financial_delta))}</strong></div><div class="projected"><span>الإجمالي بعد التسوية</span><strong>${escapeHtml(money(receipt.projected_total))}</strong></div>` : ""}</section>${!isFinal ? `<div class="warning">${!receipt.is_final_fulfillment ? "التجهيز لم يُحسم بالكامل. " : ""}${receipt.has_pending_finance ? "توجد تحصيلات/مبالغ مرتجعة لم تُسوَّ بعد." : ""}</div>` : ""}<footer class="foot">مش مجرد ماركت · تم إنشاء الإيصال ${escapeHtml(new Date(receipt.generated_at).toLocaleString("ar-EG"))}</footer></main></body></html>`;
}

export default function OnlineOrderFinalReceiptDialog({ isOpen, onClose, order }: Props) {
  const [store, setStore] = useState<any>(null);
  const receiptQuery = useQuery({
    queryKey: ["online-order-final-receipt-v1", order?.id],
    enabled: isOpen && Boolean(order?.id),
    queryFn: () => fetchOnlineOrderFinalReceipt(order!.id),
    staleTime: 0,
  });

  useEffect(() => {
    if (!isOpen) return;
    void fetchStoreSettings().then(setStore).catch(() => setStore(null));
  }, [isOpen]);

  const receipt = receiptQuery.data;
  const isFinal = Boolean(receipt?.is_final_fulfillment && !receipt?.has_pending_finance);
  const billedLines = useMemo(() => receipt?.items.filter(item => item.kind !== "shortage") || [], [receipt?.items]);

  const handlePrint = async () => {
    if (!receipt || !order) return;
    if (bluetoothPrinterService.isConnected()) {
      try {
        if (await bluetoothPrinterService.printText(generateText(receipt, order, store))) {
          toast.success("تمت طباعة إيصال الطلب عبر Bluetooth");
          return;
        }
      } catch (error) {
        console.error("Bluetooth receipt print failed", error);
      }
    }
    const win = window.open("", "_blank");
    if (!win) return toast.error("تعذر فتح نافذة الطباعة.");
    win.document.write(generateHtml(receipt, order, store));
    win.document.close();
    win.onload = () => { win.focus(); win.print(); };
  };

  return <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
    <DialogContent dir="rtl" className="max-h-[92vh] max-w-4xl overflow-y-auto">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-[#005931]" />إيصال الطلب الإلكتروني</DialogTitle></DialogHeader>
      {receiptQuery.isLoading ? <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#005931]" /></div> : receiptQuery.isError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">{receiptQuery.error instanceof Error ? receiptQuery.error.message : "تعذر تحميل الإيصال."}</div> : receipt ? <div className="space-y-5">
        <div className={`rounded-2xl border p-4 ${isFinal ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2">{isFinal ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : <AlertTriangle className="h-5 w-5 text-amber-700" />}<strong>{isFinal ? "الإيصال نهائي ماليًا وتشغيليًا" : "مسودة تشغيلية - لا تعتبر تسوية نهائية"}</strong></div><Badge variant="outline">#{receipt.tracking_number || receipt.order_id.slice(0, 8)}</Badge></div>
          {!receipt.is_final_fulfillment && <p className="mt-2 text-sm">ما زال هناك {qty(receipt.unresolved_quantity_total)} من الكميات غير محسوم داخل التجهيز.</p>}
          {receipt.has_pending_finance && <p className="mt-1 text-sm">توجد تسويات مالية معلقة بقيمة صافية {receipt.pending_financial_delta > 0 ? "+" : ""}{money(receipt.pending_financial_delta)}.</p>}
        </div>
        <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border bg-slate-50 p-4"><div className="text-xs text-muted-foreground">الفرع</div><strong>{receipt.branch_name || "—"}</strong></div><div className="rounded-2xl border bg-slate-50 p-4"><div className="text-xs text-muted-foreground">وسيلة الدفع</div><strong>{receipt.payment_method || "—"} · {receipt.payment_status}</strong></div><div className="rounded-2xl border bg-slate-50 p-4"><div className="text-xs text-muted-foreground">السطور المحتسبة حاليًا</div><strong>{billedLines.length.toLocaleString("ar-EG")}</strong></div></div>
        <div className="overflow-x-auto rounded-2xl border"><table className="w-full min-w-[680px] text-sm"><thead className="bg-slate-50"><tr><th className="p-3 text-right">الصنف</th><th className="p-3 text-right">الحالة</th><th className="p-3 text-right">الكمية</th><th className="p-3 text-right">السعر</th><th className="p-3 text-right">القيمة</th></tr></thead><tbody>{receipt.items.map((line, index) => <tr key={`${line.line_no}-${line.kind}-${index}`} className="border-t"><td className="p-3"><strong>{line.product_name}</strong>{line.substituted_from && <div className="text-xs text-muted-foreground">بديل عن: {line.substituted_from}</div>}</td><td className="p-3"><Badge variant="outline" className={line.kind === "substitution" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : line.kind === "shortage" ? "border-orange-200 bg-orange-50 text-orange-800" : line.kind === "pending" ? "border-amber-200 bg-amber-50 text-amber-800" : ""}>{lineLabel(line)}</Badge></td><td className="p-3">{qty(line.quantity)}</td><td className="p-3">{money(line.unit_price)}</td><td className="p-3 font-bold">{line.kind === "shortage" ? <span className="text-muted-foreground">غير محتسب</span> : money(line.line_total)}</td></tr>)}</tbody></table></div>
        {receipt.financial_adjustments.length > 0 && <div className="rounded-2xl border p-4"><h3 className="font-black">التسويات المالية</h3><div className="mt-3 space-y-2">{receipt.financial_adjustments.map(adj => <div key={adj.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3"><div><strong>{adj.kind === "substitution" ? "فرق بديل" : "قيمة صنف ناقص"}</strong><div className="text-xs text-muted-foreground">{adjustmentLabel(adj.settlement_state)}{adj.provider_reference ? ` · مرجع ${adj.provider_reference}` : ""}</div></div><strong className={adj.signed_amount < 0 ? "text-emerald-700" : "text-amber-700"}>{adj.signed_amount > 0 ? "+" : ""}{money(adj.signed_amount)}</strong></div>)}</div></div>}
        <div className="mr-auto w-full max-w-md space-y-2 rounded-2xl border p-4"><div className="flex justify-between"><span>التوصيل</span><strong>{money(receipt.shipping_cost)}</strong></div>{receipt.loyalty_voucher_amount > 0 && <div className="flex justify-between"><span>خصم الولاء</span><strong>-{money(receipt.loyalty_voucher_amount)}</strong></div>}<div className="flex justify-between border-t pt-3 text-lg"><span>الإجمالي الحالي</span><strong className="text-[#005931]">{money(receipt.current_total)}</strong></div>{receipt.has_pending_finance && <><div className="flex justify-between"><span>صافي التسويات المعلقة</span><strong>{receipt.pending_financial_delta > 0 ? "+" : ""}{money(receipt.pending_financial_delta)}</strong></div><div className="flex justify-between text-lg font-black"><span>بعد التسويات</span><strong>{money(receipt.projected_total)}</strong></div></>}</div>
      </div> : null}
      <DialogFooter className="gap-2 sm:justify-start"><Button variant="outline" onClick={onClose}>إغلاق</Button><Button onClick={() => void handlePrint()} disabled={!receipt || receiptQuery.isLoading}><Printer className="ml-2 h-4 w-4" />{isFinal ? "طباعة الإيصال النهائي" : "طباعة المسودة"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
