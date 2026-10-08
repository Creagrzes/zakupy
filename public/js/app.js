// =====================================================================
// Zakupy — punkt wejścia aplikacji
// =====================================================================

import { store } from './store.js';
import { esc, morph, toast, ICON, closeAllSheets, sheetOpen } from './ui.js';
import { prefs, go, parseRoute, people, avatar } from './ctx.js';
import { renderHome, handleHomeClick, renderArchive, handleArchiveClick } from './views/home.js';
import { renderList, handleListClick, wireListGestures, leaveList, onEnterList, hideDock } from './views/list.js';
import { renderTemplates, handleTemplatesClick } from './views/templates.js';
import { renderNotes, handleNotesClick, renderNote, handleNoteClick, leaveNote } from './views/notes.js';
import { renderMore, handleMoreClick, handleMoreSubmit, handleMoreChange, renderStats, openSearch, applyTheme } from './views/more.js';

const viewEl = document.getElementById('view');
const topEl = document.getElementById('topbar');
const tabsEl = document.getElementById('tabs');
const gateEl = document.getElementById('gate');

applyTheme();
document.documentElement.dataset.haptics = prefs.get('haptics', true) ? 'on' : 'off';
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());

// ---------------------------------------------------------------------
// Pasek górny
// ---------------------------------------------------------------------

let currentTop = {};
function setTop(t) {
  currentTop = t;
  const pend = store.pending.length;
  const conn = store.status === 'online' ? (pend ? 'sending' : 'online') : store.status;
  const connLabel = { online: 'Połączono', sending: 'Wysyłanie zmian', connecting: 'Łączenie', offline: 'Offline' }[conn];
  morph(topEl, `
    ${t.back ? `<button type="button" class="icon-btn tb-back" data-top="back" aria-label="Wstecz">${ICON.back}</button>` : ''}
    <div class="tb-title ${t.back ? '' : 'pad'}">
      ${t.eyebrow ? `<p class="eyebrow">${esc(t.eyebrow)}</p>` : ''}
      <h1>${esc(t.title || '')}</h1>
    </div>
    <div class="tb-actions">
      ${(t.actions || []).map((a) => `<button type="button" class="icon-btn" data-act="${a.act}" aria-label="${esc(a.label)}" title="${esc(a.label)}">${a.icon}</button>`).join('')}
      <button type="button" class="conn conn-${conn}" data-top="conn" aria-label="${connLabel}" title="${connLabel}"><i></i>${pend && conn !== 'online' ? `<b>${pend}</b>` : ''}</button>
    </div>`);
  document.title = t.title ? `${t.title} · Zakupy` : 'Zakupy';
}

topEl.addEventListener('click', (e) => {
  const top = e.target.closest('[data-top]');
  if (top) {
    if (top.dataset.top === 'back') goUp();
    else if (top.dataset.top === 'conn') {
      const pend = store.pending.length;
      if (store.status === 'online') toast(pend ? `Wysyłanie ${pend} zmian…` : 'Połączono — zmiany widać od razu u wszystkich');
      else { toast(`Brak połączenia${pend ? ` — ${pend} zmian zapisanych na telefonie, wyślą się same` : ''}. Próbuję połączyć…`); store.forceReconnect(); }
    }
    return;
  }
  const act = e.target.closest('[data-act]');
  if (act) routeClick(e, act);
});

// ---------------------------------------------------------------------
// Nawigacja (stos do inteligentnego „wstecz”)
// ---------------------------------------------------------------------

const navStack = [location.hash || '#home'];
const scrollPos = new Map();
let lastHash = location.hash || '#home';

function parentOf(r) {
  if (r.name === 'list') return r.sub ? `#list/${r.id}` : '#home';
  if (r.name === 'note') return '#notes';
  if (r.name === 'stats' || r.name === 'archive') return '#more';
  return '#home';
}

function goUp() {
  const parent = parentOf(parseRoute());
  if (navStack.length > 1 && navStack[navStack.length - 2] === parent) history.back();
  else go(parent);
}

window.addEventListener('hashchange', () => {
  scrollPos.set(lastHash, window.scrollY);
  const h = location.hash || '#home';
  if (navStack.length > 1 && navStack[navStack.length - 2] === h) navStack.pop(); else navStack.push(h);
  if (navStack.length > 50) navStack.splice(0, navStack.length - 50);
  if (sheetOpen()) closeAllSheets();
  render(true);
  const y = scrollPos.get(h) || 0;
  requestAnimationFrame(() => window.scrollTo(0, y));
  lastHash = h;
});

// ---------------------------------------------------------------------
// Rysowanie widoków
// ---------------------------------------------------------------------

let prevRoute = { name: null, id: null };

function render() {
  if (gateEl && !gateEl.hidden) return;
  const r = parseRoute();
  if (prevRoute.name === 'list' && (r.name !== 'list' || r.id !== prevRoute.id)) leaveList();
  if (prevRoute.name === 'note' && (r.name !== 'note' || r.id !== prevRoute.id)) leaveNote();
  if (r.name === 'list' && (prevRoute.name !== 'list' || prevRoute.id !== r.id)) onEnterList(r.id);
  const changed = prevRoute.name !== r.name || prevRoute.id !== r.id;
  prevRoute = r;
  if (changed) viewEl.innerHTML = '';
  viewEl.dataset.route = r.name;
  document.body.dataset.route = r.name;

  const tab = { home: 'home', list: 'home', archive: 'home', templates: 'templates', notes: 'notes', note: 'notes', more: 'more', stats: 'more' }[r.name] || 'home';
  tabsEl.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  tabsEl.hidden = r.name === 'list' || r.name === 'note';
  if (r.name !== 'list') hideDock();

  switch (r.name) {
    case 'list': renderList(viewEl, r, setTop); break;
    case 'templates': renderTemplates(viewEl, setTop); break;
    case 'notes': renderNotes(viewEl, setTop); break;
    case 'note': renderNote(viewEl, r.id, setTop); break;
    case 'more': renderMore(viewEl, setTop); break;
    case 'stats': renderStats(viewEl, setTop); break;
    case 'archive': renderArchive(viewEl, setTop); break;
    default: renderHome(viewEl, setTop);
  }
}

function routeClick(e, el) {
  const r = parseRoute();
  const act = el.dataset.act;
  if (act === 'search') { openSearch(); return; }
  switch (r.name) {
    case 'list': handleListClick(e, el); break;
    case 'templates': handleTemplatesClick(e, el); break;
    case 'notes': handleNotesClick(e, el); break;
    case 'note': handleNoteClick(e, el, r.id); break;
    case 'more': case 'stats': handleMoreClick(e, el); break;
    case 'archive': handleArchiveClick(e, el); break;
    default: handleHomeClick(e, el);
  }
}

viewEl.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !viewEl.contains(el)) return;
  if (el.tagName === 'INPUT' && el.type === 'checkbox') return; // obsłużone w "change"
  routeClick(e, el);
});
viewEl.addEventListener('change', (e) => {
  const el = e.target;
  if (el.matches('input[type="checkbox"][data-act]')) { routeClick(e, el); document.documentElement.dataset.haptics = prefs.get('haptics', true) ? 'on' : 'off'; }
  if (el.matches('[data-act="import"]')) handleMoreChange(e);
});
viewEl.addEventListener('submit', (e) => { if (handleMoreSubmit(e)) return; });
viewEl.addEventListener('keydown', (e) => {
  // karty list (article) obsługują Enter jak kliknięcie
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('article[data-act]')) { e.preventDefault(); routeClick(e, e.target); }
});

tabsEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  const target = '#' + b.dataset.tab;
  if (location.hash === target || (!location.hash && target === '#home')) window.scrollTo({ top: 0, behavior: 'smooth' });
  else go(target);
});

wireListGestures(viewEl);

// ---------------------------------------------------------------------
// Zdarzenia od innych osób
// ---------------------------------------------------------------------

let remoteBuffer = [];
let remoteTimer = null;
store.onEvent((evt) => {
  if (evt.type === 'error') { toast(evt.text, { kind: 'error' }); return; }
  if (evt.type === 'remote') {
    if (!prefs.get('remoteToasts', true) || document.visibilityState !== 'visible') return;
    remoteBuffer.push(evt);
    clearTimeout(remoteTimer);
    remoteTimer = setTimeout(() => {
      const buf = remoteBuffer;
      remoteBuffer = [];
      if (buf.length === 1) {
        const ev = buf[0];
        const r = parseRoute();
        const elsewhere = ev.listId && !(r.name === 'list' && r.id === ev.listId);
        toast(ev.text, elsewhere && store.view.lists[ev.listId] ? { action: 'Pokaż', onAction: () => go('#list/' + ev.listId) } : {});
      } else {
        const who = [...new Set(buf.map((b) => b.by))].join(', ');
        toast(`${who}: ${buf.length} zmian`);
      }
    }, 900);
  }
});

store.subscribe(render);

// ---------------------------------------------------------------------
// Klawiatura ekranowa i pasek dodawania
// ---------------------------------------------------------------------

const dock = document.getElementById('dock');
if (window.visualViewport) {
  const vv = window.visualViewport;
  const onVV = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', kb + 'px');
    document.documentElement.style.setProperty('--vvh', vv.height + 'px');
    document.body.classList.toggle('kb-open', kb > 80);
  };
  vv.addEventListener('resize', onVV);
  vv.addEventListener('scroll', onVV);
  onVV();
}
if ('ResizeObserver' in window) {
  new ResizeObserver(() => document.documentElement.style.setProperty('--dock-h', dock.offsetHeight + 'px')).observe(dock);
}

// ---------------------------------------------------------------------
// Bramka: klucz dostępu i wybór imienia
// ---------------------------------------------------------------------

function showGate(html, onMount) {
  gateEl.hidden = false;
  document.body.classList.add('gated');
  gateEl.innerHTML = `<div class="gate-card">${html}</div>`;
  onMount(gateEl);
}

function hideGate() {
  gateEl.hidden = true;
  gateEl.innerHTML = '';
  document.body.classList.remove('gated');
  render();
}

function askName() {
  const list = people();
  showGate(`
    <div class="gate-logo">🛒🎒</div>
    <h1>Kim jesteś?</h1>
    <p class="muted">Dzięki temu widać, kto co dodał, kupił i spakował. Listy są wspólne i zmieniają się na żywo u wszystkich.</p>
    <div class="gate-people">${list.map((n) => `<button type="button" class="person" data-name="${esc(n)}">${avatar(n, 'lg')}<span>${esc(n)}</span></button>`).join('')}</div>
    <form class="gate-form"><input class="input" maxlength="40" placeholder="…albo wpisz swoje imię" autocomplete="given-name"><button type="submit" class="btn btn-primary">Dalej</button></form>
  `, (root) => {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-name]');
      if (b) { store.setMe(b.dataset.name); hideGate(); }
    });
    root.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = root.querySelector('input').value.trim();
      if (!v) return;
      store.setMe(v);
      if (!store.view.meta.people.includes(v)) {
        store.dispatch({ t: 'meta.update', patch: { people: [...store.view.meta.people, v] } });
      }
      hideGate();
    });
  });
}

function askKey(wrong) {
  showGate(`
    <div class="gate-logo">🔒</div>
    <h1>Klucz dostępu</h1>
    <p class="muted">${wrong ? 'Ten klucz jest nieprawidłowy. ' : ''}Te listy są chronione. Wpisz klucz, który ustawiono w Cloudflare (zmienna ACCESS_KEY).</p>
    <form class="gate-form"><input class="input" type="password" autocomplete="current-password" placeholder="Klucz"><button type="submit" class="btn btn-primary">Wejdź</button></form>
  `, (root) => {
    const input = root.querySelector('input');
    setTimeout(() => input.focus(), 50);
    root.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      store.setKey(input.value.trim());
      const res = await store.checkAccess();
      if (res === 'denied') { askKey(true); return; }
      boot();
    });
  });
}

let started = false;
async function boot() {
  const access = await store.checkAccess();
  if (access === 'denied') { askKey(false); return; }
  if (!store.me) askName(); else hideGate();
  if (!started) { started = true; store.start(); } else store.forceReconnect();
}

// Najpierw pokaż dane z pamięci telefonu (działa też offline), potem łącz.
if (store.me) { gateEl.hidden = true; render(); }
boot();

store.onEvent((evt) => {
  // gdy przyjdą dane z serwera, a ktoś wciąż wybiera imię — odśwież listę osób
  if (evt.type === 'synced' && !gateEl.hidden && !store.me && gateEl.querySelector('.gate-people')) askName();
});

// ---------------------------------------------------------------------
// Service worker (praca offline + instalacja)
// ---------------------------------------------------------------------

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Jest nowa wersja aplikacji', { action: 'Odśwież', duration: 15000, onAction: () => location.reload() });
          }
        });
      });
    }).catch(() => {});
  });
}
