'use strict';
// Simulated GPS shipment tracking for tokoku.
//
// DEMO SIMULATION: there is no real courier. After an order is placed, the
// package is "packed" for 2 minutes, then "travels" for 18 minutes along a
// curved route from the Jakarta warehouse to the destination city, for a
// total trip of about 20 minutes. Status, courier position, progress,
// remaining distance, ETA, and timeline are all derived from the order's
// created_at timestamp, so any client polling the order sees live movement.

// Gudang tokoku. — Jakarta Pusat.
const WAREHOUSE = { lat: -6.2088, lng: 106.8456, name: 'Gudang Jakarta' };

const PACK_MINUTES = 2; // Dikemas
const TRIP_MINUTES = 20; // total trip, packing included
const ROUTE_POINTS = 24;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

// Great-circle distance in km.
function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Build a gently curved route (straight interpolation plus a perpendicular
// sine bow, so the polyline looks like a road route rather than a ruler line).
function buildRoute(dest) {
  const points = [];
  const dx = dest.lng - WAREHOUSE.lng;
  const dy = dest.lat - WAREHOUSE.lat;
  const len = Math.hypot(dx, dy) || 1;
  // Perpendicular unit vector, bow amplitude ~6% of the route length.
  const px = -dy / len;
  const py = dx / len;
  const amp = 0.06 * len;
  for (let i = 0; i <= ROUTE_POINTS; i++) {
    const t = i / ROUTE_POINTS;
    const bow = Math.sin(t * Math.PI) * amp;
    points.push({
      lat: WAREHOUSE.lat + dy * t + py * bow,
      lng: WAREHOUSE.lng + dx * t + px * bow,
    });
  }
  return points;
}

function pointAt(route, t) {
  const clamped = Math.min(1, Math.max(0, t));
  const pos = clamped * (route.length - 1);
  const i = Math.floor(pos);
  const f = pos - i;
  const a = route[i];
  const b = route[Math.min(route.length - 1, i + 1)];
  return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
}

function routeLengthKm(route) {
  let total = 0;
  for (let i = 1; i < route.length; i++) total += haversineKm(route[i - 1], route[i]);
  return total;
}

// order: { created_at (ms), city_name, ... }; dest: { lat, lng, name }
function computeTracking(order, dest, nowMs = Date.now()) {
  const createdAt = order.created_at;
  const elapsedMin = (nowMs - createdAt) / 60000;
  const route = buildRoute(dest);
  const totalKm = routeLengthKm(route);

  let status;
  let progress; // 0..1 of the whole trip (packing counts as 0%)
  if (elapsedMin < PACK_MINUTES) {
    status = 'Dikemas';
    progress = 0;
  } else if (elapsedMin < TRIP_MINUTES) {
    status = 'Dalam perjalanan';
    progress = (elapsedMin - PACK_MINUTES) / (TRIP_MINUTES - PACK_MINUTES);
  } else {
    status = 'Terkirim';
    progress = 1;
  }

  const courier = pointAt(route, progress);
  const remainingKm = totalKm * (1 - progress);
  const etaMs = createdAt + TRIP_MINUTES * 60000;

  const minutesAgo = (m) => createdAt + m * 60000;
  const timeline = [
    { label: 'Pesanan dibuat', at: minutesAgo(0), done: true },
    { label: 'Pesanan dikemas di gudang', at: minutesAgo(PACK_MINUTES), done: elapsedMin >= PACK_MINUTES },
    { label: 'Kurir berangkat dari gudang', at: minutesAgo(PACK_MINUTES), done: elapsedMin >= PACK_MINUTES },
    { label: 'Kurir dalam perjalanan', at: minutesAgo(PACK_MINUTES + (TRIP_MINUTES - PACK_MINUTES) / 2), done: progress >= 0.5 },
    { label: 'Pesanan tiba di tujuan', at: minutesAgo(TRIP_MINUTES), done: status === 'Terkirim' },
  ];

  return {
    simulation: true,
    status,
    progressPct: Math.round(progress * 100),
    totalKm: Math.round(totalKm * 10) / 10,
    remainingKm: Math.round(remainingKm * 10) / 10,
    etaMs,
    courier,
    warehouse: WAREHOUSE,
    destination: { lat: dest.lat, lng: dest.lng, name: dest.name },
    route,
    timeline,
  };
}

module.exports = { WAREHOUSE, computeTracking, haversineKm };
