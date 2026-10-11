#!/usr/bin/env node
/**
 * ALTURA — Hero Film Renderer v2 (three-shot seasonal montage)
 *
 * Shot 1 (0–8s)  SUMMER: warm valley, mirror lake reflection, birds, push-in
 * Shot 2 (8–16s) WINTER: cold palette, strong wind-driven snow, cloud shadows,
 *                god rays, push-in
 * Shot 3 (16–24s) GOLDEN DAWN: warm sunrise, runner silhouette crossing the
 *                ridge line with natural gait, push-in
 *
 * All shots share the same deterministic noise engine from v1. Crossfades
 * between shots (~1s) hide the cuts gently. Output identical contract:
 *   .hero-build/video.raw (RGBA8 960×540 @ 24fps) + .hero-build/audio.pcm
 */
import { mkdirSync, writeFileSync, createWriteStream } from "node:fs";
import { once } from "node:events";
import path from "node:path";
import { performance } from "node:perf_hooks";

const OUT = path.resolve(".hero-build");
mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------- configuration */
const W = 960;
const H = 540;
const FPS = 24;
const SHOT_LEN = 8;               // seconds per shot
const SHOT_FRAMES = SHOT_LEN * FPS;
const DURATION = SHOT_LEN * 3;    // 24s
const FRAMES = FPS * DURATION;
const LETTERBOX = 18;
const XFADE = 1.0;                // seconds of crossfade

// Palettes per shot: [sky bands top→bottom], sun color, ridge shades (far→near)
const SHOTS = [
  { // 0 — SUMMER
    sky: [0xcfd8c6, 0xbcc8ba, 0xa7b5a9, 0x93a498],
    sun: 0xf6efdd,
    ridge: [0x55645a, 0x49584e, 0x3d4b42, 0x33403a, 0x2a3630, 0x232d28],
    fog: 0xe9e6d9,
    lake: true, birds: true, snow: false, godRays: false, runner: false,
    sunX: 0.68, sunY: 0.20,
  },
  { // 1 — WINTER
    sky: [0xaeb6b2, 0x9aa4a2, 0x88938f, 0x77827e],
    sun: 0xe4e2d4,
    ridge: [0x313a35, 0x2a322e, 0x242b27, 0x1f2522, 0x1a1f1d, 0x161a18],
    fog: 0xd9dcd4,
    lake: false, birds: false, snow: true, godRays: true, runner: false,
    sunX: 0.35, sunY: 0.14,
  },
  { // 2 — GOLDEN DAWN
    sky: [0xe3d3b4, 0xd4c0a0, 0xc0ac8e, 0xa8937c],
    sun: 0xf7e3b0,
    ridge: [0x5a5044, 0x4c443a, 0x3f3a32, 0x342f2a, 0x2a2622, 0x211e1b],
    fog: 0xf0e2c6,
    lake: false, birds: false, snow: false, godRays: true, runner: true,
    sunX: 0.60, sunY: 0.30,
  },
];

/* ------------------------------------------------- prng + noise */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t + (t ^ (t >>> 14))) | 0) >>> 0) / 4294967296;
  };
}
const NOISE_SEED = 1337;
function hash2(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) ^ NOISE_SEED;
  h = h >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
function vnoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = smooth(x - xi);
  const ty = smooth(y - yi);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
function fbm(x, y, oct) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, y * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

/* ------------------------------------------------- helpers */
function hexToRgb(h) {
  return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
}
const mix = (a, b, t) => a + (b - a) * t;
const clampByte = (v) => (v < 0 ? 0 : v > 255 ? 255 : v) | 0;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
function smoothstep(a, b, v) {
  const t = (v - a) / (b - a);
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}
const lerp3 = (A, B, t) => [mix(A[0], B[0], t), mix(A[1], B[1], t), mix(A[2], B[2], t)];

const RIDGES = [
  { base: 0.46, amp: 0.30, freq: 2.1, speed: 0.006, shade: 5, sky: 0.00, seed: 11.37 },
  { base: 0.54, amp: 0.26, freq: 2.7, speed: 0.010, shade: 4, sky: 0.10, seed: 23.29 },
  { base: 0.62, amp: 0.22, freq: 3.4, speed: 0.016, shade: 3, sky: 0.16, seed: 37.11 },
  { base: 0.72, amp: 0.17, freq: 4.3, speed: 0.024, shade: 2, sky: 0.28, seed: 53.77 },
  { base: 0.84, amp: 0.10, freq: 5.6, speed: 0.035, shade: 1, sky: 0.40, seed: 71.13 },
];

function ridgeY(r, xn, time, zoom) {
  const u = xn * r.freq / zoom + r.seed + time * r.speed;
  const n = fbm(u, r.seed, 4);
  const sharp = 1 - Math.abs(n * 2 - 1);
  return r.base - r.amp * (0.55 * n + 0.45 * sharp * sharp);
}

/* ------------------------------------------------- particles & actors */
const SNOW_P = [];
{
  const rnd = mulberry32(90210);
  for (let i = 0; i < 340; i++) {
    const depth = 0.25 + rnd() * 0.75;
    SNOW_P.push({
      x0: rnd(),
      y0: rnd(),
      speed: 0.03 + 0.09 * depth,
      depth,
      phase: rnd() * Math.PI * 2,
      alpha: 0.25 + 0.55 * depth,
      size: depth > 0.9 ? 1 : 0,
    });
  }
}
const BIRDS = [];
{
  const rnd = mulberry32(777);
  for (let i = 0; i < 9; i++) {
    BIRDS.push({
      x0: rnd() * 0.5,
      y: 0.12 + rnd() * 0.14,
      speed: 0.035 + rnd() * 0.02,
      phase: rnd() * Math.PI * 2,
      flap: 5.5 + rnd() * 2,
      size: 1.6 + rnd() * 1.4,
    });
  }
}
// Runner gait: stride frequency ~3 Hz, body bob, arm counter-swing
const RUNNER = { y0: 0.985, speed: 0.052, stride: 3.1, scale: 1.3 };

/* ------------------------------------------------- frame renderer */
const frameBuf = Buffer.allocUnsafe(W * H * 4);

function renderShots(time, shotIdx, localT, shotT01, pushIn) {
  const cfg = SHOTS[shotIdx];
  const sky = cfg.sky.map(hexToRgb);
  const sun = hexToRgb(cfg.sun);
  const fog = hexToRgb(cfg.fog);
  const zoom = 1 + 0.16 * pushIn;                 // camera push-in
  const camY = 0.02 * pushIn;                      // slight downward tilt-in
  const timeS = localT;
  const grainRnd = mulberry32((0x51ed ^ (frameCounter * 2654435761)) >>> 0);

  const sunX = cfg.sunX + 0.03 * Math.sin(shotT01 * Math.PI);
  const sunY = cfg.sunY - 0.03 * (1 - shotT01);
  const sunR = 0.09;

  /* 1 — sky gradient + sun glow (zoom-aware center offset) */
  for (let y = 0; y < H; y++) {
    const yn = y / H + camY;
    const band = clamp01(yn) * (sky.length - 1);
    const bi = Math.min(sky.length - 2, band | 0);
    const bt = band - bi;
    const r0g = lerp3(sky[bi], sky[bi + 1], bt);
    for (let x = 0; x < W; x++) {
      const xn = (x / W - 0.5) / zoom + 0.5;
      const dx = (xn - sunX) * (W / H);
      const dy = yn - sunY;
      const d2 = dx * dx + dy * dy;
      const warm = Math.exp(-d2 / 0.045) * 0.8 + Math.exp(-d2 / 0.5) * 0.3;
      const i = (y * W + x) * 4;
      frameBuf[i] = clampByte(r0g[0] + (sun[0] - r0g[0]) * warm);
      frameBuf[i + 1] = clampByte(r0g[1] + (sun[1] - r0g[1]) * warm);
      frameBuf[i + 2] = clampByte(r0g[2] + (sun[2] - r0g[2]) * warm);
    }
  }

  /* 2 — cloud band + god rays + cloud shadows */
  const cloudTop = 0.02;
  const cloudH = 0.30;
  const cOffset = timeS * 0.014;
  for (let y = Math.floor(cloudTop * H); y < Math.floor((cloudTop + cloudH) * H); y++) {
    const vn = (y / H - cloudTop) / cloudH;
    const fadeDown = 1 - smoothstep(0.5, 1, vn);
    for (let x = 0; x < W; x++) {
      const u = ((x / W - 0.5) / zoom + 0.5) * 3.2 + cOffset;
      const n = fbm(u, vn * 1.6 + 7.7, 4);
      const c = smoothstep(0.5, 0.82, n) * 0.55 * fadeDown;
      if (c < 0.01) continue;
      const i = (y * W + x) * 4;
      frameBuf[i] = clampByte(frameBuf[i] + (sun[0] - frameBuf[i]) * c);
      frameBuf[i + 1] = clampByte(frameBuf[i + 1] + (sun[1] - frameBuf[i + 1]) * c);
      frameBuf[i + 2] = clampByte(frameBuf[i + 2] + (sun[2] - frameBuf[i + 2]) * c);
    }
  }
  if (cfg.godRays) {
    // rotating ray fan from the sun; very low alpha, additive toward sun color
    const ang0 = -0.9 + 0.06 * Math.sin(timeS * 0.11);
    for (let y = Math.floor(sunY * H); y < Math.floor(0.85 * H); y++) {
      const yn = y / H;
      for (let x = 0; x < W; x++) {
        const xn = (x / W - 0.5) / zoom + 0.5;
        const dx = xn - sunX;
        const dy = yn - sunY;
        if (dy <= 0.02) continue;
        const ang = Math.atan2(dy, dx);
        let rel = ang - ang0;
        rel = ((rel % Math.PI) + Math.PI) % Math.PI;      // wrap 0..π
        const ray = Math.max(0, Math.cos(rel * 5.0));      // 5 soft blades per π
        const dist = Math.hypot(dx * (W / H), dy);
        const a = ray * Math.exp(-dist * 1.1) * 0.16;
        if (a < 0.008) continue;
        const i = (y * W + x) * 4;
        frameBuf[i] = clampByte(frameBuf[i] + (sun[0] - frameBuf[i]) * a);
        frameBuf[i + 1] = clampByte(frameBuf[i + 1] + (sun[1] - frameBuf[i + 1]) * a);
        frameBuf[i + 2] = clampByte(frameBuf[i + 2] + (sun[2] - frameBuf[i + 2]) * a);
      }
    }
  }

  /* 3 — cloud shadows drifting over ridges (multiplicative dark patches) */
  const shadowPhase = timeS * 0.02;
  const shadowField = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const u = ((x / W - 0.5) / zoom + 0.5) * 1.8 + shadowPhase;
    shadowField[x] = 1 - 0.28 * smoothstep(0.45, 0.75, fbm(u, 41.7, 3));
  }

  /* 4 — ridgelines with per-column shadow tint */
  for (const r of RIDGES) {
    const shade = hexToRgb(cfg.ridge[r.shade]);
    for (let x = 0; x < W; x++) {
      const xn = (x / W - 0.5) / zoom + 0.5;
      const topY = ridgeY(r, xn, timeS, zoom) + camY * (0.4 + 0.6 * (r.shade / 5));
      const yFrom = Math.max(0, Math.ceil(topY * H));
      const dxs = (xn - sunX) * (W / H);
      const glow = Math.exp(-(dxs * dxs) / 0.35) * 0.20 * (r.sky + 0.25);
      let cr = shade[0];
      let cg = shade[1];
      let cb = shade[2];
      if (r.sky > 0) {
        const tint = sky[1];
        cr += (tint[0] - cr) * r.sky;
        cg += (tint[1] - cg) * r.sky;
        cb += (tint[2] - cb) * r.sky;
      }
      if (glow > 0.01) {
        cr += (sun[0] - cr) * glow;
        cg += (sun[1] - cg) * glow;
        cb += (sun[2] - cb) * glow;
      }
      const sh = shadowField[x];
      cr *= sh;
      cg *= sh;
      cb *= sh;
      for (let y = yFrom; y < H; y++) {
        const i = (y * W + x) * 4;
        frameBuf[i] = cr;
        frameBuf[i + 1] = cg;
        frameBuf[i + 2] = cb;
      }
    }
  }

  /* 5 — valley fog */
  const fogTop = 0.36 + 0.04 * Math.sin(shotT01 * Math.PI * 2 + 0.7);
  const fogBot = 0.97;
  for (let y = Math.floor(fogTop * H); y < Math.floor(fogBot * H); y++) {
    const yn = y / H;
    const wave = Math.max(0, Math.sin(Math.PI * (yn - fogTop) / (fogBot - fogTop)));
    const a = Math.pow(wave, 1.6) * (cfg.lake ? 0.22 : 0.30);
    if (a < 0.01) continue;
    for (let x = 0; x < W; x++) {
      const u = ((x / W - 0.5) / zoom + 0.5) * 2.4 + timeS * 0.02;
      const m = 0.55 + 0.45 * fbm(u, yn * 3 + 3.3, 3);
      const k = a * m;
      const i = (y * W + x) * 4;
      frameBuf[i] = clampByte(frameBuf[i] + (fog[0] - frameBuf[i]) * k);
      frameBuf[i + 1] = clampByte(frameBuf[i + 1] + (fog[1] - frameBuf[i + 1]) * k);
      frameBuf[i + 2] = clampByte(frameBuf[i + 2] + (fog[2] - frameBuf[i + 2]) * k);
    }
  }

  /* 6 — mirror lake with wobbling reflection (summer) */
  if (cfg.lake) {
    const lakeTop = 0.70;
    for (let y = Math.floor(lakeTop * H); y < H; y++) {
      const yn = y / H;
      const depthIn = (yn - lakeTop) / (1 - lakeTop);
      // reflect: sample the row above the shoreline
      const srcY = Math.max(0, Math.floor((lakeTop - (yn - lakeTop) * 0.96) * H));
      const wobble = 3.2 * (0.35 + 0.65 * depthIn);
      for (let x = 0; x < W; x++) {
        const off = Math.round(wobble * Math.sin(x * 0.045 + timeS * 1.1 + depthIn * 9));
        const sx = Math.min(W - 1, Math.max(0, x + off));
        const src = ((srcY * W) + sx) * 4;
        const dst = (y * W + x) * 4;
        const wet = 0.74 - 0.10 * depthIn;   // mirror-bright near shore, deeper below
        const shimmer = 0.06 * Math.sin(x * 0.02 + timeS * 2.1 + depthIn * 14);
        // sun glitter column on the water
        const dxs = ((x / W) - sunX) * (W / H);
        const glitter = Math.exp(-(dxs * dxs) / 0.012) * (0.30 + 0.22 * Math.sin(x * 0.11 + timeS * 3.2)) * Math.max(0, 0.4 + 0.6 * Math.sin(timeS * 0.9 + depthIn * 6));
        frameBuf[dst] = clampByte(frameBuf[src] * wet + shimmer * 40 + glitter * (sun[0] - frameBuf[src]) * 0.9);
        frameBuf[dst + 1] = clampByte(frameBuf[src + 1] * wet + shimmer * 40 + glitter * (sun[1] - frameBuf[src + 1]) * 0.9);
        frameBuf[dst + 2] = clampByte(frameBuf[src + 2] * wet + shimmer * 40 + glitter * (sun[2] - frameBuf[src + 2]) * 0.9);
      }
    }
    // shoreline blend
    for (let x = 0; x < W; x++) {
      const y0 = Math.floor(lakeTop * H);
      for (let y = y0 - 1; y <= y0 + 1; y++) {
        const i = (y * W + x) * 4;
        frameBuf[i] = clampByte(frameBuf[i] * 0.9 + fog[0] * 0.1);
        frameBuf[i + 1] = clampByte(frameBuf[i + 1] * 0.9 + fog[1] * 0.1);
        frameBuf[i + 2] = clampByte(frameBuf[i + 2] * 0.9 + fog[2] * 0.1);
      }
    }
  }

  /* 7 — birds (summer) */
  if (cfg.birds) {
    for (const b of BIRDS) {
      const bx01 = (((b.x0 + timeS * b.speed) % 1.15) + 1.15) % 1.15 - 0.075;
      if (bx01 < 0.02 || bx01 > 0.98) continue;
      const px = (bx01 * W) | 0;
      const py = ((b.y + 0.012 * Math.sin(timeS * 0.7 + b.phase)) * H) | 0;
      const wing = Math.sin(timeS * b.flap + b.phase);
      const s = b.size;
      for (let k = -2; k <= 2; k++) {
        const wx = px + (k * s * 1.4) | 0;
        const wy = py + Math.round(-Math.abs(k) * s * 0.7 + wing * s * (Math.abs(k) === 2 ? 1 : 0.4));
        if (wx < 0 || wx >= W || wy < 0 || wy >= H) continue;
        const i = (wy * W + wx) * 4;
        frameBuf[i] = frameBuf[i] * 0.15;
        frameBuf[i + 1] = frameBuf[i + 1] * 0.15;
        frameBuf[i + 2] = frameBuf[i + 2] * 0.15;
      }
    }
  }

  /* 8 — runner silhouette on the near ridge (golden dawn) */
  if (cfg.runner) {
    const rNear = RIDGES[4];
    const bx01 = -0.05 + timeS * RUNNER.speed;             // crosses the frame in ~8s
    if (bx01 > -0.08 && bx01 < 1.08) {
      const xn = (bx01 - 0.5) / zoom + 0.5;
      const groundY = ridgeY(rNear, xn, timeS, zoom) + camY * 0.9;
      const stride = RUNNER.stride;
      const ph = timeS * stride * Math.PI * 2;
      // body metrics (in units of H)
      const bodyH = 0.085 * RUNNER.scale;
      const bob = 0.006 * Math.abs(Math.sin(ph));          // vertical bounce per step
      const lean = 0.10;                                    // forward lean
      const hipX = bx01 * W;
      const hipY = (groundY - bodyH * 0.48 + bob) * H;
      const shoulderY = (groundY - bodyH * 0.86 + bob * 1.2) * H;
      const headY = (groundY - bodyH * 1.02 + bob * 1.3) * H;
      const swing = Math.sin(ph);
      const swing2 = Math.sin(ph + Math.PI);
      const put = (x, y, a) => {
        const xi = x | 0;
        const yi = y | 0;
        if (xi < 0 || xi >= W || yi < 0 || yi >= H) return;
        const i = (yi * W + xi) * 4;
        frameBuf[i] = frameBuf[i] * (1 - a);
        frameBuf[i + 1] = frameBuf[i + 1] * (1 - a);
        frameBuf[i + 2] = frameBuf[i + 2] * (1 - a);
      };
      const limb = (x1, y1, x2, y2, w) => {
        const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1)) * 2;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          put(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 1.0);
          if (w > 1) put(x1 + (x2 - x1) * t + 1, y1 + (y2 - y1) * t, 1.0);
          if (w > 2) put(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t + 1, 1.0);
        }
      };
      const L = bodyH * H * 0.34;   // limb length
      // legs: knee then foot, alternating with stride
      limb(hipX, hipY, hipX + swing * L * 0.5 + lean * L, hipY + L * 0.55, 2);
      limb(hipX + swing * L * 0.5 + lean * L, hipY + L * 0.55, hipX + swing * L * 1.15 + lean * L, hipY + L, 2);
      limb(hipX, hipY, hipX + swing2 * L * 0.5 + lean * L, hipY + L * 0.55, 2);
      limb(hipX + swing2 * L * 0.5 + lean * L, hipY + L * 0.55, hipX + swing2 * L * 0.9 + lean * L, hipY + L * 0.92, 2);
      // torso + head
      limb(hipX, hipY, hipX + lean * L * 0.9, shoulderY, 3);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy <= 5) put(hipX + lean * L * 0.9 + dx, headY + dy, 0.95);
      }
      // arms counter-swing
      limb(hipX + lean * L * 0.9, shoulderY, hipX + swing2 * L * 0.8 + lean * L * 0.6, shoulderY + L * 0.5, 2);
      limb(hipX + lean * L * 0.9, shoulderY, hipX + swing * L * 0.8 + lean * L * 0.6, shoulderY + L * 0.5, 2);
    }
  }

  /* 9 — snowfall with wind gusts (winter) */
  if (cfg.snow) {
    const gustPhase = Math.sin(timeS * 0.35) * Math.sin(timeS * 0.13 + 1.7);
    const windX = 0.10 + 0.16 * Math.max(0, gustPhase);   // px drift per second in xn units
    for (const p of SNOW_P) {
      const py01 = (p.y0 + timeS * p.speed) % 1.05;
      if (py01 > 1) continue;
      const sway = 0.012 * Math.sin(timeS * (1 + p.depth) + p.phase);
      const px01 = (((p.x0 + timeS * windX * p.depth + sway) % 1) + 1) % 1;
      const px = (px01 * W) | 0;
      const py = (py01 * H) | 0;
      const i = (py * W + px) * 4;
      const white = [246, 244, 236];
      frameBuf[i] = clampByte(frameBuf[i] + (white[0] - frameBuf[i]) * p.alpha);
      frameBuf[i + 1] = clampByte(frameBuf[i + 1] + (white[1] - frameBuf[i + 1]) * p.alpha);
      frameBuf[i + 2] = clampByte(frameBuf[i + 2] + (white[2] - frameBuf[i + 2]) * p.alpha);
      if (p.size) {
        const a2 = p.alpha * 0.4;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = px + ox;
          const ny = py + oy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const j = (ny * W + nx) * 4;
          frameBuf[j] = clampByte(frameBuf[j] + (white[0] - frameBuf[j]) * a2);
          frameBuf[j + 1] = clampByte(frameBuf[j + 1] + (white[1] - frameBuf[j + 1]) * a2);
          frameBuf[j + 2] = clampByte(frameBuf[j + 2] + (white[2] - frameBuf[j + 2]) * a2);
        }
      }
    }
  }

  return { grainRnd };
}

/* ------------------------------------------------- compose + grade */
let frameCounter = 0;

function renderFrame(frameIdx) {
  const time = frameIdx / FPS;
  const shotIdx = Math.min(2, Math.floor(time / SHOT_LEN));
  const localT = time - shotIdx * SHOT_LEN;
  const shotT01 = localT / SHOT_LEN;
  const pushIn = shotT01 * shotT01;                      // ease-in push
  frameCounter = frameIdx;

  frameBuf.fill(255);

  // crossfade near shot boundaries: blend two rendered shots
  const inFade = shotIdx > 0 && localT < XFADE;
  const outFade = shotIdx < 2 && localT > SHOT_LEN - XFADE;

  if (!inFade && !outFade) {
    renderShots(time, shotIdx, localT, shotT01, pushIn);
  } else {
    const A = inFade ? shotIdx - 1 : shotIdx;
    const B = shotIdx;
    const tA = inFade ? (localT + SHOT_LEN) : localT;
    const t01A = inFade ? (tA / SHOT_LEN) % 1 : shotT01;
    const bufA = Buffer.from(frameBuf);
    renderShots(time, A, tA, t01A, (t01A) * (t01A));
    bufA.set(frameBuf);
    const tB = localT;
    const t01B = shotT01;
    const bufB = Buffer.from(frameBuf);
    renderShots(time, B, tB, t01B, (t01B) * (t01B));
    const second = Buffer.from(frameBuf);
    const alpha = inFade ? localT / XFADE : (SHOT_LEN - localT) / XFADE;
    for (let i = 0; i < W * H * 4; i += 4) {
      frameBuf[i] = bufA[i] + (second[i] - bufA[i]) * alpha;
      frameBuf[i + 1] = bufA[i + 1] + (second[i + 1] - bufA[i + 1]) * alpha;
      frameBuf[i + 2] = bufA[i + 2] + (second[i + 2] - bufA[i + 2]) * alpha;
    }
    void bufB;
  }

  /* grade: vignette + grain + letterbox */
  const grainRnd = mulberry32((0x9e3779b9 ^ frameIdx) >>> 0);
  const cx = W / 2;
  const cy = H / 2;
  const maxD = Math.hypot(cx, cy);
  for (let y = 0; y < H; y++) {
    const dy = y - cy;
    const letterboxed = y < LETTERBOX || y >= H - LETTERBOX;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const dx = x - cx;
      const d = Math.hypot(dx, dy) / maxD;
      const v = 1 - 0.22 * smoothstep(0.55, 1.05, d);
      const gr = (grainRnd() + grainRnd() - 1) * 6;
      let r = frameBuf[i] * v + gr;
      let g = frameBuf[i + 1] * v + gr;
      let b = frameBuf[i + 2] * v + gr;
      if (letterboxed) {
        r = r * 0.25 + 3;
        g = g * 0.25 + 4;
        b = b * 0.25 + 3;
      }
      frameBuf[i] = clampByte(r);
      frameBuf[i + 1] = clampByte(g);
      frameBuf[i + 2] = clampByte(b);
    }
  }
}

/* ------------------------------------------------- audio (3 acts) */
function renderAudio() {
  const sr = 48000;
  const N = sr * DURATION;
  const L = new Float64Array(N);
  const R = new Float64Array(N);
  const rnd = mulberry32(4242);
  let lp = 0;
  let bp = 0;
  let prev = 0;
  for (let n = 0; n < N; n++) {
    const tt = n / sr;
    const gust = 0.55 + 0.45 * Math.sin(2 * Math.PI * (tt / 15) + 1.3) * Math.sin(2 * Math.PI * (tt / 7.3));
    const winter = smoothstep(SHOT_LEN - 1.5, SHOT_LEN + 1.5, tt) * (1 - smoothstep(2 * SHOT_LEN - 1.5, 2 * SHOT_LEN + 1.5, tt));
    const w = (rnd() * 2 - 1) * gust * (0.5 + 0.9 * winter);
    lp += 0.02 * (w - lp);
    bp = 0.96 * bp + 0.04 * (w - prev);
    prev = w;
    L[n] = lp * 2.2 + bp * 0.35;
    R[n] = lp * 2.0 + bp * 0.45;
  }
  // act chords: Am (summer, airy) → Fm low (winter, heavy) → C major-ish (dawn, hopeful)
  const acts = [
    { t0: 0, t1: SHOT_LEN, partials: [[220, 0.14], [277.2, 0.10], [329.6, 0.08], [110, 0.10]] },
    { t0: SHOT_LEN, t1: 2 * SHOT_LEN, partials: [[87.3, 0.16], [130.8, 0.12], [174.6, 0.10], [43.7, 0.12]] },
    { t0: 2 * SHOT_LEN, t1: DURATION, partials: [[130.8, 0.14], [196, 0.11], [261.6, 0.09], [65.4, 0.10]] },
  ];
  for (const act of acts) {
    const n0 = Math.floor(act.t0 * sr);
    const n1 = Math.min(N, Math.floor(act.t1 * sr));
    for (let n = n0; n < n1; n++) {
      const tt = n / sr;
      const local = tt - act.t0;
      const span = act.t1 - act.t0;
      const fade = Math.min(1, local / 1.2) * Math.min(1, (span - local) / 1.2);
      if (fade <= 0) continue;
      let l = 0;
      let r = 0;
      for (const [f0, amp] of act.partials) {
        const vib = 1 + 0.0012 * Math.sin(2 * Math.PI * 0.13 * tt + f0);
        const s = Math.sin(2 * Math.PI * f0 * vib * tt) * amp * fade;
        l += s;
        r += s * 0.96;
      }
      L[n] += l;
      R[n] += r;
    }
  }
  const pcm = Buffer.alloc(N * 4);
  for (let n = 0; n < N; n++) {
    const tt = n / sr;
    const master = Math.min(1, tt / 2.0) * Math.min(1, (DURATION - tt) / 2.0);
    const l = Math.tanh(L[n] * 1.05) * 0.70 * master;
    const r = Math.tanh(R[n] * 1.05) * 0.70 * master;
    pcm.writeInt16LE((l * 32767) | 0, n * 4);
    pcm.writeInt16LE((r * 32767) | 0, n * 4 + 2);
  }
  writeFileSync(path.join(OUT, "audio.pcm"), pcm);
}

/* ------------------------------------------------- main */
async function main() {
  const t0 = performance.now();
  renderAudio();
  console.log("[audio] 3-act ambient track rendered");

  const videoOut = createWriteStream(path.join(OUT, "video.raw"), { flags: "w" });
  let last = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    renderFrame(f);
    if (!videoOut.write(frameBuf)) await once(videoOut, "drain");
    if (f % 48 === 47) {
      const dt = (performance.now() - last) / 1000;
      last = performance.now();
      console.log(`[video] frame ${f + 1}/${FRAMES} (${(48 / dt).toFixed(1)} fps render)`);
    }
  }
  videoOut.end();
  await once(videoOut, "finish");
  console.log(`[done] ${(performance.now() - t0).toFixed(0)}ms — encode with ffmpeg`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
