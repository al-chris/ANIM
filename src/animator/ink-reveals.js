/**
 * Ink reveals — nine canvas-rendered animation styles ported from the "墨 · Live Vector Ink" experiments.
 *
 * Unlike the mask-based reveals in pen-sketch.js, these re-pose the traced artwork's real Bézier points
 * every frame (springs, folds, hinges, magnetic pulls, vines) and redraw them on a 2D canvas.
 *
 * Ink modes (write-in reveals):  国风 Guofeng flow · 水墨 Ink wash · 书法 Calligraphy · 墨絵 Sumi-e
 * Vector reveals:                折纸 Origami · 磁吸 Magnetic · 百叶 Louver · 藤蔓 Vines · 万花 Kaleidoscope
 *
 * Every style has a natural "design" length (`span`, in seconds) that is stretched to the chosen duration.
 * All geometry is expressed in a design space with the same area as the original 1126×1500 experiment,
 * so the tuned constants carry over to any artwork size and aspect ratio.
 */

import { canEncodeFrames, encodeFramesToWebM } from './webm-writer.js';

const STYLES = {
  'ink-guofeng': { mode: 0, rv: 0, span: 8.4, trail: 0.16 },
  'ink-wash': { mode: 1, rv: 0, span: 7.0, trail: 0.22 },
  'ink-calligraphy': { mode: 2, rv: 0, span: 8.0, trail: 1 },
  'ink-sumie': { mode: 3, rv: 0, span: 8.4, trail: 1 },
  'ink-origami': { mode: -1, rv: 1, span: 9.6, trail: 1, design: 'packet' },
  'ink-origami-swan': { mode: -1, rv: 1, span: 9.6, trail: 1, design: 'swan' },
  'ink-origami-crane': { mode: -1, rv: 1, span: 9.6, trail: 1, design: 'crane' },
  'ink-origami-cat': { mode: -1, rv: 1, span: 9.6, trail: 1, design: 'cat' },
  'ink-origami-butterfly': { mode: -1, rv: 1, span: 9.6, trail: 1, design: 'butterfly' },
  'ink-origami-envelope': { mode: -1, rv: 1, span: 9.6, trail: 1, design: 'envelope' },
  'ink-origami-star': { mode: -1, rv: 1, span: 9.6, trail: 1, design: 'star' },
  'ink-magnetic': { mode: -1, rv: 2, span: 6.6, trail: 1 },
  'ink-louver': { mode: -1, rv: 3, span: 6.8, trail: 1 },
  'ink-vines': { mode: -1, rv: 4, span: 8.0, trail: 1 },
  'ink-kaleidoscope': { mode: -1, rv: 5, span: 6.2, trail: 1 }
};

export function isInkStyle(style) {
  return Object.prototype.hasOwnProperty.call(STYLES, style);
}

const PAPER = '#ffffff';
const INK = '#141414';
const RED = '#b3261e';
const RVD = 7;
const PF = 2400;

const ss = (a, b, x) => {
  x = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const eb = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2));

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────────────────────── SVG parsing ───────────────────────── */

function ancestorTranslate(el) {
  let x = 0;
  let y = 0;
  for (let node = el; node && node.nodeType === 1; node = node.parentNode) {
    const transform = node.getAttribute('transform');
    if (!transform) continue;
    const re = /translate\(\s*([-+\d.eE]+)(?:[\s,]+([-+\d.eE]+))?\s*\)/g;
    let match;
    while ((match = re.exec(transform))) {
      x += Number(match[1]);
      y += Number(match[2] || 0);
    }
  }
  return [x, y];
}

function inheritedFill(el) {
  for (let node = el; node && node.nodeType === 1; node = node.parentNode) {
    const value = node.getAttribute('fill') || (node.style && node.style.fill);
    if (value) return value;
  }
  return '#000000';
}

function inheritedOpacity(el) {
  let opacity = 1;
  for (let node = el; node && node.nodeType === 1; node = node.parentNode) {
    const own = node.getAttribute('opacity');
    const fill = node.getAttribute('fill-opacity');
    if (own !== null) opacity *= Number(own) || 0;
    if (fill !== null) opacity *= Number(fill) || 0;
  }
  return opacity;
}

/** Converts path data into subpaths of the form [x0,y0, c1x,c1y, c2x,c2y, x,y, …] (absolute cubic segments). */
function parsePathData(d) {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
  const subs = [];
  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let cur = null;
  let lastCtrl = null;
  const isCmd = (t) => /^[a-zA-Z]$/.test(t);
  const num = () => Number(tokens[i++]);
  const ensure = () => {
    if (!cur) {
      cur = [cx, cy];
      subs.push(cur);
    }
  };
  const cubic = (x1, y1, x2, y2, x, y) => {
    ensure();
    cur.push(x1, y1, x2, y2, x, y);
    lastCtrl = [x2, y2];
    cx = x;
    cy = y;
  };
  const line = (x, y) => {
    cubic(cx + (x - cx) / 3, cy + (y - cy) / 3, cx + (2 * (x - cx)) / 3, cy + (2 * (y - cy)) / 3, x, y);
    lastCtrl = null;
  };

  while (i < tokens.length) {
    if (isCmd(tokens[i])) cmd = tokens[i++];
    else if (!cmd) {
      i++;
      continue;
    }
    const rel = cmd !== cmd.toUpperCase();
    const C = cmd.toUpperCase();
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    const need = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }[C];
    if (need === undefined) {
      i++;
      continue;
    }
    if (C === 'Z') {
      if (cur && (cx !== sx || cy !== sy)) line(sx, sy);
      cx = sx;
      cy = sy;
      cur = null;
      lastCtrl = null;
      while (i < tokens.length && !isCmd(tokens[i])) i++;
      continue;
    }
    if (i + need > tokens.length || tokens.slice(i, i + need).some(isCmd)) {
      i++;
      continue;
    }
    if (C === 'M') {
      const x = num() + ox;
      const y = num() + oy;
      cur = [x, y];
      subs.push(cur);
      cx = sx = x;
      cy = sy = y;
      lastCtrl = null;
      cmd = rel ? 'l' : 'L';
    } else if (C === 'L') {
      line(num() + ox, num() + oy);
    } else if (C === 'H') {
      line(num() + ox, cy);
    } else if (C === 'V') {
      line(cx, num() + oy);
    } else if (C === 'C') {
      const v = [num() + ox, num() + oy, num() + ox, num() + oy, num() + ox, num() + oy];
      cubic(...v);
    } else if (C === 'S') {
      const r1 = lastCtrl ? [2 * cx - lastCtrl[0], 2 * cy - lastCtrl[1]] : [cx, cy];
      const v = [num() + ox, num() + oy, num() + ox, num() + oy];
      cubic(r1[0], r1[1], ...v);
    } else if (C === 'Q' || C === 'T') {
      let qx;
      let qy;
      if (C === 'Q') {
        qx = num() + ox;
        qy = num() + oy;
      } else {
        qx = cx;
        qy = cy;
      }
      const x = num() + ox;
      const y = num() + oy;
      cubic(cx + (2 / 3) * (qx - cx), cy + (2 / 3) * (qy - cy), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y);
    } else if (C === 'A') {
      i += 5;
      line(num() + ox, num() + oy);
    }
  }
  return subs.filter((sub) => sub.length >= 8);
}

function parseArtwork(svgString) {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  const svg = doc.documentElement;
  if (doc.querySelector('parsererror') || svg.localName !== 'svg') {
    throw new Error('Could not read the SVG for the ink animation.');
  }
  const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const vx = vb.length === 4 ? vb[0] : 0;
  const vy = vb.length === 4 ? vb[1] : 0;
  const width = vb.length === 4 ? vb[2] : Number(svg.getAttribute('width')) || 1000;
  const height = vb.length === 4 ? vb[3] : Number(svg.getAttribute('height')) || 1000;

  const shapes = [];
  for (const el of svg.querySelectorAll('path')) {
    if (el.closest('defs, mask, clipPath')) continue;
    const fill = inheritedFill(el);
    if (!fill || fill === 'none') continue;
    const opacity = inheritedOpacity(el);
    if (opacity <= 0.001) continue;
    const subs = parsePathData(el.getAttribute('d') || '');
    if (subs.length === 0) continue;
    const [tx, ty] = ancestorTranslate(el);
    for (const sub of subs) {
      for (let k = 0; k < sub.length; k += 2) {
        sub[k] += tx - vx;
        sub[k + 1] += ty - vy;
      }
    }
    shapes.push({ subs, fill, opacity });
  }
  if (shapes.length === 0) throw new Error('No filled paths were found to animate in this artwork.');
  return { width, height, shapes };
}

/* ───────────────────────── Reveal engine ───────────────────────── */

export function createInkReveal(svgString, style) {
  const cfg = STYLES[style];
  if (!cfg) throw new Error(`Unknown ink animation style: ${style}`);
  const art = parseArtwork(svgString);
  const rand = mulberry32(0x5eed1e5 ^ art.shapes.length);
  const MODE = cfg.mode;
  const RV = cfg.rv;

  // Design space: same area as the 1126×1500 original, same aspect as the artwork.
  const K = Math.sqrt((art.width * art.height) / (1126 * 1500));
  const DW = art.width / K;
  const DH = art.height / K;
  const CXd = DW / 2;
  const CYd = DH / 2;

  /* points & per-path records */
  const pts = [];
  const M = [];
  for (const shape of art.shapes) {
    const s = pts.length / 2;
    const subs = [];
    let sx = 0;
    let sy = 0;
    let x0 = 1e9;
    let x1 = -1e9;
    let y0 = 1e9;
    let y1 = -1e9;
    for (const sub of shape.subs) {
      subs.push(sub.length / 2);
      for (let k = 0; k < sub.length; k += 2) {
        const x = sub[k] / K;
        const y = sub[k + 1] / K;
        pts.push(x, y);
        sx += x;
        sy += y;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    const cnt = pts.length / 2 - s;
    const cx = sx / cnt;
    const cy = sy / cnt;
    const row = Math.min(8, Math.floor(cy / (DH / 9)));
    const fx = cx / DW;
    M.push({
      s, cnt, subs, cx, cy, col: shape.fill, op: shape.opacity,
      bx0: x0, bx1: x1, by0: y0, by1: y1,
      rad: Math.hypot(x1 - x0, y1 - y0) / 2,
      ord: (row + (row % 2 ? 1 - fx : fx)) / 9.02,
      ph: rand() * 6.28, rn: rand(), keep: false
    });
  }
  const sizes = M.map((m) => m.rad).sort((a, b) => a - b);
  const keepThreshold = sizes[Math.floor(sizes.length * 0.8)];
  const dcNorm = 0.88 * Math.hypot(DW / 2, 0.75 * DH / 2);
  const washNorm = DW * 0.5 + DH * 0.35;
  const NP = pts.length / 2;
  const R = Float32Array.from(pts);
  const D = new Float32Array(NP * 2);
  const V = new Float32Array(NP * 2);
  const XS = new Float32Array(NP);
  const YS = new Float32Array(NP);
  for (const m of M) {
    m.keep = m.rad >= keepThreshold || rand() < 0.06;
    m.dx = m.cx - CXd;
    m.dy = m.cy - CYd;
    m.dc = Math.hypot(m.dx, m.dy * 0.75) / dcNorm;
    m.wp = (m.cx * 0.5 + m.cy * 0.35) / washNorm;
    let L = 0;
    let k = m.s;
    for (const n of m.subs) {
      for (let j = 0; j + 3 < n; j += 3) {
        L += Math.hypot(R[2 * (k + j + 3)] - R[2 * (k + j)], R[2 * (k + j + 3) + 1] - R[2 * (k + j) + 1]);
      }
      k += n;
    }
    m.len = L * 1.15 + 4;
  }

  /* wobble field: sin(a + b) = sin a·cos b + cos a·sin b with the static parts cached per point */
  const WOB = MODE === 0 || MODE === 1 || MODE === 3;
  const W1 = WOB ? new Float32Array(NP * 6) : null;
  if (WOB) {
    for (let k = 0; k < NP; k++) {
      const x = R[2 * k];
      const y = R[2 * k + 1];
      W1[6 * k] = Math.sin(y * 0.006);
      W1[6 * k + 1] = Math.cos(y * 0.006);
      W1[6 * k + 2] = Math.sin(x * 0.005);
      W1[6 * k + 3] = Math.cos(x * 0.005);
      W1[6 * k + 4] = Math.sin((x + y) * 0.004);
      W1[6 * k + 5] = Math.cos((x + y) * 0.004);
    }
  }
  const LUT_N = 4096;
  const LUT_R = 4.4;
  const COS = new Float32Array(LUT_N + 1);
  const SIN = new Float32Array(LUT_N + 1);
  for (let i = 0; i <= LUT_N; i++) {
    const a = (i / LUT_N) * 2 * LUT_R - LUT_R;
    COS[i] = Math.cos(a);
    SIN[i] = Math.sin(a);
  }

  /* per-frame canvas state */
  let g = null;
  let W = 1;
  let H = 1;
  let S = 1;
  let u = 1;
  const ox = 0;
  const oy = 0;
  let PX = 0;
  let PY = 0;
  let lastE = -1;
  let lastT = 0;
  const O = {};
  const dryCache = new Map();

  function dry(color) {
    let entry = dryCache.get(color);
    if (!entry) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d');
      const r = mulberry32(77);
      x.fillStyle = color;
      for (let y = 0; y < 128; y++) {
        if (r() < 0.3) continue;
        let p = 0;
        while (p < 128) {
          const l = 4 + r() * 34;
          if (r() > 0.25) x.fillRect(p, y, l, 1);
          p += l + r() * 10;
        }
      }
      entry = { canvas: c, pattern: null, ctx: null, scale: 0 };
      dryCache.set(color, entry);
    }
    if (entry.ctx !== g || entry.scale !== u) {
      entry.pattern = g.createPattern(entry.canvas, 'repeat');
      if (entry.pattern && entry.pattern.setTransform) entry.pattern.setTransform(new DOMMatrix().scale(u));
      entry.ctx = g;
      entry.scale = u;
    }
    return entry.pattern || color;
  }

  const inR = (x0, x1, y0, y1) => {
    const L = [];
    M.forEach((m, i) => {
      if (m.bx1 >= x0 - 2 && m.bx0 <= x1 + 2 && m.by1 >= y0 - 2 && m.by0 <= y1 + 2) L.push(i);
    });
    return L;
  };

  function tracePath(m) {
    g.beginPath();
    let k = m.s;
    for (const n of m.subs) {
      g.moveTo(XS[k], YS[k]);
      for (let j = 1; j < n; j += 3) {
        g.bezierCurveTo(XS[k + j], YS[k + j], XS[k + j + 1], YS[k + j + 1], XS[k + j + 2], YS[k + j + 2]);
      }
      g.closePath();
      k += n;
    }
  }

  /** Fills a list of paths whose points are mapped through `f` (which writes PX/PY). */
  function paint(L, f, aM) {
    for (const i of L) {
      const m = M[i];
      const al = m.op * aM;
      if (al < 0.01) continue;
      for (let k = m.s; k < m.s + m.cnt; k++) {
        f(R[2 * k], R[2 * k + 1]);
        XS[k] = PX;
        YS[k] = PY;
      }
      g.globalAlpha = al;
      g.fillStyle = m.col;
      tracePath(m);
      g.fill();
    }
  }

  function poly(Q) {
    g.beginPath();
    g.moveTo(Q[0], Q[1]);
    for (let i = 2; i < Q.length; i += 2) g.lineTo(Q[i], Q[i + 1]);
    g.closePath();
  }

  /* ── 折纸 ORIGAMI ENGINE: the artwork is one sheet folded into a model (packet, swan, crane, cat, butterfly, envelope, star);
     it unfolds last-fold-first in true 3D — rigid faces rotating about their hinges, perspective, layered stacking, shading.
     Designs are plain records (the DESIGNS table below); folds are written in the CURRENT folded state, like a diagram:
       fd(frame,p,q,w,opts)    crease through p,q; w = any point on the side that moves
       cr(frame,p,deg,w,opts)  crease through p at `deg` degrees
       opts: sd (+1 toward the viewer / -1 away), ang (< PI keeps the flap raised in 3D), x:[p,q,w] second bounding line,
             only:j (move just the layers fold j carried), not:[j…] (leave those layers behind)
     Design coordinates use a 1126-unit square and are scaled to the artwork; the strip beyond the square is folded in first. */
  const ORI = RV === 1 ? (() => {
    const PI = Math.PI;
    const R2 = Math.SQRT2;
    const U = 1126;
    const S0 = Math.min(DW, DH);
    const sc = S0 / U;
    const HF = S0 / 2;
    const LG = U * R2;
    const T8 = Math.tan(PI / 8);
    const T16 = Math.tan(PI / 16);
    const FR = {
      raw: (a, b) => [a, b],
      sheet: (a, b) => [a * sc, b * sc],
      swan: (a, b) => [((a + b) / R2) * sc, S0 + ((b - a) / R2) * sc],
      cat: (a, b) => [HF + ((a - b) / R2) * sc, HF + ((a + b) / R2) * sc],
      dia: (a, b) => [HF + ((a + b) / R2) * sc, HF + ((b - a) / R2) * sc]
    };
    const ln = (fr, p, q, w) => {
      const f = FR[fr];
      const A = f(...p);
      const B = f(...q);
      const Wp = f(...w);
      let nx = A[1] - B[1];
      let ny = B[0] - A[0];
      const L = Math.hypot(nx, ny);
      nx /= L;
      ny /= L;
      let c = nx * A[0] + ny * A[1];
      if (nx * Wp[0] + ny * Wp[1] < c) {
        nx = -nx;
        ny = -ny;
        c = -c;
      }
      return [nx, ny, c];
    };
    const fd = (fr, p, q, w, o = {}) => [...ln(fr, p, q, w), o.sd || 1, o.x ? ln(fr, ...o.x) : null, o.ang || PI, o];
    const cr = (fr, p, deg, w, o) => {
      const r = (deg * PI) / 180;
      return fd(fr, p, [p[0] + Math.cos(r) * 100, p[1] + Math.sin(r) * 100], w, o);
    };
    const pol = (p, deg, d) => [p[0] + Math.cos((deg * PI) / 180) * d, p[1] + Math.sin((deg * PI) / 180) * d];
    const SQ = 'SQ';
    const KA = fd('swan', [0, 0], [1e3, T8 * 1e3], [500, 400]);
    const KB = fd('swan', [0, 0], [1e3, -T8 * 1e3], [500, -400]);
    const HALF = fd('swan', [0, 0], [1e3, 0], [500, 300]);
    const nk = (a1) => fd('swan', [a1, 0], [a1 + 100, 100], [a1 - 150, 0]);
    const bk = (a1) => fd('swan', [0.942 * a1, -0.658 * a1], [0.942 * a1 + 74, -0.658 * a1 + 67.3], [a1, -a1], { x: [[a1 + 3, -1e3], [a1 + 3, 1e3], [a1 - 50, -300]] });
    const N1 = 560;
    const N2 = LG - 560;
    const NH = pol([N1, 0], 115, 445);
    const NX = pol([N1, 0], 115, 415);
    const NT = pol([N1, 0], 115, 560);
    const NL = (o) => ({ x: [[N1, -1e3], [N1, 1e3], [0, 0]], ...o });
    const TL = (o) => ({ x: [[N2, -1e3], [N2, 1e3], [LG, 0]], ...o });
    const XP = { not: [5, 6, 7, 8] };
    const DESIGNS = {
      packet: {
        f: [fd('raw', [0.5 * DW, 0], [0.5 * DW, 1], [DW, 0], { sd: -1 }), fd('raw', [0, 0.5 * DH], [1, 0.5 * DH], [0, DH]),
          fd('raw', [0.25 * DW, 0], [0.25 * DW, 1], [0, 0], { sd: -1 }), fd('raw', [0, 0.25 * DH], [1, 0.25 * DH], [0, 0]),
          fd('raw', [0, 0.375 * DH], [1, 0.375 * DH], [0, DH])],
        rot: [0, -0.15], noSquare: true
      },
      swan: { f: [SQ, KA, KB, HALF, nk(0.72 * U), bk(0.72 * U)], rot: [3, 0.7854] },
      crane: {
        f: [SQ,
          fd('swan', [0, 0], [1e3, T8 * 1e3], [300, 200], NL()), fd('swan', [0, 0], [1e3, -T8 * 1e3], [300, -200], NL()),
          fd('swan', [LG, 0], [LG - 1e3, T8 * 1e3], [LG - 300, 200], TL()), fd('swan', [LG, 0], [LG - 1e3, -T8 * 1e3], [LG - 300, -200], TL()),
          fd('swan', [0, 0], [1e3, T16 * 1e3], [300, 100], NL()), fd('swan', [0, 0], [1e3, -T16 * 1e3], [300, -100], NL()),
          fd('swan', [LG, 0], [LG - 1e3, T16 * 1e3], [LG - 300, 100], TL()), fd('swan', [LG, 0], [LG - 1e3, -T16 * 1e3], [LG - 300, -100], TL()),
          fd('swan', [N1, 150], [796, 796], [N1, 500], { x: [[0, 160], [1e3, 160], [796, 500]] }), fd('swan', [N2, 150], [796, 796], [N2, 500], { x: [[0, 160], [1e3, 160], [796, 500]] }),
          fd('swan', [N1, -150], [796, -796], [N1, -500], { x: [[0, -160], [1e3, -160], [796, -500]] }), fd('swan', [N2, -150], [796, -796], [N2, -500], { x: [[0, -160], [1e3, -160], [796, -500]] }),
          fd('swan', [0, 150], [1e3, 150], [796, 400], { ang: 0.8 }), fd('swan', [0, -150], [1e3, -150], [796, -400], { ang: 0.8 }),
          fd('swan', [0, 0], [1e3, 0], [500, -300]),
          cr('swan', [N1, 0], 147.5, [N1 - 150, 20], { x: [[N1 + 40, -1e3], [N1 + 40, 1e3], [0, 0]] }),
          cr('swan', [N2, 0], 32.5, [N2 + 150, 20], { x: [[N2 - 40, -1e3], [N2 - 40, 1e3], [LG, 0]] }),
          cr('swan', NH, 157.5, NT, { x: [NX, pol(NX, 25, 100), NT], only: 16 })],
        rot: [15, 0.7854 + PI], tilt: 0.5, flap: [[13, 14], 0.32, 3],
        dec: [['crest', 'swan', ...pol(NH, 90, 16), 17], ['dot', 'swan', ...pol(NH, 200, 34), 8]]
      },
      cat: {
        f: [SQ, fd('dia', [-1e3, 0], [1e3, 0], [0, 600]), fd('dia', [-1e3, -398], [1e3, -398], [0, -600]),
          cr('dia', [-330, 0], 40, [-700, -10]), cr('dia', [330, 0], 140, [700, -10])],
        rot: [1, 0.7854], tilt: 0.12,
        dec: [['eye', 'dia', -165, -232, 50], ['eye', 'dia', 165, -232, 50], ['nose', 'dia', 0, -128, 26], ['whisk', 'dia', 0, -112, 1]]
      },
      butterfly: {
        f: [SQ,
          fd('sheet', [110, 0], [563, 330], [400, 20], { x: [[563, -1e3], [563, 1e3], [100, 0]] }), fd('sheet', [1016, 0], [563, 330], [726, 20], { x: [[563, -1e3], [563, 1e3], [1026, 0]] }),
          fd('sheet', [110, 1126], [563, 796], [400, 1106], { x: [[563, -1e3], [563, 1e3], [100, 0]] }), fd('sheet', [1016, 1126], [563, 796], [726, 1106], { x: [[563, -1e3], [563, 1e3], [1026, 0]] }),
          fd('sheet', [0, 450], [190, 563], [0, 530], { x: [[-1e3, 563], [1e3, 563], [0, 0]] }), fd('sheet', [0, 676], [190, 563], [0, 600], { x: [[-1e3, 563], [1e3, 563], [0, 1126]] }),
          fd('sheet', [1126, 450], [936, 563], [1126, 530], { x: [[-1e3, 563], [1e3, 563], [0, 0]] }), fd('sheet', [1126, 676], [936, 563], [1126, 600], { x: [[-1e3, 563], [1e3, 563], [0, 1126]] }),
          fd('sheet', [563, -1e3], [563, 1e3], [100, 563], { ang: 0.42 }), fd('sheet', [563, -1e3], [563, 1e3], [1026, 563], { ang: 0.42 })],
        rot: [1, 0], tilt: 0.22, flap: [[9, 10], 0.3, 4.2], dec: [['body', 'sheet', 563, 560, 1]]
      },
      envelope: {
        f: [SQ, fd('dia', [-398, -1e3], [-398, 1e3], [-600, 0]), fd('dia', [398, -1e3], [398, 1e3], [600, 0]),
          fd('dia', [-1e3, 300], [1e3, 300], [0, 600]), fd('dia', [-1e3, -260], [1e3, -260], [0, -600], { ang: 2.85 })],
        rot: [1, 0.7854], tilt: 0.28, dec: [['seal', 'dia', 0, 205, 62]]
      },
      star: {
        f: [SQ, fd('dia', [-398, -1e3], [-398, 1e3], [-600, 0]), fd('dia', [398, -1e3], [398, 1e3], [600, 0]),
          fd('dia', [-1e3, 398], [1e3, 398], [0, 600]), fd('dia', [-1e3, -398], [1e3, -398], [0, -600]),
          fd('dia', [-370, -1e3], [-370, 1e3], [-100, 0], { only: 1 }), fd('dia', [370, -1e3], [370, 1e3], [100, 0], { only: 2 }),
          fd('dia', [-1e3, 370], [1e3, 370], [0, 100], { only: 3 }), fd('dia', [-1e3, -370], [1e3, -370], [0, -100], { only: 4 }),
          cr('dia', [-740, 0], -22.5, [-420, -250], { only: 5 }), cr('dia', [-740, 0], 22.5, [-420, 250], { only: 5 }),
          cr('dia', [740, 0], 202.5, [420, -250], { only: 6 }), cr('dia', [740, 0], 157.5, [420, 250], { only: 6 }),
          cr('dia', [0, 740], -67.5, [250, 420], { only: 7 }), cr('dia', [0, 740], -112.5, [-250, 420], { only: 7 }),
          cr('dia', [0, -740], 67.5, [250, -420], { only: 8 }), cr('dia', [0, -740], 112.5, [-250, -420], { only: 8 }),
          fd('dia', [-398, -160], [-160, -398], [-398, -398], XP), fd('dia', [398, -160], [160, -398], [398, -398], XP),
          fd('dia', [-398, 160], [-160, 398], [-398, 398], XP), fd('dia', [398, 160], [160, 398], [398, 398], XP)],
        rot: [1, 0.7854], tilt: 0.3, dec: [['knot', 'dia', 0, 0, 64]]
      }
    };
    const des = DESIGNS[cfg.design] || DESIGNS.packet;

    /* square the sheet: fold the strip beyond the square in (accordion-style if it is longer than the square) */
    const sqFolds = [];
    if (!des.noSquare) {
      const port = DH >= DW;
      const len = port ? DH : DW;
      sqFolds.push(port ? [0, 1, S0, 1, null, PI, {}] : [1, 0, S0, 1, null, PI, {}]);
      if (len > 2 * S0 + 0.5) sqFolds.push(port ? [0, -1, 0, 1, null, PI, {}] : [-1, 0, 0, 1, null, PI, {}]);
    }
    const shift = Math.max(0, sqFolds.length - 1);
    const mapIdx = (j) => (j >= 1 ? j + shift : j);
    const FO = [];
    for (const F of des.f) {
      if (F === SQ) {
        FO.push(...sqFolds);
        continue;
      }
      const o = F[6] || {};
      const o2 = { ...o };
      if (o.only != null) o2.only = mapIdx(o.only);
      if (o.not) o2.not = o.not.map(mapIdx);
      FO.push([F[0], F[1], F[2], F[3], F[4], F[5], o2]);
    }
    const NF = FO.length;
    const rk = mapIdx(des.rot[0]);
    const ra = des.rot[1];
    const flap = des.flap ? [des.flap[0].map(mapIdx), des.flap[1], des.flap[2]] : null;

    /* cut the sheet into rigid faces; raised (non-flat) folds don't mirror the paper for later creases */
    const clipP = (P, n0, n1, c, k) => {
      const o = [];
      for (let i = 0; i < P.length; i++) {
        const A = P[i];
        const B = P[(i + 1) % P.length];
        const dA = (n0 * A[0] + n1 * A[1] - c) * k;
        const dB = (n0 * B[0] + n1 * B[1] - c) * k;
        if (dA >= 0) o.push(A);
        if ((dA > 0 && dB < 0) || (dA < 0 && dB > 0)) {
          const t = dA / (dA - dB);
          o.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]);
        }
      }
      return o;
    };
    const area = (P) => {
      let s = 0;
      for (let i = 0; i < P.length; i++) {
        const A = P[i];
        const B = P[(i + 1) % P.length];
        s += A[0] * B[1] - B[0] * A[1];
      }
      return s / 2;
    };
    const AH = [];
    let cs = [{ P: [[0, 0], [DW, 0], [DW, DH], [0, DH]], T: [1, 0, 0, 1, 0, 0], f: [], z: 0 }];
    FO.forEach((F, i) => {
      const [nx, ny, c0] = F;
      const X = F[4];
      const op = F[6] || {};
      const flat = F[5] > PI - 1e-3;
      const r0 = 1 - 2 * nx * nx;
      const r1 = -2 * nx * ny;
      const r2 = 1 - 2 * ny * ny;
      const o = [];
      for (const C of cs) {
        const [a, b, c, d, e, f] = C.T;
        const keep = () => o.push({ P: C.P, T: C.T, f: C.f.concat(false), z: C.z });
        if ((op.only != null && !C.f[op.only]) || (op.not && op.not.some((j) => C.f[j]))) {
          keep();
          continue;
        }
        const mx = nx * a + ny * b;
        const my = nx * c + ny * d;
        const mc = c0 - nx * e - ny * f;
        const pos = clipP(C.P, mx, my, mc, 1);
        let mv = pos;
        let xs = [];
        if (X) {
          const px = X[0] * a + X[1] * b;
          const py = X[0] * c + X[1] * d;
          const pc = X[2] - X[0] * e - X[1] * f;
          mv = clipP(pos, px, py, pc, 1);
          xs = clipP(pos, px, py, pc, -1);
        }
        if (mv.length < 3 || Math.abs(area(mv)) < 40) {
          keep();
          continue;
        }
        o.push({
          P: mv,
          T: flat ? [r0 * a + r1 * b, r1 * a + r2 * b, r0 * c + r1 * d, r1 * c + r2 * d, r0 * e + r1 * f + 2 * c0 * nx, r1 * e + r2 * f + 2 * c0 * ny] : C.T,
          f: C.f.concat(true),
          z: C.z
        });
        for (const Q of [clipP(C.P, mx, my, mc, -1), xs]) {
          if (Q.length > 2 && Math.abs(area(Q)) >= 40) o.push({ P: Q, T: C.T, f: C.f.concat(false), z: C.z });
        }
      }
      let hi = -1e9;
      let lo = 1e9;
      let mh = -1e9;
      let ml = 1e9;
      for (const C of o) {
        hi = Math.max(hi, C.z);
        lo = Math.min(lo, C.z);
        if (C.f[i]) {
          mh = Math.max(mh, C.z);
          ml = Math.min(ml, C.z);
        }
      }
      if (mh < -1e8) mh = ml = hi;
      const ah = F[3] > 0 ? (hi + ml + 0.5) / 2 : (lo + mh - 0.5) / 2;
      AH[i] = ah;
      if (flat) o.forEach((C) => { if (C.f[i]) C.z = 2 * ah - C.z; });
      cs = o;
    });
    const faces = cs.map((C) => {
      let x0 = 1e9;
      let x1 = -1e9;
      let y0 = 1e9;
      let y1 = -1e9;
      for (const [x, y] of C.P) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
      return {
        P: C.P, f: C.f, x0, x1, y0, y1, L: inR(x0, x1, y0, y1), pa: area(C.P),
        m: new Float32Array(9), W: new Float32Array(C.P.length * 3), Q: new Float32Array(C.P.length * 2), nz: 1, zc: 0
      };
    });
    /* timeline: a short hold on the folded model, then the folds open last-first; the strip fold that squared the sheet
       opens last and gets extra time, since it changes the silhouette the most */
    const weights = FO.map((_, i) => (i < sqFolds.length ? 1.7 : 1));
    const unit = 6.9 / weights.reduce((a, b) => a + b, 0);
    const FT = new Array(NF);
    for (let i = NF - 1, t = 1.3; i >= 0; i--) {
      FT[i] = [t, weights[i] * unit * 0.95];
      t += weights[i] * unit;
    }
    const TH = new Array(NF).fill(0);
    const moveTilt = Math.max(des.tilt || 0, 0.42);
    return { FO, NF, AH, TH, FT, faces, rk, ra, flap, des, FR, sc, moveTilt };
  })() : null;

  const T0 = new Float32Array(3);
  function fxf(C, x, y, z, o) {
    const { FO, NF, AH, TH } = ORI;
    for (let i = 0; i < NF; i++) {
      if (!C.f[i] || Math.abs(TH[i]) < 1e-4) continue;
      const F = FO[i];
      const c = Math.cos(TH[i]);
      const s = Math.sin(TH[i]) * F[3];
      const d = x * F[0] + y * F[1] - F[2];
      const w = z - AH[i];
      const d2 = d * c - w * s;
      x += (d2 - d) * F[0];
      y += (d2 - d) * F[1];
      z = AH[i] + d * s + w * c;
    }
    o[0] = x;
    o[1] = y;
    o[2] = z;
  }
  /* camera: in-plane turn (GC,GN), pitch (TC,TS), perspective, then zoom GS and a screen offset (GOX,GOY).
     Perspective uses model depth only (never the zoom) and is clamped well in front of the camera, so geometry
     can never blow up, flip or vanish as a flap swings toward the viewer. */
  let GOX = 0;
  let GOY = 0;
  let GS = 1;
  let GC = 1;
  let GN = 0;
  let TC = 1;
  let TS = 0;
  let CM = null;
  const OPF = 3400;
  const persp = (zc) => OPF / Math.max(OPF * 0.4, OPF - zc);
  function pj(x, y, z) {
    x -= CXd;
    y -= CYd;
    const uu = x * GC - y * GN;
    const v = x * GN + y * GC;
    const k = persp(v * TS + z * TC) * GS;
    PX = ox + (CXd + uu * k + GOX) * S;
    PY = oy + (CYd + (v * TC - z * TS) * k + GOY) * S;
  }
  const cmap = (x, y) => {
    const m = CM;
    pj(m[0] + x * m[3] + y * m[6], m[1] + x * m[4] + y * m[7], m[2] + x * m[5] + y * m[8]);
  };
  function decoShape(kd, s) {
    g.lineCap = g.lineJoin = 'round';
    if (kd === 'eye') {
      g.fillStyle = '#f0c25e'; g.beginPath(); g.ellipse(0, 0, s, s * 0.62, 0, 0, 6.283); g.fill();
      g.lineWidth = s * 0.12; g.strokeStyle = '#1a120c'; g.stroke();
      g.fillStyle = '#1a120c'; g.beginPath(); g.ellipse(0, 0, s * 0.17, s * 0.55, 0, 0, 6.283); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(s * 0.28, -s * 0.2, s * 0.12, 0, 6.283); g.fill();
    } else if (kd === 'nose') {
      g.fillStyle = '#1a120c'; g.beginPath(); g.moveTo(-s, -s * 0.55); g.lineTo(s, -s * 0.55); g.lineTo(0, s * 0.5); g.closePath(); g.fill();
      g.strokeStyle = '#1a120c'; g.lineWidth = s * 0.28; g.beginPath(); g.moveTo(0, s * 0.5); g.lineTo(0, s * 1.3);
      g.moveTo(-s * 1.6, s * 1.6); g.quadraticCurveTo(-s * 0.8, s * 2.3, 0, s * 1.3); g.quadraticCurveTo(s * 0.8, s * 2.3, s * 1.6, s * 1.6); g.stroke();
    } else if (kd === 'whisk') {
      g.strokeStyle = '#f0c25e'; g.lineWidth = 7 * s; g.beginPath();
      for (const sx of [-1, 1]) for (const dy of [-34, 0, 34]) { g.moveTo(sx * 70, dy * 0.3); g.quadraticCurveTo(sx * 170, dy * 0.6 - 8, sx * 290, dy * 1.6 - 10); }
      g.stroke();
    } else if (kd === 'seal') {
      g.fillStyle = '#7d1a12'; g.beginPath();
      for (let i = 0; i < 14; i++) { const a = i * 0.4488; const r = s * (1 + 0.07 * Math.sin(i * 2.7)); if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r); else g.moveTo(r, 0); }
      g.closePath(); g.fill();
      g.fillStyle = '#e2b65c'; g.beginPath(); g.arc(0, 0, s * 0.78, 0, 6.283); g.fill();
      g.strokeStyle = '#b8862f'; g.lineWidth = s * 0.08; g.beginPath(); g.arc(0, 0, s * 0.62, 0, 6.283); g.stroke();
      g.fillStyle = '#8e1d17'; g.font = `${Math.round(s * 1.05)}px 'Ma Shan Zheng','STKaiti','KaiTi',serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('福', 0, s * 0.06);
    } else if (kd === 'knot') {
      g.fillStyle = '#e2b65c'; g.beginPath();
      for (let i = 0; i < 16; i++) { const a = (i * Math.PI) / 8 - Math.PI / 2; const r = i % 2 ? s * 0.42 : s; if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r); else g.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fill(); g.fillStyle = '#8e1d17'; g.beginPath(); g.arc(0, 0, s * 0.22, 0, 6.283); g.fill();
    } else if (kd === 'body') {
      g.fillStyle = '#1a120c'; g.beginPath(); g.ellipse(0, 40, 26, 250, 0, 0, 6.283); g.fill();
      g.beginPath(); g.arc(0, -232, 34, 0, 6.283); g.fill();
      g.strokeStyle = '#1a120c'; g.lineWidth = 9; g.beginPath();
      for (const sx of [-1, 1]) { g.moveTo(sx * 10, -258); g.quadraticCurveTo(sx * 40, -400, sx * 130, -430); }
      g.stroke(); g.fillStyle = '#f0c25e';
      for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * 130, -430, 16, 0, 6.283); g.fill(); }
      g.fillStyle = 'rgba(240,194,94,.55)'; for (let i = 0; i < 5; i++) g.fillRect(-26, -120 + i * 70, 52, 8);
    } else if (kd === 'crest') {
      g.fillStyle = '#d2382d'; g.beginPath(); g.arc(0, 0, s, 0, 6.283); g.fill();
    } else if (kd === 'dot') {
      g.fillStyle = '#1a120c'; g.beginPath(); g.arc(0, 0, s, 0, 6.283); g.fill();
    }
  }
  const inW = (Wv, n, x, y) => {
    let c = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = Wv[3 * i];
      const yi = Wv[3 * i + 1];
      const xj = Wv[3 * j];
      const yj = Wv[3 * j + 1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  /* camera framing for a pose: bounding box of the projected model → zoom and centre */
  function frameFor(rot, tl) {
    const gc = Math.cos(rot);
    const gn = Math.sin(rot);
    const tc = Math.cos(tl);
    const ts = Math.sin(tl);
    let X0 = 1e9;
    let X1 = -1e9;
    let Y0 = 1e9;
    let Y1 = -1e9;
    for (const C of ORI.faces) {
      for (const [x, y] of C.P) {
        fxf(C, x, y, 0, T0);
        const X = T0[0] - CXd;
        const Y = T0[1] - CYd;
        const v = X * gn + Y * gc;
        const k = persp(v * ts + T0[2] * tc);
        const px = (X * gc - Y * gn) * k;
        const py = (v * tc - T0[2] * ts) * k;
        if (px < X0) X0 = px;
        if (px > X1) X1 = px;
        if (py < Y0) Y0 = py;
        if (py > Y1) Y1 = py;
      }
    }
    const zoom = Math.max(1, Math.min(2.6, Math.min((DW * 0.6) / Math.max(1, X1 - X0), (DH * 0.6) / Math.max(1, Y1 - Y0))));
    return { zoom, cx: (X0 + X1) / 2, cy: (Y0 + Y1) / 2 };
  }
  /* Framing is computed once for every rest pose between folds and eased while a fold opens, so the camera never
     jumps from frame to frame when a large flap swings out. */
  let STAGES = null;
  function stages() {
    const { FO, NF, TH, rk, ra, des, moveTilt } = ORI;
    STAGES = [];
    for (let s = 0; s <= NF; s++) {
      for (let i = 0; i < NF; i++) TH[i] = i >= NF - s ? 0 : FO[i][5];
      const closed = rk < NF - s ? 1 : 0;
      STAGES.push(frameFor(ra * closed, s === 0 ? des.tilt || 0 : s < NF ? moveTilt : 0));
    }
    return STAGES;
  }
  /* q (= 1 / distance to camera) of a face's plane at screen point (x, y); q is affine in screen space for a flat face */
  function qAt(C, x, y) {
    const Q = C.Q;
    const n = C.P.length;
    let best = 0;
    let bi = 1;
    for (let i = 1; i < n - 1; i++) {
      const a = Math.abs((Q[2 * i] - Q[0]) * (Q[2 * i + 3] - Q[1]) - (Q[2 * i + 2] - Q[0]) * (Q[2 * i + 1] - Q[1]));
      if (a > best) {
        best = a;
        bi = i;
      }
    }
    const x0 = Q[0];
    const y0 = Q[1];
    const x1 = Q[2 * bi];
    const y1 = Q[2 * bi + 1];
    const x2 = Q[2 * bi + 2];
    const y2 = Q[2 * bi + 3];
    const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (Math.abs(d) < 1e-9) return C.iq[0];
    const l0 = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / d;
    const l1 = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / d;
    return l0 * C.iq[0] + l1 * C.iq[bi] + (1 - l0 - l1) * C.iq[bi + 1];
  }
  /* intersection of two convex screen polygons (Sutherland-Hodgman), as a flat [x, y, ...] list */
  function clipConvex(A, nA, B, nB) {
    let sb = 0;
    for (let i = 0; i < nB; i++) {
      const j = (i + 1) % nB;
      sb += B[2 * i] * B[2 * j + 1] - B[2 * j] * B[2 * i + 1];
    }
    const sg = sb > 0 ? 1 : -1;
    let out = Array.from(A).slice(0, 2 * nA);
    for (let i = 0; i < nB && out.length >= 6; i++) {
      const j = (i + 1) % nB;
      const ax = B[2 * i];
      const ay = B[2 * i + 1];
      const ex = B[2 * j] - ax;
      const ey = B[2 * j + 1] - ay;
      const inp = out;
      out = [];
      const m = inp.length / 2;
      for (let k = 0; k < m; k++) {
        const k2 = (k + 1) % m;
        const px = inp[2 * k];
        const py = inp[2 * k + 1];
        const qx = inp[2 * k2];
        const qy = inp[2 * k2 + 1];
        const dp = sg * (ex * (py - ay) - ey * (px - ax));
        const dq = sg * (ex * (qy - ay) - ey * (qx - ax));
        if (dp >= 0) out.push(px, py);
        if (dp >= 0 !== dq >= 0) {
          const t = dp / (dp - dq);
          out.push(px + (qx - px) * t, py + (qy - py) * t);
        }
      }
    }
    return out;
  }
  /* back-to-front order of facets. Whenever faces of two facets overlap on screen, their true depths are compared at a
     point inside the overlap and the farther facet is drawn first; the constraints are sorted topologically (ties and
     rare cycles fall back to average layer depth). Sorting by average depth alone misorders a swinging flap against a
     large flat face it crosses. */
  function orderFacets(groups) {
    const NG = groups.length;
    groups.forEach((G, i) => {
      G.idx = i;
      G.next = [];
      G.indeg = 0;
    });
    const items = [];
    for (const G of groups) for (const C of G.c) if (Math.abs(C.sa) > 0.5) items.push([G, C]);
    // each pair of facets is decided by an area-weighted vote over all their overlapping faces, so a large clear-cut overlap
    // outweighs a sliver near a shared hinge where two facets touch or barely cross
    const votes = new Map();
    for (let a = 0; a < items.length; a++) {
      const [GA, CA] = items[a];
      for (let b = a + 1; b < items.length; b++) {
        const [GB, CB] = items[b];
        if (GA === GB) continue;
        const A = CA.bb;
        const B = CB.bb;
        if (A[1] <= B[0] || B[1] <= A[0] || A[3] <= B[2] || B[3] <= A[2]) continue;
        const I = clipConvex(CA.Q, CA.P.length, CB.Q, CB.P.length);
        const m = I.length / 2;
        if (m < 3) continue;
        let ar = 0;
        let cx = 0;
        let cy = 0;
        for (let k = 0; k < m; k++) {
          const k2 = (k + 1) % m;
          ar += I[2 * k] * I[2 * k2 + 1] - I[2 * k2] * I[2 * k + 1];
          cx += I[2 * k];
          cy += I[2 * k + 1];
        }
        if (Math.abs(ar) < 2) continue;
        cx /= m;
        cy /= m;
        const za = OPF - 1 / qAt(CA, cx, cy);
        const zb = OPF - 1 / qAt(CB, cx, cy);
        if (Math.abs(za - zb) < 0.02) continue;
        const lo = GA.idx < GB.idx ? GA : GB;
        const hi = lo === GA ? GB : GA;
        const key = lo.idx * NG + hi.idx;
        let v = votes.get(key);
        if (!v) {
          v = { lo, hi, w: 0 };
          votes.set(key, v);
        }
        // positive weight: `hi` is nearer than `lo`
        const hiNearer = hi === GA ? za > zb : zb > za;
        v.w += (hiNearer ? 1 : -1) * Math.abs(ar);
      }
    }
    for (const { lo, hi, w } of votes.values()) {
      if (w === 0) continue;
      const far = w > 0 ? lo : hi;
      const near = w > 0 ? hi : lo;
      far.next.push(near);
      near.indeg++;
    }
    const out = [];
    const done = new Uint8Array(NG);
    for (let n = 0; n < NG; n++) {
      let pick = null;
      for (const G of groups) if (!done[G.idx] && G.indeg === 0 && (!pick || G.key < pick.key)) pick = G;
      if (!pick) for (const G of groups) if (!done[G.idx] && (!pick || G.key < pick.key)) pick = G;
      done[pick.idx] = 1;
      out.push(pick);
      for (const H of pick.next) H.indeg--;
    }
    return out;
  }
  function origami(e) {
    const { FO, NF, TH, FT, faces, rk, ra, flap, des, FR, sc, moveTilt } = ORI;
    const ST = STAGES || stages();
    const P = FT.map(([a, d]) => 1 - ss(a, a + d, e));
    P.forEach((p, i) => { TH[i] = FO[i][5] * p; });
    if (flap) for (const k of flap[0]) TH[k] += flap[1] * Math.sin(e * flap[2]) * P[k] * ss(0.6, 1.4, e);
    const intro = ss(0, 0.8, e);
    const A0 = 1; // the folded model is visible from the very first frame (no blank opening frame / thumbnail)
    const fin = ss(8.2, 9.2, e);
    const rot = ra * P[rk] - (1 - intro) * 0.5;
    /* a modest camera pitch while folds move, so flaps read in 3D instead of passing edge-on; eased flat during the last fold */
    const [la, ld] = FT[0];
    const tl = ((des.tilt || 0) + (moveTilt - (des.tilt || 0)) * ss(1.3, 1.9, e)) * (1 - ss(la, la + ld, e));
    const maxClosed = Math.max(...P);
    GC = Math.cos(rot);
    GN = Math.sin(rot);
    TC = Math.cos(tl);
    TS = Math.sin(tl);
    for (const C of faces) {
      const m = C.m;
      fxf(C, 0, 0, 0, T0); m[0] = T0[0]; m[1] = T0[1]; m[2] = T0[2];
      fxf(C, 1, 0, 0, T0); m[3] = T0[0] - m[0]; m[4] = T0[1] - m[1]; m[5] = T0[2] - m[2];
      fxf(C, 0, 1, 0, T0); m[6] = T0[0] - m[0]; m[7] = T0[1] - m[1]; m[8] = T0[2] - m[2];
      fxf(C, 0, 0, 1, T0); C.nz = T0[2] - m[2];
    }
    /* layer depth of every face (average model z of its corners) for back-to-front ordering. The camera only pitches
       modestly and always views the model's front, so model depth orders stacked layers exactly; camera-space depth
       would misorder parallel layers that sit in different parts of the model. */
    for (const C of faces) {
      let i = 0;
      C.zc = 0;
      for (const [x, y] of C.P) {
        fxf(C, x, y, 0, T0);
        C.W[3 * i] = T0[0]; C.W[3 * i + 1] = T0[1]; C.W[3 * i + 2] = T0[2];
        i++;
        C.zc += T0[2] / C.P.length;
      }
    }
    /* which rest poses we are between: stage s = number of folds already open */
    let s0 = 0;
    let uu = 0;
    for (let k = NF - 1; k >= 0; k--) {
      const [a, d] = FT[k];
      if (e >= a + d) s0 = NF - k;
      else {
        if (e > a) uu = ss(a, a + d, e);
        break;
      }
    }
    const A = ST[Math.min(NF, s0)];
    const B = ST[Math.min(NF, s0 + 1)];
    GS = (A.zoom + (B.zoom - A.zoom) * uu) * (0.75 + 0.25 * intro);
    GOX = -(A.cx + (B.cx - A.cx) * uu) * GS;
    GOY = -(A.cy + (B.cy - A.cy) * uu) * GS + Math.sin(e * 2.2) * 10 * (1 - ss(0.9, 1.3, e));
    g.globalAlpha = 0.08 * (1 - fin) * A0;
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    /* faces sharing a rigid transform form one flat facet: draw, clip and paint each facet once, back to front */
    const grp = new Map();
    for (const C of faces) {
      const m = C.m;
      const key = Array.prototype.map.call(m, (v, i) => v.toFixed(i < 3 ? 1 : 3)).join();
      let G = grp.get(key);
      if (!G) {
        G = { c: [], zc: 0, nz: C.nz, m };
        grp.set(key, G);
      }
      G.c.push(C);
      G.zc += C.zc;
    }
    /* project every face once: screen polygon, bounding box, signed screen area and, per corner, q = 1 / (distance to the
       camera). Under perspective q varies linearly across a flat face in screen space, so it gives each face's exact depth
       at any pixel. */
    const groups = [...grp.values()];
    const zFloor = Math.min(...groups.map((G) => G.zc / G.c.length));
    for (const G of groups) {
      CM = G.m;
      let wind = 0;
      for (const C of G.c) {
        const n = C.P.length;
        if (!C.iq || C.iq.length !== n) C.iq = new Float64Array(n);
        let x0 = 1e9;
        let x1 = -1e9;
        let y0 = 1e9;
        let y1 = -1e9;
        for (let i = 0; i < n; i++) {
          const [x, y] = C.P[i];
          cmap(x, y);
          C.Q[2 * i] = PX;
          C.Q[2 * i + 1] = PY;
          const X = C.W[3 * i] - CXd;
          const Y = C.W[3 * i + 1] - CYd;
          C.iq[i] = 1 / Math.max(OPF * 0.4, OPF - ((X * GN + Y * GC) * TS + C.W[3 * i + 2] * TC));
          if (PX < x0) x0 = PX;
          if (PX > x1) x1 = PX;
          if (PY < y0) y0 = PY;
          if (PY > y1) y1 = PY;
        }
        let aq = 0;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          aq += C.Q[2 * i] * C.Q[2 * j + 1] - C.Q[2 * j] * C.Q[2 * i + 1];
        }
        C.sa = aq / 2;
        C.bb = [x0, x1, y0, y1];
        // the side that shows is the one facing the camera as projected, summed over all of the facet's faces (area-weighted)
        wind += C.pa > 0 ? aq : -aq;
      }
      G.front = wind > 0;
      G.key = G.zc / G.c.length;
    }
    const ord = orderFacets(groups);
    ORI.lastOrder = ord;
    const path = (G, dx, dy) => {
      g.beginPath();
      for (const C of G.c) {
        const Q = C.Q;
        g.moveTo(Q[0] + dx, Q[1] + dy);
        for (let i = 2; i < Q.length; i += 2) g.lineTo(Q[i] + dx, Q[i + 1] + dy);
        g.closePath();
      }
    };
    for (const G of ord) {
      CM = G.m;
      const front = G.front;
      const nz = Math.abs(G.nz);
      const lift = Math.max(0, G.zc / G.c.length - zFloor) * GS;
      const sa = 0.11 * (1 - fin) * A0 * ss(6, 60, lift);
      if (sa > 0.004) {
        g.fillStyle = '#000';
        for (const k of [1, 0.66, 0.33]) {
          g.globalAlpha = sa;
          path(G, S * (6 + lift * 0.1) * k, S * (12 + lift * 0.2) * k);
          g.fill();
        }
      }
      g.globalAlpha = A0;
      g.fillStyle = front ? PAPER : '#a8231b';
      path(G, 0, 0);
      g.fill();
      // a hairline in the face's own colour closes antialiasing seams between neighbouring faces
      g.strokeStyle = g.fillStyle;
      g.lineWidth = Math.max(1, 0.6 * u);
      g.lineJoin = 'round';
      g.stroke();
      g.save();
      path(G, 0, 0);
      g.clip();
      if (front) {
        if (nz > 0.03) {
          const L = new Set();
          for (const C of G.c) for (const i of C.L) L.add(i);
          paint(L, cmap, A0 * Math.min(1, nz * 1.6));
        }
      } else {
        g.fillStyle = '#f0c25e';
        g.globalAlpha = A0 * 0.55;
        const r = 1.2 * u;
        const dot = DW / 36;
        g.beginPath();
        for (const C of G.c) {
          for (let x = Math.floor(C.x0 / dot) * dot + dot / 2; x < C.x1; x += dot) {
            for (let y = Math.floor(C.y0 / dot) * dot + dot / 2; y < C.y1; y += dot) {
              if ((Math.round(x / dot) + Math.round(y / dot)) % 2) continue;
              cmap(x, y);
              g.rect(PX - r, PY - r, 2 * r, 2 * r);
            }
          }
        }
        g.fill();
      }
      g.restore();
      const sh = front ? (1 - nz) * 0.42 : 0.06 + (1 - nz) * 0.38;
      if (sh > 0.005) {
        g.globalAlpha = A0 * sh;
        g.fillStyle = '#000';
        path(G, 0, 0);
        g.fill();
      }
      const ea = A0 * (front ? 0.28 : 0.5) * (1 - fin) * ss(0, 0.35, maxClosed);
      if (ea > 0.005) {
        g.globalAlpha = ea;
        g.strokeStyle = front ? INK : '#5e120d';
        g.lineWidth = Math.max(1, 0.5 * u);
        path(G, 0, 0);
        g.stroke();
      }
    }
    /* details ride on the topmost face under them and fade as the first crease opens */
    const da = A0 * ss(0.5, 0.95, P[NF - 1]) * (1 - fin);
    if (da > 0.01 && des.dec) {
      for (const [kd, fr, a, b, sz] of des.dec) {
        const [wx, wy] = FR[fr](a, b);
        let zt = -1e9;
        for (const C of faces) {
          const n = C.P.length;
          if (!inW(C.W, n, wx, wy)) continue;
          let z = 0;
          for (let i = 0; i < n; i++) z += C.W[3 * i + 2];
          z /= n;
          if (z > zt) zt = z;
        }
        pj(wx, wy, zt > -1e8 ? zt + 1 : 0);
        g.save();
        g.globalAlpha = da;
        g.translate(PX, PY);
        g.rotate(rot - ra * P[rk]);
        g.scale(S * GS * sc, S * GS * sc * TC);
        decoShape(kd, sz);
        g.restore();
      }
    }
  }

  /* ── 百叶 LOUVERS: sixteen lacquered slats (red & gold on the back, the artwork on the front) swing open top-down
     on damped hinges in perspective; light spills through the gaps, slats glint mid-turn, cords fade at rest. */
  const SLH = DH / 16;
  const SL = RV === 3
    ? Array.from({ length: 16 }, (_, j) => ({ yc: (j + 0.5) * SLH, ph: Math.PI, L: inR(-1e4, 1e4, j * SLH, (j + 1) * SLH) }))
    : [];
  const PFL = 1100;
  let LY = 0;
  let LC = 1;
  let LS = 0;
  const lmap = (x, y) => {
    const d = y - LY;
    const k = PFL / (PFL - d * LS);
    PX = ox + (CXd + (x - CXd) * k) * S;
    PY = oy + (CYd + (LY + d * LC - CYd) * k) * S;
  };
  function louver(e) {
    const fin = ss(5.5, 6.6, e);
    const A0 = ss(0, 0.3, e);
    const x0 = -20;
    const x1 = DW + 20;
    const h = SLH;
    const Q = [];
    SL.forEach((s, j) => {
      const t = e - 0.55 - j * 0.15;
      s.ph = t <= 0 ? Math.PI : Math.PI * Math.exp(-2.2 * t) * (Math.cos(2.6 * t) + 0.846 * Math.sin(2.6 * t));
    });
    g.globalAlpha = A0 * 0.1 * (1 - fin);
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    for (const s of SL) {
      const gap = 1 - Math.abs(Math.cos(s.ph));
      if (gap < 0.02 || fin >= 1) continue;
      const y0 = oy + (s.yc - h / 2) * S;
      const gr = g.createLinearGradient(0, y0, 0, y0 + h * S);
      gr.addColorStop(0, 'rgba(255,196,104,0)');
      gr.addColorStop(0.5, 'rgba(255,196,104,1)');
      gr.addColorStop(1, 'rgba(255,196,104,0)');
      g.globalAlpha = A0 * gap * 0.6 * (1 - fin);
      g.fillStyle = gr;
      g.fillRect(0, y0, W, h * S);
    }
    for (const s of SL.slice().sort((a, b) => Math.abs(b.yc - CYd) - Math.abs(a.yc - CYd))) {
      LY = s.yc;
      LC = Math.cos(s.ph);
      LS = Math.sin(s.ph);
      if (Math.abs(LC) < 0.012) continue;
      Q.length = 0;
      for (const [x, y] of [[x0, LY - h / 2], [x1, LY - h / 2], [x1, LY + h / 2], [x0, LY + h / 2]]) {
        lmap(x, y);
        Q.push(PX, PY);
      }
      const front = LC > 0;
      g.globalAlpha = A0;
      g.fillStyle = front ? PAPER : '#8f1d17';
      poly(Q);
      g.fill();
      if (front) {
        g.save();
        poly(Q);
        g.clip();
        paint(s.L, lmap, A0);
        g.restore();
      } else {
        g.strokeStyle = '#e2b65c';
        g.lineWidth = Math.max(u * 0.5, 2.2 * S);
        g.globalAlpha = A0 * 0.85;
        g.beginPath();
        for (const d of [-0.34, 0.34]) {
          lmap(x0, LY + d * h);
          g.moveTo(PX, PY);
          lmap(x1, LY + d * h);
          g.lineTo(PX, PY);
        }
        g.stroke();
        g.fillStyle = '#e2b65c';
        for (let x = DW / 36; x < DW; x += DW / 18) {
          lmap(x, LY);
          const r = Math.max(0.75 * u, 5 * S * Math.abs(LC));
          g.beginPath();
          g.moveTo(PX - r, PY);
          g.lineTo(PX, PY - r * 0.8);
          g.lineTo(PX + r, PY);
          g.lineTo(PX, PY + r * 0.8);
          g.fill();
        }
      }
      const sh = front ? (1 - LC) * 0.6 : 0.06 + (1 + LC) * 0.55;
      if (sh > 0.005) {
        g.globalAlpha = A0 * sh;
        g.fillStyle = '#000';
        poly(Q);
        g.fill();
      }
      const gl = Math.pow(Math.abs(Math.sin(2 * s.ph)), 3) * (1 - fin);
      if (gl > 0.01) {
        const ya = Math.min(Q[1], Q[5]);
        const yb = Math.max(Q[1], Q[5]) + 1;
        const gr = g.createLinearGradient(0, ya, 0, yb);
        gr.addColorStop(0, 'rgba(255,226,150,0)');
        gr.addColorStop(LS > 0 ? 0.25 : 0.75, 'rgba(255,226,150,1)');
        gr.addColorStop(1, 'rgba(255,226,150,0)');
        g.globalAlpha = A0 * gl * 0.5;
        g.fillStyle = gr;
        poly(Q);
        g.fill();
      }
      g.globalAlpha = A0 * 0.4 * (1 - fin);
      g.strokeStyle = front ? INK : '#3b0b08';
      g.lineWidth = Math.max(1, 0.5 * u);
      g.beginPath();
      g.moveTo(Q[0], Q[1]);
      g.lineTo(Q[2], Q[3]);
      g.moveTo(Q[6], Q[7]);
      g.lineTo(Q[4], Q[5]);
      g.stroke();
    }
    const ca = A0 * (1 - fin);
    if (ca > 0.01) {
      const cords = [DW * 0.133, DW * 0.867];
      g.strokeStyle = '#c99a3e';
      g.lineWidth = Math.max(1, 3 * S);
      g.globalAlpha = ca * 0.75;
      g.beginPath();
      for (const x of cords) {
        g.moveTo(ox + x * S, 0);
        g.lineTo(ox + x * S, H);
      }
      g.stroke();
      g.globalAlpha = ca;
      g.fillStyle = '#2a1a12';
      g.fillRect(0, 0, W, 22 * S);
      g.fillStyle = RED;
      for (const x of cords) {
        g.beginPath();
        g.arc(ox + x * S, H - 14 * S, 9 * S, 0, 6.283);
        g.fill();
      }
    }
  }

  /* ── 藤蔓 BOTANICAL VINES: tapered, shaded stems wind across the sheet, weaving over and under the art, unfurling
     two-tone leaves, curling tendrils and opening blossoms; each shape sprouts out of the first stem that reaches it. */
  const VT = 3.4;
  const VC = ['#24533a', '#2b6142', '#336b47'];
  const FLC = ['#c23b2a', '#d9577a', '#e08a2c', RED];
  const vte = (v, s) => v.d + VT * (1 - Math.sqrt(Math.max(0, 1 - s / v.L)));
  let VN = [];
  function vineInit() {
    VN = [];
    const sz = (DW + DH) / 2626;
    const margin = 70;
    [[-0.018, 0.767, -0.4], [1.018, 0.887, -2.7], [0.231, 1.013, -1.3], [1.018, 0.16, 2.8], [-0.018, 0.22, 0.3], [0.764, -0.013, 1.9], [0.551, 1.013, -1.75]]
      .forEach(([fx, fy, hd], i) => {
        let x = fx * DW;
        let y = fy * DH;
        const p = [];
        const f1 = 0.003 + rand() * 0.003;
        const f2 = 0.009 + rand() * 0.006;
        const p1 = rand() * 6.28;
        const p2 = rand() * 6.28;
        const A1 = 0.45 + rand() * 0.35;
        const cur = (rand() < 0.5 ? -1 : 1) * (0.0006 + rand() * 0.0006);
        const Lm = (1250 + rand() * 600) * sz;
        let s = 0;
        let a = hd;
        while (s < Lm) {
          a = hd + A1 * Math.sin(s * f1 + p1) + 0.3 * Math.sin(s * f2 + p2);
          p.push([x, y, s, a]);
          x += Math.cos(a) * 8;
          y += Math.sin(a) * 8;
          s += 8;
          hd += cur * 8;
          if (x < margin || x > DW - margin || y < margin || y > DH - margin) {
            let df = Math.atan2(CYd - y, CXd - x) - a;
            df = Math.atan2(Math.sin(df), Math.cos(df));
            hd += df * 0.07;
          }
        }
        const cs = cur > 0 ? 1 : -1;
        let r = 34;
        while (r > 5) {
          a += (cs * 4) / r;
          x += Math.cos(a) * 4;
          y += Math.sin(a) * 4;
          s += 4;
          r *= 0.975;
          p.push([x, y, s, a]);
        }
        const at = (q) => {
          let j = 0;
          while (j < p.length - 1 && p[j + 1][2] <= q) j++;
          return p[j];
        };
        const lv = [];
        const td = [];
        const fl = [];
        for (let q = 40 + rand() * 20, side = 1; q < Lm - 30; q += 36 + rand() * 26, side = -side) {
          const P = at(q);
          lv.push({ x: P[0], y: P[1], s: q, a: P[3] + side * (0.55 + rand() * 0.55), len: 34 + rand() * 32, red: rand() < 0.12, k: rand() });
        }
        for (let q = 170 + rand() * 90; q < Lm - 120; q += 190 + rand() * 130) {
          const P = at(q);
          const side = rand() < 0.5 ? 1 : -1;
          const tp = [];
          let ta = P[3] + side * 1.05;
          let tx = P[0];
          let ty = P[1];
          let tr = 70;
          while (tr > 4) {
            tp.push([tx, ty]);
            ta -= (side * 3) / tr;
            tx += Math.cos(ta) * 3;
            ty += Math.sin(ta) * 3;
            tr *= 0.955;
          }
          td.push({ s: q, p: tp });
        }
        const P = at(Lm - 10);
        fl.push({ x: P[0], y: P[1], s: Lm - 10, r: 26 + rand() * 10, rot: rand() * 6.28, c: FLC[i % 4] });
        for (let k = 0; k < 2; k++) {
          const q = Lm * (0.3 + 0.35 * k) + rand() * 80;
          const Q = at(q);
          fl.push({ x: Q[0], y: Q[1], s: q, r: 16 + rand() * 10, rot: rand() * 6.28, c: FLC[(i + k + 1) % 4] });
        }
        VN.push({ p, L: s, lv, td, fl, d: i * 0.17, par: i % 2, w: 9 + rand() * 4, c: VC[i % 3] });
      });
    for (const m of M) {
      let bt = 1e9;
      let bx = m.cx;
      let by = m.cy;
      for (const v of VN) {
        for (let j = 0; j < v.p.length; j += 3) {
          const P = v.p[j];
          const tt = vte(v, P[2]) + Math.hypot(P[0] - m.cx, P[1] - m.cy) / 650;
          if (tt < bt) {
            bt = tt;
            bx = P[0];
            by = P[1];
          }
        }
      }
      m.vt = bt + 0.05;
      m.vx = bx;
      m.vy = by;
    }
  }
  function vband(v, j0, j1, Lg, f1, f2, dx, dy) {
    const p = v.p;
    const width = (P) => v.w * (0.3 + 0.7 * (1 - P[2] / v.L)) * Math.min(1, 0.12 + (Lg - P[2]) / 70);
    g.beginPath();
    for (let j = j0; j <= j1; j++) {
      const P = p[j];
      const w = width(P);
      const X = ox + (P[0] - Math.sin(P[3]) * w * f1 + dx) * S;
      const Y = oy + (P[1] + Math.cos(P[3]) * w * f1 + dy) * S;
      if (j > j0) g.lineTo(X, Y);
      else g.moveTo(X, Y);
    }
    for (let j = j1; j >= j0; j--) {
      const P = p[j];
      const w = width(P);
      g.lineTo(ox + (P[0] - Math.sin(P[3]) * w * f2 + dx) * S, oy + (P[1] + Math.cos(P[3]) * w * f2 + dy) * S);
    }
    g.closePath();
  }
  function vrun(v, j0, j1, Lg, a) {
    g.globalAlpha = a * 0.16;
    g.fillStyle = '#000';
    vband(v, j0, j1, Lg, -1, 1, 5, 8);
    g.fill();
    g.globalAlpha = a;
    g.fillStyle = v.c;
    vband(v, j0, j1, Lg, -1, 1, 0, 0);
    g.fill();
    g.globalAlpha = a * 0.5;
    g.strokeStyle = '#10241a';
    g.lineWidth = Math.max(1, 0.5 * u);
    g.stroke();
    g.globalAlpha = a * 0.4;
    g.fillStyle = '#0c1d14';
    vband(v, j0, j1, Lg, 0.45, 1, 0, 0);
    g.fill();
    g.globalAlpha = a * 0.6;
    g.fillStyle = '#86b874';
    vband(v, j0, j1, Lg, -0.7, -0.25, 0, 0);
    g.fill();
  }
  function leaf(L, s, a, fall) {
    const c = Math.cos(L.a);
    const n = Math.sin(L.a);
    const l = L.len * s;
    const w = l * 0.5;
    let X = L.x;
    let Y = L.y;
    if (fall > 0) {
      Y += fall * fall * (160 + L.len * 2.5);
      X += Math.sin(fall * 5 + L.k * 6) * 36 * fall;
    }
    const sx = (x) => ox + x * S;
    const sy = (y) => oy + y * S;
    const tx = X + c * l;
    const ty = Y + n * l;
    const mx = X + c * l * 0.45;
    const my = Y + n * l * 0.45;
    const w2 = w * Math.min(1, s * s);
    const tones = L.red ? ['#d4553f', '#952a1c'] : ['#6aa85f', '#2e6a43'];
    g.globalAlpha = a * 0.15;
    g.fillStyle = '#000';
    g.beginPath();
    g.moveTo(sx(X + 4), sy(Y + 6));
    g.quadraticCurveTo(sx(mx - n * w + 4), sy(my + c * w + 6), sx(tx + 4), sy(ty + 6));
    g.quadraticCurveTo(sx(mx + n * w2 + 4), sy(my - c * w2 + 6), sx(X + 4), sy(Y + 6));
    g.fill();
    g.globalAlpha = a;
    g.fillStyle = tones[0];
    g.beginPath();
    g.moveTo(sx(X), sy(Y));
    g.quadraticCurveTo(sx(mx - n * w), sy(my + c * w), sx(tx), sy(ty));
    g.lineTo(sx(X), sy(Y));
    g.fill();
    g.fillStyle = tones[1];
    g.beginPath();
    g.moveTo(sx(X), sy(Y));
    g.quadraticCurveTo(sx(mx + n * w2), sy(my - c * w2), sx(tx), sy(ty));
    g.lineTo(sx(X), sy(Y));
    g.fill();
    g.globalAlpha = a * 0.7;
    g.strokeStyle = '#173323';
    g.lineWidth = Math.max(0.35 * u, 1.3 * S);
    g.beginPath();
    g.moveTo(sx(X), sy(Y));
    g.lineTo(sx(tx), sy(ty));
    for (let k = 1; k < 4; k++) {
      const bx = X + c * l * k * 0.22;
      const by = Y + n * l * k * 0.22;
      g.moveTo(sx(bx), sy(by));
      g.lineTo(sx(bx + c * l * 0.14 - n * w * 0.32), sy(by + n * l * 0.14 + c * w * 0.32));
    }
    g.stroke();
  }
  function flower(F, b, a) {
    const X = ox + F.x * S;
    const Y = oy + F.y * S;
    const r = F.r * b * S;
    const ro = F.rot + (1 - Math.min(1, b)) * 1.6;
    if (r < 0.5) return;
    for (const [k0, rs, al] of [[0, 1, 1], [0.63, 0.7, 0.85]]) {
      for (let k = 0; k < 5; k++) {
        const an = ro + k0 + k * 1.2566;
        g.globalAlpha = a * al;
        g.fillStyle = F.c;
        g.beginPath();
        g.ellipse(X + Math.cos(an) * r * rs * 0.55, Y + Math.sin(an) * r * rs * 0.55, r * rs * 0.56, r * rs * 0.34, an, 0, 6.283);
        g.fill();
        g.globalAlpha = a * al * 0.35;
        g.fillStyle = '#000';
        g.beginPath();
        g.ellipse(X + Math.cos(an) * r * rs * 0.35, Y + Math.sin(an) * r * rs * 0.35, r * rs * 0.3, r * rs * 0.12, an, 0, 6.283);
        g.fill();
      }
    }
    g.globalAlpha = a;
    g.fillStyle = '#f0c25e';
    g.beginPath();
    g.arc(X, Y, r * 0.2, 0, 6.283);
    g.fill();
    g.fillStyle = '#7a3b10';
    for (let k = 0; k < 7; k++) {
      const an = k * 0.8976 + ro;
      g.beginPath();
      g.arc(X + Math.cos(an) * r * 0.3, Y + Math.sin(an) * r * 0.3, Math.max(0.3 * u, r * 0.045), 0, 6.283);
      g.fill();
    }
  }
  function vines(e, over) {
    const a = 1 - ss(RVD - 1.4, RVD + 0.8, e);
    const fall = ss(RVD - 1.6, RVD + 0.8, e);
    if (a < 0.01) return;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    const lay = (v, s) => (Math.floor(s / 150) + v.par) % 2;
    for (const v of VN) {
      const uu = cl((e - v.d) / VT);
      const Lg = v.L * (1 - (1 - uu) * (1 - uu));
      const p = v.p;
      if (Lg < 2) continue;
      let n = 0;
      while (n < p.length - 1 && p[n + 1][2] <= Lg) n++;
      let j0 = 0;
      for (let j = 1; j <= n + 1; j++) {
        if (j <= n && lay(v, p[j][2]) === lay(v, p[j0][2])) continue;
        if (lay(v, p[j0][2]) === over && Math.min(n, j) > j0) vrun(v, j0, Math.min(n, j), Lg, a);
        j0 = j;
      }
      for (const L of v.lv) {
        if (lay(v, L.s) !== over) continue;
        const s = eb((e - vte(v, L.s) - 0.05) / 0.55);
        if (s > 0) leaf(L, s, a, fall);
      }
      if (over) {
        g.strokeStyle = '#3f7a4c';
        g.lineWidth = Math.max(0.5 * u, 2.2 * S);
        g.globalAlpha = a;
        for (const T of v.td) {
          const f = cl((e - vte(v, T.s)) / 0.9);
          const k = Math.floor(f * (T.p.length - 1));
          if (k < 1) continue;
          g.beginPath();
          for (let j = 0; j <= k; j++) {
            const P = T.p[j];
            if (j) g.lineTo(ox + P[0] * S, oy + P[1] * S);
            else g.moveTo(ox + P[0] * S, oy + P[1] * S);
          }
          g.stroke();
        }
        for (const F of v.fl) {
          const b = eb((e - vte(v, F.s) - 0.15) / 0.75);
          if (b > 0) flower(F, b, a);
        }
      }
    }
  }
  if (RV === 4) vineInit();

  /* ── 万花 KALEIDOSCOPE shards */
  const TRI = [[0, -1], [0.87, 0.5], [-0.87, 0.5]];
  const HEX = [0, 1, 2, 3, 4, 5].map((i) => [Math.cos(i * 1.0472), Math.sin(i * 1.0472)]);
  const SLV = [[-1, -0.12], [1, -0.12], [1, 0.12], [-1, 0.12]];
  const SH = RV === 5
    ? Array.from({ length: 54 }, () => {
      const k = Math.floor(rand() * 3);
      return { v: k === 0 ? TRI : k === 1 ? HEX : SLV, t: rand() * 6.28, a: rand() * 6.28, sp: rand() * 3 - 1.5, z: 30 + rand() * 70, h: Math.floor(rand() * 360) };
    })
    : [];
  if (RV === 5) {
    for (const m of M) m.hue = Math.floor(rand() * 360);
  }

  /* ── 磁吸 MAGNETIC: every path collapses to a node riding a slow magnetic orbit; the field pulls nodes home
     centre-outwards on accelerating, curving trajectories, each snapping in with a pop, a red ring and a traced outline. */
  let MGX = 0;
  let MGY = 0;
  function mg(m, r, e) {
    const pl = cl(r / 0.6);
    const k = 1 - pl * pl * pl;
    const ao = Math.atan2(m.dy, m.dx) + 2.2 + e * (0.25 + 0.3 * m.rn);
    const ro = 230 + m.rn * 560;
    const vx = CXd + Math.cos(ao) * ro - m.cx;
    const vy = CYd + Math.sin(ao) * ro * 1.25 - m.cy;
    const sw = k * (m.rn < 0.5 ? 1.7 : -1.7);
    const c = Math.cos(sw);
    const s = Math.sin(sw);
    MGX = (vx * c - vy * s) * k;
    MGY = (vx * s + vy * c) * k;
  }

  function rq(m, e) {
    switch (RV) {
      case 2: return (e - 0.7 - m.dc * 2.4 - m.rn * 0.6) / 1.7;
      case 4: return (e - m.vt) / 0.9;
      default: return (e - m.rn * 3.4) / 2.4;
    }
  }
  function resetO() {
    O.sc = 1; O.rot = 0; O.fx = 0; O.fy = 0; O.al = 1; O.hue = -1; O.hs = '75%,50%'; O.hx = 0.9;
    O.zip = 0; O.fa = 1; O.node = 0; O.ring = 0;
  }
  function rv(m, r, e) {
    resetO();
    if (RV === 2) {
      const s2 = cl((r - 0.6) / 0.4);
      mg(m, r, e);
      O.fx = MGX;
      O.fy = MGY;
      O.sc = s2 > 0 ? eb(s2) : 0;
      O.fa = ss(0.15, 0.6, s2);
      O.zip = s2 > 0 && s2 < 1 ? ss(0, 0.45, s2) : 0;
      O.rot = (m.rn - 0.5) * 0.7 * (1 - ss(0, 1, s2));
      O.node = ss(0, 0.6, e) * (1 - ss(0, 0.2, s2));
      O.ring = s2 > 0 && s2 < 0.6 && m.rad > 12 ? s2 / 0.6 : 0;
    } else if (RV === 4) {
      const uu = ss(0, 1, r);
      O.sc = eb(r);
      O.fx = (m.vx - m.cx) * (1 - uu);
      O.fy = (m.vy - m.cy) * (1 - uu);
      O.rot = (m.rn - 0.5) * 0.9 * (1 - uu);
      O.al = ss(0, 0.15, r);
      O.hue = 140;
      O.hs = '42%,30%';
      O.hx = 0.35;
    } else if (RV === 5) {
      const uu = ss(0, 1, r);
      const th = m.rn * 6.28 + e * 0.9;
      O.fx = (CXd + 800 * Math.cos(th) - m.cx) * (1 - uu);
      O.fy = (CYd + 950 * Math.sin(th) - m.cy) * (1 - uu);
      O.rot = (m.ph - 3.14) * 3 * (1 - uu);
      O.sc = 1 + 3 * (1 - uu);
      O.hue = m.hue;
      O.al = ss(0, 0.15, e);
    }
  }

  function pre(e) {
    const X = ox + CXd * S;
    const Y = oy + CYd * S;
    if (RV === 2) {
      const a = ss(0, 0.6, e) * (1 - ss(2.6, 4.8, e));
      if (a > 0.01) {
        g.strokeStyle = INK;
        g.lineWidth = Math.max(1, 0.5 * u);
        g.setLineDash([u, 3.5 * u]);
        for (let i = 0; i < 6; i++) {
          const rr = (230 + i * 112) * S;
          const o = e * (0.25 + i * 0.05) * (i % 2 ? -1 : 1);
          g.globalAlpha = a * (0.3 - i * 0.035);
          g.beginPath();
          g.ellipse(X, Y, rr, rr * 1.25, 0, o, o + 6.283);
          g.stroke();
        }
        g.setLineDash([]);
        g.globalAlpha = a;
        g.fillStyle = RED;
        g.beginPath();
        g.arc(X, Y, (7 + 2.5 * Math.sin(e * 7)) * 0.6 * u, 0, 6.283);
        g.fill();
      }
      g.strokeStyle = RED;
      g.lineWidth = 0.75 * u;
      for (let i = 0; i < 3; i++) {
        const uu = ss(0.8 + i * 0.6, 3.4 + i * 0.6, e);
        if (uu > 0 && uu < 1) {
          g.globalAlpha = 0.45 * (1 - uu);
          g.beginPath();
          g.arc(X, Y, uu * 1000 * S, 0, 6.283);
          g.stroke();
        }
      }
    } else if (RV === 4) {
      vines(e, 0);
    } else if (RV === 5) {
      for (const s of SH) {
        const uu = ss(0.4, 0.95, e / 5.4);
        const th = s.t + e * 0.7 * (1 - uu);
        const R0 = 900 * (1 - uu * 0.9);
        const cx = CXd + Math.cos(th) * R0 * 0.9;
        const cy = CYd + Math.sin(th) * R0 * 1.1;
        const an = s.a + (1 - uu) * s.sp * 4;
        const z = s.z * (1 - 0.5 * uu);
        const c = Math.cos(an);
        const n = Math.sin(an);
        g.globalAlpha = 0.85 * (1 - ss(0.8, 1, uu));
        g.fillStyle = `hsl(${s.h},70%,52%)`;
        g.beginPath();
        s.v.forEach((P, i) => {
          const px = ox + (cx + (P[0] * c - P[1] * n) * z) * S;
          const py = oy + (cy + (P[0] * n + P[1] * c) * z) * S;
          if (i) g.lineTo(px, py);
          else g.moveTo(px, py);
        });
        g.closePath();
        g.fill();
      }
    }
  }

  /** The per-path pass shared by the ink modes and the magnetic / vine / kaleidoscope reveals. */
  function drawPaths(e, dtD, final) {
    const act = RV > 0;
    const SW = 7;
    const ampFade = final ? 0 : 1 - ss(0.7, 0.95, e / cfg.span);
    const steps = Math.max(1, Math.min(4, Math.round(dtD * 60)));
    const s1 = Math.sin(e * 0.6);
    const c1 = Math.cos(e * 0.6);
    const s2 = Math.sin(-e * 0.4);
    const c2 = Math.cos(-e * 0.4);
    for (const m of M) {
      const s = m.s;
      const cnt = m.cnt;
      const cx = m.cx;
      const cy = m.cy;
      let q = MODE === 1 ? 9 : (e - m.ord * SW) / 0.6;
      if (act) q = rq(m, e);
      if (final) q = 9;
      const r = act ? cl(q) : q <= 0 ? 0 : q >= 1 ? 1 : 1 + 2.70158 * Math.pow(q - 1, 3) + 1.70158 * Math.pow(q - 1, 2);
      let sc = 1;
      let sx = 1;
      let sy = 1;
      let al = m.op;
      let amp = 0;
      let disp = 0;
      if (r <= 0 && !(act && (RV === 2 || RV === 5))) continue;
      if (MODE === 0) {
        amp = (10 + 26 / (1 + m.rad * 0.04)) * ampFade;
      } else if (MODE === 1) {
        const f = final ? 1 : ss(0, 1, (e / cfg.span) * 2.4 - m.wp * 0.9 - m.rn * 0.25 - 0.1);
        amp = (1 - f) * 300 + 6 * ampFade;
        disp = (1 - f) * 1.3;
        sc = 0.55 + 0.45 * f;
        al *= Math.pow(f, 0.8);
      } else if (MODE === 3) {
        const fo = 1 - ss(0.3, 1, Math.hypot(cx - CXd * 1.04, cy - CYd * 0.96) / (DW * 0.8));
        al *= (0.22 + 0.78 * Math.min(1, m.rad / 26)) * Math.max(0.12, fo) * (m.keep ? 1 : 0.25);
        sc = 1.05;
        amp = 4 * ampFade;
      }
      if (al < 0.01) continue;
      if (act) {
        rv(m, r, e);
        sc *= O.sc;
        al *= O.al;
      } else {
        resetO();
        if (r < 1) {
          sx = 1 + (1 - r) * 2.4;
          sy = 1 - (1 - r) * 0.5;
        } else sc *= r;
      }
      const ex = sx * sc;
      const ey = sy * sc;
      const cr = Math.cos(O.rot);
      const sr = Math.sin(O.rot);
      const physics = !act && !final;
      const s3 = Math.sin(e * 0.3 + m.ph * 0.3);
      const c3 = Math.cos(e * 0.3 + m.ph * 0.3);
      for (let k = s; k < s + cnt; k++) {
        const a = 2 * k;
        const rx = R[a];
        const ry = R[a + 1];
        let dx = 0;
        let dy = 0;
        if (physics) {
          let tx = 0;
          let ty = 0;
          if (amp) {
            const w = 6 * k;
            const an = (W1[w] * c1 + W1[w + 1] * s1 + W1[w + 2] * c2 + W1[w + 3] * s2 + W1[w + 4] * c3 + W1[w + 5] * s3) * 1.4;
            const li = ((an + LUT_R) / (2 * LUT_R)) * LUT_N + 0.5 | 0;
            tx = COS[li] * amp;
            ty = SIN[li] * amp - amp * 0.15;
          }
          if (disp) {
            tx += (rx - cx) * disp;
            ty += (ry - cy) * disp;
          }
          for (let st = 0; st < steps; st++) {
            V[a] += (tx - D[a]) * 0.06;
            V[a + 1] += (ty - D[a + 1]) * 0.06;
            V[a] *= 0.82;
            V[a + 1] *= 0.82;
            D[a] += V[a];
            D[a + 1] += V[a + 1];
          }
          dx = D[a];
          dy = D[a + 1];
        }
        let x;
        let y;
        if (O.rot) {
          const uu = (rx - cx) * ex;
          const vv = (ry - cy) * ey;
          x = cx + O.fx + uu * cr - vv * sr + dx;
          y = cy + O.fy + uu * sr + vv * cr + dy;
        } else {
          x = cx + O.fx + (rx - cx) * ex + dx;
          y = cy + O.fy + (ry - cy) * ey + dy;
        }
        XS[k] = ox + x * S;
        YS[k] = oy + y * S;
      }
      if (O.node > 0.01) {
        const X = ox + (cx + O.fx) * S;
        const Y = oy + (cy + O.fy) * S;
        const nr = (1.3 + Math.min(2.8, m.rad * 0.03)) * u * 0.5;
        mg(m, r - 0.05, e - 0.05);
        let PXo = ox + (cx + MGX) * S;
        let PYo = oy + (cy + MGY) * S;
        const sl = Math.hypot(PXo - X, PYo - Y);
        const mx = 70 * S;
        if (sl > mx) {
          PXo = X + ((PXo - X) * mx) / sl;
          PYo = Y + ((PYo - Y) * mx) / sl;
        }
        g.strokeStyle = g.fillStyle = m.rn < 0.14 ? RED : m.col;
        g.lineCap = 'round';
        g.globalAlpha = O.node * 0.3 * al;
        g.lineWidth = nr * 1.1;
        g.beginPath();
        g.moveTo(PXo, PYo);
        g.lineTo(X, Y);
        g.stroke();
        g.globalAlpha = O.node * al;
        g.beginPath();
        g.arc(X, Y, nr, 0, 6.283);
        g.fill();
      }
      if (O.ring > 0) {
        g.globalAlpha = 0.6 * (1 - O.ring) * al;
        g.strokeStyle = RED;
        g.lineWidth = 0.5 * u;
        g.beginPath();
        g.arc(ox + cx * S, oy + cy * S, (m.rad * 0.7 + 6) * S * (0.4 + 1.1 * O.ring), 0, 6.283);
        g.stroke();
      }
      tracePath(m);
      if (O.fa > 0.01) {
        if (O.hue >= 0 && r < 1) {
          g.globalAlpha = al * O.fa * (1 - ss(O.hx, 1, r));
          g.fillStyle = `hsl(${O.hue},${O.hs})`;
          g.fill();
          g.globalAlpha = al * O.fa * ss(O.hx, 1, r);
          g.fillStyle = m.col;
          g.fill();
        } else {
          g.globalAlpha = al * O.fa;
          g.fillStyle = r < 0.92 && !act ? dry(m.col) : m.col;
          g.fill();
        }
      }
      if (O.zip > 0 && O.zip < 1) {
        g.setLineDash([m.len * O.zip * S, 1e5]);
        g.lineWidth = 0.65 * u;
        g.strokeStyle = m.col;
        g.globalAlpha = al;
        g.stroke();
        g.setLineDash([]);
      }
      if (MODE === 3 && m.keep) {
        g.globalAlpha = al * 0.14;
        g.strokeStyle = m.col;
        g.lineWidth = 9 * S;
        g.lineJoin = 'round';
        g.stroke();
      }
    }
  }

  function reset() {
    D.fill(0);
    V.fill(0);
    lastE = -1;
    lastT = 0;
  }

  /**
   * Draws the frame at `time` seconds of a reveal lasting `duration` seconds onto `ctx`
   * (whose canvas must share the artwork's aspect ratio). Times past `duration` hold the completed frame.
   */
  function render(ctx, time, duration) {
    g = ctx;
    W = ctx.canvas.width;
    H = ctx.canvas.height;
    S = W / DW;
    u = 2 * S;
    const t = Math.max(0, time);
    const e = (Math.min(t, duration) / Math.max(duration, 1e-6)) * cfg.span;
    if (lastE < 0 || t < lastT) {
      reset();
      lastE = e;
      lastT = t;
    }
    const dtD = ((t - lastT) * cfg.span) / Math.max(duration, 1e-6);
    lastE = e;
    lastT = t;
    const final = t >= duration;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.lineJoin = 'miter';
    g.lineCap = 'butt';
    g.setLineDash([]);
    g.shadowColor = 'transparent';
    const trail = final || dtD <= 0 || cfg.trail >= 1 ? 1 : 1 - Math.pow(1 - cfg.trail, Math.max(1, dtD * 60));
    g.globalAlpha = trail;
    g.fillStyle = PAPER;
    g.fillRect(0, 0, W, H);

    if (final && RV !== 0 && RV !== 1) {
      // Resting state: the untouched artwork.
      paint(M.map((_, i) => i), (x, y) => { PX = ox + x * S; PY = oy + y * S; }, 1);
    } else if (RV === 1) {
      origami(e);
    } else if (RV === 3) {
      louver(e);
    } else {
      if (RV) pre(e);
      drawPaths(e, dtD, final);
      if (RV === 4) vines(e, 1);
    }
    g.globalAlpha = 1;
  }

  /* inspection hook (tests / debugging): the facets of the last origami frame, in draw order */
  const debugFacets = () => (ORI && ORI.lastOrder ? ORI.lastOrder.map((G) => ({
    front: G.front,
    faces: G.c.map((C) => ({ Q: Array.from(C.Q), iq: Array.from(C.iq), n: C.P.length, P: C.P, folds: C.f.map((v, i) => (v ? i : -1)).filter((i) => i >= 0), W: Array.from(C.W) }))
  })) : null);
  return { width: art.width, height: art.height, render, reset, debugFacets };
}

/* ───────────────────────── WebM recording ───────────────────────── */

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function recordInkWebM(reveal, duration, holdDuration, onProgress = () => {}, maxSide = 1600) {
  if (canEncodeFrames()) {
    // Frame-exact path: frame i is drawn for time i/fps, completely, before it is encoded.
    const fps = 30;
    const scale = Math.min(1, maxSide / Math.max(reveal.width, reveal.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round((reveal.width * scale) / 2) * 2);
    canvas.height = Math.max(2, Math.round((reveal.height * scale) / 2) * 2);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create a canvas for WebM recording.');
    reveal.reset();
    const frameCount = Math.max(1, Math.round((duration + holdDuration) * fps));
    return encodeFramesToWebM({
      canvas,
      fps,
      frameCount,
      drawFrame: (i, time) => reveal.render(context, time, duration),
      onProgress
    });
  }
  return recordInkRealtime(reveal, duration, holdDuration, onProgress, maxSide);
}

/** Fallback for browsers without WebCodecs: real-time capture through MediaRecorder. */
async function recordInkRealtime(reveal, duration, holdDuration, onProgress, maxSide) {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
    throw new Error('This browser does not support WebM recording.');
  }
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error('This browser cannot encode WebM video.');

  const scale = Math.min(1, maxSide / Math.max(reveal.width, reveal.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round((reveal.width * scale) / 2) * 2);
  canvas.height = Math.max(2, Math.round((reveal.height * scale) / 2) * 2);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create a canvas for WebM recording.');

  reveal.reset();
  reveal.render(context, 0, duration);
  const fps = 30;
  // Frames are pushed explicitly so recording does not depend on the page compositing (e.g. a hidden tab).
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const pushFrame = () => {
    if (track && typeof track.requestFrame === 'function') track.requestFrame();
  };
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  const recorded = new Promise((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => reject(new Error('WebM recording failed.'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  const total = duration + holdDuration;
  try {
    recorder.start(250);
    await wait(50);
    const startedAt = performance.now();
    while (true) {
      const elapsed = (performance.now() - startedAt) / 1000;
      reveal.render(context, Math.min(elapsed, total), duration);
      pushFrame();
      onProgress(Math.min(1, elapsed / Math.max(total, 1e-6)));
      if (elapsed >= total) break;
      const nextFrameAt = startedAt + (Math.floor((elapsed * fps)) + 1) * (1000 / fps);
      const delay = nextFrameAt - performance.now();
      await wait(Math.max(0, delay));
    }
    reveal.render(context, Math.max(total, duration), duration);
    pushFrame();
    await wait(150);
    onProgress(1);
    recorder.stop();
    return await recorded;
  } catch (error) {
    if (recorder.state !== 'inactive') recorder.stop();
    throw error;
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }
}
