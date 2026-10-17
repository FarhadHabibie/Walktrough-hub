"use client";

import { navigate, useRoute } from "@/lib/router";

export default function SiteHeader() {
  const route = useRoute();

  const goCatalog = () => {
    document.getElementById("games")?.scrollIntoView({ block: "start" });
  };

  return (
    <header className="site-header sticky top-0 z-40 border-b border-edge bg-bg">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <a
          href="#/"
          onClick={(e) => {
            e.preventDefault();
            if (route.view === "home") {
              window.scrollTo({ top: 0 });
            } else {
              navigate("/");
            }
          }}
          className="group flex items-center gap-2.5"
        >
          <span className="grid size-8 place-items-center rounded-lg bg-accent font-mono text-sm font-bold text-bg">
            W
          </span>
          <span className="text-[15px] font-semibold tracking-tight">
            Walkthrough<span className="text-accent">Hub</span>
          </span>
        </a>
        <nav className="flex items-center gap-1 text-sm text-muted">
          <button
            type="button"
            onClick={() => {
              if (route.view === "home") {
                goCatalog();
              } else {
                navigate("/");
                window.setTimeout(goCatalog, 80);
              }
            }}
            className="rounded-lg px-3 py-1.5 transition hover:bg-surface2 hover:text-ink"
          >
            Katalog
          </button>
        </nav>
      </div>
    </header>
  );
}
