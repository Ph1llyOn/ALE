// Genera icone PLACEHOLDER (sfondo rosa, punto bianco) senza dipendenze.
// Da sostituire con il logo definitivo. Uso: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icons');
mkdirSync(out, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

function png(size, { rounded }) {
  const bg = [0xe5, 0x8a, 0xa5], fg = [0xff, 0xff, 0xff];
  const cx = size / 2, cy = size / 2, r = size * 0.18;
  const corner = size * 0.22;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      let inside = true;
      if (rounded) {
        const dx = Math.max(corner - x, 0, x - (size - 1 - corner));
        const dy = Math.max(corner - y, 0, y - (size - 1 - corner));
        inside = dx * dx + dy * dy <= corner * corner;
      }
      const dot = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
      const col = dot ? fg : bg;
      raw[i] = col[0]; raw[i + 1] = col[1]; raw[i + 2] = col[2]; raw[i + 3] = inside ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// "any": angoli arrotondati. apple-touch e maskable: pieno, il sistema applica la maschera.
writeFileSync(join(out, 'icon-192.png'), png(192, { rounded: true }));
writeFileSync(join(out, 'icon-512.png'), png(512, { rounded: true }));
writeFileSync(join(out, 'icon-maskable-512.png'), png(512, { rounded: false }));
writeFileSync(join(out, 'apple-touch-icon.png'), png(180, { rounded: false }));
console.log('Icone placeholder generate in', out);
// apple-touch-icon: pieno e SENZA trasparenza. iOS riempie di nero gli angoli trasparenti.
writeFileSync(join(out, 'apple-touch-icon.png'), png(180, { rounded: false }));
