# WalkthroughHub

Aplikasi baca walkthrough game **lengkap dalam satu halaman**. Cari game → buka → semua bagian walkthrough langsung dimuat (nggak perlu klik-klik chapter), plus **progress tracking** yang tersimpan otomatis.

Konten diambil dari wiki publik (Fandom, wiki.gg, Fextralife, StrategyWiki, dll — MediaWiki API) **langsung oleh aplikasi** (browser/WebView memanggil API-nya sendiri — semua sumber mengizinkan CORS), lalu disimpan **di perangkat** (IndexedDB) — tanpa server:

- ⚡ Cepat — kunjungan pertama ambil dari wiki, habis itu instan dari penyimpanan lokal
- 📴 Offline — walkthrough yang sudah pernah diambil bisa dibaca tanpa internet
- 🧭 Satu halaman utuh — sidebar navigasi + scrollspy per bagian
- ✅ Progress baca per-bagian (tanpa akun)
- 🔎 Pencarian instan di katalog lokal — plus **“Ambil dari wiki publik”** dan **“Ambil dari GameFAQs”** untuk game apa pun yang belum ada
- 🔥 **GameFAQs** — FAQ/walkthrough klasik (termasuk panduan legendaris yang tidak ada di wiki) diambil otomatis: di HP lewat WebView dalam app, di desktop lewat API kecil di server lokal `npm start`. Detail di [bawah](#ambil-walkthrough-dari-gamefaqs)
- 📚 **Sumber paling lengkap** — saat mengambil game baru, beberapa sumber (wiki utama + artikelnya, Fextralife, StrategyWiki) diambil dan dibandingkan otomatis; yang isinya paling lengkap yang dipakai, jadi walkthrough tipis/summary tidak menang kalau ada yang lebih utuh
- 🎮 **Pilih platform** — saat menambah game maupun kapan saja di halaman game; kalau wiki sumber punya panduan khusus versi itu (mis. *Tetris DS*), yang diambil panduan versi tersebut
- 🕹️ **Nuansa retro CRT** — judul & angka pakai font pixel (Silkscreen), sudut siku, hard shadow, progress bar tersegmentasi, dan scanline halus ala monitor CRT; teks isi tetap Geist supaya enak dibaca
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

Repo ini menyertakan katalog bawaan (**16 game** lengkap) di `public/seed/catalog.json`. Saat pertama kali dibuka, aplikasi mengimpor katalog itu ke penyimpanan lokal satu kali. Game lain diambil on-demand lewat pencarian.

Katalog punya nomor versi (`public/seed/version.json` + `version` di dalam catalog.json). Kalau app versi baru membawa katalog yang lebih baru (versinya naik — mis. setelah walkthrough seed diambil ulang supaya lebih lengkap), app yang sudah terinstal **menyegarkan konten game seed yang masih ada** secara otomatis saat dibuka: progres baca, label platform, dan game yang sudah kamu hapus tidak disentuh.

## Ambil game langsung dari web

Di kolom pencarian, ketik nama game yang belum ada di katalog → muncul baris
**“Ambil dari wiki publik”** (dan, kalau tersedia, baris **“Ambil dari GameFAQs”** — lihat [bagian khususnya](#ambil-walkthrough-dari-gamefaqs)). Pilih itu (atau tekan Enter) → pilih **platform yang kamu mainkan** (opsional; ada juga "Semua platform"), dan app akan:

1. Mencari wiki utama (peta kurasi untuk game populer + tebakan domain `namagame.fandom.com` / `namagame.wiki.gg`), memverifikasi ke API wiki aslinya, lalu mengambil halaman walkthrough khususnya (`Walkthrough`, `Guide`, hub misi) — atau artikel game-nya kalau memang tidak ada.
2. Mengumpulkan **semua** kandidat yang ada sekaligus (diparalel): artikel wiki primer itu sendiri (dipakai kalau halaman walkthrough di sana cuma daftar tipis, mis. halaman *Quests* 372 karakter), **Fextralife** (halaman standar *"Game Progress Route"* — walkthrough terurut per area, mis. Dark Souls III & Bloodborne), dan **StrategyWiki** (panduan multi-halaman lewat *"Table of Contents"* — semua chapter dimuat sekaligus sebagai grup, mis. Chrono Trigger & Stardew Valley; TOC yang isinya cuma kerangka/red link ditolak).
3. Membandingkan semua kandidat dan memakai **yang paling lengkap**: walkthrough utuh (≥ 4.000 karakter) menang atas artikel biasa; kalau tidak ada yang utuh, halaman terpanjang yang dipakai. Hasilnya dibersihkan lewat `htmlclean`, disimpan ke penyimpanan lokal — jadi kunjungan berikutnya instan, dan game itu otomatis masuk katalog + pencarian.

Platform yang kamu pilih disimpan sebagai label (tampil di kartu katalog + header halaman game) **dan** dipakai untuk mengarahkan sumber: di StrategyWiki, kalau game punya panduan terpisah untuk versi itu (mis. *Tetris DS* vs *Tetris*), panduan versi tersebut yang diambil. Kalau tidak ada, panduan utama game-nya yang dipakai — labelnya tetap tersimpan. Platform bisa diganti kapan saja lewat chip kecil di bawah judul game (mengganti label; untuk mengganti sumbernya, hapus lalu tambah ulang dengan platform yang benar).

Kunjungan pertama butuh ±3–6 detik (bisa ~15 detik untuk panduan multi-halaman besar); habis itu selalu cepat — dan tetap bisa dibuka tanpa internet. Kalau tidak ada sumber yang cocok, game tidak dimasukkan dan dicoba ulang paling cepat 10 menit kemudian.

Walkthrough yang sudah tersimpan bisa **dihapus** kapan saja: lewat ikon hapus di pojok cover kartu game di katalog, atau tombol **“Hapus dari katalog”** di halaman game-nya. Yang dibuang cuma salinan lokal (termasuk progres baca); gamenya bisa diambil ulang dari wiki publik kapan pun.

## Ambil walkthrough dari GameFAQs

Untuk game yang wiki-nya tipis — atau yang panduan klasiknya hanya ada di sana — pencarian juga
menawarkan baris **“Ambil dari GameFAQs”**. FAQ/walkthrough paling lengkap diambil dan dipilih
otomatis (judul yang mengandung *walkthrough* menang atas *guide*/*faq*, lalu ukuran K terbesar),
lalu disimpan seperti sumber lain:

- **Di HP (APK)** — pengambilan berjalan di dalam app lewat **WebView tersembunyi**: pencarian game →
  halaman game → daftar FAQ → FAQ terbaik → semua blok teksnya digabung. WebView-nya mengirim header
  *client hints* persis seperti Chrome (tanpa itu GameFAQs mengembalikan halaman pencarian kosong),
  dan kalau Cloudflare memunculkan pemeriksaan, app menunggu sebentar dulu — biasanya lolos sendiri.
  Kalau tetap gagal (atau ada langkah lain yang macet), **browser kecil dalam app terbuka** dengan
  pesan alasan di atasnya; cari/buka halaman FAQ-nya dan tekan **SALIN** di toolbar, teksnya langsung
  masuk ke app. Tidak ada server dan tidak ada data yang dikirim ke mana pun — WebView memakai
  koneksi internetmu sendiri, sama seperti membuka situsnya di browser.
- **Di desktop** — browser biasa tidak bisa menarik halaman GameFAQs lintas-origin (CORS), jadi
  `npm start` (server lokal di port 3765) menyediakan API kecil `/api/gamefaqs/fetch` yang mengambil
  FAQ di mesin yang sama — app mendeteksinya lewat `/api/gamefaqs/ping` dan menampilkan baris itu
  hanya saat server lokalnya ada. (Kalau `out/` di-host statis tanpa server itu, barisnya hilang
  sendiri.)

Teks FAQ dirender sebagai monospace `pre-wrap` (gambar ASCII dan tabel tetap sejajar, baris panjang
dibungkus), lalu dipotong per bab lewat deteksi heading (judul berkotak `====`, baris "Chapter N",
heading KAPITAL). FAQ adalah **karya penulis masing-masing di GameFAQs** (bukan CC BY-SA) — footer
halaman menandai sumbernya dan selalu menautkan FAQ aslinya.

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

> Semua data (katalog, walkthrough, progres) tersimpan di perangkat; APK ini tidak butuh server dan tidak mengirim apa pun ke mana pun — kecuali permintaan langsung ke API wiki publik atau halaman GameFAQs (via WebView dalam app) saat mengambil game baru. Ikon & splash dibangun dari `assets/` via `npx @capacitor/assets generate --android`.

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
  lib/faq/client.ts       # sumber FAQ: server lokal (desktop) / plugin native (Android)
  lib/faq/split.ts        # teks FAQ panjang → bagian + blok <pre class="faq-text">
  lib/faq/import.ts       # ingest FAQ GameFAQs → penyimpanan lokal
  views/                  # HomeView (katalog) + GameView (walkthrough)
  app/                    # shell Next.js (static export, client-side routing)
  components/             # SearchBox, SidebarNav, dll
scripts/serve.ts          # static server desktop (npm start) + API /api/gamefaqs/*
scripts/gamefaqs.ts       # pengambil FAQ GameFAQs sisi server (curl + cookie jar)
public/seed/catalog.json  # katalog awal (diimpor otomatis saat pertama buka)
public/seed/version.json  # stempel versi katalog → memicu refresh konten seed saat app di-update
android/                  # project Capacitor Android (+ plugin GamefaqsCapture & CaptureActivity)
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

Walkthrough yang ditarik dari **GameFAQs** berbeda: teksnya adalah FAQ karya penulis individual di
sana (bukan CC BY-SA), di-host oleh GameFAQs. Aplikasi menyimpannya **hanya untuk bacaan pribadi di
perangkatmu**, tidak menyebarluaskannya, dan selalu menautkan halaman FAQ aslinya — silakan buka
halaman itu untuk versi terbaru dan menghargai penulisnya.
