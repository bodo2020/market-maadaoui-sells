import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DragDropImage } from "@/components/ui/drag-drop-image";
import { fetchProductById } from "@/services/supabase/productService";
import { toast } from "sonner";
import { AlertTriangle, Box, Edit3, Loader2, PackagePlus, Power, PowerOff, WandSparkles } from "lucide-react";
import {
  fetchProductVariants,
  saveProductVariant,
  setProductVariantActive,
  type ProductVariant,
  type ProductVariantInput,
} from "@/services/supabase/productVariantService";

const EMPTY_FORM: ProductVariantInput = {
  name: "",
  variant_type: "كرتونة",
  price: 0,
  purchase_price: 0,
  conversion_factor: 2,
  barcode: "",
  bulk_barcode: "",
  image_url: null,
  active: true,
  position: 0,
};

type LegacyBulkDraft = {
  enabled?: boolean;
  quantity?: number | null;
  price?: number | null;
  barcode?: string | null;
  purchasePrice?: number | null;
  imageUrl?: string | null;
};

interface ProductSaleUnitsCardProps {
  productId?: string | null;
  productName?: string;
  baseQuantity?: number;
  legacyBulk?: LegacyBulkDraft | null;
  onUnitsChanged?: (rows: ProductVariant[]) => void;
}

export default function ProductSaleUnitsCard({
  productId,
  productName,
  baseQuantity = 0,
  legacyBulk,
  onUnitsChanged,
}: ProductSaleUnitsCardProps) {
  const [rows, setRows] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductVariant | null>(null);
  const [form, setForm] = useState<ProductVariantInput>(EMPTY_FORM);
  const [legacyDraftOpen, setLegacyDraftOpen] = useState(false);
  const [detectedLegacyBulk, setDetectedLegacyBulk] = useState<LegacyBulkDraft | null>(legacyBulk ?? null);

  const resolvedLegacyBulk = legacyBulk === undefined ? detectedLegacyBulk : legacyBulk;

  const loadRows = async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const nextRows = await fetchProductVariants(productId, true);
      setRows(nextRows);
      onUnitsChanged?.(nextRows);
    } catch (error: any) {
      toast.error(error?.message || "تعذر تحميل وحدات البيع");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, [productId]);

  useEffect(() => {
    if (legacyBulk !== undefined) {
      setDetectedLegacyBulk(legacyBulk || null);
      return;
    }
    if (!productId) {
      setDetectedLegacyBulk(null);
      return;
    }

    let cancelled = false;
    void fetchProductById(productId)
      .then(product => {
        if (cancelled) return;
        setDetectedLegacyBulk({
          enabled: Boolean(product.bulk_enabled),
          quantity: Number(product.bulk_quantity || 0),
          price: Number(product.bulk_price || 0),
          barcode: product.bulk_barcode || "",
          purchasePrice: Number(product.purchase_price || 0),
          imageUrl: product.image_urls?.[0] || null,
        });
      })
      .catch(error => {
        console.error("Legacy bulk draft load error:", error);
        if (!cancelled) setDetectedLegacyBulk(null);
      });

    return () => {
      cancelled = true;
    };
  }, [productId, legacyBulk]);

  const activeCount = useMemo(() => rows.filter(row => row.active).length, [rows]);
  const canUseLegacyDraft = Boolean(
    productId &&
      resolvedLegacyBulk?.enabled &&
      rows.length === 0 &&
      Number(resolvedLegacyBulk.quantity || 0) > 1 &&
      Number(resolvedLegacyBulk.price || 0) > 0,
  );

  const openCreate = () => {
    setEditing(null);
    setLegacyDraftOpen(false);
    setForm({
      ...EMPTY_FORM,
      name: productName ? `كرتونة ${productName}` : "",
      position: rows.length,
    });
    setDialogOpen(true);
  };

  const openLegacyCreate = () => {
    const factor = Math.max(2, Number(resolvedLegacyBulk?.quantity || 2));
    const basePurchase = Math.max(0, Number(resolvedLegacyBulk?.purchasePrice || 0));
    setEditing(null);
    setLegacyDraftOpen(true);
    setForm({
      ...EMPTY_FORM,
      name: productName ? `${productName} - جملة` : "وحدة جملة",
      variant_type: "جملة",
      price: Math.max(0, Number(resolvedLegacyBulk?.price || 0)),
      purchase_price: Number((basePurchase * factor).toFixed(2)),
      conversion_factor: factor,
      barcode: resolvedLegacyBulk?.barcode || "",
      bulk_barcode: "",
      image_url: resolvedLegacyBulk?.imageUrl || null,
      active: true,
      position: rows.length,
    });
    setDialogOpen(true);
  };

  const openEdit = (row: ProductVariant) => {
    setEditing(row);
    setLegacyDraftOpen(false);
    setForm({
      name: row.name,
      variant_type: row.variant_type || "كرتونة",
      price: Number(row.price || 0),
      purchase_price: Number(row.purchase_price || 0),
      conversion_factor: Number(row.conversion_factor || 2),
      barcode: row.barcode || "",
      bulk_barcode: row.bulk_barcode || "",
      image_url: row.image_url || null,
      active: row.active,
      position: row.position || 0,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!productId) return;
    if (!form.name.trim()) {
      toast.error("اكتب اسم وحدة البيع");
      return;
    }
    if (!form.barcode?.trim() && !form.bulk_barcode?.trim()) {
      toast.error("اكتب باركود وحدة البيع");
      return;
    }
    if (!Number.isFinite(Number(form.conversion_factor)) || Number(form.conversion_factor) <= 1) {
      toast.error("معامل التحويل لازم يكون أكبر من 1");
      return;
    }
    if (!Number.isFinite(Number(form.price)) || Number(form.price) <= 0) {
      toast.error("اكتب سعر بيع صحيح");
      return;
    }

    setSaving(true);
    try {
      await saveProductVariant(productId, form, editing?.id);
      toast.success(editing ? "تم تحديث وحدة البيع" : legacyDraftOpen ? "تم تحويل بيانات الجملة لوحدة بيع مرتبطة" : "تمت إضافة وحدة البيع");
      setDialogOpen(false);
      setEditing(null);
      setLegacyDraftOpen(false);
      await loadRows();
    } catch (error: any) {
      toast.error(error?.message || "تعذر حفظ وحدة البيع");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: ProductVariant) => {
    try {
      await setProductVariantActive(row.id, !row.active);
      toast.success(row.active ? "تم إيقاف وحدة البيع" : "تم تفعيل وحدة البيع");
      await loadRows();
    } catch (error: any) {
      toast.error(error?.message || "تعذر تغيير حالة وحدة البيع");
    }
  };

  if (!productId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Box className="h-5 w-5" />
            وحدات البيع المرتبطة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-dashed bg-muted/30 p-5 text-sm text-muted-foreground">
            احفظ المنتج الأساسي أولًا، وبعدها أضف الكرتونة أو الباك أو أي وحدة جملة بصورة وباركود وسعر مستقلين.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Box className="h-5 w-5" />
              وحدات البيع المرتبطة
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              الكرتونة/الباك يظهر كمنتج مستقل، لكن المخزون يُخصم تلقائيًا من المنتج الأساسي.
            </p>
          </div>
          <Button type="button" onClick={openCreate}>
            <PackagePlus className="ms-2 h-4 w-4" />
            إضافة وحدة بيع
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">{rows.length} وحدة</Badge>
            <Badge variant="outline">{activeCount} مفعلة</Badge>
            <Badge variant="outline">مخزون الأساس: {Number(baseQuantity || 0).toLocaleString("ar-EG")}</Badge>
          </div>

          {!loading && canUseLegacyDraft && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    بيانات جملة قديمة جاهزة للتحويل
                  </div>
                  <p className="mt-1 text-xs leading-6 text-amber-900/80">
                    عبوة × {Number(resolvedLegacyBulk?.quantity || 0).toLocaleString("ar-EG")} · سعر {Number(resolvedLegacyBulk?.price || 0).toFixed(2)} ج.م
                    {resolvedLegacyBulk?.barcode ? ` · باركود ${resolvedLegacyBulk.barcode}` : " · باركود الجملة ناقص وسيطلب منك إدخاله"}.
                    لن يتغير مخزون المنتج الأساسي أثناء التحويل.
                  </p>
                </div>
                <Button type="button" variant="outline" className="border-amber-400 bg-white" onClick={openLegacyCreate}>
                  <WandSparkles className="ms-2 h-4 w-4" />
                  تحويل بيانات الجملة القديمة
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="ms-2 h-5 w-5 animate-spin" />
              جاري التحميل...
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              لا توجد وحدات بيع مرتبطة بعد. أضف مثلًا «كرتونة ×24» بصورة وباركود خاصين بها.
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {rows.map(row => {
                const packagesAvailable = Math.floor(Number(baseQuantity || 0) / Number(row.conversion_factor || 1));
                return (
                  <div key={row.id} className={`flex gap-3 rounded-xl border p-3 ${row.active ? "bg-card" : "bg-muted/30 opacity-70"}`}>
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-muted">
                      {row.image_url ? (
                        <img src={row.image_url} alt={row.name} className="h-full w-full object-contain" />
                      ) : (
                        <Box className="m-auto h-full w-8 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{row.name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {row.variant_type} × {Number(row.conversion_factor).toLocaleString("ar-EG")}
                          </p>
                        </div>
                        <Badge variant={row.active ? "default" : "secondary"}>{row.active ? "مفعل" : "متوقف"}</Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <span className="text-muted-foreground">السعر</span>
                        <span className="font-semibold">{Number(row.price).toFixed(2)} ج.م</span>
                        <span className="text-muted-foreground">المتاح تقريبًا</span>
                        <span>{packagesAvailable.toLocaleString("ar-EG")} {row.variant_type}</span>
                        <span className="text-muted-foreground">الباركود</span>
                        <span className="truncate font-mono" dir="ltr">{row.barcode || row.bulk_barcode || "—"}</span>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => openEdit(row)}>
                          <Edit3 className="ms-1 h-3.5 w-3.5" />
                          تعديل
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => void toggleActive(row)}>
                          {row.active ? <PowerOff className="ms-1 h-3.5 w-3.5" /> : <Power className="ms-1 h-3.5 w-3.5" />}
                          {row.active ? "إيقاف" : "تفعيل"}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={open => !saving && setDialogOpen(open)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل وحدة البيع" : legacyDraftOpen ? "تحويل بيانات الجملة القديمة" : "إضافة وحدة بيع مرتبطة"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {legacyDraftOpen && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-6 text-amber-950">
                تم ملء البيانات القديمة كمسودة فقط. راجع الباركود قبل الحفظ؛ لو الباركود مكرر سيرفض السيرفر الحفظ حتى تغيّره. المخزون سيظل مخزون المنتج الأساسي بدون إنشاء مخزون جديد.
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>اسم المنتج المعروض</Label>
                <Input
                  value={form.name}
                  onChange={event => setForm(prev => ({ ...prev, name: event.target.value }))}
                  placeholder="مثال: كرتونة بيبسي 24 قطعة"
                />
              </div>
              <div className="space-y-2">
                <Label>نوع الوحدة</Label>
                <Select value={form.variant_type} onValueChange={value => setForm(prev => ({ ...prev, variant_type: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="كرتونة">كرتونة</SelectItem>
                    <SelectItem value="باك">باك</SelectItem>
                    <SelectItem value="دستة">دستة</SelectItem>
                    <SelectItem value="علبة">علبة</SelectItem>
                    <SelectItem value="شريط">شريط</SelectItem>
                    <SelectItem value="جملة">جملة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>عدد وحدات المنتج الأساسي</Label>
                <Input
                  type="number"
                  min="2"
                  step="1"
                  value={form.conversion_factor || ""}
                  onChange={event => setForm(prev => ({ ...prev, conversion_factor: Number(event.target.value) }))}
                  placeholder="24"
                />
              </div>
              <div className="space-y-2">
                <Label>باركود وحدة البيع</Label>
                <Input
                  value={form.barcode || ""}
                  onChange={event => setForm(prev => ({ ...prev, barcode: event.target.value }))}
                  placeholder="باركود الكرتونة"
                  dir="ltr"
                  autoFocus={legacyDraftOpen && !form.barcode}
                />
              </div>
              <div className="space-y-2">
                <Label>سعر البيع للوحدة</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price || ""}
                  onChange={event => setForm(prev => ({ ...prev, price: Number(event.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>سعر الشراء للوحدة</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.purchase_price || ""}
                  onChange={event => setForm(prev => ({ ...prev, purchase_price: Number(event.target.value) }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>صورة مستقلة لوحدة البيع</Label>
              <DragDropImage
                value={form.image_url || null}
                onChange={url => setForm(prev => ({ ...prev, image_url: url }))}
                bucketName="products"
                folder="products/variants"
                maxDimension={720}
                targetBytes={120 * 1024}
              />
            </div>

            <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
              مثال: لو معامل التحويل 24، بيع كرتونة واحدة يخصم 24 وحدة من مخزون المنتج الأساسي. لا يتم إنشاء مخزون منفصل للكرتونة.
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={saving} onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button type="button" disabled={saving} onClick={() => void handleSave()}>
              {saving && <Loader2 className="ms-2 h-4 w-4 animate-spin" />}
              {editing ? "حفظ التعديل" : legacyDraftOpen ? "تحويل وحفظ الوحدة" : "إضافة الوحدة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}