'use strict';
// SQLite setup for tokoku.: products, destinations, carts, orders.
// Database file: data/ecommerce.db (created on first run; seeded once).

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'ecommerce.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    price INTEGER NOT NULL,
    original_price INTEGER,
    stock INTEGER NOT NULL DEFAULT 0,
    rating REAL NOT NULL DEFAULT 0,
    sold INTEGER NOT NULL DEFAULT 0,
    image_url TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS destinations (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    shipping_cost INTEGER NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cart_items (
    cart_id TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    qty INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (cart_id, product_id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    city_key TEXT NOT NULL,
    city_name TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    subtotal INTEGER NOT NULL,
    shipping_cost INTEGER NOT NULL,
    total INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS order_items (
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    qty INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );
`);

// ---- Seed: sample catalog (same products as the tokoku. artifact) ----
const productCount = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
if (productCount === 0) {
  const insert = db.prepare(`
    INSERT INTO products (id, slug, name, category, description, price, original_price, stock, rating, sold, image_url)
    VALUES (@id, @slug, @name, @category, @description, @price, @originalPrice, @stock, @rating, @sold, @imageUrl)
  `);
  const seed = db.transaction((products) => {
    for (const p of products) insert.run(p);
  });
  seed([
    {
      id: 1, slug: 'earbuds-nirkabel-pro', name: 'Earbuds Nirkabel Pro', category: 'Elektronik',
      description: 'Earbuds true wireless dengan casing pengisi daya, suara jernih, dan koneksi Bluetooth stabil untuk musik dan panggilan sepanjang hari.',
      price: 349000, originalPrice: 499000, stock: 24, rating: 4.8, sold: 132,
      imageUrl: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 2, slug: 'sepatu-lari-ares', name: 'Sepatu Lari Ares Hitam', category: 'Olahraga',
      description: 'Sepatu lari berbahan mesh ringan dengan sol empuk yang menyerap benturan — nyaman untuk lari harian maupun jalan santai.',
      price: 459000, originalPrice: 599000, stock: 18, rating: 4.7, sold: 98,
      imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 3, slug: 'ransel-kulit-vintage', name: 'Ransel Kulit Vintage', category: 'Fashion',
      description: 'Ransel kulit cokelat bergaya vintage dengan kompartemen laptop 15 inci dan jahitan rapi — tampil klasik, muat banyak.',
      price: 899000, originalPrice: 1150000, stock: 9, rating: 4.9, sold: 41,
      imageUrl: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 4, slug: 'smartwatch-sport-x', name: 'Smartwatch Sport X', category: 'Elektronik',
      description: 'Jam tangan pintar dengan layar sentuh, pemantau detak jantung dan langkah, serta tali kulit yang nyaman dipakai seharian.',
      price: 749000, originalPrice: 999000, stock: 13, rating: 4.6, sold: 89,
      imageUrl: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 5, slug: 'headphone-over-ear-bass', name: 'Headphone Over-Ear Bass', category: 'Elektronik',
      description: 'Headphone over-ear dengan bantalan telinga lembut dan bass yang dalam — pas untuk fokus kerja maupun menikmati musik.',
      price: 529000, originalPrice: 679000, stock: 21, rating: 4.7, sold: 76,
      imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 6, slug: 'kacamata-hitam-klasik', name: 'Kacamata Hitam Klasik', category: 'Fashion',
      description: 'Kacamata hitam berbingkai klasik dengan lensa gelap pelindung UV — gaya simpel yang cocok untuk aktivitas luar ruangan.',
      price: 149000, originalPrice: 219000, stock: 40, rating: 4.5, sold: 203,
      imageUrl: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 7, slug: 'tumbler-stainless-900ml', name: 'Tumbler Stainless 900 ml', category: 'Rumah Tangga',
      description: 'Tumbler stainless steel insulasi vakum yang menjaga minuman tetap dingin atau panas berjam-jam, lengkap dengan tutup anti tumpah.',
      price: 119000, originalPrice: 169000, stock: 56, rating: 4.8, sold: 312,
      imageUrl: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 8, slug: 'keyboard-mekanik-rgb', name: 'Keyboard Mekanik RGB', category: 'Elektronik',
      description: 'Keyboard mekanik dengan switch tactile yang responsif dan lampu latar RGB — nyaman untuk mengetik lama maupun bermain gim.',
      price: 649000, originalPrice: 849000, stock: 12, rating: 4.8, sold: 64,
      imageUrl: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80',
    },
  ]);
}

const destCount = db.prepare('SELECT COUNT(*) AS n FROM destinations').get().n;
if (destCount === 0) {
  const insert = db.prepare(`
    INSERT INTO destinations (key, name, shipping_cost, lat, lng)
    VALUES (@key, @name, @shippingCost, @lat, @lng)
  `);
  const seed = db.transaction((rows) => {
    for (const r of rows) insert.run(r);
  });
  seed([
    { key: 'jakarta', name: 'Jakarta', shippingCost: 9000, lat: -6.2615, lng: 106.8106 },
    { key: 'bekasi', name: 'Bekasi', shippingCost: 12000, lat: -6.2383, lng: 106.9756 },
    { key: 'bogor', name: 'Bogor', shippingCost: 15000, lat: -6.5971, lng: 106.8060 },
    { key: 'bandung', name: 'Bandung', shippingCost: 20000, lat: -6.9175, lng: 107.6191 },
    { key: 'semarang', name: 'Semarang', shippingCost: 30000, lat: -6.9667, lng: 110.4167 },
    { key: 'yogyakarta', name: 'Yogyakarta', shippingCost: 32000, lat: -7.7956, lng: 110.3695 },
    { key: 'surabaya', name: 'Surabaya', shippingCost: 35000, lat: -7.2575, lng: 112.7521 },
  ]);
}

module.exports = db;
