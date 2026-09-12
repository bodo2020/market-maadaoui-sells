import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

const ROOT_PATHS = new Set(["/", "/dashboard", "/login"]);
const EXIT_WINDOW_MS = 1800;

export default function NativeBackButtonGuard() {
  const navigate = useNavigate();
  const location = useLocation();
  const lastBackAtRef = useRef(0);
  const pathRef = useRef(location.pathname);

  useEffect(() => {
    pathRef.current = location.pathname;
    lastBackAtRef.current = 0;
  }, [location.pathname]);

  useEffect(() => {
    const capacitor = (window as any).Capacitor;
    const appPlugin = capacitor?.Plugins?.App;
    if (!capacitor?.isNativePlatform?.() || !appPlugin?.addListener) return;

    let removed = false;
    let listenerHandle: { remove?: () => Promise<void> | void } | null = null;

    const closeOpenOverlay = () => {
      const openDialog = document.querySelector('[role="dialog"][data-state="open"]');
      const openSheet = document.querySelector('[data-state="open"][data-radix-dialog-content]');
      if (!openDialog && !openSheet) return false;
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
      return true;
    };

    Promise.resolve(
      appPlugin.addListener("backButton", ({ canGoBack }: { canGoBack?: boolean }) => {
        if (closeOpenOverlay()) return;

        const currentPath = pathRef.current;
        if (!ROOT_PATHS.has(currentPath)) {
          if (canGoBack) navigate(-1);
          else navigate("/", { replace: true });
          return;
        }

        const now = Date.now();
        if (now - lastBackAtRef.current <= EXIT_WINDOW_MS) {
          lastBackAtRef.current = 0;
          appPlugin.exitApp?.();
          return;
        }

        lastBackAtRef.current = now;
        toast("اضغط زر الرجوع مرة أخرى للخروج", { duration: EXIT_WINDOW_MS });
      }),
    ).then(handle => {
      if (removed) handle?.remove?.();
      else listenerHandle = handle || null;
    }).catch(() => undefined);

    return () => {
      removed = true;
      listenerHandle?.remove?.();
    };
  }, [navigate]);

  return null;
}
