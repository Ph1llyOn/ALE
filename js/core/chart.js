// Serie temporali e grafici minimali (SVG) senza librerie. Funzioni pure, testabili.

/** Ultimi n giorni come "YYYY-MM-DD", dal più vecchio al più recente (oggi incluso). */
export function lastDays(n, today = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}

/** Allinea i registri (con campo `day`) agli ultimi n giorni; i giorni senza registro hanno null. */
export function alignSeries(logs, days, field) {
  const byDay = new Map(logs.map((l) => [l.day, l]));
  return days.map((day) => (byDay.has(day) ? byDay.get(day)[field] : null));
}

/** Punti {x, y} per i valori 1-5 (null = nessun dato). Il valore massimo sta in alto. */
export function toPoints(values, { width = 280, height = 64, padding = 6, min = 1, max = 5 } = {}) {
  const n = values.length;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  return values.map((v, i) => {
    if (v == null) return null;
    const x = padding + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1));
    const y = padding + innerH - ((v - min) / (max - min)) * innerH;
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  });
}

/** Tracciato SVG che interrompe la linea nei giorni senza dato. */
export function linePath(points) {
  let d = '';
  let pen = false;
  for (const p of points) {
    if (!p) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${p.x} ${p.y} `;
    pen = true;
  }
  return d.trim();
}

/** Media dei valori presenti, null se non ce ne sono. */
export function average(values) {
  const v = values.filter((x) => x != null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}

const NS = 'http://www.w3.org/2000/svg';

/** Grafico a linea con punti, accessibile (role=img + descrizione). */
export function sparkline(values, { label, width = 280, height = 64, className = 'spark' } = {}) {
  const pts = toPoints(values, { width, height });
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', className);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  const line = document.createElementNS(NS, 'path');
  line.setAttribute('d', linePath(pts));
  line.setAttribute('class', 'spark-line');
  svg.append(line);
  for (const p of pts) {
    if (!p) continue;
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', p.x);
    c.setAttribute('cy', p.y);
    c.setAttribute('r', '3');
    c.setAttribute('class', 'spark-dot');
    svg.append(c);
  }
  return svg;
}
