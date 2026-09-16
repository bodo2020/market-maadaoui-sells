import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CircleDollarSign,
  PackageSearch,
  Plus,
  RefreshCw,
  ShoppingBag,
  Store,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createMarketplacePartner,
  fetchMarketplaceAdminDashboard,
  MarketplaceMerchant,
} from "@/services/supabase/marketplaceAdminService";

const money = (value?: number | null) =>
  `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

const number = (value?: number | null) => Number(value || 0).toLocaleString("ar-EG");

function merchantTypeLabel(type: MarketplaceMerchant["merchant_type"]) {
  if (type === "owned") return "مملوك للمعداوي";
  if (type === "franchise") return "فرنشايز";
  return "متجر شريك";
}

function merchantStatusLabel(status: MarketplaceMerchant["status"]) {
  const map: Record<string, string> = {
    draft: "مسودة",
    pending: "تحت التجهيز",
    active: "نشط",
    suspended: "موقوف",
    inactive: "غير نشط",
  };
  return map[status] || status;
}

function statusClass(status: string) {
  if (status === "active" || status === "paid") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "pending" || status === "draft") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "suspended" || status === "cancelled") return "border-red-200 bg-red-50 text-red-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function SummaryCard({
  title,
  value,
  note,
  icon: Icon,
  warning = false,
}: {
  title: string;
  value: string;
  note: string;
  icon: React.ElementType;
  warning?: boolean;
}) {
  return (
    <Card className={warning ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-white"}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500">{title}</p>
            <div className={`mt-2 text-2xl font-black ${warning ? "text-amber-900" : "text-slate-950"}`}>{value}</div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{note}</p>
          </div>
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${warning ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-[#005931]"}`}>
            <Icon className="h-5 w-5" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function MerchantTable({ merchants }: { merchants: MarketplaceMerchant[] }) {
  if (!merchants.length) {
    return <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">لا توجد متاجر مسجلة حتى الآن.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="min-w-[980px] w-full text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="p-3 text-right">المتجر</th>
            <th className="p-3 text-right">النوع</th>
            <th className="p-3 text-right">الفروع</th>
            <th className="p-3 text-right">المنتجات</th>
            <th className="p-3 text-right">الطلبات</th>
            <th className="p-3 text-right">مستحق غير مسوى</th>
            <th className="p-3 text-right">العمولة</th>
            <th className="p-3 text-right">الحالة</th>
          </tr>
        </thead>
        <tbody>
          {merchants.map((merchant) => (
            <tr key={merchant.id} className="border-t border-slate-100 align-top">
              <td className="p-3">
                <div className="font-black text-slate-950">{merchant.name}</div>
                <div className="mt-1 text-xs text-slate-400">{merchant.code}</div>
                {merchant.contact_name && <div className="mt-1 text-xs text-slate-500">{merchant.contact_name}</div>}
              </td>
              <td className="p-3"><Badge variant="outline">{merchantTypeLabel(merchant.merchant_type)}</Badge></td>
              <td className="p-3">
                <div className="font-bold">{number(merchant.branch_count)}</div>
                <div className="mt-1 text-xs text-slate-500">{number(merchant.active_branch_count)} نشط</div>
              </td>
              <td className="p-3">
                <div className="font-bold">{number(merchant.listing_count)}</div>
                <div className="mt-1 text-xs text-slate-500">{number(merchant.active_listing_count)} منشور</div>
              </td>
              <td className="p-3 font-bold">{number(merchant.order_count)}</td>
              <td className="p-3 font-black">{money(merchant.unsettled_balance)}</td>
              <td className="p-3">
                {merchant.merchant_type === "owned" ? (
                  <span className="text-xs text-slate-500">غير مطلوبة</span>
                ) : merchant.commission_rule_count > 0 ? (
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">مضبوطة</Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">تحتاج قاعدة</Badge>
                )}
              </td>
              <td className="p-3"><Badge variant="outline" className={statusClass(merchant.status)}>{merchantStatusLabel(merchant.status)}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Marketplace() {
  const queryClient = useQueryClient();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    merchantName: "",
    branchName: "",
    branchCode: "",
    contactName: "",
    phone: "",
    email: "",
    address: "",
  });

  const query = useQuery({
    queryKey: ["marketplace-admin-dashboard", tenantId || "default"],
    queryFn: () => fetchMarketplaceAdminDashboard(tenantId),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const data = query.data;

  useEffect(() => {
    if (!tenantId && data?.tenant?.id) setTenantId(data.tenant.id);
  }, [tenantId, data?.tenant?.id]);

  const partnerMutation = useMutation({
    mutationFn: async () => {
      if (!data?.tenant.id) throw new Error("تعذر تحديد الشركة الحالية.");
      return createMarketplacePartner({ tenantId: data.tenant.id, ...form });
    },
    onSuccess: async () => {
      toast.success("تم إنشاء المتجر الشريك كمسودة آمنة", {
        description: "الفرع غير نشط والتوصيل غير مفعل حتى نكمل الاعتماد والكتالوج.",
      });
      setDialogOpen(false);
      setForm({ merchantName: "", branchName: "", branchCode: "", contactName: "", phone: "", email: "", address: "" });
      await queryClient.invalidateQueries({ queryKey: ["marketplace-admin-dashboard"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر إنشاء المتجر الشريك"),
  });

  const partnerAndFranchise = useMemo(
    () => (data?.merchants || []).filter((merchant) => merchant.merchant_type !== "owned"),
    [data?.merchants],
  );

  const merchantsMissingCommission = useMemo(
    () => partnerAndFranchise.filter((merchant) => merchant.commission_rule_count === 0),
    [partnerAndFranchise],
  );

  const submitPartner = (event: FormEvent) => {
    event.preventDefault();
    if (!form.merchantName.trim() || !form.branchName.trim()) {
      toast.error("اسم المتجر واسم الفرع مطلوبان");
      return;
    }
    partnerMutation.mutate();
  };

  return (
    <MainLayout>
      <div dir="rtl" className="space-y-6 pb-12">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black text-slate-950">Marketplace</h1>
              <Badge className="bg-[#005931] hover:bg-[#005931]">Foundation V1</Badge>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              إدارة المتاجر الشريكة، ملكية المنتجات، العمولة والمستحقات من طبقة واحدة معزولة عن تشغيل الـPOS الحالي.
            </p>
            {data?.tenant && <p className="mt-1 text-xs font-bold text-slate-400">{data.tenant.name}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(data?.manageable_tenants?.length || 0) > 1 && (
              <select
                value={data?.tenant.id || tenantId || ""}
                onChange={(event) => setTenantId(event.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-emerald-400"
              >
                {data?.manageable_tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
              </select>
            )}
            <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث
            </Button>
            <Button onClick={() => setDialogOpen(true)} className="bg-[#005931] hover:bg-[#004426]" disabled={!data?.tenant.id}>
              <Plus className="ml-2 h-4 w-4" />إضافة متجر شريك
            </Button>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="font-black">الإطلاق ما زال مغلقًا على العملاء</div>
            <p className="mt-1 text-sm leading-6 text-amber-800">
              إضافة متجر هنا تنشئه بحالة Pending وفرعه غير نشط والتوصيل مغلق. لن يظهر أي متجر أو Listing في تطبيق العميل قبل مرحلة اعتماد الكتالوج والـCheckout.
            </p>
          </div>
        </div>

        {query.isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-slate-100" />)}
          </div>
        )}

        {query.isError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-800">
            {query.error instanceof Error ? query.error.message : "تعذر تحميل Marketplace"}
          </div>
        )}

        {data && (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard title="إجمالي البائعين" value={number(data.summary.merchant_count)} note={`${number(data.summary.partner_count)} شريك + ${number(data.summary.franchise_count)} فرنشايز + ${number(data.summary.owned_count)} مملوك`} icon={Store} />
              <SummaryCard title="تحت التجهيز" value={number(data.summary.pending_count)} note="متاجر تم إنشاؤها لكنها لم تدخل مرحلة النشر للعملاء." icon={Building2} warning={data.summary.pending_count > 0} />
              <SummaryCard title="Listings" value={number(data.summary.listing_count)} note={`${number(data.summary.active_listing_count)} Listing نشط حاليًا.`} icon={PackageSearch} />
              <SummaryCard title="طلبات Marketplace" value={number(data.summary.marketplace_order_count)} note="طلبات الفرنشايز والمتاجر الشريكة فقط؛ طلبات المعداوي المملوكة غير داخلة هنا." icon={ShoppingBag} />
              <SummaryCard title="مستحق غير مسوى" value={money(data.summary.unsettled_payable)} note="صافي Merchant Payables غير المرتبط بأي Settlement حتى الآن." icon={CircleDollarSign} warning={data.summary.unsettled_payable !== 0} />
              <SummaryCard title="تسويات Draft" value={number(data.summary.draft_settlement_count)} note="Batch تسوية تم تجهيزه ولم يدخل بعد مرحلة الاعتماد والدفع." icon={WalletCards} warning={data.summary.draft_settlement_count > 0} />
              <SummaryCard title="متاجر نشطة" value={number(data.summary.active_count)} note="يشمل المتجر المملوك والفرنشايز الحالية." icon={Store} />
              <SummaryCard title="تحتاج قاعدة عمولة" value={number(merchantsMissingCommission.length)} note="لن يسمح المحرك المالي بترحيل عمولة شريك أو فرنشايز بدون Rule صريحة." icon={AlertTriangle} warning={merchantsMissingCommission.length > 0} />
            </section>

            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="h-auto flex-wrap justify-start rounded-2xl bg-slate-100 p-1">
                <TabsTrigger value="overview" className="rounded-xl">نظرة عامة</TabsTrigger>
                <TabsTrigger value="merchants" className="rounded-xl">المتاجر</TabsTrigger>
                <TabsTrigger value="catalog" className="rounded-xl">الكتالوج</TabsTrigger>
                <TabsTrigger value="commissions" className="rounded-xl">العمولات</TabsTrigger>
                <TabsTrigger value="settlements" className="rounded-xl">التسويات</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  {(data.merchants || []).map((merchant) => (
                    <Card key={merchant.id} className="border-slate-200">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-black">{merchant.name}</h3>
                              <Badge variant="outline">{merchantTypeLabel(merchant.merchant_type)}</Badge>
                              <Badge variant="outline" className={statusClass(merchant.status)}>{merchantStatusLabel(merchant.status)}</Badge>
                            </div>
                            <p className="mt-1 text-xs text-slate-400">{merchant.code}</p>
                          </div>
                          <Store className="h-5 w-5 text-[#005931]" />
                        </div>
                        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">الفروع</div><div className="mt-1 font-black">{number(merchant.branch_count)}</div></div>
                          <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">Listings</div><div className="mt-1 font-black">{number(merchant.listing_count)}</div></div>
                          <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">الطلبات</div><div className="mt-1 font-black">{number(merchant.order_count)}</div></div>
                          <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">المستحق</div><div className="mt-1 font-black">{money(merchant.unsettled_balance)}</div></div>
                        </div>
                        <div className="mt-4 space-y-2">
                          {merchant.branches.map((branch) => (
                            <div key={branch.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 p-3 text-xs">
                              <div><strong>{branch.name}</strong><span className="mr-2 text-slate-400">{branch.code}</span></div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={branch.active ? statusClass("active") : statusClass("pending")}>{branch.active ? "نشط" : "غير مفعل"}</Badge>
                                <Badge variant="outline">{branch.delivery_enabled ? "توصيل مفعل" : "التوصيل مغلق"}</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="merchants" className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><h2 className="text-lg font-black">المتاجر والبائعون</h2><p className="mt-1 text-xs text-slate-500">Owned + Franchise + Partners داخل نفس Tenant مع فصل الملكية على مستوى الفرع.</p></div>
                  <Button onClick={() => setDialogOpen(true)} className="bg-[#005931] hover:bg-[#004426]"><Plus className="ml-2 h-4 w-4" />متجر شريك جديد</Button>
                </div>
                <MerchantTable merchants={data.merchants} />
              </TabsContent>

              <TabsContent value="catalog" className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h2 className="text-lg font-black">ملكية الكتالوج حسب البائع</h2>
                  <p className="mt-1 text-sm text-slate-500">المنتج يظل واحدًا في Product Master؛ السعر من Branch Pricing والمخزون من Inventory والـListing يحدد البائع والفرع فقط.</p>
                </div>
                <MerchantTable merchants={data.merchants} />
                <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 p-5 text-sm text-emerald-900">
                  محرر إضافة المنتجات للشريك موجود في الـBackend بالفعل، لكن نشر Listing للعميل سيظل مغلقًا حتى مرحلة Customer Marketplace Catalog والـCheckout.
                </div>
              </TabsContent>

              <TabsContent value="commissions" className="space-y-4">
                {merchantsMissingCommission.length > 0 && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <strong>مطلوب ضبط عمولة قبل أي ترحيل مالي:</strong> {merchantsMissingCommission.map((merchant) => merchant.name).join("، ")}.
                  </div>
                )}
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                  <table className="min-w-[760px] w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500"><tr><th className="p-3 text-right">القاعدة</th><th className="p-3 text-right">المتجر</th><th className="p-3 text-right">النسبة</th><th className="p-3 text-right">رسوم ثابتة</th><th className="p-3 text-right">الأساس</th><th className="p-3 text-right">الحالة</th></tr></thead>
                    <tbody>
                      {data.commission_rules.length ? data.commission_rules.map((rule) => (
                        <tr key={rule.id} className="border-t"><td className="p-3 font-bold">{rule.name}</td><td className="p-3">{rule.merchant_name || "قاعدة عامة"}</td><td className="p-3 font-black">{Number(rule.commission_percent).toLocaleString("ar-EG")}%</td><td className="p-3">{money(rule.fixed_fee)}</td><td className="p-3 text-xs text-slate-500">{rule.calculation_basis}</td><td className="p-3"><Badge variant="outline" className={rule.is_active ? statusClass("active") : statusClass("inactive")}>{rule.is_active ? "نشطة" : "متوقفة"}</Badge></td></tr>
                      )) : <tr><td colSpan={6} className="p-8 text-center text-slate-500">لا توجد قواعد عمولة حتى الآن.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="settlements" className="space-y-4">
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                  <table className="min-w-[860px] w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500"><tr><th className="p-3 text-right">المرجع</th><th className="p-3 text-right">المتجر</th><th className="p-3 text-right">إجمالي دائن</th><th className="p-3 text-right">الخصومات</th><th className="p-3 text-right">صافي المستحق</th><th className="p-3 text-right">الحالة</th></tr></thead>
                    <tbody>
                      {data.settlements.length ? data.settlements.map((settlement) => (
                        <tr key={settlement.id} className="border-t"><td className="p-3 font-mono text-xs">{settlement.reference}</td><td className="p-3 font-bold">{settlement.merchant_name}</td><td className="p-3">{money(settlement.gross_credits)}</td><td className="p-3">{money(settlement.total_deductions)}</td><td className="p-3 font-black">{money(settlement.net_payable)}</td><td className="p-3"><Badge variant="outline" className={statusClass(settlement.status)}>{settlement.status}</Badge></td></tr>
                      )) : <tr><td colSpan={6} className="p-8 text-center text-slate-500">لا توجد Settlement Batches حتى الآن؛ المحرك المالي لم يتم ربطه تلقائيًا بالطلبات بعد.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent dir="rtl" className="max-w-2xl">
            <form onSubmit={submitPartner}>
              <DialogHeader className="text-right">
                <DialogTitle>إضافة متجر شريك</DialogTitle>
                <DialogDescription className="text-right">
                  يتم إنشاء الـMerchant والفرع كـPending/Inactive. لا يوجد نشر تلقائي للعميل.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="merchantName">اسم المتجر *</Label><Input id="merchantName" value={form.merchantName} onChange={(e) => setForm((current) => ({ ...current, merchantName: e.target.value }))} placeholder="مثال: ماركت السلام" autoFocus /></div>
                <div className="space-y-2"><Label htmlFor="branchName">اسم الفرع *</Label><Input id="branchName" value={form.branchName} onChange={(e) => setForm((current) => ({ ...current, branchName: e.target.value }))} placeholder="مثال: فرع شارع المدارس" /></div>
                <div className="space-y-2"><Label htmlFor="branchCode">كود الفرع</Label><Input id="branchCode" value={form.branchCode} onChange={(e) => setForm((current) => ({ ...current, branchCode: e.target.value }))} placeholder="اختياري — يتم توليده تلقائيًا" dir="ltr" /></div>
                <div className="space-y-2"><Label htmlFor="contactName">اسم المسؤول</Label><Input id="contactName" value={form.contactName} onChange={(e) => setForm((current) => ({ ...current, contactName: e.target.value }))} /></div>
                <div className="space-y-2"><Label htmlFor="phone">رقم الهاتف</Label><Input id="phone" value={form.phone} onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))} dir="ltr" /></div>
                <div className="space-y-2"><Label htmlFor="email">البريد الإلكتروني</Label><Input id="email" type="email" value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} dir="ltr" /></div>
                <div className="space-y-2 sm:col-span-2"><Label htmlFor="address">العنوان</Label><Input id="address" value={form.address} onChange={(e) => setForm((current) => ({ ...current, address: e.target.value }))} placeholder="العنوان التفصيلي للمتجر" /></div>
              </div>

              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                بعد الإنشاء سيظل المتجر غير ظاهر للعملاء، والفرع غير نشط والتوصيل مغلق حتى نعمل مراجعة واعتماد للعمولة والكتالوج ومناطق الخدمة.
              </div>

              <DialogFooter className="mt-6 gap-2 sm:justify-start">
                <Button type="submit" className="bg-[#005931] hover:bg-[#004426]" disabled={partnerMutation.isPending || !form.merchantName.trim() || !form.branchName.trim()}>
                  {partnerMutation.isPending ? "جاري الإنشاء..." : "إنشاء كمسودة آمنة"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={partnerMutation.isPending}>إلغاء</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
