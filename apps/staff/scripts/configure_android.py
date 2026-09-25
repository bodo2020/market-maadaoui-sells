from pathlib import Path
import json
import os
import re

root = Path(__file__).resolve().parents[1]
android = root / "android"
pkg = json.loads((root / "package.json").read_text(encoding="utf-8"))

variables = android / "variables.gradle"
variables_text = variables.read_text(encoding="utf-8")
variables_text = re.sub(r"minSdkVersion = [0-9]+", "minSdkVersion = 26", variables_text, count=1)
variables.write_text(variables_text, encoding="utf-8")

run_number = int(os.environ.get("GITHUB_RUN_NUMBER", "1"))
version_code = 200000 + run_number
version_name = f"{pkg.get('version', '0.11.0')}.{run_number}"

activity = android / "app/src/main/java/com/elmadawy/staff/MainActivity.java"
if not activity.exists():
    raise SystemExit(f"MainActivity not found: {activity}")

activity.write_text("""package com.elmadawy.staff;

import android.os.Bundle;
import android.view.View;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(GooglePasswordManagerPlugin.class);
        registerPlugin(StaffDeviceIdentityPlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);
        }
    }
}
""", encoding="utf-8")

(activity.with_name("GooglePasswordManagerPlugin.java")).write_text("""package com.elmadawy.staff;

import android.os.CancellationSignal;

import androidx.core.content.ContextCompat;
import androidx.credentials.CreateCredentialResponse;
import androidx.credentials.CreatePasswordRequest;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.GetPasswordOption;
import androidx.credentials.PasswordCredential;
import androidx.credentials.exceptions.CreateCredentialException;
import androidx.credentials.exceptions.GetCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "GooglePasswordManager")
public class GooglePasswordManagerPlugin extends Plugin {
    @PluginMethod
    public void savePassword(PluginCall call) {
        String username = call.getString("username");
        String password = call.getString("password");
        if (username == null || username.trim().isEmpty() || password == null || password.isEmpty()) {
            call.reject("اسم المستخدم وكلمة المرور مطلوبان");
            return;
        }

        CredentialManager manager = CredentialManager.create(getContext());
        CreatePasswordRequest request = new CreatePasswordRequest(
            username.trim(), password, null, false, false
        );

        manager.createCredentialAsync(
            getActivity(),
            request,
            new CancellationSignal(),
            ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException>() {
                @Override
                public void onResult(CreateCredentialResponse result) {
                    JSObject response = new JSObject();
                    response.put("saved", true);
                    call.resolve(response);
                }

                @Override
                public void onError(CreateCredentialException error) {
                    call.reject(error.getMessage() == null ? "تعذر حفظ كلمة المرور" : error.getMessage());
                }
            }
        );
    }

    @PluginMethod
    public void getPassword(PluginCall call) {
        CredentialManager manager = CredentialManager.create(getContext());
        GetPasswordOption passwordOption = new GetPasswordOption();
        GetCredentialRequest request = new GetCredentialRequest.Builder()
            .addCredentialOption(passwordOption)
            .build();

        manager.getCredentialAsync(
            getActivity(),
            request,
            new CancellationSignal(),
            ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse result) {
                    Credential credential = result.getCredential();
                    if (!(credential instanceof PasswordCredential)) {
                        call.reject("NO_PASSWORD_CREDENTIAL");
                        return;
                    }
                    PasswordCredential password = (PasswordCredential) credential;
                    JSObject response = new JSObject();
                    response.put("username", password.getId());
                    response.put("password", password.getPassword());
                    call.resolve(response);
                }

                @Override
                public void onError(GetCredentialException error) {
                    call.reject(error.getType());
                }
            }
        );
    }
}
""", encoding="utf-8")

(activity.with_name("StaffDeviceIdentityPlugin.java")).write_text("""package com.elmadawy.staff;

import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "StaffDeviceIdentity")
public class StaffDeviceIdentityPlugin extends Plugin {
    @PluginMethod
    public void getAndroidId(PluginCall call) {
        String androidId = Settings.Secure.getString(
            getContext().getContentResolver(),
            Settings.Secure.ANDROID_ID
        );
        if (androidId == null || androidId.trim().isEmpty()) {
            call.reject("ANDROID_DEVICE_ID_UNAVAILABLE");
            return;
        }
        JSObject result = new JSObject();
        result.put("androidId", androidId);
        result.put("manufacturer", Build.MANUFACTURER);
        result.put("model", Build.MODEL);
        call.resolve(result);
    }
}
""", encoding="utf-8")

gradle = android / "app/build.gradle"
gradle_text = gradle.read_text(encoding="utf-8")
if "androidx.credentials:credentials:" not in gradle_text:
    gradle_text = gradle_text.replace(
        "dependencies {",
        'dependencies {\n    implementation "androidx.credentials:credentials:1.5.0"\n    implementation "androidx.credentials:credentials-play-services-auth:1.5.0"',
        1,
    )
gradle_text = re.sub(r"versionCode\s+\d+", f"versionCode {version_code}", gradle_text, count=1)
gradle_text = re.sub(r'versionName\s+"[^"]+"', f'versionName "{version_name}"', gradle_text, count=1)
gradle.write_text(gradle_text, encoding="utf-8")

manifest = android / "app/src/main/AndroidManifest.xml"
manifest_text = manifest.read_text(encoding="utf-8")
if 'android:usesCleartextTraffic="false"' not in manifest_text:
    manifest_text = manifest_text.replace("<application", '<application android:usesCleartextTraffic="false"', 1)

permissions = [
    '    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
    '    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
    '    <uses-permission android:name="android.permission.CAMERA" />',
]
missing = [line for line in permissions if line not in manifest_text]
if missing:
    pos = manifest_text.find("<application")
    if pos < 0:
        raise SystemExit("AndroidManifest.xml application element not found")
    manifest_text = manifest_text[:pos] + "\n".join(missing) + "\n\n" + manifest_text[pos:]
manifest.write_text(manifest_text, encoding="utf-8")

print(f"Configured Staff Android versionCode={version_code} versionName={version_name}")
