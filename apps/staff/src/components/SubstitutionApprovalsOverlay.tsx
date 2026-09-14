import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import * as staff from "../services/staffService";
import type { StaffBranch, SubstitutionApproval } from "../services/staffService";

const money = (value: number) => `${Number(value) > 0 ? "+" : ""}${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

export default function SubstitutionApprovalsOverlay() {
  const [branch, setBranch] = useState<StaffBranch | null>(null);
  const [items, setItems] = useState<SubstitutionApproval[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void staff.getStaffBranches().then((branches) => {
      const allowed = branches.filter((row) => row.permissions.includes("online_orders.manage"));
      if (active) setBranch(allowed.find((row) => row.is_primary) || allowed[0] || null);
    }).catch(() => { if (active) setBranch(null); });
    return () => { active = false; };
  }, []);

  const load = useCallback(async () => {
    if (!branch) return;
    try { const data = await staff.listSubstitutionApprovals(branch.branch_id, 50); setItems(data.items || []); setError(""); }
    catch { setError("تعذر تحديث موافقات البدائل"); }
  }, [branch]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!branch) return;
    const channel = supabase.channel(`sub-approval-${branch.branch_id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_operations_realtime_signals_v1", filter: `branch_id=eq.${branch.branch_id}` }, () => void load())
      .subscribe();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => { window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [branch, load]);

  if (!branch || !items.length) return null;

  const decide = async (item: SubstitutionApproval, decision: "approve" | "reject") => {
    const note = window.prompt(decision === "approve" ? "ملاحظة اعتماد البديل" : "سبب رفض البديل", decision === "approve" ? "البديل مناسب وتمت المراجعة" : "يرجى اختيار بديل آخر");
    if (!note || note.trim().length < 3) return;
    setBusy(item.id); setError("");
    try { await staff.decideSubstitution(item.id, decision, note.trim()); await load(); }
    catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(message.includes("SUBSTITUTE_INSUFFICIENT_STOCK") ? "مخزون البديل لم يعد كافيًا. ارفض الاقتراح ليختار المجهز بديلًا آخر." : "تعذر تسجيل القرار.");
    } finally { setBusy(""); }
  };

  return <>
    <button className="sub-approval-fab" onClick={() => { setOpen(true); void load(); }}><ShieldCheck /><span>موافقات البدائل</span><b>{items.length}</b></button>
    {open && <div className="sub-overlay manager" dir="rtl"><div className="sub-sheet">
      <div className="sub-head"><div><small>{branch.branch_name}</small><h2>موافقات البدائل</h2></div><div className="sub-head-actions"><button onClick={() => void load()}><RefreshCw /></button><button onClick={() => setOpen(false)}><X /></button></div></div>
      {error && <div className="sub-error">{error}</div>}
      <div className="sub-approval-list">{items.map((item) => <article className="sub-approval-card" key={item.id}>
        <small>طلب {item.tracking_number || item.order_id.slice(0, 8)} · {item.proposed_by_name || "موظف التجهيز"}</small>
        <div className="sub-swap"><div><span>الأصلي</span><strong>{item.original_product_name}</strong><small>{Number(item.original_unit_price).toLocaleString("ar-EG")} ج.م</small></div><div className="sub-arrow">←</div><div><span>البديل</span><strong>{item.replacement_product_name}</strong><small>{Number(item.replacement_unit_price).toLocaleString("ar-EG")} ج.م</small></div></div>
        <div className="sub-approval-meta"><span>الكمية: {Number(item.quantity).toLocaleString("ar-EG", { maximumFractionDigits: 3 })}</span><strong className={item.price_delta_total > 0 ? "up" : item.price_delta_total < 0 ? "down" : "same"}>فرق {money(item.price_delta_total)}</strong></div>
        <div className="sub-decision-actions"><button className="reject" disabled={busy === item.id} onClick={() => void decide(item, "reject")}>رفض</button><button className="approve" disabled={busy === item.id} onClick={() => void decide(item, "approve")}>{busy === item.id ? <Loader2 className="spin" /> : <Check />}اعتماد</button></div>
      </article>)}</div>
    </div></div>}
  </>;
}
