import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { format } from "date-fns";
import { fetchReportingOverviewV2 } from "@/services/supabase/reportingV2Service";
import { fetchReportingSalesV2 } from "@/services/supabase/reportingSalesV2Service";
import { fetchReportingPaymentsV2 } from "@/services/supabase/reportingPaymentsV2Service";
import { fetchReportingReturnsV2 } from "@/services/supabase/reportingReturnsV2Service";
import { fetchReportingInventoryV2 } from "@/services/supabase/reportingInventoryV2Service";
import { fetchReportingShiftsV2 } from "@/services/supabase/reportingShiftsV2Service";
import { fetchReportingOnlineV2 } from "@/services/supabase/reportingOnlineV2Service";
import { fetchReportingCustomersV2 } from "@/services/supabase/reportingCustomersV2Service";
import { fetchReportingCostsV2 } from "@/services/supabase/reportingCostsV2Service";
import { fetchReportingInsightsV2 } from "@/services/supabase/reportingInsightsV2Service";

export type ReportingExportDataset = "overview" | "sales" | "payments" | "returns" | "inventory" | "shifts" | "online" | "customers" | "costs" | "insights";

export const REPORTING_EXPORT_DATASETS: Array<{ value: ReportingExportDataset; label: string }> = [
  { value: "overview", label: "الملخص التنفيذي" },
  { value: "sales", label: "المبيعات" },
  { value: "payments", label: "وسائل الدفع" },
  { value: "returns", label: "المرتجعات" },
  { value: "inventory", label: "المخزون" },
  { value: "shifts", label: "الكاشير والورديات" },
  { value: "online", label: "طلبات الأونلاين" },
  { value: "customers", label: "العملاء" },
  { value: "costs", label: "المصروفات والموردون" },
  { value: "insights", label: "الإشارات الذكية" },
];

export interface ReportingExportBundleV2 {
  branchId: string;
  branchName: string;
  from: Date;
  to: Date;
  generatedAt: Date;
  overview: Awaited<ReturnType<typeof fetchReportingOverviewV2>>;
  sales: Awaited<ReturnType<typeof fetchReportingSalesV2>>;
  payments: Awaited<ReturnType<typeof fetchReportingPaymentsV2>>;
  returns: Awaited<ReturnType<typeof fetchReportingReturnsV2>>;
  inventory: Awaited<ReturnType<typeof fetchReportingInventoryV2>>;
  shifts: Awaited<ReturnType<typeof fetchReportingShiftsV2>>;
  online: Awaited<ReturnType<typeof fetchReportingOnlineV2>>;
  customers: Awaited<ReturnType<typeof fetchReportingCustomersV2>>;
  costs: Awaited<ReturnType<typeof fetchReportingCostsV2>>;
  insights: Awaited<ReturnType<typeof fetchReportingInsightsV2>>;
}

const fieldLabels: Record<string, string> = {
  transactions: "عدد المعاملات", pos_transactions: "معاملات POS", online_transactions: "طلبات أونلاين",
  gross_sales: "إجمالي المبيعات", net_sales: "صافي المبيعات", average_ticket: "متوسط الفاتورة", returns: "المرتجعات",
  return_count: "عدد المرتجعات", pos_gross_profit: "مجمل ربح POS", known_operating_result: "النتيجة التشغيلية المعروفة",
  gross_collected: "إجمالي المحصل", refunds: "المبالغ المرتجعة", net_period_movement: "صافي حركة الفترة",
  inventory_rows: "صفوف المخزون", out_of_stock_rows: "نافد", low_stock_rows: "مخزون منخفض", no_movement_rows: "بدون حركة",
  purchase_value: "قيمة الشراء", retail_value: "قيمة البيع", potential_margin_value: "هامش محتمل",
  order_count: "عدد الطلبات", delivered_orders: "طلبات مسلمة", cancelled_orders: "طلبات ملغاة", active_orders: "طلبات نشطة",
  known_customers_in_period: "عملاء معروفون", overall_identity_coverage_percent: "تغطية هوية العملاء %",
  active_expense_amount: "مصروفات تشغيلية", salary_paid_amount: "رواتب مدفوعة", purchase_total: "مشتريات الموردين",
  operating_cash_out_in_period: "إجمالي خروج تشغيلي", total: "الإجمالي", critical: "عاجل", warning: "تحذير", opportunity: "فرصة", info: "معلومة",
};

const labelFor = (key: string) => fieldLabels[key] || key;
const valueForCell = (value: unknown): string | number | boolean => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
};

export async function fetchReportingExportBundleV2(branchId: string, from: Date, to: Date): Promise<ReportingExportBundleV2> {
  const [overview, sales, payments, returns, inventory, shifts, online, customers, costs, insights] = await Promise.all([
    fetchReportingOverviewV2(branchId, from, to),
    fetchReportingSalesV2({ branchId, from, to }),
    fetchReportingPaymentsV2(branchId, from, to),
    fetchReportingReturnsV2(branchId, from, to),
    fetchReportingInventoryV2(branchId, from, to),
    fetchReportingShiftsV2(branchId, from, to, 200),
    fetchReportingOnlineV2(branchId, from, to, 200),
    fetchReportingCustomersV2(branchId, from, to, 200),
    fetchReportingCostsV2(branchId, from, to, 200),
    fetchReportingInsightsV2(branchId, from, to),
  ]);

  return {
    branchId,
    branchName: overview.branch_name || "ماركت المعداوي",
    from,
    to,
    generatedAt: new Date(),
    overview, sales, payments, returns, inventory, shifts, online, customers, costs, insights,
  };
}

const primaryRows = (bundle: ReportingExportBundleV2, dataset: ReportingExportDataset): Array<Record<string, unknown>> => {
  switch (dataset) {
    case "overview": return [bundle.overview.current as unknown as Record<string, unknown>];
    case "sales": return bundle.sales.recent as unknown as Array<Record<string, unknown>>;
    case "payments": return bundle.payments.methods as unknown as Array<Record<string, unknown>>;
    case "returns": return bundle.returns.recent as unknown as Array<Record<string, unknown>>;
    case "inventory": return [
      ...bundle.inventory.out_of_stock.map((row) => ({ risk: "out_of_stock", ...row })),
      ...bundle.inventory.low_stock.map((row) => ({ risk: "low_stock", ...row })),
      ...bundle.inventory.no_movement.map((row) => ({ risk: "no_movement", ...row })),
    ] as unknown as Array<Record<string, unknown>>;
    case "shifts": return bundle.shifts.shifts as unknown as Array<Record<string, unknown>>;
    case "online": return bundle.online.orders as unknown as Array<Record<string, unknown>>;
    case "customers": return bundle.customers.customers as unknown as Array<Record<string, unknown>>;
    case "costs": return [
      ...bundle.costs.expenses.map((row) => ({ record_type: "expense", ...row })),
      ...bundle.costs.purchases.map((row) => ({ record_type: "purchase", ...row })),
      ...bundle.costs.salaries.map((row) => ({ record_type: "salary", ...row })),
    ] as unknown as Array<Record<string, unknown>>;
    case "insights": return bundle.insights.insights as unknown as Array<Record<string, unknown>>;
  }
};

const summaryFor = (bundle: ReportingExportBundleV2, dataset: ReportingExportDataset): Record<string, unknown> => {
  switch (dataset) {
    case "overview": return bundle.overview.current as unknown as Record<string, unknown>;
    case "sales": return bundle.sales.summary as unknown as Record<string, unknown>;
    case "payments": return bundle.payments.summary as unknown as Record<string, unknown>;
    case "returns": return bundle.returns.summary as unknown as Record<string, unknown>;
    case "inventory": return bundle.inventory.summary as unknown as Record<string, unknown>;
    case "shifts": return bundle.shifts.summary as unknown as Record<string, unknown>;
    case "online": return bundle.online.summary as unknown as Record<string, unknown>;
    case "customers": return bundle.customers.summary as unknown as Record<string, unknown>;
    case "costs": return bundle.costs.summary as unknown as Record<string, unknown>;
    case "insights": return bundle.insights.summary as unknown as Record<string, unknown>;
  }
};

const applySheetDefaults = (sheet: ExcelJS.Worksheet) => {
  sheet.properties.defaultRowHeight = 20;
  sheet.getColumn(1).width = 28;
};

const styleHeader = (row: ExcelJS.Row) => {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF005931" } };
  row.alignment = { vertical: "middle", horizontal: "center" };
};

const addSummarySheet = (workbook: ExcelJS.Workbook, name: string, summary: Record<string, unknown>) => {
  const sheet = workbook.addWorksheet(name);
  applySheetDefaults(sheet);
  const header = sheet.addRow(["المؤشر", "القيمة"]);
  styleHeader(header);
  Object.entries(summary).forEach(([key, value]) => sheet.addRow([labelFor(key), valueForCell(value)]));
  sheet.columns = [{ width: 34 }, { width: 26 }];
  return sheet;
};

const addTableSheet = (workbook: ExcelJS.Workbook, name: string, rows: Array<Record<string, unknown>>) => {
  const sheet = workbook.addWorksheet(name);
  applySheetDefaults(sheet);
  if (!rows.length) {
    sheet.addRow(["لا توجد بيانات في الفترة المختارة"]);
    return sheet;
  }
  const keys = Array.from(rows.reduce((set, row) => { Object.keys(row).forEach((key) => set.add(key)); return set; }, new Set<string>()));
  const header = sheet.addRow(keys.map(labelFor));
  styleHeader(header);
  rows.forEach((row) => sheet.addRow(keys.map((key) => valueForCell(row[key]))));
  sheet.columns = keys.map((key) => ({ key, width: Math.min(Math.max(labelFor(key).length + 5, 14), 34) }));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(keys.length, 1) } };
  return sheet;
};

export async function exportReportingWorkbookV2(bundle: ReportingExportBundleV2) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "المعداوي ماركت - Reporting V2";
  workbook.created = bundle.generatedAt;
  workbook.modified = bundle.generatedAt;

  const cover = workbook.addWorksheet("ملخص تنفيذي");
  cover.addRow(["Reporting V2 - المعداوي ماركت"]);
  cover.addRow(["الفرع", bundle.branchName]);
  cover.addRow(["من", bundle.from.toLocaleString("ar-EG")]);
  cover.addRow(["إلى", bundle.to.toLocaleString("ar-EG")]);
  cover.addRow(["وقت التصدير", bundle.generatedAt.toLocaleString("ar-EG")]);
  cover.addRow([]);
  cover.addRow(["المؤشر", "القيمة"]);
  styleHeader(cover.getRow(7));
  Object.entries(bundle.overview.current).forEach(([key, value]) => cover.addRow([labelFor(key), valueForCell(value)]));
  cover.columns = [{ width: 38 }, { width: 28 }];

  addTableSheet(workbook, "المبيعات", bundle.sales.recent as unknown as Array<Record<string, unknown>>);
  addTableSheet(workbook, "وسائل الدفع", bundle.payments.methods as unknown as Array<Record<string, unknown>>);
  addTableSheet(workbook, "المرتجعات", bundle.returns.recent as unknown as Array<Record<string, unknown>>);
  addTableSheet(workbook, "المخزون النافد", bundle.inventory.out_of_stock as unknown as Array<Record<string, unknown>>);
  addTableSheet(workbook, "المخزون المنخفض", bundle.inventory.low_stock as unknown as Array<Record<string, unknown>>);
  addTableSheet(workbook, "الورديات", bundle.shifts.shifts as unknown as Array<Record<string, unknown>>);
  addTableSheet(workbook, "الأونلاين", bundle.online.orders as unknown as Array<Record<string, unknown>>);
  addTableSheet(workbook, "العملاء", bundle.customers.customers as unknown as Array<Record<string, unknown>>);
  addTableSheet(workbook, "المصروفات", bundle.costs.expenses as unknown as Array<Record<string, unknown>>);
  addTableSheet(workbook, "مشتريات الموردين", bundle.costs.purchases as unknown as Array<Record<string, unknown>>);
  addTableSheet(workbook, "الرواتب", bundle.costs.salaries as unknown as Array<Record<string, unknown>>);
  addTableSheet(workbook, "الإشارات الذكية", bundle.insights.insights as unknown as Array<Record<string, unknown>>);
  addSummarySheet(workbook, "ملخص الدفع", bundle.payments.summary as unknown as Record<string, unknown>);
  addSummarySheet(workbook, "ملخص المخزون", bundle.inventory.summary as unknown as Record<string, unknown>);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const fileName = `Reporting_V2_${format(bundle.from, "yyyy-MM-dd")}_${format(bundle.to, "yyyy-MM-dd")}.xlsx`;
  saveAs(blob, fileName);
}

const csvEscape = (value: unknown) => `"${String(valueForCell(value)).replace(/"/g, '""')}"`;

export function exportReportingCsvV2(bundle: ReportingExportBundleV2, dataset: ReportingExportDataset) {
  let rows = primaryRows(bundle, dataset);
  if (!rows.length) {
    rows = Object.entries(summaryFor(bundle, dataset)).map(([metricKey, value]) => ({ metric: labelFor(metricKey), value }));
  }
  const keys = Array.from(rows.reduce((set, row) => { Object.keys(row).forEach((key) => set.add(key)); return set; }, new Set<string>()));
  const lines = [keys.map((key) => csvEscape(labelFor(key))).join(","), ...rows.map((row) => keys.map((key) => csvEscape(row[key])).join(","))];
  const blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  saveAs(blob, `Reporting_V2_${dataset}_${format(bundle.from, "yyyy-MM-dd")}_${format(bundle.to, "yyyy-MM-dd")}.csv`);
}

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char] || char));
const money = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م` : "غير متاح";
};

export function openReportingPdfPreviewV2(bundle: ReportingExportBundleV2, targetWindow?: Window | null) {
  const popup = targetWindow || window.open("", "_blank");
  if (!popup) throw new Error("POPUP_BLOCKED");
  const current = bundle.overview.current;
  const insights = bundle.insights.insights;
  const severityLabel: Record<string, string> = { critical: "عاجل", warning: "تحذير", opportunity: "فرصة", info: "معلومة" };
  const insightHtml = insights.length ? insights.map((item) => `
    <article class="insight ${escapeHtml(item.severity)}">
      <div class="tags"><span>${escapeHtml(severityLabel[item.severity] || item.severity)}</span><span>${escapeHtml(item.category)}</span></div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.message)}</p>
      <div class="action"><b>الإجراء:</b> ${escapeHtml(item.action)}</div>
    </article>`).join("") : "<p>لا توجد إشارات تحتاج إجراء في الفترة المختارة.</p>";

  popup.document.open();
  popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>Reporting V2</title><style>
    @page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,Tahoma,sans-serif;color:#17201b;margin:0;background:#fff;line-height:1.6}.header{border-bottom:3px solid #005931;padding-bottom:14px;margin-bottom:18px}.brand{color:#005931;font-size:26px;font-weight:800}.meta{font-size:12px;color:#5f6f65}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:16px 0}.metric{border:1px solid #dfe8e2;border-radius:12px;padding:12px}.metric small{display:block;color:#66766c}.metric strong{font-size:18px;color:#005931}.section-title{font-size:18px;margin:22px 0 10px}.insight{break-inside:avoid;border:1px solid #e2e8e4;border-radius:12px;padding:12px;margin:0 0 10px}.insight h3{margin:5px 0}.insight p{margin:4px 0;font-size:13px}.tags{display:flex;gap:6px}.tags span{font-size:10px;border:1px solid #d8e1db;border-radius:999px;padding:2px 7px}.action{margin-top:8px;padding:8px;background:#f5f8f6;border-radius:8px;font-size:12px}.critical{border-right:4px solid #b91c1c}.warning{border-right:4px solid #b45309}.opportunity{border-right:4px solid #047857}.info{border-right:4px solid #0369a1}.note{font-size:11px;color:#65736a;border-top:1px solid #e5ebe7;margin-top:18px;padding-top:10px}@media print{button{display:none}}
  </style></head><body>
    <header class="header"><div class="brand">المعداوي ماركت — Reporting V2</div><div class="meta">${escapeHtml(bundle.branchName)} | من ${escapeHtml(bundle.from.toLocaleString("ar-EG"))} إلى ${escapeHtml(bundle.to.toLocaleString("ar-EG"))}</div></header>
    <div class="grid">
      <div class="metric"><small>صافي المبيعات</small><strong>${money(current.net_sales)}</strong></div>
      <div class="metric"><small>عدد المعاملات</small><strong>${escapeHtml(current.transactions.toLocaleString("ar-EG"))}</strong></div>
      <div class="metric"><small>متوسط الفاتورة</small><strong>${money(current.average_ticket)}</strong></div>
      <div class="metric"><small>المرتجعات</small><strong>${money(current.returns)}</strong></div>
      <div class="metric"><small>مجمل ربح POS</small><strong>${current.pos_gross_profit == null ? "محجوب / غير متاح" : money(current.pos_gross_profit)}</strong></div>
      <div class="metric"><small>صافي مبيعات الأونلاين المعترف بها</small><strong>${money(current.online_net_sales)}</strong></div>
    </div>
    <h2 class="section-title">الإشارات الذكية (${escapeHtml(bundle.insights.summary.total.toLocaleString("ar-EG"))})</h2>${insightHtml}
    <div class="note">هذا التقرير مبني على Reporting V2 الموثق. الإشارات Deterministic ولا تستخدم Generative AI لتعديل الأرقام. ربحية الأونلاين لا تُستكمل ما لم تتوفر Cost Snapshots موثوقة.</div>
    <script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script>
  </body></html>`);
  popup.document.close();
}
