package io.github.purpleninjaradish.diana;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Insets;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.text.InputType;
import android.util.Base64;
import android.util.Log;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.webkit.ConsoleMessage;
import android.webkit.MimeTypeMap;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Locale;

/**
 * DI-ana for Android: reads Odin's paper sheets (pre-checks, practice sheets, post-checks) with the phone's camera, and
 * sends only the answers to the school's Odin server.
 *
 * The page is always DI-ana's own, built into the app (assets/web, made by web/build.py) and served by the app over https,
 * so it never comes from the internet. It runs the demo with invented students, or works with the school's Odin server:
 * then this app (DianaBridge) signs in and makes the requests for the page, only to that address.
 * The camera's pictures are read in the page's memory; nothing is saved. The app keeps only Odin's address.
 */
public class MainActivity extends Activity {
    static final String TAG = "DIana";
    private static final int REQ_FILES = 2, REQ_CAMERA = 3;
    private static final String PREFS = "diana", KEY_URL = "url", KEY_TOURED = "toured";
    static final String DEMO = "demo";
    static final String PAGE = "https://" + WebViewAssetLoader.DEFAULT_DOMAIN + "/assets/web/index.html";
    static final String PAGE_ORIGIN = "https://" + WebViewAssetLoader.DEFAULT_DOMAIN;
    private static final int INK = 0xFF1B1726, MUTED = 0xFF5E5870, BODY = 0xFF4A4458, ERROR = 0xFFB9402A, BG = 0xFFF3F2F6;

    private FrameLayout root;
    private WebView web;
    private DianaBridge bridge;
    private ScrollView setup;
    private EditText urlBox;
    private TextView setupMsg;
    private ValueCallback<Uri[]> fileCb;
    private PermissionRequest camAsk;
    private WebViewAssetLoader assets;
    private boolean testRan;
    /** Odin's address, or DEMO. The page asks the bridge which one ("hello"). */
    String target;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        root = new FrameLayout(this);
        root.setBackgroundColor(BG);
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 35) {
            // Android 15 draws apps under the status and navigation bars: keep DI-ana clear of them and of the keyboard.
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets s = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(s.left, s.top, s.right, s.bottom);
                return WindowInsets.CONSUMED;
            });
        }
        // Nothing from an earlier time: the page keeps nothing, and neither does its storage.
        if (saved == null) WebStorage.getInstance().deleteAllData();
        String url = prefs().getString(KEY_URL, null);
        if (BuildConfig.DEBUG && getIntent().hasExtra("diana_url")) url = getIntent().getStringExtra("diana_url");   // the emulator check only
        if (url == null) showSetup(null);
        else open(url);
    }

    // ---------- the page ----------
    void open(String to) {
        target = to;
        // No screenshots or app-switcher pictures of student information. The demo has only invented students.
        if (DEMO.equals(to) || BuildConfig.DEBUG) getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        if (web == null) makeWeb();
        else if (bridge != null) bridge.forget();   // a new place: the old sign-in goes
        hideSetup();
        web.loadUrl(PAGE);
    }

    private void makeWeb() {
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(false);   // the page keeps nothing
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setGeolocationEnabled(false);
        s.setMediaPlaybackRequiresUserGesture(false);   // the camera's preview plays at once
        s.setSafeBrowsingEnabled(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setUserAgentString(s.getUserAgentString() + " DIanaAndroid/" + BuildConfig.VERSION_NAME);
        assets = new WebViewAssetLoader.Builder().addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        root.addView(web, 0, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        bridge = new DianaBridge(this, web);
        if (!bridge.attach(PAGE_ORIGIN)) Log.w(TAG, "This WebView can't add the bridge; only the demo works.");
    }

    private final class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
            WebResourceResponse res = assets.shouldInterceptRequest(r.getUrl());
            if (res != null) return res;
            // The page never loads anything from the internet: Odin is reached only through DianaBridge.
            return new WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", null, new ByteArrayInputStream(new byte[0]));
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl();
            if (u.toString().startsWith(PAGE_ORIGIN + "/")) return false;
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
            if (scheme.equals("https") || scheme.equals("http") || scheme.equals("mailto")) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (ActivityNotFoundException e) {
                    Log.w(TAG, "Nothing can open " + scheme);
                }
            }
            return true;   // other addresses open in the browser, never inside the app
        }

        @Override
        public void onPageFinished(WebView v, String url) {
            if (!BuildConfig.DEBUG || testRan) return;
            String js64 = getIntent().getStringExtra("diana_js64");   // the emulator check only (base64, so adb's shell leaves it whole)
            if (js64 != null) {
                testRan = true;
                web.evaluateJavascript(new String(Base64.decode(js64, Base64.DEFAULT), StandardCharsets.UTF_8), null);
            }
        }
    }

    private final class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
            if (fileCb != null) fileCb.onReceiveValue(null);
            fileCb = cb;
            Intent i = new Intent(Intent.ACTION_GET_CONTENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            ArrayList<String> types = new ArrayList<>();
            String[] accept = p.getAcceptTypes();
            if (accept != null) {
                for (String a : accept) {
                    if (a == null) continue;
                    for (String t : a.split(",")) {
                        t = t.trim().toLowerCase(Locale.ROOT);
                        if (t.startsWith(".")) t = MimeTypeMap.getSingleton().getMimeTypeFromExtension(t.substring(1));
                        if (t != null && t.contains("/") && !types.contains(t)) types.add(t);
                    }
                }
            }
            if (!types.isEmpty()) i.putExtra(Intent.EXTRA_MIME_TYPES, types.toArray(new String[0]));
            if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            try {
                startActivityForResult(i, REQ_FILES);
            } catch (ActivityNotFoundException e) {
                fileCb = null;
                cb.onReceiveValue(null);
            }
            return true;
        }

        @Override
        public void onPermissionRequest(PermissionRequest r) {
            // DI-ana's own page may use the camera, to read sheets. Nothing else: no microphone.
            String[] want = r.getResources();
            boolean cameraOnly = want.length == 1 && PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(want[0]);
            String from = r.getOrigin() == null ? "" : r.getOrigin().toString();
            if (!cameraOnly || !from.startsWith(PAGE_ORIGIN)) {
                r.deny();
                return;
            }
            if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                r.grant(want);
                return;
            }
            if (camAsk != null) camAsk.deny();
            camAsk = r;
            requestPermissions(new String[] { Manifest.permission.CAMERA }, REQ_CAMERA);
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest r) {
            if (camAsk == r) camAsk = null;
        }

        @Override
        public boolean onConsoleMessage(ConsoleMessage m) {
            if (BuildConfig.DEBUG) Log.i("DianaPage", m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
            return true;
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req != REQ_FILES) {
            super.onActivityResult(req, res, data);
            return;
        }
        ValueCallback<Uri[]> cb = fileCb;
        fileCb = null;
        if (cb == null) return;
        Uri[] out = null;
        if (res == RESULT_OK && data != null) {
            ClipData c = data.getClipData();
            if (c != null && c.getItemCount() > 0) {
                out = new Uri[c.getItemCount()];
                for (int k = 0; k < out.length; k++) out[k] = c.getItemAt(k).getUri();
            } else if (data.getData() != null) {
                out = new Uri[] { data.getData() };
            }
        }
        cb.onReceiveValue(out);
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        boolean yes = res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
        if (req == REQ_CAMERA && camAsk != null) {
            if (yes) camAsk.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
            else camAsk.deny();
            camAsk = null;
        }
    }

    /** The demo's sample sheets: Android's print screen, which can also save them as a PDF. Nothing is kept by the app. */
    boolean printPdf(final String name, final byte[] pdf) {
        PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
        if (pm == null || pdf == null || pdf.length == 0) return false;
        PrintDocumentAdapter ad = new PrintDocumentAdapter() {
            @Override
            public void onLayout(PrintAttributes oldA, PrintAttributes newA, CancellationSignal cancel, LayoutResultCallback cb, Bundle extras) {
                if (cancel.isCanceled()) {
                    cb.onLayoutCancelled();
                    return;
                }
                cb.onLayoutFinished(new PrintDocumentInfo.Builder(name).setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).build(), true);
            }

            @Override
            public void onWrite(PageRange[] pages, ParcelFileDescriptor dest, CancellationSignal cancel, WriteResultCallback cb) {
                try (FileOutputStream out = new FileOutputStream(dest.getFileDescriptor())) {
                    out.write(pdf);
                    cb.onWriteFinished(new PageRange[] { PageRange.ALL_PAGES });
                } catch (IOException e) {
                    cb.onWriteFailed(e.getMessage());
                }
            }
        };
        try {
            pm.print(name, ad, new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.NA_LETTER).build());
            return true;
        } catch (RuntimeException e) {
            Log.w(TAG, "Printing didn't start", e);
            return false;
        }
    }

    // ---------- the screen and the back button ----------
    @Override
    protected void onStart() {
        super.onStart();
        if (web != null) web.onResume();
    }

    @Override
    protected void onStop() {
        if (bridge != null) bridge.appHidden();   // the page turns the camera off at once
        if (web != null) web.onPause();
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        if (bridge != null) bridge.destroy();
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        WebStorage.getInstance().deleteAllData();
        super.onDestroy();
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (setup != null && setup.getVisibility() == View.VISIBLE) {
            if (web != null && target != null) hideSetup();
            else super.onBackPressed();
            return;
        }
        if (web == null) {
            super.onBackPressed();
            return;
        }
        // The page says "stay" while the camera is open, and once when sheets haven't been sent yet.
        web.evaluateJavascript("(function(){try{return window.__dianaBack?window.__dianaBack():''}catch(e){return ''}})()", r -> {
            if ("\"stay\"".equals(r) || web == null) return;
            finish();
        });
    }

    // ---------- the setup screen: Odin's address, or the demo ----------
    void showSetup(String msg) {
        if (setup == null) buildSetup();
        String saved = prefs().getString(KEY_URL, null);
        if (urlBox.getText().length() == 0 && saved != null && !DEMO.equals(saved)) urlBox.setText(saved);
        setupMsg.setText(msg == null ? "" : msg);
        setupMsg.setVisibility(msg == null ? View.GONE : View.VISIBLE);
        setup.setVisibility(View.VISIBLE);
        setup.bringToFront();
    }

    private void hideSetup() {
        if (setup != null) setup.setVisibility(View.GONE);
    }

    private void buildSetup() {
        setup = new ScrollView(this);
        setup.setBackgroundColor(BG);
        setup.setFillViewport(true);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(24), dp(40), dp(24), dp(24));
        setup.addView(col, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        add(col, text("DI-ana", 30, true, INK), 0);
        add(col, text("Diagnostic testing and Intervention automatic analysis", 16, true, MUTED), 4);
        add(col, text("Reads Odin's paper pre-checks, practice sheets and post-checks with the camera, and sends only the answers to Odin · Project Cerberus", 15, false, MUTED), 4);
        add(col, text("Odin's address on the school network", 16, true, INK), 32);
        urlBox = new EditText(this);
        urlBox.setHint("https://odin.your-school.org");
        urlBox.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        urlBox.setSingleLine(true);
        urlBox.setImeOptions(EditorInfo.IME_ACTION_GO);
        urlBox.setOnEditorActionListener((v, id, ev) -> {
            go();
            return true;
        });
        add(col, urlBox, 6);
        setupMsg = text("", 15, false, ERROR);
        add(col, setupMsg, 8);
        Button openBtn = new Button(this);
        openBtn.setText("Use this Odin");
        openBtn.setOnClickListener(v -> go());
        add(col, openBtn, 12);
        Button demoBtn = new Button(this);
        demoBtn.setText("Try the demo (invented students, built into the app)");
        demoBtn.setOnClickListener(v -> {
            prefs().edit().putString(KEY_URL, DEMO).apply();
            open(DEMO);
        });
        add(col, demoBtn, 8);
        add(col, text("DI-ana reads each sheet's pictures in the phone's memory: they are never saved or sent. Only the answers go to Odin, "
                + "after you press Send, and only to the address above. The camera is used only to read sheets. Nothing about students stays on the phone: "
                + "closing DI-ana clears its list, and the sign-in ends. Use real student information only with the school's written approval.", 14, false, BODY), 28);
        add(col, text("DI-ana for Android " + BuildConfig.VERSION_NAME + " · Android " + Build.VERSION.RELEASE, 13, false, MUTED), 24);
        root.addView(setup, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void go() {
        String u = urlBox.getText().toString().trim();
        if (u.isEmpty()) {
            showSetup("Type Odin's address, such as https://odin.your-school.org");
            return;
        }
        if (!u.contains("://")) u = "https://" + u;
        Uri p = Uri.parse(u);
        String scheme = p.getScheme() == null ? "" : p.getScheme().toLowerCase(Locale.ROOT);
        boolean ok = "https".equals(scheme) || ("http".equals(scheme) && BuildConfig.DEBUG);
        if (!ok || p.getHost() == null || p.getHost().isEmpty()) {
            showSetup("Odin's address must start with https:// (a secure address, needed before any real student information is used).");
            return;
        }
        // Odin's address without a page at the end: DI-ana adds api/... to it
        String path = p.getEncodedPath() == null || p.getEncodedPath().isEmpty() ? "/" : p.getEncodedPath().replaceAll("[^/]*$", "");
        String base = scheme + "://" + p.getEncodedAuthority() + path;
        prefs().edit().putString(KEY_URL, base).apply();
        open(base);
    }

    /** Whether the walkthrough was seen (the page opens it by itself the first time). Nothing about students. */
    boolean toured() {
        return prefs().getBoolean(KEY_TOURED, false);
    }

    void markToured() {
        prefs().edit().putBoolean(KEY_TOURED, true).apply();
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private TextView text(String s, int sp, boolean bold, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private void add(LinearLayout col, View v, int topDp) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(topDp);
        col.addView(v, lp);
    }
}
