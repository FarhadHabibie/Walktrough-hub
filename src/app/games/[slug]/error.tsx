"use client";

import Link from "next/link";

export default function GameError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto grid max-w-2xl place-items-center px-4 py-24 text-center">
      <div className="rounded-2xl border border-edge bg-surface p-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-red-400">
          Terjadi kesalahan
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Gagal memuat walkthrough
        </h1>
        <p className="mt-3 text-sm text-muted">
          {error.message || "Ada masalah saat membaca database walkthrough."}
        </p>
        <div className="mt-7 flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-full border border-accent/50 bg-accent/15 px-5 py-2 text-sm font-medium text-accent transition hover:bg-accent/25"
          >
            Coba lagi
          </button>
          <Link
            href="/"
            className="rounded-full border border-edge bg-surface2 px-5 py-2 text-sm text-muted transition hover:text-ink"
          >
            Ke beranda
          </Link>
        </div>
      </div>
    </div>
  );
}
