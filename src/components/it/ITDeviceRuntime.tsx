import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useBranchStore } from "@/stores/branchStore";
import { heartbeatITDevice } from "@/services/itDeviceService";
import GrowthITSuperAdminPanel from "@/components/it/GrowthITSuperAdminPanel";

const HEARTBEAT_MS = 45_000;

export default function ITDeviceRuntime() {
  const location = useLocation();
  const { currentBranchId } = useBranchStore();
  const endingRef = useRef(false);
  const [adminHost, setAdminHost] = useState<HTMLElement | null>(null);

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

  useEffect(() => {
    if (location.pathname !== "/it-center") {
      setAdminHost(null);
      return;
    }

    const main = document.querySelector("main");
    if (!main) return;
    const host = document.createElement("div");
    host.dataset.growthItSuperAdmin = "true";
    main.appendChild(host);
    setAdminHost(host);

    return () => {
      setAdminHost(null);
      host.remove();
    };
  }, [location.pathname]);

  return adminHost ? createPortal(<GrowthITSuperAdminPanel />, adminHost) : null;
}
