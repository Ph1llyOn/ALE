import { profileErrorView } from '../../components/profile-error.js';
import { getState } from '../../core/store.js';
import homeAlessia from './home-alessia.js';
import homePhill from './home-phill.js';

/** La Home dipende dal ruolo: Alessia ha il proprio spazio, Phill una dashboard dedicata e separata. */
export default async function homeView() {
  const state = getState();
  if (!state.profile) return profileErrorView(state.loadError);
  return state.profile.role === 'alessia' ? homeAlessia(state) : homePhill(state);
}
