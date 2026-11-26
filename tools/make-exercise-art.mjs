// Genera le illustrazioni ANIMATE degli esercizi (SVG + SMIL) e aggiorna il registro delle licenze.
// Le figure sono ORIGINALI del progetto (omini stilizzati disegnati da coordinate): nessuna immagine esterna.
// Ogni esercizio del catalogo (js/data/exercise-catalog.js) ha un SVG: due (o più) pose chiave tra cui l'omino si muove
// (anim: 'movement'), oppure una posa tenuta con un respiro appena accennato (anim: 'hold').
// Uso: node tools/make-exercise-art.mjs
import { writeFileSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets', 'exercises');
mkdirSync(outDir, { recursive: true });
const { EXERCISES } = await import(pathToFileURL(join(root, 'js', 'data', 'exercise-catalog.js')).href);

const NEAR = '#d9719a';
const FAR = '#f0a9c1';
const GEAR = '#a98a96';
const FLOOR = '#e6c3cf';
const SOFT = '#f3d7e0';

// ------------------------------------------------------------------ utilità
const R = (n) => Math.round(n * 10) / 10;
const fmt = (pts) => pts.map((p) => `${R(p[0])},${R(p[1])}`).join(' ');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const P = (base, o) => ({ ...base, ...o });
const shift = (p, dx, dy) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, [v[0] + dx, v[1] + dy]]));
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const mid = (a, b) => lerp(a, b, 0.5);
// cinematica inversa a 2 segmenti: ginocchio/gomito tra a e b (dir=-1: piega verso destra per una gamba verso il basso)
const ik = (a, b, l1, l2, dir = 1) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const d = Math.hypot(dx, dy) || 1;
  const dd = Math.min(d, l1 + l2 - 0.5);
  const aa = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
  const h = Math.sqrt(Math.max(0, l1 * l1 - aa * aa));
  const ux = dx / d, uy = dy / d;
  return [a[0] + ux * aa - dir * uy * h, a[1] + uy * aa + dir * ux * h];
};
const leg = (hip, foot, l = 27) => ik(hip, foot, l, l, -1);
const arm = (sh, hand, l = 23, dir = 1) => ik(sh, hand, l, l, dir);

const floor = `<line x1="14" y1="142" x2="186" y2="142" stroke="${FLOOR}" stroke-width="3" stroke-linecap="round"/>`;
const mat = `<rect x="8" y="138" width="184" height="7" rx="3.5" fill="${SOFT}"/>`;
const wallAt = (x) => `<line x1="${x}" y1="12" x2="${x}" y2="142" stroke="${GEAR}" stroke-width="5" stroke-linecap="round" opacity=".6"/>`;
const dumbbell = (x, y, vertical = false) => vertical
  ? `<g stroke="${GEAR}" stroke-linecap="round"><line x1="${x}" y1="${y - 9}" x2="${x}" y2="${y + 9}" stroke-width="5"/><line x1="${x - 7}" y1="${y - 9}" x2="${x + 7}" y2="${y - 9}" stroke-width="6"/><line x1="${x - 7}" y1="${y + 9}" x2="${x + 7}" y2="${y + 9}" stroke-width="6"/></g>`
  : `<g stroke="${GEAR}" stroke-linecap="round"><line x1="${x - 9}" y1="${y}" x2="${x + 9}" y2="${y}" stroke-width="5"/><line x1="${x - 9}" y1="${y - 7}" x2="${x - 9}" y2="${y + 7}" stroke-width="6"/><line x1="${x + 9}" y1="${y - 7}" x2="${x + 9}" y2="${y + 7}" stroke-width="6"/></g>`;
const kettle = (x, y) => `<g stroke="${GEAR}" fill="none" stroke-width="5" stroke-linecap="round"><circle cx="${x}" cy="${y}" r="9" fill="${SOFT}"/><path d="M${x - 8} ${y - 8} q8 -10 16 0"/></g>`;
const ball = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${SOFT}" stroke="${GEAR}" stroke-width="3"/>`;
const stepBlock = (x, y, w) => `<rect x="${x}" y="${y}" width="${w}" height="${142 - y}" rx="5" fill="${SOFT}" stroke="${GEAR}" stroke-width="3"/>`;
const pedal = (x, y) => `<line x1="${x - 9}" y1="${y}" x2="${x + 9}" y2="${y}" stroke="${GEAR}" stroke-width="5" stroke-linecap="round"/>`;
const chair = (x0, seatY, w, backLeft = true) => {
  const x1 = x0 + w, bx = backLeft ? x0 : x1;
  return `<g stroke="${GEAR}" stroke-linecap="round" fill="none"><line x1="${x0}" y1="${seatY}" x2="${x1}" y2="${seatY}" stroke-width="5"/><line x1="${bx}" y1="${seatY}" x2="${bx}" y2="${seatY - 32}" stroke-width="5"/><line x1="${x0 + 3}" y1="${seatY}" x2="${x0 + 3}" y2="142" stroke-width="4"/><line x1="${x1 - 3}" y1="${seatY}" x2="${x1 - 3}" y2="142" stroke-width="4"/></g>`;
};

// respiro: sposta appena testa e busto (1-2 px)
const breathe = (p, o = {}) => {
  const d = { head: [0, -1.5], neck: [0, -1], ...(p.mid ? { mid: [0, -1] } : {}), ...o };
  const q = { ...p };
  for (const [k, v] of Object.entries(d)) q[k] = [p[k][0] + v[0], p[k][1] + v[1]];
  return q;
};

// ------------------------------------------------------------------ pose di base
const FV = { head: [100, 30], neck: [100, 48], sh: [88, 50], sh2: [112, 50], hip: [100, 94], knee: [96, 118], foot: [94, 138], knee2: [104, 118], foot2: [106, 138] };
const FVA = P(FV, { elbow: [80, 68], hand: [80, 88], elbow2: [120, 68], hand2: [120, 88] });
const FV_ARMS_UP = { elbow: [76, 28], hand: [86, 10], elbow2: [124, 28], hand2: [114, 10] };
const SB = { head: [100, 24], neck: [100, 42], hip: [100, 86], knee: [101, 112], foot: [102, 138] };
const SQ0 = P(SB, { knee2: [106, 112], foot2: [108, 138], elbow: [110, 60], hand: [118, 74], elbow2: [116, 60], hand2: [124, 74] });
const SQ1 = { head: [119, 53], neck: [110, 68], hip: [88, 106], knee: [116, 114], foot: [102, 138], knee2: [120, 113], foot2: [108, 138], elbow: [126, 70], hand: [146, 68], elbow2: [130, 70], hand2: [150, 68] };
const BR_B = { head: [28, 131], neck: [46, 131], hip: [98, 131], knee: [124, 98], foot: [146, 133], elbow: [66, 134], hand: [90, 135] };
const BR_T = { head: [32, 131], neck: [50, 130], hip: [100, 108], knee: [140, 92], foot: [146, 133], elbow: [72, 134], hand: [94, 135] };
const QUAD = { head: [48, 78], neck: [64, 84], hip: [124, 86] };
const SIDE = { head: [38, 126], neck: [54, 130], hip: [112, 131], elbow: [40, 134], hand: [28, 124], elbow2: [68, 114], hand2: [84, 130] };

// ------------------------------------------------------------------ definizioni: ogni esercizio = pose chiave + attrezzatura
// frames: 2 pose (A;B;A) oppure un ciclo completo (>2 pose, l'ultima uguale alla prima).
// gear: oggetti che seguono un giunto (at) con scostamento (off); front: disegnati sopra la figura.
// hold: posa tenuta (frames[0]) con respiro e un anello che pulsa ({ pulse: [cx, cy, r0, r1] }).
const DEFS = {};

// --- riscaldamento e mobilità
{
  const A = { head: [100, 30], neck: [100, 48], hip: [100, 92], knee: [126, 90], foot: [126, 116], knee2: [100, 116], foot2: [100, 138], elbow: [86, 70], hand: [74, 86], elbow2: [116, 68], hand2: [128, 82] };
  const B = P(A, { knee: [100, 116], foot: [102, 138], knee2: [126, 90], foot2: [126, 116], elbow: [116, 68], hand: [128, 82], elbow2: [86, 70], hand2: [74, 86] });
  DEFS.march = { dur: 2, frames: [A, B], back: [floor], desc: 'Sul posto alzi un ginocchio alla volta, con le braccia che oscillano in alternanza.' };
}
{
  const fr = [0, 90, 180, 270, 360].map((deg) => {
    const a = (deg * Math.PI) / 180;
    const hand = [40 + 12 * Math.cos(a), 52 + 12 * Math.sin(a)];
    const hand2 = [200 - hand[0], hand[1]];
    return P(FV, { hand, elbow: mid([88, 50], hand), hand2, elbow2: mid([112, 50], hand2) });
  });
  const ring = (cx) => `<circle cx="${cx}" cy="52" r="12" fill="none" stroke="${FAR}" stroke-width="3" stroke-dasharray="2 6" stroke-linecap="round"/>`;
  DEFS['arm-circles'] = { dur: 3, calc: 'linear', frames: fr, back: [floor, ring(40), ring(160)], desc: 'Le braccia restano distese ai lati e le mani disegnano cerchi ampi e morbidi.' };
}
{
  const mk = (hx, headX, neckX, kn, kn2) => P(FV, { head: [headX, 30], neck: [neckX, 48], hip: [hx, 94], knee: [kn, 118], knee2: [kn2, 118], elbow: [hx - 26, 70], hand: [hx - 10, 92], elbow2: [hx + 26, 70], hand2: [hx + 10, 92] });
  DEFS['hip-circles'] = { dur: 2.4, frames: [mk(108, 97, 98, 102, 112), mk(92, 103, 102, 88, 98)], back: [floor, `<ellipse cx="100" cy="94" rx="22" ry="7" fill="none" stroke="${FAR}" stroke-width="3" stroke-dasharray="2 6" stroke-linecap="round"/>`], desc: 'Mani sui fianchi: il bacino disegna cerchi lenti mentre testa e spalle restano quasi ferme.' };
}
{
  const N = FVA;
  const U = P(FVA, { head: [100, 34], neck: [100, 44], sh: [88, 40], sh2: [112, 40], elbow: [79, 60], hand: [79, 80], elbow2: [121, 60], hand2: [121, 80] });
  const D = P(FVA, { head: [100, 31], neck: [100, 49], sh: [91, 54], sh2: [109, 54], elbow: [84, 72], hand: [84, 92], elbow2: [116, 72], hand2: [116, 92] });
  DEFS['shoulder-rolls'] = { dur: 3.2, frames: [N, U, D, N], back: [floor, ...[88, 112].map((x) => `<circle cx="${x}" cy="50" r="13" fill="none" stroke="${FAR}" stroke-width="3" stroke-dasharray="2 6" stroke-linecap="round"/>`)], desc: 'Le spalle salgono verso le orecchie, poi vanno indietro e giù, in un cerchio rilassato.' };
}
{
  const arms = { elbow: [65, 114], hand: [66, 138], elbow2: [71, 114], hand2: [72, 138], knee: [122, 118], foot: [146, 137], knee2: [128, 118], foot2: [152, 137] };
  const cat = P(arms, { head: [52, 102], neck: [64, 92], mid: [94, 72], hip: [124, 88] });
  const cow = P(arms, { head: [50, 70], neck: [64, 82], mid: [94, 98], hip: [124, 84], elbow: [65, 110], elbow2: [71, 110] });
  DEFS['cat-cow'] = { dur: 3.4, frames: [cat, cow], back: [mat], desc: 'Su mani e ginocchia la schiena si inarca verso l’alto (gatto) e poi si abbassa (mucca).' };
}

// --- gambe e glutei
DEFS.squat = { dur: 3, frames: [SQ0, SQ1], back: [floor], desc: 'Dalla posizione in piedi scendi col bacino indietro, come per sederti, e risali.' };
DEFS['chair-squat'] = { dur: 3.2, frames: [SQ0, SQ1], back: [floor, chair(62, 114, 36)], desc: 'Ti siedi piano sulla sedia dietro di te e ti rialzi senza spingere con le mani.' };
{
  const A = P(SB, { knee2: [106, 112], foot2: [108, 138], elbow: [106, 62], hand: [112, 56] });
  const B = P(SQ1, { elbow: [114, 88], hand: [126, 80] });
  delete B.elbow2; delete B.hand2;
  DEFS['goblet-squat'] = { dur: 3.2, frames: [A, B], back: [floor], gear: [{ at: 'hand', off: [3, 4], front: true, draw: (x, y) => dumbbell(x, y, true) }], desc: 'Il manubrio resta vicino al petto mentre scendi in squat e risali.' };
  const A2 = { ...A }, B2 = { ...B };
  DEFS['kettlebell-squat'] = { dur: 3.2, frames: [A2, B2], back: [floor], gear: [{ at: 'hand', off: [3, 8], front: true, draw: (x, y) => kettle(x, y) }], desc: 'La kettlebell resta vicino al petto mentre scendi in squat e risali.' };
}
{
  const A = { head: [76, 24], neck: [74, 42], hip: [74, 86], knee: [86, 112], foot: [92, 138], elbow: [86, 62], hand: [98, 72] };
  const B = { head: [77, 46], neck: [74, 64], hip: [72, 108], knee: [106, 110], foot: [104, 138], elbow: [90, 84], hand: [100, 98] };
  DEFS['ball-wall-squat'] = { dur: 3.2, frames: [A, B], back: [floor, wallAt(44), (an) => `<circle cx="59" cy="62" r="14" fill="${SOFT}" stroke="${GEAR}" stroke-width="3">${an('cy', [62, 84, 62])}</circle>`], desc: 'Con la palla tra la schiena e il muro scendi piano come per sederti e risali.' };
}
{
  const A = { head: [70, 34], neck: [70, 50], hip: [72, 98], knee: [114, 98], foot: [116, 138], elbow: [88, 74], hand: [104, 92] };
  DEFS['wall-sit'] = { dur: 3.6, frames: [A], hold: { pulse: [93, 98, 9, 15] }, back: [floor, wallAt(63)], desc: 'Schiena al muro e cosce quasi orizzontali: resti fermo, respirando con regolarità.' };
}
{
  const A = { head: [100, 24], neck: [100, 42], hip: [100, 86], knee: [101, 112], foot: [103, 138], knee2: [98, 112], foot2: [97, 138], elbow: [88, 62], hand: [96, 82] };
  const B = { head: [98, 40], neck: [98, 58], hip: [98, 100], knee: [122, 112], foot: [120, 138], knee2: [84, 128], foot2: [60, 136], elbow: [86, 78], hand: [94, 96] };
  DEFS.lunge = { dur: 3.2, frames: [A, B], back: [floor], desc: 'Un piede va indietro e scendi con il busto dritto, poi spingi e torni in piedi.' };
}
{
  const A = { head: [98, 26], neck: [96, 44], hip: [96, 86], knee: [118, 98], foot: [128, 115], knee2: [97, 112], foot2: [97, 138], elbow: [84, 64], hand: [94, 84] };
  const B = { head: [130, 10], neck: [128, 28], hip: [128, 70], knee: [129, 94], foot: [128, 115], knee2: [142, 88], foot2: [134, 104], elbow: [116, 48], hand: [126, 68] };
  DEFS['step-up'] = { dur: 3, frames: [A, B], back: [floor, stepBlock(112, 120, 74)], desc: 'Un piede sale sullo step e ti porti in piedi sopra, poi scendi con controllo.' };
}
{
  const A = FVA;
  const B = P(shift(FVA, 0, -8), { foot: [94, 131], foot2: [106, 131] });
  const toe = (x, y0, y1, color, op) => (an) => `<polyline points="${x},${y0} ${x + 6},138" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" opacity="${op}">${an('points', [`${x},${y0} ${x + 6},138`, `${x},${y1} ${x + 6},138`, `${x},${y0} ${x + 6},138`])}</polyline>`;
  DEFS['calf-raise'] = { dur: 2.6, frames: [A, B], back: [floor], front: [toe(106, 138, 130, FAR, 0.9), toe(94, 138, 130, NEAR, 1)], desc: 'Sali sulle punte dei piedi sollevando i talloni e scendi piano.' };
}
{
  const far = (p, dx = 6) => ({ knee2: [p.knee[0] + dx, p.knee[1] + 2], foot2: [p.foot[0] + dx, p.foot[1]] });
  DEFS['glute-bridge'] = { dur: 3, frames: [P(BR_B, far(BR_B)), P(BR_T, far(BR_T))], back: [mat], desc: 'Sdraiata con i piedi a terra, spingi sui talloni e solleva il bacino fino a fare una linea; poi scendi.' };
  const bot = P(BR_B, { knee2: [113, 105], foot2: [128, 79] });
  const top = P(BR_T, { knee2: [115, 82], foot2: [130, 56] });
  DEFS['single-leg-bridge'] = { dur: 3.2, frames: [bot, top], back: [mat], desc: 'Un piede resta a terra e l’altra gamba è distesa in alto: il bacino sale e scende.' };
  const b = P(BR_B, { knee: [126, 113], foot: [152, 96] });
  const t = P(BR_T, { knee: [122, 82], foot: [144, 96] });
  DEFS['ball-bridge'] = { dur: 3.4, frames: [b, t], back: [mat, (an) => `<g><circle cx="160" cy="116" r="20" fill="${SOFT}" stroke="${GEAR}" stroke-width="3"/>${an('transform', ['0,0', '-8,0', '0,0'], 'translate')}</g>`], desc: 'Con i talloni sulla palla sollevi il bacino: la palla si avvicina un po’ a te.' };
}
{
  const lowLeg = { knee: [146, 134], foot: [180, 134] };
  const A = P(SIDE, { ...lowLeg, knee2: [146, 126], foot2: [180, 126] });
  const B = P(SIDE, { ...lowLeg, knee2: [146, 112], foot2: [180, 94] });
  DEFS['side-leg-raise'] = { dur: 3, frames: [A, B], back: [mat], desc: 'Sdraiata su un fianco, sollevi la gamba di sopra tenendo il bacino fermo, poi la riabbassi.' };
  DEFS['ankle-leg-raise'] = { dur: 3.2, frames: [A, B], back: [mat], gear: [{ at: 'foot2', off: [-2, 0], draw: (x, y) => `<rect x="${x - 7}" y="${y - 5}" width="14" height="10" rx="3" fill="${GEAR}"/>` }], front: [], desc: 'Come il sollevamento laterale, ma con una cavigliera che rende la gamba più pesante.' };
}
{
  const base = { ...QUAD, elbow: [64, 110], hand: [64, 134], elbow2: [70, 110], hand2: [70, 134], knee2: [118, 118], foot2: [146, 136] };
  DEFS['donkey-kick'] = { dur: 3, frames: [P(base, { knee: [124, 118], foot: [152, 136] }), P(base, { head: [46, 74], knee: [152, 92], foot: [154, 64] })], back: [mat], desc: 'In quadrupedia spingi il tallone verso il soffitto con il ginocchio piegato, poi riporti la gamba giù.' };
}

// --- spinta
{
  const foot = [70, 138], wall = 168;
  const mk = (neck, elbow, headOff) => {
    const v = [neck[0] - foot[0], neck[1] - foot[1]];
    return { head: [neck[0] + headOff[0], neck[1] + headOff[1]], neck, hip: lerp(foot, neck, 0.5), knee: lerp(foot, neck, 0.27), foot, elbow, hand: [160, 68] };
  };
  const A = mk([132, 64], [146, 66], [5, -17]);
  const B = mk([140.5, 72.2], [150, 84], [8, -16]);
  DEFS['wall-push-up'] = { dur: 3, frames: [A, B], back: [floor, wallAt(wall)], desc: 'In piedi di fronte al muro, con le mani sul muro, fletti i gomiti avvicinando il petto e spingi indietro.' };
}
{
  const foot = [38, 138];
  const mk = (neck, elbow, headOff) => ({ head: [neck[0] + headOff[0], neck[1] + headOff[1]], neck, hip: lerp(foot, neck, 0.5), knee: lerp(foot, neck, 0.27), foot, elbow, hand: [142, 92] });
  DEFS['incline-push-up'] = { dur: 3, frames: [mk([132, 72], [137, 82], [14, -10]), mk([138, 82], [126, 92], [15, -8])], back: [floor, stepBlock(130, 96, 56)], desc: 'Con le mani su un appoggio rialzato il corpo resta in linea: fletti i gomiti e spingi.' };
}
{
  const common = { knee: [138, 131], foot: [166, 120], hand: [56, 134] };
  const A = P(common, { head: [39, 93], neck: [56, 100], hip: [100, 114], elbow: [56, 118] });
  const B = P(common, { head: [41, 118], neck: [58, 124], hip: [100, 126], elbow: [80, 124] });
  DEFS['push-up-knees'] = { dur: 3, frames: [A, B], back: [mat], desc: 'Sulle ginocchia con le mani a terra: scendi con il petto tenendo la schiena dritta e risali.' };
}
{
  const common = { foot: [176, 134], hand: [52, 134] };
  const A = P(common, { head: [35, 91], neck: [52, 98], hip: [120, 118], knee: [149, 126], elbow: [52, 116] });
  const B = P(common, { head: [37, 119], neck: [54, 122], hip: [122, 129], knee: [150, 131], elbow: [78, 126] });
  DEFS['push-up'] = { dur: 3, frames: [A, B], back: [mat], desc: 'Corpo in linea dalla testa ai piedi: scendi piegando i gomiti e spingi verso l’alto.' };
}
{
  const A = P(FV, { elbow: [74, 56], hand: [76, 36], elbow2: [126, 56], hand2: [124, 36] });
  const B = P(FV, { elbow: [78, 34], hand: [80, 12], elbow2: [122, 34], hand2: [120, 12] });
  DEFS['dumbbell-press'] = { dur: 3, frames: [A, B], back: [floor], gear: [{ at: 'hand', off: [0, -4], front: true, draw: dumbbell }, { at: 'hand2', off: [0, -4], front: true, draw: dumbbell }], desc: 'Parti con i manubri all’altezza delle spalle e li spingi sopra la testa, poi li riporti giù.' };
}
{
  const A = P(FV, { elbow: [80, 70], hand: [91, 62], elbow2: [120, 70], hand2: [109, 62] });
  const B = P(FV, { head: [100, 38], neck: [100, 50], elbow: [86, 38], hand: [91, 15], elbow2: [114, 36], hand2: [109, 15] });
  DEFS['medball-press'] = { dur: 3, frames: [A, B], back: [floor], gear: [{ at: 'hand', off: [9, 0], front: true, draw: (x, y) => `<circle cx="${x}" cy="${y}" r="11" fill="${SOFT}" stroke="${GEAR}" stroke-width="3"/>` }], desc: 'La palla parte dal petto e viene spinta sopra la testa a braccia distese, poi torna al petto.' };
}

// --- tirata e schiena
{
  const A = { head: [36, 130], neck: [52, 131], mid: [82, 131], hip: [112, 131], knee: [144, 131], foot: [176, 131], elbow: [32, 131], hand: [12, 131] };
  const B = { head: [34, 114], neck: [52, 120], mid: [82, 124], hip: [112, 130], knee: [146, 122], foot: [180, 112], elbow: [32, 116], hand: [12, 110] };
  DEFS.superman = { dur: 3, frames: [A, B], back: [mat], desc: 'A pancia in giù sollevi di poco braccia, testa e gambe insieme, poi rilasci.' };
}
{
  const base = { ...QUAD, elbow2: [70, 110], hand2: [70, 134], knee: [122, 118], foot: [146, 136], head: [48, 78] };
  const A = P(base, { elbow: [64, 110], hand: [64, 134], knee2: [128, 118], foot2: [154, 136] });
  const B = P(base, { elbow: [40, 82], hand: [16, 80], knee2: [154, 86], foot2: [184, 84], head: [46, 76] });
  DEFS['bird-dog'] = { dur: 3.4, frames: [A, B], back: [mat], desc: 'In quadrupedia allunghi un braccio e la gamba opposta, in linea con la schiena, poi li riporti a terra.' };
}
{
  const A = P(FV, { elbow: [84, 62], hand: [95, 58], elbow2: [116, 62], hand2: [105, 58] });
  const B = P(FV, { elbow: [70, 54], hand: [50, 56], elbow2: [130, 54], hand2: [150, 56] });
  const band = (pts) => pts;
  DEFS['band-pull-apart'] = { dur: 3, frames: [A, B], back: [floor], front: [(an) => `<polyline points="95,58 100,64 105,58" fill="none" stroke="${GEAR}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${an('points', ['95,58 100,64 105,58', '50,56 100,56 150,56', '95,58 100,64 105,58'])}</polyline>`], desc: 'L’elastico è teso davanti al petto: apri le braccia lateralmente e poi le richiudi piano.' };
}
{
  const base = { head: [106, 26], neck: [104, 44], hip: [98, 88], knee: [101, 113], foot: [102, 138], knee2: [106, 113], foot2: [108, 138] };
  const A = P(base, { elbow: [126, 52], hand: [148, 60], elbow2: [128, 55], hand2: [150, 63] });
  const B = P(base, { elbow: [92, 64], hand: [112, 56], elbow2: [96, 67], hand2: [116, 59] });
  DEFS['band-row'] = { dur: 3, frames: [A, B], back: [floor, wallAt(182), (an) => `<polyline points="148,60 178,62" fill="none" stroke="${GEAR}" stroke-width="4" stroke-linecap="round">${an('points', ['148,60 178,62', '112,56 178,62', '148,60 178,62'])}</polyline>`], desc: 'L’elastico è fissato davanti a te: tiri i gomiti indietro avvicinando le scapole e poi torni.' };
}
{
  const base = { head: [135, 56], neck: [120, 64], hip: [80, 84], knee: [86, 112], foot: [88, 138], knee2: [92, 112], foot2: [96, 138], elbow2: [134, 84], hand2: [148, 100] };
  const A = P(base, { elbow: [120, 88], hand: [120, 112] });
  const B = P(base, { elbow: [100, 76], hand: [112, 96] });
  DEFS['dumbbell-row'] = { dur: 3, frames: [A, B], back: [floor, chair(132, 106, 44, false)], gear: [{ at: 'hand', off: [0, 6], front: true, draw: (x, y) => dumbbell(x, y, true) }], desc: 'Busto inclinato, una mano sulla sedia: tiri il manubrio verso il fianco e lo riabbassi.' };
}
{
  const upLeft = { elbow: [80, 72], hand: [82, 52] }, downLeft = { elbow: [80, 72], hand: [80, 96] };
  const upRight = { elbow2: [120, 72], hand2: [118, 52] }, downRight = { elbow2: [120, 72], hand2: [120, 96] };
  const A = P(FV, { ...upLeft, ...downRight }), B = P(FV, { ...downLeft, ...upRight });
  DEFS['dumbbell-curl'] = { dur: 3, frames: [A, B], back: [floor], gear: [{ at: 'hand', front: true, draw: (x, y) => dumbbell(x, y + 4, true) }, { at: 'hand2', front: true, draw: (x, y) => dumbbell(x, y + 4, true) }], desc: 'I manubri salgono verso le spalle uno alla volta, con i gomiti vicini al corpo.' };
}

// --- addominali e core
{
  const base = { head: [30, 128], neck: [46, 130], hip: [102, 132], knee: [102, 96], foot: [136, 96], elbow: [46, 108], hand: [46, 86], elbow2: [52, 108], hand2: [52, 86] };
  const A = P(base, { knee2: [106, 96], foot2: [140, 96] });
  const B = P(base, { knee2: [132, 116], foot2: [166, 128], elbow: [28, 122], hand: [10, 130] });
  DEFS['dead-bug'] = { dur: 3.4, frames: [A, B], back: [mat], desc: 'Braccia al soffitto e gambe a tavolino: allunghi un braccio sopra la testa e la gamba opposta, poi torni.' };
}
{
  const base = { head: [30, 130], neck: [46, 131], elbow: [66, 134], hand: [88, 135] };
  const A = P(base, { hip: [102, 132], knee: [102, 96], foot: [132, 104] });
  const B = P(base, { hip: [100, 124], knee: [76, 106], foot: [94, 86] });
  DEFS['reverse-crunch'] = { dur: 3, frames: [A, B], back: [mat], desc: 'Con le gambe piegate porti le ginocchia verso il petto sollevando di poco il bacino.' };
}
{
  const A = { head: [30, 130], neck: [48, 131], hip: [102, 132], knee: [104, 98], foot: [134, 106], elbow: [38, 116], hand: [34, 128] };
  const B = { head: [42, 104], neck: [58, 117], hip: [102, 132], knee: [98, 92], foot: [126, 98], elbow: [48, 100], hand: [40, 112] };
  DEFS['leg-raise-crunch'] = { dur: 3, frames: [A, B], back: [mat], desc: 'Gambe piegate e sollevate: spalle e testa si staccano da terra mentre le ginocchia si avvicinano.' };
}
{
  const base = { head: [30, 130], neck: [46, 131], hip: [102, 132], elbow: [66, 134], hand: [88, 135] };
  const tab = { knee: [102, 96], foot: [134, 96] }, tap = { knee: [120, 106], foot: [146, 128] };
  const A = P(base, { ...tap, knee2: [106, 96], foot2: [138, 96] });
  const B = P(base, { knee: [106, 96], foot: [138, 96], knee2: [124, 106], foot2: [150, 128] });
  DEFS['toe-taps'] = { dur: 3, frames: [A, B], back: [mat], desc: 'Ginocchia a 90°: abbassi un piede alla volta fino a sfiorare il pavimento, in alternanza.' };
}
{
  const base = { hip: [102, 132], knee: [126, 98], foot: [150, 132] };
  const A = P(base, { head: [30, 130], neck: [46, 131], elbow: [38, 118], hand: [34, 128] });
  const B = P(base, { head: [40, 100], neck: [54, 114], elbow: [46, 98], hand: [38, 108] });
  DEFS.crunch = { dur: 2.8, frames: [A, B], back: [mat], desc: 'Sdraiata con le ginocchia piegate, sollevi solo spalle e testa verso le ginocchia e riscendi.' };
}
{
  const A = { head: [34, 102], neck: [52, 106], hip: [104, 120], knee: [138, 132], foot: [166, 122], elbow: [56, 132], hand: [34, 134] };
  DEFS['plank-knees'] = { dur: 3.6, frames: [A], hold: { pulse: [96, 118, 9, 15] }, back: [mat], desc: 'Appoggiata su avambracci e ginocchia, corpo in linea: resti ferma e respiri.' };
  const B = { head: [33, 96], neck: [52, 102], hip: [118, 119], knee: [146, 126], foot: [174, 134], elbow: [56, 132], hand: [34, 134] };
  DEFS.plank = { dur: 3.6, frames: [B], hold: { pulse: [100, 112, 9, 15] }, back: [mat], desc: 'Appoggiata su avambracci e punte dei piedi, corpo allineato: resti ferma e respiri.' };
}

// --- cardio
{
  const hip = [100, 92], neck = [100, 46];
  const fr = [0, 90, 180, 270, 360].map((deg) => {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const foot = [100 + 22 * c, 136 - 8 * Math.max(0, -s)];
    const foot2 = [100 - 22 * c, 136 - 8 * Math.max(0, s)];
    const hand = [100 - 14 * c, 76], hand2 = [100 + 14 * c, 76];
    return { head: [100, 28], neck, hip, knee: leg(hip, foot, 26), foot, knee2: leg(hip, foot2, 26), foot2, elbow: arm(neck, hand, 22), hand, elbow2: arm(neck, hand2, 22), hand2 };
  });
  const belt = (an) => `<line x1="48" y1="141" x2="160" y2="141" stroke="${NEAR}" stroke-width="2" stroke-dasharray="6 6" opacity=".7">${an('stroke-dashoffset', [0, 12], null, 0.6)}</line>`;
  DEFS['treadmill-walk'] = { dur: 2.4, calc: 'linear', frames: fr, back: [`<rect x="36" y="136" width="130" height="10" rx="5" fill="${SOFT}" stroke="${GEAR}" stroke-width="3"/>`, `<polyline points="156,138 166,74 140,74" fill="none" stroke="${GEAR}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`], front: [belt], desc: 'Cammini sul posto sul nastro che scorre all’indietro, con le braccia che oscillano.' };
}
{
  const C = [110, 126], hip = [82, 92], neck = [98, 52], hand = [137, 72];
  const fr = [0, 90, 180, 270, 360].map((deg) => {
    const a = (deg * Math.PI) / 180;
    const foot = [C[0] + 10 * Math.cos(a), C[1] + 10 * Math.sin(a)];
    const foot2 = [C[0] - 10 * Math.cos(a), C[1] - 10 * Math.sin(a)];
    return { head: [107, 35], neck, hip, knee: leg(hip, foot, 32), foot, knee2: leg(hip, foot2, 32), foot2, elbow: arm(neck, hand, 24), hand };
  });
  const spoke = `<line x1="${C[0] - 7}" y1="${C[1]}" x2="${C[0] + 7}" y2="${C[1]}" stroke="${GEAR}" stroke-width="3" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" values="0 ${C[0]} ${C[1]};360 ${C[0]} ${C[1]}" dur="2.4s" repeatCount="indefinite"/></line>`;
  const bike = [floor, `<line x1="62" y1="141" x2="152" y2="141" stroke="${GEAR}" stroke-width="6" stroke-linecap="round"/>`, `<polyline points="88,100 90,141" fill="none" stroke="${GEAR}" stroke-width="5" stroke-linecap="round"/>`, `<polyline points="90,128 ${C}" fill="none" stroke="${GEAR}" stroke-width="5" stroke-linecap="round"/>`, `<line x1="72" y1="100" x2="100" y2="100" stroke="${GEAR}" stroke-width="6" stroke-linecap="round"/>`, `<polyline points="150,141 142,100 138,70" fill="none" stroke="${GEAR}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`, `<line x1="130" y1="70" x2="146" y2="70" stroke="${GEAR}" stroke-width="5" stroke-linecap="round"/>`, `<circle cx="140" cy="118" r="17" fill="${SOFT}" fill-opacity=".6" stroke="${GEAR}" stroke-width="3"/>`, `<line x1="${C[0]}" y1="${C[1]}" x2="140" y2="118" stroke="${GEAR}" stroke-width="2" stroke-dasharray="3 4"/>`, spoke];
  DEFS['easy-pedal'] = { dur: 2.4, calc: 'linear', frames: fr, back: bike, desc: 'Seduta sulla cyclette, pedali con le gambe che si alternano a ritmo regolare.' };
}
{
  const hip = [100, 84], neck = [102, 44];
  const fr = [0, 90, 180, 270, 360].map((deg) => {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const foot = [100 + 16 * c, 129 + 4 * s], foot2 = [100 - 16 * c, 129 - 4 * s];
    const hand = [132 - 9 * c, 66], hand2 = [132 + 9 * c, 66];
    return { head: [104, 26], neck, hip, knee: leg(hip, foot, 28), foot, knee2: leg(hip, foot2, 28), foot2, elbow: arm(neck, hand, 22), hand, elbow2: arm(neck, hand2, 22), hand2 };
  });
  const handle = (k) => (an) => {
    const vals = fr.map((f) => `152,108 ${fmt([f[k]])}`);
    return `<polyline points="${vals[0]}" fill="none" stroke="${GEAR}" stroke-width="4" stroke-linecap="round">${an('points', vals)}</polyline>`;
  };
  DEFS['elliptical-easy'] = { dur: 2.6, calc: 'linear', frames: fr, back: [`<rect x="54" y="138" width="106" height="8" rx="4" fill="${SOFT}" stroke="${GEAR}" stroke-width="3"/>`, `<line x1="152" y1="108" x2="156" y2="34" stroke="${GEAR}" stroke-width="5" stroke-linecap="round"/>`, handle('hand2')], gear: [{ at: 'foot', off: [0, 5], draw: pedal }, { at: 'foot2', off: [0, 5], draw: pedal }], desc: 'Sull’ellittica i piedi percorrono un’ellisse piatta mentre le impugnature si muovono in senso opposto.' };
}
{
  const hip = [102, 76], neck = [102, 34];
  const mk = (y1, y2) => {
    const foot = [94, y1], foot2 = [112, y2];
    const hand = [118, 74], hand2 = [122, 76];
    return { head: [104, 16], neck, hip, knee: leg(hip, foot, 28), foot, knee2: leg(hip, foot2, 28), foot2, elbow: arm(neck, hand, 22), hand, elbow2: arm(neck, hand2, 22), hand2 };
  };
  DEFS['stepper-easy'] = { dur: 2.4, frames: [mk(128, 116), mk(116, 128)], back: [`<rect x="62" y="136" width="90" height="10" rx="5" fill="${SOFT}" stroke="${GEAR}" stroke-width="3"/>`], gear: [{ at: 'foot', off: [0, 5], draw: pedal }, { at: 'foot2', off: [0, 5], draw: pedal }], desc: 'Sul mini stepper i piedi si alternano su e giù con passi piccoli e regolari.' };
}
{
  const C = P(FVA, {});
  const up = FV_ARMS_UP;
  const Rr = P(C, { ...up, knee2: [118, 116], foot2: [130, 138] });
  const L = P(C, { ...up, knee: [82, 116], foot: [70, 138] });
  DEFS['step-jack'] = { dur: 3.4, frames: [C, Rr, C, L, C], back: [floor], desc: 'Un piede alla volta va di lato mentre le braccia si aprono sopra la testa, senza saltare; poi torni.' };
  const O = { head: [100, 25], neck: [100, 43], sh: [88, 45], sh2: [112, 45], hip: [100, 89], knee: [84, 111], foot: [68, 133], knee2: [116, 111], foot2: [132, 133], elbow: [76, 28], hand: [86, 10], elbow2: [124, 28], hand2: [114, 10] };
  DEFS['jumping-jack'] = { dur: 2, frames: [C, O], back: [floor], desc: 'Con un saltello apri le gambe e porti le braccia sopra la testa, poi chiudi di nuovo.' };
}
{
  const hands = { elbow: [80, 70], hand: [70, 88], elbow2: [120, 70], hand2: [130, 88] };
  const A = P(FV, hands), B = shift(A, 0, -8);
  DEFS['jump-rope'] = { dur: 2, frames: [A, B], back: [floor, (an) => `<path d="M70 88 C 40 -20, 160 -20, 130 88" fill="none" stroke="${GEAR}" stroke-width="3" stroke-linecap="round">${an('d', ['M70 88 C 40 -20, 160 -20, 130 88', 'M70 80 C 40 160, 160 160, 130 80', 'M70 88 C 40 -20, 160 -20, 130 88'])}</path>`], desc: 'Saltelli bassi: la corda passa sopra la testa e sotto i piedi a ogni salto.' };
}

// --- defaticamento e stretching
{
  const A = { head: [124, 126], neck: [106, 114], mid: [80, 102], hip: [54, 106], knee: [96, 132], foot: [40, 134], elbow: [136, 126], hand: [168, 134] };
  DEFS['child-pose'] = { dur: 4, frames: [A], hold: { pulse: [80, 100, 9, 14], breath: { head: [0, -1], neck: [0, -1], mid: [0, -2] } }, back: [mat], desc: 'Seduta sui talloni con il busto in avanti e le braccia distese: resti ferma respirando piano.' };
}
{
  const A = { head: [118, 34], neck: [108, 46], hip: [88, 84], knee: [110, 98], foot: [130, 112], knee2: [87, 111], foot2: [86, 138], elbow: [116, 72], hand: [122, 100] };
  DEFS['hamstring-stretch'] = { dur: 3.6, frames: [A], hold: { pulse: [101, 92, 9, 15] }, back: [floor, stepBlock(122, 116, 52)], desc: 'Un tallone sullo step, gamba distesa e busto lungo in avanti: senti un tirare dietro la coscia.' };
}
{
  const A = { head: [100, 24], neck: [100, 42], hip: [100, 86], knee: [101, 112], foot: [102, 138], knee2: [102, 110], foot2: [84, 90], elbow: [86, 66], hand: [84, 88], elbow2: [122, 54], hand2: [142, 62] };
  DEFS['quad-stretch'] = { dur: 3.6, frames: [A], hold: { pulse: [106, 98, 9, 15] }, back: [floor, wallAt(150)], desc: 'In equilibrio su una gamba, tieni il piede dietro verso il gluteo con la mano; l’altra mano è sul muro.' };
}
{
  const A = { head: [102, 24], neck: [101, 42], hip: [100, 86], knee: [101, 112], foot: [102, 138], knee2: [106, 112], foot2: [108, 138], elbow: [88, 64], hand: [74, 84], elbow2: [92, 66], hand2: [78, 86] };
  DEFS['chest-stretch'] = { dur: 3.6, frames: [A], hold: { pulse: [108, 58, 9, 15], breath: { head: [0, -1.5], neck: [0, -1], hand: [-2, -2], hand2: [-2, -2] } }, back: [floor], desc: 'Mani intrecciate dietro la schiena, petto aperto e spalle indietro: respiri piano.' };
}
{
  const A = P(FVA, {});
  DEFS['deep-breathing'] = { dur: 4, frames: [A], hold: { pulse: [100, 76, 12, 20], breath: { head: [0, -1], neck: [0, -1], sh: [0, -1], sh2: [0, -1] } }, back: [floor], desc: 'In piedi e rilassata: inspiri dal naso gonfiando la pancia ed espiri lentamente dalla bocca.' };
}

// ------------------------------------------------------------------ rendering
function render(ex, def) {
  const T = { dur: def.dur ?? 2.6, calc: def.calc ?? 'spline' };
  let frames = def.frames;
  if (def.hold) frames = [frames[0], breathe(frames[0], def.hold.breath)];
  if (frames.length === 2) frames = [frames[0], frames[1], frames[0]];
  const n = frames.length;
  const keyset = Object.keys(frames[0]).sort().join();
  for (const f of frames) if (Object.keys(f).sort().join() !== keyset) throw new Error(`${ex.id}: i giunti delle pose non coincidono`);

  // <animate> con timing comune; type = 'translate' per animateTransform
  const an = (attr, vals, type, durOverride) => {
    const v = vals.map((x) => (typeof x === 'number' ? R(x) : x));
    const dur = durOverride ?? T.dur;
    const lin = durOverride != null || T.calc === 'linear' || v.length < 2;
    const kt = v.map((_, i) => R(i / (v.length - 1))).join(';');
    const spl = Array(v.length - 1).fill('0.42 0 0.58 1').join(';');
    const timing = `dur="${dur}s" repeatCount="indefinite"${lin ? ' calcMode="linear"' : ` calcMode="spline" keyTimes="${kt}" keySplines="${spl}"`}`;
    return type ? `<animateTransform attributeName="${attr}" type="${type}" values="${v.join(';')}" ${timing}/>` : `<animate attributeName="${attr}" values="${v.join(';')}" ${timing}/>`;
  };
  const ev = (x) => (x ?? []).flatMap((it) => (typeof it === 'function' ? it(an, n) : [it]));

  const has = (k) => frames[0][k] != null;
  const poly = (names, color, w, op = 1) => {
    names = names.filter(has);
    if (names.length < 2) return '';
    const seq = frames.map((f) => fmt(names.map((k) => f[k])));
    const moving = seq.some((s) => s !== seq[0]);
    const head = `<polyline points="${seq[0]}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${op < 1 ? ` opacity="${op}"` : ''}`;
    return moving ? `${head}>${an('points', seq)}</polyline>` : `${head}/>`;
  };
  const armStart = has('sh') ? 'sh' : 'neck';
  const armStart2 = has('sh2') ? 'sh2' : 'neck';
  const parts = [];
  parts.push(...ev(def.back));
  parts.push(poly(['hip', 'knee2', 'foot2'], FAR, 9, 0.9));
  parts.push(poly([armStart2, 'elbow2', 'hand2'], FAR, 9, 0.9));
  parts.push(poly(['neck', 'mid', 'hip'], NEAR, 11));
  if (has('sh') && has('sh2')) parts.push(poly(['sh2', 'neck', 'sh'], NEAR, 9));
  parts.push(poly(['hip', 'knee', 'foot'], NEAR, 9));
  parts.push(poly([armStart, 'elbow', 'hand'], NEAR, 9));
  const hx = frames.map((f) => f.head[0]), hy = frames.map((f) => f.head[1]);
  const headAnim = (hx.some((v) => v !== hx[0]) ? an('cx', hx) : '') + (hy.some((v) => v !== hy[0]) ? an('cy', hy) : '');
  const headAttrs = `cx="${R(hx[0])}" cy="${R(hy[0])}" r="11" fill="#fde3ea" stroke="${NEAR}" stroke-width="5"`;
  parts.push(headAnim ? `<circle ${headAttrs}>${headAnim}</circle>` : `<circle ${headAttrs}/>`);
  for (const g of def.gear ?? []) {
    const p0 = frames[0][g.at];
    const dl = frames.map((f) => `${R(f[g.at][0] - p0[0])},${R(f[g.at][1] - p0[1])}`);
    const [ox, oy] = g.off ?? [0, 0];
    const body = g.draw(R(p0[0] + ox), R(p0[1] + oy));
    parts.push(dl.every((d) => d === dl[0]) ? body : `<g>${body}${an('transform', dl, 'translate')}</g>`);
  }
  parts.push(...ev(def.front));
  if (def.hold) {
    const [cx, cy, r0, r1] = def.hold.pulse;
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${r0}" fill="none" stroke="${FAR}" stroke-width="3" opacity=".25">${an('r', [r0, r1, r0])}${an('opacity', [0.25, 0.7, 0.25])}</circle>`);
  }
  const name = esc(ex.name);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160" role="img" aria-label="${name}">\n<title>${name}</title>\n<desc>${esc(def.desc)}</desc>\n${parts.filter(Boolean).join('\n')}\n</svg>\n`;
}

// ------------------------------------------------------------------ scrittura
const stamp = new Date().toISOString().slice(0, 10);
const rows = [];
const ids = new Set();
for (const ex of EXERCISES) {
  const def = DEFS[ex.id];
  if (!def) throw new Error(`manca la definizione dell'illustrazione per "${ex.id}"`);
  if (!!def.hold !== (ex.anim === 'hold')) throw new Error(`${ex.id}: anim "${ex.anim}" non coerente con la definizione`);
  const svg = render(ex, def);
  if (Buffer.byteLength(svg) > 6000) throw new Error(`${ex.id}: file troppo grande (${Buffer.byteLength(svg)} byte)`);
  writeFileSync(join(outDir, `${ex.id}.svg`), svg);
  ids.add(`${ex.id}.svg`);
  rows.push(`| \`${ex.id}.svg\` | ${ex.id} | Progetto ALE. (disegno originale, \`tools/make-exercise-art.mjs\`) | Questo repository | Proprietà del progetto | ${stamp} | nessuna | generata da coordinate, animazione SMIL |`);
}
for (const id of Object.keys(DEFS)) if (!EXERCISES.some((e) => e.id === id)) throw new Error(`definizione per un id non presente nel catalogo: ${id}`);
// via gli SVG che non sono più nel catalogo
for (const f of readdirSync(outDir)) if (f.endsWith('.svg') && !ids.has(f)) { unlinkSync(join(outDir, f)); console.log(`rimosso ${f} (non nel catalogo)`); }

// Registro delle licenze: blocco gestito automaticamente
const regPath = join(root, 'docs', 'ASSET_LICENSES.md');
let reg = readFileSync(regPath, 'utf8');
const block = `<!-- exercises:start -->\n${rows.join('\n')}\n<!-- exercises:end -->`;
if (reg.includes('<!-- exercises:start -->')) reg = reg.replace(/<!-- exercises:start -->[\s\S]*<!-- exercises:end -->/, () => block);
else reg = reg.replace('| _nessuna ancora_ | | | | | | | |', () => block);
writeFileSync(regPath, reg);
console.log(`${rows.length} illustrazioni animate generate in assets/exercises e registrate in docs/ASSET_LICENSES.md`);
