import { SAMPLES, render } from './show-samples.mjs';
for (const s of SAMPLES) {
  let seed = 7;
  if (s.id === 14 || s.id === 15) { for (let k = 1; k < 80; k++) { if (render(s, k).plan.items.some((i) => ['dead-bug', 'reverse-crunch'].includes(i.exercise_key))) { seed = k; break; } } }
  const r = render(s, seed);
  console.log(r.text + (r.plan.assumptions.length ? '\n   nota: ' + r.plan.assumptions.join(' ') : ''));
}
