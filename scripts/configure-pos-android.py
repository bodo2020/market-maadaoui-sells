"""Post-generation Android settings for the dedicated main POS package."""

from pathlib import Path
from shutil import copyfile
import re

root = Path(__file__).resolve().parents[1]
android = root / 'apps/pos/android'
variables = android / 'variables.gradle'
manifest = android / 'app/src/main/AndroidManifest.xml'
activity = android / 'app/src/main/java/com/elmadawy/pos/MainActivity.java'
gradle = android / 'app/build.gradle'
drawable = android / 'app/src/main/res/drawable'

for path in (variables, manifest, activity, gradle):
    if not path.is_file():
        raise SystemExit(f'Expected generated Android file missing: {path}')

text = variables.read_text(encoding='utf-8')
text, count = re.subn(r'(minSdkVersion\s*=\s*)\d+', r'\g<1>26', text, count=1)
if count != 1:
    raise SystemExit('Could not configure minimum Android SDK')
variables.write_text(text, encoding='utf-8')

text = manifest.read_text(encoding='utf-8')
permission = '<uses-permission android:name="android.permission.CAMERA" />'
if permission not in text:
    text = text.replace('<application', f'{permission}\n\n    <application', 1)
if 'android:usesCleartextTraffic="false"' not in text:
    text = text.replace('<application', '<application android:usesCleartextTraffic="false"', 1)
for line in (
    '<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />',
    '<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />',
):
    if line not in text:
        text = text.replace('<application', f'{line}\n\n    <application', 1)
usb_host = '<uses-feature android:name="android.hardware.usb.host" android:required="false" />'
if usb_host not in text:
    text = text.replace('<application', f'{usb_host}\n\n    <application', 1)
manifest.write_text(text, encoding='utf-8')

activity.write_text('''package com.elmadawy.pos;

import android.os.Bundle;
import android.view.View;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        registerPlugin(PosPrintPlugin.class);
        registerPlugin(PosCredentialsPlugin.class);
        registerPlugin(PosDevicePlugin.class);
        registerPlugin(PosThermalPrinterPlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            View web = getBridge().getWebView();
            web.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);
            ViewCompat.setOnApplyWindowInsetsListener(web, (v, insets) -> {
                androidx.core.graphics.Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                float density = getResources().getDisplayMetrics().density;
                int top = Math.round(bars.top / density);
                int bottom = insets.isVisible(WindowInsetsCompat.Type.ime()) ? 0 : Math.round(bars.bottom / density);
                int left = Math.round(bars.left / density);
                int right = Math.round(bars.right / density);
                String js = "document.documentElement.style.setProperty('--pos-inset-top','" + top + "px');"
                    + "document.documentElement.style.setProperty('--pos-inset-bottom','" + bottom + "px');"
                    + "document.documentElement.style.setProperty('--pos-inset-left','" + left + "px');"
                    + "document.documentElement.style.setProperty('--pos-inset-right','" + right + "px')";
                getBridge().getWebView().evaluateJavascript(js, null);
                return insets;
            });
            ViewCompat.requestApplyInsets(web);
        }
    }
}
''', encoding='utf-8')

for name in ('PosPrintPlugin.java', 'PosCredentialsPlugin.java', 'PosDevicePlugin.java', 'PosThermalPrinterPlugin.java'):
    copyfile(root / 'apps/pos/native' / name, activity.with_name(name))

gradle_text = gradle.read_text(encoding='utf-8')
if 'androidx.credentials:credentials:' not in gradle_text:
    if 'dependencies {' not in gradle_text:
        raise SystemExit('Could not add Android Credential Manager dependencies')
    gradle_text = gradle_text.replace('dependencies {', '''dependencies {
    implementation "androidx.credentials:credentials:1.5.0"
    implementation "androidx.credentials:credentials-play-services-auth:1.5.0"''', 1)
    gradle.write_text(gradle_text, encoding='utf-8')

drawable.mkdir(parents=True, exist_ok=True)
copyfile(root / 'public/elmadawy-logo.png', drawable / 'elmadawy_pos_logo.png')
for icon in (android / 'app/src/main/res').glob('mipmap-anydpi-v26/ic_launcher*.xml'):
    icon_text = icon.read_text(encoding='utf-8')
    icon_text = icon_text.replace('@drawable/ic_launcher_foreground', '@drawable/elmadawy_pos_logo')
    icon.write_text(icon_text, encoding='utf-8')

print('POS Android printing, credentials, camera, HTTPS and app branding configured.')
