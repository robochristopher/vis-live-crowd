/* @roboflow/inference-sdk 0.4.0, ISC license, Roboflow. Vendored so show day does not depend on a CDN. */
var $ = Object.defineProperty;
var V = (r, e, t) => e in r ? $(r, e, { enumerable: !0, configurable: !0, writable: !0, value: t }) : r[e] = t;
var d = (r, e, t) => V(r, typeof e != "symbol" ? e + "" : e, t);
const T = globalThis.process;
var D;
const M = ((D = T == null ? void 0 : T.env) == null ? void 0 : D.RF_API_BASE_URL) ?? "https://api.roboflow.com";
class U extends Error {
  constructor(t, n, a) {
    super(t);
    d(this, "errorData");
    d(this, "statusCode");
    this.name = "WorkflowError", this.statusCode = n, this.errorData = a, Object.setPrototypeOf(this, U.prototype);
  }
}
function z(r) {
  if (!r) return null;
  try {
    const e = JSON.parse(r);
    return e && typeof e.message == "string" ? e : null;
  } catch {
    return null;
  }
}
async function N(r, e) {
  const t = await r.text().catch(() => ""), n = z(t);
  throw n ? new U(
    `${e} (${r.status}): ${n.message}`,
    r.status,
    n
  ) : new Error(`${e} (${r.status}): ${t}`);
}
const J = [
  "https://serverless.roboflow.com",
  "https://serverless.roboflow.one"
];
class k {
  /**
   * @private
   * Use InferenceHTTPClient.init() instead
   */
  constructor(e, t = "https://serverless.roboflow.com", n = M) {
    d(this, "apiKey");
    d(this, "serverUrl");
    d(this, "apiBaseUrl");
    this.apiKey = e, this.serverUrl = t, this.apiBaseUrl = n;
  }
  static init({ apiKey: e, serverUrl: t, apiBaseUrl: n }) {
    if (!e)
      throw new Error("apiKey is required");
    return new k(e, t, n);
  }
  /**
   * Initialize a WebRTC worker pipeline
   *
   * @param params - Pipeline parameters
   * @param params.offer - WebRTC offer { sdp, type }
   * @param params.workflowSpec - Workflow specification
   * @param params.config - Additional configuration
   * @param params.config.imageInputName - Input image name (default: "image")
   * @param params.config.streamOutputNames - Output stream names for video (default: [])
   * @param params.config.dataOutputNames - Output data names (default: ["string"])
   * @param params.config.threadPoolWorkers - Thread pool workers (default: 4)
   * @returns Promise resolving to answer with SDP and pipeline ID
   *
   * @example
   * ```typescript
   * const answer = await client.initializeWebrtcWorker({
   *   offer: { sdp, type },
   *   workflowSpec: { ... },
   *   config: {
   *     imageInputName: "image",
   *     streamOutputNames: ["output_image"]
   *   }
   * });
   * ```
   */
  async initializeWebrtcWorker({
    offer: e,
    workflowSpec: t,
    workspaceName: n,
    workflowId: a,
    config: o = {}
  }) {
    if (!e || !e.sdp || !e.type)
      throw new Error("offer with sdp and type is required");
    const i = !!t, h = !!(n && a);
    if (!i && !h)
      throw new Error("Either workflowSpec OR (workspaceName + workflowId) is required");
    if (i && h)
      throw new Error("Provide either workflowSpec OR (workspaceName + workflowId), not both");
    const {
      imageInputName: l = "image",
      streamOutputNames: s = [],
      dataOutputNames: c = [],
      threadPoolWorkers: y = 4,
      workflowsParameters: S = {},
      iceServers: f,
      processingTimeout: u,
      requestedPlan: p,
      requestedRegion: C,
      realtimeProcessing: v = !0,
      rtspUrl: b,
      extraPayload: R
    } = o, w = {
      type: "WorkflowConfiguration",
      image_input_name: l,
      workflows_parameters: S,
      workflows_thread_pool_workers: y,
      cancel_thread_pool_tasks_on_exit: !0,
      video_metadata_input_name: "video_metadata"
    };
    i ? w.workflow_specification = t : (w.workspace_name = n, w.workflow_id = a);
    const m = {
      workflow_configuration: w,
      api_key: this.apiKey,
      webrtc_realtime_processing: v,
      webrtc_offer: {
        sdp: e.sdp,
        type: e.type
      },
      webrtc_config: f ? { iceServers: f } : null,
      stream_output: s,
      data_output: c
    };
    u !== void 0 && (m.processing_timeout = u), p !== void 0 && (m.requested_plan = p), C !== void 0 && (m.requested_region = C), b && (m.rtsp_url = b), R && Object.assign(m, R);
    const E = await fetch(`${this.serverUrl}/initialise_webrtc_worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(m)
    });
    return E.ok || await N(E, "initialise_webrtc_worker failed"), await E.json();
  }
  async terminatePipeline({ pipelineId: e }) {
    if (!e)
      throw new Error("pipelineId is required");
    await fetch(
      `${this.serverUrl}/inference_pipelines/${e}/terminate?api_key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      }
    );
  }
  /**
   * Fetch TURN server configuration from Roboflow API
   *
   * This automatically fetches TURN server credentials for improved WebRTC
   * connectivity through firewalls and NAT. Only applicable when using
   * Roboflow serverless infrastructure.
   *
   * @returns Promise resolving to ICE server configuration, or null if not applicable
   *
   * @example
   * ```typescript
   * const client = InferenceHTTPClient.init({ apiKey: "your-api-key" });
   * const iceServers = await client.fetchTurnConfig();
   * // Returns: [{ urls: ["turn:..."], username: "...", credential: "..." }]
   * ```
   */
  async fetchTurnConfig() {
    if (!J.includes(this.serverUrl))
      return null;
    try {
      const e = await fetch(
        `${this.apiBaseUrl}/webrtc_turn_config?api_key=${this.apiKey}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" }
        }
      );
      if (!e.ok)
        return console.warn(`[RFWebRTC] Failed to fetch TURN config (${e.status}), using defaults`), null;
      const t = await e.json();
      let n;
      if (Array.isArray(t))
        n = t;
      else if (t.iceServers && Array.isArray(t.iceServers))
        n = t.iceServers;
      else if (t.urls)
        n = [t];
      else
        return console.warn("[RFWebRTC] Invalid TURN config format, using defaults"), null;
      return n.map((o) => ({
        urls: Array.isArray(o.urls) ? o.urls : [o.urls],
        username: o.username,
        credential: o.credential
      }));
    } catch (e) {
      return console.warn("[RFWebRTC] Error fetching TURN config:", e), null;
    }
  }
}
const de = {
  /**
   * Create a connector that uses API key directly
   *
   * **WARNING**: If you use this in the frontend, it will expose your API key. 
   * Use only for demos/testing.
   * For production, use withProxyUrl() with a backend proxy.
   *
   * @param apiKey - Roboflow API key
   * @param options - Additional options
   * @param options.serverUrl - Custom Roboflow server URL
   * @returns Connector with connectWrtc method
   *
   * @example
   * ```typescript
   * const connector = connectors.withApiKey("your-api-key");
   * const answer = await connector.connectWrtc(offer, wrtcParams);
   * ```
   */
  withApiKey(r, e = {}) {
    const { serverUrl: t, apiBaseUrl: n } = e;
    typeof window < "u" && console.warn(
      "[Security Warning] Using API key directly in browser will expose it. Use connectors.withProxyUrl() for production. See: https://docs.roboflow.com/api-reference/authentication#securing-your-api-key"
    );
    const a = k.init({ apiKey: r, serverUrl: t, apiBaseUrl: n });
    return {
      connectWrtc: async (o, i) => (console.debug("wrtcParams", i), await a.initializeWebrtcWorker({
        offer: o,
        workflowSpec: i.workflowSpec,
        workspaceName: i.workspaceName,
        workflowId: i.workflowId,
        config: {
          imageInputName: i.imageInputName,
          streamOutputNames: i.streamOutputNames,
          dataOutputNames: i.dataOutputNames,
          threadPoolWorkers: i.threadPoolWorkers,
          workflowsParameters: i.workflowsParameters,
          iceServers: i.iceServers,
          processingTimeout: i.processingTimeout,
          requestedPlan: i.requestedPlan,
          requestedRegion: i.requestedRegion,
          realtimeProcessing: i.realtimeProcessing,
          rtspUrl: i.rtspUrl,
          extraPayload: i.extraPayload
        }
      })),
      /**
       * Fetch TURN server configuration for improved WebRTC connectivity
       */
      getIceServers: async () => await a.fetchTurnConfig(),
      // Store apiKey for cleanup
      _apiKey: r,
      _serverUrl: t
    };
  },
  /**
   * Create a connector that uses a backend proxy (recommended for production)
   *
   * Your backend receives the offer and wrtcParams, adds the secret API key,
   * and forwards to Roboflow. This keeps your API key secure.
   *
   * For improved WebRTC connectivity through firewalls, implement a separate
   * endpoint for TURN server configuration that calls `fetchTurnConfig()`.
   *
   * @param proxyUrl - Backend proxy endpoint URL for WebRTC initialization
   * @param options - Additional options
   * @param options.turnConfigUrl - Optional URL for fetching TURN server configuration
   * @returns Connector with connectWrtc and optional getIceServers methods
   *
   * @example
   * ```typescript
   * // Frontend: Create connector with TURN config endpoint
   * const connector = connectors.withProxyUrl('/api/init-webrtc', {
   *   turnConfigUrl: '/api/turn-config'
   * });
   * ```
   *
   * @example
   * Backend implementation (Express) with TURN server support:
   * ```typescript
   * // Endpoint for TURN configuration (called first by SDK)
   * app.get('/api/turn-config', async (req, res) => {
   *   const client = InferenceHTTPClient.init({
   *     apiKey: process.env.ROBOFLOW_API_KEY
   *   });
   *   const iceServers = await client.fetchTurnConfig();
   *   res.json({ iceServers });
   * });
   *
   * // Endpoint for WebRTC initialization
   * app.post('/api/init-webrtc', async (req, res) => {
   *   const { offer, wrtcParams } = req.body;
   *   const client = InferenceHTTPClient.init({
   *     apiKey: process.env.ROBOFLOW_API_KEY
   *   });
   *
   *   try {
   *     const answer = await client.initializeWebrtcWorker({
   *       offer,
   *       workflowSpec: wrtcParams.workflowSpec,
   *       workspaceName: wrtcParams.workspaceName,
   *       workflowId: wrtcParams.workflowId,
   *       config: {
   *         imageInputName: wrtcParams.imageInputName,
   *         streamOutputNames: wrtcParams.streamOutputNames,
   *         dataOutputNames: wrtcParams.dataOutputNames,
   *         threadPoolWorkers: wrtcParams.threadPoolWorkers,
   *         workflowsParameters: wrtcParams.workflowsParameters,
   *         iceServers: wrtcParams.iceServers,
   *         processingTimeout: wrtcParams.processingTimeout,
   *         requestedPlan: wrtcParams.requestedPlan,
   *         requestedRegion: wrtcParams.requestedRegion
   *       }
   *     });
   *     res.json(answer);
   *   } catch (err) {
   *     // Forward the structured error body/status so the client SDK can
   *     // surface it as a WorkflowError with full errorData.
   *     if (err instanceof WorkflowError) {
   *       res.status(err.statusCode).json(err.errorData);
   *     } else {
   *       res.status(500).json({ message: err.message ?? 'Unknown error' });
   *     }
   *   }
   * });
   * ```
   *
   * The SDK will parse `{ message, error_type, ... }` JSON bodies from the proxy
   * into a {@link WorkflowError}, matching the behavior of {@link withApiKey}.
   * Non-JSON / unstructured error responses are surfaced as a plain `Error`.
   */
  withProxyUrl(r, e = {}) {
    const { turnConfigUrl: t } = e;
    return {
      connectWrtc: async (n, a) => {
        const o = await fetch(r, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            offer: n,
            wrtcParams: a
          })
        });
        return o.ok || await N(o, "Proxy request failed"), await o.json();
      },
      /**
       * Fetch TURN server configuration from the proxy backend
       * Only available if turnConfigUrl was provided
       */
      getIceServers: t ? async () => {
        try {
          const n = await fetch(t, {
            method: "GET",
            headers: { "Content-Type": "application/json" }
          });
          return n.ok ? (await n.json()).iceServers || null : (console.warn(`[RFWebRTC] Failed to fetch TURN config from proxy (${n.status})`), null);
        } catch (n) {
          return console.warn("[RFWebRTC] Error fetching TURN config from proxy:", n), null;
        }
      } : void 0
    };
  }
};
async function G(r = { video: !0 }) {
  try {
    console.log("[RFStreams] requesting with", r);
    const e = await navigator.mediaDevices.getUserMedia(r);
    return console.log("[RFStreams] got stream", e.getVideoTracks().map((t) => ({ id: t.id, label: t.label }))), e;
  } catch (e) {
    console.warn("[RFStreams] failed, falling back", e);
    const t = await navigator.mediaDevices.getUserMedia({ video: !0, audio: !1 });
    return console.log("[RFStreams] fallback stream", t.getVideoTracks().map((n) => ({ id: n.id, label: n.label }))), t;
  }
}
function A(r) {
  r && (r.getTracks().forEach((e) => e.stop()), console.log("[RFStreams] Stream stopped"));
}
const ue = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  stopStream: A,
  useCamera: G
}, Symbol.toStringTag, { value: "Module" })), F = 49152, H = 262144, Z = 10;
function Q(r) {
  return new Promise((e) => setTimeout(e, r));
}
class x {
  constructor(e, t) {
    d(this, "file");
    d(this, "channel");
    d(this, "totalChunks");
    d(this, "cancelled", !1);
    this.file = e, this.channel = t, this.totalChunks = Math.ceil(e.size / F);
  }
  /**
   * Cancel the upload
   */
  cancel() {
    this.cancelled = !0;
  }
  /**
   * Upload the file in chunks with backpressure handling
   *
   * @param onProgress - Optional callback for progress updates (bytesUploaded, totalBytes)
   */
  async upload(e) {
    const t = this.file.size;
    for (let n = 0; n < this.totalChunks; n++) {
      if (this.cancelled)
        throw new Error("Upload cancelled");
      if (this.channel.readyState !== "open")
        throw new Error("Video upload interrupted");
      const a = n * F, o = Math.min(a + F, t), i = this.file.slice(a, o), h = new Uint8Array(await i.arrayBuffer()), l = new ArrayBuffer(8 + h.length), s = new DataView(l);
      for (s.setUint32(0, n, !0), s.setUint32(4, this.totalChunks, !0), new Uint8Array(l, 8).set(h); this.channel.bufferedAmount > H; ) {
        if (this.channel.readyState !== "open")
          throw new Error("Video upload interrupted");
        await Q(Z);
      }
      this.channel.send(l), e && e(o, t);
    }
  }
}
const X = 12;
class B {
  constructor() {
    d(this, "pendingFrames", /* @__PURE__ */ new Map());
  }
  /**
   * Process an incoming chunk and return the complete message if all chunks received
   */
  processChunk(e, t, n, a) {
    if (n === 1)
      return a;
    this.pendingFrames.has(e) || this.pendingFrames.set(e, {
      chunks: /* @__PURE__ */ new Map(),
      totalChunks: n
    });
    const o = this.pendingFrames.get(e);
    if (o.chunks.set(t, a), o.chunks.size === n) {
      const i = Array.from(o.chunks.values()).reduce((s, c) => s + c.length, 0), h = new Uint8Array(i);
      let l = 0;
      for (let s = 0; s < n; s++) {
        const c = o.chunks.get(s);
        h.set(c, l), l += c.length;
      }
      return this.pendingFrames.delete(e), h;
    }
    return null;
  }
  /**
   * Clear all pending frames (for cleanup)
   */
  clear() {
    this.pendingFrames.clear();
  }
}
function j(r) {
  const e = new DataView(r), t = e.getUint32(0, !0), n = e.getUint32(4, !0), a = e.getUint32(8, !0), o = new Uint8Array(r, X);
  return { frameId: t, chunkIndex: n, totalChunks: a, payload: o };
}
async function Y(r) {
  const e = new DecompressionStream("gzip"), t = e.writable.getWriter();
  t.write(r), t.close();
  const n = e.readable.getReader(), a = [];
  for (; ; ) {
    const { done: l, value: s } = await n.read();
    if (l) break;
    a.push(s);
  }
  const o = a.reduce((l, s) => l + s.length, 0), i = new Uint8Array(o);
  let h = 0;
  for (const l of a)
    i.set(l, h), h += l.length;
  return i;
}
async function ee(r, e = 6e3) {
  if (r.iceGatheringState === "complete") return;
  let t = !1;
  const n = (a) => {
    a.candidate && a.candidate.type === "srflx" && (t = !0);
  };
  r.addEventListener("icecandidate", n);
  try {
    await Promise.race([
      new Promise((a) => {
        const o = () => {
          r.iceGatheringState === "complete" && (r.removeEventListener("icegatheringstatechange", o), a());
        };
        r.addEventListener("icegatheringstatechange", o);
      }),
      new Promise((a, o) => {
        setTimeout(() => {
          t ? a() : (console.error("[ICE] timeout with NO srflx candidate! Connection may fail."), o(new Error("ICE gathering timeout without srflx candidate")));
        }, e);
      })
    ]);
  } finally {
    r.removeEventListener("icecandidate", n);
  }
}
function te(r) {
  return new Promise((e) => {
    r.addEventListener("track", (t) => {
      t.streams && t.streams[0] && e(t.streams[0]);
    });
  });
}
const re = [
  { urls: ["stun:stun.l.google.com:19302"] }
];
async function ne(r, e, t, n, a) {
  if ([!!r, !!e, !!n].filter(Boolean).length !== 1)
    throw new Error("Exactly one of localStream, file, or rtspUrl must be provided");
  const s = t ?? re, c = new RTCPeerConnection({
    iceServers: s
  });
  a != null && a.onPeerConnectionCreated && await a.onPeerConnectionCreated(c);
  try {
    c.addTransceiver("video", { direction: "recvonly" });
  } catch (p) {
    console.warn("[RFWebRTC] Could not add transceiver:", p);
  }
  if (r)
    for (const p of r.getVideoTracks()) {
      const C = c.addTrack(p, r);
      a != null && a.onTrackAdded && await a.onTrackAdded(p, C, c);
    }
  const y = te(c), S = c.createDataChannel("inference", {
    ordered: !0
  });
  let f;
  e && (f = c.createDataChannel("video_upload"));
  let u = await c.createOffer();
  if (a != null && a.onOfferCreated) {
    const p = await a.onOfferCreated(u);
    p && (u = p);
  }
  return await c.setLocalDescription(u), await ee(c), {
    pc: c,
    offer: c.localDescription,
    remoteStreamPromise: y,
    dataChannel: S,
    uploadChannel: f
  };
}
async function ae(r) {
  const e = r.getSenders().find((n) => n.track && n.track.kind === "video");
  if (!e) return;
  const t = e.getParameters();
  t.encodings = t.encodings || [{}], t.encodings[0].scaleResolutionDownBy = 1;
  try {
    await e.setParameters(t);
  } catch (n) {
    console.warn("[RFWebRTC] Failed to set encoding parameters:", n);
  }
}
function ie(r, e = 3e4) {
  return new Promise((t, n) => {
    if (r.readyState === "open") {
      t();
      return;
    }
    const a = () => {
      r.removeEventListener("open", a), r.removeEventListener("error", o), clearTimeout(i), t();
    }, o = () => {
      r.removeEventListener("open", a), r.removeEventListener("error", o), clearTimeout(i), n(new Error("Datachannel error"));
    }, i = setTimeout(() => {
      r.removeEventListener("open", a), r.removeEventListener("error", o), n(new Error("Datachannel open timeout"));
    }, e);
    r.addEventListener("open", a), r.addEventListener("error", o);
  });
}
class q {
  /** @private */
  constructor(e, t, n, a, o, i) {
    /**
     * The underlying RTCPeerConnection.
     * Exposed for advanced use cases like getting stats or accessing senders.
     */
    d(this, "peerConnection");
    d(this, "_localStream");
    d(this, "remoteStreamPromise");
    d(this, "pipelineId");
    d(this, "apiKey");
    /**
     * The data channel used for receiving inference results.
     * Exposed for advanced use cases.
     */
    d(this, "dataChannel");
    d(this, "reassembler");
    d(this, "ackPacingEnabled");
    /**
     * The data channel used for uploading video files (only available in file upload mode).
     * Exposed for advanced use cases.
     */
    d(this, "uploadChannel");
    d(this, "uploader");
    d(this, "onComplete");
    this.peerConnection = e, this._localStream = i == null ? void 0 : i.localStream, this.remoteStreamPromise = t, this.pipelineId = n, this.apiKey = a, this.dataChannel = o, this.reassembler = new B(), this.ackPacingEnabled = (i == null ? void 0 : i.ackPacingEnabled) === !0, this.uploadChannel = i == null ? void 0 : i.uploadChannel, this.onComplete = i == null ? void 0 : i.onComplete, this.dataChannel.binaryType = "arraybuffer";
    const h = i == null ? void 0 : i.onData;
    h && (this.dataChannel.addEventListener("message", (l) => {
      (async () => {
        try {
          if (l.data instanceof ArrayBuffer) {
            const { frameId: s, chunkIndex: c, totalChunks: y, payload: S } = j(l.data), f = this.reassembler.processChunk(s, c, y, S);
            if (f) {
              let u;
              f[0] === 31 && f[1] === 139 ? u = await Y(f) : u = f;
              const C = new TextDecoder("utf-8").decode(u), v = JSON.parse(C);
              await Promise.resolve(h(v)), this.maybeSendAck(s);
            }
          } else {
            const s = JSON.parse(l.data);
            h(s);
          }
        } catch (s) {
          console.error("[RFWebRTC] Failed to parse data channel message:", s);
        }
      })();
    }), this.dataChannel.addEventListener("error", (l) => {
      console.error("[RFWebRTC] Data channel error:", l);
    })), this.dataChannel.addEventListener("close", () => {
      this.reassembler.clear(), this.onComplete && this.onComplete();
    });
  }
  /**
   * Send cumulative ACK after a frame is fully handled.
   * Only used in batch mode (realtimeProcessing=false).
   */
  maybeSendAck(e) {
    this.ackPacingEnabled && this.dataChannel.readyState === "open" && this.dataChannel.send(JSON.stringify({ ack: e }));
  }
  /**
   * Get the remote stream (processed video from Roboflow)
   *
   * @returns Promise resolving to the remote MediaStream
   *
   * @example
   * ```typescript
   * const conn = await useStream({ ... });
   * const remoteStream = await conn.remoteStream();
   * videoElement.srcObject = remoteStream;
   * ```
   */
  async remoteStream() {
    return await this.remoteStreamPromise;
  }
  /**
   * Get the local stream (original camera)
   *
   * @returns The local MediaStream, or undefined if using file upload mode
   *
   * @example
   * ```typescript
   * const conn = await useStream({ ... });
   * const localStream = conn.localStream();
   * if (localStream) {
   *   videoElement.srcObject = localStream;
   * }
   * ```
   */
  localStream() {
    return this._localStream;
  }
  /**
   * Cleanup and close connection
   *
   * Terminates the pipeline on Roboflow, closes the peer connection,
   * and stops the local media stream (if applicable).
   *
   * @returns Promise that resolves when cleanup is complete
   *
   * @example
   * ```typescript
   * const conn = await useStream({ ... });
   * // ... use connection ...
   * await conn.cleanup(); // Clean up when done
   * ```
   */
  async cleanup() {
    if (this.uploader && this.uploader.cancel(), this.reassembler.clear(), this.pipelineId && this.apiKey)
      try {
        await k.init({ apiKey: this.apiKey }).terminatePipeline({ pipelineId: this.pipelineId });
      } catch (e) {
        console.warn("[RFWebRTC] Failed to terminate pipeline:", e);
      }
    this.peerConnection && this.peerConnection.connectionState !== "closed" && this.peerConnection.close(), this._localStream && A(this._localStream);
  }
  /**
   * Start uploading a file through the connection
   *
   * @param file - The file to upload
   * @param onProgress - Optional callback for progress updates (bytesUploaded, totalBytes)
   * @returns Promise that resolves when upload is complete
   * @throws Error if no upload channel is available
   *
   * @example
   * ```typescript
   * await connection.startUpload(videoFile, (uploaded, total) => {
   *   console.log(`Upload progress: ${(uploaded / total * 100).toFixed(1)}%`);
   * });
   * ```
   */
  async startUpload(e, t) {
    if (!this.uploadChannel)
      throw new Error("No upload channel available. This connection was not created for file uploads.");
    await ie(this.uploadChannel), this.uploader = new x(e, this.uploadChannel), await this.uploader.upload(t);
  }
  /**
   * Cancel any ongoing file upload
   */
  cancelUpload() {
    this.uploader && this.uploader.cancel();
  }
  /**
   * Reconfigure pipeline outputs at runtime
   *
   * Dynamically change stream and data outputs without restarting the connection.
   * Set a field to `null` to leave it unchanged, or to `null` value to enable all outputs,
   * or to `[]` to disable/auto-detect.
   *
   * @param config - Output configuration
   * @param config.streamOutput - Stream output names (null = unchanged, [] = auto-detect, ["name"] = specific output)
   * @param config.dataOutput - Data output names (null = unchanged, [] = disable, ["name"] = specific outputs, null value = all outputs)
   *
   * @example
   * ```typescript
   * // Change to different stream output
   * connection.reconfigureOutputs({
   *   streamOutput: ["annotated_image"],
   *   dataOutput: null  // unchanged
   * });
   *
   * // Enable all data outputs
   * connection.reconfigureOutputs({
   *   streamOutput: null,  // unchanged
   *   dataOutput: null     // null value = all outputs
   * });
   *
   * // Disable all data outputs
   * connection.reconfigureOutputs({
   *   streamOutput: null,  // unchanged
   *   dataOutput: []       // empty array = disable
   * });
   * ```
   */
  reconfigureOutputs(e) {
    const t = {};
    e.streamOutput !== void 0 && (t.stream_output = e.streamOutput), e.dataOutput !== void 0 && (t.data_output = e.dataOutput), this.sendData(t);
  }
  /**
   * Send data through the data channel
   * @private
   */
  sendData(e) {
    if (this.dataChannel.readyState !== "open") {
      console.warn("[RFWebRTC] Data channel is not open. Current state:", this.dataChannel.readyState);
      return;
    }
    try {
      const t = typeof e == "string" ? e : JSON.stringify(e);
      this.dataChannel.send(t);
    } catch (t) {
      console.error("[RFWebRTC] Failed to send data:", t);
    }
  }
}
async function P({
  source: r,
  rtspUrl: e,
  connector: t,
  wrtcParams: n,
  onData: a,
  onComplete: o,
  onFileUploadProgress: i,
  options: h = {},
  hooks: l
}) {
  var L;
  if (!t || typeof t.connectWrtc != "function")
    throw new Error("connector must have a connectWrtc method");
  const s = !!e, c = !s && r instanceof File, y = !s && !c && r ? r : void 0, S = c ? r : void 0;
  let f = n.iceServers;
  if ((!f || f.length === 0) && t.getIceServers)
    try {
      const g = await t.getIceServers();
      g && g.length > 0 && (f = g);
    } catch (g) {
      console.warn("[RFWebRTC] Failed to fetch TURN config, using defaults:", g);
    }
  const { pc: u, offer: p, remoteStreamPromise: C, dataChannel: v, uploadChannel: b } = await ne(
    y,
    S,
    f,
    e,
    l
  ), R = {
    ...n,
    iceServers: f,
    realtimeProcessing: n.realtimeProcessing ?? !c,
    rtspUrl: e
  }, w = await t.connectWrtc(
    { sdp: p.sdp, type: p.type },
    R
  ), m = { sdp: w.sdp, type: w.type };
  if (!(m != null && m.sdp) || !(m != null && m.type))
    throw console.error("[RFWebRTC] Invalid answer from server:", w), new Error("connector.connectWrtc must return answer with sdp and type");
  const E = ((L = w == null ? void 0 : w.context) == null ? void 0 : L.pipeline_id) || null;
  await u.setRemoteDescription(m), await new Promise((g, I) => {
    const _ = () => {
      u.connectionState === "connected" ? (u.removeEventListener("connectionstatechange", _), g()) : u.connectionState === "failed" && (u.removeEventListener("connectionstatechange", _), I(new Error("WebRTC connection failed")));
    };
    u.addEventListener("connectionstatechange", _), _(), setTimeout(() => {
      u.removeEventListener("connectionstatechange", _), I(new Error("WebRTC connection timeout after 30s"));
    }, 3e4);
  }), y && h.disableInputStreamDownscaling !== !1 && await ae(u);
  const W = t._apiKey || null, K = R.realtimeProcessing === !1, O = new q(
    u,
    C,
    E,
    W,
    v,
    {
      localStream: y,
      uploadChannel: b,
      onData: a,
      onComplete: o,
      ackPacingEnabled: K
    }
  );
  return S && b && O.startUpload(S, i).catch((g) => {
    console.error("[RFWebRTC] Upload error:", g);
  }), O;
}
async function oe({
  source: r,
  connector: e,
  wrtcParams: t,
  onData: n,
  options: a = {},
  hooks: o
}) {
  if (r instanceof File)
    throw new Error("useStream requires a MediaStream. Use useVideoFile for File uploads.");
  return P({
    source: r,
    connector: e,
    wrtcParams: t,
    onData: n,
    options: a,
    hooks: o
  });
}
async function se({
  file: r,
  connector: e,
  wrtcParams: t,
  onData: n,
  onUploadProgress: a,
  onComplete: o,
  hooks: i
}) {
  return P({
    source: r,
    connector: e,
    wrtcParams: {
      ...t,
      realtimeProcessing: t.realtimeProcessing ?? !0
    },
    onData: n,
    onComplete: o,
    onFileUploadProgress: a,
    hooks: i
  });
}
async function ce({
  rtspUrl: r,
  connector: e,
  wrtcParams: t,
  onData: n,
  hooks: a
}) {
  if (!r.startsWith("rtsp://") && !r.startsWith("rtsps://"))
    throw new Error("Invalid RTSP URL: must start with rtsp:// or rtsps://");
  return P({
    rtspUrl: r,
    connector: e,
    wrtcParams: t,
    onData: n,
    hooks: a
  });
}
const he = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ChunkReassembler: B,
  FileUploader: x,
  RFWebRTCConnection: q,
  parseBinaryHeader: j,
  useRtspStream: ce,
  useStream: oe,
  useVideoFile: se
}, Symbol.toStringTag, { value: "Module" }));
export {
  k as InferenceHTTPClient,
  U as WorkflowError,
  de as connectors,
  ue as streams,
  he as webrtc
};
