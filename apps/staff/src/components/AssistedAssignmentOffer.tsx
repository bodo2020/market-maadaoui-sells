import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Loader2, PackageCheck, SkipForward } from "lucide-react";
import { supabase } from "../lib/supabase";
import { getStaffBranches } from "../services/staffService";
import {
  acceptMyPickerAssignmentOffer,
  declineMyPickerAssignmentOffer,
  getMyPickerAssignmentOffer,
  type PickerAssignmentOffer,
} from "../services/assignmentOfferService";

function secondsUntil(expiresAt: string) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

export default function AssistedAssignmentOffer() {
  const [offer, setOffer] = useState<PickerAssignmentOffer | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState<"accept" | "decline" | "">("");
  const [error, setError] = useState("");

  const resolveBranch = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setBranchId(null);
      setOffer(null);
      return null;
    }
    const branches = await getStaffBranches();
    const branch = branches.find((row) => row.is_primary) || branches[0];
    const id = branch?.branch_id || null;
    setBranchId(id);
    return id;
  }, []);

  const load = useCallback(async () => {
    try {
      const id = branchId || await resolveBranch();
      if (!id) return;
      const payload = await getMyPickerAssignmentOffer(id);
      if (payload.mode !== "assisted" || !payload.offer) {
        setOffer(null);
        return;
      }
      setOffer(payload.offer);
      setSeconds(secondsUntil(payload.offer.expires_at));
      setError("");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      if (!message.includes("AUTH_REQUIRED") && !message.includes("FULFILLMENT_PERMISSION_DENIED")) {
        setError("تعذر تحديث اقتراح المهمة");
      }
    }
  }, [branchId, resolveBranch]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 7000);
    const { data } = supabase.auth.onAuthStateChange(() => void resolveBranch().then(() => load()));
    return () => {
      window.clearInterval(interval);
      data.subscription.unsubscribe();
    };
  }, [load, resolveBranch]);

  useEffect(() => {
    if (!offer) return;
    const timer = window.setInterval(() => {
      const next = secondsUntil(offer.expires_at);
      setSeconds(next);
      if (next <= 0) void load();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [offer, load]);

  useEffect(() => {
    if (!branchId) return;
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id;
      if (!active || !userId) return;
      const channel = supabase.channel(`picker-offer-${userId}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "notification_realtime_signals_v2",
          filter: `recipient_user_id=eq.${userId}`,
        }, () => void load())
        .subscribe();
      const originalCleanup = () => { void supabase.removeChannel(channel); };
      (window as Window & { __pickerOfferCleanup?: () => void }).__pickerOfferCleanup = originalCleanup;
    });
    return () => {
      active = false;
      const holder = window as Window & { __pickerOfferCleanup?: () => void };
      holder.__pickerOfferCleanup?.();
      holder.__pickerOfferCleanup = undefined;
    };
  }, [branchId, load]);

  const readyTime = useMemo(() => {
    if (!offer?.predicted_ready_at) return "—";
    return new Intl.DateTimeFormat("ar-EG", { hour: "2-digit", minute: "2-digit" }).format(new Date(offer.predicted_ready_at));
  }, [offer?.predicted_ready_at]);

  if (!offer) return null;

  const accept = async () => {
    setBusy("accept");
    setError("");
    try {
      const result = await acceptMyPickerAssignmentOffer(offer.offer_id);
      setOffer(null);
      window.location.assign(`/operations/${result.order_id}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(message.includes("OFFER_EXPIRED") ? "انتهت مدة العرض وتم تحويل الطلب تلقائيًا" : "تعذر استلام الطلب. سيتم تحديث الاقتراح.");
      await load();
    } finally {
      setBusy("");
    }
  };

  const decline = async () => {
    setBusy("decline");
    setError("");
    try {
      await declineMyPickerAssignmentOffer(offer.offer_id);
      setOffer(null);
      await load();
    } catch {
      setError("تعذر تخطي المهمة حاليًا");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="assignment-offer-backdrop" role="dialog" aria-modal="true" aria-label="مهمة تجهيز مقترحة">
      <section className="assignment-offer-sheet">
        <div className="assignment-offer-topline">
          <span className="assignment-live-dot" />
          <strong>مهمة تجهيز مقترحة لك</strong>
          <span className="assignment-countdown"><Clock3 size={16} /> {seconds} ث</span>
        </div>

        <div className="assignment-offer-icon"><PackageCheck /></div>
        <small>النظام اختارك كأفضل موظف متاح حاليًا</small>
        <h2>{offer.display_id}</h2>
        <p className="assignment-customer">{offer.customer_name}</p>

        <div className="assignment-offer-stats">
          <div><strong>{offer.items_total}</strong><span>أصناف</span></div>
          <div><strong>{readyTime}</strong><span>جاهزية متوقعة</span></div>
          <div><strong>{Number(offer.recommended_score || 0).toFixed(0)}</strong><span>درجة الاختيار</span></div>
        </div>

        {error && <div className="assignment-offer-error">{error}</div>}

        <button className="assignment-accept" disabled={Boolean(busy) || seconds <= 0} onClick={() => void accept()}>
          {busy === "accept" ? <Loader2 className="spin" /> : <CheckCircle2 />}
          قبول وبدء التجهيز
        </button>
        <button className="assignment-decline" disabled={Boolean(busy)} onClick={() => void decline()}>
          {busy === "decline" ? <Loader2 className="spin" /> : <SkipForward />}
          تخطي هذه المهمة
        </button>
        <p className="assignment-hint">لو انتهى الوقت من غير رد، الطلب ينتقل تلقائيًا لموظف آخر مناسب.</p>
      </section>
    </div>
  );
}
