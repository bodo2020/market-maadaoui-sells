import { useMemo, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  PackagePlus,
  Upload,
  XCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  importProductRows,
  type ProductImportMode,
  type ProductImportResult,
  type ProductImportRow,
} from "@/services/supabase/productImportService";
import { requireCurrentBranchId } from "@/services/supabase/productEditorService";

const HEADER_ALIASES: Record<string, keyof ProductImportRow> = {
  "اسم المنتج": "name",
  "الاسم": "name",
  "name": "name",
  "product name": "name",
  "الباركود": "barcode",
  "باركود": "barcode",
  "barcode": "barcode",
  "باركود المنتج الأساسي": "parent_barcode",
  "باركود الاساسي": "parent_barcode",
  "parent barcode": "parent_barcode",
  "parent_barcode": "parent_barcode",
  "الوصف": "description",
  "description": "description",
  "سعر البيع": "price",
  "السعر": "price",
  "price": "price",
  "sale price": "price",
  "سعر الشراء": "purchase_price",
  "purchase price": "purchase_price",
  "purchase_price": "purchase_price",
  "الكمية": "quantity",
  "quantity": "quantity",
  "الحد الأدنى": "min_stock_level",
  "الحد الادنى": "min_stock_level",
  "min stock": "min_stock_level",
  "min_stock_level": "min_stock_level",
  "تنبيه المخزون": "alert_enabled",
  "alert_enabled": "alert_enabled",
  "سعر العرض": "offer_price",
  "offer_price": "offer_price",
  "عرض": "is_offer",
  "is_offer": "is_offer",
  "نوع الباركود": "barcode_type",
  "barcode_type": "barcode_type",
  "الوحدة": "unit_of_measure",
  "وحدة القياس": "unit_of_measure",
  "unit": "unit_of_measure",
  "unit_of_measure": "unit_of_measure",
  "الشركة": "company",
  "company": "company",
  "القسم": "category",
  "القسم الرئيسي": "category",
  "category": "category",
  "القسم الفرعي": "subcategory",
  "subcategory": "subcategory",
  "موقع الرف": "shelf_location",
  "shelf_location": "shelf_location",
  "تاريخ الصلاحية": "expiry_date",
  "الصلاحية": "expiry_date",
  "expiry_date": "expiry_date",
  "تتبع الصلاحية": "track_expiry",
  "track_expiry": "track_expiry",
  "رابط الصورة": "image_url",
  "image_url": "image_url",
  "نوع وحدة الجملة": "variant_type",
  "نوع وحدة البيع": "variant_type",
  "variant_type": "variant_type",
  "معامل التحويل": "conversion_factor",
  "conversion_factor": "conversion_factor",
};

const NUMERIC_FIELDS = new Set<keyof ProductImportRow>([
  "price",
  "purchase_price",
  "quantity",
  "min_stock_level",
  "offer_price",
  "conversion_factor",
  "position",
]);

const BOOLEAN_FIELDS = new Set<keyof ProductImportRow>([
  "alert_enabled",
  "is_offer",
  "track_expiry",
  "active",
]);

const TEMPLATE_HEADERS = [
  "اسم المنتج",
  "الباركود",
  "باركود المنتج الأساسي",
  "سعر البيع",
  "سعر الشراء",
  "الكمية",
  "الحد الأدنى",
  "وحدة القياس",
  "نوع الباركود",
  "الشركة",
  "القسم الرئيسي",
  "القسم الفرعي",
  "موقع الرف",
  "تاريخ الصلاحية",
  "تتبع الصلاحية",
  "عرض",
  "سعر العرض",
  "نوع وحدة الجملة",
  "معامل التحويل",
  "رابط الصورة",
  "الوصف",
];

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cellValue(value: ExcelJS.CellValue) {
  if (value == null) return "";
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value && value.result != null) return value.result;
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map(part => part.text).join("");
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value as string | number | boolean;
}

function parseBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "نعم", "صح", "مفعل", "فعال"].includes(normalized);
}

function normalizeBarcode(value: unknown) {
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value).toString();
  return String(value).trim().replace(/\.0$/, "");
}

function validateRow(row: ProductImportRow) {
  const errors: string[] = [];
  const isVariant = Boolean(row.parent_barcode?.trim());

  if (!row.name?.trim()) errors.push("اسم المنتج مطلوب");
  if (!row.barcode?.trim()) errors.push(isVariant ? "باركود وحدة الجملة مطلوب" : "الباركود مطلوب");
  if (!Number.isFinite(Number(row.price)) || Number(row.price) < 0) errors.push("سعر البيع غير صالح");
  if (!Number.isFinite(Number(row.purchase_price)) || Number(row.purchase_price) < 0) errors.push("سعر الشراء غير صالح");

  if (isVariant) {
    if (!Number.isFinite(Number(row.conversion_factor)) || Number(row.conversion_factor) <= 1) {
      errors.push("معامل التحويل لازم يكون أكبر من 1");
    }
  } else {
    if (!Number.isFinite(Number(row.quantity)) || Number(row.quantity) < 0) errors.push("الكمية غير صالحة");
    if (row.barcode_type && !["normal", "scale", "عادي", "ميزان"].includes(String(row.barcode_type).toLowerCase())) {
      errors.push("نوع الباركود يجب أن يكون normal/scale أو عادي/ميزان");
    }
  }

  if (row.is_offer && (!Number.isFinite(Number(row.offer_price)) || Number(row.offer_price) <= 0)) {
    errors.push("سعر العرض مطلوب عند تفعيل العرض");
  }

  return errors;
}

function normalizeRow(row: ProductImportRow): ProductImportRow {
  const barcodeType = String(row.barcode_type || "normal").trim().toLowerCase();
  return {
    ...row,
    name: row.name?.trim(),
    barcode: row.barcode?.trim(),
    parent_barcode: row.parent_barcode?.trim(),
    company: row.company?.trim(),
    category: row.category?.trim(),
    subcategory: row.subcategory?.trim(),
    unit_of_measure: row.unit_of_measure?.trim() || "قطعة",
    barcode_type: barcodeType === "ميزان" ? "scale" : barcodeType === "عادي" ? "normal" : barcodeType || "normal",
    variant_type: row.variant_type?.trim() || (row.parent_barcode ? "كرتونة" : undefined),
    quantity: Number(row.quantity || 0),
    min_stock_level: Number(row.min_stock_level ?? 5),
    price: Number(row.price || 0),
    purchase_price: Number(row.purchase_price || 0),
    offer_price: row.offer_price == null || row.offer_price === ("" as never) ? null : Number(row.offer_price),
    conversion_factor: row.conversion_factor == null ? undefined : Number(row.conversion_factor),
    alert_enabled: Boolean(row.alert_enabled),
    is_offer: Boolean(row.is_offer),
    track_expiry: Boolean(row.track_expiry),
    active: row.active ?? true,
  };
}

type PreviewRow = ProductImportRow & { errors: string[] };

export default function InventoryImport() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [mode, setMode] = useState<ProductImportMode>("upsert");
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ProductImportResult | null>(null);

  const validRows = useMemo(() => rows.filter(row => row.errors.length === 0), [rows]);
  const invalidRows = useMemo(() => rows.filter(row => row.errors.length > 0), [rows]);
  const variantCount = useMemo(() => rows.filter(row => Boolean(row.parent_barcode)).length, [rows]);

  const downloadTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "المعداوي ماركت";
    const sheet = workbook.addWorksheet("المنتجات", { views: [{ rightToLeft: true }] });
    sheet.addRow(TEMPLATE_HEADERS);
    sheet.addRow([
      "بيبسي 330 مل", "622000000001", "", 15, 12, 100, 10, "قطعة", "normal", "بيبسي", "مشروبات", "مشروبات غازية", "A1", "", false, false, "", "", "", "", "مثال منتج أساسي",
    ]);
    sheet.addRow([
      "كرتونة بيبسي 24 قطعة", "622000000024", "622000000001", 320, 280, "", "", "كرتونة", "normal", "", "", "", "", "", false, false, "", "كرتونة", 24, "", "مثال وحدة جملة مرتبطة بالمنتج الأساسي",
    ]);
    sheet.columns = TEMPLATE_HEADERS.map((header, index) => ({ header, key: `c${index}`, width: index === 0 || index === 20 ? 30 : 20 }));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { horizontal: "center", vertical: "middle" };

    const notes = workbook.addWorksheet("تعليمات", { views: [{ rightToLeft: true }] });
    notes.addRows([
      ["تعليمات رفع المنتجات"],
      ["المنتج الأساسي", "اترك عمود باركود المنتج الأساسي فارغًا."],
      ["وحدة الجملة", "اكتب باركود المنتج الأساسي في parent_barcode/باركود المنتج الأساسي، واكتب باركود مستقل للكرتونة أو الباك."],
      ["معامل التحويل", "مثال: كرتونة 24 قطعة = 24. المخزون سيخصم 24 من المنتج الأساسي عند بيع كرتونة واحدة."],
      ["الصور", "يمكن إدخال رابط صورة. الصور التي ترفع من صفحة المنتج يتم ضغطها WebP تلقائيًا لتوفير المساحة."],
      ["الأسماء", "اسم الشركة والقسم والقسم الفرعي يجب أن يطابق أسماء موجودة في النظام."],
      ["نوع الباركود", "normal أو scale (أو عادي/ميزان)."],
      ["الأوضاع", "إضافة فقط / تحديث فقط / إضافة وتحديث."],
    ]);
    notes.getRow(1).font = { bold: true, size: 14 };
    notes.columns = [{ width: 24 }, { width: 90 }];

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(
      new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      "نموذج_رفع_المنتجات.xlsx",
    );
  };

  const readFile = async (selectedFile: File) => {
    setReading(true);
    setResult(null);
    setRows([]);
    try {
      requireCurrentBranchId();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await selectedFile.arrayBuffer());
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error("الملف لا يحتوي على Sheet صالح.");

      const headerRow = sheet.getRow(1);
      const mappedHeaders = new Map<number, keyof ProductImportRow>();
      headerRow.eachCell((cell, columnNumber) => {
        const normalized = normalizeHeader(cellValue(cell.value));
        const canonical = HEADER_ALIASES[normalized];
        if (canonical) mappedHeaders.set(columnNumber, canonical);
      });

      if (!mappedHeaders.has(1) && ![...mappedHeaders.values()].includes("name")) {
        throw new Error("لم يتم العثور على عمود اسم المنتج. استخدم النموذج أو عمود name/اسم المنتج.");
      }
      if (![...mappedHeaders.values()].includes("barcode")) {
        throw new Error("لم يتم العثور على عمود الباركود.");
      }

      const parsed: PreviewRow[] = [];
      sheet.eachRow((excelRow, rowNumber) => {
        if (rowNumber === 1) return;
        const raw: ProductImportRow = { row_number: rowNumber };
        let hasAnyValue = false;

        mappedHeaders.forEach((field, columnNumber) => {
          let value = cellValue(excelRow.getCell(columnNumber).value);
          if (value !== "" && value != null) hasAnyValue = true;

          if (field === "barcode" || field === "parent_barcode") value = normalizeBarcode(value);
          else if (NUMERIC_FIELDS.has(field)) value = value === "" ? undefined : Number(value);
          else if (BOOLEAN_FIELDS.has(field)) value = parseBoolean(value);
          else value = String(value ?? "").trim();

          (raw as Record<string, unknown>)[field] = value;
        });

        if (!hasAnyValue) return;
        const normalized = normalizeRow(raw);
        parsed.push({ ...normalized, errors: validateRow(normalized) });
      });

      if (!parsed.length) throw new Error("لم يتم العثور على صفوف منتجات صالحة للقراءة.");
      setRows(parsed);
      toast.success(`تمت قراءة ${parsed.length} صف`);
    } catch (error: any) {
      setFile(null);
      toast.error(error?.message || "تعذر قراءة ملف Excel");
    } finally {
      setReading(false);
    }
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    const ext = selected.name.toLowerCase();
    if (!ext.endsWith(".xlsx") && !ext.endsWith(".xls")) {
      toast.error("اختر ملف Excel بصيغة xlsx أو xls");
      return;
    }
    setFile(selected);
    await readFile(selected);
  };

  const startImport = async () => {
    if (!validRows.length || importing) return;
    if (invalidRows.length > 0) {
      toast.error("راجع الصفوف التي بها أخطاء قبل التنفيذ. يمكن حذف/تصحيح الأخطاء في الملف وإعادة رفعه.");
      return;
    }

    setImporting(true);
    setProgress(0);
    setResult(null);
    try {
      const importResult = await importProductRows(
        validRows.map(({ errors: _errors, ...row }) => row),
        mode,
        (completed, totalCount) => setProgress(Math.round((completed / totalCount) * 100)),
      );
      setResult(importResult);
      if (importResult.failed > 0) toast.error(`تمت العملية مع ${importResult.failed} خطأ`);
      else toast.success(`تم رفع ${importResult.success} سجل بنجاح`);
    } catch (error: any) {
      toast.error(error?.message || "تعذر تنفيذ رفع المنتجات");
    } finally {
      setImporting(false);
    }
  };

  const exportErrors = async () => {
    const errorRows = result?.results.filter(row => row.status === "error") || [];
    if (!errorRows.length) return;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("الأخطاء", { views: [{ rightToLeft: true }] });
    sheet.columns = [
      { header: "رقم الصف", key: "row", width: 12 },
      { header: "اسم المنتج", key: "name", width: 32 },
      { header: "الباركود", key: "barcode", width: 24 },
      { header: "سبب الخطأ", key: "message", width: 65 },
    ];
    errorRows.forEach(row => sheet.addRow({ row: row.row_number, name: row.name, barcode: row.barcode, message: row.message }));
    sheet.getRow(1).font = { bold: true };
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "اخطاء_رفع_المنتجات.xlsx");
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl space-y-5 p-4 pb-10 md:p-6" dir="rtl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">رفع المنتجات من Excel</h1>
            <p className="mt-1 text-sm text-muted-foreground">إضافة أو تحديث المنتجات ووحدات الجملة مع معاينة الأخطاء قبل الكتابة في قاعدة البيانات.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void downloadTemplate()}>
              <Download className="ms-2 h-4 w-4" />
              تحميل النموذج
            </Button>
            <Button variant="ghost" onClick={() => navigate("/products")}>
              <ArrowRight className="ms-2 h-4 w-4" />
              المنتجات
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> 1. اختر الملف</CardTitle>
            <CardDescription>النظام يقرأ أسماء الأعمدة بالعربي أو الإنجليزي، وليس أماكن ثابتة داخل الشيت.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition hover:border-primary/60 hover:bg-muted/30">
              {reading ? <Loader2 className="mb-3 h-10 w-10 animate-spin text-primary" /> : <Upload className="mb-3 h-10 w-10 text-muted-foreground" />}
              <span className="font-semibold">{reading ? "جاري قراءة الملف..." : file?.name || "اختر ملف Excel"}</span>
              <span className="mt-1 text-xs text-muted-foreground">.xlsx أو .xls</span>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} disabled={reading || importing} />
            </label>

            <Alert>
              <PackagePlus className="h-4 w-4" />
              <AlertDescription>
                لإضافة كرتونة أو باك كمنتج ظاهر مستقل: اكتب باركود المنتج الأساسي في عمود «باركود المنتج الأساسي»، ثم اسم/باركود/سعر/معامل التحويل الخاص بوحدة الجملة.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {rows.length > 0 && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">إجمالي الصفوف</p><p className="mt-1 text-2xl font-bold">{rows.length.toLocaleString("ar-EG")}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">صالحة</p><p className="mt-1 text-2xl font-bold text-emerald-700">{validRows.length.toLocaleString("ar-EG")}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">تحتاج تصحيح</p><p className="mt-1 text-2xl font-bold text-destructive">{invalidRows.length.toLocaleString("ar-EG")}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">وحدات جملة مرتبطة</p><p className="mt-1 text-2xl font-bold">{variantCount.toLocaleString("ar-EG")}</p></CardContent></Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>2. مراجعة البيانات</CardTitle>
                <CardDescription>نعرض أول 30 صف. أي خطأ ظاهر هنا يمنع التنفيذ لحماية البيانات.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="overflow-hidden rounded-xl border">
                  <div className="max-h-[460px] overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background">
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>الاسم</TableHead>
                          <TableHead>الباركود</TableHead>
                          <TableHead>النوع</TableHead>
                          <TableHead>السعر</TableHead>
                          <TableHead>الكمية/التحويل</TableHead>
                          <TableHead>الحالة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.slice(0, 30).map(row => (
                          <TableRow key={row.row_number} className={row.errors.length ? "bg-destructive/5" : ""}>
                            <TableCell>{row.row_number}</TableCell>
                            <TableCell className="min-w-[220px] font-medium">{row.name || "—"}</TableCell>
                            <TableCell className="font-mono text-xs" dir="ltr">{row.barcode || "—"}</TableCell>
                            <TableCell>{row.parent_barcode ? <Badge variant="secondary">{row.variant_type || "جملة"} مرتبط</Badge> : <Badge variant="outline">منتج أساسي</Badge>}</TableCell>
                            <TableCell>{Number(row.price || 0).toFixed(2)}</TableCell>
                            <TableCell>{row.parent_barcode ? `×${Number(row.conversion_factor || 0)}` : Number(row.quantity || 0).toLocaleString("ar-EG")}</TableCell>
                            <TableCell>
                              {row.errors.length ? (
                                <div className="max-w-[340px] text-xs text-destructive"><XCircle className="mb-1 inline h-3.5 w-3.5" /> {row.errors.join("، ")}</div>
                              ) : (
                                <span className="text-xs text-emerald-700"><CheckCircle2 className="ms-1 inline h-3.5 w-3.5" /> جاهز</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
                {rows.length > 30 && <p className="text-xs text-muted-foreground">يوجد {rows.length - 30} صف إضافي سيتم معالجته عند التنفيذ.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>3. طريقة التنفيذ</CardTitle>
                <CardDescription>حدد ماذا يحدث إذا وجد النظام نفس الباركود.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="max-w-md">
                  <Select value={mode} onValueChange={value => setMode(value as ProductImportMode)} disabled={importing}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="add">إضافة فقط — الموجود يعتبر خطأ</SelectItem>
                      <SelectItem value="update">تحديث فقط — غير الموجود يعتبر خطأ</SelectItem>
                      <SelectItem value="upsert">إضافة وتحديث — الأنسب غالبًا</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {invalidRows.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>يوجد {invalidRows.length} صف به أخطاء. صحح الملف وأعد رفعه قبل التنفيذ.</AlertDescription>
                  </Alert>
                )}

                {importing && (
                  <div className="space-y-2">
                    <Progress value={progress} />
                    <p className="text-center text-sm text-muted-foreground">جاري الرفع... {progress}%</p>
                  </div>
                )}

                <Button size="lg" className="w-full" disabled={importing || invalidRows.length > 0 || validRows.length === 0} onClick={() => void startImport()}>
                  {importing ? <Loader2 className="ms-2 h-4 w-4 animate-spin" /> : <Upload className="ms-2 h-4 w-4" />}
                  {importing ? "جاري رفع المنتجات..." : `تنفيذ على ${validRows.length.toLocaleString("ar-EG")} صف`}
                </Button>
              </CardContent>
            </Card>
          </>
        )}

        {result && (
          <Card>
            <CardHeader><CardTitle>نتيجة الرفع</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">تمت المعالجة</p><p className="mt-1 text-2xl font-bold">{result.total}</p></div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs text-emerald-700">نجح</p><p className="mt-1 text-2xl font-bold text-emerald-800">{result.success}</p></div>
                <div className="rounded-xl border border-red-200 bg-red-50 p-4"><p className="text-xs text-red-700">فشل</p><p className="mt-1 text-2xl font-bold text-red-800">{result.failed}</p></div>
              </div>

              {result.failed > 0 && (
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-xl border">
                    <Table>
                      <TableHeader><TableRow><TableHead>الصف</TableHead><TableHead>المنتج</TableHead><TableHead>الباركود</TableHead><TableHead>الخطأ</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {result.results.filter(row => row.status === "error").slice(0, 50).map(row => (
                          <TableRow key={`${row.row_number}-${row.barcode}`}><TableCell>{row.row_number}</TableCell><TableCell>{row.name}</TableCell><TableCell dir="ltr" className="font-mono text-xs">{row.barcode}</TableCell><TableCell className="text-destructive">{row.message}</TableCell></TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Button variant="outline" onClick={() => void exportErrors()}><Download className="ms-2 h-4 w-4" /> تحميل ملف الأخطاء</Button>
                </div>
              )}

              {result.failed === 0 && (
                <Alert><CheckCircle2 className="h-4 w-4" /><AlertDescription>تم رفع كل المنتجات بنجاح، وتم تحديث كتالوج نقطة البيع.</AlertDescription></Alert>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
