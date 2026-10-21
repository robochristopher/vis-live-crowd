// VIS live crowd relay (Cloudflare Worker).
// Roboflow's serverless API only accepts browser requests from app.roboflow.com, so the camera page sends its two
// stream calls here and this forwards them to serverless.roboflow.com unchanged. No keys are stored here: the page
// includes its own Roboflow key in each request, exactly as it would when calling Roboflow directly.
// The video itself never passes through this relay; it goes straight from the phone to Roboflow over WebRTC.

const UPSTREAM = 'https://serverless.roboflow.com';
const ALLOWED_ORIGINS = ['https://robochristopher.github.io'];
const ALLOWED_PATHS = [/^\/initialise_webrtc_worker$/, /^\/inference_pipelines\/[A-Za-z0-9_-]+\/terminate$/];

function cors(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const headers = cors(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/') return new Response('VIS live crowd relay: ok', { headers });
    if (request.method !== 'POST' || !ALLOWED_PATHS.some(re => re.test(url.pathname))) {
      return new Response('Not found', { status: 404, headers });
    }

    const upstream = await fetch(UPSTREAM + url.pathname + url.search, {
      method: 'POST',
      headers: { 'Content-Type': request.headers.get('Content-Type') || 'application/json' },
      body: await request.arrayBuffer(),
    });
    const out = new Headers(headers);
    out.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};
