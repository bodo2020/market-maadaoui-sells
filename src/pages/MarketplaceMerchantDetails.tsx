import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  EyeOff,
  Globe2,
  MapPinned,
  PackagePlus,
  Percent,
  RefreshCw,
  ShieldCheck,
  Store,
  Truck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  approveMarketplaceMerchant,
  fetchMarketplaceMerchantDetail,
  MarketplaceProductMasterItem,
  MerchantDetailBranch,
  publishMarketplaceMerchant,
  saveMarketplaceCommissionRule,
  saveMarketplaceListing,
  searchMarketplaceProductMaster,
  unpublishMarketplaceMerchant,
  updateMarketplaceBranchProfile,
} from "@/services/supabase/marketplaceAdminService";

const money = (value?: number | null) =>
  `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

const checkLabels: Record<string, string> = {
  merchant_name: "اسم المتجر",
  merchant_contact: "وسيلة تواصل للمتجر",
  branch: "وجود فرع",
  branch_profile: "استكمال بيانات وعنوان الفرع",
  delivery_zone: "منطقة توصيل نشطة لكل فرع",
  commission_rule: "قاعدة عمولة فعالة",
  listing: "منتج واحد على الأقل",
  listing_pricing_inventory: "سعر ومخزون صالحان لكل Listing",
  marketplace_approval: "اعتماد المتجر داخليًا",
  branch_coordinates: "إحداثيات صحيحة لكل فرع",
  in_stock_listing: "Listing واحدة على الأقل بسعر ومخزون متاح",
};

function BranchSetupCard({ merchantId, branch }: { merchantId: string; branch: MerchantDetailBranch }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    address: branch.address || "",
    phone: branch.phone || "",
    email: branch.email || "",
    latitude: branch.latitude?.toString() || "",
    longitude: branch.longitude?.toString() || "",
    deliveryFee: String(branch.delivery_fee ?? 0),
    minOrderAmount: String(branch.min_order_amount ?? 0),
    estimatedDeliveryMinutes: branch.estimated_delivery_minutes?.toString() || "",
  });

  useEffect(() => {
    setForm({
      address: branch.address || "",
      phone: branch.phone || "",
      email: branch.email || "",
      latitude: branch.latitude?.toString() || "",
      longitude: branch.longitude?.toString() || "",
      deliveryFee: String(branch.delivery_fee ?? 0),
      minOrderAmount: String(branch.min_order_amount ?? 0),
      estimatedDeliveryMinutes: branch.estimated_delivery_minutes?.toString() || "",
    });
  }, [branch]);

  const mutation = useMutation({
    mutationFn: () =>
      updateMarketplaceBranchProfile({
        merchantId,
        branchId: branch.id,
        address: form.address,
        phone: form.phone,
        email: form.email,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        deliveryFee: Number(form.deliveryFee || 0),
        minOrderAmount: Number(form.minOrderAmount || 0),
        estimatedDeliveryMinutes: form.estimatedDeliveryMinutes ? Number(form.estimatedDeliveryMinutes) : null,
      }),
    onSuccess: async () => {
      toast.success("تم تحديث بيانات الفرع");
      await queryClient.invalidateQueries({ queryKey: ["marketplace-merchant", merchantId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر تحديث الفرع"),
  });

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{branch.name}</CardTitle>
            <p className="mt-1 text-xs text-slate-400">{branch.code}</p>
          </div>
          <div className="flex gap-2">
            <Badge
              variant="outline"
              className={branch.marketplace_customer_enabled ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}
            >
              {branch.marketplace_customer_enabled ? "منشور في Marketplace" : branch.active ? "نشط داخليًا" : "غير منشور"}
            </Badge>
            <Badge variant="outline">{branch.active_delivery_zone_count} منطقة توصيل نشطة</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2"><Label>العنوان *</Label><Input value={form.address} onChange={(e) => setForm((v) => ({ ...v, address: e.target.value }))} /></div>
          <div className="space-y-2"><Label>الهاتف</Label><Input value={form.phone} onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))} dir="ltr" /></div>
          <div className="space-y-2"><Label>البريد</Label><Input value={form.email} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} dir="ltr" /></div>
          <div className="space-y-2"><Label>Latitude</Label><Input type="number" step="any" value={form.latitude} onChange={(e) => setForm((v) => ({ ...v, latitude: e.target.value }))} dir="ltr" /></div>
          <div className="space-y-2"><Label>Longitude</Label><Input type="number" step="any" value={form.longitude} onChange={(e) => setForm((v) => ({ ...v, longitude: e.target.value }))} dir="ltr" /></div>
          <div className="space-y-2"><Label>رسوم التوصيل</Label><Input type="number" min="0" step="0.01" value={form.deliveryFee} onChange={(e) => setForm((v) => ({ ...v, deliveryFee: e.target.value }))} /></div>
          <div className="space-y-2"><Label>الحد الأدنى للطلب</Label><Input type="number" min="0" step="0.01" value={form.minOrderAmount} onChange={(e) => setForm((v) => ({ ...v, minOrderAmount: e.target.value }))} /></div>
          <div className="space-y-2"><Label>وقت التوصيل المتوقع بالدقائق</Label><Input type="number" min="1" value={form.estimatedDeliveryMinutes} onChange={(e) => setForm((v) => ({ ...v, estimatedDeliveryMinutes: e.target.value }))} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.address.trim()} className="bg-[#005931] hover:bg-[#004426]">
            {mutation.isPending ? "جاري الحفظ..." : "حفظ بيانات الفرع"}
          </Button>
          <Button asChild variant="outline"><Link to="/branch-delivery-zones"><MapPinned className="ml-2 h-4 w-4" />إدارة مناطق التوصيل</Link></Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MarketplaceMerchantDetails() {
  const { merchantId = "" } = useParams();
  const queryClient = useQueryClient();
  const [commissionForm, setCommissionForm] = useState({ name: "عمولة Marketplace", percent: "", fixedFee: "0", basis: "merchandise_subtotal" });
  const [searchDraft, setSearchDraft] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<MarketplaceProductMasterItem | null>(null);
  const [listingForm, setListingForm] = useState({ branchId: "", salePrice: "", purchasePrice: "", quantity: "0", sku: "", preparationMinutes: "15" });

  const detailQuery = useQuery({
    queryKey: ["marketplace-merchant", merchantId],
    queryFn: () => fetchMarketplaceMerchantDetail(merchantId),
    enabled: Boolean(merchantId),
    staleTime: 10_000,
  });

  const productQuery = useQuery({
    queryKey: ["marketplace-product-search", merchantId, searchTerm],
    queryFn: () => searchMarketplaceProductMaster(merchantId, searchTerm),
    enabled: Boolean(merchantId && searchTerm),
  });

  const data = detailQuery.data;
  const merchant = data?.merchant;
  const readiness = data?.readiness;
  const customerReadiness = data?.customer_publish_readiness;
  const branches = data?.branches || [];

  useEffect(() => {
    if (!listingForm.branchId && branches[0]?.id) {
      setListingForm((current) => ({ ...current, branchId: branches[0].id }));
    }
  }, [branches, listingForm.branchId]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["marketplace-merchant", merchantId] });
    await queryClient.invalidateQueries({ queryKey: ["marketplace-admin-dashboard"] });
  };

  const commissionMutation = useMutation({
    mutationFn: () => saveMarketplaceCommissionRule({
      merchantId,
      name: commissionForm.name,
      commissionPercent: Number(commissionForm.percent),
      fixedFee: Number(commissionForm.fixedFee || 0),
      calculationBasis: commissionForm.basis as "merchandise_subtotal" | "order_total" | "net_after_discounts",
    }),
    onSuccess: async () => { toast.success("تم حفظ قاعدة العمولة"); await refresh(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر حفظ العمولة"),
  });

  const listingMutation = useMutation({
    mutationFn: () => {
      if (!selectedProduct) throw new Error("اختر منتجًا من الكتالوج أولًا");
      return saveMarketplaceListing({
        merchantId,
        branchId: listingForm.branchId,
        productId: selectedProduct.id,
        salePrice: Number(listingForm.salePrice),
        purchasePrice: Number(listingForm.purchasePrice),
        quantity: Number(listingForm.quantity),
        merchantSku: listingForm.sku,
        preparationMinutes: listingForm.preparationMinutes ? Number(listingForm.preparationMinutes) : null,
      });
    },
    onSuccess: async () => {
      toast.success("تمت إضافة المنتج للمتجر كـ Draft");
      setSelectedProduct(null);
      setListingForm((current) => ({ ...current, salePrice: "", purchasePrice: "", quantity: "0", sku: "", preparationMinutes: "15" }));
      setSearchDraft("");
      setSearchTerm("");
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر حفظ المنتج"),
  });

  const approvalMutation = useMutation({
    mutationFn: () => approveMarketplaceMerchant(merchantId),
    onSuccess: async () => {
      toast.success("تم اعتماد المتجر داخليًا", { description: "الاعتماد لا ينشر المتجر للعملاء تلقائيًا." });
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر اعتماد المتجر"),
  });

  const publishMutation = useMutation({
    mutationFn: () => publishMarketplaceMerchant(merchantId),
    onSuccess: async (result) => {
      toast.success("تم نشر المتجر للعملاء", { description: `تم نشر ${Number(result.published_listings || 0).toLocaleString("ar-EG")} Listing مؤهلة.` });
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر نشر المتجر للعملاء"),
  });

  const unpublishMutation = useMutation({
    mutationFn: () => unpublishMarketplaceMerchant(merchantId),
    onSuccess: async () => {
      toast.success("تم إيقاف نشر المتجر", { description: "اختفى المتجر ومنتجاته من تطبيق العميل فورًا." });
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر إيقاف نشر المتجر"),
  });

  const missingLabels = useMemo(() => (readiness?.missing || []).map((key) => checkLabels[key] || key), [readiness?.missing]);
  const customerMissingLabels = useMemo(
    () => (customerReadiness?.missing || []).map((key) => checkLabels[key] || key),
    [customerReadiness?.missing],
  );

  const selectProduct = (product: MarketplaceProductMasterItem) => {
    setSelectedProduct(product);
    setListingForm((current) => ({
      ...current,
      salePrice: String(product.default_sale_price ?? 0),
      purchasePrice: String(product.default_purchase_price ?? 0),
    }));
  };

  const submitCommission = (event: FormEvent) => {
    event.preventDefault();
    if (!commissionForm.name.trim() || commissionForm.percent === "") return toast.error("أدخل اسم ونسبة العمولة");
    commissionMutation.mutate();
  };

  const submitListing = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedProduct || !listingForm.branchId || listingForm.salePrice === "" || listingForm.purchasePrice === "") return toast.error("استكمل المنتج والفرع والأسعار");
    listingMutation.mutate();
  };

  return (
    <MainLayout>
      <div dir="rtl" className="space-y-6 pb-12">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <Button asChild variant="ghost" className="mb-2 -mr-3"><Link to="/marketplace"><ArrowRight className="ml-2 h-4 w-4" />العودة إلى Marketplace</Link></Button>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black text-slate-950">{merchant?.name || "تفاصيل المتجر"}</h1>
              {merchant && <Badge variant="outline">{merchant.merchant_type === "partner" ? "متجر شريك" : merchant.merchant_type === "franchise" ? "فرنشايز" : "مملوك"}</Badge>}
              {merchant?.marketplace_approved_at && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">معتمد داخليًا</Badge>}
              {merchant?.customer_published_at
                ? <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100"><Globe2 className="ml-1 h-3.5 w-3.5" />منشور للعملاء</Badge>
                : <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">غير منشور للعملاء</Badge>}
            </div>
            {merchant && <p className="mt-1 text-xs text-slate-400">{merchant.code}</p>}
          </div>
          <Button variant="outline" onClick={() => detailQuery.refetch()} disabled={detailQuery.isFetching}><RefreshCw className={`ml-2 h-4 w-4 ${detailQuery.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
        </div>

        {detailQuery.isLoading && <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />}
        {detailQuery.isError && <div className="rounded-2xl border border-red-200 bg-red-50 p-5 font-bold text-red-800">{detailQuery.error instanceof Error ? detailQuery.error.message : "تعذر تحميل المتجر"}</div>}

        {data && merchant && readiness && (
          <>
            <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
              <Card className={readiness.ready_for_approval ? "border-emerald-200 bg-emerald-50/30" : "border-amber-200 bg-amber-50/30"}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#005931]" /><h2 className="text-lg font-black">جاهزية الاعتماد</h2></div>
                      <p className="mt-2 text-sm text-slate-600">الاعتماد داخلي ومستقل عن النشر للعملاء. بعده يمر المتجر على Customer Publishing Gate منفصل.</p>
                    </div>
                    <Badge className={readiness.ready_for_approval ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-amber-100 text-amber-900 hover:bg-amber-100"}>{readiness.ready_for_approval ? "جاهز" : `${readiness.missing.length} متطلبات ناقصة`}</Badge>
                  </div>
                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    {["merchant_contact", "branch_profile", "delivery_zone", "commission_rule", "listing", "listing_pricing_inventory"].map((key) => {
                      const missing = readiness.missing.includes(key);
                      return <div key={key} className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-bold ${missing ? "border-amber-200 bg-white text-amber-900" : "border-emerald-200 bg-white text-emerald-800"}`}>{missing ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{checkLabels[key]}</div>;
                    })}
                  </div>
                  {missingLabels.length > 0 && <p className="mt-4 text-xs text-slate-500">المتبقي للاعتماد: {missingLabels.join("، ")}</p>}
                </CardContent>
              </Card>

              <Card className={merchant.customer_published_at ? "border-blue-200 bg-blue-50/30" : "border-slate-200"}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2">
                    {merchant.customer_published_at ? <Globe2 className="h-5 w-5 text-blue-700" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
                    <h2 className="font-black">Customer Publishing Gate</h2>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">الاعتماد لا يفتح المتجر تلقائيًا. النشر يتم فقط بعد اكتمال بيانات التواصل، مناطق التوصيل، العمولة، الإحداثيات، وسعر ومخزون Listing مؤهلة.</p>

                  {merchant.merchant_type !== "owned" && !merchant.marketplace_approved_at && (
                    <Button className="mt-5 w-full bg-[#005931] hover:bg-[#004426]" disabled={!readiness.ready_for_approval || approvalMutation.isPending} onClick={() => approvalMutation.mutate()}>
                      {approvalMutation.isPending ? "جاري الاعتماد..." : "اعتماد المتجر داخليًا"}
                    </Button>
                  )}

                  {merchant.merchant_type !== "owned" && merchant.marketplace_approved_at && customerReadiness && (
                    <div className="mt-5 space-y-3 border-t pt-4">
                      <div className="flex items-center justify-between gap-3">
                        <strong className="text-sm">جاهزية النشر للعميل</strong>
                        <Badge className={customerReadiness.ready_for_customer_publish ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-amber-100 text-amber-900 hover:bg-amber-100"}>
                          {customerReadiness.ready_for_customer_publish ? "جاهز للنشر" : `${customerReadiness.missing.length} متطلبات ناقصة`}
                        </Badge>
                      </div>
                      {customerMissingLabels.length > 0 && <p className="text-xs leading-5 text-slate-500">المتبقي: {customerMissingLabels.join("، ")}</p>}

                      {merchant.customer_published_at ? (
                        <Button
                          variant="outline"
                          className="w-full border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                          disabled={unpublishMutation.isPending}
                          onClick={() => {
                            if (window.confirm("إيقاف نشر المتجر سيخفيه ومنتجاته فورًا من تطبيق العميل. هل تريد المتابعة؟")) unpublishMutation.mutate();
                          }}
                        >
                          <EyeOff className="ml-2 h-4 w-4" />
                          {unpublishMutation.isPending ? "جاري إيقاف النشر..." : "إيقاف النشر للعملاء"}
                        </Button>
                      ) : (
                        <Button
                          className="w-full bg-blue-700 hover:bg-blue-800"
                          disabled={!customerReadiness.ready_for_customer_publish || publishMutation.isPending}
                          onClick={() => publishMutation.mutate()}
                        >
                          <Globe2 className="ml-2 h-4 w-4" />
                          {publishMutation.isPending ? "جاري النشر..." : "نشر المتجر للعملاء"}
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="branches" className="space-y-4">
              <TabsList className="h-auto flex-wrap justify-start rounded-2xl bg-slate-100 p-1">
                <TabsTrigger value="branches" className="rounded-xl"><Store className="ml-2 h-4 w-4" />الفروع</TabsTrigger>
                <TabsTrigger value="commission" className="rounded-xl"><Percent className="ml-2 h-4 w-4" />العمولة</TabsTrigger>
                <TabsTrigger value="catalog" className="rounded-xl"><PackagePlus className="ml-2 h-4 w-4" />المنتجات</TabsTrigger>
                <TabsTrigger value="delivery" className="rounded-xl"><Truck className="ml-2 h-4 w-4" />التوصيل</TabsTrigger>
              </TabsList>

              <TabsContent value="branches" className="space-y-4">
                {branches.map((branch) => <BranchSetupCard key={branch.id} merchantId={merchantId} branch={branch} />)}
              </TabsContent>

              <TabsContent value="commission">
                <Card className="border-slate-200">
                  <CardHeader><CardTitle className="text-lg">قاعدة العمولة</CardTitle></CardHeader>
                  <CardContent>
                    <form onSubmit={submitCommission} className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2"><Label>اسم القاعدة</Label><Input value={commissionForm.name} onChange={(e) => setCommissionForm((v) => ({ ...v, name: e.target.value }))} /></div>
                      <div className="space-y-2"><Label>نسبة العمولة %</Label><Input type="number" min="0" max="100" step="0.01" value={commissionForm.percent} onChange={(e) => setCommissionForm((v) => ({ ...v, percent: e.target.value }))} /></div>
                      <div className="space-y-2"><Label>رسوم ثابتة</Label><Input type="number" min="0" step="0.01" value={commissionForm.fixedFee} onChange={(e) => setCommissionForm((v) => ({ ...v, fixedFee: e.target.value }))} /></div>
                      <div className="space-y-2"><Label>أساس الحساب</Label><select value={commissionForm.basis} onChange={(e) => setCommissionForm((v) => ({ ...v, basis: e.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="merchandise_subtotal">إجمالي المنتجات</option><option value="order_total">إجمالي الطلب</option><option value="net_after_discounts">الصافي بعد الخصومات</option></select></div>
                      <div className="md:col-span-2"><Button type="submit" className="bg-[#005931] hover:bg-[#004426]" disabled={commissionMutation.isPending}>{commissionMutation.isPending ? "جاري الحفظ..." : "حفظ قاعدة العمولة"}</Button></div>
                    </form>
                    <div className="mt-6 space-y-2">
                      {data.commission_rules.map((rule) => <div key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"><div><strong>{rule.name}</strong><span className="mr-2 text-slate-500">{Number(rule.commission_percent).toLocaleString("ar-EG")}% + {money(rule.fixed_fee)}</span></div><Badge variant="outline" className={rule.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-800" : ""}>{rule.is_active ? "فعالة" : "منتهية"}</Badge></div>)}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="catalog" className="space-y-4">
                <Card className="border-slate-200">
                  <CardHeader><CardTitle className="text-lg">إضافة منتج من Master Catalog</CardTitle></CardHeader>
                  <CardContent className="space-y-5">
                    <div className="flex gap-2"><Input value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="اسم المنتج أو الباركود" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setSearchTerm(searchDraft.trim()); } }} /><Button type="button" variant="outline" onClick={() => setSearchTerm(searchDraft.trim())} disabled={!searchDraft.trim()}>بحث</Button></div>
                    {productQuery.isFetching && <div className="text-sm text-slate-500">جاري البحث...</div>}
                    {(productQuery.data || []).length > 0 && <div className="grid gap-2 md:grid-cols-2">{productQuery.data?.map((product) => <button key={product.id} type="button" onClick={() => selectProduct(product)} disabled={product.already_listed} className={`rounded-xl border p-3 text-right transition ${selectedProduct?.id === product.id ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white"} ${product.already_listed ? "cursor-not-allowed opacity-50" : "hover:border-emerald-300"}`}><div className="font-black">{product.name}</div><div className="mt-1 text-xs text-slate-400">{product.barcode || "بدون باركود"}</div><div className="mt-2 text-xs text-slate-500">سعر افتراضي {money(product.default_sale_price)}{product.already_listed ? " • مضاف بالفعل" : ""}</div></button>)}</div>}

                    {selectedProduct && <form onSubmit={submitListing} className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-4"><div className="mb-4 font-black">{selectedProduct.name}</div><div className="grid gap-4 md:grid-cols-3"><div className="space-y-2"><Label>الفرع</Label><select value={listingForm.branchId} onChange={(e) => setListingForm((v) => ({ ...v, branchId: e.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div><div className="space-y-2"><Label>سعر البيع</Label><Input type="number" min="0" step="0.01" value={listingForm.salePrice} onChange={(e) => setListingForm((v) => ({ ...v, salePrice: e.target.value }))} /></div><div className="space-y-2"><Label>سعر الشراء</Label><Input type="number" min="0" step="0.01" value={listingForm.purchasePrice} onChange={(e) => setListingForm((v) => ({ ...v, purchasePrice: e.target.value }))} /></div><div className="space-y-2"><Label>الكمية</Label><Input type="number" min="0" step="0.001" value={listingForm.quantity} onChange={(e) => setListingForm((v) => ({ ...v, quantity: e.target.value }))} /></div><div className="space-y-2"><Label>SKU لدى المتجر</Label><Input value={listingForm.sku} onChange={(e) => setListingForm((v) => ({ ...v, sku: e.target.value }))} /></div><div className="space-y-2"><Label>وقت التجهيز بالدقائق</Label><Input type="number" min="0" value={listingForm.preparationMinutes} onChange={(e) => setListingForm((v) => ({ ...v, preparationMinutes: e.target.value }))} /></div></div><Button type="submit" className="mt-4 bg-[#005931] hover:bg-[#004426]" disabled={listingMutation.isPending}>{listingMutation.isPending ? "جاري الإضافة..." : "إضافة كـ Draft"}</Button></form>}
                  </CardContent>
                </Card>

                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="min-w-[900px] w-full text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3 text-right">المنتج</th><th className="p-3 text-right">الفرع</th><th className="p-3 text-right">سعر البيع</th><th className="p-3 text-right">المخزون</th><th className="p-3 text-right">التجهيز</th><th className="p-3 text-right">الحالة</th></tr></thead><tbody>{data.listings.length ? data.listings.map((listing) => <tr key={listing.id} className="border-t"><td className="p-3"><div className="font-bold">{listing.product_name}</div><div className="text-xs text-slate-400">{listing.barcode || listing.merchant_sku || "—"}</div></td><td className="p-3">{listing.branch_name}</td><td className="p-3 font-black">{money(listing.sale_price)}</td><td className="p-3">{Number(listing.quantity || 0).toLocaleString("ar-EG")}</td><td className="p-3">{listing.preparation_minutes ? `${listing.preparation_minutes} د` : "—"}</td><td className="p-3"><Badge variant="outline" className={listing.marketplace_customer_enabled ? "border-emerald-200 bg-emerald-50 text-emerald-800" : ""}>{listing.marketplace_customer_enabled ? "منشور" : listing.status}</Badge></td></tr>) : <tr><td colSpan={6} className="p-8 text-center text-slate-500">لا توجد Listings لهذا المتجر حتى الآن.</td></tr>}</tbody></table></div>
              </TabsContent>

              <TabsContent value="delivery">
                <Card className="border-slate-200">
                  <CardContent className="p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><MapPinned className="h-5 w-5 text-[#005931]" /><h2 className="font-black">مناطق التوصيل</h2></div><p className="mt-2 text-sm text-slate-500">كل فرع شريك يحتاج منطقة توصيل نشطة وإحداثيات صحيحة قبل النشر للعملاء. نستخدم محرر المناطق الموجود بالفعل في النظام.</p></div><Button asChild className="bg-[#005931] hover:bg-[#004426]"><Link to="/branch-delivery-zones">فتح محرر مناطق التوصيل</Link></Button></div>
                    <div className="mt-5 grid gap-3 md:grid-cols-2">{branches.map((branch) => <div key={branch.id} className="rounded-xl border p-4"><div className="font-black">{branch.name}</div><div className="mt-2 text-sm text-slate-500">Zones نشطة: {branch.active_delivery_zone_count}</div><div className="mt-1 text-sm text-slate-500">الإحداثيات: {branch.latitude != null && branch.longitude != null ? "مكتملة" : "ناقصة"}</div><div className="mt-2 text-xs text-slate-400">{branch.code}</div></div>)}</div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </MainLayout>
  );
}
