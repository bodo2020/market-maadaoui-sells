import { supabase } from "./lib/supabase";

function toStaffAuthEmail(username: string) {
  const normalized = username.trim().toLowerCase();
  const bytes = new TextEncoder().encode(normalized);
  let binary = "";
  bytes.forEach((value) => { binary += String.fromCharCode(value); });
  const encoded = btoa(binary).replace(/=+$/g, "").toLowerCase();
  return `u-${encoded}@staff.elmadawymarket.local`;
}

export function installStaffAuthEnhancements() {
  const auth = supabase.auth;
  const originalSignIn = auth.signInWithPassword.bind(auth);

  auth.signInWithPassword = (async (credentials: Parameters<typeof originalSignIn>[0]) => {
    if (!("email" in credentials) || typeof credentials.email !== "string" || !credentials.email.endsWith("@example.com")) {
      return originalSignIn(credentials);
    }

    const username = credentials.email.slice(0, -"@example.com".length).trim().toLowerCase();
    const staffEmail = toStaffAuthEmail(username);
    const direct = await originalSignIn({ ...credentials, email: staffEmail });
    if (!direct.error) return direct;

    const password = "password" in credentials && typeof credentials.password === "string" ? credentials.password : "";
    if (!password) return direct;

    const { data: migration, error: migrationError } = await supabase.functions.invoke("migrate-staff-login", {
      body: { username, password },
    });

    if (migrationError || migration?.error || migration?.migrated !== true) return direct;
    return originalSignIn({ ...credentials, email: staffEmail });
  }) as typeof auth.signInWithPassword;

  const style = document.createElement("style");
  style.textContent = `
    .staff-password-wrap{position:relative;display:block}
    .staff-password-wrap input{padding-left:52px!important}
    .staff-password-eye{position:absolute;left:10px;top:50%;transform:translateY(-50%);width:38px;height:38px;border:0;background:transparent;color:#59635f;display:grid;place-items:center;cursor:pointer;border-radius:10px;padding:0}
    .staff-password-eye:active{background:#eef4f0}
    .staff-password-eye svg{width:22px;height:22px;pointer-events:none}
  `;
  document.head.appendChild(style);

  const enhancePassword = () => {
    const input = document.querySelector<HTMLInputElement>('input[autocomplete="current-password"]');
    if (!input || input.dataset.eyeReady === "1") return;
    input.dataset.eyeReady = "1";

    const wrap = document.createElement("span");
    wrap.className = "staff-password-wrap";
    input.parentNode?.insertBefore(wrap, input);
    wrap.appendChild(input);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "staff-password-eye";
    button.setAttribute("aria-label", "إظهار كلمة المرور");
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
    button.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute("aria-label", show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
      button.innerHTML = show
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c6.5 0 10 8 10 8a16.2 16.2 0 0 1-2.1 3.2"/><path d="M6.6 6.6C3.6 8.7 2 12 2 12s3.5 8 10 8a9.7 9.7 0 0 0 4.4-1"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
    });
    wrap.appendChild(button);
  };

  enhancePassword();
  const observer = new MutationObserver(enhancePassword);
  observer.observe(document.body, { childList: true, subtree: true });
}
