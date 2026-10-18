package com.walkthroughhub.app;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URLEncoder;

/**
 * Shared helpers for the GameFAQs capture feature: URL encoding, the JS
 * snippets that run inside the WebView, and the JS-result → JSON plumbing.
 */
final class FaqSupport {

    static final String ORIGIN = "https://gamefaqs.gamespot.com";

    /**
     * A normal mobile Chrome UA — WebView's default ("…; wv)") tends to get
     * challenged by Cloudflare, and this is the user's own browser on their
     * own network, so it should be indistinguishable from visiting the site.
     */
    static final String MOBILE_UA =
        "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/141.0.0.0 Mobile Safari/537.36";

    private FaqSupport() {}

    static String encode(String s) {
        try {
            return URLEncoder.encode(s, "UTF-8");
        } catch (Exception e) {
            return s;
        }
    }

    /** Step 1 — the search page: pick the best-matching game link. */
    static String searchJs(String query) {
        String q = JSONObject.quote(query);
        return "(() => {" +
            "const title = document.title || '';" +
            "if (/just a moment|attention required/i.test(title)) return { challenge: true };" +
            "const tokens = " + q + ".toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 3);" +
            "const map = new Map();" +
            "document.querySelectorAll('a[href]').forEach(a => {" +
            "  const href = a.getAttribute('href') || '';" +
            "  if (!/^\\/[a-z0-9-]+\\/\\d+-[a-z0-9-]+$/.test(href)) return;" +
            "  if (/^\\/(boards|user|my|search|features|forums)\\//.test(href)) return;" +
            "  const rowAttr = a.getAttribute('data-row') || '';" +
            "  const row = /^\\d+$/.test(rowAttr) ? parseInt(rowAttr, 10) : 9999;" +
            "  const cur = map.get(href);" +
            "  if (cur && cur.row <= row) return;" +
            "  map.set(href, { href: href, row: row, text: (a.textContent || '').trim() });" +
            "});" +
            "const scored = Array.from(map.values()).map(l => {" +
            "  const t = l.text.toLowerCase(); const h = l.href.toLowerCase();" +
            "  let s = 0; for (const tok of tokens) { if (t.includes(tok)) s += 2; else if (h.includes(tok)) s += 1; }" +
            "  const all = tokens.length > 0 && tokens.every(tok => t.includes(tok)) ? 1 : 0;" +
            "  return { href: l.href, row: l.row, len: l.text.length, s: s, all: all };" +
            "}).sort((a, b) => b.all - a.all || b.s - a.s || a.row - b.row || a.len - b.len);" +
            "return { challenge: false, best: scored.length ? scored[0].href : null };" +
            "})()";
    }

    /** Step 2 — the game's FAQ list: pick the best walkthrough entry. */
    static String faqListJs() {
        return "(() => {" +
            "const title = document.title || '';" +
            "if (/just a moment|attention required/i.test(title)) return { challenge: true };" +
            "const map = new Map();" +
            "document.querySelectorAll('a[href*=\"/faqs/\"]').forEach(a => {" +
            "  const href = a.getAttribute('href') || '';" +
            "  const m = /\\/faqs\\/(\\d+)/.exec(href);" +
            "  if (!m) return;" +
            "  let kb = 0;" +
            "  const tr = a.closest('tr');" +
            "  if (tr) { const mm = /(\\d+(?:\\.\\d+)?)K\\b/.exec(tr.textContent || ''); if (mm) kb = parseFloat(mm[1]); }" +
            "  const cur = map.get(m[1]);" +
            "  const text = (a.textContent || '').trim();" +
            "  if (cur && cur.text.length >= text.length) return;" +
            "  map.set(m[1], { href: href, text: text, kb: kb });" +
            "});" +
            "const rank = t => /walkthrough/i.test(t) ? 0 : /guide/i.test(t) ? 1 : /faq/i.test(t) ? 2 : 3;" +
            "const list = Array.from(map.values()).sort((a, b) => rank(a.text) - rank(b.text) || b.kb - a.kb);" +
            "return { challenge: false, gameTitle: title, best: list.length ? list[0].href : null };" +
            "})()";
    }

    /** Step 3 / manual capture — extract the FAQ text from the page. */
    static String faqTextJs() {
        return "(() => {" +
            "const title = document.title || '';" +
            "if (/just a moment|attention required/i.test(title)) return { challenge: true };" +
            "const pres = Array.from(document.querySelectorAll('pre'))" +
            "  .map(p => p.textContent || '').filter(t => t.length > 100);" +
            "const text = pres.join('\\n\\n')" +
            "  .replace(/\\r\\n?/g, '\\n').replace(/\\n{4,}/g, '\\n\\n\\n').trim();" +
            "return { challenge: false, title: title, url: location.href, text: text };" +
            "})()";
    }

    /**
     * evaluateJavascript hands back the JS value as JSON text. Objects arrive
     * as `{...}`; be liberal and accept a JSON-encoded string too.
     */
    static JSONObject parseJs(String raw) {
        if (raw == null) return new JSONObject();
        String t = raw.trim();
        try {
            if (t.startsWith("\"")) {
                t = new JSONArray("[" + t + "]").getString(0).trim();
            }
            if (!t.startsWith("{")) return new JSONObject();
            return new JSONObject(t);
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    /** "Pokemon Ruby Version FAQs, Walkthroughs, … - GameFAQs" → game title. */
    static String cleanListTitle(String title) {
        if (title == null) return "";
        return title
            .replaceFirst("(?i)\\s+FAQs,.*$", "")
            .replaceFirst("\\s+-\\s+GameFAQs\\s*$", "")
            .replaceFirst("(?i)\\s+FAQs\\s*$", "")
            .replaceFirst("(?i)\\s+for\\s+.*$", "")
            .trim();
    }

    /**
     * FAQ page title → payload fields, e.g.
     *   "Pokemon Ruby Version - Guide and Walkthrough - Game Boy Advance
     *    - By howellgames - GameFAQs"
     */
    static JSObject buildPayload(
        String pageTitle,
        String url,
        String text,
        String fallbackTitle
    ) {
        String cleaned = pageTitle == null
            ? ""
            : pageTitle.replaceFirst("\\s+-\\s+GameFAQs\\s*$", "").trim();
        String[] segments = cleaned.split("\\s+-\\s+");
        String gameTitle = "";
        String faqTitle = null;
        String author = null;
        for (int i = 0; i < segments.length; i++) {
            String s = segments[i].trim();
            if (s.isEmpty()) continue;
            if (gameTitle.isEmpty()) {
                gameTitle = s;
                continue;
            }
            String lower = s.toLowerCase();
            if (author == null && lower.startsWith("by ")) {
                author = s.substring(3).trim();
                continue;
            }
            if (
                faqTitle == null &&
                (lower.contains("walkthrough") ||
                    lower.contains("guide") ||
                    lower.contains("faq"))
            ) {
                faqTitle = s;
            }
        }
        gameTitle = gameTitle
            .replaceFirst("(?i)\\s+FAQs,.*$", "")
            .replaceFirst("(?i)\\s+FAQs\\s*$", "")
            .trim();
        if (gameTitle.isEmpty() && fallbackTitle != null) {
            gameTitle = fallbackTitle.trim();
        }

        JSObject payload = new JSObject();
        payload.put("gameTitle", gameTitle);
        payload.put("faqTitle", faqTitle == null ? "Walkthrough" : faqTitle);
        if (author != null) payload.put("author", author);
        payload.put("sourceUrl", url == null ? "" : url);
        payload.put("text", text);
        return payload;
    }
}
