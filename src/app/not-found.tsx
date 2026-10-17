import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto grid max-w-2xl place-items-center px-4 py-28 text-center">
      <div className="rounded-2xl border border-edge bg-surface p-10">
        <div className="font-mono text-5xl font-bold text-accent">404</div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          Game tidak ditemukan
        </h1>
        <p className="mt-3 text-sm text-muted">
          Walkthrough yang kamu cari tidak ada di katalog dan tidak ditemukan
          di wiki publik. Coba tulis nama game yang lebih lengkap di pencarian
          (mis. &ldquo;Hollow Knight&rdquo;), lalu pilih{" "}
          <span className="text-ink">Ambil dari wiki publik</span>.
        </p>
        <Link
          href="/"
          className="mt-7 inline-block rounded-full border border-accent/50 bg-accent/15 px-5 py-2 text-sm font-medium text-accent transition hover:bg-accent/25"
        >
          Lihat semua game
        </Link>
      </div>
    </div>
  );
}
