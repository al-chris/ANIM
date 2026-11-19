/**
 * Frame-exact WebM export.
 *
 * Every frame is rendered for its exact timestamp (frame / fps), fully drawn, then handed to a WebCodecs
 * VideoEncoder with that timestamp. Nothing depends on wall-clock time, so slow frames can never be skipped,
 * merged or truncated — the video always has exactly duration × fps frames and a correct duration header.
 * The encoded frames are written into a WebM (Matroska) container by the small muxer below.
 */

export function canEncodeFrames() {
  return typeof VideoEncoder === 'function' && typeof VideoFrame === 'function';
}

/* Yield to the event loop without timers: background tabs throttle setTimeout to about once a second, which would make an
   export crawl if the user switches tabs. Message-channel tasks are not throttled. */
const channel = typeof MessageChannel === 'function' ? new MessageChannel() : null;
const pending = [];
if (channel) channel.port1.onmessage = () => { const r = pending.shift(); if (r) r(); };
function yieldTask() {
  if (!channel) return new Promise((resolve) => setTimeout(resolve, 0));
  return new Promise((resolve) => {
    pending.push(resolve);
    channel.port2.postMessage(0);
  });
}

const CODECS = [
  { codec: 'vp09.00.10.08', id: 'V_VP9' },
  { codec: 'vp8', id: 'V_VP8' }
];

async function pickCodec(width, height, fps) {
  for (const c of CODECS) {
    const config = {
      codec: c.codec,
      width,
      height,
      framerate: fps,
      bitrate: Math.min(16_000_000, Math.max(2_000_000, width * height * fps * 0.12)),
      latencyMode: 'quality'
    };
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if (support.supported) return { config: support.config || config, id: c.id };
    } catch {
      // try the next codec
    }
  }
  return null;
}

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas        the canvas each frame is drawn into (even width/height)
 * @param {number} o.frameCount
 * @param {number} o.fps
 * @param {(index:number, time:number) => (void|Promise<void>)} o.drawFrame  must leave the canvas fully drawn
 * @param {(progress:number) => void} [o.onProgress]
 */
export async function encodeFramesToWebM({ canvas, frameCount, fps, drawFrame, onProgress = () => {} }) {
  const { width, height } = canvas;
  const picked = await pickCodec(width, height, fps);
  if (!picked) throw new Error('This browser cannot encode VP9 or VP8 video.');

  const frames = [];
  let failure = null;
  const encoder = new VideoEncoder({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      frames.push({ time: chunk.timestamp / 1000, key: chunk.type === 'key', data });
    },
    error: (error) => {
      failure = error;
    }
  });
  encoder.configure(picked.config);

  const frameUs = 1e6 / fps;
  const keyEvery = Math.max(1, Math.round(fps * 2));
  try {
    for (let i = 0; i < frameCount; i++) {
      if (failure) throw failure;
      await drawFrame(i, i / fps);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) });
      encoder.encode(frame, { keyFrame: i % keyEvery === 0 });
      frame.close();
      // back-pressure: wait for the encoder's own dequeue events rather than a timer
      while (encoder.encodeQueueSize > 4 && !failure) {
        await new Promise((resolve) => encoder.addEventListener('dequeue', resolve, { once: true }));
      }
      onProgress((i + 1) / frameCount);
      if (i % 8 === 7) await yieldTask();
    }
    await encoder.flush();
    if (failure) throw failure;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  frames.sort((a, b) => a.time - b.time);
  return muxWebM({ width, height, codecId: picked.id, frames, durationMs: (frameCount * 1000) / fps });
}

/* ───────────────────────── minimal WebM muxer ───────────────────────── */

function idBytes(id) {
  const out = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v & 0xff);
  return out;
}

function uintBytes(value, width = 0) {
  const out = [];
  let v = Math.floor(value);
  do {
    out.unshift(v & 0xff);
    v = Math.floor(v / 256);
  } while (v > 0);
  while (out.length < width) out.unshift(0);
  return out;
}

function sizeBytes(size) {
  // 8-byte vint: 0x01 followed by 7 bytes of length
  const out = uintBytes(size, 7);
  return [0x01, ...out];
}

function concat(parts) {
  let length = 0;
  for (const p of parts) length += p.length;
  const out = new Uint8Array(length);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function el(id, payload) {
  const body = payload instanceof Uint8Array ? payload : concat(payload);
  return concat([Uint8Array.from(idBytes(id)), Uint8Array.from(sizeBytes(body.length)), body]);
}
const uint = (id, v, w) => el(id, Uint8Array.from(uintBytes(v, w)));
const str = (id, s) => el(id, new TextEncoder().encode(s));
function float(id, v) {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, v);
  return el(id, b);
}

function muxWebM({ width, height, codecId, frames, durationMs }) {
  const header = el(0x1a45dfa3, [
    uint(0x4286, 1), uint(0x42f7, 1), uint(0x42f2, 4), uint(0x42f3, 8),
    str(0x4282, 'webm'), uint(0x4287, 4), uint(0x4285, 2)
  ]);
  const info = el(0x1549a966, [
    uint(0x2ad7b1, 1_000_000),
    float(0x4489, durationMs),
    str(0x4d80, 'Lineart Studio'),
    str(0x5741, 'Lineart Studio')
  ]);
  const tracks = el(0x1654ae6b, [
    el(0xae, [
      uint(0xd7, 1), uint(0x73c5, 1), uint(0x83, 1), uint(0x9c, 0),
      str(0x86, codecId),
      uint(0x23e383, Math.round(1e9 * (durationMs / 1000) / Math.max(1, frames.length))),
      el(0xe0, [uint(0xb0, width), uint(0xba, height)])
    ])
  ]);

  // Clusters start at every key frame (and at least every 30 s), so each one is independently decodable.
  const clusters = [];
  let current = null;
  for (const f of frames) {
    const t = Math.round(f.time);
    if (!current || f.key || t - current.time > 30000) {
      current = { time: t, blocks: [] };
      clusters.push(current);
    }
    const rel = t - current.time;
    const head = new Uint8Array(4);
    head[0] = 0x81;
    new DataView(head.buffer).setInt16(1, rel);
    head[3] = f.key ? 0x80 : 0x00;
    current.blocks.push(el(0xa3, concat([head, f.data])));
  }
  const clusterBytes = clusters.map((c) => el(0x1f43b675, [uint(0xe7, c.time), ...c.blocks]));

  // SeekHead with fixed-width positions so its size is known before the positions are.
  const seekEntry = (id, pos) => el(0x4dbb, [el(0x53ab, Uint8Array.from(idBytes(id))), uint(0x53ac, pos, 8)]);
  const seekSize = el(0x114d9b74, [seekEntry(0x1549a966, 0), seekEntry(0x1654ae6b, 0), seekEntry(0x1c53bb6b, 0)]).length;
  const infoPos = seekSize;
  const tracksPos = infoPos + info.length;
  let pos = tracksPos + tracks.length;
  const cuePoints = [];
  clusterBytes.forEach((bytes, i) => {
    cuePoints.push(el(0xbb, [uint(0xb3, clusters[i].time), el(0xb7, [uint(0xf7, 1), uint(0xf1, pos, 8)])]));
    pos += bytes.length;
  });
  const cues = el(0x1c53bb6b, cuePoints);
  const seekHead = el(0x114d9b74, [seekEntry(0x1549a966, infoPos), seekEntry(0x1654ae6b, tracksPos), seekEntry(0x1c53bb6b, pos)]);

  const segment = el(0x18538067, [seekHead, info, tracks, ...clusterBytes, cues]);
  return new Blob([header, segment], { type: 'video/webm' });
}
