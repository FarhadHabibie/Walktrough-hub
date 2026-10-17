/**
 * Cleans MediaWiki-parsed HTML into safe, self-contained section HTML
 * and splits it into sections at heading boundaries.
 *
 * Everything rendered by the web app goes through this module first:
 * scripts/styles/navboxes/infoboxes are dropped, all attributes are
 * stripped except a tiny allowlist, and relative URLs are absolutized.
 */
import { parse, HTMLElement, NodeType, type Node } from "node-html-parser";

const DROP_SELECTORS = [
  ".mw-editsection",
  ".toc",
  "#toc",
  ".navbox",
  ".navbox-styles",
  ".va-navbox",
  ".nomobile",
  ".noprint",
  ".metadata",
  ".ambox",
  ".tmbox",
  ".ombox",
  ".cmbox",
  ".fmbox",
  ".messagebox",
  ".dablink",
  ".rellink",
  ".hatnote",
  ".infobox",
  "[class*='portable-infobox']",
  ".aside",
  ".toccolours",
  ".reference",
  ".mw-ref",
  ".references",
  ".reflist",
  ".mw-references-wrap",
  ".refbegin",
  ".printfooter",
  ".catlinks",
  ".mw-empty-elt",
  ".hidden",
  ".stub",
  ".licensetpl",
  "[role='navigation']",
  "[role='note']",
];

const DROP_TAGS = new Set([
  "script",
  "style",
  "link",
  "meta",
  "iframe",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "video",
  "audio",
  "source",
  "track",
  "object",
  "embed",
  "canvas",
  "svg",
  "map",
  "area",
  "noscript",
  "portal",
  "template",
]);

const UNWRAP_TAGS = new Set([
  "div",
  "span",
  "section",
  "article",
  "main",
  "aside",
  "header",
  "footer",
  "nav",
  "center",
  "font",
  "big",
  "time",
  "mark",
  "ruby",
  "rt",
  "rp",
  "wbr",
  "picture",
]);

const KEEP_TAGS = new Set([
  "p",
  "br",
  "hr",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "del",
  "ins",
  "small",
  "sup",
  "sub",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "a",
  "img",
  "figure",
  "figcaption",
  "blockquote",
  "code",
  "pre",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "abbr",
  "cite",
  "q",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
]);

/** Attributes we keep, per tag. Everything else is stripped. */
const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ["href"],
  img: ["src", "alt"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
};

export type CleanSection = {
  title: string;
  anchor: string;
  html: string;
  text: string;
  group: string | null;
  level: number;
  sourceUrl: string | null;
};

export type CleanOptions = {
  /** Wiki origin, e.g. https://eldenring.fandom.com */
  origin: string;
  /** Absolute URL of the source page (used to resolve relative links). */
  pageUrl: string;
  /** Group label for these sections (usually the source page title). */
  group?: string | null;
  /** Heading levels that start a new section. Default [1, 2]. */
  splitLevels?: number[];
  /** Sections whose title matches are dropped. */
  skipPattern?: RegExp | null;
  /** Title used when a page has no usable headings at all. */
  fallbackTitle?: string;
  /** Minimum intro text length to produce an "Overview" section. */
  introMinChars?: number;
};

function isElement(node: Node): node is HTMLElement {
  return node.nodeType === NodeType.ELEMENT_NODE;
}

function unwrap(el: HTMLElement): void {
  const parent = el.parentNode;
  if (!parent) {
    el.remove();
    return;
  }
  const children = [...el.childNodes];
  const idx = parent.childNodes.indexOf(el);
  if (idx === -1) {
    el.remove();
    return;
  }
  parent.childNodes.splice(idx, 1, ...children);
  for (const child of children) child.parentNode = parent;
  el.parentNode = null;
  el.childNodes = [];
}

function stripAttrs(el: HTMLElement, keep: string[]): void {
  for (const key of Object.keys(el.attributes)) {
    if (!keep.includes(key)) el.removeAttribute(key);
  }
}

function absolutize(
  raw: string | null | undefined,
  origin: string,
  pageUrl: string,
): string | null {
  if (!raw) return null;
  const url = raw.trim();
  if (!url) return null;
  if (/^(data|javascript):/i.test(url)) return null;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return origin + url;
  try {
    const abs = new URL(url, pageUrl);
    if (abs.protocol === "http:" || abs.protocol === "https:") {
      return abs.protocol === "http:" ? "https:" + abs.href.slice(5) : abs.href;
    }
    return null;
  } catch {
    return null;
  }
}

function hasJunkAncestor(el: HTMLElement, container: HTMLElement): boolean {
  let p = el.parentNode;
  while (p && p !== container) {
    if (isElement(p)) {
      const cls = p.getAttribute("class") ?? "";
      if (/(^|\s|-)(icon|sprite|flagicon|mw-headline-anchor)(\s|$|-)/i.test(cls)) {
        return true;
      }
    }
    p = p.parentNode;
  }
  return false;
}

function fixLink(el: HTMLElement, ctx: CleanContext): void {
  stripAttrs(el, ALLOWED_ATTRS.a);
  const href = absolutize(el.getAttribute("href"), ctx.origin, ctx.pageUrl);
  if (!href) {
    unwrap(el);
    return;
  }
  el.setAttribute("href", href);
  el.setAttribute("target", "_blank");
  el.setAttribute("rel", "noopener nofollow");
}

function fixImg(el: HTMLElement, ctx: CleanContext): void {
  if (hasJunkAncestor(el, ctx.container)) {
    el.remove();
    return;
  }
  const alt = el.getAttribute("alt") ?? "";
  const raw = el.getAttribute("src") ?? el.getAttribute("data-src");
  const src = absolutize(raw, ctx.origin, ctx.pageUrl);
  stripAttrs(el, ALLOWED_ATTRS.img);
  if (!src) {
    el.remove();
    return;
  }
  el.setAttribute("src", src);
  el.setAttribute("alt", alt.replace(/\s+/g, " ").trim());
  el.setAttribute("loading", "lazy");
  el.setAttribute("decoding", "async");
}

type CleanContext = {
  origin: string;
  pageUrl: string;
  container: HTMLElement;
};

function processElement(el: HTMLElement, ctx: CleanContext): void {
  const tag = el.tagName.toLowerCase();

  // children first, so ancestor decisions don't hide processed nodes
  for (const child of [...el.childNodes]) {
    if (isElement(child)) processElement(child, ctx);
    else if (child.nodeType === NodeType.COMMENT_NODE) child.remove();
  }

  if (DROP_TAGS.has(tag)) {
    el.remove();
    return;
  }
  if (tag === "img") {
    fixImg(el, ctx);
    return;
  }
  if (tag === "a") {
    fixLink(el, ctx);
    return;
  }
  if (UNWRAP_TAGS.has(tag)) {
    unwrap(el);
    return;
  }
  if (KEEP_TAGS.has(tag)) {
    stripAttrs(el, ALLOWED_ATTRS[tag] ?? []);
    return;
  }
  // unknown element: keep its contents
  unwrap(el);
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

export function cleanAndSplit(rawHtml: string, opts: CleanOptions): CleanSection[] {
  const root = parse(rawHtml);
  const container =
    root.querySelector(".mw-parser-output") ??
    root.querySelector("main") ??
    root;

  for (const sel of DROP_SELECTORS) {
    for (const node of container.querySelectorAll(sel)) node.remove();
  }

  const ctx: CleanContext = {
    origin: opts.origin,
    pageUrl: opts.pageUrl,
    container,
  };
  for (const child of [...container.childNodes]) {
    if (isElement(child)) processElement(child, ctx);
    else if (child.nodeType === NodeType.COMMENT_NODE) child.remove();
  }

  const splitLevels = opts.splitLevels ?? [1, 2];
  const skipPattern = opts.skipPattern ?? null;
  const seenAnchors = new Map<string, number>();

  type Draft = { title: string; level: number; parts: string[] };
  const drafts: Draft[] = [];
  const introParts: string[] = [];
  let current: Draft | null = null;

  const flush = () => {
    if (current && current.parts.length > 0) drafts.push(current);
    current = null;
  };

  for (const node of [...container.childNodes]) {
    if (isElement(node)) {
      const tag = node.tagName.toLowerCase();
      const heading = /^h([1-6])$/.exec(tag);
      if (heading && splitLevels.includes(Number(heading[1]))) {
        flush();
        const title = node.textContent.replace(/\s+/g, " ").trim();
        current = { title, level: Number(heading[1]), parts: [] };
        continue;
      }
      const html = node.toString();
      if (current) current.parts.push(html);
      else introParts.push(html);
    }
  }
  flush();

  const finalize = (draft: Draft): CleanSection | null => {
    const html = draft.parts.join("\n").trim();
    if (!html) return null;
    const title = draft.title.replace(/\s+/g, " ").trim() || "Untitled";
    if (skipPattern && skipPattern.test(title)) return null;
    const text = htmlToText(html);
    const hasImage = /<img\b/i.test(html);
    if (text.length < 40 && !hasImage) return null;
    if (text.length < 15 && hasImage && html.length < 200) return null;

    const base = slugify(title) || "section";
    const count = seenAnchors.get(base) ?? 0;
    seenAnchors.set(base, count + 1);
    const anchor = count === 0 ? base : `${base}-${count + 1}`;

    return { title, anchor, html, text, group: opts.group ?? null, level: draft.level, sourceUrl: opts.pageUrl };
  };

  const sections: CleanSection[] = [];

  const introHtml = introParts.join("\n").trim();
  const introText = introHtml ? htmlToText(introHtml) : "";

  for (const draft of drafts) {
    const section = finalize(draft);
    if (section) sections.push(section);
  }

  if (sections.length === 0) {
    // No usable headings: the whole page becomes one section.
    const fallback: CleanSection | null = introHtml
      ? finalize({
          title: opts.fallbackTitle ?? opts.group ?? "Walkthrough",
          level: 2,
          parts: [introHtml],
        })
      : null;
    return fallback ? [fallback] : [];
  }

  const introMin = opts.introMinChars ?? 250;
  if (introText.length >= introMin) {
    const base = "overview";
    const count = seenAnchors.get(base) ?? 0;
    seenAnchors.set(base, count + 1);
    sections.unshift({
      title: "Overview",
      anchor: count === 0 ? base : `${base}-${count + 1}`,
      html: introHtml,
      text: introText,
      group: opts.group ?? null,
      level: 2,
      sourceUrl: opts.pageUrl,
    });
  } else if (introHtml && sections.length > 0) {
    sections[0].html = `${introHtml}\n${sections[0].html}`;
    sections[0].text = htmlToText(sections[0].html);
  }

  return sections;
}
