import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Adds standards-based login metadata so Android Autofill / Google Password Manager
 * can offer to save and fill employee credentials inside the Capacitor WebView.
 * No credential value is persisted by the app itself.
 */
export default function GooglePasswordAutofill() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (pathname !== "/login") return;

    const enhance = () => {
      const passwords = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]'));

      passwords.forEach((password, index) => {
        const form = password.closest("form");
        const scope: ParentNode = form || password.parentElement?.parentElement || document;
        const username = scope.querySelector<HTMLInputElement>(
          'input[autocomplete="username"], input[name="username"], input[type="text"], input[type="email"]',
        );

        if (form) form.setAttribute("autocomplete", "on");

        password.setAttribute("name", "password");
        if (!password.id) password.id = `elmadawy-current-password-${index}`;
        password.setAttribute("autocomplete", "current-password");
        password.setAttribute("autocapitalize", "none");
        password.setAttribute("autocorrect", "off");
        password.setAttribute("spellcheck", "false");

        if (username) {
          username.setAttribute("name", "username");
          if (!username.id) username.id = `elmadawy-username-${index}`;
          username.setAttribute("autocomplete", "username");
          username.setAttribute("autocapitalize", "none");
          username.setAttribute("autocorrect", "off");
          username.setAttribute("spellcheck", "false");
        }
      });
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
