// VIS live crowd: the camera. Runs on the phone on the balcony.
// Streams the camera to the "VIS Live Crowd" Roboflow workflow (RF-DETR + ByteTrack) over WebRTC, maps each
// person's feet onto the seat map using the four calibration chairs, and sends only those positions to the display.
import { InferenceHTTPClient, webrtc } from './vendor/inference-sdk-0.4.0.js?v=6';
import { peerIdFor, WORKFLOW_SPEC, PROXY_URL, CORNERS, UNIT, homography, applyH, store } from './shared.js?v=6';

const $ = id => document.getElementById(id);
const vid = $('vid'), ov = $('ov'), octx = ov.getContext('2d'), stateEl = $('state'), hint = $('hint');
const params = new URLSearchParams(location.search);

let code = params.get('code') || store.get('vis_code', 'vis');
let apiKey = store.get('vis_rf_key', '');
let corners = store.get('vis_cal', [[0.22, 0.48], [0.78, 0.47], [0.9, 0.86], [0.1, 0.88]]); // normalized video coords
let H = homography(corners, UNIT);

const S = { stream: 'idle', link: 'not connected', fps: 0, n: 0, sent: 0, lastData: 0, error: '' };
let conn = null, rf = null, mediaStream = null, testFile = null, calibrating = false, starting = false, wantRunning = false;
let lastPeople = [], frameTimes = [];

// ---------------------------------------------------------------- setup
function showSetup(msg = '') {
  $('codeIn').value = code; $('keyIn').value = apiKey; $('setupErr').textContent = msg; $('setup').hidden = false;
}
$('setupForm').addEventListener('submit', async e => {
  e.preventDefault();
  const c = $('codeIn').value.trim(), k = $('keyIn').value.trim();
  if (!c || !k) return;
  $('setupErr').textContent = 'Checking the key…';
  const ws = await workspaceFor(k).catch(() => null);
  if (!ws) { $('setupErr').textContent = 'Roboflow did not accept that key. Copy it again from Settings, API Keys.'; return; }
  code = c; apiKey = k; store.set('vis_code', code); store.set('vis_rf_key', apiKey); store.set('vis_ws', ws);
  turnCache = null; await roboflowTurn(apiKey);
  $('setup').hidden = true; connectPeer(true); render();
});
$('setBtn').addEventListener('click', () => showSetup());

// Roboflow's relay (TURN) servers: they keep the stream and the link to the display working on any network
let turnCache = null;
async function roboflowTurn(key) {
  if (turnCache) return turnCache;
  try {
    const r = await fetch(`https://api.roboflow.com/webrtc_turn_config?api_key=${encodeURIComponent(key)}`);
    if (!r.ok) return null;
    const t = await r.json(), list = Array.isArray(t) ? t : t.iceServers || (t.urls ? [t] : []);
    turnCache = list.map(o => ({ urls: Array.isArray(o.urls) ? o.urls : [o.urls], username: o.username, credential: o.credential }));
    return turnCache;
  } catch { return null; }
}
const STUN = [{ urls: ['stun:stun.l.google.com:19302'] }];

// Roboflow only accepts stream setup from a server, so the request goes through our small relay (proxy/worker.js),
// which forwards it to serverless.roboflow.com unchanged
const rfClient = key => InferenceHTTPClient.init({ apiKey: key, serverUrl: PROXY_URL });
let pipelineId = null;
function proxyConnector(key) {
  return {
    connectWrtc: async (offer, p) => {
      const answer = await rfClient(key).initializeWebrtcWorker({
        offer, workflowSpec: p.workflowSpec,
        config: {
          imageInputName: p.imageInputName, streamOutputNames: p.streamOutputNames, dataOutputNames: p.dataOutputNames,
          iceServers: p.iceServers, processingTimeout: p.processingTimeout, requestedPlan: p.requestedPlan,
          requestedRegion: p.requestedRegion, realtimeProcessing: p.realtimeProcessing,
        },
      });
      pipelineId = answer?.context?.pipeline_id || null;
      return answer;
    },
    getIceServers: () => roboflowTurn(key),
  };
}

async function workspaceFor(key) {
  const r = await fetch(`https://api.roboflow.com/?api_key=${encodeURIComponent(key)}`);
  if (!r.ok) throw new Error('bad key');
  const j = await r.json();
  return j.workspace || null;
}

// ---------------------------------------------------------------- link to the display
let peer = null;
function connectPeer(fresh = false) {
  if (fresh && peer) { try { peer.destroy(); } catch {} peer = null; conn = null; }
  if (!peer || peer.destroyed) {
    peer = new Peer({ debug: 1, config: { iceServers: [...STUN, ...(turnCache || [])] } });
    peer.on('open', dial);
    peer.on('disconnected', () => { S.link = 'signal lost'; setTimeout(() => { try { peer.reconnect(); } catch {} }, 1500); });
    peer.on('error', err => {
      S.link = err.type === 'peer-unavailable' ? 'display not open' : `error: ${err.type}`;
      if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) setTimeout(() => connectPeer(true), 3000);
    });
  } else if (peer.open) dial();
}
function dial() {
  if (conn && conn.open) return;
  S.link = 'connecting';
  const c = peer.connect(peerIdFor(code), { reliable: false, serialization: 'json' });
  c.on('open', () => { conn = c; S.link = 'display connected'; c.send({ type: 'hello', state: S.stream }); });
  c.on('close', () => { if (conn === c) conn = null; S.link = 'display disconnected'; });
  c.on('error', () => { if (conn === c) conn = null; });
}
// keep dialing until the display answers (it may be opened after the phone, or reloaded)
setInterval(() => { if (apiKey && (!conn || !conn.open) && peer && peer.open) dial(); }, 2500);
setInterval(() => { if (conn && conn.open) conn.send({ type: 'hb', fps: S.fps, n: S.n, state: S.stream }); }, 1000);

// ---------------------------------------------------------------- camera and stream
async function getSource() {
  if (testFile) {
    vid.srcObject = null; vid.src = URL.createObjectURL(testFile); vid.loop = true; vid.muted = true;
    await vid.play();
    const s = vid.captureStream ? vid.captureStream() : vid.mozCaptureStream?.();
    if (!s) throw new Error('This browser cannot stream a video file. Use Chrome on a laptop for the test.');
    return s;
  }
  const s = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 15, max: 30 } },
  });
  vid.removeAttribute('src'); vid.srcObject = s; await vid.play().catch(() => {});
  return s;
}

async function start() {
  if (starting) return; starting = true; wantRunning = true; S.error = '';
  try {
    if (!apiKey) { showSetup(); return; }
    const ws = store.get('vis_ws') || await workspaceFor(apiKey);
    store.set('vis_ws', ws);
    S.stream = 'opening camera'; render();
    try { mediaStream = mediaStream || await getSource(); } // reuse the calibration preview if it is already open
    catch (e) { throw new Error(`Camera: ${e.message || e}`); }
    S.stream = 'starting Roboflow (first frames can take up to a minute)'; render();
    rf = await webrtc.useStream({
      source: mediaStream,
      connector: proxyConnector(apiKey),
      wrtcParams: {
        workflowSpec: WORKFLOW_SPEC,
        imageInputName: 'image',
        streamOutputNames: [],
        dataOutputNames: ['people'],
        requestedPlan: 'webrtc-gpu-medium',
        requestedRegion: 'us',
        processingTimeout: 3 * 3600,
      },
      options: { disableInputStreamDownscaling: true },
      onData,
    });
    rf.peerConnection.addEventListener('connectionstatechange', () => {
      const st = rf?.peerConnection.connectionState;
      if (st === 'failed' || st === 'disconnected') restart('connection ' + st);
    });
    S.stream = 'waiting for first results'; S.startedAt = performance.now(); S.lastData = 0;
  } catch (err) {
    const msg = String(err?.message || err);
    S.stream = 'stopped';
    S.error = /load failed|failed to fetch|networkerror/i.test(msg) ? 'Could not reach the Roboflow relay. Check the internet connection.' : msg.slice(0, 160);
    if (wantRunning) setTimeout(() => { if (wantRunning) restart('retry after error'); }, 5000);
  } finally { starting = false; render(); syncButtons(); }
}
async function stop() {
  wantRunning = false;
  await teardown();
  S.stream = 'stopped'; render(); syncButtons();
}
async function teardown() {
  const r = rf, id = pipelineId; rf = null; pipelineId = null;
  // stop the cloud pipeline so it stops billing (the SDK's own cleanup can't reach Roboflow from this page)
  if (id) { try { await rfClient(apiKey).terminatePipeline({ pipelineId: id }); } catch {} }
  if (r) { try { await r.cleanup(); } catch {} }
  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
}
let restarting = false;
async function restart(why) {
  if (restarting || !wantRunning) return; restarting = true;
  S.stream = `restarting (${why})`; render();
  await teardown(); restarting = false; start();
}
// watchdog: results stopped arriving
setInterval(() => {
  if (!wantRunning || !rf || starting) return;
  const now = performance.now(), since = S.lastData ? now - S.lastData : now - (S.startedAt || now);
  if (since > (S.lastData ? 12000 : 90000)) restart('no results');
}, 2000);

function onData(data) {
  const out = data?.serialized_output_data?.people;
  if (!out) { if (data?.errors?.length) S.error = String(data.errors[0]).slice(0, 160); return; }
  const now = performance.now();
  S.lastData = now; S.stream = 'live';
  frameTimes.push(now); while (frameTimes.length && now - frameTimes[0] > 3000) frameTimes.shift();
  S.fps = Math.round(frameTimes.length / 3 * 10) / 10;
  const iw = out.image?.width || vid.videoWidth || 1, ih = out.image?.height || vid.videoHeight || 1;
  const preds = (out.predictions || []).filter(p => p.tracker_id != null && p.tracker_id >= 0);
  S.n = preds.length;
  // each person's feet: bottom-center of the box, normalized to the frame, then onto the seat map
  lastPeople = preds.map(p => ({ id: p.tracker_id, fx: p.x / iw, fy: (p.y + p.height / 2) / ih }));
  const list = H ? lastPeople.map(({ id, fx, fy }) => { const [u, v] = applyH(H, fx, fy); return [id, Math.round(u * 1e4) / 1e4, Math.round(v * 1e4) / 1e4]; }) : [];
  // how many land on the seat map (the display keeps the floor around the calibrated chairs: about half a block either side)
  S.onMap = list.filter(([, u, v]) => u > -0.5 && u < 1.4 && v > -0.45 && v < 1.8).length;
  if (conn && conn.open && H) {
    try { conn.send({ type: 'people', p: list }); S.sent++; } catch {}
  }
}

// ---------------------------------------------------------------- overlay: calibration and detections
function contentRect() {
  const W = ov.clientWidth, Hh = ov.clientHeight, vw = vid.videoWidth || 16, vh = vid.videoHeight || 9;
  const s = Math.min(W / vw, Hh / vh), w = vw * s, h = vh * s;
  return { x: (W - w) / 2, y: (Hh - h) / 2, w, h };
}
const toScreen = ([u, v], r) => [r.x + u * r.w, r.y + v * r.h];
function draw() {
  const dpr = devicePixelRatio || 1, W = ov.clientWidth, Hh = ov.clientHeight;
  if (ov.width !== Math.round(W * dpr) || ov.height !== Math.round(Hh * dpr)) { ov.width = Math.round(W * dpr); ov.height = Math.round(Hh * dpr); }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, W, Hh);
  const r = contentRect();
  // detections: a small square at each person's feet
  octx.fillStyle = '#C29AF6';
  for (const p of lastPeople) { const [x, y] = toScreen([p.fx, p.fy], r); octx.fillRect(x - 3, y - 3, 6, 6); }
  // the calibration quad
  const pts = corners.map(c => toScreen(c, r));
  octx.strokeStyle = calibrating ? '#F4F2EC' : 'rgba(244,242,236,.35)'; octx.lineWidth = calibrating ? 2 : 1;
  octx.beginPath(); pts.forEach(([x, y], i) => i ? octx.lineTo(x, y) : octx.moveTo(x, y)); octx.closePath(); octx.stroke();
  if (calibrating) {
    pts.forEach(([x, y], i) => {
      octx.fillStyle = i === activeCorner ? '#C29AF6' : '#F4F2EC';
      octx.beginPath(); octx.arc(x, y, 15, 0, Math.PI * 2); octx.fill();
      octx.fillStyle = '#121110'; octx.font = '600 15px ui-monospace, Menlo, monospace'; octx.textAlign = 'center'; octx.textBaseline = 'middle';
      octx.fillText(String(i + 1), x, y + 1);
    });
    drawMiniMap(W, Hh);
  }
  requestAnimationFrame(draw);
}
// which chair is which: the seat map with the stage at the top and the four corners numbered
function drawMiniMap(W, Hh) {
  const mw = 132, mh = 92, x0 = W - mw - 12, y0 = W > Hh ? 12 : Hh - mh - 12; // top right in landscape, clear of the hint
  octx.fillStyle = 'rgba(18,17,16,.92)'; octx.fillRect(x0, y0, mw, mh);
  octx.fillStyle = '#8f8b85'; octx.fillRect(x0 + 30, y0 + 8, mw - 60, 6);
  octx.font = '9px ui-monospace, Menlo, monospace'; octx.textAlign = 'center'; octx.textBaseline = 'top'; octx.fillText('STAGE', x0 + mw / 2, y0 + 16);
  const bx = [x0 + 20, x0 + mw / 2 + 6], by = y0 + 32, cw = mw / 2 - 26, ch = 46;
  octx.fillStyle = 'rgba(244,242,236,.35)'; bx.forEach(x => octx.fillRect(x, by, cw, ch));
  const cs = [[bx[0], by], [bx[1] + cw, by], [bx[1] + cw, by + ch], [bx[0], by + ch]];
  cs.forEach(([x, y], i) => {
    octx.fillStyle = i === activeCorner ? '#C29AF6' : '#F4F2EC'; octx.beginPath(); octx.arc(x, y, 7, 0, Math.PI * 2); octx.fill();
    octx.fillStyle = '#121110'; octx.font = '600 9px ui-monospace, Menlo, monospace'; octx.textBaseline = 'middle'; octx.fillText(String(i + 1), x, y + 0.5);
  });
}
requestAnimationFrame(draw);

let activeCorner = -1;
ov.addEventListener('pointerdown', e => {
  if (!calibrating) return;
  const r = contentRect(), b = ov.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
  let best = -1, bd = 60;
  corners.forEach((c, i) => { const [sx, sy] = toScreen(c, r), d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = i; } });
  activeCorner = best; if (best >= 0) { ov.setPointerCapture(e.pointerId); moveCorner(e); }
});
ov.addEventListener('pointermove', e => { if (calibrating && activeCorner >= 0 && e.buttons) moveCorner(e); });
ov.addEventListener('pointerup', () => { if (activeCorner >= 0) { store.set('vis_cal', corners); } activeCorner = -1; updateHint(); });
function moveCorner(e) {
  const r = contentRect(), b = ov.getBoundingClientRect();
  const u = Math.max(0, Math.min(1, (e.clientX - b.left - r.x) / r.w)), v = Math.max(0, Math.min(1, (e.clientY - b.top - r.y) / r.h));
  const next = corners.map((c, i) => i === activeCorner ? [u, v] : c), h = homography(next, UNIT);
  if (h) { corners = next; H = h; }
  updateHint();
}
function updateHint() {
  if (!calibrating) { hint.hidden = true; return; }
  hint.hidden = false;
  const i = activeCorner >= 0 ? activeCorner : null;
  hint.innerHTML = i == null
    ? 'Drag 1 to 4 onto the <b>outer corner chairs</b>, where each touches the floor. 1 and 2 are the front row, nearest the stage. The map shows which is which.'
    : `Point <b>${i + 1}</b>: ${CORNERS[i]}`;
}
$('calBtn').addEventListener('click', () => {
  calibrating = !calibrating; $('calBtn').setAttribute('aria-pressed', String(calibrating)); activeCorner = -1; updateHint();
  if (calibrating && !mediaStream) previewOnly();
});
// show the camera for calibration without starting the cloud stream
async function previewOnly() { try { if (!mediaStream) { mediaStream = await getSource(); } } catch (err) { S.error = String(err?.message || err); render(); } }

// ---------------------------------------------------------------- controls and status
$('startBtn').addEventListener('click', () => { if (wantRunning) stop(); else start(); });
$('fileBtn').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', async e => {
  testFile = e.target.files[0] || null; if (!testFile) return;
  $('fileBtn').textContent = 'Test video loaded';
  await teardown(); if (wantRunning) start(); else previewOnly();
});
function syncButtons() { $('startBtn').textContent = wantRunning ? 'Stop' : 'Start'; $('startBtn').classList.toggle('primary', !wantRunning); }
function render() {
  const live = S.stream === 'live';
  stateEl.innerHTML = [
    `<span>code <b>${escapeHtml(code)}</b></span>`,
    `<span>build <b>6</b></span>`,
    `<span>stream <b class="${live ? 'live' : ''}">${escapeHtml(S.stream)}</b></span>`,
    `<span>display <b class="${S.link === 'display connected' ? 'live' : 'bad'}">${escapeHtml(S.link)}</b></span>`,
    live ? `<span>people <b>${S.n}</b></span><span>on map <b class="${S.onMap ? 'live' : 'bad'}">${S.onMap ?? 0}</b></span><span><b>${S.fps}</b> fps</span>` : '',
    S.error ? `<span class="bad">${escapeHtml(S.error)}</span>` : '',
  ].join('');
}
const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
setInterval(render, 500);

addEventListener('pagehide', () => {
  if (pipelineId) navigator.sendBeacon?.(`${PROXY_URL}/inference_pipelines/${pipelineId}/terminate?api_key=${encodeURIComponent(apiKey)}`);
});

// keep the phone awake while it is the camera
let wake = null;
async function keepAwake() { try { wake = await navigator.wakeLock?.request('screen'); } catch {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });
keepAwake();

if (!apiKey) showSetup(); else roboflowTurn(apiKey).then(() => connectPeer());
syncButtons(); render();
window.VISCamera = { S, start, stop, onData, get people() { return lastPeople; } }; // for testing from the console
