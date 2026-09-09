import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getOnlineOrderSlaPolicy, setOnlineOrderSlaPolicy } from "@/services/onlineOrderSlaPolicyService";

export default function OnlineOrderSlaPolicyCard({ branchId }: { branchId: string }) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [firstResponse, setFirstResponse] = useState(30);
  const [preparation, setPreparation] = useState(60);

  const query = useQuery({
    queryKey: ["online-order-sla-policy-v1", branchId],
    enabled: Boolean(branchId),
    queryFn: () => getOnlineOrderSlaPolicy(branchId),
  });

  useEffect(() => {
    if (!query.data) return;
    setEnabled(query.data.enabled);
    setFirstResponse(query.data.first_response_target_minutes);
    setPreparation(query.data.preparation_target_minutes);
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: () => setOnlineOrderSlaPolicy({
      branchId,
      enabled,
      firstResponseTargetMinutes: firstResponse,
      preparationTargetMinutes: preparation,
    }),
    onSuccess: async () => {
      toast.success(enabled ? "تم تفعيل وتحديث SLA الطلبات" : "تم حفظ SLA مع إبقائه غير مفعّل");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["online-order-sla-policy-v1", branchId] }),
        queryClient.invalidateQueries({ queryKey: ["hr-online-customer-service-performance-v1"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر حفظ SLA الطلبات"),
  });

  if (query.isLoading || query.isError) return null;

  const invalid = firstResponse < 1 || firstResponse > 1440 || preparation < 1 || preparation > 1440;

  return (
    <div className="rounded-2xl border border-[#005931]/15 bg-[#005931]/[0.03] p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-xl">
          <div className="flex items-center gap-2 font-black"><ShieldCheck className="h-4 w-4 text-[#005931]" />SLA الطلبات الإلكترونية</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">عند التفعيل يبدأ النظام بقياس أول استجابة وتجهيز الطلب من الـtimestamps الحقيقية. تغيير الهدف لا يغير تاريخ الطلب؛ يعيد فقط تقييم العينات حسب السياسة الحالية.</p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex h-10 items-center gap-2 rounded-lg border bg-white px-3">
            <Switch checked={enabled} onCheckedChange={setEnabled} id="online-order-sla-enabled" />
            <Label htmlFor="online-order-sla-enabled" className="cursor-pointer text-xs font-bold">{enabled ? "مفعّل" : "غير مفعّل"}</Label>
          </div>
          <div>
            <Label className="mb-1 block text-[11px] text-muted-foreground">أول استجابة / دقيقة</Label>
            <div className="relative"><Clock3 className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input type="number" min={1} max={1440} value={firstResponse} onChange={(e) => setFirstResponse(Number(e.target.value))} className="w-36 pr-8" /></div>
          </div>
          <div>
            <Label className="mb-1 block text-[11px] text-muted-foreground">التجهيز / دقيقة</Label>
            <div className="relative"><Clock3 className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input type="number" min={1} max={1440} value={preparation} onChange={(e) => setPreparation(Number(e.target.value))} className="w-36 pr-8" /></div>
          </div>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || invalid} className="bg-[#005931] hover:bg-[#004525]"><Save className="ml-2 h-4 w-4" />{mutation.isPending ? "جاري الحفظ..." : "حفظ السياسة"}</Button>
        </div>
      </div>
      {invalid && <div className="mt-2 text-xs text-red-600">كل هدف يجب أن يكون بين دقيقة و1440 دقيقة.</div>}
    </div>
  );
}
