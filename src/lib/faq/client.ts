/**
 * Where FAQ text comes from, depending on where the app runs:
 *
 *   - Desktop web: the app is served by `scripts/serve.ts`, whose
 *     `/api/gamefaqs/*` endpoints fetch gamefaqs.gamespot.com on the same
 *     machine (no CORS problem, no manual copy).
 *   - Android APK: no server exists, so a small native plugin
 *     ("GamefaqsCapture") does the fetching inside a WebView — invisibly
 *     when it can, in a visible in-app browser when a page needs a human.
 *
 * `faqSource()` probes once and tells the UI whether to offer the option.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

export type FaqPayload = {
  gameTitle: string;
  faqTitle: string;
  author: string | null;
  sourceUrl: string;
  text: string;
};

type NativeCapture = {
  available(): Promise<{ ok: boolean }>;
  fetchBest(options: { query: string }): Promise<FaqPayload>;
  openCapture(options: { query: string }): Promise<FaqPayload>;
};

const Native = registerPlugin<NativeCapture>("GamefaqsCapture");

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

let sourceProbe: Promise<"native" | "server" | null> | null = null;

export function faqSource(): Promise<"native" | "server" | null> {
  sourceProbe ??= probe();
  return sourceProbe;
}

async function probe(): Promise<"native" | "server" | null> {
  if (isNative()) {
    try {
      const res = await Native.available();
      if (res.ok) return "native";
    } catch {
      // plugin missing — fall through to the local-server probe
    }
  }
  try {
    const res = await fetch("/api/gamefaqs/ping", { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as { ok?: boolean };
      if (json.ok) return "server";
    }
  } catch {
    // opened without the local server (plain static host)
  }
  return null;
}

/** Best FAQ for `query` — automatically (invisible fetch / local server). */
export async function fetchFaqBest(query: string): Promise<FaqPayload> {
  if (isNative()) {
    return await Native.fetchBest({ query });
  }
  const res = await fetch(`/api/gamefaqs/fetch?q=${encodeURIComponent(query)}`);
  const json = (await res.json().catch(() => null)) as
    | FaqPayload
    | { error?: string }
    | null;
  if (!res.ok) {
    throw new Error(
      (json && "error" in json && json.error) || `HTTP ${res.status}`,
    );
  }
  return json as FaqPayload;
}

/** Android only: open the in-app GameFAQs browser for manual capture. */
export async function fetchFaqCapture(query: string): Promise<FaqPayload> {
  if (!isNative()) throw new Error("capture hanya tersedia di aplikasi Android");
  return await Native.openCapture({ query });
}
