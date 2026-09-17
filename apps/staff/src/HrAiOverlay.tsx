import { useCallback, useEffect, useState } from "react";
import { Bot, X } from "lucide-react";
import HrAiPage, { canUseHrAi } from "./HrAiPage";
import { supabase } from "./lib/supabase";
import * as staff from "./services/staffService";
import type { StaffBranch, StaffIdentity } from "./services/staffService";

type HrContext = { identity: StaffIdentity; branch: StaffBranch } | null;

export default function HrAiOverlay() {
  const [context, setContext] = useState<HrContext>(null);
  const [open, setOpen] = useState(false);

  const resolve = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setContext(null);
      setOpen(false);
      return;
    }
    try {
      const [identity, branches] = await Promise.all([staff.getStaffIdentity(), staff.getStaffBranches()]);
      const branch = branches.find((row) => row.is_primary) || branches[0];
      if (!identity?.active || !branch || !canUseHrAi(identity, branch)) {
        setContext(null);
        setOpen(false);
        return;
      }
      setContext({ identity, branch });
    } catch {
      setContext(null);
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    void resolve();
    const { data } = supabase.auth.onAuthStateChange(() => void resolve());
    return () => data.subscription.unsubscribe();
  }, [resolve]);

  if (!context) return null;

  return <>
    {!open && <button
      type="button"
      aria-label="فتح Elmadawy HR AI"
      onClick={() => setOpen(true)}
      style={{
        position: "fixed",
        zIndex: 1200,
        left: 16,
        bottom: "calc(82px + env(safe-area-inset-bottom, 0px))",
        width: 54,
        height: 54,
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,.35)",
        background: "#005931",
        color: "white",
        boxShadow: "0 12px 28px rgba(0,89,49,.28)",
        display: "grid",
        placeItems: "center",
      }}
    ><Bot size={25} /></button>}

    {open && <div style={{ position: "fixed", inset: 0, zIndex: 1500, background: "#f6f8f7", overflowY: "auto", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: "rgba(255,255,255,.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid #e4eae6", padding: "calc(10px + env(safe-area-inset-top, 0px)) 14px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div><small style={{ color: "#005931", fontWeight: 800 }}>المعداوي Staff</small><strong style={{ display: "block" }}>Elmadawy HR AI</strong></div>
        <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="إغلاق"><X /></button>
      </div>
      <main style={{ padding: 14 }}><HrAiPage identity={context.identity} branch={context.branch} /></main>
    </div>}
  </>;
}
