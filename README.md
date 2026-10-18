# WalkthroughHub

Aplikasi baca walkthrough game **lengkap dalam satu halaman**. Cari game → buka → semua bagian walkthrough langsung dimuat (nggak perlu klik-klik chapter), plus **progress tracking** yang tersimpan otomatis.

Konten diambil dari wiki publik (Fandom, wiki.gg, Fextralife, StrategyWiki, dll — MediaWiki API) **langsung oleh aplikasi** (browser/WebView memanggil API-nya sendiri — semua sumber mengizinkan CORS), lalu disimpan **di perangkat** (IndexedDB) — tanpa server sama sekali:

- ⚡ Cepat — kunjungan pertama ambil dari wiki, habis itu instan dari penyimpanan lokal
- 📴 Offline — walkthrough yang sudah pernah diambil bisa dibaca tanpa internet
- 🧭 Satu halaman utuh — sidebar navigasi + scrollspy per bagian
- ✅ Progress baca per-bagian (tanpa akun)
- 🔎 Pencarian instan di katalog lokal — plus **“Ambil dari wiki publik”** untuk game apa pun yang belum ada
- 🎮 **Pilih platform** — saat menambah game maupun kapan saja di halaman game; kalau wiki sumber punya panduan khusus versi itu (mis. *Tetris DS*), yang diambil panduan versi tersebut
- 📱 Jalan sebagai web di desktop **dan** sebagai **APK Android standalone** (Capacitor)

## Quickstart (desktop)

```bash
npm install
npm run dev          # http://localhost:3000
```

Production (static export + server statis kecil):

```bash
npm run build        # static export → out/
npm start            # http://localhost:3765  (ganti port: npm start -- -p 8080)
```

## Katalog awal

Repo ini menyertakan katalog lama (**16 game**, hasil scrape awal) di `public/seed/catalog.json`. Saat pertama kali dibuka, aplikasi mengimpor katalog itu ke penyimpanan lokal satu kali. Game lain diambil on-demand lewat pencarian.

## Ambil game langsung dari web

Di kolom pencarian, ketik nama game yang belum ada di katalog → muncul baris
**“Ambil dari wiki publik”**. Pilih itu (atau tekan Enter) → pilih **platform yang kamu mainkan** (opsional; ada juga "Semua platform"), dan app akan:

1. Mencari wiki utama (peta kurasi untuk game populer + tebakan domain `namagame.fandom.com` / `namagame.wiki.gg`), memverifikasi ke API wiki aslinya, lalu mengambil halaman walkthrough khususnya (`Walkthrough`, `Guide`, hub misi) — atau artikel game-nya kalau memang tidak ada.
2. Kalau hasilnya cuma artikel tipis (atau wiki-nya tidak ketemu), app lanjut ke sumber yang isinya memang walkthrough: **Fextralife** (halaman standar *"Game Progress Route"* — walkthrough terurut per area, mis. Dark Souls III & Bloodborne) lalu **StrategyWiki** (panduan multi-halaman lewat *"Table of Contents"* — semua chapter dimuat sekaligus sebagai grup, mis. Chrono Trigger & Zelda: A Link to the Past).
3. Hasil yang paling kuat (paling lengkap) yang dipakai, dibersihkan lewat `htmlclean`, dan disimpan ke penyimpanan lokal — jadi kunjungan berikutnya instan, dan game itu otomatis masuk katalog + pencarian.

Platform yang kamu pilih disimpan sebagai label (tampil di kartu katalog + header halaman game) **dan** dipakai untuk mengarahkan sumber: di StrategyWiki, kalau game punya panduan terpisah untuk versi itu (mis. *Tetris DS* vs *Tetris*), panduan versi tersebut yang diambil. Kalau tidak ada, panduan utama game-nya yang dipakai — labelnya tetap tersimpan. Platform bisa diganti kapan saja lewat chip kecil di bawah judul game (mengganti label; untuk mengganti sumbernya, hapus lalu tambah ulang dengan platform yang benar).

Kunjungan pertama butuh ±3–6 detik (bisa ~15 detik untuk panduan multi-halaman besar); habis itu selalu cepat — dan tetap bisa dibuka tanpa internet. Kalau tidak ada sumber yang cocok, game tidak dimasukkan dan dicoba ulang paling cepat 10 menit kemudian.

Walkthrough yang sudah tersimpan bisa **dihapus** kapan saja: lewat ikon hapus di pojok cover kartu game di katalog, atau tombol **“Hapus dari katalog”** di halaman game-nya. Yang dibuang cuma salinan lokal (termasuk progres baca); gamenya bisa diambil ulang dari wiki publik kapan pun.

## Install di Android (APK)

Build debug ada di root repo setelah proses build: `WalkthroughHub-1.0-debug.apk` (tidak di-commit). Pindahkan ke HP → buka → izinkan *install dari sumber tidak dikenal*. Minimal Android 7 (API 24).

Build sendiri:

```bash
npm run build                 # static export → out/
npx cap sync android          # copy out/ ke project Android
cd android
JAVA_HOME=/path/to/jdk21 ANDROID_HOME=/path/to/android-sdk ./gradlew assembleDebug
# hasil: android/app/build/outputs/apk/debug/app-debug.apk
```

Butuh **JDK 21** dan **Android SDK** (platform 36 + build-tools 36). Alternatif env var: isi `android/local.properties` dengan `sdk.dir=/path/ke/android-sdk`.

> Semua data (katalog, walkthrough, progres) tersimpan di perangkat; APK ini tidak butuh server dan tidak mengirim apa pun ke mana pun — kecuali permintaan langsung ke API wiki publik saat mengambil game baru. Ikon & splash dibangun dari `assets/` via `npx @capacitor/assets generate --android`.

## Arsitektur

```
src/
  lib/store.ts            # penyimpanan IndexedDB (games + sections)
  lib/router.ts           # hash router (#/ dan #/games/<slug>)
  lib/slug.ts             # slugify
  lib/platforms.ts        # daftar platform + alias (pencocokan versi wiki)
  lib/wiki/mediawiki.ts   # client MediaWiki API (parse, cover, search)
  lib/wiki/htmlclean.ts   # sanitasi HTML wiki → section yang aman & bersih (DOMParser)
  lib/wiki/discover.ts    # pencarian kandidat wiki + halaman walkthrough
  lib/wiki/ingest.ts      # ingest on-demand (dipakai halaman game)
  views/                  # HomeView (katalog) + GameView (walkthrough)
  app/                    # shell Next.js (static export, client-side routing)
  components/             # SearchBox, SidebarNav, dll
scripts/serve.ts          # static server desktop (npm start)
public/seed/catalog.json  # katalog awal (diimpor otomatis saat pertama buka)
android/                  # project Capacitor Android
assets/                   # sumber ikon + splash APK
capacitor.config.ts       # konfigurasi Android (webDir: out)
```

Teknologi: **Next.js 16** (static export, Turbopack) · **Tailwind CSS 4** · **IndexedDB** · **DOMParser** · **Capacitor 8** (Android).

### Bagaimana konten diproses

1. Aplikasi fetch halaman wiki via `action=parse` (MediaWiki API) — langsung dari browser/WebView, tanpa proxy.
2. `htmlclean.ts` membuang script/navbox/infobox/referensi, men-sanitasi atribut (allowlist), meng-absolutize semua link/gambar, lalu memotong konten menjadi **section** per heading (h1–h2, atau sampai h3 untuk sumber yang memakai sub-heading sebagai bab — seperti "Game Progress Route" Fextralife).
3. Section disimpan di IndexedDB perangkat; HTML-nya dirender ulang di app dengan styling sendiri (`.prose-wt`).

## Lisensi konten

Konten walkthrough berasal dari wiki publik (Fandom, wiki.gg, StrategyWiki, Fextralife, dan wiki komunitas lain) — lisensi mengikuti masing-masing wiki (Fandom/wiki.gg umumnya **CC BY-SA**). Hak cipta milik masing-masing kontributor wiki. Aplikasi ini hanya me-render ulang konten tersebut dengan tampilan yang lebih nyaman dan selalu mencantumkan sumber + link ke halaman aslinya.
