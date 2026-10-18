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
 * `fetchBest` runs the whole chain (search → game → FAQ list → best FAQ)
 * inside an invisible WebView and hands back the FAQ text. When any step
 * fails — notably a Cloudflare check that needs a human — the JS side falls
 * back to `openCapture`, which shows the same browser on screen so the user
 * can pick the page and tap "Salin" themselves.
 */
@CapacitorPlugin(name = "GamefaqsCapture")
public class GamefaqsCapturePlugin extends Plugin {

    private static final long STEP_TIMEOUT_MS = 25_000;

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
        final AppCompatActivity activity = getActivity();
        if (activity == null) {
            call.reject("activity tidak tersedia");
            return;
        }
        activity.runOnUiThread(() -> {
            Intent intent = new Intent(getContext(), CaptureActivity.class);
            intent.putExtra(CaptureActivity.EXTRA_QUERY, query == null ? "" : query);
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
        private final Runnable timeout = () ->
            fail("waktu habis — GameFAQs tidak merespons");

        private WebView web;
        private int step = 0;
        private boolean awaiting = false;
        private boolean finished = false;
        private String gameTitle = "";

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
            web = new WebView(activity);
            WebSettings settings = web.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setBlockNetworkImage(true);
            settings.setUserAgentString(FaqSupport.MOBILE_UA);
            web.setWebViewClient(
                new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        HiddenJob.this.onPageFinished();
                    }

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
            load(FaqSupport.ORIGIN + "/search?game=" + FaqSupport.encode(query));
        }

        private void load(String url) {
            awaiting = true;
            handler.removeCallbacks(timeout);
            handler.postDelayed(timeout, STEP_TIMEOUT_MS);
            web.loadUrl(url);
        }

        private void onPageFinished() {
            if (finished || !awaiting) return;
            awaiting = false;
            extract();
        }

        private void extract() {
            String js;
            if (step == 0) {
                js = FaqSupport.searchJs(query);
            } else if (step == 1) {
                js = FaqSupport.faqListJs();
            } else {
                js = FaqSupport.faqTextJs();
            }
            web.evaluateJavascript(
                js,
                value -> {
                    if (finished) return;
                    handler.removeCallbacks(timeout);
                    JSONObject obj = FaqSupport.parseJs(value);
                    if (obj.optBoolean("challenge", false)) {
                        fail("GameFAQs meminta verifikasi keamanan (Cloudflare)");
                        return;
                    }
                    String best = obj.optString("best", "");
                    if (best.isEmpty()) {
                        fail(
                            step == 0
                                ? "game tidak ditemukan di GameFAQs"
                                : "game ini tidak punya FAQ di GameFAQs"
                        );
                        return;
                    }
                    if (step == 0) {
                        step = 1;
                        load(FaqSupport.ORIGIN + best + "/faqs");
                    } else if (step == 1) {
                        gameTitle = FaqSupport.cleanListTitle(
                            obj.optString("gameTitle", "")
                        );
                        step = 2;
                        load(best.startsWith("http") ? best : FaqSupport.ORIGIN + best);
                    } else {
                        String text = obj.optString("text", "");
                        if (text.length() < 500) {
                            fail("FAQ kosong atau gagal diambil");
                            return;
                        }
                        succeed(
                            FaqSupport.buildPayload(
                                obj.optString("title", ""),
                                obj.optString("url", ""),
                                text,
                                gameTitle
                            )
                        );
                    }
                }
            );
        }

        private void succeed(JSObject payload) {
            if (finished) return;
            finished = true;
            cleanup();
            call.resolve(payload);
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
