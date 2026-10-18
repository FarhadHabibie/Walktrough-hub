package com.walkthroughhub.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.result.ActivityResult;
import androidx.appcompat.app.AppCompatActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;

/**
 * GameFAQs capture for the Android build.
 *
 * `fetchBest` runs the whole chain inside an invisible WebView: one navigation
 * opens a real GameFAQs page (with sec-ch-ua client hints via loadUrl headers),
 * then FaqSupport.CHAIN_JS downloads the search page, the FAQ list and the FAQ
 * itself with same-origin fetch() calls from that page — real Chromium
 * headers, cookies and redirects, the same profile that works on desktop.
 * Java polls window.__wtFaq, then pulls the FAQ text in chunks.
 *
 * When the chain fails — notably a Cloudflare check that needs a human — the
 * JS side falls back to `openCapture`, which shows the same browser on screen
 * so the user can pick the page and tap "Salin" themselves.
 */
@CapacitorPlugin(name = "GamefaqsCapture")
public class GamefaqsCapturePlugin extends Plugin {

    /**
     * Whole silent chain budget (search → FAQ list → FAQ → guide sections).
     * HTML guides can have 100+ section pages to crawl, so the JS side has a
     * 150 s section deadline; Java waits a bit longer.
     */
    private static final long OVERALL_TIMEOUT_MS = 240_000;

    /** How many chars of FAQ text to pull per JS-bridge round-trip. */
    private static final int CHUNK_CHARS = 240_000;

    private HiddenJob job;

    @PluginMethod
    public void available(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ok", true);
        call.resolve(result);
    }

    /** Invisible WebView chain; resolves with the FAQ payload. */
    @PluginMethod
    public void fetchBest(final PluginCall call) {
        final String query = call.getString("query", "");
        final AppCompatActivity activity = getActivity();
        if (activity == null) {
            call.reject("activity tidak tersedia");
            return;
        }
        if (query == null || query.trim().length() < 2) {
            call.reject("nama game terlalu pendek");
            return;
        }
        activity.runOnUiThread(() -> {
            if (job != null) {
                call.reject("masih ada pengambilan GameFAQs yang berjalan");
                return;
            }
            job = new HiddenJob(call, query.trim());
            job.start();
        });
    }

    /** Visible in-app browser; resolves with the captured FAQ payload. */
    @PluginMethod
    public void openCapture(final PluginCall call) {
        final String query = call.getString("query", "");
        final String reason = call.getString("reason", "");
        final AppCompatActivity activity = getActivity();
        if (activity == null) {
            call.reject("activity tidak tersedia");
            return;
        }
        activity.runOnUiThread(() -> {
            Intent intent = new Intent(getContext(), CaptureActivity.class);
            intent.putExtra(CaptureActivity.EXTRA_QUERY, query == null ? "" : query);
            intent.putExtra(CaptureActivity.EXTRA_REASON, reason == null ? "" : reason);
            startActivityForResult(call, intent, "captureResult");
        });
    }

    @ActivityCallback
    private void captureResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (
            result == null ||
            result.getResultCode() != Activity.RESULT_OK ||
            result.getData() == null
        ) {
            call.reject("dibatalkan");
            return;
        }
        String path = result.getData().getStringExtra(CaptureActivity.EXTRA_PAYLOAD_PATH);
        if (path == null) {
            call.reject("hasil capture kosong");
            return;
        }
        File file = new File(path);
        try {
            String json = new String(readFully(file), "UTF-8");
            //noinspection ResultOfMethodCallIgnored
            file.delete();
            call.resolve(new JSObject(json));
        } catch (Exception e) {
            call.reject("gagal membaca hasil capture");
        }
    }

    private static byte[] readFully(File file) throws Exception {
        try (FileInputStream in = new FileInputStream(file)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    /* ------------------------------------------------------------------ */

    private class HiddenJob {

        private final PluginCall call;
        private final String query;
        private final Handler handler = new Handler(Looper.getMainLooper());

        private WebView web;
        private boolean finished = false;
        private boolean kicked = false;
        private int readyTries = 0;
        private int challengeTries = 0;
        private long deadline = 0;
        private int totalLen = 0;
        private int chunkAt = 0;
        private final StringBuilder text = new StringBuilder();
        private JSObject payload;

        HiddenJob(PluginCall call, String query) {
            this.call = call;
            this.query = query;
        }

        void start() {
            AppCompatActivity activity = getActivity();
            if (activity == null) {
                fail("activity tidak tersedia");
                return;
            }
            deadline = System.currentTimeMillis() + OVERALL_TIMEOUT_MS;
            web = new WebView(activity);
            WebSettings settings = web.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setBlockNetworkImage(true);
            // Desktop UA + matching client hints on the single navigation that
            // establishes the origin. The data requests themselves are then
            // made by Chromium's fetch() from inside the page.
            settings.setUserAgentString(FaqSupport.DESKTOP_UA);
            web.setWebViewClient(
                new WebViewClient() {
                    @Override
                    public void onReceivedError(
                        WebView view,
                        WebResourceRequest request,
                        WebResourceError error
                    ) {
                        if (request != null && request.isForMainFrame()) {
                            HiddenJob.this.fail("gagal memuat halaman GameFAQs");
                        }
                    }
                }
            );
            // A 1×1 view off in a corner: full network + JS, nothing visible.
            activity.addContentView(web, new ViewGroup.LayoutParams(1, 1));
            loadBase();
        }

        /** One navigation to a plain GameFAQs page; everything else is fetch(). */
        private void loadBase() {
            readyTries = 0;
            kicked = false;
            web.loadUrl(FaqSupport.ORIGIN + "/", FaqSupport.headers(true));
            handler.postDelayed(this::readyCheck, 600);
        }

        /**
         * The origin page is ready when location.host is gamefaqs AND the
         * document is fresh (no __wtFaq yet — after a challenge reload the
         * old document's state must not leak into the new attempt).
         */
        private void readyCheck() {
            if (finished) return;
            if (pastDeadline()) {
                fail("waktu habis — GameFAQs tidak merespons");
                return;
            }
            web.evaluateJavascript(
                "location.host + '|' + (window.__wtFaq ? '1' : '0')",
                value -> {
                    if (finished) return;
                    String state = value == null ? "" : value.replace("\"", "").trim();
                    if ("gamefaqs.gamespot.com|0".equals(state)) {
                        kick();
                        return;
                    }
                    if (readyTries < 60) {
                        readyTries += 1;
                        handler.postDelayed(this::readyCheck, 500);
                    } else {
                        fail("gagal memuat GameFAQs");
                    }
                }
            );
        }

        private void kick() {
            if (finished || kicked) return;
            kicked = true;
            web.evaluateJavascript(
                FaqSupport.kickoffJs(query),
                ignored -> {
                    if (finished) return;
                    handler.postDelayed(this::pollStatus, 600);
                }
            );
        }

        private void pollStatus() {
            if (finished) return;
            if (pastDeadline()) {
                fail("waktu habis — GameFAQs tidak merespons");
                return;
            }
            web.evaluateJavascript(
                FaqSupport.chainStatusJs(),
                value -> {
                    if (finished) return;
                    String raw = value == null ? "" : value.trim();
                    if (raw.isEmpty() || raw.equals("null") || raw.equals("\"\"")) {
                        handler.postDelayed(this::pollStatus, 700);
                        return;
                    }
                    JSONObject obj = FaqSupport.parseJs(raw);
                    String status = obj.optString("status", "");
                    if ("done".equals(status)) {
                        beginChunks(obj);
                        return;
                    }
                    if ("challenge".equals(status)) {
                        // Cloudflare interstitials often solve themselves — give
                        // the origin page another chance before giving up.
                        if (challengeTries < 2 && !pastDeadline()) {
                            challengeTries += 1;
                            handler.postDelayed(this::loadBase, 2_000);
                        } else {
                            fail("GameFAQs meminta verifikasi keamanan (Cloudflare)");
                        }
                        return;
                    }
                    fail(messageFor(obj));
                }
            );
        }

        private void beginChunks(JSONObject meta) {
            totalLen = meta.optInt("len", 0);
            payload = new JSObject();
            payload.put("gameTitle", meta.optString("gameTitle", query));
            payload.put("faqTitle", meta.optString("faqTitle", "Walkthrough"));
            String author = meta.optString("author", "");
            if (!author.isEmpty()) payload.put("author", author);
            payload.put("sourceUrl", meta.optString("sourceUrl", ""));
            text.setLength(0);
            chunkAt = 0;
            nextChunk();
        }

        private void nextChunk() {
            if (finished) return;
            if (chunkAt >= totalLen) {
                String full = text.toString();
                if (full.length() < 500) {
                    fail("FAQ kosong atau gagal diambil");
                    return;
                }
                payload.put("text", full);
                succeed(payload);
                return;
            }
            int start = chunkAt;
            int end = Math.min(totalLen, start + CHUNK_CHARS);
            web.evaluateJavascript(
                FaqSupport.chainChunkJs(start, end),
                value -> {
                    if (finished) return;
                    String piece = FaqSupport.parseJsString(value);
                    if (piece == null) {
                        fail("gagal mengambil teks FAQ");
                        return;
                    }
                    text.append(piece);
                    chunkAt = end;
                    handler.postDelayed(this::nextChunk, 0);
                }
            );
        }

        private String messageFor(JSONObject obj) {
            String stage = obj.optString("stage", "");
            if ("search-empty".equals(stage)) {
                return "game tidak ditemukan di GameFAQs";
            }
            if ("faqs-empty".equals(stage)) {
                return "game ini tidak punya FAQ di GameFAQs";
            }
            if ("faq-empty".equals(stage)) {
                return "FAQ kosong atau gagal diambil";
            }
            if ("blocked".equals(stage)) {
                int http = obj.optInt("http", 0);
                return http > 0
                    ? "GameFAQs memblokir permintaan (HTTP " + http + ")"
                    : "GameFAQs memblokir permintaan";
            }
            if ("exception".equals(stage)) {
                String m = obj.optString("message", "");
                return m.isEmpty()
                    ? "gagal mengambil dari GameFAQs"
                    : "gagal mengambil dari GameFAQs (" + m + ")";
            }
            return "gagal mengambil dari GameFAQs";
        }

        private boolean pastDeadline() {
            return System.currentTimeMillis() > deadline;
        }

        private void succeed(JSObject result) {
            if (finished) return;
            finished = true;
            cleanup();
            call.resolve(result);
            job = null;
        }

        private void fail(String message) {
            if (finished) return;
            finished = true;
            cleanup();
            call.reject(message);
            job = null;
        }

        private void cleanup() {
            handler.removeCallbacksAndMessages(null);
            if (web != null) {
                try {
                    if (web.getParent() instanceof ViewGroup) {
                        ((ViewGroup) web.getParent()).removeView(web);
                    }
                    web.stopLoading();
                    web.destroy();
                } catch (Exception ignored) {
                    // best effort
                }
                web = null;
            }
        }
    }
}
