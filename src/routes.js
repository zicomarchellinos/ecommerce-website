'use strict';
// tokoku. API routes: catalog, cart (server-side, SQLite), checkout, orders,
// and simulated GPS tracking.

const express = require('express');
const crypto = require('crypto');
const db = require('./db');
const { computeTracking } = require('./tracking');

const router = express.Router();

const PAYMENT_METHODS = [
  { key: 'transfer', name: 'Transfer Bank' },
  { key: 'ewallet', name: 'E-Wallet (GoPay / OVO / DANA)' },
  { key: 'card', name: 'Kartu Kredit / Debit' },
  { key: 'cod', name: 'COD (Bayar di Tempat)' },
];

function mapProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    description: row.description,
    price: row.price,
    originalPrice: row.original_price,
    stock: row.stock,
    rating: row.rating,
    sold: row.sold,
    imageUrl: row.image_url,
  };
}

function mapDestination(row) {
  return {
    key: row.key,
    name: row.name,
    shippingCost: row.shipping_cost,
    lat: row.lat,
    lng: row.lng,
  };
}

// The cart id comes from the client (a UUID kept in localStorage) so the
// cart survives reloads without any login.
function cartId(req) {
  const id = String(req.get('X-Cart-Id') || '').trim();
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return null;
  return id;
}

function getCartItems(cid) {
  return db
    .prepare(
      `SELECT ci.product_id AS productId, ci.qty, p.name, p.price, p.original_price AS originalPrice,
              p.stock, p.image_url AS imageUrl, p.category
       FROM cart_items ci JOIN products p ON p.id = ci.product_id
       WHERE ci.cart_id = ? ORDER BY ci.rowid`
    )
    .all(cid);
}

function cartResponse(cid) {
  const items = getCartItems(cid);
  const subtotal = items.reduce((sum, it) => sum + it.price * it.qty, 0);
  const count = items.reduce((sum, it) => sum + it.qty, 0);
  return { items, subtotal, count };
}

// ---- Catalog ----
router.get('/products', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const category = String(req.query.category || '').trim();
  let rows = db.prepare('SELECT * FROM products ORDER BY id').all().map(mapProduct);
  if (category && category !== 'Semua') rows = rows.filter((p) => p.category === category);
  if (q) {
    rows = rows.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }
  res.json({ products: rows });
});

router.get('/products/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Produk tidak ditemukan.' });
  res.json({ product: mapProduct(row) });
});

router.get('/categories', (req, res) => {
  const rows = db.prepare('SELECT DISTINCT category FROM products ORDER BY category').all();
  res.json({ categories: ['Semua', ...rows.map((r) => r.category)] });
});

router.get('/destinations', (req, res) => {
  const rows = db.prepare('SELECT * FROM destinations ORDER BY shipping_cost').all();
  res.json({ destinations: rows.map(mapDestination) });
});

router.get('/payment-methods', (req, res) => {
  res.json({ paymentMethods: PAYMENT_METHODS });
});

// ---- Cart (server-side) ----
router.get('/cart', (req, res) => {
  const cid = cartId(req);
  if (!cid) return res.json({ items: [], subtotal: 0, count: 0 });
  res.json(cartResponse(cid));
});

router.post('/cart', (req, res) => {
  const cid = cartId(req);
  if (!cid) return res.status(400).json({ error: 'Cart id tidak valid.' });
  const productId = Number(req.body.productId);
  const qty = Math.max(1, Math.min(99, Number(req.body.qty) || 1));
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan.' });
  const existing = db
    .prepare('SELECT qty FROM cart_items WHERE cart_id = ? AND product_id = ?')
    .get(cid, productId);
  const nextQty = Math.min(product.stock, (existing ? existing.qty : 0) + qty);
  if (nextQty <= 0) return res.status(400).json({ error: 'Stok produk habis.' });
  db.prepare(
    `INSERT INTO cart_items (cart_id, product_id, qty) VALUES (?, ?, ?)
     ON CONFLICT(cart_id, product_id) DO UPDATE SET qty = excluded.qty`
  ).run(cid, productId, nextQty);
  res.json(cartResponse(cid));
});

router.put('/cart/:productId', (req, res) => {
  const cid = cartId(req);
  if (!cid) return res.status(400).json({ error: 'Cart id tidak valid.' });
  const productId = Number(req.params.productId);
  const qty = Number(req.body.qty);
  if (!Number.isInteger(qty) || qty < 0) return res.status(400).json({ error: 'Jumlah tidak valid.' });
  if (qty === 0) {
    db.prepare('DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?').run(cid, productId);
    return res.json(cartResponse(cid));
  }
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan.' });
  const clamped = Math.min(product.stock, qty);
  db.prepare('UPDATE cart_items SET qty = ? WHERE cart_id = ? AND product_id = ?').run(clamped, cid, productId);
  res.json(cartResponse(cid));
});

router.delete('/cart/:productId', (req, res) => {
  const cid = cartId(req);
  if (!cid) return res.status(400).json({ error: 'Cart id tidak valid.' });
  db.prepare('DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?').run(cid, req.params.productId);
  res.json(cartResponse(cid));
});

// ---- Checkout ----
function generateOrderCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1 — easier to read aloud
  let suffix = '';
  const bytes = crypto.randomBytes(10);
  for (const b of bytes) suffix += chars[b % chars.length];
  return `TKS-${suffix}`;
}

router.post('/orders', (req, res) => {
  const cid = cartId(req);
  if (!cid) return res.status(400).json({ error: 'Cart id tidak valid.' });

  const name = String(req.body.name || '').trim();
  const phone = String(req.body.phone || '').trim();
  const address = String(req.body.address || '').trim();
  const cityKey = String(req.body.city || '').trim();
  const paymentMethod = String(req.body.paymentMethod || '').trim();

  if (!name) return res.status(400).json({ error: 'Nama wajib diisi.' });
  if (!phone) return res.status(400).json({ error: 'Nomor telepon wajib diisi.' });
  if (!address) return res.status(400).json({ error: 'Alamat wajib diisi.' });
  const dest = db.prepare('SELECT * FROM destinations WHERE key = ?').get(cityKey);
  if (!dest) return res.status(400).json({ error: 'Kota tujuan tidak valid.' });
  if (!PAYMENT_METHODS.some((m) => m.key === paymentMethod)) {
    return res.status(400).json({ error: 'Metode pembayaran tidak valid.' });
  }

  const items = getCartItems(cid);
  if (items.length === 0) return res.status(400).json({ error: 'Keranjang masih kosong.' });

  // Validate stock inside a transaction, then decrement stock, insert the
  // order + items, and clear the cart — atomically.
  const createOrder = db.transaction(() => {
    for (const it of items) {
      const p = db.prepare('SELECT stock FROM products WHERE id = ?').get(it.productId);
      if (!p || p.stock < it.qty) {
        const err = new Error(`Stok "${it.name}" tidak mencukupi.`);
        err.status = 400;
        throw err;
      }
    }
    const subtotal = items.reduce((sum, it) => sum + it.price * it.qty, 0);
    const shippingCost = dest.shipping_cost;
    const total = subtotal + shippingCost;
    const code = generateOrderCode();
    const createdAt = Date.now();
    const info = db
      .prepare(
        `INSERT INTO orders (code, customer_name, phone, address, city_key, city_name, payment_method,
                             subtotal, shipping_cost, total, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(code, name, phone, address, dest.key, dest.name, paymentMethod, subtotal, shippingCost, total, createdAt);
    const insertItem = db.prepare(
      'INSERT INTO order_items (order_id, product_id, name, price, qty, image_url) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const decStock = db.prepare('UPDATE products SET stock = stock - ?, sold = sold + ? WHERE id = ?');
    for (const it of items) {
      insertItem.run(info.lastInsertRowid, it.productId, it.name, it.price, it.qty, it.imageUrl);
      decStock.run(it.qty, it.qty, it.productId);
    }
    db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cid);
    return { code, total };
  });

  try {
    const { code, total } = createOrder();
    res.status(201).json({ code, total });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Gagal membuat pesanan.' });
  }
});

// ---- Orders + tracking ----
function mapOrder(row) {
  return {
    id: row.id,
    code: row.code,
    customerName: row.customer_name,
    phone: row.phone,
    address: row.address,
    cityKey: row.city_key,
    cityName: row.city_name,
    paymentMethod: row.payment_method,
    subtotal: row.subtotal,
    shippingCost: row.shipping_cost,
    total: row.total,
    createdAt: row.created_at,
  };
}

router.get('/orders', (req, res) => {
  const rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  const orders = rows.map((row) => {
    const dest = db.prepare('SELECT * FROM destinations WHERE key = ?').get(row.city_key);
    const tracking = computeTracking(row, dest);
    return { ...mapOrder(row), status: tracking.status, progressPct: tracking.progressPct };
  });
  res.json({ orders });
});

router.get('/orders/:code', (req, res) => {
  const row = db.prepare('SELECT * FROM orders WHERE code = ?').get(req.params.code);
  if (!row) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  const dest = db.prepare('SELECT * FROM destinations WHERE key = ?').get(row.city_key);
  const items = db
    .prepare('SELECT product_id AS productId, name, price, qty, image_url AS imageUrl FROM order_items WHERE order_id = ?')
    .all(row.id);
  const payment = PAYMENT_METHODS.find((m) => m.key === row.payment_method);
  res.json({
    order: { ...mapOrder(row), paymentMethodName: payment ? payment.name : row.payment_method, items },
    tracking: computeTracking(row, dest),
  });
});

module.exports = router;
