# Android app (APK)

`SarvamStudio-2.0.apk` in the project root is this web app wrapped in a native WebView shell.
Same UI, same models, same MCP support — installed like any other app.

```
AndroidManifest.xml          app id ai.sarvam.studio, minSdk 23, targetSdk 34
java/ai/sarvam/studio/
  MainActivity.java          WebView host: file:// assets, DOM storage, universal file access
  SecureBridge.java          Android Keystore AES-256 encrypt/decrypt for API keys
res/                         launcher icon (adaptive), theme, strings
assets/www/                  the built web app (index.html, app.js, app.css)
keystore/sarvam-studio.jks   self-signed key used for this build
build-apk.sh                 rebuild without Gradle
```

## Install

Copy the APK to the phone and open it (allow “install unknown apps” for your file manager), or:

```
adb install -r SarvamStudio-2.0.apk
```

Android may warn that the app is from an unknown developer — it is signed with a self-signed key,
which is expected for a sideloaded app.

## Rebuild

You need a JDK 17 and an Android SDK with build-tools + one platform. No Gradle, no Android Studio.

```
ANDROID_SDK=~/Android/Sdk ./android/build-apk.sh            # reuse the assets in assets/www
ANDROID_SDK=~/Android/Sdk ./android/build-apk.sh --web      # rebuild the web bundle first
```

`--web` runs `npm run build` and copies `dist/` into `android/assets/www/`. Output lands in
`android/build/sarvam-studio.apk`.

## Signing

The APK is signed with `android/keystore/sarvam-studio.jks`
(alias `androiddebugkey`, password `android`). That is the standard throwaway debug convention —
fine for sideloading, **not** for the Play Store. Two things follow from it:

- Keep the keystore file if you want to ship updates: Android only accepts an update signed with
  the same key. Lose it and users must uninstall before installing a new build.
- Publishing anywhere public? Generate your own key and keep the password out of the repo:
  `KEYSTORE=/secure/path/release.jks KS_PASS=… ./android/build-apk.sh`

## Why the WebView is configured the way it is

- **`allowUniversalAccessFromFileURLs` / `allowFileAccessFromFileURLs`** — the UI runs from
  `file:///android_asset/www/`. These flags let it call provider APIs and MCP servers directly.
  Without them every request would be blocked by CORS, and the alternative (a real origin) needs a
  server relaying every request. The trade-off is deliberate for a local single-user app: the
  WebView only ever loads your own bundled files, and everything else opens in the system browser.
- **`usesCleartextTraffic` + `MIXED_CONTENT_ALWAYS_ALLOW`** — so a local MCP bridge on
  `http://localhost:3001` works.
- **`windowSoftInputMode=adjustResize`** — the composer stays above the keyboard.
- **Back button** — goes back inside the page if possible, otherwise exits.

## API keys on Android

Keys are encrypted with a 256-bit AES key that lives in the **Android Keystore** and never leaves it
(`SecureBridge`); only ciphertext is written to the app's localStorage. On devices with a TEE or
StrongBox the key is hardware-protected. Uninstalling the app destroys the key, so the ciphertext
becomes unreadable — that is the intended behaviour.

## What is not in the APK

- No Play Store listing, no push notifications, no background service.
- No offline model — every request goes to the provider you configured.
- Speech-to-text / TTS endpoints are still not wired in (same as the web build).
