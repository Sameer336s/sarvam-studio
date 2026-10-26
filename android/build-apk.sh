#!/usr/bin/env bash
# Build Sarvam Studio as a signed APK — no Gradle, no Android Studio required.
#
# Needs:
#   - a JDK 17 (JAVA_HOME, or `java` on PATH)
#   - Android SDK: build-tools (aapt2, zipalign, apksigner, lib/d8.jar)
#     and one platform (android.jar)
#   - node + npm, only if you want the web bundle rebuilt (--web)
#
#   ANDROID_SDK=~/Android/Sdk ./android/build-apk.sh --web
#
# Output: android/build/sarvam-studio.apk
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT/android"
BUILD="$ANDROID_DIR/build"
OUT_APK="${OUT_APK:-$BUILD/sarvam-studio.apk}"
KS="${KEYSTORE:-$ANDROID_DIR/keystore/sarvam-studio.jks}"
KS_ALIAS="${KS_ALIAS:-androiddebugkey}"
KS_PASS="${KS_PASS:-android}"

WEB=0
[[ "${1:-}" == "--web" || "${2:-}" == "--web" ]] && WEB=1

# ---------------------------------------------------------------- toolchain
: "${ANDROID_SDK:?set ANDROID_SDK to your Android SDK path}"
BT="$(ls -d "$ANDROID_SDK"/build-tools/*/ 2>/dev/null | sort -V | tail -1 || true)"
BT="${BT%/}"
[[ -d "$BT" ]] || { echo "No build-tools found under $ANDROID_SDK"; exit 1; }
PLATFORM_JAR="$(ls -d "$ANDROID_SDK"/platforms/android-*/android.jar 2>/dev/null | sort -V | tail -1 || true)"
[[ -f "$PLATFORM_JAR" ]] || { echo "No platforms/android-*/android.jar found under $ANDROID_SDK"; exit 1; }

if [[ -n "${JAVA_HOME:-}" ]]; then
  export PATH="$JAVA_HOME/bin:$PATH"   # apksigner and keytool look up `java` on PATH
fi
JAVA_BIN="${JAVA_HOME:+$JAVA_HOME/bin/}java"
JAVAC_BIN="${JAVA_HOME:+$JAVA_HOME/bin/}javac"
KEYTOOL_BIN="${JAVA_HOME:+$JAVA_HOME/bin/}keytool"

echo "build-tools : $BT"
echo "platform    : $PLATFORM_JAR"

# Small, predictable JVM footprint so this also works on memory-constrained boxes.
# -XX:ActiveProcessorCount=1 keeps d8 single-threaded-ish: it is the difference between
# building on a small CI box and running out of native memory.
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:--Xms32m -Xmx256m -Xss512k -XX:+UseSerialGC -XX:MaxMetaspaceSize=96m -XX:CompressedClassSpaceSize=32m -XX:ReservedCodeCacheSize=16m -XX:-UsePerfData -XX:ActiveProcessorCount=1}"

# ------------------------------------------------------------------ web app
if [[ $WEB -eq 1 ]]; then
  echo "==> building web app"
  ( cd "$ROOT" && npm run build )
  rm -rf "$ANDROID_DIR/assets/www"
  mkdir -p "$ANDROID_DIR/assets/www"
  cp -r "$ROOT"/dist/. "$ANDROID_DIR/assets/www/"
  # A WebView needs relative asset paths and no pinch-zoom.
  python3 - "$ANDROID_DIR/assets/www/index.html" <<'PYEOF'
import re, sys
p = sys.argv[1]
html = open(p).read()
html = re.sub(r'src="/assets/', 'src="./assets/', html)
html = re.sub(r'href="/assets/', 'href="./assets/', html)
html = re.sub(r'<meta name="viewport"[^>]*>',
              '<meta name="viewport" content="width=device-width, initial-scale=1.0, '
              'maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />', html)
open(p, "w").write(html)
PYEOF
fi
[[ -f "$ANDROID_DIR/assets/www/index.html" ]] || { echo "android/assets/www is empty — run with --web"; exit 1; }

rm -rf "$BUILD"
mkdir -p "$BUILD/gen" "$BUILD/classes" "$BUILD/dex"
cd "$ANDROID_DIR"

# ------------------------------------------------------------------ resources
echo "==> aapt2 compile/link"
"$BT/aapt2" compile --dir res -o "$BUILD/res.zip"
"$BT/aapt2" link \
  -o "$BUILD/base.apk" \
  -I "$PLATFORM_JAR" \
  --manifest AndroidManifest.xml \
  --java "$BUILD/gen" \
  --min-sdk-version 23 \
  --target-sdk-version 34 \
  -A assets \
  "$BUILD/res.zip"

# --------------------------------------------------------------------- java
echo "==> javac"
"$JAVAC_BIN" -source 8 -target 8 -nowarn \
  -bootclasspath "$PLATFORM_JAR" -cp "$PLATFORM_JAR" \
  -d "$BUILD/classes" \
  $(find java -name '*.java') "$BUILD/gen/ai/sarvam/studio/R.java"

echo "==> d8"
"$JAVA_BIN" -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 \
  --min-api 23 --thread-count 1 --lib "$PLATFORM_JAR" \
  --output "$BUILD/dex" $(find "$BUILD/classes" -name '*.class')

# ------------------------------------------------------------------- package
echo "==> package + align"
cp "$BUILD/base.apk" "$BUILD/unaligned.apk"
( cd "$BUILD/dex" && zip -q -X "$BUILD/unaligned.apk" classes.dex )
"$BT/zipalign" -f -p 4 "$BUILD/unaligned.apk" "$BUILD/aligned.apk"

# --------------------------------------------------------------------- sign
if [[ ! -f "$KS" ]]; then
  echo "==> generating self-signed keystore at $KS"
  mkdir -p "$(dirname "$KS")"
  "$KEYTOOL_BIN" -genkeypair -keystore "$KS" -alias "$KS_ALIAS" \
    -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -keyalg RSA -keysize 2048 -validity 10950 \
    -dname "CN=Sarvam Studio, O=Sarvam Studio, L=Pune, C=IN"
fi

echo "==> signing"
"$BT/apksigner" sign \
  --ks "$KS" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" \
  --v1-signing-enabled true --v2-signing-enabled true \
  --out "$OUT_APK" "$BUILD/aligned.apk"

"$BT/apksigner" verify --verbose "$OUT_APK" | head -6
echo
echo "APK ready: $OUT_APK  ($(du -h "$OUT_APK" | cut -f1))"
echo "Install with: adb install -r \"$OUT_APK\""
