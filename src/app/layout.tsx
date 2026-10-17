import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "WalkthroughHub — Walkthrough lengkap untuk setiap game",
    template: "%s · WalkthroughHub",
  },
  description:
    "Cari game, buka walkthrough lengkapnya dalam satu halaman, dan lacak progres bacamu. Konten dari wiki publik berlisensi CC BY-SA.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-40 border-b border-edge/70 bg-bg/80 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
            <Link href="/" className="group flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent2 font-mono text-sm font-bold text-bg">
                W
              </span>
              <span className="text-[15px] font-semibold tracking-tight">
                Walkthrough<span className="text-accent">Hub</span>
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-sm text-muted">
              <Link
                href="/#games"
                className="rounded-lg px-3 py-1.5 transition hover:bg-surface2 hover:text-ink"
              >
                Katalog
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-edge/70">
          <div className="mx-auto max-w-7xl px-4 py-8 text-xs leading-relaxed text-muted sm:px-6">
            <p>
              Konten walkthrough diambil dari wiki publik (
              <a
                className="text-accent2 hover:underline"
                href="https://www.fandom.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Fandom
              </a>
              ,{" "}
              <a
                className="text-accent2 hover:underline"
                href="https://wiki.gg"
                target="_blank"
                rel="noopener noreferrer"
              >
                wiki.gg
              </a>
              , dan wiki komunitas lainnya) dengan lisensi CC BY-SA. Hak cipta
              milik masing-masing kontributor wiki.
            </p>
            <p className="mt-2">
              WalkthroughHub — dibuat untuk jalan pintas baca walkthrough tanpa
              iklan dan tanpa pindah-pindah tab.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
