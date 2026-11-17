'use strict';
// tokoku. — single-page storefront.
// Cart id lives in localStorage; the cart itself is stored server-side
// (SQLite) and keyed by that id, so it survives reloads without a login.

const app = document.getElementById('app');
const searchInput = document.getElementById('search-input');
const cartBadge = document.getElementById('cart-badge');
const toastEl = document.getElementById('toast');

let cartId = localStorage.getItem('tokoku_cart_id');
if (!cartId) {
  cartId = (crypto.randomUUID ? crypto.randomUUID() : `cart-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  localStorage.setItem('tokoku_cart_id', cartId);
}

let state = { category: 'Semua', query: '', categories: [] };
let trackTimer = null;
let map = null;
let courierMarker = null;

function headers() {
  return { 'Content-Type': 'application/json', 'X-Cart-Id': cartId };
}

async function api(path, options = {}) {
  const res = await fetch(path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request gagal (${res.status})`);
  return data;
}

function rp(n) {
  return 'Rp' + Number(n).toLocaleString('id-ID');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtTime(ms) {
  return new Date(ms).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(ms) {
  return new Date(ms).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.add('hidden'), 2500);
}

function statusClass(status) {
  return 'status-' + status.replace(/ /g, '-');
}

async function refreshCartBadge() {
  try {
    const { count } = await api('/api/cart');
    cartBadge.textContent = count;
    cartBadge.classList.toggle('hidden', count === 0);
  } catch (e) {
    // Cart badge is best-effort; the cart page itself reports errors.
  }
}

// ---- Routing ----
function route() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path] = hash.split('?');
  stopTracking();
  if (path === '/' || path === '') return viewCatalog();
  if (path.startsWith('/product/')) return viewDetail(Number(path.split('/')[2]));
  if (path === '/cart') return viewCart();
  if (path === '/checkout') return viewCheckout();
  if (path.startsWith('/success/')) return viewSuccess(decodeURIComponent(path.split('/')[2]));
  if (path === '/orders') return viewOrders();
  if (path.startsWith('/track/')) return viewTracking(decodeURIComponent(path.split('/')[2]));
  return viewCatalog();
}

function go(path) {
  location.hash = '#' + path;
}

// ---- Catalog ----
async function viewCatalog() {
  app.innerHTML = '<p>Memuat katalog…</p>';
  try {
    const [{ products }, { categories }] = await Promise.all([
      api(`/api/products?q=${encodeURIComponent(state.query)}&category=${encodeURIComponent(state.category)}`),
      api('/api/categories'),
    ]);
    state.categories = categories;
    const chips = categories
      .map((c) => `<button class="chip ${c === state.category ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`)
      .join('');
    const cards = products.length
      ? products.map((p) => `
        <article class="card" data-product="${p.id}">
          <img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" loading="lazy" />
          <div class="card-body">
            <div class="card-name">${esc(p.name)}</div>
            <div class="card-meta">★ ${p.rating} · Terjual ${p.sold} · ${esc(p.category)}</div>
            <div><span class="price">${rp(p.price)}</span>${p.originalPrice ? `<span class="price-old">${rp(p.originalPrice)}</span>` : ''}</div>
            <div class="${p.stock <= 5 ? 'stock-low' : 'stock-ok'}">${p.stock > 0 ? `Stok: ${p.stock}` : 'Stok habis'}</div>
            <div class="card-actions">
              <button class="btn btn-block" data-add="${p.id}" ${p.stock === 0 ? 'disabled' : ''}>+ Keranjang</button>
            </div>
          </div>
        </article>`).join('')
      : '<div class="empty"><h2>Tidak ada produk</h2><p>Coba kata kunci atau kategori lain.</p></div>';
    app.innerHTML = `<div class="chips">${chips}</div><div class="grid">${cards}</div>`;

    app.querySelectorAll('[data-cat]').forEach((el) => {
      el.addEventListener('click', () => { state.category = el.dataset.cat; viewCatalog(); });
    });
    app.querySelectorAll('[data-add]').forEach((el) => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await api('/api/cart', { method: 'POST', body: JSON.stringify({ productId: Number(el.dataset.add), qty: 1 }) });
          await refreshCartBadge();
          showToast('Ditambahkan ke keranjang');
        } catch (err) {
          showToast(err.message);
        }
      });
    });
    app.querySelectorAll('[data-product]').forEach((el) => {
      el.addEventListener('click', () => go(`/product/${el.dataset.product}`));
    });
  } catch (err) {
    app.innerHTML = `<p class="error">Gagal memuat katalog: ${esc(err.message)}</p>`;
  }
}

// ---- Product detail ----
async function viewDetail(id) {
  app.innerHTML = '<p>Memuat produk…</p>';
  try {
    const { product: p } = await api(`/api/products/${id}`);
    let qty = 1;
    app.innerHTML = `
      <p><a href="#/" data-nav="/">← Kembali ke katalog</a></p>
      <div class="detail">
        <img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" />
        <div>
          <h1>${esc(p.name)}</h1>
          <div class="card-meta">★ ${p.rating} · Terjual ${p.sold} · ${esc(p.category)}</div>
          <div style="margin: 12px 0"><span class="price">${rp(p.price)}</span>${p.originalPrice ? `<span class="price-old">${rp(p.originalPrice)}</span>` : ''}</div>
          <p class="desc">${esc(p.description)}</p>
          <div class="${p.stock <= 5 ? 'stock-low' : 'stock-ok'}">${p.stock > 0 ? `Stok tersedia: ${p.stock}` : 'Stok habis'}</div>
          <div class="qty-row">
            <button class="qty-btn" id="qty-minus">−</button>
            <span class="qty-value" id="qty-value">1</span>
            <button class="qty-btn" id="qty-plus">+</button>
          </div>
          <button class="btn btn-block" id="add-btn" ${p.stock === 0 ? 'disabled' : ''}>+ Tambah ke Keranjang</button>
        </div>
      </div>`;
    const qtyEl = document.getElementById('qty-value');
    document.getElementById('qty-minus').addEventListener('click', () => { qty = Math.max(1, qty - 1); qtyEl.textContent = qty; });
    document.getElementById('qty-plus').addEventListener('click', () => { qty = Math.min(p.stock, qty + 1); qtyEl.textContent = qty; });
    document.getElementById('add-btn').addEventListener('click', async () => {
      try {
        await api('/api/cart', { method: 'POST', body: JSON.stringify({ productId: p.id, qty }) });
        await refreshCartBadge();
        showToast(`${qty} × ${p.name} ditambahkan`);
        go('/cart');
      } catch (err) {
        showToast(err.message);
      }
    });
  } catch (err) {
    app.innerHTML = `<p class="error">${esc(err.message)}</p><p><a href="#/">← Kembali ke katalog</a></p>`;
  }
}

// ---- Cart ----
async function viewCart() {
  app.innerHTML = '<p>Memuat keranjang…</p>';
  try {
    const cart = await api('/api/cart');
    if (cart.items.length === 0) {
      app.innerHTML = `<div class="empty"><h2>Keranjang masih kosong</h2><p>Yuk, cari produk dulu.</p><p><a class="btn" href="#/">Lihat Katalog</a></p></div>`;
      return;
    }
    const rows = cart.items.map((it) => `
      <div class="cart-item">
        <img src="${esc(it.imageUrl)}" alt="${esc(it.name)}" />
        <div class="cart-item-info">
          <div class="cart-item-name">${esc(it.name)}</div>
          <div class="cart-item-price">${rp(it.price)} / pcs · Stok ${it.stock}</div>
          <button class="remove-btn" data-remove="${it.productId}">Hapus</button>
        </div>
        <div class="qty-row" style="margin:0">
          <button class="qty-btn" data-dec="${it.productId}">−</button>
          <span class="qty-value">${it.qty}</span>
          <button class="qty-btn" data-inc="${it.productId}">+</button>
        </div>
        <div class="cart-item-total">${rp(it.price * it.qty)}</div>
      </div>`).join('');
    app.innerHTML = `
      <h1>Keranjang</h1>
      <div class="panel">${rows}</div>
      <div class="panel">
        <div class="summary-row"><span>Subtotal (${cart.count} barang)</span><span>${rp(cart.subtotal)}</span></div>
        <div class="summary-row"><span>Ongkir</span><span>dihitung saat checkout</span></div>
        <button class="btn btn-block" id="to-checkout" style="margin-top:12px">Lanjut ke Checkout</button>
      </div>`;

    const reload = () => viewCart();
    app.querySelectorAll('[data-inc]').forEach((el) => el.addEventListener('click', async () => {
      const it = cart.items.find((x) => x.productId === Number(el.dataset.inc));
      await api(`/api/cart/${it.productId}`, { method: 'PUT', body: JSON.stringify({ qty: it.qty + 1 }) });
      await refreshCartBadge(); reload();
    }));
    app.querySelectorAll('[data-dec]').forEach((el) => el.addEventListener('click', async () => {
      const it = cart.items.find((x) => x.productId === Number(el.dataset.dec));
      await api(`/api/cart/${it.productId}`, { method: 'PUT', body: JSON.stringify({ qty: it.qty - 1 }) });
      await refreshCartBadge(); reload();
    }));
    app.querySelectorAll('[data-remove]').forEach((el) => el.addEventListener('click', async () => {
      await api(`/api/cart/${el.dataset.remove}`, { method: 'DELETE' });
      await refreshCartBadge(); reload();
    }));
    document.getElementById('to-checkout').addEventListener('click', () => go('/checkout'));
  } catch (err) {
    app.innerHTML = `<p class="error">Gagal memuat keranjang: ${esc(err.message)}</p>`;
  }
}

// ---- Checkout ----
async function viewCheckout() {
  app.innerHTML = '<p>Memuat checkout…</p>';
  try {
    const [cart, { destinations }, { paymentMethods }] = await Promise.all([
      api('/api/cart'),
      api('/api/destinations'),
      api('/api/payment-methods'),
    ]);
    if (cart.items.length === 0) {
      app.innerHTML = `<div class="empty"><h2>Keranjang masih kosong</h2><p><a class="btn" href="#/">Lihat Katalog</a></p></div>`;
      return;
    }
    const cityOptions = destinations.map((d) => `<option value="${d.key}">${esc(d.name)} — ${rp(d.shippingCost)}</option>`).join('');
    const payOptions = paymentMethods.map((m, i) => `
      <label class="radio-option"><input type="radio" name="payment" value="${m.key}" ${i === 0 ? 'checked' : ''} /> ${esc(m.name)}</label>`).join('');
    const itemsHtml = cart.items.map((it) => `<div class="summary-row"><span>${esc(it.name)} × ${it.qty}</span><span>${rp(it.price * it.qty)}</span></div>`).join('');

    app.innerHTML = `
      <h1>Checkout</h1>
      <div class="panel">
        <div class="field"><label for="f-name">Nama penerima</label><input id="f-name" type="text" placeholder="Nama lengkap" /></div>
        <div class="field"><label for="f-phone">Nomor telepon</label><input id="f-phone" type="tel" placeholder="08xxxxxxxxxx" /></div>
        <div class="field"><label for="f-address">Alamat lengkap</label><textarea id="f-address" placeholder="Jalan, nomor rumah, RT/RW, kelurahan, kecamatan"></textarea></div>
        <div class="field"><label for="f-city">Kota tujuan</label><select id="f-city">${cityOptions}</select></div>
        <div class="field"><label>Metode pembayaran <span style="color:var(--muted);font-weight:400">(simulasi — tidak ada pembayaran nyata)</span></label>
          <div class="radio-group">${payOptions}</div>
        </div>
      </div>
      <div class="panel">
        <h3 style="margin-top:0">Ringkasan pesanan</h3>
        ${itemsHtml}
        <div class="summary-row"><span>Subtotal</span><span>${rp(cart.subtotal)}</span></div>
        <div class="summary-row"><span>Ongkir (<span id="ship-city">${esc(destinations[0].name)}</span>)</span><span id="ship-cost">${rp(destinations[0].shippingCost)}</span></div>
        <div class="summary-row total"><span>Total</span><span id="grand-total">${rp(cart.subtotal + destinations[0].shippingCost)}</span></div>
        <p id="checkout-error" class="error hidden"></p>
        <button class="btn btn-block" id="place-order" style="margin-top:12px">Buat Pesanan</button>
      </div>`;

    const citySel = document.getElementById('f-city');
    const updateTotals = () => {
      const d = destinations.find((x) => x.key === citySel.value);
      document.getElementById('ship-city').textContent = d.name;
      document.getElementById('ship-cost').textContent = rp(d.shippingCost);
      document.getElementById('grand-total').textContent = rp(cart.subtotal + d.shippingCost);
    };
    citySel.addEventListener('change', updateTotals);

    document.getElementById('place-order').addEventListener('click', async (e) => {
      const errEl = document.getElementById('checkout-error');
      errEl.classList.add('hidden');
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Memproses…';
      try {
        const { code } = await api('/api/orders', {
          method: 'POST',
          body: JSON.stringify({
            name: document.getElementById('f-name').value.trim(),
            phone: document.getElementById('f-phone').value.trim(),
            address: document.getElementById('f-address').value.trim(),
            city: citySel.value,
            paymentMethod: document.querySelector('input[name="payment"]:checked').value,
          }),
        });
        await refreshCartBadge();
        go(`/success/${code}`);
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Buat Pesanan';
      }
    });
  } catch (err) {
    app.innerHTML = `<p class="error">Gagal memuat checkout: ${esc(err.message)}</p>`;
  }
}

// ---- Order success ----
function viewSuccess(code) {
  app.innerHTML = `
    <div class="panel success">
      <h1>Pesanan berhasil dibuat!</h1>
      <p>Simpan kode pesananmu untuk melacak pengiriman.</p>
      <div class="order-code-big">${esc(code)}</div>
      <p>
        <a class="btn" href="#/track/${encodeURIComponent(code)}">Lacak Pengiriman</a>
        <a class="btn btn-outline" href="#/orders">Pesanan Saya</a>
      </p>
    </div>`;
}

// ---- Orders list ----
async function viewOrders() {
  app.innerHTML = '<p>Memuat pesanan…</p>';
  try {
    const { orders } = await api('/api/orders');
    if (orders.length === 0) {
      app.innerHTML = `<div class="empty"><h2>Belum ada pesanan</h2><p><a class="btn" href="#/">Mulai Belanja</a></p></div>`;
      return;
    }
    app.innerHTML = `<h1>Pesanan Saya</h1>` + orders.map((o) => `
      <div class="order-card">
        <div class="order-head">
          <span class="order-code">${esc(o.code)}</span>
          <span class="status-badge ${statusClass(o.status)}">${esc(o.status)} · ${o.progressPct}%</span>
        </div>
        <div class="order-date">${fmtDate(o.createdAt)} · ${esc(o.cityName)}</div>
        <div class="order-foot">
          <strong>Total: ${rp(o.total)}</strong>
          <a class="btn btn-outline" href="#/track/${encodeURIComponent(o.code)}">Lacak Pengiriman</a>
        </div>
      </div>`).join('');
  } catch (err) {
    app.innerHTML = `<p class="error">Gagal memuat pesanan: ${esc(err.message)}</p>`;
  }
}

// ---- Tracking ----
function stopTracking() {
  if (trackTimer) { clearInterval(trackTimer); trackTimer = null; }
  if (map) { map.remove(); map = null; courierMarker = null; }
}

async function viewTracking(code) {
  app.innerHTML = '<p>Memuat pelacakan…</p>';
  const render = async () => {
    try {
      const { order, tracking } = await api(`/api/orders/${encodeURIComponent(code)}`);
      const t = tracking;
      const itemsHtml = order.items.map((it) => `${esc(it.name)} × ${it.qty}`).join(', ');
      const timelineHtml = t.timeline.map((ev) => `
        <li class="${ev.done ? 'done' : 'pending'}">
          <span class="dot"></span>
          <span>${esc(ev.label)}</span>
          <span class="time">${ev.done ? fmtTime(ev.at) : 'menunggu'}</span>
        </li>`).join('');

      if (!map) {
        app.innerHTML = `
          <p><a href="#/orders">← Pesanan Saya</a></p>
          <span class="sim-badge">SIMULASI DEMO — posisi kurir disimulasikan, bukan GPS sungguhan</span>
          <h1 style="margin-top:0">Lacak Pengiriman</h1>
          <div class="panel">
            <div class="order-head">
              <span class="order-code">${esc(order.code)}</span>
              <span class="status-badge ${statusClass(t.status)}" id="track-status">${esc(t.status)}</span>
            </div>
            <div class="order-date">${fmtDate(order.createdAt)} · ${esc(itemsHtml)}</div>
            <div class="progress-wrap">
              <div class="progress-bar"><div class="progress-fill" id="track-progress" style="width:${t.progressPct}%"></div></div>
            </div>
            <div class="stats">
              <div class="stat"><div class="stat-value" id="stat-progress">${t.progressPct}%</div><div class="stat-label">Perjalanan</div></div>
              <div class="stat"><div class="stat-value" id="stat-remaining">${t.remainingKm} km</div><div class="stat-label">Sisa jarak</div></div>
              <div class="stat"><div class="stat-value" id="stat-eta">${fmtTime(t.etaMs)}</div><div class="stat-label">Estimasi tiba</div></div>
            </div>
            <div id="map"></div>
            <p style="color:var(--muted);font-size:13px">Rute: ${esc(t.warehouse.name)} → ${esc(t.destination.name)} · total ${t.totalKm} km · perjalanan sekitar 20 menit (simulasi)</p>
          </div>
          <div class="panel">
            <h3 style="margin-top:0">Riwayat perjalanan</h3>
            <ul class="timeline" id="track-timeline">${timelineHtml}</ul>
          </div>`;

        map = L.map('map');
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);
        const routeLatLngs = t.route.map((p) => [p.lat, p.lng]);
        L.polyline(routeLatLngs, { color: '#16a34a', weight: 4 }).addTo(map);
        L.marker([t.warehouse.lat, t.warehouse.lng]).addTo(map).bindPopup('📦 ' + t.warehouse.name);
        L.marker([t.destination.lat, t.destination.lng]).addTo(map).bindPopup('🏠 ' + t.destination.name);
        courierMarker = L.marker([t.courier.lat, t.courier.lng]).addTo(map).bindPopup('🛵 Kurir (simulasi)');
        map.fitBounds(L.latLngBounds(routeLatLngs).pad(0.15));
      } else {
        // Live update: move the courier and refresh the numbers.
        courierMarker.setLatLng([t.courier.lat, t.courier.lng]);
        document.getElementById('track-status').textContent = t.status;
        document.getElementById('track-status').className = 'status-badge ' + statusClass(t.status);
        document.getElementById('track-progress').style.width = t.progressPct + '%';
        document.getElementById('stat-progress').textContent = t.progressPct + '%';
        document.getElementById('stat-remaining').textContent = t.remainingKm + ' km';
        document.getElementById('stat-eta').textContent = fmtTime(t.etaMs);
        document.getElementById('track-timeline').innerHTML = timelineHtml;
      }
      if (t.status === 'Terkirim') stopTracking();
    } catch (err) {
      stopTracking();
      app.innerHTML = `<p class="error">${esc(err.message)}</p><p><a href="#/orders">← Pesanan Saya</a></p>`;
    }
  };
  await render();
  if (map) trackTimer = setInterval(render, 5000);
}

// ---- Search ----
let searchTimer = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = searchInput.value.trim();
    if (location.hash === '' || location.hash === '#/' || location.hash.startsWith('#/?')) {
      viewCatalog();
    } else {
      go('/');
    }
  }, 300);
});

window.addEventListener('hashchange', route);
refreshCartBadge();
route();
