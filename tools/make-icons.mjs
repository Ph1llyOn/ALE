// Genera le icone PLACEHOLDER (sfondo rosa, punto bianco) senza dipendenze.
// Da sostituire con il logo definitivo. Uso: node tools/make-icons.mjs
// Tutte le icone sono PNG RGB PIENI, senza canale alpha e senza angoli trasparenti:
// iOS e alcuni launcher riempiono le zone trasparenti di nero (in chiaro e in scuro).
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

// RGB a 8 bit (colorType 2): nessun canale alpha.
function png(size) {
  const bg = [0xe5, 0x8a, 0xa5], fg = [0xff, 0xff, 0xff];
  const cx = size / 2, cy = size / 2, r = size * 0.18;
  const row = size * 3 + 1;
  const raw = Buffer.alloc(size * row);
  for (let y = 0; y < size; y++) {
    raw[y * row] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * row + 1 + x * 3;
      const dot = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
      const col = dot ? fg : bg;
      raw[i] = col[0]; raw[i + 1] = col[1]; raw[i + 2] = col[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bit, RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(join(out, 'icon-192.png'), png(192));
writeFileSync(join(out, 'icon-512.png'), png(512));
writeFileSync(join(out, 'icon-maskable-512.png'), png(512));
writeFileSync(join(out, 'apple-touch-icon.png'), png(180));
// variante per il tema scuro (stessa grafica: serve a verificare se iOS la usa)
writeFileSync(join(out, 'apple-touch-icon-dark.png'), png(180));
console.log('Icone placeholder generate (RGB pieno) in', out);
