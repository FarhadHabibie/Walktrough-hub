/**
 * Plain-text GameFAQs walkthrough → sections.
 *
 * FAQ bodies are one long ASCII document (hard-wrapped ~78 columns). The
 * splitter keeps the text intact (rendered later in a <pre class="faq-text">)
 * and only hunts for heading lines:
 *   - boxed titles (separator line above AND below),
 *   - "Chapter 3"/"Part II"/"Appendix" style lines,
 *   - ALL-CAPS headings standing on their own (with guards against ASCII art:
 *     repeated characters and vowel-less words).
 * Very large sections are chunked so no single <pre> gets megabytes long.
 */
import { slugify } from "@/lib/slug";
import type { NewSection } from "@/lib/types";

export type FaqSection = { title: string; body: string };

const SEPARATOR = /^\s*[=\-_~#*+.]{4,}\s*$/;
const MAX_SECTION_CHARS = 120_000;
const CHUNK_CHARS = 60_000;

function isCapsHeading(line: string): boolean {
  if (/[a-z]/.test(line)) return false;
  const words = line.split(/\s+/).filter((w) => /[A-Z]/.test(w));
  if (words.length === 0) return false;
  let letters = 0;
  for (const w of words) {
    const clean = w.replace(/[^A-Z]/g, "");
    letters += clean.length;
    // "PPPPP" runs and vowel-less words are almost always ASCII art.
    if (/(.)\1\1\1/.test(w)) return false;
    if (clean.length >= 3 && !/[AEIOUY]/.test(clean)) return false;
  }
  return letters >= 4;
}

function isHeader(lines: string[], i: number): boolean {
  const raw = lines[i] ?? "";
  const line = raw.trim();
  if (line.length < 2 || line.length > 88) return false;
  if (SEPARATOR.test(raw)) return false;

  const prev = lines[i - 1] ?? "";
  const next = lines[i + 1] ?? "";
  const boxed = SEPARATOR.test(prev) && SEPARATOR.test(next);
  if (boxed) return /[A-Za-z0-9]/.test(line);

  // Table-of-contents lines ("Chapter 1: ... ...... 5") are not headings.
  if (/\.{4,}\s*\d*\s*$/.test(line)) return false;

  if (
    /^(chapter|part|section|act|appendix|introduction|prologue|epilogue|table of contents)\b/i.test(
      line,
    ) &&
    line.length <= 60
  ) {
    return true;
  }

  if (line.length <= 60 && isCapsHeading(line)) {
    return (
      /^\s*$/.test(prev) ||
      /^\s*$/.test(next) ||
      SEPARATOR.test(prev) ||
      SEPARATOR.test(next)
    );
  }
  return false;
}

function chunkSections(sections: FaqSection[]): FaqSection[] {
  const out: FaqSection[] = [];
  for (const s of sections) {
    if (s.body.length <= MAX_SECTION_CHARS) {
      out.push(s);
      continue;
    }
    const base = s.title || "Walkthrough";
    let buf: string[] = [];
    let size = 0;
    let part = 0;
    const flush = () => {
      if (buf.length === 0) return;
      part += 1;
      out.push({
        title: `${base} (bagian ${part})`,
        body: buf.join("\n").trim(),
      });
      buf = [];
      size = 0;
    };
    for (const line of s.body.split("\n")) {
      buf.push(line);
      size += line.length + 1;
      if (size >= CHUNK_CHARS) flush();
    }
    flush();
  }
  return out;
}

export function splitFaqText(text: string): FaqSection[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  const body = (from: number, to: number): string => {
    const arr = lines.slice(from, to);
    while (arr.length > 0 && SEPARATOR.test(arr[arr.length - 1] ?? "")) arr.pop();
    while (arr.length > 0 && SEPARATOR.test(arr[0] ?? "")) arr.shift();
    return arr.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
  };

  // Collect heading lines. Boxed titles often span 2–3 lines (main title +
  // subtitle between separators) — keep the first as the heading, leave the
  // rest to the body.
  const headers: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isHeader(lines, i)) continue;
    const prev = headers[headers.length - 1];
    if (prev !== undefined && i - prev <= 3) continue;
    headers.push(i);
  }

  const draft: FaqSection[] = [];
  if (headers.length === 0) {
    const whole = body(0, lines.length);
    return whole ? chunkSections([{ title: "", body: whole }]) : [];
  }

  const preamble = body(0, headers[0]);
  if (preamble.length >= 300) draft.push({ title: "Pembuka", body: preamble });

  for (let h = 0; h < headers.length; h++) {
    const start = headers[h];
    const end = headers[h + 1] ?? lines.length;
    draft.push({
      title: (lines[start] ?? "").trim().slice(0, 80),
      body: body(start + 1, end),
    });
  }

  // Stubs (mis-detected headings with almost no body) merge into their
  // predecessor instead of becoming useless one-line sections.
  const merged: FaqSection[] = [];
  for (const s of draft) {
    if (s.body.length < 40 && merged.length > 0) {
      const prev = merged[merged.length - 1];
      prev.body = `${prev.body}\n\n${s.title}\n${s.body}`.trim();
    } else {
      merged.push({ ...s });
    }
  }

  return chunkSections(merged.filter((s) => s.body.length > 0));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** FAQ sections → rows for `replaceSections` (one <pre> block each). */
export function faqSectionsToRows(
  sections: FaqSection[],
  sourceUrl: string,
): NewSection[] {
  const used = new Map<string, number>();
  return sections.map((s, index) => {
    const base = slugify(s.title) || `bagian-${index + 1}`;
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    const title = s.title || `Bagian ${index + 1}`;
    return {
      group: null,
      level: 2,
      title,
      anchor: count === 0 ? base : `${base}-${count + 1}`,
      html: `<pre class="faq-text">${escapeHtml(s.body)}</pre>`,
      text: s.body,
      sourceUrl,
    };
  });
}
