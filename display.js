// VIS live crowd: the display. Runs fullscreen on the laptop whose HDMI goes to AVT's picture-in-picture.
// It draws the seat map from the positions the balcony phone sends, and nothing else: no data, empty seats.
import { peerIdFor, store } from './shared.js?v=10';

const params = new URLSearchParams(location.search);
const CODE = params.get('code') || store.get('vis_code', 'vis');
const LIVE_TIMEOUT = 3;   // seconds without positions before the fallback takes over

const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const INK = '#121110', LAV = '#C29AF6', RGB_IVORY = [244, 242, 236];
const P = { x: 0, y: 0, w: 1920, h: 1080 };

function bez(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t, sy = t => ((ay * t + by) * t + cy) * t;
  return x => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1, t = x; for (let i = 0; i < 24; i++) { const v = sx(t); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; } return sy(t); };
}
const OUT = bez(0.12, 1, 0.2, 1), c01 = v => Math.max(0, Math.min(1, v));
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
let clock = 0;

// ---------------------------------------------------------------- the room
const crowd = (() => {
  // units of the venue's seating layout (stage at the top)
  const VIEW = { x0: 175, y0: 140, x1: 625, y1: 390 };
  const FLOOR = { x0: 70, y0: 135, x1: 690, y1: 385 };
  const SEAT_W = 11, SEAT_H = 9;
  const SEATS = [];
  for (const bx of [228, 425]) for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) SEATS.push({ x: bx + c * 16.2, y: 173 + r * 14.3, r, c: c + (bx > 300 ? 10 : 0), taken: false });
  // the calibration chairs (seat centers at the four outer corners of the seating)
  const CAL = { x0: 228, y0: 173, x1: 425 + 9 * 16.2, y1: 173 + 9 * 14.3 };
  const VW = VIEW.x1 - VIEW.x0, VH = VIEW.y1 - VIEW.y0;
  const PS = Math.min((P.w - 140) / VW, (P.h - 140) / VH), PX = P.x + (P.w - VW * PS) / 2 - VIEW.x0 * PS, PY = P.y + (P.h - VH * PS) / 2 - VIEW.y0 * PS;
  const toPx = (a, b) => [PX + a * PS, PY + b * PS];

  const FW = VW / 2, FH = VH / 2, base = new Float32Array(FW * FH), heat = new Float32Array(FW * FH), target = new Float32Array(FW * FH);
  const fillRect = (f, x0, y0, x1, y1, v) => { for (let j = Math.max(0, Math.floor((y0 - VIEW.y0) / 2)); j < Math.min(FH, Math.ceil((y1 - VIEW.y0) / 2)); j++) for (let i = Math.max(0, Math.floor((x0 - VIEW.x0) / 2)); i < Math.min(FW, Math.ceil((x1 - VIEW.x0) / 2)); i++) f[j * FW + i] = Math.max(f[j * FW + i], v); };
  fillRect(base, FLOOR.x0, FLOOR.y0, FLOOR.x1, FLOOR.y1, 0.09);
  for (const s of SEATS) fillRect(base, s.x - SEAT_W / 2, s.y - SEAT_H / 2, s.x + SEAT_W / 2, s.y + SEAT_H / 2, 0.24);
  function splat(a, b, w, R) {
    const x = (a - VIEW.x0) / 2, y = (b - VIEW.y0) / 2, r = R / 2, r2 = 1 / (2 * r * r);
    const x0 = Math.max(0, Math.floor(x - 2.6 * r)), x1 = Math.min(FW - 1, Math.ceil(x + 2.6 * r)), y0 = Math.max(0, Math.floor(y - 2.6 * r)), y1 = Math.min(FH - 1, Math.ceil(y + 2.6 * r));
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) { const dx = i + 0.5 - x, dy = j + 0.5 - y; target[j * FW + i] += w * Math.exp(-(dx * dx + dy * dy) * r2); }
  }

  const TRAIL = 64, TRAIL_DT = 0.05; // about three seconds of path behind each walker
  let people = [];
  let mode = 'waiting', lastLive = -99;
  // Walking is judged by real distance over time, never by frame-to-frame speed: detection boxes jitter (chair backs,
  // partial views), and from a side view a few pixels can be a big jump on the floor. Someone counts as walking once
  // their smoothed position has travelled about a seat's width within WALK_WINDOW, and stops once it settles.
  // Units: layout units, where one seat is about 16 wide (about half a metre).
  const WALK_WINDOW = 1.0, WALK_START = 13, WALK_STOP = 6, SMOOTH_TAU = 0.35;
  function track(p, dt) {
    if ((p.ht += dt) >= TRAIL_DT) { p.ht = 0; p.hist.unshift([p.a, p.b]); if (p.hist.length > TRAIL) p.hist.pop(); }
    p.trace.push([clock, p.a, p.b]); while (p.trace.length > 2 && clock - p.trace[1][0] > WALK_WINDOW) p.trace.shift();
    const [, a0, b0] = p.trace[0], travelled = Math.hypot(p.a - a0, p.b - b0);
    if (!p.walking && travelled > WALK_START) p.walking = true;
    else if (p.walking && travelled < WALK_STOP) p.walking = false;
    const moving = p.walking;
    p.moveK += ((moving ? 1 : 0) - p.moveK) * Math.min(1, dt * 3);
    if (!moving) p.hist.splice(-2, 2);
  }

  // ---- live only: positions arrive in calibration units (the unit square spanned by the four corner chairs).
  // There is no simulation: with no data the room shows empty seats, so the wall can't look live when it isn't.
  function ingest(list) {
    lastLive = clock; mode = 'live';
    const byId = new Map(people.map(p => [p.id, p]));
    for (const [id, u, v] of list) {
      const a = CAL.x0 + u * (CAL.x1 - CAL.x0), b = CAL.y0 + v * (CAL.y1 - CAL.y0);
      if (a < FLOOR.x0 - 20 || a > FLOOR.x1 + 20 || b < FLOOR.y0 - 20 || b > FLOOR.y1 + 20) continue;
      let p = byId.get(id);
      // new tracks start seated; they only turn lavender once they actually travel
      if (!p) { p = { id, a, b, ta: a, tb: b, hist: [], ht: 0, moveK: 0, speed: 0, trace: [], walking: false }; people.push(p); byId.set(id, p); }
      p.ta = a; p.tb = b; p.seen = clock;
    }
  }
  function step(dt) {
    target.fill(0);
    // the feed went quiet: the room empties and the seats cool back to grey
    if (mode === 'live' && clock - lastLive > LIVE_TIMEOUT) { mode = 'lost'; people = []; }
    for (let i = people.length - 1; i >= 0; i--) {
      const p = people[i];
      // someone drops out when newer positions keep arriving without them
      if (lastLive - p.seen > 1.5) { people.splice(i, 1); continue; }
      // positions arrive a few times a second: ease toward each one (about a third of a second), which smooths both
      // the walkers' paths and the jitter of people sitting still
      const k = 1 - Math.exp(-dt / SMOOTH_TAU);
      p.a += (p.ta - p.a) * k; p.b += (p.tb - p.b) * k;
      track(p, dt);
    }
    for (const p of people) splat(p.a, p.b, 1.1 - 0.85 * p.moveK, 5.5);
    const k = Math.min(1, dt * 2.5);
    for (let i = 0; i < heat.length; i++) heat[i] += (target[i] - heat[i]) * k;
  }

  function sample(c) {
    const cols = Math.ceil(P.w / c), rows = Math.ceil(P.h / c), bits = new Uint8Array(cols * rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const a = (P.x + (x + 0.5) * c - PX) / PS, b = (P.y + (y + 0.5) * c - PY) / PS;
      if (a < VIEW.x0 || a >= VIEW.x1 || b < VIEW.y0 || b >= VIEW.y1) continue;
      const n = Math.max(1, Math.round(c / PS / 2)), i0 = Math.floor((a - VIEW.x0) / 2 - n / 2), j0 = Math.floor((b - VIEW.y0) / 2 - n / 2);
      let sb = 0, sh = 0, cnt = 0;
      for (let j = j0; j < j0 + n; j++) for (let i = i0; i < i0 + n; i++) { if (i < 0 || j < 0 || i >= FW || j >= FH) continue; sb += base[j * FW + i]; sh += heat[j * FW + i]; cnt++; }
      if (!cnt) continue;
      const l = Math.min(1, sb / cnt + (1 - Math.exp(-2.2 * sh / cnt)));
      const val = Math.pow(l, 1.35) * 0.92;
      bits[y * cols + x] = val > (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 ? 1 : 0;
    }
    return { c, cols, rows, bits };
  }
  // walkers sit in the same pixel grid as the field; each trail thins out through the Bayer pattern toward its end
  function drawDots(c2d, color, c) {
    const g = c >= 6 ? Math.max(1, Math.round(c * 0.16)) : 0, cells = new Map();
    const put = (x, y, v) => { const i = Math.floor((x - P.x) / c), j = Math.floor((y - P.y) / c), k = j * 4096 + i; if (v > (cells.get(k) || 0)) cells.set(k, v); };
    for (const p of people) {
      if (p.moveK < 0.02 && !p.hist.length) continue;
      let prev = toPx(p.a, p.b);
      if (p.moveK > 0.3) put(prev[0], prev[1], 1.2);
      p.hist.forEach(([a, b], i) => {
        const q = toPx(a, b), steps = Math.max(1, Math.ceil(Math.hypot(q[0] - prev[0], q[1] - prev[1]) / (c * 0.5)));
        for (let k = 1; k <= steps; k++) { const t = (i + k / steps) / TRAIL; put(prev[0] + (q[0] - prev[0]) * k / steps, prev[1] + (q[1] - prev[1]) * k / steps, Math.pow(1 - t, 1.3)); }
        prev = q;
      });
    }
    c2d.fillStyle = color;
    for (const [k, v] of cells) {
      const j = Math.floor(k / 4096), i = k - j * 4096;
      if (v <= (BAYER[(j & 3) * 4 + (i & 3)] + 0.5) / 16) continue;
      c2d.fillRect(P.x + i * c + g, P.y + j * c + g, c - g, c - g);
    }
  }
  function reset() { people = []; heat.fill(0); }
  return { _people: () => { const w = people.filter(p => p.walking).map(p => p.id); return { total: people.length, walking: w }; }, step, sample, drawDots, ingest, reset, get count() { return people.length; }, get mode() { return mode; }, get lastLive() { return lastLive; } };
})();

// ---------------------------------------------------------------- picture: sharpens as the room fills
const LEVELS = [26, 21, 17, 13, 10, 8], EXPECTED = 200, STEP_DUR = 1.1;
let cell = 26, cellPrev = 26, cellT0 = -9, frame = null;
const dCv = document.createElement('canvas'), dCtx = dCv.getContext('2d');
function render() {
  const want = LEVELS[Math.min(LEVELS.length - 1, Math.floor(crowd.count / EXPECTED * LEVELS.length))];
  if (want !== cell) { cellPrev = cell; cell = want; cellT0 = clock; }
  const p = OUT(c01((clock - cellT0) / STEP_DUR));
  frame = crowd.sample(p < 1 ? Math.round(cellPrev + (cell - cellPrev) * p) : cell);
  ctx.fillStyle = INK; ctx.fillRect(0, 0, P.w, P.h);
  if (dCv.width !== frame.cols || dCv.height !== frame.rows) { dCv.width = frame.cols; dCv.height = frame.rows; }
  const img = dCtx.createImageData(frame.cols, frame.rows), o = img.data;
  for (let i = 0; i < frame.bits.length; i++) if (frame.bits[i]) { o[i * 4] = RGB_IVORY[0]; o[i * 4 + 1] = RGB_IVORY[1]; o[i * 4 + 2] = RGB_IVORY[2]; o[i * 4 + 3] = 255; }
  dCtx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(dCv, 0, 0, frame.cols * frame.c, frame.rows * frame.c);
  if (frame.c >= 6) {
    const g = Math.max(1, Math.round(frame.c * 0.16)); ctx.fillStyle = INK;
    for (let x = 0; x < P.w; x += frame.c) ctx.fillRect(x, 0, g, P.h);
    for (let y = 0; y < P.h; y += frame.c) ctx.fillRect(0, y, P.w, g);
  }
  crowd.drawDots(ctx, LAV, frame.c);
}

// ---------------------------------------------------------------- link to the phone
const statusEl = document.getElementById('status');
let peer = null, peerState = 'starting', cameras = new Set(), camInfo = {};
function startPeer() {
  peer = new Peer(peerIdFor(CODE), { debug: 1 });
  peer.on('open', () => { peerState = 'waiting for camera'; });
  peer.on('connection', conn => {
    conn.on('open', () => { cameras.add(conn); peerState = 'camera connected'; });
    conn.on('data', msg => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'people' && Array.isArray(msg.p)) crowd.ingest(msg.p);
      if (msg.type === 'hello' || msg.type === 'hb') camInfo = { ...camInfo, ...msg, at: clock };
    });
    conn.on('close', () => { cameras.delete(conn); if (!cameras.size) peerState = 'waiting for camera'; });
    conn.on('error', () => { cameras.delete(conn); });
  });
  peer.on('disconnected', () => { peerState = 'signal lost, reconnecting'; setTimeout(() => { try { peer.reconnect(); } catch {} }, 1500); });
  peer.on('error', err => {
    peerState = `error: ${err.type || err.message}`;
    // another display already holds this code, or the signaling server dropped us: retry
    if (['unavailable-id', 'network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
      setTimeout(() => { try { peer.destroy(); } catch {} startPeer(); }, 3000);
    }
  });
}
startPeer();

function updateStatus() {
  if (statusEl.hidden) return;
  const age = clock - crowd.lastLive;
  statusEl.innerHTML = [
    `code      <b>${CODE}</b>`,
    `link      ${peerState}`,
    `source    ${crowd.mode === 'live' ? '<b>live</b>' : crowd.mode === 'lost' ? 'live data stopped' : 'no live data yet'}`,
    `last data ${crowd.lastLive < 0 ? 'never' : age.toFixed(1) + ' s ago'}`,
    `people    ${crowd.count}`,
    camInfo.fps != null ? `camera    ${camInfo.fps} fps · ${camInfo.n ?? '?'} detected · ${camInfo.state || ''}` : `camera    no report yet`,
  ].join('\n');
}

// ---------------------------------------------------------------- loop and keys
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; clock += dt;
  crowd.step(dt);
  render();
  if ((clock * 4 | 0) !== ((clock - dt) * 4 | 0)) updateStatus();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

const startEl = document.getElementById('start');
document.getElementById('codeLine').textContent = `Show code: ${CODE}`;
const goFull = () => { startEl.hidden = true; document.documentElement.requestFullscreen?.().catch(() => {}); };
document.getElementById('go').addEventListener('click', goFull);
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'f') goFull();
  if (k === 's') { statusEl.hidden = !statusEl.hidden; document.body.classList.toggle('cursor', !statusEl.hidden); updateStatus(); }
  if (k === 'r') crowd.reset();
  if (k === 'escape') startEl.hidden = true;
});
store.set('vis_code', CODE);
window.VISDisplay = { crowd }; // for testing from the console
