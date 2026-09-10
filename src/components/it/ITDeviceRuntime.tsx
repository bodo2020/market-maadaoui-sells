import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useBranchStore } from "@/stores/branchStore";
import { heartbeatITDevice } from "@/services/itDeviceService";

const HEARTBEAT_MS = 45_000;

export default function ITDeviceRuntime() {
  const location = useLocation();
  const { currentBranchId } = useBranchStore();
  const endingRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;

    const beat = async () => {
      if (disposed || endingRef.current) return;
      try {
        const result = await heartbeatITDevice(location.pathname, currentBranchId);
        if (result.blocked && !endingRef.current) {
          endingRef.current = true;
          try {
            await (supabase.auth.signOut as any)({ scope: "local" });
          } catch (error) {
            console.warn("IT session local sign-out failed:", error);
          }
          const reason = result.block_reason ? encodeURIComponent(result.block_reason) : "session-ended";
          window.location.assign(`/login?reason=${reason}`);
        }
      } catch (error) {
        // Presence is observability, never a reason to stop normal store operations.
        console.warn("IT device heartbeat failed:", error);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void beat();
    };
    const onWake = () => void beat();

    void beat();
    timer = window.setInterval(() => void beat(), HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);

    return () => {
      disposed = true;
      if (timer) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
    };
  }, [currentBranchId, location.pathname]);

  return null;
}
