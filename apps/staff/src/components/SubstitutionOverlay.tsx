import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, PackageSearch, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import * as staff from "../services/staffService";
import type { PickingItem, PickingSession, SubstitutionCandidate } from "../services/staffService";

function currentOrderId() {
  const match = window.location.pathname.match(/^\/operations\/([^/]+)$/);
  return match?.[1] || "";
}

function remaining(item: PickingItem) {
  return Math.max(0, Number(item.required_quantity) - Number(item.picked_quantity) - Number(item.shortage_quantity) - Number(item.substitution_quantity));
}

function qty(value: number, weight = false) {
  return weight
    ? `${Number(value).toLocaleString("ar-EG", { maximumFractionDigits: 3 })} كجم`
    : Number(value).toLocaleString("ar-EG", { maximumFractionDigits: 3 });
}

function money(value: number) {
  const n = Number(value || 0);
  return `${n > 0 ? "+" : ""}${n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
}

function policyLabel(policy?: PickingSession["substitution_policy"]) {
  if (policy === "allow_substitutions") return "العميل يسمح ببديل مناسب إذا كان بنفس السعر أو أقل؛ الزيادة تحتاج موافقته.";
  if (policy === "contact_me") return "العميل يريد الموافقة من التطبيق قبل أي استبدال.";
  if (policy === "remove_item") return "العميل اختار حذف الصنف إذا لم يتوفر.";
  return "الطلب قديم: موافقة المدير مطلوبة للبديل.";
}

function financialStateLabel(state?: string | null) {
  if (state === "settled" || state === "applied_to_order_total") return "فرق السعر محسوب في إجمالي الطلب";
  if (state === "pending_collection") return "اعتماد البديل تم · فرق السعر بانتظار التحصيل";
  if (state === "pending_refund") return "اعتماد البديل تم · فرق السعر بانتظار الرد للعميل";
  if (state === "not_required") return "لا توجد تسوية مالية مطلوبة";
  if (state === "waived") return "تم إعفاء فرق السعر";
  return "جاري تحديث التسوية المالية";
}

function smartReasons(candidate: SubstitutionCandidate) {
  const reasons: string[] = [];
  if (candidate.is_predefined) reasons.push("بديل معتمد مسبقًا");
  if (candidate.same_brand) reasons.push("نفس العلامة");
  else reasons.push("نفس التصنيف");
  if (Number(candidate.price_delta_per_unit || 0) <= 0) reasons.push("بدون زيادة سعر");
  if (Number(candidate.available_quantity || 0) >= 3) reasons.push("مخزونه مطمئن");
  return reasons.slice(0, 3);
}

function StatusBlock({ item, onChanged }: { item: PickingItem; onChanged: () => Promise<void> }) {
  const sub = item.substitution;
  const [busy, setBusy] = useState(false);
  if (!sub) return null;
  if (sub.status === "pending") {
    return (
      <div className="sub-status pending">
        <div><strong>في انتظار اعتماد البديل</strong><small>{sub.replacement_product_name} · {qty(sub.quantity, item.is_weight_based)} · فرق {money(sub.price_delta_total)}</small></div>
        <button disabled={busy} onClick={async () => { setBusy(true); try { await staff.cancelSubstitution(sub.id); await onChanged(); } finally { setBusy(false); } }}>{busy ? <Loader2 className="spin" /> : <X />}إلغاء</button>
      </div>
    );
  }
  if (sub.status === "approved") {
    return <div className="sub-status approved"><CheckCircle2 /><div><strong>تم اعتماد البديل</strong><small>{sub.replacement_product_name} · {qty(sub.quantity, item.is_weight_based)} · فرق {money(sub.price_delta_total)}</small><small>{financialStateLabel(sub.financial_state)}</small></div></div>;
  }
  if (sub.status === "rejected") {
    return <div className="sub-status rejected"><AlertTriangle /><div><strong>تم رفض الاقتراح السابق</strong><small>{sub.resolution_note || sub.replacement_product_name}</small></div></div>;
  }
  return null;
}

export default function SubstitutionOverlay() {
  const [orderId, setOrderId] = useState(currentOrderId);
  const [session, setSession] = useState<PickingSession | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PickingItem | null>(null);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<SubstitutionCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");
  const searchSequence = useRef(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = currentOrderId();
      setOrderId((current) => current === next ? current : next);
    }, 350);
    return () => window.clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    if (!orderId) { setSession(null); return; }
    try { setSession(await staff.getPickingSession(orderId)); setError(""); }
    catch { /* Keep the last good session so an intermittent refresh never closes the overlay. */ }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!orderId) return;
    const channel = supabase.channel(`staff-substitutions-${orderId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_operations_realtime_signals_v1", filter: `order_id=eq.${orderId}` }, () => void load())
      .subscribe();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => { window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [orderId, load]);

  const unresolved = useMemo(() => (session?.items || []).filter((item) => remaining(item) > 0), [session]);
  const pending = useMemo(() => unresolved.filter((item) => item.substitution?.status === "pending").length, [unresolved]);
  const policy = session?.substitution_policy || "manager";
  const available = Boolean(orderId && session?.fulfillment_state === "picking" && unresolved.length);
  const rankedCandidates = useMemo(
    () => [...candidates].sort((a, b) => Number(b.match_score || 0) - Number(a.match_score || 0)),
    [candidates],
  );

  const runSearch = useCallback(async (itemId: string, searchQuery: string) => {
    const sequence = ++searchSequence.current;
    setLoading(true); setError("");
    try {
      const result = await staff.searchSubstitutionCandidates(itemId, searchQuery.trim(), 25);
      if (sequence !== searchSequence.current) return;
      setCandidates(result.items || []);
      if (!result.items?.length) setError("مفيش بدائل متاحة بنفس التصنيف والمخزون حاليًا.");
    } catch (caught) {
      if (sequence !== searchSequence.current) return;
      setError(caught instanceof Error ? caught.message : "تعذر تحميل البدائل");
    } finally {
      if (sequence === searchSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selected) return;
    const timer = window.setTimeout(
      () => void runSearch(selected.id, query),
      query.trim() ? 350 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [selected?.id, query, runSearch]);

  if (!available && !open) return null;

  const search = (event?: FormEvent) => {
    event?.preventDefault();
    if (!selected) return;
    void runSearch(selected.id, query);
  };

  const chooseItem = (item: PickingItem) => {
    searchSequence.current += 1;
    setSelected(item); setQuery(""); setCandidates([]); setError("");
  };

  const leaveCandidateSearch = () => {
    searchSequence.current += 1;
    setSelected(null); setCandidates([]); setQuery(""); setError(""); setLoading(false);
  };

  const closeOverlay = () => {
    searchSequence.current += 1;
    setOpen(false); setSelected(null); setCandidates([]); setQuery(""); setError(""); setLoading(false);
  };

  const markAsShortage = async (item: PickingItem) => {
    if (acting) return;
    const left = remaining(item);
    if (left <= 0) return;
    if (!window.confirm(`تسجيل ${item.product_name} كصنف غير متوفر؟\nالكمية: ${qty(left, item.is_weight_based)}`)) return;
    setActing(true); setError("");
    try {
      await staff.markPickingShortage(item.id, left, "حسب اختيار العميل: احذف الصنف إذا لم يتوفر");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تسجيل النقص.");
    } finally { setActing(false); }
  };

  const propose = async (candidate: SubstitutionCandidate) => {
    if (!selected || acting) return;
    const left = remaining(selected);
    const delta = Number(candidate.price_delta_per_unit || 0) * left;
    if (!window.confirm(`اقتراح ${candidate.name} بدل ${selected.product_name}؟\nالكمية: ${qty(left, selected.is_weight_based)}\nفرق السعر: ${money(delta)}`)) return;
    setActing(true); setError("");
    try {
      await staff.proposeSubstitution(selected.id, candidate, left);
      await load();
      setSelected(null); setCandidates([]); setQuery("");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(
        message.includes("SUBSTITUTE_INSUFFICIENT_STOCK")
          ? "مخزون البديل لم يعد كافيًا. اختر بديلًا آخر."
          : message.includes("SUBSTITUTION_ALREADY_PENDING")
            ? "يوجد اقتراح بديل معلق بالفعل لهذا الصنف."
            : message.includes("SUBSTITUTION_POLICY_REMOVE_ITEM")
              ? "العميل اختار حذف الصنف عند عدم توفره؛ سجله كناقص بدل اقتراح بديل."
              : "تعذر إرسال اقتراح البديل."
      );
    } finally { setActing(false); }
  };

  return (
    <>
      <button className="substitution-fab" onClick={() => { setOpen(true); void load(); }}>
        <PackageSearch /><span>البدائل</span>{pending > 0 && <b>{pending}</b>}
      </button>
      {open && <div className="sub-overlay" dir="rtl" role="dialog" aria-modal="true">
        <div className="sub-sheet">
          <div className="sub-head">
            <div><small>تجهيز الطلب</small><h2>{selected ? "اختيار البديل" : "الأصناف غير المحسومة"}</h2></div>
            <div className="sub-head-actions">{selected && <button onClick={leaveCandidateSearch}><ArrowRight /></button>}<button onClick={closeOverlay}><X /></button></div>
          </div>

          {!selected ? <>
            <div className="sub-policy-card">
              <strong>اختيار العميل للبدائل</strong>
              <small>{policyLabel(policy)}</small>
            </div>
            <div className="sub-item-list">
            {unresolved.map((item) => {
              const hasPending = item.substitution?.status === "pending";
              return <article className="sub-origin-card" key={item.id}>
                <div className="sub-origin-main">{item.image_url ? <img src={item.image_url} alt="" /> : <div className="sub-img-placeholder"><PackageSearch /></div>}<div><strong>{item.product_name}</strong><small>المتبقي: {qty(remaining(item), item.is_weight_based)}</small>{item.barcode && <small>{item.barcode}</small>}</div></div>
                <StatusBlock item={item} onChanged={load} />
                {!hasPending && item.status !== "substituted" && (
                  policy === "remove_item"
                    ? <button className="sub-primary" disabled={acting} onClick={() => void markAsShortage(item)}><AlertTriangle />تسجيل كناقص وحذف الصنف</button>
                    : <button className="sub-primary" onClick={() => chooseItem(item)}><Search />اقتراح بديل</button>
                )}
              </article>;
            })}
          </div></> : <>
            <article className="sub-selected-origin"><span>بديل عن</span><strong>{selected.product_name}</strong><small>الكمية المطلوبة للبديل: {qty(remaining(selected), selected.is_weight_based)}</small></article>
            <form className="sub-search" onSubmit={search}><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="اسم المنتج أو الباركود" type="search" enterKeyHint="search" autoComplete="off" spellCheck={false} /><button disabled={loading}>{loading ? <Loader2 className="spin" /> : <Search />}</button></form>
            {error && <div className="sub-error">{error}</div>}
            {!query.trim() && (loading || rankedCandidates.length > 0) && <div className="sub-ai-heading"><Sparkles /><div><strong>اقتراحات AI</strong><small>مرتبة حسب العلامة والتصنيف والسعر والمخزون المتاح</small></div></div>}
            <div className="sub-candidates">
              {rankedCandidates.map((candidate, index) => {
                const totalDelta = Number(candidate.price_delta_per_unit || 0) * remaining(selected);
                const reasons = smartReasons(candidate);
                return <article key={`${candidate.product_id}:${candidate.variant_id || "base"}`} className={`sub-candidate ${index === 0 && !query.trim() ? "ai-best" : ""}`}>
                  {candidate.image_url ? <img src={candidate.image_url} alt="" /> : <div className="sub-img-placeholder"><PackageSearch /></div>}
                  <div className="sub-candidate-body">{index === 0 && !query.trim() && <span className="sub-ai-badge"><Sparkles />أفضل اقتراح</span>}<strong>{candidate.name}</strong><div className="sub-ai-reasons">{reasons.map((reason) => <span key={reason}>{reason}</span>)}</div><small>{candidate.barcode || "بدون باركود"}</small><div className="sub-price-row"><span>{Number(candidate.unit_price).toLocaleString("ar-EG")} ج.م</span><span className={totalDelta > 0 ? "up" : totalDelta < 0 ? "down" : "same"}>فرق {money(totalDelta)}</span></div><small>متاح: {qty(candidate.available_quantity, selected.is_weight_based)}</small></div>
                  <button disabled={acting || candidate.available_quantity + 0.0005 < remaining(selected)} onClick={() => void propose(candidate)}>{acting ? <Loader2 className="spin" /> : "اختيار"}</button>
                </article>;
              })}
              {!loading && !candidates.length && !error && <button className="sub-refresh" onClick={() => void search()}><RefreshCw />عرض البدائل</button>}
            </div>
          </>}
        </div>
      </div>}
    </>
  );
}
