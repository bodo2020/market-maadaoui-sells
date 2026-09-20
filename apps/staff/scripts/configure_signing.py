from pathlib import Path
import os

root = Path(__file__).resolve().parents[1]
gradle = root / "android/app/build.gradle"
text = gradle.read_text(encoding="utf-8")

required = [
    "STAFF_STORE_FILE",
    "STAFF_STORE_PASSWORD",
    "STAFF_KEY_ALIAS",
    "STAFF_KEY_PASSWORD",
]
missing = [name for name in required if not os.environ.get(name)]
if missing:
    raise SystemExit("Missing signing environment: " + ", ".join(missing))

signing = """    signingConfigs {
        staffRelease {
            storeFile file(STAFF_STORE_FILE)
            storePassword STAFF_STORE_PASSWORD
            keyAlias STAFF_KEY_ALIAS
            keyPassword STAFF_KEY_PASSWORD
        }
    }
"""
if "signingConfigs {" not in text:
    text = text.replace("    buildTypes {", signing + "\n    buildTypes {", 1)
if "signingConfig signingConfigs.staffRelease" not in text:
    text = text.replace(
        "        release {",
        "        release {\n            signingConfig signingConfigs.staffRelease",
        1,
    )
gradle.write_text(text, encoding="utf-8")
