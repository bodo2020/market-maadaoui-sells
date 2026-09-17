import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  ChevronLeft,
  CircleDot,
  Layers3,
  Network,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Store,
  Truck,
} from "lucide-react";
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
import { toast } from "sonner";
import {
  BranchChannelKey,
  BranchStructureNode,
  createBranchGroup,
  fetchBusinessStructure,
  MerchantStructureNode,
} from "@/services/supabase/branchControlService";

const merchantLabels: Record<string, string> = {
  owned: "فروع الشركة",
  franchise: "Franchise",
  partner: "Marketplace",
};

const groupTypeLabels: Record<string, string> = {
  region: "منطقة تشغيل",
  operations: "مجموعة تشغيل",
  franchise_network: "شبكة Franchise",
  marketplace_network: "شبكة Marketplace",
  custom: "مجموعة مخصصة",
};

const channelLabels: Partial<Record<BranchChannelKey, string>> = {
  pos: "POS",
  online_sales: "Online",
  customer_app: "Customer",
  marketplace: "Marketplace",
  delivery: "Delivery",
  pickup: "Pickup",
};

function SummaryCard({ label, value, note, icon: Icon }: { label: string; value: number; note: string; icon: typeof Store }) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500">{label}</p>
            <div className="mt-2 text-3xl font-black text-slate-950">{Number(value || 0).toLocaleString("ar-EG")}</div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{note}</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-2.5 text-[#005931]"><Icon className="h-5 w-5" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

function MerchantBadge({ type }: { type: string }) {
  const styles = type === "owned"
    ? "bg-emerald-100 text-emerald-800"
    : type === "franchise"
      ? "bg-blue-100 text-blue-800"
      : "bg-violet-100 text-violet-800";
  return <Badge className={`${styles} hover:${styles}`}>{merchantLabels[type] || type}</Badge>;
}

function ChannelStrip({ branch }: { branch: BranchStructureNode }) {
  const keys: BranchChannelKey[] = ["pos", "online_sales", "customer_app", "marketplace", "delivery", "pickup"];
  return (
    <div className="flex flex-wrap gap-1.5">
      {keys.map((key) => {
        const runtime = branch.channels?.[key];
        const effective = !!runtime?.effective_enabled;
        const configured = !!runtime?.configured_enabled;
        return (
          <span
            key={key}
            title={runtime?.blocked_by?.join(", ") || ""}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black ${
              effective
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : configured
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-slate-200 bg-slate-50 text-slate-400"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${effective ? "bg-emerald-500" : configured ? "bg-amber-500" : "bg-slate-300"}`} />
            {channelLabels[key]}
          </span>
        );
      })}
    </div>
  );
}

function BranchRow({ branch, onOpen }: { branch: BranchStructureNode; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-right transition hover:border-emerald-200 hover:bg-emerald-50/40"
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-black text-slate-950">{branch.name}</h4>
            <Badge variant="outline" className={branch.active ? "border-emerald-200 text-emerald-700" : "border-red-200 text-red-700"}>
              {branch.active ? "نشط" : "متوقف"}
            </Badge>
            <span className="text-[11px] font-bold text-slate-400">{branch.code}</span>
          </div>
          <p className="mt-1 max-w-2xl truncate text-xs text-slate-500">{branch.address || "لا يوجد عنوان مسجل"}</p>
        </div>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          <ChannelStrip branch={branch} />
          <ChevronLeft className="hidden h-4 w-4 shrink-0 text-slate-300 transition group-hover:-translate-x-1 group-hover:text-[#005931] sm:block" />
        </div>
      </div>
    </button>
  );
}

export default function BranchControlCenter() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["business-structure"],
    queryFn: () => fetchBusinessStructure(),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "owned" | "franchise" | "partner">("all");
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupCode, setGroupCode] = useState("");
  const [groupType, setGroupType] = useState("operations");
  const [groupMerchantId, setGroupMerchantId] = useState("");

  const merchants = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("ar");
    return (query.data?.merchants || [])
      .filter((merchant) => typeFilter === "all" || merchant.merchant_type === typeFilter)
      .map((merchant) => ({
        ...merchant,
        branches: merchant.branches.filter((branch) => !q || `${merchant.name} ${merchant.code} ${branch.name} ${branch.code} ${branch.address || ""}`.toLocaleLowerCase("ar").includes(q)),
      }))
      .filter((merchant) => !q || merchant.branches.length > 0 || `${merchant.name} ${merchant.code}`.toLocaleLowerCase("ar").includes(q));
  }, [query.data?.merchants, search, typeFilter]);

  const createGroupMutation = useMutation({
    mutationFn: () => {
      if (!query.data?.tenant.id) throw new Error("لم يتم تحديد الشركة.");
      return createBranchGroup({
        tenantId: query.data.tenant.id,
        code: groupCode,
        name: groupName,
        groupType: groupType as any,
        merchantId: groupMerchantId || null,
      });
    },
    onSuccess: async () => {
      toast.success("تم إنشاء مجموعة الفروع");
      setGroupOpen(false);
      setGroupName("");
      setGroupCode("");
      setGroupMerchantId("");
      await queryClient.invalidateQueries({ queryKey: ["business-structure"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر إنشاء المجموعة"),
  });

  const submitGroup = (event: FormEvent) => {
    event.preventDefault();
    createGroupMutation.mutate();
  };

  const summary = query.data?.summary;

  return (
    <MainLayout>
      <div dir="rtl" className="space-y-6 pb-12">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black text-[#005931]"><Network className="h-4 w-4" /> BUSINESS STRUCTURE</div>
            <h1 className="mt-2 text-3xl font-black text-slate-950">مركز الفروع والشبكة</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              رؤية موحدة لفروع الشركة، الـFranchise، ومتاجر Marketplace مع حالة قنوات التشغيل الفعلية لكل فرع.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
            <Button variant="outline" onClick={() => navigate("/marketplace")}><Store className="ml-2 h-4 w-4" />Marketplace</Button>
            <Button className="bg-[#005931] hover:bg-[#004a29]" onClick={() => setGroupOpen(true)}><Plus className="ml-2 h-4 w-4" />مجموعة فروع</Button>
          </div>
        </div>

        {query.isLoading ? (
          <div className="grid min-h-[320px] place-items-center rounded-3xl border border-slate-200 bg-white"><div className="text-center text-sm font-bold text-slate-500"><RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-[#005931]" />جارٍ تحميل هيكل الفروع…</div></div>
        ) : query.error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-800">{query.error instanceof Error ? query.error.message : "تعذر تحميل هيكل الفروع"}</div>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryCard label="إجمالي الفروع" value={summary?.branch_count || 0} note={`${summary?.active_branch_count || 0} فرع نشط`} icon={Building2} />
              <SummaryCard label="فروع الشركة" value={summary?.owned_branch_count || 0} note="Owned locations" icon={Store} />
              <SummaryCard label="Franchise" value={summary?.franchise_branch_count || 0} note="فروع يديرها مشغلون مستقلون" icon={Layers3} />
              <SummaryCard label="Marketplace" value={summary?.marketplace_branch_count || 0} note="فروع الشركاء المستقلين" icon={ShoppingCart} />
              <SummaryCard label="Online / Delivery" value={summary?.online_branch_count || 0} note={`${summary?.delivery_branch_count || 0} فرع توصيل فعال`} icon={Truck} />
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full lg:max-w-xl">
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم الفرع، الكود، المشغل أو العنوان…" className="pr-10" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["all", "owned", "franchise", "partner"] as const).map((type) => (
                    <button key={type} type="button" onClick={() => setTypeFilter(type)} className={`rounded-full px-3 py-2 text-xs font-black transition ${typeFilter === type ? "bg-[#005931] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                      {type === "all" ? "الكل" : merchantLabels[type]}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              {merchants.map((merchant: MerchantStructureNode) => (
                <Card key={merchant.id} className="overflow-hidden border-slate-200 bg-white shadow-sm">
                  <CardContent className="p-0">
                    <div className="border-b border-slate-100 p-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <MerchantBadge type={merchant.merchant_type} />
                            <Badge variant="outline" className={merchant.status === "active" ? "border-emerald-200 text-emerald-700" : "border-amber-200 text-amber-700"}>{merchant.status}</Badge>
                          </div>
                          <h2 className="mt-3 text-xl font-black text-slate-950">{merchant.name}</h2>
                          <p className="mt-1 text-xs text-slate-500">{merchant.code} • {merchant.branch_count} فرع</p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
                          {merchant.contact_name && <span className="rounded-full bg-slate-100 px-3 py-1.5">{merchant.contact_name}</span>}
                          {merchant.phone && <span className="rounded-full bg-slate-100 px-3 py-1.5">{merchant.phone}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2 p-4">
                      {merchant.branches.length ? merchant.branches.map((branch) => <BranchRow key={branch.id} branch={branch} onOpen={() => navigate(`/branches/${branch.id}`)} />) : <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">لا توجد فروع مطابقة للبحث.</div>}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!merchants.length && <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center"><CircleDot className="mx-auto mb-3 h-8 w-8 text-slate-300" /><p className="font-bold text-slate-500">لا توجد نتائج مطابقة.</p></div>}
            </section>

            {!!query.data?.groups?.length && (
              <section className="space-y-3">
                <div className="flex items-center justify-between"><div><p className="text-xs font-black text-[#005931]">GROUPS</p><h2 className="mt-1 text-xl font-black">مجموعات الفروع</h2></div><Badge variant="outline">{query.data.groups.length} مجموعة</Badge></div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {query.data.groups.map((group) => (
                    <Card key={group.id} className="border-slate-200"><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><Badge variant="outline">{groupTypeLabels[group.group_type] || group.group_type}</Badge><h3 className="mt-3 font-black">{group.name}</h3><p className="mt-1 text-xs text-slate-400">{group.code}</p></div><div className="rounded-2xl bg-slate-50 p-2 text-slate-500"><Layers3 className="h-5 w-5" /></div></div><p className="mt-4 text-xs font-bold text-slate-500">{group.branch_ids?.length || 0} فرع مرتبط</p></CardContent></Card>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent dir="rtl" className="sm:max-w-xl">
          <form onSubmit={submitGroup}>
            <DialogHeader><DialogTitle>إنشاء مجموعة فروع</DialogTitle><DialogDescription>المجموعات هي أساس الإدارة الإقليمية وFranchise Networks وعمليات التحديث الجماعي القادمة.</DialogDescription></DialogHeader>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>اسم المجموعة</Label><Input value={groupName} onChange={(event) => setGroupName(event.target.value)} required placeholder="مثال: القاهرة شرق" /></div>
              <div className="space-y-2"><Label>الكود</Label><Input value={groupCode} onChange={(event) => setGroupCode(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} required placeholder="cairo-east" dir="ltr" /></div>
              <div className="space-y-2"><Label>نوع المجموعة</Label><select value={groupType} onChange={(event) => setGroupType(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="operations">مجموعة تشغيل</option><option value="region">منطقة تشغيل</option><option value="franchise_network">شبكة Franchise</option><option value="marketplace_network">شبكة Marketplace</option><option value="custom">مخصصة</option></select></div>
              <div className="space-y-2"><Label>المشغل — اختياري</Label><select value={groupMerchantId} onChange={(event) => setGroupMerchantId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">كل مشغلي الشركة</option>{query.data?.merchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}</select></div>
            </div>
            <DialogFooter className="mt-6 gap-2"><Button type="button" variant="outline" onClick={() => setGroupOpen(false)}>إلغاء</Button><Button type="submit" className="bg-[#005931] hover:bg-[#004a29]" disabled={createGroupMutation.isPending}>{createGroupMutation.isPending ? "جارٍ الإنشاء…" : "إنشاء المجموعة"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
