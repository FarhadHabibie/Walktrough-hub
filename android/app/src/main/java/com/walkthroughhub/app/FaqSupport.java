package com.walkthroughhub.app;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URLEncoder;
import java.util.HashMap;
import java.util.Map;

/**
 * Shared helpers for the GameFAQs capture feature.
 *
 * How the hidden chain works: gamefaqs.gamespot.com hard-blocks plain HTTP
 * clients that do not look like Chrome (Node fetch gets a 403 no matter what
 * headers it sends; requests without sec-ch-ua client hints get empty search
 * results or 403s on deeper pages). The Android flow therefore keeps a real
 * Chromium engine in the loop: one hidden WebView navigation establishes a
 * genuine page at the GameFAQs origin (that navigation carries the sec-ch-ua
 * hints via `headers(…)`), then CHAIN_JS — injected into that page — downloads
 * the search page, the game's FAQ list and the FAQ itself with same-origin
 * fetch() calls. Those calls go out through Chromium's own network stack, so
 * they carry real client hints, cookies and redirect handling — the closest
 * possible match to the desktop flow — and parsing runs on DOMParser documents
 * (never on the visible page DOM).
 *
 * Java polls window.__wtFaq for the result; the FAQ text is pulled back in
 * chunks so the JS bridge never has to move it in one giant string.
 *
 * The visible in-app browser (CaptureActivity) reuses faqTextJs()/parseJs()/
 * buildPayload() for its manual "Salin" flow.
 */
final class FaqSupport {

    static final String ORIGIN = "https://gamefaqs.gamespot.com";

    /**
     * The hidden chain pretends to be the same desktop Chrome as the server
     * fetcher — UA and client hints must agree with each other.
     */
    static final String DESKTOP_UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/141.0.0.0 Safari/537.36";

    /** The visible in-app browser uses a matching mobile profile. */
    static final String MOBILE_UA =
        "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/141.0.0.0 Mobile Safari/537.36";

    private static final String CHROME_BRANDS =
        "\"Chromium\";v=\"141\", \"Not?A_Brand\";v=\"24\", \"Google Chrome\";v=\"141\"";

    private FaqSupport() {}

    /**
     * Headers for loadUrl(). The sec-ch-ua* hints are the make-or-break part
     * (see class comment); Accept-Language keeps pages in English.
     */
    static Map<String, String> headers(boolean desktop) {
        Map<String, String> h = new HashMap<>();
        h.put("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
        h.put("Accept-Language", "en-US,en;q=0.9");
        h.put("sec-ch-ua", CHROME_BRANDS);
        if (desktop) {
            h.put("sec-ch-ua-mobile", "?0");
            h.put("sec-ch-ua-platform", "\"Windows\"");
        } else {
            h.put("sec-ch-ua-mobile", "?1");
            h.put("sec-ch-ua-platform", "\"Android\"");
        }
        return h;
    }

    static String encode(String s) {
        try {
            return URLEncoder.encode(s, "UTF-8");
        } catch (Exception e) {
            return s;
        }
    }

    /**
     * The whole silent chain, run inside a GameFAQs page after Java sets
     * window.__WT_QUERY. Progress/result lands on window.__wtFaq:
     *   { status: 'error', stage: 'search-empty'|'faqs-empty'|'faq-empty'|
     *     'blocked'|'challenge'|'exception', http?, where?, message? }
     *   { status: 'done', gameTitle, faqTitle, author, sourceUrl, len, text }
     * All page downloads use fetch() with credentials: same-origin requests
     * from a real Chromium document — exactly the profile that works.
     */
    private static final String CHAIN_JS =
            "(() => {\n" +
            "  if (window.__wtFaq && window.__wtFaq.status) return 'already';\n" +
            "  window.__wtFaq = null;\n" +
            "  const ORIGIN = location.origin;\n" +
            "  const Q = window.__WT_QUERY || '';\n" +
            "  const CHALLENGE = /just a moment|attention required|access denied|verify you are human|checking your browser/i;\n" +
            "  const err = (stage, extra) => {\n" +
            "    window.__wtFaq = Object.assign({ status: 'error', stage: stage }, extra || {});\n" +
            "  };\n" +
            "  const norm = (s) => String(s || '').toLowerCase();\n" +
            "  const toksOf = (q) => norm(q).split(/[^a-z0-9]+/).filter((t) => t.length >= 3);\n" +
            "  const GLUE = ['of', 'the', 'and', 'to', 'in', 'on'];\n" +
            "  const unglueWord = (w) => {\n" +
            "    if (w.length < 6) return w;\n" +
            "    for (const g of GLUE) {\n" +
            "      const i = w.lastIndexOf(g);\n" +
            "      if (i < 0) continue;\n" +
            "      const left = w.slice(0, i);\n" +
            "      const right = w.slice(i + g.length);\n" +
            "      const rightOk = g === 'of' ? right.length >= 2 : right.length >= 3;\n" +
            "      const ok = i > 0\n" +
            "        ? (left.length >= 3 && rightOk)\n" +
            "        : ((g === 'of' || g === 'the' || g === 'and') && right.length >= 4);\n" +
            "      if (ok) {\n" +
            "        return unglueWord(left) + (left ? ' ' : '') + g + ' ' + unglueWord(right);\n" +
            "      }\n" +
            "    }\n" +
            "    return w;\n" +
            "  };\n" +
            "  const correctedQuery = (q) =>\n" +
            "    q.trim().split(/\\s+/).map((w) => unglueWord(w.toLowerCase())).join(' ');\n" +
            "  const collectGames = (doc) => {\n" +
            "    const map = new Map();\n" +
            "    doc.querySelectorAll('a[href]').forEach((a) => {\n" +
            "      let href = a.getAttribute('href') || '';\n" +
            "      if (href.indexOf('http') === 0) { try { href = new URL(href).pathname; } catch (e) {} }\n" +
            "      href = href.replace(/[?#].*$/, '');\n" +
            "      if (!/^\\/[a-z0-9-]+\\/\\d+-[a-z0-9-]+$/.test(href)) return;\n" +
            "      if (/^\\/(boards|user|my|search|features|forums)\\//.test(href)) return;\n" +
            "      const rowNum = parseFloat(a.getAttribute('data-row') || '');\n" +
            "      const row = isFinite(rowNum) ? Math.floor(rowNum) : 9999;\n" +
            "      const cur = map.get(href);\n" +
            "      if (cur && cur.row <= row) return;\n" +
            "      map.set(href, { href: href, row: row, text: (a.textContent || '').trim() });\n" +
            "    });\n" +
            "    return Array.from(map.values());\n" +
            "  };\n" +
            "  const bestGame = (games, toks) => {\n" +
            "    const scored = games.map((l) => {\n" +
            "      const t = norm(l.text);\n" +
            "      const h = norm(l.href);\n" +
            "      let s = 0;\n" +
            "      for (const tok of toks) { if (t.indexOf(tok) >= 0) s += 2; else if (h.indexOf(tok) >= 0) s += 1; }\n" +
            "      const all = toks.length > 0 && toks.every((tok) => t.indexOf(tok) >= 0);\n" +
            "      return { href: l.href, row: l.row, len: l.text.length, s: s, all: all ? 1 : 0 };\n" +
            "    }).sort((a, b) => b.all - a.all || b.s - a.s || a.row - b.row || a.len - b.len);\n" +
            "    return scored.length ? scored[0] : null;\n" +
            "  };\n" +
            "  const fetchSearch = async (q) => {\n" +
            "    const r = await fetch('/search?game=' + encodeURIComponent(q), { credentials: 'include' });\n" +
            "    if (!r.ok) return { http: r.status };\n" +
            "    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');\n" +
            "    if (CHALLENGE.test(doc.title || '')) return { challenge: true };\n" +
            "    return { doc: doc };\n" +
            "  };\n" +
            "  const collectFaqs = (doc) => {\n" +
            "    const map = new Map();\n" +
            "    doc.querySelectorAll('a[href*=\"/faqs/\"]').forEach((a) => {\n" +
            "      let href = a.getAttribute('href') || '';\n" +
            "      if (href.indexOf('http') === 0) { try { href = new URL(href).pathname; } catch (e) {} }\n" +
            "      href = href.replace(/[?#].*$/, '');\n" +
            "      const m = /\\/faqs\\/(\\d+)/.exec(href);\n" +
            "      if (!m) return;\n" +
            "      let kb = 0;\n" +
            "      const box = a.closest('tr') || a.closest('li') || a.parentElement;\n" +
            "      if (box) {\n" +
            "        const nums = ((box.textContent || '').match(/\\d+(?:\\.\\d+)?K(?:B)?\\b/gi) || []);\n" +
            "        if (nums.length) kb = Math.max.apply(null, nums.map((x) => parseFloat(x)));\n" +
            "      }\n" +
            "      const cur = map.get(m[1]);\n" +
            "      const text = (a.textContent || '').trim();\n" +
            "      if (cur && cur.text.length >= text.length) return;\n" +
            "      map.set(m[1], { href: href, text: text, kb: kb });\n" +
            "    });\n" +
            "    const rank = (t) => /walkthrough/i.test(t) ? 0 : /guide/i.test(t) ? 1 : /faq/i.test(t) ? 2 : 3;\n" +
            "    return Array.from(map.values()).sort((a, b) => rank(a.text) - rank(b.text) || b.kb - a.kb);\n" +
            "  };\n" +
            "  const guideFromDoc = (doc) => {\n" +
            "    const region = doc.querySelector('#faqwrap');\n" +
            "    if (!region) return null;\n" +
            "    const toc = [];\n" +
            "    const seen = {};\n" +
            "    const tocEl = region.querySelector('.ftoc');\n" +
            "    if (tocEl) {\n" +
            "      tocEl.querySelectorAll('a[href]').forEach((a) => {\n" +
            "        const slug = a.getAttribute('href') || '';\n" +
            "        if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug) || seen[slug]) return;\n" +
            "        seen[slug] = 1;\n" +
            "        toc.push({ slug: slug, title: (a.textContent || '').replace(/\\s+/g, ' ').trim() || slug });\n" +
            "      });\n" +
            "    }\n" +
            "    const parts = [];\n" +
            "    const walk = (node) => {\n" +
            "      if (node.nodeType === 3) { parts.push(node.nodeValue || ''); return; }\n" +
            "      if (node.nodeType !== 1) return;\n" +
            "      const tag = (node.tagName || '').toLowerCase();\n" +
            "      if (tag === 'script' || tag === 'style') return;\n" +
            "      if (node.classList && node.classList.contains('ftoc')) return;\n" +
            "      const block = /^(p|h[1-6]|div|blockquote|table|tr|ol|ul|section|article|main)$/.test(tag);\n" +
            "      if (block) parts.push('\\n');\n" +
            "      if (tag === 'li') parts.push('\\n- ');\n" +
            "      if (tag === 'br') { parts.push('\\n'); return; }\n" +
            "      if (tag === 'td' || tag === 'th') parts.push(' ');\n" +
            "      for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);\n" +
            "      if (tag === 'td' || tag === 'th') parts.push(' | ');\n" +
            "      if (block || tag === 'li') parts.push('\\n');\n" +
            "    };\n" +
            "    walk(region);\n" +
            "    const text = parts.join('')\n" +
            "      .replace(/\\r\\n?/g, '\\n')\n" +
            "      .replace(/[ \\t]+\\n/g, '\\n')\n" +
            "      .replace(/[ \\t]{2,}/g, ' ')\n" +
            "      .replace(/^ *\\| ?/gm, '')\n" +
            "      .replace(/ \\| ?\\n/g, '\\n')\n" +
            "      .replace(/ *\\| *$/gm, '')\n" +
            "      .replace(/\\n{3,}/g, '\\n\\n')\n" +
            "      .trim();\n" +
            "    return { text: text, toc: toc };\n" +
            "  };\n" +
            "  const crawlGuide = async (faqPath, toc) => {\n" +
            "    const list = toc.slice(0, 200);\n" +
            "    const base = faqPath.replace(/\\/+$/, '');\n" +
            "    const deadline = Date.now() + 150000;\n" +
            "    const results = new Array(list.length).fill(null);\n" +
            "    let next = 0;\n" +
            "    const worker = async () => {\n" +
            "      for (;;) {\n" +
            "        const i = next++;\n" +
            "        if (i >= list.length || Date.now() > deadline) return;\n" +
            "        try {\n" +
            "          const r = await fetch(base + '/' + list[i].slug, { credentials: 'include' });\n" +
            "          if (!r.ok) continue;\n" +
            "          const d = new DOMParser().parseFromString(await r.text(), 'text/html');\n" +
            "          const g = guideFromDoc(d);\n" +
            "          if (g && g.text) results[i] = { title: list[i].title, text: g.text };\n" +
            "        } catch (e) {}\n" +
            "      }\n" +
            "    };\n" +
            "    const workers = [];\n" +
            "    for (let i = 0; i < 6; i++) workers.push(worker());\n" +
            "    await Promise.all(workers);\n" +
            "    const ok = results.filter(Boolean);\n" +
            "    if (!ok.length) return null;\n" +
            "    const need = Math.max(1, Math.floor(list.length * 0.7));\n" +
            "    if (ok.length < 8 && ok.length < need) return null;\n" +
            "    return ok.map((p) => {\n" +
            "      let body = p.text;\n" +
            "      const nl = body.indexOf('\\n');\n" +
            "      const first = (nl < 0 ? body : body.slice(0, nl)).trim().toLowerCase();\n" +
            "      if (first === p.title.replace(/\\s+/g, ' ').trim().toLowerCase()) {\n" +
            "        body = body.slice(nl < 0 ? body.length : nl).replace(/^\\n+/, '');\n" +
            "      }\n" +
            "      return p.title.slice(0, 80).toUpperCase() + '\\n\\n' + body;\n" +
            "    }).join('\\n\\n\\n');\n" +
            "  };\n" +
            "  (async () => {\n" +
            "    try {\n" +
            "      const toks = toksOf(Q);\n" +
            "      const res = await fetchSearch(Q);\n" +
            "      if (res.challenge) return err('challenge');\n" +
            "      if (res.http) return err('blocked', { http: res.http, where: 'search' });\n" +
            "      const games = collectGames(res.doc);\n" +
            "      if (!games.length) return err('search-empty');\n" +
            "      let pick = bestGame(games, toks);\n" +
            "      const q2 = correctedQuery(Q);\n" +
            "      if (pick && !pick.all && q2.toLowerCase() !== Q.toLowerCase()) {\n" +
            "        const res2 = await fetchSearch(q2);\n" +
            "        if (res2.doc) {\n" +
            "          const pick2 = bestGame(collectGames(res2.doc), toksOf(q2));\n" +
            "          if (pick2 && pick2.all) pick = pick2;\n" +
            "        }\n" +
            "      }\n" +
            "      if (!pick || !pick.href) return err('search-empty');\n" +
            "      const listUrl = pick.href.replace(/\\/+$/, '') + '/faqs';\n" +
            "      const rl = await fetch(listUrl, { credentials: 'include' });\n" +
            "      if (!rl.ok) return err('blocked', { http: rl.status, where: 'faqs' });\n" +
            "      const ldoc = new DOMParser().parseFromString(await rl.text(), 'text/html');\n" +
            "      const ltitle = ldoc.title || '';\n" +
            "      if (CHALLENGE.test(ltitle)) return err('challenge');\n" +
            "      const faqs = collectFaqs(ldoc);\n" +
            "      if (!faqs.length) return err('faqs-empty');\n" +
            "      const faq = faqs[0];\n" +
            "      const rf = await fetch(faq.href, { credentials: 'include' });\n" +
            "      if (!rf.ok) return err('blocked', { http: rf.status, where: 'faq' });\n" +
            "      const fdoc = new DOMParser().parseFromString(await rf.text(), 'text/html');\n" +
            "      const ftitle = fdoc.title || '';\n" +
            "      if (CHALLENGE.test(ftitle)) return err('challenge');\n" +
            "      const pres = [];\n" +
            "      fdoc.querySelectorAll('pre').forEach((p) => {\n" +
            "        const t = p.textContent || '';\n" +
            "        if (t.trim().length > 0) pres.push(t);\n" +
            "      });\n" +
            "      let text = pres.join('\\n\\n').replace(/\\r\\n?/g, '\\n').replace(/\\n{4,}/g, '\\n\\n\\n').trim();\n" +
            "      if (text.length < 400) {\n" +
            "        const guide = guideFromDoc(fdoc);\n" +
            "        if (guide && guide.text.length >= 300) {\n" +
            "          text = guide.text;\n" +
            "          if (guide.toc.length > 0 && guide.toc.length <= 200) {\n" +
            "            const full = await crawlGuide(faq.href, guide.toc);\n" +
            "            if (full) text = full;\n" +
            "          }\n" +
            "        }\n" +
            "      }\n" +
            "      if (text.length < 400) return err('faq-empty');\n" +
            "      const ft = ftitle.replace(/\\s+-\\s+GameFAQs\\s*$/i, '').trim();\n" +
            "      const segs = ft.split(/\\s+-\\s+/);\n" +
            "      let gameTitle = segs.length ? segs[0].trim() : '';\n" +
            "      let faqTitle = '';\n" +
            "      let author = '';\n" +
            "      for (let i = 0; i < segs.length; i++) {\n" +
            "        const s = segs[i].trim();\n" +
            "        if (!s) continue;\n" +
            "        if (!author && /^by\\s+/i.test(s)) { author = s.replace(/^by\\s+/i, '').trim(); continue; }\n" +
            "        if (!faqTitle && /walkthrough|guide|faq/i.test(s)) faqTitle = s;\n" +
            "      }\n" +
            "      // The FAQ list page carries the bare game name (\"… FAQs, … for PC\");\n" +
            "      // HTML-guide page titles glue it into the guide title instead.\n" +
            "      const fromList = ltitle.replace(/\\s+FAQs,.*$/i, '').trim();\n" +
            "      if (fromList && /\\bFAQs,/i.test(ltitle)) gameTitle = fromList;\n" +
            "      if (!gameTitle) {\n" +
            "        gameTitle = fromList.replace(/\\s+for\\s+.*$/i, '').trim() || pick.text || Q;\n" +
            "      }\n" +
            "      window.__wtFaq = {\n" +
            "        status: 'done',\n" +
            "        gameTitle: gameTitle,\n" +
            "        faqTitle: faqTitle || 'Walkthrough',\n" +
            "        author: author,\n" +
            "        sourceUrl: ORIGIN + faq.href,\n" +
            "        len: text.length,\n" +
            "        text: text\n" +
            "      };\n" +
            "    } catch (e) {\n" +
            "      err('exception', { message: String((e && e.message) || e).slice(0, 160) });\n" +
            "    }\n" +
            "  })();\n" +
            "  return 'started';\n" +
            "})()\n";


    /** Sets the query global and starts CHAIN_JS in the page. */
    static String kickoffJs(String query) {
        return "window.__WT_QUERY = " + JSONObject.quote(query) + ";\n" + CHAIN_JS;
    }

    /**
     * Polled every ~0.7 s. Empty while the chain runs; once it finishes it
     * returns the status object. For `done` only the small metadata is
     * stringified — the text itself is pulled in chunks (see chainChunkJs).
     */
    static String chainStatusJs() {
        return (
            "window.__wtFaq ? (" +
            "window.__wtFaq.status === 'done' ? JSON.stringify({" +
            "status: 'done', len: (window.__wtFaq.text || '').length," +
            "gameTitle: window.__wtFaq.gameTitle, faqTitle: window.__wtFaq.faqTitle," +
            "author: window.__wtFaq.author, sourceUrl: window.__wtFaq.sourceUrl})" +
            " : JSON.stringify(window.__wtFaq)) : ''"
        );
    }

    /** One chunk of the FAQ text (avoids huge single JS-bridge transfers). */
    static String chainChunkJs(int start, int end) {
        return "JSON.stringify(window.__wtFaq.text.slice(" + start + ", " + end + "))";
    }

    /** JSON-encoded string result from evaluateJavascript → plain text. */
    static String parseJsString(String raw) {
        if (raw == null) return null;
        String t = raw.trim();
        if (t.isEmpty() || t.equals("null")) return null;
        if (!t.startsWith("\"")) return null;
        try {
            return new JSONArray("[" + t + "]").getString(0);
        } catch (Exception e) {
            return null;
        }
    }

    /** Manual capture — extract the FAQ text from the currently visible page. */
    static String faqTextJs() {
        return "(() => {" +
            "const title = document.title || '';" +
            "if (/just a moment|attention required|access denied/i.test(title)) return { challenge: true };" +
            "const pres = Array.from(document.querySelectorAll('pre'))" +
            "  .map(p => p.textContent || '').filter(t => t.length > 100);" +
            "let text = pres.join('\\n\\n')" +
            "  .replace(/\\r\\n?/g, '\\n').replace(/\\n{4,}/g, '\\n\\n\\n').trim();" +
            // HTML guides have no <pre>; convert the #faqwrap body of the
            // CURRENT page (the silent chain crawls the other TOC pages).
            "if (text.length < 400) {" +
            "  const region = document.querySelector('#faqwrap');" +
            "  if (region) {" +
            "    const parts = [];" +
            "    const walk = (node) => {" +
            "      if (node.nodeType === 3) { parts.push(node.nodeValue || ''); return; }" +
            "      if (node.nodeType !== 1) return;" +
            "      const tag = (node.tagName || '').toLowerCase();" +
            "      if (tag === 'script' || tag === 'style') return;" +
            "      if (node.classList && node.classList.contains('ftoc')) return;" +
            "      const block = /^(p|h[1-6]|div|blockquote|table|tr|ol|ul|section|article|main)$/.test(tag);" +
            "      if (block) parts.push('\\n');" +
            "      if (tag === 'li') parts.push('\\n- ');" +
            "      if (tag === 'br') { parts.push('\\n'); return; }" +
            "      if (tag === 'td' || tag === 'th') parts.push(' ');" +
            "      for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);" +
            "      if (tag === 'td' || tag === 'th') parts.push(' | ');" +
            "      if (block || tag === 'li') parts.push('\\n');" +
            "    };" +
            "    walk(region);" +
            "    text = parts.join('')" +
            "      .replace(/\\r\\n?/g, '\\n')" +
            "      .replace(/[ \\t]+\\n/g, '\\n')" +
            "      .replace(/[ \\t]{2,}/g, ' ')" +
            "      .replace(/^ *\\| ?/gm, '')" +
            "      .replace(/ \\| ?\\n/g, '\\n')" +
            "      .replace(/ *\\| *$/gm, '')" +
            "      .replace(/\\n{3,}/g, '\\n\\n')" +
            "      .trim();" +
            "  }" +
            "}" +
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
