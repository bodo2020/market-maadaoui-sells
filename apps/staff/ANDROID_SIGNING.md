# Staff Android stable signing

The Staff app package ID is fixed at `com.elmadawy.staff`.

## Why this is required

Android only installs a newer APK over an existing APK when both APKs use the same package ID **and the same signing certificate**.

Older CI Staff APKs were debug-signed by ephemeral GitHub-hosted runners. Their certificates are not stable between runs. Therefore the project must migrate once to a permanent release keystore. After that migration, future APKs can update in place as long as the same keystore is retained.

## Required GitHub Actions secrets

Configure these repository secrets before producing a distributable build from `main`:

- `STAFF_ANDROID_KEYSTORE_BASE64`
- `STAFF_ANDROID_KEYSTORE_PASSWORD`
- `STAFF_ANDROID_KEY_ALIAS`
- `STAFF_ANDROID_KEY_PASSWORD`

The workflow intentionally allows debug fallback only on pull requests. A `main` build fails if stable signing is not configured.

## One-time keystore creation

Create and back up the keystore **outside the repository**:

```bash
keytool -genkeypair \
  -v \
  -keystore staff-release.jks \
  -alias elmadawy-staff \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000
```

Convert the binary keystore to a single-line Base64 value:

Linux/macOS:

```bash
base64 -w 0 staff-release.jks
```

PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("staff-release.jks"))
```

Store the output in `STAFF_ANDROID_KEYSTORE_BASE64`.

## Important backup rule

Keep at least two offline encrypted backups of `staff-release.jks` and its passwords. Do not commit the keystore or passwords to GitHub.

Losing this key means Android will not accept future APK updates over installations signed with it.

## Current migration caveat

The legacy debug-signed Staff APK and the new CI test APK have different signing certificate fingerprints. That means the first migration from a legacy build to the permanent release-signed build requires uninstalling the legacy build once. After the permanent signing key is configured and the first release-signed build is installed, future releases can update in place.
