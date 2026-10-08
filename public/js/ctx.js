// =====================================================================
// Wspólny kontekst widoków: preferencje urządzenia, nawigacja, skróty
// =====================================================================

import { store } from './store.js';
import { afterSheets, closeAllSheets, esc } from './ui.js';
import { KINDS } from './core.js';

const PREFS_KEY = 'lz3_prefs';

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { return {}; }
}

const prefsData = loadPrefs();
let prefsTimer = null;

function savePrefs() {
  clearTimeout(prefsTimer);
  prefsTimer = setTimeout(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefsData)); } catch (e) { /* ignoruj */ }
  }, 300);
}

export const prefs = {
  get(key, fallback) { return key in prefsData ? prefsData[key] : fallback; },
  set(key, value) { prefsData[key] = value; savePrefs(); },
  list(listId) {
    const list = store.view.lists[listId];
    const kind = list ? list.kind : 'shopping';
    const all = prefsData.lists || (prefsData.lists = {});
    const p = all[listId] || (all[listId] = {});
    if (!('groupBy' in p)) p.groupBy = kind === 'shopping' ? 'category' : 'none';
    if (!('hideDone' in p)) p.hideDone = false;
    if (!p.collapsed) p.collapsed = {};
    return p;
  },
  setList(listId, patch) { Object.assign(this.list(listId), patch); savePrefs(); }
};

export function go(hash) {
  closeAllSheets();
  afterSheets(() => {
    if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
    else location.hash = hash;
  });
}

export function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '') || 'home';
  const [name, a, b] = raw.split('/').map((s) => decodeURIComponent(s || ''));
  return { name: name || 'home', id: a || null, sub: b || null };
}

export const dispatch = (op) => store.dispatch(op);

export function kindInfo(kind) { return KINDS[kind] || KINDS.shopping; }

export function people() {
  const list = store.view.meta.people || [];
  return store.me && !list.includes(store.me) ? [...list, store.me] : list;
}

export function initials(name) {
  return String(name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = ['#2f7dd1', '#d0517f', '#3f8f6b', '#c9952b', '#8a5cc7', '#2a9aa8', '#c0573e'];
export function avatarColor(name) {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function avatar(name, cls = '') {
  if (!name) return '';
  return `<span class="avatar ${cls}" style="--av:${avatarColor(name)}" title="${esc(name)}">${esc(initials(name))}</span>`;
}
