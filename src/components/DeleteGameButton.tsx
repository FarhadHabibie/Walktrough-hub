"use client";

import { useState } from "react";
import { navigate } from "@/lib/router";
import { deleteGame } from "@/lib/store";

type Props = {
  slug: string;
  title: string;
  /** "card" = small icon button over a catalog cover; "page" = labelled button. */
  variant?: "card" | "page";
};

/**
 * Hapus walkthrough tersimpan dari katalog lokal. Konfirmasi dulu, lalu hapus
 * dari IndexedDB. Dari halaman game ia pindah ke katalog; dari kartu, daftar
 * ikut ter-refresh lewat subscription store. Progres baca game itu di
 * localStorage ikut dibuang.
 */
export default function DeleteGameButton({
  slug,
  title,
  variant = "page",
}: Props) {
  const [busy, setBusy] = useState(false);

  const onDelete = async () => {
    if (busy) return;
    const ok = window.confirm(
      `Hapus walkthrough “${title}” dari katalog?\n\n` +
        "Salinan lokalnya (termasuk progres baca di perangkat ini) akan dihapus. " +
        "Game bisa diambil ulang dari wiki publik kapan saja.",
    );
    if (!ok) return;

    setBusy(true);
    try {
      const deleted = await deleteGame(slug);
      if (!deleted) throw new Error("not found");
      try {
        localStorage.removeItem(`wth:progress:v1:${slug}`);
      } catch {
        // localStorage unavailable — progress cleanup is best-effort
      }
      if (variant === "page") {
        // Leave the page: this walkthrough no longer exists locally.
        navigate("/");
      }
    } catch {
      window.alert("Gagal menghapus walkthrough. Coba lagi.");
      setBusy(false);
    }
  };

  const icon = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={variant === "card" ? "size-3.5" : "size-3"}
      aria-hidden
    >
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m1 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7m4 4v6m4-6v6" />
    </svg>
  );

  if (variant === "card") {
    return (
      <button
        type="button"
        disabled={busy}
        aria-label={`Hapus walkthrough ${title} dari katalog`}
        title="Hapus dari katalog"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void onDelete();
        }}
        className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-lg border border-edge bg-bg/90 text-muted transition-colors hover:border-red-400/70 hover:text-red-300 disabled:opacity-50"
      >
        {icon}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      aria-label={`Hapus walkthrough ${title} dari katalog`}
      onClick={() => void onDelete()}
      className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-muted transition-colors hover:border-red-400/50 hover:text-red-300 disabled:opacity-50"
    >
      {busy ? (
        "Menghapus…"
      ) : (
        <>
          {icon} Hapus dari katalog
        </>
      )}
    </button>
  );
}
