import { siteConfig } from "@/config/site";
import type { Sale } from "@/types";

export function buildCustomerInvoiceText(sale: Sale, footer?: string) {
  const extra = sale as Sale & Record<string, any>;
  const currency = siteConfig.currency || "ج.م";
  const date = new Date(sale.date);
  const loyalty = Number(extra.loyalty_voucher_amount || 0);
  const customerFee = Number(extra.customer_payment_fee_amount || 0);
  const amountPaid = Math.max(0, Number(extra.amount_charged ?? extra.amount_due ?? (Number(sale.total || 0) - loyalty + customerFee)));
  const paymentName = String(extra.payment_method_name || (sale.payment_method === "cash" ? "نقدي" : sale.payment_method === "card" ? "بطاقة بنكية" : "دفع مختلط"));
  const paymentBreakdown = Array.isArray(extra.payment_breakdown) ? extra.payment_breakdown : [];
  const lines: string[] = [];

  lines.push("================================");
  lines.push(`        ${siteConfig.name}`);
  lines.push("          مش مجرد ماركت");
  if (siteConfig.address) lines.push(`    ${siteConfig.address}`);
  if (siteConfig.phone) lines.push(`    هاتف: ${siteConfig.phone}`);
  lines.push("================================");
  lines.push(`فاتورة مبيعات: ${sale.invoice_number}`);
  lines.push(`التاريخ: ${date.toLocaleDateString("ar-EG")}`);
  lines.push(`الوقت: ${date.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}`);
  if (sale.cashier_name) lines.push(`الكاشير: ${sale.cashier_name}`);
  if (sale.customer_name) lines.push(`العميل: ${sale.customer_name}`);
  if (sale.customer_phone) lines.push(`الهاتف: ${sale.customer_phone}`);
  lines.push("--------------------------------");

  sale.items.forEach((item) => {
    const qty = item.weight
      ? `${Number(item.weight).toLocaleString("ar-EG", { maximumFractionDigits: 3 })} كجم`
      : Number(item.quantity || 0).toLocaleString("ar-EG", { maximumFractionDigits: 3 });
    lines.push(item.product.name);
    lines.push(`  ${qty} × ${Number(item.price || 0).toFixed(2)} = ${Number(item.total || 0).toFixed(2)} ${currency}`);
  });

  lines.push("--------------------------------");
  lines.push(`المجموع الفرعي: ${Number(sale.subtotal || 0).toFixed(2)} ${currency}`);
  if (Number(sale.discount || 0) > 0) lines.push(`خصومات المنتجات: -${Number(sale.discount).toFixed(2)} ${currency}`);
  if (loyalty > 0) lines.push(`كوبون/رصيد ولاء: -${loyalty.toFixed(2)} ${currency}`);
  if (customerFee > 0) lines.push(`رسوم وسائل الدفع: +${customerFee.toFixed(2)} ${currency}`);
  lines.push(`المدفوع فعليًا: ${amountPaid.toFixed(2)} ${currency}`);
  lines.push("");
  lines.push(`طريقة الدفع: ${paymentName}`);

  if (paymentBreakdown.length > 1) {
    lines.push("--------------------------------");
    lines.push("تفاصيل الدفع:");
    paymentBreakdown.forEach((part: any) => {
      const name = String(part.name || "وسيلة دفع");
      const charged = Number(part.charged_amount ?? part.base_amount ?? 0);
      lines.push(`${name}: ${charged.toFixed(2)} ${currency}`);
      if (part.reference) lines.push(`  مرجع: ${String(part.reference)}`);
      const partCustomerFee = Number(part.customer_fee_amount || 0);
      if (partCustomerFee > 0) lines.push(`  رسوم على العميل: ${partCustomerFee.toFixed(2)} ${currency}`);
    });
  } else {
    if (extra.payment_reference) lines.push(`مرجع العملية: ${extra.payment_reference}`);
    if (Number(extra.cash_amount || 0) > 0 && sale.payment_method === "mixed") lines.push(`نقدي: ${Number(extra.cash_amount).toFixed(2)} ${currency}`);
    if (Number(extra.card_amount || 0) > 0 && sale.payment_method === "mixed") lines.push(`إلكتروني: ${Number(extra.card_amount).toFixed(2)} ${currency}`);
  }

  if (Array.isArray(extra.invoice_returns) && extra.invoice_returns.length > 0) lines.push(`تنبيه: توجد ${extra.invoice_returns.length} عملية مرتجع مرتبطة بالفاتورة.`);
  lines.push("");
  lines.push("================================");
  lines.push(`       ${footer || siteConfig.invoice.footer || "شكراً لزيارتكم!"}`);
  lines.push("================================");

  return `${lines.join("\n")}\n`;
}
