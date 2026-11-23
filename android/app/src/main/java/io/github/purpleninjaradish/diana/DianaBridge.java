package io.github.purpleninjaradish.diana;

import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Base64;
import android.util.Log;
import android.webkit.WebView;

import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * The page's way to the school's Odin server (and to the phone's buzz and print screen), as the "DianaAndroid" object,
 * offered only to DI-ana's own page in the app.
 *
 * The page asks; this class makes the request to Odin's address and nowhere else, and only to Odin's API (api/...).
 * The sign-in's session cookie is kept here, in memory only: it is never written down, and it is gone when DI-ana closes.
 * The password is sent to Odin once and not kept.
 *
 * Messages (JSON): hello, signin {password}, get {path}, post {path, body}, signout, buzz {ms}, printpdf {name, b64}, toured, setup.
 * Each gets a reply {t: "reply", id, ...}. When the app leaves the screen the page hears {t: "app", ev: "hidden"}.
 */
final class DianaBridge implements WebViewCompat.WebMessageListener {
    private static final String TAG = "DianaBridge";
    private static final String NAME = "DianaAndroid";
    private static final Pattern API = Pattern.compile("^api/[a-z][a-z/]{0,60}$");
    private static final int MAX_ANSWER = 8 * 1024 * 1024;

    private final MainActivity act;
    private final WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService net = Executors.newSingleThreadExecutor();
    private JavaScriptReplyProxy reply;
    private boolean attached;
    private volatile String cookie;   // Odin's session, in memory only

    DianaBridge(MainActivity act, WebView web) {
        this.act = act;
        this.web = web;
    }

    /** Offers the bridge to pages from this origin only (DI-ana's own page, served by the app). */
    boolean attach(String origin) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return false;
        try {
            if (attached) WebViewCompat.removeWebMessageListener(web, NAME);
            WebViewCompat.addWebMessageListener(web, NAME, Collections.singleton(origin), this);
            attached = true;
            return true;
        } catch (RuntimeException e) {
            Log.w(TAG, "No bridge for " + origin, e);
            attached = false;
            return false;
        }
    }

    /** A different Odin address, or the demo: the sign-in ends. */
    void forget() {
        cookie = null;
    }

    void appHidden() {
        send(o("t", "app", "ev", "hidden"));
    }

    void destroy() {
        cookie = null;
        net.shutdownNow();
        if (attached && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            try {
                WebViewCompat.removeWebMessageListener(web, NAME);
            } catch (RuntimeException e) {
                Log.w(TAG, "remove", e);
            }
        }
        attached = false;
    }

    @Override
    public void onPostMessage(WebView view, WebMessageCompat message, Uri sourceOrigin, boolean isMainFrame, JavaScriptReplyProxy replyProxy) {
        if (!isMainFrame) return;   // only DI-ana's page, never a frame inside it
        String data = message.getData();
        if (data == null) return;
        final JSONObject m;
        try {
            m = new JSONObject(data);
        } catch (JSONException e) {
            return;
        }
        reply = replyProxy;
        if (Looper.myLooper() == Looper.getMainLooper()) handle(m);
        else main.post(() -> handle(m));
    }

    private void handle(JSONObject m) {
        final String id = m.optString("id");
        final String target = act.target;
        final boolean server = target != null && !MainActivity.DEMO.equals(target);
        switch (m.optString("t")) {
            case "hello":
                send(o("t", "reply", "id", id, "app", BuildConfig.VERSION_NAME, "sdk", Build.VERSION.SDK_INT,
                        "mode", server ? "server" : "demo", "server", server ? target : "", "toured", act.toured()));
                break;
            case "signin":
                if (!server) {
                    send(o("t", "reply", "id", id, "ok", false, "error", "This is the demo: there's no Odin to sign in to."));
                    break;
                }
                final String pw = m.optString("password", "");
                net.execute(() -> {
                    JSONObject body = o("password", pw);
                    Answer a = request(target, "POST", "api/signin", body.toString(), true);
                    if (a.status == 200) cookie = a.cookie;
                    String err = a.status == 200 ? null : a.status == 0 ? a.error : errorOf(a.body, "Odin answered " + a.status);
                    send(o("t", "reply", "id", id, "ok", a.status == 200 && cookie != null, "status", a.status, "error",
                            a.status == 200 && cookie == null ? "Odin didn't start a sign-in. Is this Odin 0.9.5 or newer?" : err));
                });
                break;
            case "get":
            case "post": {
                final String path = m.optString("path", "");
                final boolean post = "post".equals(m.optString("t"));
                final JSONObject body = m.optJSONObject("body");
                if (!server || !API.matcher(path).matches()) {
                    send(o("t", "reply", "id", id, "status", 400, "error", "DI-ana asks Odin only for its own information."));
                    break;
                }
                net.execute(() -> {
                    Answer a = request(target, post ? "POST" : "GET", path, post ? (body == null ? "{}" : body.toString()) : null, false);
                    send(o("t", "reply", "id", id, "status", a.status, "body", a.body, "error", a.error));
                });
                break;
            }
            case "signout":
                if (server && cookie != null) net.execute(() -> {
                    request(target, "POST", "api/signout", "{}", false);
                    cookie = null;
                    send(o("t", "reply", "id", id, "ok", true));
                });
                else {
                    cookie = null;
                    send(o("t", "reply", "id", id, "ok", true));
                }
                break;
            case "buzz":
                buzz(Math.max(20, Math.min(400, m.optInt("ms", 60))));
                send(o("t", "reply", "id", id, "ok", true));
                break;
            case "printpdf": {
                byte[] pdf = null;
                try {
                    pdf = Base64.decode(m.optString("b64", ""), Base64.DEFAULT);
                } catch (IllegalArgumentException e) {
                    Log.w(TAG, "bad pdf", e);
                }
                boolean ok = pdf != null && pdf.length > 4 && pdf[0] == '%' && pdf[1] == 'P' && act.printPdf(m.optString("name", "DI-ana"), pdf);
                send(o("t", "reply", "id", id, "ok", ok));
                break;
            }
            case "toured":   // the walkthrough was seen: it doesn't open by itself again
                act.markToured();
                send(o("t", "reply", "id", id, "ok", true));
                break;
            case "setup":
                act.showSetup(null);
                send(o("t", "reply", "id", id, "ok", true));
                break;
            default:
                break;
        }
    }

    private static final class Answer {
        int status;
        String body = "", error, cookie;
    }

    /** One request to Odin (on the network thread). The session cookie goes with it; the answer is read into memory. */
    private Answer request(String base, String method, String path, String json, boolean signin) {
        Answer a = new Answer();
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(base + path).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(10000);
            c.setReadTimeout(30000);
            c.setUseCaches(false);
            c.setRequestMethod(method);
            c.setRequestProperty("Accept", "application/json");
            c.setRequestProperty("User-Agent", "DIanaAndroid/" + BuildConfig.VERSION_NAME);
            String ck = cookie;
            if (ck != null && !signin) c.setRequestProperty("Cookie", ck);
            if (json != null) {
                byte[] out = json.getBytes(StandardCharsets.UTF_8);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                c.setFixedLengthStreamingMode(out.length);
                try (OutputStream o = c.getOutputStream()) {
                    o.write(out);
                }
            }
            a.status = c.getResponseCode();
            if (signin) {
                Map<String, List<String>> h = c.getHeaderFields();
                for (Map.Entry<String, List<String>> e : h.entrySet()) {
                    if (e.getKey() == null || !"set-cookie".equalsIgnoreCase(e.getKey())) continue;
                    for (String v : e.getValue()) {
                        String first = v.split(";", 2)[0].trim();
                        if (first.startsWith("odin_session=") && first.length() > 13) a.cookie = first;
                    }
                }
            }
            InputStream in = a.status >= 400 ? c.getErrorStream() : c.getInputStream();
            if (in != null) {
                try (InputStream s = in) {
                    ByteArrayOutputStream buf = new ByteArrayOutputStream();
                    byte[] chunk = new byte[16384];
                    int n, total = 0;
                    while ((n = s.read(chunk)) > 0) {
                        total += n;
                        if (total > MAX_ANSWER) throw new IOException("Odin's answer is too large");
                        buf.write(chunk, 0, n);
                    }
                    a.body = buf.toString("UTF-8");
                }
            }
            if (a.status >= 300 && a.status < 400) a.error = "Odin's address sent DI-ana somewhere else. Check the address.";
        } catch (javax.net.ssl.SSLException e) {
            a.status = 0;
            a.error = "Odin's address answered with a certificate this phone doesn't trust. Ask IT to install the school's certificate on this phone, or check the address.";
        } catch (IOException | RuntimeException e) {
            a.status = 0;
            a.error = "Can't reach Odin at " + base + ". Check that this phone is on the school network. (" + e.getClass().getSimpleName() + ")";
        } finally {
            if (c != null) c.disconnect();
        }
        return a;
    }

    private static String errorOf(String body, String fallback) {
        try {
            String e = new JSONObject(body).optString("error", "");
            return e.isEmpty() ? fallback : e;
        } catch (JSONException e) {
            return fallback;
        }
    }

    @SuppressWarnings("deprecation")
    private void buzz(int ms) {
        try {
            Vibrator v;
            if (Build.VERSION.SDK_INT >= 31) {
                VibratorManager vm = (VibratorManager) act.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                v = vm == null ? null : vm.getDefaultVibrator();
            } else {
                v = (Vibrator) act.getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (v != null && v.hasVibrator()) v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
        } catch (RuntimeException e) {
            Log.w(TAG, "buzz", e);
        }
    }

    void send(JSONObject msg) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            main.post(() -> send(msg));
            return;
        }
        if (reply == null) return;
        try {
            reply.postMessage(msg.toString());
        } catch (RuntimeException e) {
            Log.w(TAG, "The page didn't take a message", e);
        }
    }

    static JSONObject o(Object... kv) {
        JSONObject j = new JSONObject();
        try {
            for (int k = 0; k + 1 < kv.length; k += 2) j.put((String) kv[k], kv[k + 1] == null ? JSONObject.NULL : kv[k + 1]);
        } catch (JSONException e) {
            Log.w(TAG, "bad message", e);
        }
        return j;
    }
}
