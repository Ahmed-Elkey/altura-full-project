#!/usr/bin/env node
/**
 * ALTURA — Hero Film Renderer (procedural, brand-owned)
 *
 * Renders a cinematic alpine sequence entirely from code:
 *   - deterministic PRNG (mulberry32) → identical output every run
 *   - value-noise fbm terrain → 5 parallax ridgelines w/ atmospheric tint
 *   - drifting fbm cloud band, animated fog, falling snow
 *   - filmic grade: vignette, grain, letterbox
 *   - seamless ambient audio: detuned drone + filtered wind
 *
 * Output: .hero-build/video.raw (RGBA8 960×540@24) + .hero-build/audio.pcm
 * Encode: ffmpeg → public/video/altura-hero.mp4 (H.264, yuv420p)
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
const DURATION = 24;
const FRAMES = FPS * DURATION;
const LETTERBOX = 18;

const SKY = [0xb9c2b9, 0xa9b3aa, 0x9aa79e, 0x8c9a92].map(hexToRgb);
const SUN = hexToRgb(0xf2ead7);
const RIDGE = [0x2c3530, 0x3a453e, 0x4b564e, 0x5d6a61, 0x728076, 0x8b988d].map(hexToRgb);
const FOG = hexToRgb(0xe6e3d8);
const SNOW = hexToRgb(0xf6f4ec);

const RIDGES = [
  { base: 0.46, amp: 0.30, freq: 2.1, speed: 0.006, shade: 5, sky: 0.00, seed: 11.37 },
  { base: 0.54, amp: 0.26, freq: 2.7, speed: 0.010, shade: 4, sky: 0.10, seed: 23.29 },
  { base: 0.62, amp: 0.22, freq: 3.4, speed: 0.016, shade: 3, sky: 0.16, seed: 37.11 },
  { base: 0.72, amp: 0.17, freq: 4.3, speed: 0.024, shade: 2, sky: 0.28, seed: 53.77 },
  { base: 0.84, amp: 0.10, freq: 5.6, speed: 0.035, shade: 1, sky: 0.40, seed: 71.13 },
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

/* ------------------------------------------------- small helpers */
function hexToRgb(h) {
  return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
}
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clampByte = (v) => (v < 0 ? 0 : v > 255 ? 255 : v) | 0;
function smoothstep(a, b, v) {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function ridgeY(r, xn, time) {
  const u = xn * r.freq + r.seed + time * r.speed;
  const n = fbm(u, r.seed, 4);
  const sharp = 1 - Math.abs(n * 2 - 1);
  return r.base - r.amp * (0.55 * n + 0.45 * sharp * sharp);
}

/* ------------------------------------------------- snow particles */
const SNOW_P = [];
{
  const rnd = mulberry32(90210);
  for (let i = 0; i < 150; i++) {
    const depth = 0.25 + rnd() * 0.75;
    SNOW_P.push({
      x0: rnd(),
      y0: rnd(),
      speed: 0.02 + 0.06 * depth,
      depth,
      phase: rnd() * Math.PI * 2,
      alpha: 0.22 + 0.5 * depth,
      big: depth > 0.86 && i % 7 === 0,
    });
  }
}

/* ------------------------------------------------- frame renderer */
const frameBuf = Buffer.allocUnsafe(W * H * 4);

function renderFrame(frameIdx) {
  const time = frameIdx / FPS;
  const t01 = frameIdx / FRAMES;
  const sunX = 0.62 + 0.05 * Math.sin(t01 * Math.PI);
  const sunY = 0.16 + 0.04 * t01;
  const grainRnd = mulberry32((0x9e3779b9 ^ frameIdx) >>> 0);

  frameBuf.fill(255); // alpha = 255 everywhere; RGB fully overwritten below

  /* 1 — sky gradient + sun glow */
  for (let y = 0; y < H; y++) {
    const yn = y / H;
    const band = yn * (SKY.length - 1);
    const bi = Math.min(SKY.length - 2, band | 0);
    const bt = band - bi;
    const top = SKY[bi];
    const bot = SKY[bi + 1];
    const r0 = mix(top[0], bot[0], bt);
    const g0 = mix(top[1], bot[1], bt);
    const b0 = mix(top[2], bot[2], bt);
    for (let x = 0; x < W; x++) {
      const xn = x / W;
      const dx = (xn - sunX) * (W / H);
      const dy = yn - sunY;
      const d2 = dx * dx + dy * dy;
      const warm = Math.exp(-d2 / 0.045) * 0.75 + Math.exp(-d2 / 0.5) * 0.28;
      const i = (y * W + x) * 4;
      frameBuf[i] = clampByte(r0 + (SUN[0] - r0) * warm);
      frameBuf[i + 1] = clampByte(g0 + (SUN[1] - g0) * warm);
      frameBuf[i + 2] = clampByte(b0 + (SUN[2] - b0) * warm);
    }
  }

  /* 2 — drifting cloud band */
  const cloudTop = 0.05;
  const cloudH = 0.26;
  const cs = 3.2;
  const cOffset = time * 0.012;
  const yStart = Math.floor(cloudTop * H);
  const yEnd = Math.floor((cloudTop + cloudH) * H);
  for (let y = yStart; y < yEnd; y++) {
    const vn = (y / H - cloudTop) / cloudH;
    const fadeDown = 1 - smoothstep(0.55, 1, vn);
    for (let x = 0; x < W; x++) {
      const u = (x / W) * cs + cOffset;
      const n = fbm(u, vn * cs * 0.5 + 7.7, 4);
      const c = smoothstep(0.52, 0.8, n) * 0.5 * fadeDown;
      if (c < 0.01) continue;
      const i = (y * W + x) * 4;
      frameBuf[i] = clampByte(frameBuf[i] + (SUN[0] - frameBuf[i]) * c);
      frameBuf[i + 1] = clampByte(frameBuf[i + 1] + (SUN[1] - frameBuf[i + 1]) * c);
      frameBuf[i + 2] = clampByte(frameBuf[i + 2] + (SUN[2] - frameBuf[i + 2]) * c);
    }
  }

  /* 3 — parallax ridgelines, far → near */
  for (const r of RIDGES) {
    const shade = RIDGE[r.shade];
    for (let x = 0; x < W; x++) {
      const xn = x / W;
      const topY = ridgeY(r, xn, time);
      const yFrom = Math.max(0, Math.ceil(topY * H));
      const dxs = (xn - sunX) * (W / H);
      const glow = Math.exp(-(dxs * dxs) / 0.35) * 0.18 * r.sky;
      // per-column tint (atmospheric perspective + sun-side light)
      let cr = shade[0];
      let cg = shade[1];
      let cb = shade[2];
      if (r.sky > 0) {
        const tint = SKY[1];
        cr += (tint[0] - cr) * r.sky;
        cg += (tint[1] - cg) * r.sky;
        cb += (tint[2] - cb) * r.sky;
      }
      if (glow > 0.01) {
        cr += (SUN[0] - cr) * glow;
        cg += (SUN[1] - cg) * glow;
        cb += (SUN[2] - cb) * glow;
      }
      for (let y = yFrom; y < H; y++) {
        const i = (y * W + x) * 4;
        frameBuf[i] = cr;
        frameBuf[i + 1] = cg;
        frameBuf[i + 2] = cb;
      }
    }
  }

  /* 4 — animated fog band over the valley */
  const fogTop = 0.34 + 0.04 * Math.sin(t01 * Math.PI * 2 + 0.7);
  const fogBot = 0.95;
  for (let y = Math.floor(fogTop * H); y < Math.floor(fogBot * H); y++) {
    const yn = y / H;
    // guard against NaN: sin can be negative for the first rows (negative^1.6 = NaN)
    const wave = Math.max(0, Math.sin(Math.PI * (yn - fogTop) / (fogBot - fogTop)));
    const a = Math.pow(wave, 1.6) * 0.34;
    if (a < 0.01) continue;
    for (let x = 0; x < W; x++) {
      const u = (x / W) * 2.4 + time * 0.02;
      const m = 0.55 + 0.45 * fbm(u, yn * 3 + 3.3, 3);
      const k = a * m;
      const i = (y * W + x) * 4;
      frameBuf[i] = clampByte(frameBuf[i] + (FOG[0] - frameBuf[i]) * k);
      frameBuf[i + 1] = clampByte(frameBuf[i + 1] + (FOG[1] - frameBuf[i + 1]) * k);
      frameBuf[i + 2] = clampByte(frameBuf[i + 2] + (FOG[2] - frameBuf[i + 2]) * k);
    }
  }

  /* 5 — snowfall (in front of everything) */
  for (const p of SNOW_P) {
    const py01 = (p.y0 + time * p.speed) % 1.06;
    if (py01 > 1) continue;
    const px01 = (((p.x0 + 0.03 * Math.sin(time * 0.6 + p.phase) + time * 0.008 * p.depth) % 1) + 1) % 1;
    const px = (px01 * W) | 0;
    const py = (py01 * H) | 0;
    const i = (py * W + px) * 4;
    frameBuf[i] = clampByte(frameBuf[i] + (SNOW[0] - frameBuf[i]) * p.alpha);
    frameBuf[i + 1] = clampByte(frameBuf[i + 1] + (SNOW[1] - frameBuf[i + 1]) * p.alpha);
    frameBuf[i + 2] = clampByte(frameBuf[i + 2] + (SNOW[2] - frameBuf[i + 2]) * p.alpha);
    if (p.big) {
      const a2 = p.alpha * 0.35;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + ox;
        const ny = py + oy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const j = (ny * W + nx) * 4;
        frameBuf[j] = clampByte(frameBuf[j] + (SNOW[0] - frameBuf[j]) * a2);
        frameBuf[j + 1] = clampByte(frameBuf[j + 1] + (SNOW[1] - frameBuf[j + 1]) * a2);
        frameBuf[j + 2] = clampByte(frameBuf[j + 2] + (SNOW[2] - frameBuf[j + 2]) * a2);
      }
    }
  }

  /* 6 — grade: vignette + grain + letterbox */
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

/* ------------------------------------------------- audio renderer */
function renderAudio() {
  const sr = 48000;
  const N = sr * DURATION;
  const L = new Float64Array(N);
  const R = new Float64Array(N);

  // filtered wind (deterministic)
  const rnd = mulberry32(4242);
  let lp = 0;
  let bp = 0;
  let prev = 0;
  for (let n = 0; n < N; n++) {
    const tt = n / sr;
    const gust = 0.55 + 0.45 * Math.sin(2 * Math.PI * (tt / 15) + 1.3) * Math.sin(2 * Math.PI * (tt / 7.3));
    const w = (rnd() * 2 - 1) * gust;
    lp += 0.02 * (w - lp);
    bp = 0.96 * bp + 0.04 * (w - prev);
    prev = w;
    L[n] = lp * 2.2 + bp * 0.35;
    R[n] = lp * 2.0 + bp * 0.45;
  }

  // detuned drone stack (A2 / E3 / B3 + sub A1)
  const partials = [
    [55, 0.1, 0],
    [110, 0.22, 0.3],
    [110.7, 0.22, -0.3],
    [164.8, 0.13, 0.5],
    [165.3, 0.13, -0.5],
    [246.9, 0.08, 0.15],
    [247.4, 0.08, -0.15],
    [329.6, 0.045, 0.6],
  ];
  for (let n = 0; n < N; n++) {
    const tt = n / sr;
    const fade = Math.min(1, tt / 2.5) * Math.min(1, (DURATION - tt) / 2.5);
    if (fade <= 0) continue;
    let l = 0;
    let r = 0;
    for (const [f0, amp, pan] of partials) {
      const vib = 1 + 0.0012 * Math.sin(2 * Math.PI * 0.13 * tt + f0);
      const s = Math.sin(2 * Math.PI * f0 * vib * tt) * amp * fade;
      l += s * (1 - Math.max(0, pan));
      r += s * (1 + Math.min(0, pan));
    }
    L[n] += l * 0.9;
    R[n] += r * 0.9;
  }

  const pcm = Buffer.alloc(N * 4);
  for (let n = 0; n < N; n++) {
    const l = Math.tanh(L[n] * 1.1) * 0.72 * fadeAudio(n / sr);
    const r = Math.tanh(R[n] * 1.1) * 0.72 * fadeAudio(n / sr);
    pcm.writeInt16LE((l * 32767) | 0, n * 4);
    pcm.writeInt16LE((r * 32767) | 0, n * 4 + 2);
  }
  writeFileSync(path.join(OUT, "audio.pcm"), pcm);
}

function fadeAudio(tt) {
  return Math.min(1, tt / 2.5) * Math.min(1, (DURATION - tt) / 2.5);
}

/* ------------------------------------------------- main */
async function main() {
  const t0 = performance.now();
  renderAudio();
  console.log(`[audio] ${DURATION}s ambient track rendered`);

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
  console.log(`[done] ${(performance.now() - t0).toFixed(0)}ms — now encode with ffmpeg`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
