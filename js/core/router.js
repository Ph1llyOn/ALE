import { parseHash, decide, isAppRoute } from './route-logic.js';
import { getState } from './store.js';
import { h, clear, loadingScreen, errorBox } from './ui.js';
import { tabbar } from '../components/tabbar.js';

const views = new Map(); // path -> async ({ query }) => HTMLElement
let mountPoint;
let renderToken = 0;

export function registerView(path, factory) { views.set(path, factory); }

export function navigate(path, { replace = false } = {}) {
  const target = `#${path}`;
  if (location.hash === target) { render(); return; }
  if (replace) location.replace(`${location.pathname}${location.search}${target}`);
  else location.hash = target;
}

export function startRouter(el) {
  mountPoint = el;
  window.addEventListener('hashchange', render);
  return render();
}

export async function render() {
  const { path, query } = parseHash(location.hash);
  const s = getState();
  const decision = decide(path, { session: Boolean(s.session), recovery: s.recovery, role: s.profile?.role });
  if (decision.redirect) { navigate(decision.redirect, { replace: true }); return; }

  const token = ++renderToken;
  clear(mountPoint).append(loadingScreen());
  let content;
  try {
    content = await views.get(decision.render)({ query });
  } catch (err) {
    console.error(err);
    content = h('main', { class: 'shell' }, errorBox('Qualcosa non ha funzionato nel caricare la pagina.', { onRetry: render }));
  }
  if (token !== renderToken) return; // una navigazione più recente ha la precedenza
  const withTabs = isAppRoute(decision.render);
  const nodes = withTabs ? [content, tabbar(decision.render, getState().profile?.role)] : [content];
  clear(mountPoint).append(...nodes);
  window.scrollTo(0, 0);
  const heading = content.querySelector?.('[data-focus]') || content.querySelector?.('h1, h2');
  if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
}
