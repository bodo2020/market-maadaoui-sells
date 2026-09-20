from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
ANDROID = ROOT / "android"

variables = ANDROID / "variables.gradle"
text = variables.read_text(encoding="utf-8")
text = re.sub(r"minSdkVersion\s*=\s*\d+", "minSdkVersion = 26", text)
text = re.sub(r"targetSdkVersion\s*=\s*\d+", "targetSdkVersion = 34", text)
variables.write_text(text, encoding="utf-8")

manifest = ANDROID / "app/src/main/AndroidManifest.xml"
mtext = manifest.read_text(encoding="utf-8")
permissions = [
    '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
    '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
]
for permission in permissions:
    if permission not in mtext:
        mtext = mtext.replace("<application", permission + "\n    <application", 1)
if 'android:usesCleartextTraffic="false"' not in mtext:
    mtext = mtext.replace("<application", '<application android:usesCleartextTraffic="false"', 1)
manifest.write_text(mtext, encoding="utf-8")

gradle = ANDROID / "app/build.gradle"
gtext = gradle.read_text(encoding="utf-8")
deps = [
    '    implementation "androidx.credentials:credentials:1.5.0"',
    '    implementation "androidx.credentials:credentials-play-services-auth:1.5.0"',
]
if "androidx.credentials:credentials:1.5.0" not in gtext:
    gtext = gtext.replace("dependencies {", "dependencies {\n" + "\n".join(deps), 1)
gradle.write_text(gtext, encoding="utf-8")

hotfix_js = r"""
(() => {
  const STYLE_ID = 'elmadawy-native-hotfix-style';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .elmadawy-receiving-switch {
        min-width: 58px !important;
        min-height: 32px !important;
        border: 2px solid rgba(255,255,255,.92) !important;
        box-shadow: 0 0 0 2px rgba(0,0,0,.12), 0 5px 14px rgba(0,0,0,.16) !important;
        transition: background-color .18s ease, border-color .18s ease, box-shadow .18s ease !important;
        overflow: hidden !important;
        direction: rtl !important;
      }
      .elmadawy-switch-status {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-width: 54px !important;
        height: 25px !important;
        padding: 0 9px !important;
        margin-inline-start: 8px !important;
        border-radius: 999px !important;
        font-size: 12px !important;
        font-weight: 800 !important;
        line-height: 1 !important;
        vertical-align: middle !important;
        border: 1px solid rgba(255,255,255,.4) !important;
        box-shadow: 0 1px 3px rgba(0,0,0,.08) !important;
      }
      .elmadawy-switch-status[data-state="on"] {
        background: #dcfce7 !important;
        color: #166534 !important;
      }
      .elmadawy-switch-status[data-state="off"] {
        background: #f1f5f9 !important;
        color: #475569 !important;
      }
      .elmadawy-receiving-card {
        outline: 1px solid rgba(255,255,255,.16) !important;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.07) !important;
      }
    `;
    document.head.appendChild(style);
  }

  function stateOf(sw) {
    if (!sw) return false;
    if (sw.matches && sw.matches('input[type="checkbox"]')) return !!sw.checked;
    const aria = sw.getAttribute && sw.getAttribute('aria-checked');
    if (aria != null) return aria === 'true';
    const dataState = sw.getAttribute && sw.getAttribute('data-state');
    if (dataState) return dataState === 'checked' || dataState === 'on';
    return false;
  }

  function findThumb(sw) {
    if (!sw || !sw.children || !sw.children.length) return null;
    const root = sw.getBoundingClientRect();
    return Array.from(sw.children).find((child) => {
      const rect = child.getBoundingClientRect();
      return rect.width >= 14 && rect.height >= 14 && rect.width <= root.width * .72 && rect.height <= root.height * .9;
    }) || null;
  }

  function setSwitchVisual(sw, label, card) {
    if (!sw || sw.dataset.elmadawySwitchBound === '1') {
      if (sw && typeof sw.__elmadawyRefresh === 'function') sw.__elmadawyRefresh();
      return;
    }

    sw.dataset.elmadawySwitchBound = '1';
    sw.classList.add('elmadawy-receiving-switch');
    sw.setAttribute('dir', 'rtl');
    if (card) card.classList.add('elmadawy-receiving-card');

    let badge = card ? card.querySelector('.elmadawy-switch-status') : null;
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'elmadawy-switch-status';
      badge.setAttribute('aria-live', 'polite');
      if (label && label.parentElement) label.insertAdjacentElement('afterend', badge);
    }

    const refresh = () => {
      const on = stateOf(sw);
      sw.style.backgroundColor = on ? '#22c55e' : '#cbd5e1';
      sw.style.borderColor = on ? '#86efac' : '#ffffff';
      sw.style.boxShadow = on
        ? '0 0 0 2px rgba(34,197,94,.28), 0 5px 14px rgba(0,0,0,.16)'
        : '0 0 0 2px rgba(100,116,139,.18), 0 5px 14px rgba(0,0,0,.12)';
      sw.setAttribute('aria-label', on ? 'استقبال الطلبات مفعّل' : 'استقبال الطلبات متوقف');

      if (badge) {
        badge.textContent = on ? 'مفعّل' : 'متوقف';
        badge.dataset.state = on ? 'on' : 'off';
      }

      if (!(sw.matches && sw.matches('input[type="checkbox"]'))) {
        const thumb = findThumb(sw);
        if (thumb) {
          sw.style.position = 'relative';
          thumb.style.position = 'absolute';
          thumb.style.top = '50%';
          thumb.style.margin = '0';
          thumb.style.transform = 'translateY(-50%)';
          thumb.style.transition = 'left .18s ease, right .18s ease, transform .18s ease';
          // RTL behavior requested by the delivery team:
          // enabled = thumb on the left, disabled = thumb on the right.
          if (on) {
            thumb.style.left = '4px';
            thumb.style.right = 'auto';
          } else {
            thumb.style.right = '4px';
            thumb.style.left = 'auto';
          }
        }
      } else {
        sw.style.accentColor = on ? '#22c55e' : '#94a3b8';
      }
    };

    sw.__elmadawyRefresh = refresh;
    sw.addEventListener('click', () => setTimeout(refresh, 0), true);
    sw.addEventListener('change', () => setTimeout(refresh, 0), true);
    new MutationObserver(refresh).observe(sw, {
      attributes: true,
      attributeFilter: ['aria-checked', 'data-state', 'class', 'checked']
    });
    refresh();
  }

  function patchReceivingSwitch() {
    const exact = /^(استقبال\s+(?:طلبات|الرحلات)\s+جديدة|استقبال\s+الرحلات)$/;
    const nodes = Array.from(document.querySelectorAll('h1,h2,h3,h4,p,span,strong,label,div'));
    const label = nodes.find((el) => exact.test((el.textContent || '').trim()));
    if (!label) return;

    let current = label;
    for (let i = 0; i < 7 && current; i++, current = current.parentElement) {
      const sw = current.querySelector && current.querySelector(
        '[role="switch"], button[aria-checked], button[data-state="checked"], button[data-state="unchecked"], input[type="checkbox"]'
      );
      if (sw) {
        setSwitchVisual(sw, label, current);
        return;
      }
    }
  }

  function normalizeLoginInputs() {
    const password = document.querySelector('input[type="password"]');
    if (!password) return;

    const inputs = Array.from(document.querySelectorAll('input'));
    const username =
      inputs.find((input) => input !== password && /user|login|phone|email|اسم/i.test((input.name || '') + ' ' + (input.id || '') + ' ' + (input.placeholder || ''))) ||
      inputs.find((input) => input !== password && ['text','email','tel'].includes((input.type || 'text').toLowerCase()));

    if (username) {
      username.setAttribute('autocomplete', 'username');
      username.setAttribute('autocapitalize', 'none');
      username.setAttribute('spellcheck', 'false');
      if (!username.name) username.name = 'username';
      if (!username.id) username.id = 'delivery-username';
    }
    password.setAttribute('autocomplete', 'current-password');
    if (!password.name) password.name = 'password';
    if (!password.id) password.id = 'delivery-password';

    const form = password.closest('form');
    const capture = () => {
      if (!username || !username.value || !password.value || !window.ElmadawyNative) return;
      try {
        window.ElmadawyNative.captureCredentials(String(username.value), String(password.value));
      } catch (_) {}

      const startedAt = Date.now();
      const timer = setInterval(() => {
        const stillOnLogin = !!document.querySelector('input[type="password"]');
        if (!stillOnLogin) {
          clearInterval(timer);
          try { window.ElmadawyNative.loginSucceeded(); } catch (_) {}
          return;
        }
        if (Date.now() - startedAt > 15000) clearInterval(timer);
      }, 450);
    };

    if (form && form.dataset.elmadawyCredentialHook !== '1') {
      form.dataset.elmadawyCredentialHook = '1';
      form.setAttribute('autocomplete', 'on');
      form.addEventListener('submit', capture, true);
    }

    if (document.documentElement.dataset.elmadawyLoginClickHook !== '1') {
      document.documentElement.dataset.elmadawyLoginClickHook = '1';
      document.addEventListener('click', (event) => {
        const button = event.target && event.target.closest ? event.target.closest('button,[role="button"]') : null;
        if (!button) return;
        const text = (button.textContent || '').trim();
        if (/دخول|تسجيل\s*الدخول/.test(text) && document.querySelector('input[type="password"]')) {
          setTimeout(capture, 0);
        }
      }, true);
    }
  }

  function applyAll() {
    ensureStyle();
    normalizeLoginInputs();
    patchReceivingSwitch();
  }

  window.__elmadawyApplyDeliveryHotfix = applyAll;
  applyAll();

  if (!window.__elmadawyDeliveryObserver) {
    window.__elmadawyDeliveryObserver = new MutationObserver(() => {
      clearTimeout(window.__elmadawyDeliveryHotfixTimer);
      window.__elmadawyDeliveryHotfixTimer = setTimeout(applyAll, 80);
    });
    window.__elmadawyDeliveryObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
"""

java_script_literal = json.dumps(hotfix_js, ensure_ascii=False)

activity = ANDROID / "app/src/main/java/com/elmadawy/delivery/MainActivity.java"
activity.parent.mkdir(parents=True, exist_ok=True)

java = """package com.elmadawy.delivery;

import android.Manifest;
import android.graphics.Color;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.credentials.CreateCredentialResponse;
import androidx.credentials.CreatePasswordRequest;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.exceptions.CreateCredentialException;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int LOCATION_REQUEST = 7301;
    private static final String HOTFIX_JS = __HOTFIX_JS__;

    private String pendingUsername;
    private String pendingPassword;
    private boolean savePromptInFlight = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.WHITE);
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(true);
        controller.setAppearanceLightNavigationBars(true);

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                this,
                new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
                LOCATION_REQUEST
            );
        }

        final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.setImportantForAutofill(android.view.View.IMPORTANT_FOR_AUTOFILL_YES);
            webView.getSettings().setSaveFormData(true);
            webView.addJavascriptInterface(new AuthBridge(), "ElmadawyNative");
            new Handler(Looper.getMainLooper()).postDelayed(this::injectHotfix, 900);
            new Handler(Looper.getMainLooper()).postDelayed(this::injectHotfix, 2600);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        new Handler(Looper.getMainLooper()).postDelayed(this::injectHotfix, 500);
    }

    private void injectHotfix() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().evaluateJavascript(HOTFIX_JS, null);
    }

    private final class AuthBridge {
        @JavascriptInterface
        public void captureCredentials(String username, String password) {
            if (username == null || password == null) return;
            String cleanUsername = username.trim();
            if (cleanUsername.isEmpty() || password.isEmpty()) return;
            pendingUsername = cleanUsername;
            pendingPassword = password;
        }

        @JavascriptInterface
        public void loginSucceeded() {
            runOnUiThread(MainActivity.this::promptSavePassword);
        }
    }

    private void promptSavePassword() {
        if (savePromptInFlight || pendingUsername == null || pendingPassword == null) return;

        final String username = pendingUsername;
        final String password = pendingPassword;
        savePromptInFlight = true;

        CredentialManager manager = CredentialManager.create(this);
        CreatePasswordRequest request = new CreatePasswordRequest(
            username,
            password,
            null,
            false,
            false
        );

        manager.createCredentialAsync(
            this,
            request,
            new CancellationSignal(),
            ContextCompat.getMainExecutor(this),
            new CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException>() {
                @Override
                public void onResult(CreateCredentialResponse result) {
                    pendingUsername = null;
                    pendingPassword = null;
                    savePromptInFlight = false;
                }

                @Override
                public void onError(CreateCredentialException error) {
                    pendingUsername = null;
                    pendingPassword = null;
                    savePromptInFlight = false;
                }
            }
        );
    }
}
""".replace("__HOTFIX_JS__", java_script_literal)

activity.write_text(java, encoding="utf-8")

print("Patched Android wrapper:")
print(" - minSdkVersion=26")
print(" - targetSdkVersion=34 (no forced edge-to-edge)")
print(" - native status/navigation safe area")
print(" - RTL receiving switch direction + high contrast state")
print(" - Android Credential Manager save prompt")
print(" - WebView username/password autofill metadata")
print(" - fine/coarse location permissions")
