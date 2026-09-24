"""Post-generation Android settings for the dedicated main POS package."""

from pathlib import Path
from shutil import copyfile
import re

root = Path(__file__).resolve().parents[1]
android = root / 'apps/pos/android'
variables = android / 'variables.gradle'
manifest = android / 'app/src/main/AndroidManifest.xml'
activity = android / 'app/src/main/java/com/elmadawy/pos/MainActivity.java'
drawable = android / 'app/src/main/res/drawable'

for path in (variables, manifest, activity):
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
manifest.write_text(text, encoding='utf-8')

activity.write_text('''package com.elmadawy.pos;

import android.os.Bundle;
import android.view.View;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);
        }
    }
}
''', encoding='utf-8')

drawable.mkdir(parents=True, exist_ok=True)
copyfile(root / 'public/elmadawy-logo.png', drawable / 'elmadawy_pos_logo.png')
for icon in (android / 'app/src/main/res').glob('mipmap-anydpi-v26/ic_launcher*.xml'):
    icon_text = icon.read_text(encoding='utf-8')
    icon_text = icon_text.replace('@drawable/ic_launcher_foreground', '@drawable/elmadawy_pos_logo')
    icon.write_text(icon_text, encoding='utf-8')

print('POS Android camera, autofill, HTTPS and app branding configured.')
