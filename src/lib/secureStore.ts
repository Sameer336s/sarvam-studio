/**
 * Persistent, encrypted-at-rest storage for API keys.
 *
 * Why this exists: the previous build defaulted to sessionStorage, so every restart of the
 * app wiped the key and the user had to paste it again. Keys are now remembered by default.
 *
 * How it is stored:
 *  - A 256-bit AES-GCM key is generated once and kept in IndexedDB as a *non-extractable*
 *    CryptoKey. JavaScript cannot read its bytes back out, so it cannot be exfiltrated by
 *    a script or read out of localStorage by someone poking at DevTools storage.
 *  - Each secret is encrypted with that key and the ciphertext (iv + data) is written to
 *    localStorage. Ciphertext is useless without the IndexedDB key.
 *
 * Honest limits: this protects against casual inspection of localStorage and against
 * someone copying your storage dump to another machine. It does NOT protect against
 * malicious code running on this page while the app is open, or against someone using your
 * unlocked browser. For production, keep keys on a server you control.
 */

const DB_NAME = "sarvam-studio";
const DB_STORE = "kv";
const DEVICE_KEY_ID = "device-key";
const LS_SECRETS = "sarvam.v2.secrets";
const LS_ANDROID = "sarvam.v2.secrets.android";
const LS_PLAIN = "sarvam.v2.secrets.plain";

type Blob = { iv: string; ct: string };

/**
 * Android build only: the APK exposes `AndroidSecure` (a @JavascriptInterface) that
 * encrypts with an AES-256 key held in the Android Keystore — hardware-backed where the
 * device supports it. When present we prefer it over WebCrypto, because a WebView on a
 * file:// origin may not have IndexedDB.
 */
type AndroidSecure = {
  available: () => boolean;
  encrypt: (plain: string) => string;
  decrypt: (blob: string) => string;
};

function androidBridge(): AndroidSecure | null {
  const b = (globalThis as unknown as { AndroidSecure?: AndroidSecure }).AndroidSecure;
  if (!b || typeof b.available !== "function") return null;
  try {
    return b.available() ? b : null;
  } catch {
    return null;
  }
}

function readAndroidMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_ANDROID);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeAndroidMap(map: Record<string, string>) {
  try {
    if (Object.keys(map).length === 0) localStorage.removeItem(LS_ANDROID);
    else localStorage.setItem(LS_ANDROID, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

let cachedKey: CryptoKey | null = null;
let keyPromise: Promise<CryptoKey | null> | null = null;

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, "readonly");
      const req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbPut(db: IDBDatabase, key: string, value: unknown): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function getDeviceKey(): Promise<CryptoKey | null> {
  if (cachedKey) return cachedKey;
  if (keyPromise) return keyPromise;

  keyPromise = (async () => {
    if (typeof crypto === "undefined" || !crypto.subtle) return null;
    const db = await idb();
    if (!db) return null;

    const existing = await idbGet<CryptoKey>(db, DEVICE_KEY_ID);
    if (existing && (existing as CryptoKey).type === "secret") {
      cachedKey = existing;
      return existing;
    }

    try {
      const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
        "encrypt",
        "decrypt",
      ]);
      const ok = await idbPut(db, DEVICE_KEY_ID, key);
      if (!ok) return null;
      cachedKey = key;
      return key;
    } catch {
      return null;
    }
  })();

  const k = await keyPromise;
  if (!k) keyPromise = null;
  return k;
}

function readBlobs(): Record<string, Blob> {
  try {
    const raw = localStorage.getItem(LS_SECRETS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, Blob>) : {};
  } catch {
    return {};
  }
}

function writeBlobs(blobs: Record<string, Blob>) {
  try {
    if (Object.keys(blobs).length === 0) localStorage.removeItem(LS_SECRETS);
    else localStorage.setItem(LS_SECRETS, JSON.stringify(blobs));
  } catch {
    /* quota / private mode */
  }
}

function readPlain(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_PLAIN);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function writePlain(map: Record<string, string>) {
  try {
    if (Object.keys(map).length === 0) localStorage.removeItem(LS_PLAIN);
    else localStorage.setItem(LS_PLAIN, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** True when some real encryption path is usable (Android Keystore or WebCrypto). */
export async function encryptionAvailable(): Promise<boolean> {
  if (androidBridge()) return true;
  return (await getDeviceKey()) !== null;
}

export async function saveSecret(name: string, value: string): Promise<void> {
  if (!value) return removeSecret(name);
  const bridge = androidBridge();
  if (bridge) {
    const blob = bridge.encrypt(value);
    if (blob) {
      const map = readAndroidMap();
      map[name] = blob;
      writeAndroidMap(map);
      return;
    }
  }
  const key = await getDeviceKey();
  if (!key) {
    // Fallback: obfuscated (not encrypted) — clearly flagged in the UI.
    const plain = readPlain();
    plain[name] = btoa(unescape(encodeURIComponent(value)));
    writePlain(plain);
    return;
  }
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(value),
    );
    const blobs = readBlobs();
    blobs[name] = { iv: b64(iv), ct: b64(ct) };
    writeBlobs(blobs);
    const plain = readPlain();
    delete plain[name];
    writePlain(plain);
  } catch {
    const plain = readPlain();
    plain[name] = btoa(unescape(encodeURIComponent(value)));
    writePlain(plain);
  }
}

export async function loadSecret(name: string): Promise<string> {
  const bridge = androidBridge();
  if (bridge) {
    const blob = readAndroidMap()[name];
    if (blob) {
      const plain = bridge.decrypt(blob);
      if (plain) return plain;
    }
  }
  const blobs = readBlobs();
  const blob = blobs[name];
  if (blob) {
    const key = await getDeviceKey();
    if (key) {
      try {
        const pt = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: unb64(blob.iv) as unknown as BufferSource },
          key,
          unb64(blob.ct) as unknown as BufferSource,
        );
        return new TextDecoder().decode(pt);
      } catch {
        /* key rotated / storage copied from another device */
      }
    }
  }
  const plain = readPlain()[name];
  if (plain) {
    try {
      return decodeURIComponent(escape(atob(plain)));
    } catch {
      return "";
    }
  }
  return "";
}

export async function removeSecret(name: string): Promise<void> {
  const androidMap = readAndroidMap();
  if (androidMap[name]) {
    delete androidMap[name];
    writeAndroidMap(androidMap);
  }
  const blobs = readBlobs();
  if (blobs[name]) {
    delete blobs[name];
    writeBlobs(blobs);
  }
  const plain = readPlain();
  if (plain[name]) {
    delete plain[name];
    writePlain(plain);
  }
}

export async function loadSecrets(names: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const n of names) out[n] = await loadSecret(n);
  return out;
}

/** Wipes every stored secret and the device key. Irreversible. */
export async function wipeAllSecrets(): Promise<void> {
  writeBlobs({});
  writePlain({});
  writeAndroidMap({});
  cachedKey = null;
  keyPromise = null;
  const db = await idb();
  if (db) await idbDelete(db, DEVICE_KEY_ID);
}
