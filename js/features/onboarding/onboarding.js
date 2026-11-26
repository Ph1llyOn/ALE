// #/benvenuta — configurazione guidata di Alessia: profilo, attrezzatura e spazi, consensi AI, privacy, notifiche.
// Ogni passo si può saltare e riprendere in seguito dal Profilo. Niente è obbligatorio.
import { h, field, textField, withBusy, toast, errorBox, spinner } from '../../core/ui.js';
import { getState, setState } from '../../core/store.js';
import { updateDisplayName } from '../../core/api.js';
import { addEquipment, listEquipment, removeEquipment } from '../../core/api-personal.js';
import { equipmentPicker, norm } from '../../components/equipment-picker.js';
import {
  getSettings, saveSettings, setOnboardingStep, finishOnboarding, getAiPrefs, saveAiPrefs, getNotificationPrefs, saveNotificationPrefs,
} from '../../core/api-settings.js';
import { CATEGORIES, mySharing, setSharing } from '../../core/api-privacy.js';
import { pushSupported, pushConfigured, enablePush } from '../../core/api-push.js';
import { toggle } from '../../components/controls.js';
import { logo } from '../../core/ui.js';
import { profileErrorView } from '../../components/profile-error.js';
import { validateName } from '../../core/validate.js';
import { navigate } from '../../core/router.js';
import { ALL_EQUIPMENT_NAMES } from '../../data/exercises.js';

const CATALOG_BY_NORM = new Map(ALL_EQUIPMENT_NAMES.map((n) => [norm(n), n]));

const STEPS = [
  { key: 'profilo', title: 'Come ti chiami?', text: 'Il nome che vedrai nell’app e che vedrà Phill.' },
  { key: 'attrezzatura', title: 'Quali attrezzi hai a disposizione?', text: 'Così ti proponiamo attività adatte a te. Tocca quelli che hai: puoi cambiare tutto quando vuoi.' },
  { key: 'ai', title: 'L’assistente AI', text: 'Può scriverti un pensiero la mattina e proporti idee. Solo se lo vuoi tu.' },
  { key: 'privacy', title: 'Cosa condividi con Phill', text: 'Per impostazione predefinita non condividi nulla. Scegli solo ciò che ti fa piacere.' },
  { key: 'notifiche', title: 'Notifiche', text: 'Gentili e mai insistenti. Puoi spegnerle in ogni momento.' },
];

export default async function onboardingView() {
  const { profile, partner, partnership } = getState();
  if (!profile) return profileErrorView(getState().loadError);
  let settings;
  try { settings = await getSettings(profile.id); } catch (err) { return h('main', { class: 'shell' }, errorBox(err.message)); }

  let index = Math.max(0, STEPS.findIndex((s) => !settings.onboarding_steps[s.key]));
  if (index === -1) index = 0;
  const main = h('main', { class: 'shell onboarding' });
  const mark = async (key, state) => { await setOnboardingStep(profile.id, key, state); settings.onboarding_steps[key] = state; };

  function frame(step, body, { onNext, nextLabel = 'Continua' }) {
    const err = h('p', { class: 'form-error', role: 'alert' });
    const next = h('button', { class: 'btn btn-block', type: 'button', onclick: () => withBusy(next, async () => {
      err.textContent = '';
      try { if (await onNext() === false) return; await mark(step.key, 'done'); advance(); } catch (e) { err.textContent = e.message; }
    }) }, nextLabel);
    const skip = h('button', { class: 'btn btn-text btn-block', type: 'button', onclick: () => withBusy(skip, async () => { try { await mark(step.key, 'skipped'); advance(); } catch (e) { err.textContent = e.message; } }) }, 'Salta per ora');
    const dots = h('div', { class: 'steps', role: 'img', 'aria-label': `Passo ${index + 1} di ${STEPS.length}` }, STEPS.map((_, i) => h('span', { class: `step-dot${i <= index ? ' on' : ''}` })));
    main.replaceChildren(logo('sm'), dots, h('section', { class: 'card stack' }, h('h1', { class: 'page-title', 'data-focus': true }, step.title), h('p', { class: 'muted' }, step.text), body, err), next, skip);
  }

  function advance() { index += 1; index < STEPS.length ? show() : done(); }

  async function show() {
    const step = STEPS[index];
    main.replaceChildren(spinner());
    try {
      if (step.key === 'profilo') await stepProfile(step);
      else if (step.key === 'attrezzatura') await stepEquipment(step);
      else if (step.key === 'ai') await stepAi(step);
      else if (step.key === 'privacy') await stepPrivacy(step);
      else await stepNotifications(step);
    } catch (err) { main.replaceChildren(errorBox(err.message, { onRetry: show })); }
  }

  async function stepProfile(step) {
    const name = field({ id: 'ob-name', label: 'Nome', value: profile.display_name, maxlength: 40, autocomplete: 'nickname' });
    frame(step, h('div', { class: 'stack' }, name.wrap, h('p', { class: 'muted small' }, 'La foto potrai aggiungerla dal Profilo, quando vuoi.')), { onNext: async () => {
      const e = validateName(name.input.value); name.setError(e); if (e) return false;
      if (name.input.value.trim() !== profile.display_name) { const upd = await updateDisplayName(profile.id, name.input.value); setState({ profile: upd }); }
    } });
  }

  async function stepEquipment(step) {
    const existing = await listEquipment(profile.id);
    const selected = new Set(existing.map((e) => norm(e.name)));
    const picker = equipmentPicker({ selected, onToggle: async () => {} });
    const spaces = textField({ id: 'ob-spaces', label: 'Dove preferisci allenarti?', rows: 2, maxlength: 500, value: settings.spaces, hint: 'Ad esempio: un angolo del salotto o il balcone.' });
    const noEq = h('input', { type: 'checkbox', id: 'ob-noeq', checked: settings.prefers_no_equipment });
    const pro = textField({ id: 'ob-pro', label: 'Indicazioni del professionista che ti segue (facoltativo)', rows: 3, maxlength: 1000, value: settings.professional_notes, hint: 'Le attività proposte terranno conto di queste indicazioni, che hanno sempre la precedenza.' });
    frame(step, h('div', { class: 'stack' }, picker.el, h('label', { class: 'check-row', for: 'ob-noeq' }, noEq, h('span', null, 'Preferisco allenarmi senza attrezzi')), spaces.wrap, pro.wrap), { onNext: async () => {
      const now = new Map(existing.map((e) => [norm(e.name), e]));
      for (const k of [...now.keys()]) if (!selected.has(k)) await removeEquipment(now.get(k).id);
      for (const n of selected) if (!now.has(n)) await addEquipment(profile.id, { name: CATALOG_BY_NORM.get(n) ?? n, notes: '', avoid: false });
      await saveSettings(profile.id, { spaces: spaces.input.value, prefers_no_equipment: noEq.checked, professional_notes: pro.input.value });
      settings.spaces = spaces.input.value; settings.prefers_no_equipment = noEq.checked; settings.professional_notes = pro.input.value;
    } });
  }

  async function stepAi(step) {
    const ai = await getAiPrefs(profile.id);
    const want = { ...ai };
    const t = (key, label, text) => toggle({ label, description: text, checked: want[key], onChange: async (v) => { want[key] = v; } }).el;
    const master = toggle({ label: 'Acconsento all’uso dell’AI', description: 'Puoi revocare il consenso quando vuoi, in Impostazioni.', checked: want.ai_enabled, onChange: async (v) => { want.ai_enabled = v; } });
    frame(step, h('div', { class: 'stack' },
      h('p', { class: 'notice' }, 'L’AI non dà diagnosi, diete o trattamenti, non giudica il corpo e non crea obblighi. Se non acconsenti, ricevi messaggi gentili preparati a mano.'),
      h('div', { class: 'switch-list' }, master.el, t('use_equipment', 'Usa la mia attrezzatura', ''), t('use_wellbeing', 'Usa umore ed energia', 'Mai le note private.'),
        t('use_journal', 'Usa le mie voci di diario', 'Solo se lo vuoi.'), t('reminders_enabled', 'Suggerisci promemoria', ''))), { onNext: async () => {
      await saveAiPrefs(profile.id, { ai_enabled: want.ai_enabled, use_equipment: want.ai_enabled && want.use_equipment, use_wellbeing: want.ai_enabled && want.use_wellbeing, use_journal: want.ai_enabled && want.use_journal, reminders_enabled: want.ai_enabled && want.reminders_enabled });
    } });
  }

  async function stepPrivacy(step) {
    const partnerName = partner?.display_name ?? 'Phill';
    if (!partnership) {
      frame(step, h('p', { class: 'notice' }, `Quando ${partnerName} configurerà il suo profilo vi collegherete da soli: da quel momento potrai decidere cosa condividere, in Privacy e dati. Fino ad allora nessuno vede nulla.`), { onNext: async () => {}, nextLabel: 'Ho capito' });
      return;
    }
    const current = await mySharing(profile.id);
    const want = new Set(current);
    const list = h('div', { class: 'switch-list' }, CATEGORIES.map((c) => toggle({ label: c.title, description: c.text, checked: want.has(c.key), onChange: async (v) => { v ? want.add(c.key) : want.delete(c.key); } }).el));
    frame(step, h('div', { class: 'stack' }, list, h('p', { class: 'muted small' }, 'Le note di benessere non si condividono mai. Puoi cambiare tutto in ogni momento.')), { onNext: async () => {
      for (const c of CATEGORIES) if (want.has(c.key) !== current.has(c.key)) await setSharing(c.key, want.has(c.key));
    } });
  }

  async function stepNotifications(step) {
    const prefs = await getNotificationPrefs(profile.id);
    const want = { ...prefs };
    const t = (key, label, text) => toggle({ label, description: text, checked: want[key], onChange: async (v) => { want[key] = v; } }).el;
    const extra = [];
    if (pushSupported() && pushConfigured()) {
      const b = h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => withBusy(b, async () => { try { await enablePush(profile.id); toast('Notifiche attivate su questo dispositivo.', 'success'); } catch (e) { toast(e.message, 'error'); } }) }, 'Attiva le notifiche su questo dispositivo');
      extra.push(b);
    } else {
      extra.push(h('p', { class: 'muted small' }, 'Le notifiche sul telefono si attivano dalle Impostazioni, quando sono disponibili per questo dispositivo.'));
    }
    frame(step, h('div', { class: 'stack' }, h('div', { class: 'switch-list' }, t('messages', 'Biglietti di Phill', ''), t('daily_motivation', 'Motivazione del mattino', ''), t('proposals', 'Proposte di Phill', ''), t('reminders', 'Promemoria', '')), ...extra),
      { onNext: async () => { await saveNotificationPrefs(profile.id, want); }, nextLabel: 'Fine' });
  }

  async function done() {
    await finishOnboarding(profile.id);
    const skipped = STEPS.filter((s) => settings.onboarding_steps[s.key] === 'skipped');
    main.replaceChildren(logo('sm'), h('section', { class: 'card stack center' },
      h('h1', { class: 'page-title', 'data-focus': true }, 'Tutto pronto'),
      h('p', { class: 'muted' }, skipped.length ? `Hai saltato: ${skipped.map((s) => s.key === 'profilo' ? 'profilo' : s.key).join(', ')}. Potrai completarlo dal Profilo, quando vuoi.` : 'Hai sistemato tutto. Un piccolo passo alla volta.'),
      h('a', { class: 'btn', href: '#/home' }, 'Vai alla Home')));
  }

  show();
  void navigate;
  return main;
}
