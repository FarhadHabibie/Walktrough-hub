"use client";

import { useEffect, useState } from "react";
import type { SectionMeta } from "@/lib/types";
import { scrollToAnchor, useProgress } from "./progress";

function CheckDot({ done, active }: { done: boolean; active: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid size-[18px] shrink-0 place-items-center rounded-full border text-[10px] transition ${
        done
          ? "border-ok/60 bg-ok/15 text-ok"
          : active
            ? "border-accent bg-accent/15 text-accent"
            : "border-edge bg-surface2 text-transparent"
      }`}
    >
      ✓
    </span>
  );
}

function NavList({
  sections,
  active,
  onNavigate,
}: {
  sections: SectionMeta[];
  active: string | null;
  onNavigate?: () => void;
}) {
  const { completed } = useProgress();

  return (
    <nav className="space-y-0.5">
      {sections.map((s, i) => {
        const showGroup =
          Boolean(s.group_title) &&
          s.group_title !== (sections[i - 1]?.group_title ?? null);
        const done = Boolean(completed[s.anchor]);
        const isActive = active === s.anchor;
        return (
          <div key={s.id}>
            {showGroup && (
              <div className="px-2.5 pb-1.5 pt-4 font-mono text-[11px] uppercase tracking-[0.15em] text-muted first:pt-0">
                {s.group_title}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                onNavigate?.();
                window.requestAnimationFrame(() => scrollToAnchor(s.anchor));
              }}
              aria-current={isActive ? "true" : undefined}
              className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] leading-snug transition-colors ${
                isActive
                  ? "bg-accent/10 text-ink"
                  : done
                    ? "text-muted hover:bg-surface2 hover:text-ink"
                    : "text-ink/85 hover:bg-surface2 hover:text-ink"
              }`}
            >
              <CheckDot done={done} active={isActive} />
              <span className="min-w-0">
                <span
                  className={`mr-1.5 font-mono text-[11px] ${isActive ? "text-accent" : "text-muted"}`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                {s.title}
              </span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}

export default function SidebarNav({ sections }: { sections: SectionMeta[] }) {
  const [active, setActive] = useState<string | null>(
    sections[0]?.anchor ?? null,
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          );
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-88px 0px -62% 0px", threshold: 0 },
    );

    for (const s of sections) {
      const el = document.getElementById(s.anchor);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <>
      <aside className="hidden lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-7.5rem)] overflow-y-auto pb-4 pr-1">
          <div className="mb-2 px-2.5 font-mono text-[11px] uppercase tracking-[0.15em] text-muted">
            Daftar isi · {sections.length} bagian
          </div>
          <NavList sections={sections} active={active} />
        </div>
      </aside>

      <details
        className="mb-6 rounded-xl border border-edge bg-surface lg:hidden"
        open={mobileOpen}
        onToggle={(e) => setMobileOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer select-none px-4 py-3.5 text-sm font-medium">
          Daftar isi{" "}
          <span className="text-muted">({sections.length} bagian)</span>
        </summary>
        <div className="max-h-80 overflow-y-auto border-t border-edge p-2">
          <NavList
            sections={sections}
            active={active}
            onNavigate={() => setMobileOpen(false)}
          />
        </div>
      </details>
    </>
  );
}
