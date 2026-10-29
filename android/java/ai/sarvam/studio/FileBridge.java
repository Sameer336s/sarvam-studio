package ai.sarvam.studio;

import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Saves generated files (code the model wrote, exported text) onto the device.
 *
 * A blob download inside a WebView silently does nothing, so the web layer calls this
 * instead. Android 10+ writes into the public Downloads folder through MediaStore — no
 * permission needed. Older devices fall back to the app's own Download directory.
 *
 * Exposed to JavaScript as `window.AndroidFiles`.
 */
public class FileBridge {

    private final Context context;

    FileBridge(Context context) {
        this.context = context.getApplicationContext();
    }

    /**
     * @param name   suggested file name
     * @param base64 file bytes, base64 encoded
     * @param mime   content type
     * @return "saved" on success, "failed" otherwise
     */
    @JavascriptInterface
    public String save(String name, String base64, String mime) {
        try {
            byte[] data = Base64.decode(base64, Base64.DEFAULT);
            String safe = sanitize(name);
            String type = (mime == null || mime.isEmpty()) ? "application/octet-stream" : mime;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                values.put(MediaStore.Downloads.MIME_TYPE, type);
                values.put(MediaStore.Downloads.IS_PENDING, 1);

                Uri uri = context.getContentResolver()
                        .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) return "failed";

                OutputStream os = context.getContentResolver().openOutputStream(uri);
                if (os == null) return "failed";
                try {
                    os.write(data);
                    os.flush();
                } finally {
                    os.close();
                }

                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                context.getContentResolver().update(uri, values, null, null);
                return "saved";
            }

            // Android 9 and older: no scoped storage, keep it in the app's Download folder.
            File dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) return "failed";
            if (!dir.exists() && !dir.mkdirs()) return "failed";
            File out = new File(dir, safe);
            FileOutputStream fos = new FileOutputStream(out);
            try {
                fos.write(data);
                fos.flush();
            } finally {
                fos.close();
            }
            return "saved";
        } catch (Exception e) {
            return "failed";
        }
    }

    private static String sanitize(String name) {
        String n = (name == null || name.trim().isEmpty()) ? "sarvam-studio-file" : name.trim();
        n = n.replaceAll("[\\\\/:*?\"<>|\\r\\n\\t]", "_");
        if (n.length() > 120) n = n.substring(0, 120);
        return n;
    }
}
