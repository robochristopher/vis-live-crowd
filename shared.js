// Shared between the camera (phone) and the display (laptop).

// Both devices find each other by a show code. The display registers this id; the camera dials it.
export const peerIdFor = code => `vis-live-crowd-${String(code || 'vis').toLowerCase().replace(/[^a-z0-9-]/g, '')}-display`;

export const WORKFLOW_ID = 'vis-live-crowd';

// The relay that forwards stream setup to serverless.roboflow.com (Roboflow refuses it straight from a browser).
// Override with ?proxy=https://... on the camera page for testing.
export const PROXY_URL = (new URLSearchParams(location.search).get('proxy') || 'https://vis-live-crowd-relay.christopher-0e6.workers.dev').replace(/\/$/, '');

// The four calibration points, in the order the operator taps them on the phone.
// They are the outer chairs of the seating, as they appear on the seat map (stage at the top):
// 1 front-left, 2 front-right, 3 back-right, 4 back-left. They map to the unit square, which the
// display maps onto the same four chairs of its seat map.
export const CORNERS = ['Front left chair', 'Front right chair', 'Back right chair', 'Back left chair'];
export const UNIT = [[0, 0], [1, 0], [1, 1], [0, 1]];

// 4-point homography (DLT, h33 = 1)
export function homography(src, dst) {
  const M = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [X, Y] = dst[i];
    M.push([x, y, 1, 0, 0, 0, -X * x, -X * y]); b.push(X);
    M.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]); b.push(Y);
  }
  for (let c = 0; c < 8; c++) {
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]]; [b[c], b[p]] = [b[p], b[c]];
    if (Math.abs(M[c][c]) < 1e-12) return null; // degenerate (three points in a line)
    for (let r = 0; r < 8; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 8; k++) M[r][k] -= f * M[c][k]; b[r] -= f * b[c]; }
  }
  return [...b.map((v, i) => v / M[i][i]), 1];
}
export const applyH = (h, x, y) => { const w = h[6] * x + h[7] * y + h[8]; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; };

export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
