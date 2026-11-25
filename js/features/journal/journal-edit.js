// #/diario/voce?id=… — scrittura libera o guidata di una voce; condivisione esplicita e revocabile, voce per voce.
import { h, field, textField, errorBox, withBusy, toast } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import { getEntry, saveEntry, deleteEntry } from '../../core/api-journal.js';
import { mySharing } from '../../core/api-privacy.js';
import { segmented, pageHeader, toggle } from '../../components/controls.js';
import { profileErrorView } from '../../components/profile-error.js';
import { PROMPTS } from '../../data/prompts.js';
import { navigate } from '../../core/router.js';

export default async function journalEditView({ query }) {
  const { profile, partner, partnership } = getState();
  if (!profile) return profileErrorView(getState().loadError);
  const back = { href: '#/diario', label: 'Diario' };

  let entry = null; let shared = new Set();
  try {
    if (query.id) entry = await getEntry(query.id);
    if (partnership) shared = await mySharing(profile.id);
  } catch (err) { return h('main', { class: 'shell with-tabs' }, pageHeader({ title: 'Diario', back }), errorBox(err.message)); }
  if (query.id && !entry) return h('main', { class: 'shell with-tabs' }, pageHeader({ title: 'Diario', back }), errorBox('Non trovo questa voce.'));

  let mode = entry?.mode ?? (query.modo === 'guidata' ? 'guided' : 'free');
  let promptIndex = entry?.prompt ? Math.max(0, PROMPTS.indexOf(entry.prompt)) : new Date().getDate() % PROMPTS.length;
  let prompt = entry?.prompt ?? PROMPTS[promptIndex];
  let sharedFlag = Boolean(entry?.shared_with_partner);

  const title = field({ id: 'j-title', label: 'Titolo (facoltativo)', value: entry?.title ?? '', maxlength: 120, required: false, autocomplete: 'off' });
  const body = textField({ id: 'j-body', label: 'La tua voce', rows: 12, maxlength: 20000, value: entry?.body ?? '', placeholder: 'Scrivi quello che ti va…' });
  const promptCard = h('div', { class: 'notice prompt', hidden: mode !== 'guided' });
  const paintPrompt = () => {
    promptCard.replaceChildren(h('p', { class: 'prompt-text' }, prompt),
      h('button', { class: 'btn btn-text', type: 'button', onclick: () => { promptIndex = (promptIndex + 1) % PROMPTS.length; prompt = PROMPTS[promptIndex]; paintPrompt(); } }, 'Un altro spunto'));
  };
  paintPrompt();
  const seg = segmented({ label: 'Tipo di scrittura', options: [{ value: 'free', label: 'Libera' }, { value: 'guided', label: 'Guidata' }], value: mode,
    onChange: (v) => { mode = v; promptCard.hidden = v !== 'guided'; } });

  // Condivisione: due chiavi. La voce si marca qui; la categoria si attiva in Privacy e dati.
  const categoryOn = shared.has('journal');
  const shareToggle = partnership
    ? toggle({ label: `Condividi con ${partner?.display_name ?? 'Phill'}`, description: categoryOn ? 'Solo questa voce. Puoi toglierla quando vuoi.' : 'Per condividere voci attiva prima “Diario” in Privacy e dati.',
      checked: sharedFlag && categoryOn, onChange: async (v) => { sharedFlag = v; } })
    : null;
  if (shareToggle && !categoryOn) shareToggle.input.disabled = true;

  const error = h('p', { class: 'form-error', role: 'alert' });
  const save = h('button', { class: 'btn', type: 'submit' }, 'Salva');
  const form = h('form', { class: 'stack', novalidate: true, onsubmit: (ev) => {
    ev.preventDefault();
    error.textContent = '';
    if (!body.input.value.trim()) { body.setError('Scrivi qualcosa prima di salvare.'); return; }
    body.setError(null);
    withBusy(save, async () => {
      try {
        const saved = await saveEntry(profile.id, { id: entry?.id, title: title.input.value, body: body.input.value, mode, prompt, shared: sharedFlag && categoryOn });
        toast('Voce salvata.', 'success');
        entry = saved;
        navigate('/diario');
      } catch (err) { error.textContent = err.message; }
    });
  } }, seg.el, promptCard, title.wrap, body.wrap, shareToggle?.el, error, save);

  const extra = [];
  if (entry) {
    const del = h('button', { class: 'btn btn-text btn-danger-text', type: 'button', onclick: () => {
      if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Tocca ancora per eliminare la voce'; return; }
      withBusy(del, async () => { try { await deleteEntry(entry.id); toast('Voce eliminata.'); navigate('/diario'); } catch (err) { toast(err.message, 'error'); } });
    } }, 'Elimina la voce');
    extra.push(h('div', { class: 'row-center' }, del));
  }
  return h('main', { class: 'shell with-tabs' }, pageHeader({ title: entry ? 'Modifica la voce' : 'Nuova voce', back }),
    h('section', { class: 'card stack' }, form), ...extra,
    h('p', { class: 'muted small center' }, 'Questa voce è privata. Nessuno la legge, nemmeno ALE., a meno che tu non lo consenta.'));
}
