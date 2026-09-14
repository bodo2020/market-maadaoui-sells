import { useEffect, useMemo, useState } from "react";
import { Banknote, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DeliveryCashHandover {
  id: string;
  amount: number | string;
  requested_at: string;
  driver_user_id: string;
  driver_name: string;
  driver_username?: string | null;
  device_name?: string | null;
  cashier_name?: string | null;
}

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

const money = (value: number | string) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

export default function DeliveryCashHandoverDock() {
  const [items, setItems] = useState<DeliveryCashHandover[]>([]);
  const [loading, setLoading] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [receivedAmount, setReceivedAmount] = useState("");
  const [note, setNote] = useState("");

  const current = items[0] ?? null;
  const expected = Number(current?.amount || 0);
  const received = Number(receivedAmount || 0);
  const hasVariance = current ? Math.round((received - expected) * 100) !== 0 : false;

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const { data, error } = await rpc("get_my_pos_delivery_cash_handovers_v1");
      if (error) throw new Error(error.message || error.code || "handover_load_failed");
      const next = Array.isArray(data) ? data as DeliveryCashHandover[] : [];
      setItems(next);
    } catch (error) {
      if (!quiet) console.error("Delivery cash handover load failed", error);
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 10_000);
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    if (!current) {
      setReceivedAmount("");
      setNote("");
      return;
    }
    setReceivedAmount(String(Number(current.amount || 0)));
    setNote("");
  }, [current?.id]);

  const canReceive = useMemo(() => {
    if (!current || !Number.isFinite(received) || received <= 0 || received > expected) return false;
    if (hasVariance && note.trim().length < 5) return false;
    return true;
  }, [current, received, expected, hasVariance, note]);

  const confirmReceipt = async () => {
    if (!current || !canReceive) return;
    setReceiving(true);
    try {
      const { error } = await rpc("receive_delivery_cash_handover_v2", {
        p_handover_id: current.id,
        p_received_amount: received,
        p_note: note.trim() || null,
      });
      if (error) throw new Error(error.message || error.code || "handover_receive_failed");
      toast.success("تم استلام توريد المندوب", {
        description: `${current.driver_name} • ${money(received)}`,
      });
      await load(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "handover_receive_failed";
      if (message.includes("handover_variance_reason_required")) toast.error("اكتب سبب فرق المبلغ");
      else if (message.includes("target_shift_not_open")) toast.error("الوردية المستهدفة لم تعد مفتوحة");
      else if (message.includes("handover_target_cashier_required")) toast.error("التوريد موجّه لكاشير آخر");
      else toast.error("تعذر استلام التوريد. حدّث البيانات وحاول مرة أخرى.");
    } finally {
      setReceiving(false);
    }
  };

  if (!current && !loading) return null;

  return (
    <div dir="rtl" className="fixed bottom-4 left-4 z-[90] w-[min(92vw,390px)] rounded-2xl border border-emerald-200 bg-white p-4 shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Banknote className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-emerald-800">توريد نقدية من مندوب</p>
            {current ? (
              <>
                <p className="mt-1 truncate text-sm font-bold text-slate-900">{current.driver_name}</p>
                <p className="text-xs text-slate-500">{current.device_name || "الخزنة الحالية"} • المطلوب {money(current.amount)}</p>
              </>
            ) : <p className="mt-1 text-xs text-slate-500">جاري تحميل طلبات التوريد...</p>}
          </div>
        </div>
        <Button variant="ghost" size="icon" disabled={loading} onClick={() => void load()} aria-label="تحديث توريدات المندوبين">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {current && (
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-bold text-slate-700">المبلغ المستلم فعليًا</label>
            <Input
              inputMode="decimal"
              value={receivedAmount}
              onChange={(event) => setReceivedAmount(event.target.value)}
              className="mt-1 text-lg font-extrabold"
            />
          </div>

          {hasVariance && (
            <div>
              <label className="text-xs font-bold text-amber-700">سبب فرق المبلغ</label>
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="مثال: نقص 20 جنيه عند العد"
                className="mt-1"
              />
            </div>
          )}

          <Button className="w-full" disabled={!canReceive || receiving} onClick={() => void confirmReceipt()}>
            {receiving && <Loader2 className="h-4 w-4 animate-spin" />}
            تأكيد استلام {money(received || expected)}
          </Button>
          {items.length > 1 && <p className="text-center text-[11px] text-slate-500">يوجد {items.length - 1} توريد آخر في الانتظار بعد هذا التوريد.</p>}
        </div>
      )}
    </div>
  );
}
