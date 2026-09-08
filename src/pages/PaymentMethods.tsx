import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ImageIcon, Plus, RefreshCw, Settings2, Trash2 } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import PaymentMethodBrand, {
  PAYMENT_METHOD_LOGO_OPTIONS,
  selectedPaymentMethodLogoKey,
  type PaymentMethodLogoKey,
} from "@/components/payments/PaymentMethodBrand";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useBranchStore } from "@/stores/branchStore";
import {
  calculatePOSPaymentFee,
  deletePOSPaymentMethod,
  fetchPOSPaymentMethods,
  paymentMethodTypeLabel,
  savePOSPaymentMethod,
  type POSPaymentFeeBearer,
  type POSPaymentFeeType,
  type POSPaymentMethod,
  type POSPaymentMethodDraft,
  type POSPaymentMethodType,
} from "@/services/supabase/posPaymentMethodService";

const newMethod = (): POSPaymentMethodDraft => ({
  code: "",
  name: "",
  method_type: "other",
  active: true,
  sort_order: 100,
  fee_type: "none",
  fee_value: 0,
  fee_bearer: "business",
  require_reference: false,
  settlement_account_id: null,
  metadata: { logo_key: "auto" },
});

function feeLabel(method: POSPaymentMethod) {
  if (method.fee_type === "none" || method.fee_value <= 0) return "بدون رسوم";
  const value = method.fee_type === "percent" ? `${method.fee_value}%` : `${method.fee_value.toFixed(2)} ج.م`;
  return `${value} · ${method.fee_bearer === "customer" ? "على العميل" : "على المنشأة"}`;
}

function metadataString(method: POSPaymentMethodDraft, key: string) {
  const value = method.metadata?.[key];
  return typeof value === "string" ? value : "";
}

export default function PaymentMethods() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<POSPaymentMethodDraft | null>(null);
  const [deleting, setDeleting] = useState<POSPaymentMethod | null>(null);

  const query = useQuery({
    queryKey: ["pos-payment-methods", currentBranchId],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchPOSPaymentMethods(currentBranchId!),
  });

  const mutation = useMutation({
    mutationFn: (method: POSPaymentMethodDraft) => savePOSPaymentMethod(currentBranchId!, method),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pos-payment-methods", currentBranchId] });
      setEditing(null);
      toast({ title: "تم حفظ وسيلة الدفع" });
    },
    onError: (error: Error) => toast({ title: "تعذر حفظ وسيلة الدفع", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (method: POSPaymentMethod) => deletePOSPaymentMethod(currentBranchId!, method.id),
    onSuccess: async result => {
      await queryClient.invalidateQueries({ queryKey: ["pos-payment-methods", currentBranchId] });
      setDeleting(null);
      toast({
        title: result.action === "archived" ? "تم حذف الوسيلة مع حفظ سجلها" : "تم حذف وسيلة الدفع",
        description: result.action === "archived"
          ? "اختفت من نقطة البيع، وظلت الفواتير والتسويات القديمة مرتبطة بها بدون أي تغيير."
          : "تم حذف الوسيلة لأنها لم تكن مستخدمة في أي فاتورة.",
      });
    },
    onError: (error: Error) => toast({ title: "تعذر حذف وسيلة الدفع", description: error.message, variant: "destructive" }),
  });

  const methods = query.data || [];
  const activeCount = methods.filter(method => method.active).length;
  const feeCount = methods.filter(method => method.active && method.fee_type !== "none" && method.fee_value > 0).length;
  const preview = useMemo(() => editing ? calculatePOSPaymentFee(editing as POSPaymentMethod, 1000) : null, [editing]);

  const save = () => {
    if (!editing || !currentBranchId || mutation.isPending) return;
    const normalized: POSPaymentMethodDraft = {
      ...editing,
      code: editing.code.trim().toLowerCase().replace(/\s+/g, "_"),
      name: editing.name.trim(),
      sort_order: Number(editing.sort_order || 100),
      fee_value: editing.fee_type === "none" ? 0 : Number(editing.fee_value || 0),
      metadata: editing.metadata || {},
    };
    mutation.mutate(normalized);
  };

  const setLogoKey = (value: PaymentMethodLogoKey) => {
    if (!editing) return;
    setEditing({ ...editing, metadata: { ...(editing.metadata || {}), logo_key: value } });
  };

  const setLogoUrl = (value: string) => {
    if (!editing) return;
    const metadata = { ...(editing.metadata || {}) };
    if (value.trim()) metadata.logo_url = value;
    else delete metadata.logo_url;
    setEditing({ ...editing, metadata });
  };

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <div className="overflow-hidden rounded-3xl bg-[#005931] p-5 text-white shadow-sm md:p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm text-emerald-100"><Settings2 className="h-4 w-4" /> إعدادات التحصيل</div>
              <h1 className="text-2xl font-black md:text-3xl">وسائل الدفع</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50">تحكم في وسائل الدفع واللوجو والعمولة والحالة من مكان واحد، وتظهر نفس الهوية داخل نقطة البيع.</p>
            </div>
            <Button className="bg-white text-[#005931] hover:bg-emerald-50" onClick={() => setEditing(newMethod())} disabled={!currentBranchId}>
              <Plus className="ml-2 h-4 w-4" /> إضافة وسيلة دفع
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">الفرع الحالي</div><div className="mt-1 flex items-center gap-2 font-black"><Building2 className="h-4 w-4 text-[#005931]" />{currentBranchName || "اختر فرعًا"}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">وسائل الدفع المفعلة</div><div className="mt-1 text-2xl font-black text-[#005931]">{activeCount}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">وسائل عليها رسوم</div><div className="mt-1 text-2xl font-black">{feeCount}</div></CardContent></Card>
        </div>

        {!currentBranchId ? (
          <Alert><AlertDescription>اختر الفرع أولًا لعرض وسائل الدفع الخاصة به.</AlertDescription></Alert>
        ) : query.isLoading ? (
          <div className="flex min-h-52 items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-[#005931]" /></div>
        ) : query.error ? (
          <Alert variant="destructive"><AlertDescription>{(query.error as Error).message}</AlertDescription></Alert>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {methods.map(method => {
              const sample = calculatePOSPaymentFee(method, 1000);
              const isCash = method.code === "cash";
              return (
                <Card key={method.id} className={!method.active ? "opacity-60" : ""}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <PaymentMethodBrand method={method} />
                        <div className="min-w-0">
                          <CardTitle className="truncate text-lg">{method.name}</CardTitle>
                          <div className="mt-1 truncate text-xs text-muted-foreground">{paymentMethodTypeLabel(method.method_type)} · {method.code}</div>
                        </div>
                      </div>
                      <Badge variant={method.active ? "default" : "secondary"} className={method.active ? "bg-[#005931]" : ""}>{method.active ? "مفعلة" : "متوقفة"}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-2xl bg-slate-50 p-3 text-sm">
                      <div className="flex justify-between gap-2"><span className="text-muted-foreground">الرسوم</span><strong>{feeLabel(method)}</strong></div>
                      {method.fee_type !== "none" && method.fee_value > 0 && (
                        <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">مثال 1000 ج.م: رسوم {sample.fee.toFixed(2)} ج.م · العميل يدفع {sample.amountCharged.toFixed(2)} ج.م</div>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground"><span>مرجع العملية</span><span>{method.require_reference ? "إجباري" : "اختياري"}</span></div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" onClick={() => setEditing({ ...method, metadata: method.metadata || {} })}>تعديل</Button>
                      <Button variant="destructive" disabled={isCash} onClick={() => setDeleting(method)} title={isCash ? "النقدي وسيلة أساسية ويمكن إيقافها بدل حذفها" : "حذف وسيلة الدفع"}>
                        <Trash2 className="ml-2 h-4 w-4" />{isCash ? "أساسية" : "حذف"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Alert className="border-emerald-200 bg-emerald-50/60">
          <AlertDescription className="leading-6 text-emerald-950">لو حذفت وسيلة استخدمت في فواتير سابقة، النظام يخفيها ويؤرشفها بدل مسح التاريخ المالي. الوسيلة غير المستخدمة تُحذف فعليًا. الرسوم لا تدخل في قيمة المنتجات أو نقاط الولاء.</AlertDescription>
        </Alert>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "تعديل وسيلة الدفع" : "إضافة وسيلة دفع"}</DialogTitle>
            <DialogDescription>الإعدادات تُطبق على الفرع الحالي فقط.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2"><Label>اسم الوسيلة</Label><Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="مثال: فودافون كاش" /></div>
                <div className="space-y-2"><Label>الكود</Label><Input value={editing.code} onChange={e => setEditing({ ...editing, code: e.target.value })} placeholder="vodafone_cash" dir="ltr" /></div>
              </div>

              <div className="space-y-2">
                <Label>النوع</Label>
                <Select value={editing.method_type} onValueChange={value => setEditing({ ...editing, method_type: value as POSPaymentMethodType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">نقدي</SelectItem>
                    <SelectItem value="card">بطاقة بنكية</SelectItem>
                    <SelectItem value="digital_wallet">محفظة رقمية</SelectItem>
                    <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                    <SelectItem value="other">وسيلة أخرى</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-2xl border p-4">
                <div className="mb-3 flex items-center gap-2 font-bold"><ImageIcon className="h-4 w-4 text-[#005931]" /> هوية وسيلة الدفع</div>
                <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                  <PaymentMethodBrand method={editing} />
                  <div className="text-xs leading-5 text-muted-foreground">يظهر اللوجو هنا وفي اختيار وسيلة الدفع داخل الـPOS.</div>
                </div>
                <div className="mt-3 space-y-2">
                  <Label>اللوجو</Label>
                  <Select value={selectedPaymentMethodLogoKey(editing)} onValueChange={value => setLogoKey(value as PaymentMethodLogoKey)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PAYMENT_METHOD_LOGO_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="mt-3 space-y-2">
                  <Label>رابط لوجو مخصص — اختياري</Label>
                  <Input value={metadataString(editing, "logo_url")} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." dir="ltr" />
                  <div className="text-[11px] text-muted-foreground">لو أضفت رابطًا آمنًا HTTPS سيأخذ الأولوية على اللوجو الجاهز.</div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>نوع الرسوم</Label>
                  <Select value={editing.fee_type} onValueChange={value => setEditing({ ...editing, fee_type: value as POSPaymentFeeType, fee_value: value === "none" ? 0 : editing.fee_value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">بدون رسوم</SelectItem><SelectItem value="percent">نسبة مئوية</SelectItem><SelectItem value="fixed">مبلغ ثابت</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>{editing.fee_type === "percent" ? "نسبة الرسوم %" : "قيمة الرسوم"}</Label><Input type="number" min="0" step="0.01" disabled={editing.fee_type === "none"} value={editing.fee_value} onChange={e => setEditing({ ...editing, fee_value: Number(e.target.value || 0) })} /></div>
              </div>

              <div className="space-y-2">
                <Label>من يتحمل الرسوم؟</Label>
                <Select value={editing.fee_bearer} onValueChange={value => setEditing({ ...editing, fee_bearer: value as POSPaymentFeeBearer })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="business">المنشأة</SelectItem><SelectItem value="customer">العميل</SelectItem></SelectContent>
                </Select>
              </div>

              {preview && editing.fee_type !== "none" && editing.fee_value > 0 && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
                  <div className="font-bold text-[#005931]">معاينة على فاتورة 1000 ج.م</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs"><span>قيمة الرسوم</span><strong>{preview.fee.toFixed(2)} ج.م</strong><span>المطلوب من العميل</span><strong>{preview.amountCharged.toFixed(2)} ج.م</strong><span>صافي التسوية المتوقع</span><strong>{preview.estimatedNetSettlement.toFixed(2)} ج.م</strong></div>
                </div>
              )}

              <div className="flex items-center justify-between rounded-2xl border p-3"><div><div className="font-semibold">طلب رقم مرجعي</div><div className="text-xs text-muted-foreground">مفيد للمحافظ والتحويلات وإيصال ماكينة الدفع.</div></div><Switch checked={editing.require_reference} onCheckedChange={value => setEditing({ ...editing, require_reference: value })} /></div>
              <div className="flex items-center justify-between rounded-2xl border p-3"><div><div className="font-semibold">تفعيل وسيلة الدفع</div><div className="text-xs text-muted-foreground">إيقافها يخفيها فورًا من شاشة الـPOS.</div></div><Switch checked={editing.active} onCheckedChange={value => setEditing({ ...editing, active: value })} /></div>
              <div className="space-y-2"><Label>ترتيب الظهور</Label><Input type="number" min="0" step="1" value={editing.sort_order} onChange={e => setEditing({ ...editing, sort_order: Number(e.target.value || 0) })} /></div>
              <Button className="h-12 w-full bg-[#005931] hover:bg-[#004a29]" disabled={mutation.isPending || !editing.name.trim() || !editing.code.trim()} onClick={save}>{mutation.isPending && <RefreshCw className="ml-2 h-4 w-4 animate-spin" />}حفظ وسيلة الدفع</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={open => !open && setDeleting(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700"><Trash2 className="h-5 w-5" /> حذف وسيلة الدفع</DialogTitle>
            <DialogDescription>الحذف مصمم لحماية الفواتير والحسابات القديمة.</DialogDescription>
          </DialogHeader>
          {deleting && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl border p-3"><PaymentMethodBrand method={deleting} /><div><div className="font-black">{deleting.name}</div><div className="text-xs text-muted-foreground">{deleting.code}</div></div></div>
              <Alert><AlertDescription className="leading-6">لو الوسيلة مستخدمة في فاتورة أو تسوية سابقة سيتم <strong>أرشفتها وإخفاؤها</strong> بدل مسح التاريخ. لو لم تُستخدم من قبل سيتم حذفها نهائيًا.</AlertDescription></Alert>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setDeleting(null)} disabled={deleteMutation.isPending}>إلغاء</Button>
                <Button variant="destructive" onClick={() => deleteMutation.mutate(deleting)} disabled={deleteMutation.isPending}>
                  {deleteMutation.isPending ? <RefreshCw className="ml-2 h-4 w-4 animate-spin" /> : <Trash2 className="ml-2 h-4 w-4" />}تأكيد الحذف
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
