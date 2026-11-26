// Genera le illustrazioni degli esercizi (SVG) e aggiorna il registro delle licenze.
// Le figure sono ORIGINALI del progetto (omini stilizzati disegnati da coordinate): nessuna immagine esterna.
// Uso: node tools/make-exercise-art.mjs
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets', 'exercises');
mkdirSync(outDir, { recursive: true });

const NEAR = '#d9719a';
const FAR = '#f0a9c1';
const GEAR = '#a98a96';
const FLOOR = '#e6c3cf';

const line = (pts, color, w = 9, op = 1) =>
  `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;

const mat = '<rect x="8" y="138" width="184" height="7" rx="3.5" fill="#f3d7e0"/>';
const floor = `<line x1="14" y1="142" x2="186" y2="142" stroke="${FLOOR}" stroke-width="3" stroke-linecap="round"/>`;
const dumbbell = (x, y, vertical = false) => vertical
  ? `<g stroke="${GEAR}" stroke-linecap="round"><line x1="${x}" y1="${y - 9}" x2="${x}" y2="${y + 9}" stroke-width="5"/><line x1="${x - 7}" y1="${y - 9}" x2="${x + 7}" y2="${y - 9}" stroke-width="6"/><line x1="${x - 7}" y1="${y + 9}" x2="${x + 7}" y2="${y + 9}" stroke-width="6"/></g>`
  : `<g stroke="${GEAR}" stroke-linecap="round"><line x1="${x - 9}" y1="${y}" x2="${x + 9}" y2="${y}" stroke-width="5"/><line x1="${x - 9}" y1="${y - 7}" x2="${x - 9}" y2="${y + 7}" stroke-width="6"/><line x1="${x + 9}" y1="${y - 7}" x2="${x + 9}" y2="${y + 7}" stroke-width="6"/></g>`;

// Ogni posa: head, neck, hip + arti vicini (elbow/hand, knee/foot) e lontani (elbow2/hand2, knee2/foot2).
const POSES = {
  squat: { head: [98, 32], neck: [98, 50], hip: [74, 96], knee: [112, 100], foot: [98, 138], elbow: [114, 56], hand: [136, 60], knee2: [118, 104], foot2: [104, 138], elbow2: [118, 58], hand2: [138, 64], extra: [floor] },
  lunge: { head: [96, 30], neck: [96, 48], hip: [96, 92], knee: [124, 104], foot: [126, 138], knee2: [80, 118], foot2: [58, 138], elbow: [110, 68], hand: [102, 84], elbow2: [84, 68], hand2: [92, 84], extra: [floor] },
  'glute-bridge': { head: [30, 128], neck: [46, 128], hip: [104, 104], knee: [140, 92], foot: [156, 138], elbow: [66, 134], hand: [90, 136], extra: [mat] },
  plank: { head: [34, 98], neck: [50, 104], hip: [118, 116], knee: [146, 124], foot: [172, 134], elbow: [54, 130], hand: [80, 132], extra: [mat] },
  'wall-sit': { head: [70, 34], neck: [70, 50], hip: [72, 98], knee: [114, 98], foot: [116, 138], elbow: [88, 74], hand: [104, 92], extra: [floor, `<line x1="58" y1="14" x2="58" y2="142" stroke="${GEAR}" stroke-width="5" stroke-linecap="round" opacity=".6"/>`] },
  'calf-raise': { head: [100, 28], neck: [100, 46], hip: [100, 92], knee: [100, 116], foot: [104, 134], knee2: [106, 116], foot2: [110, 134], elbow: [92, 68], hand: [90, 88], elbow2: [108, 68], hand2: [110, 88], extra: [floor, `<path d="M150 80 v-22 m-7 7 l7 -7 l7 7" fill="none" stroke="${FAR}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`] },
  'bird-dog': { head: [48, 76], neck: [64, 84], hip: [124, 86], knee: [150, 84], foot: [180, 82], knee2: [124, 124], foot2: [140, 136], elbow: [40, 84], hand: [18, 80], elbow2: [64, 108], hand2: [64, 134], extra: [mat] },
  superman: { head: [36, 112], neck: [52, 116], hip: [112, 120], knee: [144, 114], foot: [176, 106], elbow: [30, 108], hand: [10, 102], extra: [mat] },
  'push-up-knees': { head: [34, 94], neck: [50, 100], hip: [112, 116], knee: [138, 132], foot: [166, 122], elbow: [56, 120], hand: [56, 138], extra: [mat] },
  'side-leg-raise': { head: [38, 108], neck: [54, 114], hip: [112, 122], knee: [148, 128], foot: [180, 134], knee2: [148, 98], foot2: [182, 80], elbow: [44, 128], hand: [60, 130], elbow2: [68, 104], hand2: [84, 118], extra: [mat] },
  march: { head: [100, 30], neck: [100, 48], hip: [100, 92], knee: [126, 90], foot: [126, 116], knee2: [100, 116], foot2: [100, 138], elbow: [86, 70], hand: [74, 86], elbow2: [116, 68], hand2: [128, 82], extra: [floor] },
  'arm-circles': { head: [100, 32], neck: [100, 50], hip: [100, 96], knee: [100, 118], foot: [100, 138], knee2: [106, 118], foot2: [108, 138], elbow: [70, 52], hand: [40, 52], elbow2: [130, 52], hand2: [160, 52], extra: [floor, `<path d="M34 40 a14 14 0 1 1 -2 18" fill="none" stroke="${FAR}" stroke-width="4" stroke-linecap="round"/><path d="M166 40 a14 14 0 1 0 2 18" fill="none" stroke="${FAR}" stroke-width="4" stroke-linecap="round"/>`] },
  'dumbbell-curl': { head: [100, 30], neck: [100, 48], hip: [100, 94], knee: [100, 118], foot: [102, 138], elbow: [96, 74], hand: [116, 58], elbow2: [108, 74], hand2: [108, 96], extra: [floor, dumbbell(118, 58), dumbbell(108, 98)] },
  'dumbbell-press': { head: [100, 30], neck: [100, 48], hip: [100, 94], knee: [100, 118], foot: [102, 138], elbow: [122, 46], hand: [122, 16], elbow2: [78, 46], hand2: [78, 16], extra: [floor, dumbbell(122, 12), dumbbell(78, 12)] },
  'goblet-squat': { head: [98, 32], neck: [98, 50], hip: [74, 96], knee: [112, 100], foot: [98, 138], elbow: [108, 72], hand: [114, 62], knee2: [118, 104], foot2: [104, 138], extra: [floor, dumbbell(116, 64, true)] },
  'step-up': { head: [96, 28], neck: [96, 46], hip: [100, 90], knee: [122, 96], foot: [140, 110], knee2: [102, 116], foot2: [98, 138], elbow: [110, 64], hand: [102, 80], extra: [floor, `<rect x="118" y="112" width="62" height="30" rx="6" fill="#f3d7e0" stroke="${GEAR}" stroke-width="3" opacity=".9"/>`] },
  'band-pull-apart': { head: [100, 30], neck: [100, 48], hip: [100, 94], knee: [100, 118], foot: [102, 138], elbow: [74, 56], hand: [50, 56], elbow2: [126, 56], hand2: [150, 56], extra: [floor, `<line x1="50" y1="56" x2="150" y2="56" stroke="${GEAR}" stroke-width="4" stroke-dasharray="1 7" stroke-linecap="round"/>`] },
  'kettlebell-squat': { head: [98, 32], neck: [98, 50], hip: [74, 96], knee: [112, 100], foot: [98, 138], elbow: [108, 72], hand: [114, 64], knee2: [118, 104], foot2: [104, 138], extra: [floor, `<g stroke="${GEAR}" fill="none" stroke-width="5" stroke-linecap="round"><circle cx="118" cy="70" r="9" fill="#f3d7e0"/><path d="M110 62 q8 -10 16 0"/></g>`] },
  'ball-wall-squat': { head: [70, 34], neck: [70, 50], hip: [78, 98], knee: [116, 100], foot: [118, 138], elbow: [92, 72], hand: [108, 90], extra: [floor, `<line x1="48" y1="14" x2="48" y2="142" stroke="${GEAR}" stroke-width="5" stroke-linecap="round" opacity=".6"/><circle cx="58" cy="74" r="14" fill="#f3d7e0" stroke="${GEAR}" stroke-width="3"/>`] },
  'ball-bridge': { head: [30, 128], neck: [46, 128], hip: [104, 104], knee: [140, 92], foot: [160, 124], elbow: [66, 134], hand: [90, 136], extra: [mat, `<circle cx="166" cy="118" r="18" fill="#f3d7e0" stroke="${GEAR}" stroke-width="3"/>`] },
  'medball-press': { head: [100, 30], neck: [100, 48], hip: [100, 94], knee: [100, 118], foot: [102, 138], elbow: [116, 44], hand: [104, 18], elbow2: [84, 44], hand2: [96, 18], extra: [floor, `<circle cx="100" cy="10" r="11" fill="#f3d7e0" stroke="${GEAR}" stroke-width="3"/>`] },
  'jump-rope': { head: [100, 28], neck: [100, 46], hip: [100, 90], knee: [100, 112], foot: [102, 128], knee2: [106, 112], foot2: [108, 128], elbow: [82, 66], hand: [72, 86], elbow2: [118, 66], hand2: [128, 86], extra: [floor, `<path d="M72 86 C 40 150, 160 150, 128 86" fill="none" stroke="${GEAR}" stroke-width="3" stroke-linecap="round"/>`] },
  'ankle-leg-raise': { head: [38, 108], neck: [54, 114], hip: [112, 122], knee: [148, 128], foot: [180, 134], knee2: [148, 98], foot2: [182, 80], elbow: [44, 128], hand: [60, 130], elbow2: [68, 104], hand2: [84, 118], extra: [mat, `<rect x="172" y="74" width="14" height="10" rx="3" fill="${GEAR}"/>`] },
  'treadmill-walk': { head: [100, 30], neck: [100, 48], hip: [100, 92], knee: [122, 112], foot: [116, 134], knee2: [94, 116], foot2: [76, 132], elbow: [86, 70], hand: [74, 86], elbow2: [116, 68], hand2: [126, 82], extra: [`<rect x="40" y="138" width="130" height="8" rx="4" fill="#f3d7e0" stroke="${GEAR}" stroke-width="3"/><line x1="160" y1="138" x2="168" y2="60" stroke="${GEAR}" stroke-width="5" stroke-linecap="round"/>`] },
  'easy-pedal': { head: [88, 32], neck: [92, 50], hip: [84, 94], knee: [118, 96], foot: [110, 128], knee2: [112, 108], foot2: [118, 136], elbow: [116, 62], hand: [136, 70], extra: [`<circle cx="112" cy="128" r="16" fill="none" stroke="${GEAR}" stroke-width="4"/><line x1="70" y1="100" x2="100" y2="100" stroke="${GEAR}" stroke-width="6" stroke-linecap="round"/><line x1="136" y1="70" x2="136" y2="100" stroke="${GEAR}" stroke-width="5" stroke-linecap="round"/>`] },
};

function svg(id, p) {
  const far = [];
  if (p.knee2) far.push(line([p.hip, p.knee2, p.foot2], FAR, 9, 0.9));
  if (p.elbow2) far.push(line([p.neck, p.elbow2, p.hand2], FAR, 9, 0.9));
  const near = [
    line([p.neck, p.hip], NEAR, 11),
    line([p.hip, p.knee, p.foot], NEAR, 9),
    line([p.neck, p.elbow, p.hand], NEAR, 9),
  ];
  const head = `<circle cx="${p.head[0]}" cy="${p.head[1]}" r="11" fill="#fde3ea" stroke="${NEAR}" stroke-width="5"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160" role="img" aria-label="${id}">\n  ${(p.extra ?? []).join('\n  ')}\n  ${far.join('\n  ')}\n  ${near.join('\n  ')}\n  ${head}\n</svg>\n`;
}

const rows = [];
for (const [id, pose] of Object.entries(POSES)) {
  writeFileSync(join(outDir, `${id}.svg`), svg(id, pose));
  rows.push(`| \`${id}.svg\` | ${id} | Progetto ALE. (disegno originale, \`tools/make-exercise-art.mjs\`) | Questo repository | Proprietà del progetto | ${new Date().toISOString().slice(0, 10)} | nessuna | generata da coordinate |`);
}

// Registro delle licenze: blocco gestito automaticamente
const regPath = join(root, 'docs', 'ASSET_LICENSES.md');
let reg = readFileSync(regPath, 'utf8');
const block = `<!-- exercises:start -->\n${rows.join('\n')}\n<!-- exercises:end -->`;
if (reg.includes('<!-- exercises:start -->')) reg = reg.replace(/<!-- exercises:start -->[\s\S]*<!-- exercises:end -->/, block);
else reg = reg.replace('| _nessuna ancora_ | | | | | | | |', block);
writeFileSync(regPath, reg);
console.log(`${rows.length} illustrazioni generate in assets/exercises e registrate in docs/ASSET_LICENSES.md`);
