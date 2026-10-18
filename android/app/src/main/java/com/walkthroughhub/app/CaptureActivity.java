package com.walkthroughhub.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * A tiny in-app browser for GameFAQs. The user opens it (automatically when
 * the invisible fetch fails, or on demand), navigates to the walkthrough they
 * want — solving any Cloudflare check along the way — and taps "SALIN".
 * The extracted text goes back to the web layer as a JSON file reference
 * (FAQ texts can be megabytes; Intents cap extras at ~1 MB).
 */
public class CaptureActivity extends AppCompatActivity {

    static final String EXTRA_QUERY = "query";
    static final String EXTRA_PAYLOAD_PATH = "payloadPath";

    private static final int BG = 0xFF16161A;
    private static final int BAR_BG = 0xFF1E1E24;
    private static final int INK = 0xFFF2EEE8;
    private static final int MUTED = 0xFF9A938A;
    private static final int ACCENT = 0xFFE8A33D;

    private WebView web;
    private ProgressBar bar;
    private TextView titleView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(6), dp(6), dp(6), dp(6));
        top.setBackgroundColor(BAR_BG);

        TextView back = new TextView(this);
        back.setText("‹");
        back.setTextSize(26);
        back.setTextColor(INK);
        back.setPadding(dp(14), 0, dp(14), dp(2));
        back.setOnClickListener(v -> goBackOrFinish());
        top.addView(back);

        titleView = new TextView(this);
        titleView.setTextColor(MUTED);
        titleView.setTextSize(12);
        titleView.setSingleLine(true);
        titleView.setEllipsize(TextUtils.TruncateAt.END);
        titleView.setText("Memuat GameFAQs…");
        titleView.setLayoutParams(
            new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        );
        top.addView(titleView);

        TextView reload = new TextView(this);
        reload.setText("⟳");
        reload.setTextSize(20);
        reload.setTextColor(INK);
        reload.setPadding(dp(14), 0, dp(14), 0);
        reload.setOnClickListener(v -> {
            if (web != null) web.reload();
        });
        top.addView(reload);

        TextView capture = new TextView(this);
        capture.setText("SALIN");
        capture.setTextSize(13);
        capture.setTypeface(Typeface.DEFAULT_BOLD);
        capture.setTextColor(0xFF1A1A1F);
        capture.setBackgroundColor(ACCENT);
        capture.setPadding(dp(16), dp(9), dp(16), dp(9));
        capture.setOnClickListener(v -> capture());
        top.addView(capture);

        root.addView(top);

        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        bar.setVisibility(View.GONE);
        root.addView(
            bar,
            new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3))
        );

        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setUserAgentString(FaqSupport.MOBILE_UA);
        web.setWebViewClient(
            new WebViewClient() {
                @Override
                public void onPageStarted(WebView view, String url, Bitmap favicon) {
                    bar.setVisibility(View.VISIBLE);
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    bar.setVisibility(View.GONE);
                    String t = view.getTitle();
                    titleView.setText(t == null || t.isEmpty() ? url : t);
                }
            }
        );
        web.setWebChromeClient(
            new WebChromeClient() {
                @Override
                public void onProgressChanged(WebView view, int newProgress) {
                    bar.setProgress(newProgress);
                }

                @Override
                public void onReceivedTitle(WebView view, String title) {
                    if (title != null && !title.isEmpty()) titleView.setText(title);
                }
            }
        );
        root.addView(
            web,
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
        );

        setContentView(root);

        String query = getIntent().getStringExtra(EXTRA_QUERY);
        String url = FaqSupport.ORIGIN;
        if (query != null && query.trim().length() >= 2) {
            url = FaqSupport.ORIGIN + "/search?game=" + FaqSupport.encode(query.trim());
        }
        web.loadUrl(url);
    }

    /** Extract the FAQ text from the current page and hand it back. */
    private void capture() {
        if (web == null) return;
        web.evaluateJavascript(
            FaqSupport.faqTextJs(),
            value -> {
                JSONObject obj = FaqSupport.parseJs(value);
                if (obj.optBoolean("challenge", false)) {
                    toast(
                        "Halaman ini sedang diperiksa keamanan — selesaikan dulu, lalu coba SALIN lagi."
                    );
                    return;
                }
                String text = obj.optString("text", "");
                if (text.length() < 500) {
                    toast(
                        "Halaman ini tidak berisi teks walkthrough. Buka halaman FAQ-nya dulu, lalu tap SALIN."
                    );
                    return;
                }
                JSObject payload = FaqSupport.buildPayload(
                    obj.optString("title", ""),
                    obj.optString("url", ""),
                    text,
                    ""
                );
                try {
                    File file = new File(
                        getCacheDir(),
                        "gf-capture-" + System.currentTimeMillis() + ".json"
                    );
                    try (FileOutputStream out = new FileOutputStream(file)) {
                        out.write(payload.toString().getBytes(StandardCharsets.UTF_8));
                    }
                    Intent result = new Intent();
                    result.putExtra(EXTRA_PAYLOAD_PATH, file.getAbsolutePath());
                    setResult(Activity.RESULT_OK, result);
                    finish();
                } catch (Exception e) {
                    toast("Gagal menyiapkan hasil: " + e.getMessage());
                }
            }
        );
    }

    private void goBackOrFinish() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            finish();
        }
    }

    @Override
    public void onBackPressed() {
        goBackOrFinish();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }

    private int dp(int value) {
        return Math.round(getResources().getDisplayMetrics().density * value);
    }
}
