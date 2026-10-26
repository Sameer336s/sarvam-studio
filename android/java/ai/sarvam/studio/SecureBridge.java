package ai.sarvam.studio;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Device-backed encryption for API keys.
 *
 * The AES-256 key lives in the Android Keystore and never leaves it: the web layer can only
 * ask for encrypt/decrypt, it can never read the key material. Ciphertext is stored by the
 * web app in localStorage. On devices with a TEE/StrongBox the key is hardware-protected.
 *
 * Exposed to JavaScript as `window.AndroidSecure`.
 */
public class SecureBridge {

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String ALIAS = "sarvam_studio_api_keys_v1";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;

    private final Context context;

    SecureBridge(Context context) {
        this.context = context.getApplicationContext();
    }

    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance(KEYSTORE);
        ks.load(null);
        if (ks.containsAlias(ALIAS)) {
            return (SecretKey) ks.getKey(ALIAS, null);
        }
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        kg.init(new KeyGenParameterSpec.Builder(
                ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build());
        return kg.generateKey();
    }

    /** True when a Keystore-backed key can be created/used on this device. */
    @JavascriptInterface
    public boolean available() {
        try {
            key();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Returns "base64(iv):base64(ciphertext)", or "" when encryption is unavailable. */
    @JavascriptInterface
    public String encrypt(String plain) {
        if (plain == null) return "";
        try {
            Cipher c = Cipher.getInstance(TRANSFORMATION);
            c.init(Cipher.ENCRYPT_MODE, key());
            byte[] ct = c.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return Base64.encodeToString(c.getIV(), Base64.NO_WRAP)
                    + ":" + Base64.encodeToString(ct, Base64.NO_WRAP);
        } catch (Exception e) {
            return "";
        }
    }

    /** Returns the plaintext, or "" when the blob cannot be decrypted. */
    @JavascriptInterface
    public String decrypt(String blob) {
        if (blob == null) return "";
        try {
            int sep = blob.indexOf(':');
            if (sep <= 0) return "";
            byte[] iv = Base64.decode(blob.substring(0, sep), Base64.NO_WRAP);
            byte[] ct = Base64.decode(blob.substring(sep + 1), Base64.NO_WRAP);
            Cipher c = Cipher.getInstance(TRANSFORMATION);
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(GCM_TAG_BITS, iv));
            return new String(c.doFinal(ct), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "";
        }
    }
}
