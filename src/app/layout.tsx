import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import SiteHeader from "@/components/SiteHeader";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SiteHeader />

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
