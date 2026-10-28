import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BG = [27, 23, 18], ACC = [224, 128, 58], CREAM = [239, 230, 210];
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };

// shapes in a 512 design space: [x, y, w, h, r, color]
const shapes = [
  [86, 196, 48, 120, 12, ACC], [378, 196, 48, 120, 12, ACC],
  [140, 160, 52, 192, 14, CREAM], [320, 160, 52, 192, 14, CREAM], [192, 244, 128, 24, 6, CREAM],
];
const inRR = (px, py, [x, y, w, h, r]) => {
  const cx = Math.max(x + r, Math.min(px, x + w - r)), cy = Math.max(y + r, Math.min(py, y + h - r));
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
};

function render(size, { scale = 1, rounded = true }) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const S = 3;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const dx = ((x + (sx + 0.5) / S) / size) * 512, dy = ((y + (sy + 0.5) / S) / size) * 512;
        let col = null, alpha = 0;
        if (!rounded || inRR(dx, dy, [0, 0, 512, 512, 96])) { col = BG; alpha = 1; }
        const ux = 256 + (dx - 256) / scale, uy = 256 + (dy - 256) / scale;
        for (const s of shapes) if (inRR(ux, uy, s)) { col = s[5]; alpha = 1; }
        if (col) { r += col[0]; g += col[1]; b += col[2]; a += alpha; }
      }
      const o = y * (size * 4 + 1) + 1 + x * 4, n = S * S;
      raw[o] = a ? r / a : 0; raw[o + 1] = a ? g / a : 0; raw[o + 2] = a ? b / a : 0; raw[o + 3] = Math.round((a / n) * 255);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync('public/icon-192.png', render(192, {}));
writeFileSync('public/icon-512.png', render(512, {}));
writeFileSync('public/icon-maskable-512.png', render(512, { scale: 0.8, rounded: false }));
writeFileSync('public/apple-touch-icon.png', render(180, { rounded: false }));
console.log('icons written');
