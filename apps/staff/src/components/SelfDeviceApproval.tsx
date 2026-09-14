import { useEffect, useState } from "react";
import { Loader2, Smartphone } from "lucide-react";
import { supabase } from "../lib/supabase";
import { getStaffBranches } from "../services/staffService";

const DEVICE_ID_KEY = "elmadawy_staff_device_id";
const DEVICE_TOKEN_KEY = "elmadawy_staff_device_token";
const DEVICE_KEY_KEY = "elmadawy_staff_device_key";

function getDeviceKey() {
  let key = localStorage.getItem(DEVICE_KEY_KEY);
  if (!key) {
    key = `staff-${crypto.randomUUID()}`;
    localStorage.setItem(DEVICE_KEY_KEY, key);
  }
  return key;
}

export default function SelfDeviceApproval() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setPath(window.location.pathname), 300);
    return () => window.clearInterval(timer);
  }, []);

  if (path !== "/attendance" || localStorage.getItem(DEVICE_ID_KEY) || done) return null;

  const request = async () => {
    setBusy(true);
    try {
      const branches = await getStaffBranches();
      const branch = branches.find((row) => row.is_primary) || branches[0];
      if (!branch) throw new Error("BRANCH_REQUIRED");
      const { data, error } = await supabase.rpc("request_my_staff_device_approval_v1", {
        p_branch_id: branch.branch_id,
        p_device_key: getDeviceKey(),
        p_device_name: "هاتف الموظف",
        p_platform: "android",
        p_metadata: { app: "elmadawy_staff", version: "0.5" },
      });
      if (error) throw error;
      const result = data as { ok?: boolean; device_id?: string; device_token?: string } | null;
      if (!result?.ok || !result.device_id || !result.device_token) throw new Error("REQUEST_FAILED");
      localStorage.setItem(DEVICE_ID_KEY, result.device_id);
      localStorage.setItem(DEVICE_TOKEN_KEY, result.device_token);
      setDone(true);
      window.setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      console.warn("Staff device approval request failed", error);
      alert("تعذر إرسال طلب اعتماد الجهاز. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void request()}
      disabled={busy}
      style={{
        position: "fixed",
        right: 16,
        left: 16,
        bottom: "calc(82px + env(safe-area-inset-bottom))",
        zIndex: 90,
        minHeight: 52,
        border: 0,
        borderRadius: 16,
        background: "#005931",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        fontWeight: 800,
        boxShadow: "0 12px 30px rgba(0,89,49,.24)",
      }}
    >
      {busy ? <Loader2 className="spin" size={20} /> : <Smartphone size={20} />}
      طلب اعتماد هذا الجهاز
    </button>
  );
}
