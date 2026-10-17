/**
 * Tiny hash router for the standalone app.
 *
 * The app ships as a static bundle (and inside the Android APK), so URLs
 * never reach a server: `#/` is the catalog, `#/games/<slug>` a walkthrough.
 * In-page section jumps deliberately do NOT use `location.hash` (that would
 * collide with routes) — they scroll directly.
 */
import { useSyncExternalStore } from "react";

export type Route =
  | { view: "home" }
  | { view: "game"; slug: string; titleHint?: string };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, "");
  if (path.startsWith("games/")) {
    const rest = path.slice("games/".length);
    const [rawSlug, query] = rest.split("?");
    let slug = rawSlug ?? "";
    try {
      slug = decodeURIComponent(slug);
    } catch {
      // keep raw when it isn't valid percent-encoding
    }
    slug = slug.replace(/\/+$/, "");
    if (!slug) return { view: "home" };
    let titleHint: string | undefined;
    if (query) {
      const t = new URLSearchParams(query).get("title")?.trim();
      if (t && t.length >= 2) titleHint = t;
    }
    return { view: "game", slug, titleHint };
  }
  return { view: "home" };
}

export function currentRoute(): Route {
  if (typeof window === "undefined") return { view: "home" };
  return parseHash(window.location.hash);
}

export function navigate(to: string): void {
  const next = to.startsWith("#") ? to : `#${to.startsWith("/") ? "" : "/"}${to}`;
  if (window.location.hash === next) return;
  window.location.hash = next;
}

function subscribe(cb: () => void): () => void {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

function getSnapshot(): string {
  return window.location.hash;
}

function getServerSnapshot(): string {
  return "";
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return parseHash(hash);
}
