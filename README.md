# WalkthroughHub

Web app untuk baca walkthrough game **lengkap dalam satu halaman**. Cari game → buka → semua bagian walkthrough langsung dimuat (nggak perlu klik-klik chapter), plus **progress tracking** yang tersimpan otomatis di browser.

Konten di-scrape dari wiki publik (Fandom, wiki.gg, dll — MediaWiki API), disimpan lokal di SQLite, jadi:

- ⚡ Cepat — gak perlu nunggu load wiki satu-satu
- 🧭 Satu halaman utuh — sidebar navigasi + scrollspy per bagian
- ✅ Progress baca per-bagian (localStorage, tanpa akun)
- 🔎 Search instan pakai SQLite FTS5
- ✨ **Ambil game apa pun langsung dari web** — ketik di pencarian, app-nya scrape dari wiki publik saat itu juga
- 🧩 Mudah ditambah game baru via CLI (`add-game`) kalau mau sumber yang lebih spesifik

## Quickstart

```bash
npm install          # dependencies
npm run seed         # scrape semua game di scripts/games.config.ts → data/walkthroughs.db
npm run dev          # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

## Tambah game baru

**Cara cepat (CLI):**

```bash
npm run add-game -- \
  --slug=hollow-knight \
  --title="Hollow Knight" \
  --api=https://hollowknight.fandom.com \
  --pages="Walkthrough" \
  --platform="PC · Switch" --year=2017 \
  --desc="Metroidvania dari Team Cherry."
```

Kalau `--pages` tidak diisi, script akan coba auto-discover halaman walkthrough di wiki tersebut.

**Cara batch:** tambahkan entry ke `scripts/games.config.ts`, lalu `npm run seed` (atau `npm run seed slug-game` untuk satu game saja).

> Catatan: tiap wiki beda-beda struktur walkthrough-nya. Isi `pages` dengan judul halaman yang tepat (halaman bisa dicek dulu di wikinya). Game di-scrape per halaman; kalau `pages` lebih dari satu, judul halaman otomatis jadi grup di sidebar.

## Ambil game langsung dari web (tanpa CLI)

Di kolom pencarian, ketik nama game yang belum ada di katalog → muncul baris
**“Ambil dari wiki publik”**. Pilih itu (atau tekan Enter), dan app akan:

1. Mencari wiki yang paling cocok dari beberapa kandidat (peta kurasi untuk game populer + tebakan domain `namagame.fandom.com` / `namagame.wiki.gg`), lalu memverifikasi ke API wiki aslinya.
2. Mengambil halaman walkthrough khusus kalau ada (`Walkthrough`, `Guide`, dll), atau artikel game-nya kalau wiki tidak punya halaman walkthrough.
3. Membersihkan HTML-nya lewat `htmlclean` dan menyimpannya ke SQLite — jadi kunjungan berikutnya instan, dan game itu otomatis masuk katalog + pencarian.

Kunjungan pertama butuh ±3–6 detik (scrape sekali), habis itu selalu cepat. Kalau wiki tidak ditemukan, game tidak dimasukkan dan dicoba ulang paling cepat 10 menit kemudian.

## Arsitektur

```
scripts/                  # CLI scraper (jalan di Node, di luar app)
  games.config.ts         # daftar game + halaman sumber per game
  seed.ts                 # scrape + rebuild database
  add-game.ts             # tambah satu game dari CLI
src/
  lib/db.ts               # node:sqlite (built-in Node) — query, FTS5, upsert
  lib/slug.ts             # slugify (dipakai client + server)
  lib/wiki/mediawiki.ts   # client MediaWiki API (parse page, cover, search)
  lib/wiki/htmlclean.ts   # sanitasi HTML wiki → section HTML yang aman & bersih
  lib/wiki/discover.ts    # pencarian kandidat wiki + halaman walkthrough
  lib/wiki/ingest.ts      # ingest on-demand (dipakai halaman game)
  app/                    # Next.js App Router
    page.tsx              # home: hero + search + katalog
    games/[slug]/page.tsx # halaman walkthrough (SSR semua section + ingest on-demand)
    api/search/route.ts   # search endpoint (FTS5 + fallback LIKE)
  components/             # SearchBox, SidebarNav, ProgressProvider, dll
data/walkthroughs.db      # SQLite (git-ignored, regenerate dengan `npm run seed`)
```

Teknologi: **Next.js 16** (App Router, Turbopack) · **Tailwind CSS 4** · **node:sqlite** (tanpa native deps) · **node-html-parser** (scraper).

### Bagaimana konten diproses

1. Script fetch halaman wiki via `action=parse` (MediaWiki API).
2. `htmlclean.ts` membuang script/navbox/infobox/referensi, men-sanitasi atribut (allowlist), meng-absolutize semua link/gambar, lalu memotong konten menjadi **section** per heading `h1/h2`.
3. Section disimpan ke SQLite; HTML-nya dirender ulang di app dengan styling sendiri (`.prose-wt`).

## Lisensi konten

Konten walkthrough berasal dari wiki publik (Fandom, wiki.gg, wiki komunitas) dengan lisensi **CC BY-SA** — hak cipta milik masing-masing kontributor wiki. Aplikasi ini hanya me-render ulang konten tersebut dengan tampilan yang lebih nyaman dan selalu mencantumkan sumber + link ke wiki aslinya.
