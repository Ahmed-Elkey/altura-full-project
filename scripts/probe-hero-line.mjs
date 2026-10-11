import { openSync, readSync, statSync } from "node:fs";

const W = 960, H = 540, FH = W * H * 4;
const fd = openSync(".hero-build/video.raw", "r");
const total = statSync(".hero-build/video.raw").size;
const N = Math.floor(total / FH);
const buf = Buffer.alloc(FH);

function probe(idx) {
  readSync(fd, buf, 0, FH, idx * FH);
  const rows = new Float64Array(H);
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      s += buf[i] + buf[i + 1] + buf[i + 2];
    }
    rows[y] = s / W / 3;
  }
  // top 6 row-to-row jumps
  const jumps = [];
  for (let y = 1; y < H; y++) jumps.push([Math.abs(rows[y] - rows[y - 1]), y]);
  jumps.sort((a, b) => b[0] - a[0]);
  console.log(`frame ${idx}: top row jumps:`);
  for (const [d, y] of jumps.slice(0, 6)) {
    console.log(`  y=${y} (${(y / H).toFixed(3)})  Δ=${d.toFixed(2)}  mean[y-1]=${rows[y - 1].toFixed(1)} mean[y]=${rows[y].toFixed(1)}`);
  }
}

for (const idx of [0, 60, 240, 420]) probe(idx);
console.log("frames:", N);
