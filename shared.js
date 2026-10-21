// Shared between the camera (phone) and the display (laptop).

// Both devices find each other by a show code. The display registers this id; the camera dials it.
export const peerIdFor = code => `vis-live-crowd-${String(code || 'vis').toLowerCase().replace(/[^a-z0-9-]/g, '')}-display`;

export const WORKFLOW_ID = 'vis-live-crowd';

// The same workflow as "VIS Live Crowd" in Roboflow, sent with each stream so any workspace's API key works:
// RF-DETR (medium, COCO people) over 640 px tiles, stitched, then ByteTrack for stable IDs.
export const WORKFLOW_SPEC = {
  version: '1.0',
  inputs: [{ type: 'WorkflowImage', name: 'image' }],
  steps: [
    { type: 'roboflow_core/image_slicer@v2', name: 'slicer', image: '$inputs.image', slice_width: 640, slice_height: 640, overlap_ratio_width: 0.15, overlap_ratio_height: 0.15 },
    { type: 'roboflow_core/roboflow_object_detection_model@v3', name: 'people', images: '$steps.slicer.slices', model_id: 'rfdetr-medium', confidence_mode: 'custom', custom_confidence: 0.3, class_filter: ['person'] },
    { type: 'roboflow_core/detections_stitch@v1', name: 'stitch', reference_image: '$inputs.image', predictions: '$steps.people.predictions', overlap_filtering_strategy: 'nms', iou_threshold: 0.3 },
    { type: 'roboflow_core/trackers_bytetrack@v1', name: 'tracker', image: '$inputs.image', detections: '$steps.stitch.predictions', track_activation_threshold: 0.35, high_conf_det_threshold: 0.45, minimum_consecutive_frames: 2, lost_track_buffer: 45 },
  ],
  outputs: [{ type: 'JsonField', name: 'people', selector: '$steps.tracker.tracked_detections' }],
};

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
