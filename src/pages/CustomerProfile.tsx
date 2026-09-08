import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import LoyaltyBarcode from "@/components/customers/LoyaltyBarcode";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBranchStore } from "@/stores/branchStore";
import {
  fetchStaffCustomerLoyaltyProfile,
  type StaffCustomerLoyaltyProfile,
} from "@/services/supabase/customerLoyaltyProfileService";
import {
  AlertCircle,
  ArrowRight,
  Barcode,
  Check,
  Gift,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Store,
} from "lucide-react";

const money = (value: number | string | null | undefined) =>
  `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

const number = (value: number | string | null | undefined) => Number(value || 0).toLocaleString("ar-EG");

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "—";
  }
};

const purchaseStatus = (source: "store" | "online", status: string) => {
  if (source === "store") return "تم الشراء";
  const labels: Record<string, string> = {
    pending: "قيد المراجعة",
    confirmed: "تم التأكيد",
    preparing: "جاري التجهيز",
    ready: "جاهز",
    shipped: "في الطريق",
    delivered: "تم التسليم",
    cancelled: "ملغي",
  };
  return labels[status] || status;
};

const ledgerLabel = (type: string) => {
  const labels: Record<string, string> = {
    earn: "اكتساب نقاط",
    redeem: "استخدام نقاط",
    reversal: "عكس نقاط",
    adjustment: "تعديل نقاط",
    bonus: "نقاط إضافية",
  };
  return labels[type] || type;
};

export default function CustomerProfile() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const { currentBranchId } = useBranchStore();
  const [profile, setProfile] = useState<StaffCustomerLoyaltyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!customerId || customerId === "unknown") {
      setError("لا يمكن تحديد العميل.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setProfile(await fetchStaffCustomerLoyaltyProfile(customerId, currentBranchId));
    } catch (cause: any) {
      console.error("Customer loyalty profile error:", cause);
      setError(cause?.message?.includes("CUSTOMER_ACCESS_DENIED")
        ? "ليس لديك صلاحية عرض بيانات هذا العميل على الفرع الحالي."
        : "تعذر تحميل ملف العميل حاليًا.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [customerId, currentBranchId]);

  const initials = useMemo(() => {
    const name = profile?.customer.name?.trim() || "عميل";
    return name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  }, [profile?.customer.name]);

  const totalPurchases = Number(profile?.stats.store_sales_count || 0) + Number(profile?.stats.online_orders_count || 0);
  const totalSpent = Number(profile?.stats.store_sales_total || 0) + Number(profile?.stats.online_orders_total || 0);

  if (loading) {
    return (
      <MainLayout>
        <div dir="rtl" className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
            <Skeleton className="h-[560px] rounded-3xl" />
            <div className="space-y-5"><Skeleton className="h-36 rounded-3xl" /><Skeleton className="h-80 rounded-3xl" /></div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error || !profile) {
    return (
      <MainLayout>
        <div dir="rtl" className="mx-auto max-w-xl p-6">
          <Card><CardContent className="p-8 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="mt-4 text-xl font-bold">تعذر فتح ملف العميل</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error || "العميل غير موجود."}</p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="outline" onClick={() => navigate(-1)}><ArrowRight className="ml-2 h-4 w-4" />رجوع</Button>
              <Button onClick={() => void load()}><RefreshCw className="ml-2 h-4 w-4" />إعادة المحاولة</Button>
            </div>
          </CardContent></Card>
        </div>
      </MainLayout>
    );
  }

  const { customer, loyalty, purchases, ledger } = profile;

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-7xl space-y-5 p-4 pb-10 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="رجوع"><ArrowRight className="h-5 w-5" /></Button>
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">ملف العميل</div>
              <h1 className="truncate text-xl font-black">{customer.name || "عميل بدون اسم"}</h1>
            </div>
          </div>
          <Badge className={loyalty.status === "active" ? "bg-emerald-50 text-[#005931] hover:bg-emerald-50" : "bg-red-50 text-red-700 hover:bg-red-50"}>
            {loyalty.status === "active" ? "عضوية فعالة" : "عضوية موقوفة"}
          </Badge>
        </div>

        <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
          <div className="space-y-5 lg:sticky lg:top-24">
            <Card className="overflow-hidden border-0 shadow-sm ring-1 ring-slate-200">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16"><AvatarFallback className="bg-[#005931] text-lg font-bold text-white">{initials}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-bold">{customer.name || "غير معروف"}</h2>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="outline">عميل</Badge>
                      {customer.phone_verified && <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700"><Check className="ml-1 h-3.5 w-3.5" />موثق</Badge>}
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-3 border-t pt-4 text-sm">
                  {customer.phone && <a href={`tel:${customer.phone}`} className="flex items-center gap-2 text-primary"><Phone className="h-4 w-4" />{customer.phone}</a>}
                  {customer.email && <a href={`mailto:${customer.email}`} className="flex items-center gap-2 text-primary"><Mail className="h-4 w-4" />{customer.email}</a>}
                  {customer.address && <div className="flex items-start gap-2 text-muted-foreground"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /><span>{customer.address}</span></div>}
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-0 bg-[#005931] text-white shadow-[0_16px_40px_rgba(0,89,49,.18)]">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div><div className="flex items-center gap-2 text-sm text-emerald-100"><Gift className="h-4 w-4" />بطاقة المعداوي</div><div className="mt-1 font-mono text-sm font-bold">{loyalty.membership_number}</div></div>
                  <Sparkles className="h-5 w-5 text-emerald-200" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-white/10 p-3"><div className="text-[11px] text-emerald-100">النقاط</div><div className="mt-1 text-xl font-black">{number(loyalty.points_balance)}</div></div>
                  <div className="rounded-xl bg-white/10 p-3"><div className="text-[11px] text-emerald-100">الرصيد</div><div className="mt-1 text-xl font-black">{money(loyalty.redeemable_credit_egp)}</div></div>
                </div>
                <div className="mt-4 rounded-2xl bg-white p-3 text-slate-900">
                  <div className="mb-2 flex items-center justify-between text-[11px]"><span className="flex items-center gap-1 font-bold text-[#005931]"><Barcode className="h-3.5 w-3.5" />باركود العميل</span><span className="font-mono text-slate-500">{loyalty.barcode_token}</span></div>
                  <LoyaltyBarcode value={loyalty.barcode_token} />
                </div>
                <div className="mt-3 flex justify-between text-[11px] text-emerald-100"><span>1 جنيه = 1 نقطة</span><span>1000 نقطة = 5 ج.م</span></div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">إجمالي المشتريات</div><div className="mt-1 text-2xl font-black">{number(totalPurchases)}</div><div className="mt-1 text-[11px] text-muted-foreground">فرع + أونلاين</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">إجمالي الإنفاق</div><div className="mt-1 text-xl font-black text-[#005931]">{money(totalSpent)}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">نقاط مكتسبة تاريخيًا</div><div className="mt-1 text-2xl font-black">{number(loyalty.lifetime_points_earned)}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">نقاط مستخدمة</div><div className="mt-1 text-2xl font-black">{number(loyalty.lifetime_points_redeemed)}</div></CardContent></Card>
            </div>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-[#005931]" />المشتريات الموحدة</CardTitle></CardHeader>
              <CardContent>
                {purchases.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد مشتريات مرتبطة بهذا العميل حتى الآن.</div>
                ) : (
                  <div className="space-y-2">
                    {purchases.map(purchase => (
                      <div key={`${purchase.source_channel}-${purchase.id}`} className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-4">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${purchase.source_channel === "store" ? "bg-emerald-50 text-[#005931]" : "bg-blue-50 text-blue-700"}`}>
                          {purchase.source_channel === "store" ? <Store className="h-5 w-5" /> : <ShoppingBag className="h-5 w-5" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold">{purchase.source_channel === "store" ? "شراء من الفرع" : "طلب أونلاين"}</span>
                            <Badge variant="outline">{purchaseStatus(purchase.source_channel, purchase.status)}</Badge>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {purchase.reference ? `#${purchase.reference} · ` : ""}{formatDate(purchase.created_at)}{purchase.branch_name ? ` · ${purchase.branch_name}` : ""}
                          </div>
                        </div>
                        <div className="text-left">
                          <div className="font-black text-[#005931]">{money(purchase.total)}</div>
                          <div className="mt-1 text-[11px] text-muted-foreground">{number(purchase.item_count)} صنف{purchase.loyalty_points_earned > 0 ? ` · +${number(purchase.loyalty_points_earned)} نقطة` : ""}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2"><Gift className="h-5 w-5 text-[#005931]" />سجل نقاط الولاء</CardTitle></CardHeader>
              <CardContent>
                {ledger.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لسه مفيش حركات نقاط. أول شراء جديد مربوط بالعميل هيظهر هنا.</div>
                ) : (
                  <div className="space-y-2">
                    {ledger.map(entry => (
                      <div key={entry.id} className="flex items-center gap-3 rounded-2xl border p-4">
                        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${entry.points_delta > 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}><Gift className="h-5 w-5" /></span>
                        <div className="min-w-0 flex-1"><div className="font-semibold">{ledgerLabel(entry.entry_type)}</div><div className="mt-1 text-xs text-muted-foreground">{formatDate(entry.created_at)}{entry.branch_name ? ` · ${entry.branch_name}` : ""}{entry.reference ? ` · #${entry.reference}` : ""}</div></div>
                        <div className={`text-lg font-black ${entry.points_delta > 0 ? "text-emerald-700" : "text-amber-700"}`}>{entry.points_delta > 0 ? "+" : ""}{number(entry.points_delta)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
