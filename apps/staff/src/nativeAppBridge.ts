import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

let installed = false;
let lastRootBackAt = 0;
let toastTimer: number | null = null;

function notifyRouter(path: string) {
  if (window.location.pathname === path) return;
  window.history.replaceState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function showExitHint() {
  let toast = document.getElementById("staff-exit-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "staff-exit-toast";
    toast.className = "staff-exit-toast";
    toast.textContent = "اضغط رجوع مرة أخرى للخروج";
    document.body.appendChild(toast);
  }

  toast.classList.add("show");
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast?.classList.remove("show"), 1700);
}

function routeForBack(pathname: string) {
  if (pathname.startsWith("/operations/") && pathname !== "/operations") return "/operations";
  if (["/tasks", "/operations", "/attendance", "/account"].includes(pathname)) return "/";
  return null;
}

export async function installNativeAppBridge() {
  if (installed || !Capacitor.isNativePlatform()) return;
  installed = true;

  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: "#005931" });
  } catch (error) {
    console.warn("Status bar setup skipped", error);
  }

  await CapacitorApp.addListener("backButton", async () => {
    const pathname = window.location.pathname || "/";
    const target = routeForBack(pathname);

    if (target) {
      lastRootBackAt = 0;
      notifyRouter(target);
      return;
    }

    if (pathname !== "/" && pathname !== "/login") {
      lastRootBackAt = 0;
      notifyRouter("/");
      return;
    }

    const now = Date.now();
    if (now - lastRootBackAt < 1800) {
      await CapacitorApp.exitApp();
      return;
    }

    lastRootBackAt = now;
    showExitHint();
  });
}
