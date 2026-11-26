// "Come ti piace allenarti": livello, tempo, giorni, preferenze e cose da evitare. Privato di Alessia; serve al motore di allenamento.
import { h, withBusy, toast } from '../../core/ui.js';
import { getSettings, saveSettings } from '../../core/api-settings.js';
import { FLAG_LABELS } from '../../data/exercise-texts.js';

const LEVELS = [['beginner', 'Sto iniziando'], ['intermediate', 'Mi alleno già un po’'], ['advanced', 'Sono già allenata']];
const MINUTES = [15, 20, 30, 40, 45, 60];
const DAYS = [[1, 'Lun'], [2, 'Mar'], [3, 'Mer'], [4, 'Gio'], [5, 'Ven'], [6, 'Sab'], [7, 'Dom']];

const select = (id, label, options, value, hint) => {
  const el = h('select', { class: 'input', id }, options.map(([v, t]) => h('option', { value: String(v), selected: String(v) === String(value) }, t)));
  el.value = String(value);
  return { el, wrap: h('div', { class: 'field' }, h('label', { class: 'label', for: id }, label), el, hint ? h('p', { class: 'field-msg' }, hint) : null) };
};
const check = (id, text, checked) => { const el = h('input', { type: 'checkbox', id, checked: Boolean(checked) }); return { el, wrap: h('label', { class: 'check-row', for: id }, el, h('span', null, text)) }; };

export async function trainingPrefsCard(userId) {
  const st = await getSettings(userId);
  const level = select('tp-level', 'A che punto sei?', LEVELS, st.fitness_level);
  const minutes = select('tp-min', 'Quanto tempo hai per allenarti?', MINUTES.map((m) => [m, `${m} minuti`]), st.session_minutes);
  const weekly = select('tp-week', 'Quante volte a settimana, al massimo?', [1, 2, 3, 4, 5, 6].map((n) => [n, n === 1 ? 'Una volta' : `${n} volte`]), st.weekly_sessions,
    'Parto piano: all’inizio ti propongo meno sessioni di questo numero, poi si sale con calma.');
  const days = DAYS.map(([n, t]) => ({ n, ...check(`tp-day-${n}`, t, st.available_days.includes(n)) }));
  const auto = check('tp-auto', 'Metti le sessioni del piano nel mio calendario', st.auto_plan);
  const flags = Object.entries(FLAG_LABELS).map(([k, t]) => ({ k, ...check(`tp-flag-${k}`, t, st.avoid_flags.includes(k)) }));
  const abs = check('tp-abs', 'Mi piacciono gli esercizi per gli addominali', st.preferences.abs !== false);
  const tread = check('tp-tread', 'Mi piace la camminata sul tapis roulant (se ce l’ho)', st.preferences.treadmill !== false);
  const speed = select('tp-speed', 'Velocità di camminata che preferisci', [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6].map((v) => [v, `${String(v).replace('.', ',')} km/h`]), st.preferences.treadmill_speed ?? 3.5);
  const incline = select('tp-inc', 'Inclinazione', [0, 1, 2, 3, 4, 5].map((v) => [v, `${v}%`]), st.preferences.treadmill_incline ?? 0);
  const err = h('p', { class: 'form-error', role: 'alert' });
  const save = h('button', { class: 'btn', type: 'submit' }, 'Salva');

  return h('form', { class: 'card stack', novalidate: true, onsubmit: (ev) => {
    ev.preventDefault(); err.textContent = '';
    const chosenDays = days.filter((d) => d.el.checked).map((d) => d.n);
    if (!chosenDays.length) { err.textContent = 'Scegli almeno un giorno in cui puoi allenarti.'; return; }
    withBusy(save, async () => {
      try {
        await saveSettings(userId, {
          fitness_level: level.el.value, session_minutes: minutes.el.value, weekly_sessions: weekly.el.value, available_days: chosenDays, auto_plan: auto.el.checked,
          avoid_flags: flags.filter((f) => f.el.checked).map((f) => f.k),
          preferences: { ...st.preferences, abs: abs.el.checked, treadmill: tread.el.checked, treadmill_speed: Number(speed.el.value), treadmill_incline: Number(incline.el.value) },
        });
        toast('Salvato. Le prossime proposte ne terranno conto.', 'success');
      } catch (e) { err.textContent = e.message; }
    });
  } },
  h('h2', { class: 'card-title' }, 'Come ti piace allenarti'),
  h('p', { class: 'muted small' }, 'Servono a proporti attività adatte a te. Puoi cambiarle quando vuoi, e restano solo tue.'),
  level.wrap, minutes.wrap, weekly.wrap,
  h('div', { class: 'field' }, h('p', { class: 'label' }, 'In quali giorni puoi allenarti?'), h('div', { class: 'chips' }, days.map((d) => d.wrap))),
  auto.wrap,
  h('div', { class: 'field' }, h('p', { class: 'label' }, 'Cose da evitare'), h('p', { class: 'muted small' }, 'Segna solo quello che ti ha indicato il professionista che ti segue: ALE. non decide al posto suo. Non proporrò esercizi che coinvolgono queste zone.'),
    flags.map((f) => f.wrap)),
  h('div', { class: 'field' }, h('p', { class: 'label' }, 'Cosa ti piace'), abs.wrap, tread.wrap, speed.wrap, incline.wrap,
    h('p', { class: 'muted small' }, 'Sono preferenze, non obblighi: ogni tanto ti propongo anche altro, per un programma equilibrato.')),
  err, save);
}
