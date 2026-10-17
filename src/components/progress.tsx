"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { SectionMeta } from "@/lib/types";

type Completed = Record<string, true>;

const EMPTY: Completed = Object.freeze({}) as Completed;

type Store = {
  snapshot: Completed;
  loaded: boolean;
  listeners: Set<() => void>;
};

const stores = new Map<string, Store>();

function getStore(key: string): Store {
  let store = stores.get(key);
  if (!store) {
    store = { snapshot: EMPTY, loaded: false, listeners: new Set() };
    stores.set(key, store);
  }
  return store;
}

function readStorage(key: string): Completed {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Completed) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function getSnapshot(key: string): Completed {
  const store = getStore(key);
  if (!store.loaded) {
    store.snapshot = readStorage(key);
    store.loaded = true;
  }
  return store.snapshot;
}

function getServerSnapshot(): Completed {
  return EMPTY;
}

function subscribeTo(key: string): (cb: () => void) => () => void {
  return (cb: () => void) => {
    const store = getStore(key);
    store.listeners.add(cb);
    return () => store.listeners.delete(cb);
  };
}

function emit(key: string): void {
  for (const listener of getStore(key).listeners) listener();
}

function writeCompleted(key: string, next: Completed): void {
  const store = getStore(key);
  store.snapshot = next;
  store.loaded = true;
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode) — keep in-memory only
  }
  emit(key);
}

type ProgressState = {
  ready: boolean;
  completed: Completed;
  sections: SectionMeta[];
  total: number;
  doneCount: number;
  toggle: (anchor: string) => void;
  reset: () => void;
  nextAnchor: string | null;
};

const Ctx = createContext<ProgressState | null>(null);

const noopSubscribe = () => () => {};
const hydratedClient = () => true;
const hydratedServer = () => false;

export function ProgressProvider({
  slug,
  sections,
  children,
}: {
  slug: string;
  sections: SectionMeta[];
  children: ReactNode;
}) {
  const storageKey = `wth:progress:v1:${slug}`;

  // Reads localStorage as an external store — no setState-in-effect and no
  // hydration mismatch (server snapshot is empty, client re-renders after
  // hydration with the stored value).
  const sub = useMemo(() => subscribeTo(storageKey), [storageKey]);
  const getSnap = useCallback(() => getSnapshot(storageKey), [storageKey]);
  const completed = useSyncExternalStore(sub, getSnap, getServerSnapshot);
  const ready = useSyncExternalStore(
    noopSubscribe,
    hydratedClient,
    hydratedServer,
  );

  const toggle = useCallback(
    (anchor: string) => {
      const next = { ...getSnapshot(storageKey) };
      if (next[anchor]) delete next[anchor];
      else next[anchor] = true;
      writeCompleted(storageKey, next);
    },
    [storageKey],
  );

  const reset = useCallback(() => {
    writeCompleted(storageKey, EMPTY);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey]);

  const value = useMemo<ProgressState>(() => {
    const doneCount = sections.filter((s) => completed[s.anchor]).length;
    const next = sections.find((s) => !completed[s.anchor]);
    return {
      ready,
      completed,
      sections,
      total: sections.length,
      doneCount,
      toggle,
      reset,
      nextAnchor: next?.anchor ?? null,
    };
  }, [ready, completed, sections, toggle, reset]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProgress(): ProgressState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useProgress must be used within ProgressProvider");
  return ctx;
}

export function scrollToAnchor(anchor: string | null) {
  if (!anchor) return;
  const el = document.getElementById(anchor);
  if (!el) return;
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  el.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "start",
  });
}
