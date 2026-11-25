// #/profilo/collegamento — Alessia e Phill sono collegati automaticamente (1:1): qui si vede lo stato e cosa significa.
import { h, avatarEl } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import { avatarUrl } from '../../core/api.js';
import { pageHeader } from '../../components/controls.js';
import { profileErrorView } from '../../components/profile-error.js';

export default async function pairingView() {
  const { profile, partner, partnership } = getState();
  if (!profile) return profileErrorView(getState().loadError);
  const isAlessia = profile.role === 'alessia';
  const header = pageHeader({ title: 'Collegamento', back: { href: '#/profilo', label: 'Profilo' } });

  if (!(partnership && partner)) {
    return h('main', { class: 'shell with-tabs' }, header, h('section', { class: 'card stack' },
      h('h2', { class: 'card-title' }, isAlessia ? 'In attesa di Phill' : 'In attesa di Alessia'),
      h('p', { class: 'muted' }, `Appena ${isAlessia ? 'Phill' : 'Alessia'} configura il proprio profilo su ALE., i vostri account si collegano da soli. Non serve fare nient’altro.`)));
  }

  const url = await avatarUrl(partner.avatar_path);
  return h('main', { class: 'shell with-tabs' }, header,
    h('section', { class: 'card stack' },
      h('div', { class: 'row' }, avatarEl(url, partner.display_name),
        h('div', { class: 'grow' }, h('p', { class: 'card-title' }, partner.display_name),
          h('p', { class: 'muted' }, isAlessia ? 'Phill è collegato al tuo profilo.' : 'Sei collegato al profilo di Alessia.'))),
      h('p', { class: 'muted' }, isAlessia
        ? 'Il collegamento non dà accesso automatico ai tuoi dati: decidi tu cosa condividere e puoi cambiare idea in qualsiasi momento, da Privacy e dati.'
        : 'Vedi soltanto ciò che Alessia sceglie di condividere con te. Tutto il resto è privato.')));
}
