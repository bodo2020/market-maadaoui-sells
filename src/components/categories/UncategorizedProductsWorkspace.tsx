import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  FolderTree,
  ImageOff,
  Loader2,
  PackageSearch,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchMainCategories, fetchSubcategories } from "@/services/supabase/categoryService";
import {
  assignProductsToCategoryHierarchy,
  CategoryAssignmentProduct,
  fetchProductsNeedingCategoryAssignment,
} from "@/services/supabase/productService";
import { MainCategory, Subcategory } from "@/types";

type MissingFilter = "all" | "main" | "subcategory";

interface UncategorizedProductsWorkspaceProps {
  refreshKey?: number;
  onAssignmentsSaved?: () => void;
}

export default function UncategorizedProductsWorkspace({
  refreshKey = 0,
  onAssignmentsSaved,
}: UncategorizedProductsWorkspaceProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<CategoryAssignmentProduct[]>([]);
  const [categories, setCategories] = useState<MainCategory[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState("none");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MissingFilter>("all");

  const loadData = async () => {
    try {
      setLoading(true);
      const [productRows, mainCategories, subcategoryRows] = await Promise.all([
        fetchProductsNeedingCategoryAssignment(),
        fetchMainCategories(),
        fetchSubcategories(),
      ]);
      setProducts(productRows);
      setCategories(mainCategories);
      setSubcategories(subcategoryRows);
    } catch (error) {
      console.error("Error loading uncategorized products:", error);
      toast.error("تعذر تحميل المنتجات التي تحتاج تصنيفًا");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [refreshKey]);

  const missingMainCount = useMemo(
    () => products.filter((product) => !product.main_category_id).length,
    [products]
  );
  const missingSubcategoryCount = useMemo(
    () => products.filter((product) => !!product.main_category_id && !product.subcategory_id).length,
    [products]
  );

  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  );

  const availableSubcategories = useMemo(
    () => subcategories.filter((subcategory) => subcategory.category_id === selectedCategoryId),
    [selectedCategoryId, subcategories]
  );

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("ar");
    return products.filter((product) => {
      if (filter === "main" && product.main_category_id) return false;
      if (filter === "subcategory" && (!product.main_category_id || product.subcategory_id)) return false;

      if (!normalizedSearch) return true;
      return (
        product.name.toLocaleLowerCase("ar").includes(normalizedSearch) ||
        (product.barcode || "").includes(normalizedSearch)
      );
    });
  }, [filter, products, search]);

  const allVisibleSelected =
    filteredProducts.length > 0 && filteredProducts.every((product) => selectedIds.has(product.id));

  const resetAssignment = () => {
    setSelectedIds(new Set());
    setSelectedCategoryId("");
    setSelectedSubcategoryId("none");
  };

  const toggleProduct = (product: CategoryAssignmentProduct) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(product.id)) next.delete(product.id);
      else next.add(product.id);
      return next;
    });

    if (selectedIds.size === 0 && product.main_category_id) {
      setSelectedCategoryId(product.main_category_id);
      setSelectedSubcategoryId("none");
    }
  };

  const toggleAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) filteredProducts.forEach((product) => next.delete(product.id));
      else filteredProducts.forEach((product) => next.add(product.id));
      return next;
    });
  };

  const handleSave = async () => {
    if (selectedIds.size === 0) {
      toast.error("اختر منتجًا واحدًا على الأقل");
      return;
    }
    if (!selectedCategoryId) {
      toast.error("اختر القسم الرئيسي");
      return;
    }

    try {
      setSaving(true);
      await assignProductsToCategoryHierarchy(
        Array.from(selectedIds),
        selectedCategoryId,
        selectedSubcategoryId === "none" ? null : selectedSubcategoryId
      );
      toast.success(`تم تصنيف ${selectedIds.size} منتج بنجاح`);
      resetAssignment();
      await loadData();
      onAssignmentsSaved?.();
    } catch (error) {
      console.error("Error assigning product categories:", error);
      toast.error(error instanceof Error ? error.message : "تعذر حفظ تصنيف المنتجات");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !open) {
    return (
      <div className="mb-6 flex min-h-28 items-center justify-center rounded-xl border bg-card">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!loading && products.length === 0) {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
          <Check className="h-5 w-5" />
        </span>
        <div>
          <p className="font-semibold">كل المنتجات مصنفة</p>
          <p className="text-sm text-emerald-700">لا توجد منتجات ناقصة القسم الرئيسي أو الفرعي.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="mb-6 overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-l from-amber-50 via-background to-background shadow-sm">
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <AlertCircle className="h-6 w-6" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold">منتجات تحتاج تصنيف</h2>
                <Badge className="bg-amber-600 hover:bg-amber-600">{products.length} منتج</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                كمّل بيانات التصنيف جماعيًا حتى تظهر المنتجات في مكانها الصحيح داخل الـPOS وتطبيق العملاء.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <Badge variant="outline" className="bg-background">
                  بدون قسم رئيسي: {missingMainCount}
                </Badge>
                <Badge variant="outline" className="bg-background">
                  بدون قسم فرعي: {missingSubcategoryCount}
                </Badge>
              </div>
            </div>
          </div>
          <Button className="h-11 gap-2" onClick={() => setOpen(true)}>
            <Sparkles className="h-4 w-4" />
            بدء التصنيف السريع
          </Button>
        </div>
      </section>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) resetAssignment();
        }}
      >
        <DialogContent className="flex h-[94vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4 text-right">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <FolderTree className="h-5 w-5 text-primary" />
              مركز التصنيف السريع
            </DialogTitle>
            <DialogDescription>
              ابحث وحدد المنتجات، ثم اختر القسم مرة واحدة للمجموعة كلها.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-3 border-b bg-muted/20 p-4">
              <div className="flex flex-col gap-2 md:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="ابحث بالاسم أو الباركود..."
                    className="pr-10"
                  />
                </div>
                <Button variant="outline" onClick={toggleAllVisible} disabled={!filteredProducts.length}>
                  {allVisibleSelected ? "إلغاء تحديد النتائج" : "تحديد كل النتائج"}
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {([
                  ["all", `الكل (${products.length})`],
                  ["main", `بدون قسم رئيسي (${missingMainCount})`],
                  ["subcategory", `بدون قسم فرعي (${missingSubcategoryCount})`],
                ] as const).map(([value, label]) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={filter === value ? "default" : "outline"}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="divide-y">
                {filteredProducts.map((product) => {
                  const selected = selectedIds.has(product.id);
                  return (
                    <div
                      key={product.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleProduct(product)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleProduct(product);
                        }
                      }}
                      className={`flex w-full items-center gap-3 p-3 text-right transition-colors hover:bg-muted/50 ${
                        selected ? "bg-primary/5" : ""
                      }`}
                    >
                      <Checkbox
                        checked={selected}
                        aria-label={`اختيار ${product.name}`}
                        onClick={(event) => event.stopPropagation()}
                        onCheckedChange={() => toggleProduct(product)}
                      />
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                        {product.image_urls?.[0] ? (
                          <img
                            src={product.image_urls[0]}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <ImageOff className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{product.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {product.barcode ? `باركود: ${product.barcode}` : "بدون باركود"}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {!product.main_category_id ? (
                            <Badge variant="destructive">بدون قسم رئيسي</Badge>
                          ) : (
                            <Badge variant="outline">
                              {categoryNameById.get(product.main_category_id) || "قسم غير معروف"}
                            </Badge>
                          )}
                          {!product.subcategory_id && (
                            <Badge variant="secondary">بدون قسم فرعي</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {!loading && filteredProducts.length === 0 && (
                  <div className="flex flex-col items-center justify-center px-4 py-16 text-center text-muted-foreground">
                    <PackageSearch className="mb-3 h-10 w-10" />
                    <p className="font-medium">لا توجد منتجات مطابقة</p>
                    <p className="text-sm">غيّر البحث أو الفلتر لعرض نتائج أخرى.</p>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="border-t bg-background p-4 shadow-[0_-8px_24px_-18px_rgba(0,0,0,0.35)]">
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">القسم الرئيسي</label>
                  <Select
                    value={selectedCategoryId}
                    onValueChange={(value) => {
                      setSelectedCategoryId(value);
                      setSelectedSubcategoryId("none");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر القسم الرئيسي" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">القسم الفرعي</label>
                  <Select
                    value={selectedSubcategoryId}
                    onValueChange={setSelectedSubcategoryId}
                    disabled={!selectedCategoryId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر القسم الفرعي" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون قسم فرعي حاليًا</SelectItem>
                      {availableSubcategories.map((subcategory) => (
                        <SelectItem key={subcategory.id} value={subcategory.id}>
                          {subcategory.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className="h-10 min-w-40"
                  onClick={handleSave}
                  disabled={saving || selectedIds.size === 0 || !selectedCategoryId}
                >
                  {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Check className="ml-2 h-4 w-4" />}
                  حفظ ({selectedIds.size})
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
