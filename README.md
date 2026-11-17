# tokoku. — Toko Online

Toko online sederhana berbahasa Indonesia: katalog produk, keranjang,
checkout, dan pelacakan pengiriman di peta GPS (simulasi). Satu layanan
Node.js + Express + SQLite — tanpa build step.

Standalone copy dari website e-commerce "tokoku." yang awalnya dibuat
sebagai artefak Muse. Katalognya sama: 8 produk contoh dengan harga IDR.

## Fitur

- **Katalog produk** — 8 produk contoh dengan foto, pencarian, dan filter
  kategori; halaman detail produk.
- **Keranjang** — tersimpan di server (SQLite), jadi tidak hilang saat
  halaman di-refresh.
- **Checkout sederhana** — nama, telepon, alamat, 7 kota tujuan dengan
  ongkir (Jakarta Rp9.000 – Surabaya Rp35.000), dan 4 metode pembayaran
  simulasi. Checkout mengurangi stok dan membuat kode pesanan
  (format `TKS-XXXXXXXXXX`).
- **Pesanan Saya** — daftar pesanan dengan status pengiriman terkini.
- **Pelacakan pengiriman GPS (simulasi)** — peta Leaflet/OpenStreetMap
  dengan rute dari Gudang Jakarta ke kota tujuan, pin kurir yang bergerak,
  status Dikemas / Dalam perjalanan / Terkirim, persen perjalanan, sisa
  jarak, estimasi tiba, dan riwayat perjalanan. Satu perjalanan memakan
  waktu sekitar 20 menit.

> **Demo:** pembayaran disimulasikan — tidak ada gerbang pembayaran nyata
> yang terhubung. Pelacakan adalah simulasi GPS demo, bukan posisi kurir
> sungguhan. Data tersimpan di SQLite lokal (`data/ecommerce.db`); di
> Render free tier data bisa hilang saat restart/redeploy.

## Menjalankan secara lokal

Butuh Node.js 20+ (disarankan Node 22).

```bash
npm install
npm start
```

Buka http://localhost:3000

## Deploy ke Render

Repo ini sudah berisi `render.yaml` (blueprint, free plan, Node 22):

1. Push repo ini ke GitHub.
2. Di Render: **New + → Blueprint**, arahkan ke repo ini.
3. Render akan menjalankan `npm install` lalu `npm start`.

## API

| Method | Endpoint | Keterangan |
| ------ | -------- | ---------- |
| GET | `/api/products?q=&category=` | Katalog produk |
| GET | `/api/products/:id` | Detail produk |
| GET | `/api/categories` | Daftar kategori |
| GET | `/api/destinations` | Kota tujuan + ongkir |
| GET | `/api/payment-methods` | Metode pembayaran simulasi |
| GET/POST | `/api/cart` | Keranjang (header `X-Cart-Id`) |
| PUT/DELETE | `/api/cart/:productId` | Ubah / hapus isi keranjang |
| POST | `/api/orders` | Checkout → kode pesanan |
| GET | `/api/orders` | Daftar pesanan + status |
| GET | `/api/orders/:code` | Detail pesanan + pelacakan GPS |

## Struktur

```
server.js           # Express: API + frontend statis
src/db.js           # SQLite: skema + seed katalog & kota tujuan
src/routes.js       # Rute API
src/tracking.js     # Simulasi GPS: rute, posisi kurir, status, ETA
public/             # Frontend vanilla (index.html, styles.css, app.js)
render.yaml         # Blueprint Render (Node 22)
```
