// =====================================================================
// Zakupy — klient SPA
// Cała logika UI + połączenie WebSocket z Durable Object po stronie
// serwera. Stan trzymamy w jednym obiekcie `state`, serwer jest źródłem
// prawdy — każda akcja jest wysyłana do serwera, a on odsyła zaktualizowany
// stan do WSZYSTKICH podłączonych klientów (dlatego działa realtime).
// =====================================================================

const NAME_KEY = 'lz_name';
const THEME_KEY = 'lz_theme';
const QUEUE_KEY = 'lz_queue';

const state = {
  myName: localStorage.getItem(NAME_KEY) || null,
  connected: false,
  lists: [],
  itemsByList: {},
  historyByList: {},
  shops: [],
  units: [],
  categories: [],
  templates: [],
  favorites: {},
  route: { name: 'home', id: null },
  filterShop: 'all',
  groupByCategory: false,
  shoppingMode: false,
  searchQuery: ''
};

let ws = null;
let wsReconnectTimer = null;
let pendingQueue = loadQueue();

// ---------------------------------------------------------------------
// Elementy DOM (shell)
// ---------------------------------------------------------------------
const welcomeEl = document.getElementById('welcome');
const appEl = document.getElementById('app');
const viewEl = document.getElementById('view');
const viewTitle = document.getElementById('view-title');
const viewEyebrow = document.getElementById('view-eyebrow');
const backBtn = document.getElementById('back-btn');
const searchBtn = document.getElementById('search-btn');
const menuBtn = document.getElementById('menu-btn');
const bottomNav = document.getElementById('bottom-nav');
const offlineBanner = document.getElementById('offline-banner');
const toastStack = document.getElementById('toast-stack');
const modalRoot = document.getElementById('modal-root');

// ---------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------
applyTheme(localStorage.getItem(THEME_KEY) || 'light');

if (state.myName) {
  startApp();
} else {
  welcomeEl.classList.remove('hidden');
  document.querySelectorAll('.user-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.myName = btn.dataset.user;
      localStorage.setItem(NAME_KEY, state.myName);
      welcomeEl.classList.add('hidden');
      startApp();
    });
  });
}

function startApp() {
  appEl.classList.remove('hidden');
  connect();
  window.addEventListener('hashchange', parseHashAndRender);
  parseHashAndRender();

  backBtn.addEventListener('click', () => history.back());
  searchBtn.addEventListener('click', openSearchModal);
  menuBtn.addEventListener('click', openSettingsModal);
  bottomNav.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-btn');
    if (!btn) return;
    location.hash = '#' + btn.dataset.route;
  });

  window.addEventListener('online', () => connect());
}

// ---------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(proto + '//' + location.host + '/ws');

  ws.addEventListener('open', () => {
    state.connected = true;
    offlineBanner.classList.add('hidden');
    flushQueue();
  });

  ws.addEventListener('close', () => {
    state.connected = false;
    offlineBanner.classList.remove('hidden');
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = setTimeout(connect, 2500);
  });

  ws.addEventListener('error', () => { try { ws.close(); } catch (e) {} });

  ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    handleServerMessage(msg);
  });
}

function handleServerMessage(msg) {
  if (msg.type === 'init') {
    state.lists = msg.lists;
    state.itemsByList = msg.items;
    state.shops = msg.shops;
    state.units = msg.units;
    state.categories = msg.categories;
    state.templates = msg.templates;
    state.favorites = msg.favorites;
    renderRoute();
  } else if (msg.type === 'state') {
    state[msg.slice] = msg.data;
    if (msg.slice === 'items') state.itemsByList = msg.data;
    renderRoute();
  } else if (msg.type === 'listDetail') {
    state.itemsByList[msg.listId] = msg.items;
    state.historyByList[msg.listId] = msg.history;
    const idx = state.lists.findIndex((l) => l.id === msg.listId);
    if (idx >= 0) state.lists[idx] = msg.list; else state.lists.push(msg.list);
    renderRoute();
  } else if (msg.type === 'listDeleted') {
    state.lists = state.lists.filter((l) => l.id !== msg.listId);
    delete state.itemsByList[msg.listId];
    delete state.historyByList[msg.listId];
    if (state.route.name === 'list' && state.route.id === msg.listId) location.hash = '#home';
    renderRoute();
  } else if (msg.type === 'event') {
    if (msg.by !== state.myName) showToast(msg.text);
  }
}

// ---- Wysyłanie akcji + kolejka offline ----

function sendAction(action, payload) {
  const cid = Math.random().toString(36).slice(2);
  const msg = { type: 'action', action, payload, by: state.myName, cid };
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  } else {
    pendingQueue.push(msg);
    saveQueue();
    offlineBanner.classList.remove('hidden');
  }
}

function flushQueue() {
  if (!pendingQueue.length) return;
  const queue = pendingQueue;
  pendingQueue = [];
  saveQueue();
  for (const msg of queue) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }
}

function loadQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch (e) { return []; }
}
function saveQueue() {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(pendingQueue)); } catch (e) {}
}

// ---------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------

function parseHashAndRender() {
  const hash = location.hash.replace(/^#/, '') || 'home';
  const [name, id] = hash.split('/');
  const changedList = name !== 'list' || id !== state.route.id;
  state.route = { name: name || 'home', id: id || null };
  if (changedList) { state.filterShop = 'all'; state.groupByCategory = false; state.shoppingMode = false; }
  renderRoute();
}

function renderRoute() {
  const r = state.route;
  backBtn.classList.toggle('hidden', r.name === 'home' || r.name === 'templates' || r.name === 'stats' || r.name === 'archive');
  bottomNav.classList.toggle('hidden', r.name === 'list');

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.route === r.name);
  });

  if (r.name === 'home') { viewEyebrow.textContent = 'wspólna lista'; viewTitle.textContent = 'Zakupy'; renderHome(); }
  else if (r.name === 'templates') { viewEyebrow.textContent = 'gotowe zestawy'; viewTitle.textContent = 'Szablony'; renderTemplates(); }
  else if (r.name === 'stats') { viewEyebrow.textContent = 'na oko'; viewTitle.textContent = 'Statystyki'; renderStats(); }
  else if (r.name === 'archive') { viewEyebrow.textContent = 'dawne zakupy'; viewTitle.textContent = 'Archiwum'; renderArchive(); }
  else if (r.name === 'list') { renderListView(r.id); }
}

// ---------------------------------------------------------------------
// Pomocnicze
// ---------------------------------------------------------------------

function esc(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'przed chwilą';
  if (min < 60) return min + ' min temu';
  const h = Math.floor(min / 60);
  if (h < 24) return h + ' godz. temu';
  const d = Math.floor(h / 24);
  if (d === 1) return 'wczoraj';
  if (d < 7) return d + ' dni temu';
  return new Date(ts).toLocaleDateString('pl-PL');
}

function showToast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  toastStack.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

function activeLists() { return state.lists.filter((l) => !l.archived).sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt)); }
function archivedLists() { return state.lists.filter((l) => l.archived).sort((a, b) => b.updatedAt - a.updatedAt); }

const ICONS = ['🛒', '🏠', '🚗', '🎁', '🐶', '🔧', '🎉', '💼', '✈️', '🌱'];
const COLORS = ['#7f8c6a', '#b17263', '#7590a8', '#c9a24b', '#8a6bb3', '#5c8c7f', '#c2745e'];

// =====================================================================
// EKRAN GŁÓWNY
// =====================================================================

function renderHome() {
  const lists = activeLists();
  const pinned = lists.filter((l) => l.pinned);
  const rest = lists.filter((l) => !l.pinned);

  let html = '';
  if (!lists.length) {
    html += `<div class="empty-state"><p>Brak aktywnych list.</p><p class="empty-sub">Stwórz pierwszą listę zakupów przyciskiem poniżej.</p></div>`;
  } else {
    if (pinned.length) { html += `<p class="section-label">Przypięte</p>` + pinned.map(listCard).join(''); }
    html += (pinned.length ? `<p class="section-label">Wszystkie listy</p>` : '') + rest.map(listCard).join('');
  }
  html += `<button type="button" class="fab" id="new-list-fab" aria-label="Nowa lista"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>`;

  viewEl.innerHTML = html;
  viewEl.querySelectorAll('.list-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.list-card-menu-btn')) return;
      location.hash = '#list/' + card.dataset.id;
    });
    card.querySelector('.list-card-menu-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openListMenuModal(card.dataset.id);
    });
  });
  document.getElementById('new-list-fab').addEventListener('click', () => openListFormModal());
}

function listCard(l) {
  const pct = l.itemCount ? Math.round((l.doneCount / l.itemCount) * 100) : 0;
  return `
  <div class="list-card" data-id="${l.id}" style="--card-accent:${l.color}">
    <div class="icon">${l.icon}</div>
    <div class="list-card-body">
      <p class="list-card-title">${l.pinned ? '<span class="pin-mark">📌</span>' : ''}${esc(l.name)}</p>
      ${l.description ? `<p class="list-card-desc">${esc(l.description)}</p>` : ''}
      <div class="list-card-meta">
        <span>${l.itemCount} produktów</span>
        <span>${l.doneCount} kupione</span>
        <span>${timeAgo(l.updatedAt)}${l.updatedBy ? ' · ' + esc(l.updatedBy) : ''}</span>
      </div>
      ${l.itemCount ? `<div class="progress-bar"><div style="width:${pct}%"></div></div>` : ''}
    </div>
    <button type="button" class="list-card-menu-btn" aria-label="Więcej">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/></svg>
    </button>
  </div>`;
}

function openListMenuModal(id) {
  const l = state.lists.find((x) => x.id === id);
  if (!l) return;
  openModal(`
    <h2>${esc(l.name)}</h2>
    <button type="button" class="text-btn" data-act="open">Otwórz</button><br>
    <button type="button" class="text-btn" data-act="edit">Edytuj</button><br>
    <button type="button" class="text-btn" data-act="pin">${l.pinned ? 'Odepnij' : 'Przypnij'}</button><br>
    <button type="button" class="text-btn" data-act="dup">Zduplikuj</button><br>
    <button type="button" class="text-btn" data-act="merge">Połącz z inną listą</button><br>
    <button type="button" class="text-btn" data-act="archive">${l.archived ? 'Przywróć z archiwum' : 'Zarchiwizuj'}</button><br>
    <button type="button" class="text-btn danger" data-act="delete">Usuń listę</button>
  `, (root) => {
    root.querySelector('[data-act="open"]').onclick = () => { closeModal(); location.hash = '#list/' + id; };
    root.querySelector('[data-act="edit"]').onclick = () => { closeModal(); openListFormModal(l); };
    root.querySelector('[data-act="pin"]').onclick = () => { sendAction('updateList', { id, patch: { pinned: !l.pinned } }); closeModal(); };
    root.querySelector('[data-act="dup"]').onclick = () => { sendAction('duplicateList', { id }); closeModal(); };
    root.querySelector('[data-act="merge"]').onclick = () => { closeModal(); openMergeModal(id); };
    root.querySelector('[data-act="archive"]').onclick = () => { sendAction('archiveList', { id, archived: !l.archived }); closeModal(); };
    root.querySelector('[data-act="delete"]').onclick = () => {
      if (confirm(`Usunąć listę „${l.name}” na stałe?`)) { sendAction('deleteList', { id }); closeModal(); }
    };
  });
}

function openListFormModal(existing) {
  const isEdit = !!existing;
  const templates = state.templates;
  openModal(`
    <h2>${isEdit ? 'Edytuj listę' : 'Nowa lista'}</h2>
    <div class="field"><label>Nazwa</label><input class="text-input" id="f-name" maxlength="60" value="${isEdit ? esc(existing.name) : ''}" placeholder="np. Zakupy na weekend"></div>
    <div class="field"><label>Opis (opcjonalnie)</label><input class="text-input" id="f-desc" maxlength="200" value="${isEdit ? esc(existing.description) : ''}"></div>
    <div class="field"><label>Ikona</label><div class="icon-picker">${ICONS.map((i) => `<div class="icon-opt${(isEdit ? existing.icon : '🛒') === i ? ' active' : ''}" data-icon="${i}">${i}</div>`).join('')}</div></div>
    <div class="field"><label>Kolor</label><div class="color-picker">${COLORS.map((c) => `<div class="color-opt${(isEdit ? existing.color : COLORS[0]) === c ? ' active' : ''}" data-color="${c}" style="background:${c}"></div>`).join('')}</div></div>
    <div class="field"><label>Budżet w zł (opcjonalnie)</label><input class="text-input" id="f-budget" type="number" min="0" value="${isEdit && existing.budget ? existing.budget : ''}"></div>
    ${!isEdit && templates.length ? `<div class="field"><label>Zacznij od szablonu (opcjonalnie)</label><select class="text-input" id="f-template"><option value="">— brak —</option>${templates.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div>` : ''}
    <div class="modal-actions">
      <button type="button" class="btn-secondary" id="f-cancel">Anuluj</button>
      <button type="button" class="btn-primary" id="f-save">${isEdit ? 'Zapisz' : 'Utwórz'}</button>
    </div>
  `, (root) => {
    let icon = isEdit ? existing.icon : '🛒';
    let color = isEdit ? existing.color : COLORS[0];
    root.querySelectorAll('.icon-opt').forEach((el) => el.onclick = () => { root.querySelectorAll('.icon-opt').forEach((x) => x.classList.remove('active')); el.classList.add('active'); icon = el.dataset.icon; });
    root.querySelectorAll('.color-opt').forEach((el) => el.onclick = () => { root.querySelectorAll('.color-opt').forEach((x) => x.classList.remove('active')); el.classList.add('active'); color = el.dataset.color; });
    root.querySelector('#f-cancel').onclick = closeModal;
    root.querySelector('#f-save').onclick = () => {
      const name = root.querySelector('#f-name').value.trim();
      if (!name) return;
      const description = root.querySelector('#f-desc').value.trim();
      const budgetVal = root.querySelector('#f-budget').value;
      const budget = budgetVal ? Number(budgetVal) : null;
      if (isEdit) {
        sendAction('updateList', { id: existing.id, patch: { name, description, icon, color, budget } });
      } else {
        const templateId = root.querySelector('#f-template') ? root.querySelector('#f-template').value : '';
        sendAction('createList', { name, description, icon, color, budget, templateId: templateId || null });
      }
      closeModal();
    };
  });
}

function openMergeModal(targetId) {
  const others = state.lists.filter((l) => l.id !== targetId && !l.archived);
  if (!others.length) { openModal(`<h2>Połącz listy</h2><p>Brak innych aktywnych list do połączenia.</p><div class="modal-actions"><button class="btn-secondary" id="c">Zamknij</button></div>`, (root) => root.querySelector('#c').onclick = closeModal); return; }
  openModal(`
    <h2>Połącz listy z „${esc(state.lists.find((l) => l.id === targetId).name)}”</h2>
    <p class="welcome-sub">Wybrane listy zostaną scalone i usunięte, ich produkty trafią tutaj.</p>
    ${others.map((l) => `<label class="check-row"><input type="checkbox" value="${l.id}"> ${l.icon} ${esc(l.name)}</label>`).join('')}
    <div class="modal-actions">
      <button type="button" class="btn-secondary" id="m-cancel">Anuluj</button>
      <button type="button" class="btn-primary" id="m-go">Połącz</button>
    </div>
  `, (root) => {
    root.querySelector('#m-cancel').onclick = closeModal;
    root.querySelector('#m-go').onclick = () => {
      const sourceIds = [...root.querySelectorAll('input[type="checkbox"]:checked')].map((c) => c.value);
      if (sourceIds.length) sendAction('mergeLists', { targetId, sourceIds });
      closeModal();
    };
  });
}

// =====================================================================
// WIDOK LISTY
// =====================================================================

function renderListView(id) {
  const list = state.lists.find((l) => l.id === id);
  if (!list) { viewEl.innerHTML = `<div class="empty-state"><p>Ta lista już nie istnieje.</p></div>`; viewTitle.textContent = 'Zakupy'; return; }
  viewEyebrow.textContent = list.archived ? 'zarchiwizowana' : 'lista zakupów';
  viewTitle.textContent = list.icon + ' ' + list.name;

  const allItems = state.itemsByList[id] || [];
  const shopsInList = [...new Set(allItems.map((i) => i.shop).filter(Boolean))];
  let items = state.filterShop === 'all' ? allItems : allItems.filter((i) => i.shop === state.filterShop);

  const sorted = [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (a.order ?? a.createdAt) - (b.order ?? b.createdAt);
  });

  let listHtml = '';
  if (state.groupByCategory) {
    const groups = {};
    for (const it of sorted) { const cat = it.category || 'Bez kategorii'; (groups[cat] = groups[cat] || []).push(it); }
    for (const cat of Object.keys(groups)) {
      listHtml += `<p class="cat-group-title">${esc(cat)}</p>` + groups[cat].map(itemRow).join('');
    }
  } else {
    listHtml = sorted.map(itemRow).join('');
  }

  const doneCount = allItems.filter((i) => i.done).length;
  const spent = allItems.filter((i) => i.done).reduce((s, i) => s + (Number(i.price) || 0), 0);

  viewEl.innerHTML = `
    ${list.budget ? `<div class="budget-bar"><div class="row"><span>Budżet</span><span class="${spent > list.budget ? 'over' : ''}">${spent.toFixed(2)} / ${Number(list.budget).toFixed(2)} zł</span></div><div class="progress-bar"><div style="width:${Math.min(100, (spent / list.budget) * 100)}%"></div></div></div>` : ''}
    <div class="list-tools">
      <button type="button" class="tool-btn${state.groupByCategory ? ' active' : ''}" id="tool-group">📂 Kategorie</button>
      <button type="button" class="tool-btn${state.shoppingMode ? ' active' : ''}" id="tool-shopping">🏃 Tryb zakupów</button>
      <button type="button" class="tool-btn" id="tool-assign-shop">🏷️ Dodaj sklepy</button>
      <button type="button" class="tool-btn" id="tool-history">🕒 Historia</button>
      <button type="button" class="tool-btn" id="tool-template">💾 Zapisz jako szablon</button>
    </div>
    ${shopsInList.length ? `<div class="shop-tabs">
      <div class="chip${state.filterShop === 'all' ? ' active' : ''}" data-shop="all">Wszystkie</div>
      ${shopsInList.map((s) => `<div class="chip${state.filterShop === s ? ' active' : ''}" data-shop="${esc(s)}">${esc(s)}</div>`).join('')}
    </div>` : ''}
    <section class="receipt${state.shoppingMode ? ' shopping-mode' : ''}">
      <form id="add-form" class="add-form" autocomplete="off">
        <select id="add-shop" class="text-input shop-select" aria-label="Wybierz sklep">
          <option value="">Wybierz sklep...</option>
          ${state.shops.map(s => `<option value="${esc(s)}" ${state.activeAddShop === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
        </select>
        <input type="text" id="add-input" placeholder="Dodaj produkt…" autocomplete="off" maxlength="60">
        <div id="suggest-box"></div>
        <button type="submit" aria-label="Dodaj"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
      </form>
      <ul id="list" class="list">${listHtml}</ul>
      ${!sorted.length ? `<div class="empty-state"><p>Lista jest pusta.</p><p class="empty-sub">Dopisz pierwszą rzecz do kupienia.</p></div>` : ''}
      <div class="receipt-edge" aria-hidden="true"></div>
    </section>
    <div class="footer-row">
      <p class="count">${allItems.length - doneCount} do kupienia${doneCount ? ' · ' + doneCount + ' kupione' : ''}</p>
      ${doneCount ? `<button type="button" class="clear-btn" id="clear-btn">Wyczyść kupione</button>` : ''}
    </div>
  `;

  wireListView(id, allItems);
}

function itemRow(it) {
  return `
  <li class="item${it.done ? ' done' : ''}" data-id="${it.id}" draggable="true">
    <span class="drag-handle" aria-hidden="true">⋮⋮</span>
    <button type="button" class="check" data-toggle="${it.id}" aria-label="Kupione">
      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
    </button>
    <span class="item-emoji">${it.emoji || '🛒'}</span>
    <div class="item-body" data-edit="${it.id}">
      <p class="item-name">${esc(it.name)}${it.qty && it.qty !== 1 ? ` · ${it.qty}${it.unit ? ' ' + esc(it.unit) : ''}` : (it.unit && it.unit !== 'szt.' ? ' · ' + esc(it.unit) : '')}</p>
      <p class="item-meta">
        ${it.shop ? `<span class="tag">${esc(it.shop)}</span>` : ''}
        ${it.category ? `<span class="tag">${esc(it.category)}</span>` : ''}
        ${it.note ? `<span>${esc(it.note)}</span>` : ''}
        ${it.price ? `<span>${Number(it.price).toFixed(2)} zł</span>` : ''}
      </p>
    </div>
    ${it.assignedTo ? `<button type="button" class="assign-btn set" data-assign="${it.id}" title="${esc(it.assignedTo)}">${esc(it.assignedTo[0])}</button>` : `<button type="button" class="assign-btn" data-assign="${it.id}" title="Przypisz">+</button>`}
    <button type="button" class="del-btn" data-del="${it.id}" aria-label="Usuń"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
  </li>`;
}

function wireListView(listId, allItems) {
  const addForm = document.getElementById('add-form');
  const addInput = document.getElementById('add-input');
  const suggestBox = document.getElementById('suggest-box');
  const listEl = document.getElementById('list');
  const addShopSelect = document.getElementById('add-shop');

  addShopSelect.addEventListener('change', () => {
    state.activeAddShop = addShopSelect.value;
  });

  addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = addInput.value.trim();
    if (!val) return;

    // NOWE: Sprawdzanie duplikatów (ignoruje wielkość liter)
    const valLower = val.toLowerCase();
    const exists = allItems.some(i => i.name.trim().toLowerCase() === valLower);
    if (exists) {
      showToast('⚠️ Nie możesz dodać. Ten produkt już jest na liście!');
      return;
    }

    // Wysyłamy akcję dodania produktu RAZEM z wybranym sklepem
    sendAction('addItems', { listId, names: [val], shop: addShopSelect.value });
    addInput.value = '';
    suggestBox.innerHTML = '';
    addInput.focus();
  });

  addInput.addEventListener('input', () => {
    const q = addInput.value.trim().toLowerCase();
    if (!q) { suggestBox.innerHTML = ''; return; }
    const hits = Object.values(state.favorites)
      .filter((f) => f.name.toLowerCase().startsWith(q))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    suggestBox.innerHTML = hits.length ? `<div class="suggest-box">${hits.map((h) => `<div class="suggest-item" data-name="${esc(h.name)}">${esc(h.name)}</div>`).join('')}</div>` : '';
    suggestBox.querySelectorAll('.suggest-item').forEach((el) => {
      el.addEventListener('click', () => {
        // Zabezpieczenie przed duplikatem również przy dodawaniu z podpowiedzi
        const selectedVal = el.dataset.name.toLowerCase();
        const exists = allItems.some(i => i.name.trim().toLowerCase() === selectedVal);
        if (exists) {
            showToast('⚠️ Nie możesz dodać. Ten produkt już jest na liście!');
        } else {
            sendAction('addItems', { listId, names: [el.dataset.name], shop: addShopSelect.value });
        }
        addInput.value = ''; suggestBox.innerHTML = ''; addInput.focus();
      });
    });
  });

  document.getElementById('tool-group').addEventListener('click', () => { state.groupByCategory = !state.groupByCategory; renderListView(listId); });
  document.getElementById('tool-shopping').addEventListener('click', () => { state.shoppingMode = !state.shoppingMode; renderListView(listId); });
  document.getElementById('tool-assign-shop').addEventListener('click', () => openBulkShopModal(listId, allItems));
  document.getElementById('tool-history').addEventListener('click', () => openHistoryModal(listId));
  document.getElementById('tool-template').addEventListener('click', () => openSaveTemplateModal(listId));

  document.querySelectorAll('.shop-tabs .chip').forEach((chip) => {
    chip.addEventListener('click', () => { state.filterShop = chip.dataset.shop; renderListView(listId); });
  });

  const clearBtn = document.getElementById('clear-btn');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    allItems.filter((i) => i.done).forEach((i) => sendAction('deleteItem', { listId, itemId: i.id }));
  });

  listEl.querySelectorAll('[data-toggle]').forEach((btn) => btn.addEventListener('click', () => sendAction('toggleItem', { listId, itemId: btn.dataset.toggle })));
  listEl.querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', () => sendAction('deleteItem', { listId, itemId: btn.dataset.del })));
  listEl.querySelectorAll('[data-edit]').forEach((el) => el.addEventListener('click', () => openItemEditModal(listId, el.dataset.edit)));
  listEl.querySelectorAll('[data-assign]').forEach((btn) => btn.addEventListener('click', () => {
    const it = allItems.find((i) => i.id === btn.dataset.assign);
    const options = ['', 'Grzegorz', 'Ola'];
    const next = options[(options.indexOf(it.assignedTo || '') + 1) % options.length];
    sendAction('updateItem', { listId, itemId: it.id, patch: { assignedTo: next } });
  }));

  wireDragReorder(listEl, listId);
}

function wireDragReorder(listEl, listId) {
  let draggedId = null;
  listEl.querySelectorAll('.item').forEach((li) => {
    li.addEventListener('dragstart', () => { draggedId = li.dataset.id; li.classList.add('dragging'); });
    li.addEventListener('dragend', () => { li.classList.remove('dragging'); });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      const dragging = listEl.querySelector('.dragging');
      if (!dragging || dragging === li) return;
      const rect = li.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      listEl.insertBefore(dragging, before ? li : li.nextSibling);
    });
    li.addEventListener('drop', () => {
      const order = [...listEl.querySelectorAll('.item')].map((el) => el.dataset.id);
      sendAction('reorderItems', { listId, order });
    });
  });
}

function openItemEditModal(listId, itemId) {
  const it = (state.itemsByList[listId] || []).find((i) => i.id === itemId);
  if (!it) return;
  openModal(`
    <h2>${esc(it.name)}</h2>
    <div class="field-row">
      <div class="field"><label>Ilość</label><input class="text-input" id="i-qty" type="number" min="0" step="0.5" value="${it.qty ?? 1}"></div>
      <div class="field"><label>Jednostka</label><select class="text-input" id="i-unit">${state.units.map((u) => `<option ${u === it.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Sklep</label><select class="text-input" id="i-shop"><option value="">— brak —</option>${state.shops.map((s) => `<option ${s === it.shop ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
    <div class="field"><label>Kategoria</label><select class="text-input" id="i-cat"><option value="">— brak —</option>${state.categories.map((c) => `<option ${c === it.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    <div class="field"><label>Notatka</label><input class="text-input" id="i-note" maxlength="80" value="${esc(it.note || '')}" placeholder="np. bez laktozy"></div>
    <div class="field"><label>Cena (zł, opcjonalnie)</label><input class="text-input" id="i-price" type="number" min="0" step="0.01" value="${it.price ?? ''}"></div>
    <div class="modal-actions">
      <button type="button" class="btn-secondary" id="i-cancel">Anuluj</button>
      <button type="button" class="btn-primary" id="i-save">Zapisz</button>
    </div>
  `, (root) => {
    root.querySelector('#i-cancel').onclick = closeModal;
    root.querySelector('#i-save').onclick = () => {
      sendAction('updateItem', {
        listId, itemId,
        patch: {
          qty: Number(root.querySelector('#i-qty').value) || 1,
          unit: root.querySelector('#i-unit').value,
          shop: root.querySelector('#i-shop').value,
          category: root.querySelector('#i-cat').value,
          note: root.querySelector('#i-note').value.trim(),
          price: root.querySelector('#i-price').value ? Number(root.querySelector('#i-price').value) : null
        }
      });
      closeModal();
    };
  });
}

function openHistoryModal(listId) {
  const hist = state.historyByList[listId] || [];
  openModal(`
    <h2>Historia zmian</h2>
    ${hist.length ? `<ul class="history-list">${hist.map((h) => `<li>${esc(h.text)}<span class="history-time">${new Date(h.ts).toLocaleString('pl-PL')}</span></li>`).join('')}</ul>` : '<p class="welcome-sub">Brak historii.</p>'}
  `, () => {});
}

function openSaveTemplateModal(listId) {
  const list = state.lists.find((l) => l.id === listId);
  openModal(`
    <h2>Zapisz jako szablon</h2>
    <div class="field"><label>Nazwa szablonu</label><input class="text-input" id="t-name" value="${esc(list.name)}" maxlength="60"></div>
    <div class="modal-actions">
      <button type="button" class="btn-secondary" id="t-cancel">Anuluj</button>
      <button type="button" class="btn-primary" id="t-save">Zapisz</button>
    </div>
  `, (root) => {
    root.querySelector('#t-cancel').onclick = closeModal;
    root.querySelector('#t-save').onclick = () => {
      sendAction('saveTemplate', { listId, name: root.querySelector('#t-name').value.trim() || list.name });
      closeModal();
      showToast('Zapisano szablon');
    };
  });
}

function openBulkShopModal(listId, allItems) {
  // Wybieramy tylko produkty, które nie mają sklepu i nie są kupione
  const noShopItems = allItems.filter(i => !i.shop && !i.done);
  
  if (noShopItems.length === 0) {
    showToast('Wszystkie produkty na liście mają już przypisany sklep (lub są odhaczone).');
    return;
  }

  openModal(`
    <h2>Przypisz sklep do produktów</h2>
    <p class="welcome-sub">Wybierz sklep i zaznacz produkty, którym chcesz go nadać.</p>
    <div class="field">
      <select class="text-input" id="bulk-shop">
        <option value="">-- Wybierz sklep --</option>
        ${state.shops.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
      </select>
    </div>
    <div class="bulk-list" style="max-height: 250px; overflow-y: auto; background: var(--bg-soft); border-radius: 12px; padding: 10px; margin-bottom: 15px;">
      ${noShopItems.map(it => `
        <label class="check-row" style="padding: 8px 4px;">
          <input type="checkbox" value="${it.id}" checked>
          <span>${it.emoji} ${esc(it.name)}</span>
        </label>
      `).join('')}
    </div>
    <div class="modal-actions">
      <button type="button" class="btn-secondary" id="bulk-cancel">Anuluj</button>
      <button type="button" class="btn-primary" id="bulk-save">Przypisz</button>
    </div>
  `, (root) => {
    root.querySelector('#bulk-cancel').onclick = closeModal;
    root.querySelector('#bulk-save').onclick = () => {
      const shop = root.querySelector('#bulk-shop').value;
      if (!shop) { showToast('Wybierz sklep z listy!'); return; }
      
      const checkedIds = [...root.querySelectorAll('.bulk-list input:checked')].map(el => el.value);
      if (checkedIds.length === 0) { showToast('Zaznacz co najmniej jeden produkt!'); return; }
      
      sendAction('updateItemsShop', { listId, itemIds: checkedIds, shop });
      closeModal();
      showToast(`Przypisano sklep do ${checkedIds.length} produktów.`);
    };
  });
}

// =====================================================================
// SZABLONY
// =====================================================================

function renderTemplates() {
  const templates = state.templates;
  let html = '';
  
  if (!templates.length) {
    html = `<div class="empty-state"><p>Brak szablonów.</p><p class="empty-sub">Stwórz nowy z przycisku poniżej lub zapisz istniejącą listę jako szablon.</p></div>`;
  } else {
    html = templates.map((t) => `
      <div class="plain-card">
        <p class="plain-card-title">${esc(t.name)}</p>
        <p class="plain-card-sub">${t.items.length} produktów</p>
        <div class="card-actions">
          <button type="button" class="text-btn" data-use="${t.id}">Utwórz listę</button>
          <button type="button" class="text-btn danger" data-del="${t.id}">Usuń</button>
        </div>
      </div>
    `).join('');
  }
  
  html += `<button type="button" class="fab" id="new-template-fab" aria-label="Nowy szablon"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>`;
  
  viewEl.innerHTML = html;
  
  viewEl.querySelectorAll('[data-use]').forEach((btn) => btn.addEventListener('click', () => {
    const t = templates.find((x) => x.id === btn.dataset.use);
    sendAction('createList', { name: t.name, templateId: t.id, icon: '🛒', color: COLORS[0] });
    showToast('Utworzono listę z szablonu');
    location.hash = '#home';
  }));
  
  viewEl.querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', () => {
    if (confirm('Usunąć ten szablon?')) sendAction('deleteTemplate', { id: btn.dataset.del });
  }));

  document.getElementById('new-template-fab').addEventListener('click', openNewTemplateModal);
}

function openNewTemplateModal() {
  openModal(`
    <h2>Nowy szablon</h2>
    <div class="field">
      <label>Nazwa szablonu</label>
      <input class="text-input" id="tpl-name" placeholder="np. Przepis na lasagne" maxlength="60">
    </div>
    <div class="field">
      <label>Produkty (każdy w nowej linii)</label>
      <textarea class="text-input textarea-input" id="tpl-items" rows="6" placeholder="Makaron\nMięso mielone\nSos pomidorowy\nSer"></textarea>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn-secondary" id="tpl-cancel">Anuluj</button>
      <button type="button" class="btn-primary" id="tpl-save">Zapisz szablon</button>
    </div>
  `, (root) => {
    root.querySelector('#tpl-cancel').onclick = closeModal;
    root.querySelector('#tpl-save').onclick = () => {
      const name = root.querySelector('#tpl-name').value.trim();
      const itemsText = root.querySelector('#tpl-items').value;
      const items = itemsText.split('\n').filter(i => i.trim() !== '');
      
      if (!name) { showToast('Podaj nazwę szablonu!'); return; }
      
      sendAction('createTemplate', { name, items });
      closeModal();
      showToast('Utworzono nowy szablon');
    };
  });
}

// =====================================================================
// ARCHIWUM
// =====================================================================

function renderArchive() {
  const lists = archivedLists();
  if (!lists.length) {
    viewEl.innerHTML = `<div class="empty-state"><p>Archiwum jest puste.</p><p class="empty-sub">Zarchiwizowane listy pojawią się tutaj.</p></div>`;
    return;
  }
  viewEl.innerHTML = lists.map((l) => `
    <div class="plain-card">
      <p class="plain-card-title">${l.icon} ${esc(l.name)}</p>
      <p class="plain-card-sub">${l.itemCount} produktów · zarchiwizowano ${timeAgo(l.updatedAt)}</p>
      <div class="card-actions">
        <button type="button" class="text-btn" data-open="${l.id}">Otwórz</button>
        <button type="button" class="text-btn" data-restore="${l.id}">Przywróć</button>
        <button type="button" class="text-btn" data-dup="${l.id}">Kopiuj</button>
        <button type="button" class="text-btn danger" data-del="${l.id}">Usuń</button>
      </div>
    </div>
  `).join('');
  viewEl.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => location.hash = '#list/' + b.dataset.open));
  viewEl.querySelectorAll('[data-restore]').forEach((b) => b.addEventListener('click', () => sendAction('archiveList', { id: b.dataset.restore, archived: false })));
  viewEl.querySelectorAll('[data-dup]').forEach((b) => b.addEventListener('click', () => sendAction('duplicateList', { id: b.dataset.dup })));
  viewEl.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { if (confirm('Usunąć na stałe?')) sendAction('deleteList', { id: b.dataset.del }); }));
}

// =====================================================================
// STATYSTYKI
// =====================================================================

function renderStats() {
  const allItems = Object.values(state.itemsByList).flat();
  const doneItems = allItems.filter((i) => i.done);
  const archivedCount = state.lists.filter((l) => l.archived).length;

  const shopFreq = {};
  for (const it of allItems) if (it.shop) shopFreq[it.shop] = (shopFreq[it.shop] || 0) + 1;
  const topShops = Object.entries(shopFreq).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const topProducts = Object.values(state.favorites).sort((a, b) => b.count - a.count).slice(0, 8);

  viewEl.innerHTML = `
    <div class="stat-grid">
      <div class="stat-box"><span class="stat-num">${state.lists.length}</span><span class="stat-label">list łącznie</span></div>
      <div class="stat-box"><span class="stat-num">${archivedCount}</span><span class="stat-label">ukończonych</span></div>
      <div class="stat-box"><span class="stat-num">${doneItems.length}</span><span class="stat-label">kupionych produktów</span></div>
      <div class="stat-box"><span class="stat-num">${allItems.length}</span><span class="stat-label">produktów łącznie</span></div>
    </div>
    <p class="section-label">Najczęściej kupowane</p>
    <div class="plain-card">${topProducts.length ? topProducts.map((p) => `<div class="fav-row"><span>${esc(p.name)}</span><span class="fav-count">${p.count}×</span></div>`).join('') : '<p class="welcome-sub">Brak danych.</p>'}</div>
    <p class="section-label">Najczęściej używane sklepy</p>
    <div class="plain-card">${topShops.length ? topShops.map(([s, c]) => `<div class="fav-row"><span>${esc(s)}</span><span class="fav-count">${c}×</span></div>`).join('') : '<p class="welcome-sub">Brak danych.</p>'}</div>
  `;
}

// =====================================================================
// USTAWIENIA (modal)
// =====================================================================

function openSettingsModal() {
  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  openModal(`
    <h2>Ustawienia</h2>
    
    <div class="settings-row" style="display:flex; gap:10px;">
      <button type="button" class="btn-secondary" id="go-stats" style="flex:1;">📊 Statystyki</button>
      <button type="button" class="btn-secondary" id="go-archive" style="flex:1;">📦 Archiwum</button>
    </div>

    <div class="settings-row">
      <div><p class="settings-label">Kto robi zakupy</p><p class="settings-sub">Zmiana imienia widocznego przy dodanych produktach</p></div>
      <div class="segmented" id="s-user">
        <button data-v="Grzegorz" class="${state.myName === 'Grzegorz' ? 'active' : ''}">Grzegorz</button>
        <button data-v="Ola" class="${state.myName === 'Ola' ? 'active' : ''}">Ola</button>
      </div>
    </div>
    <div class="settings-row">
      <div><p class="settings-label">Wygląd</p></div>
      <div class="segmented" id="s-theme">
        <button data-v="light" class="${theme === 'light' ? 'active' : ''}">Jasny</button>
        <button data-v="dark" class="${theme === 'dark' ? 'active' : ''}">Ciemny</button>
      </div>
    </div>
    <div class="settings-row" style="display:block">
      <p class="settings-label">Sklepy</p>
      <div class="tag-list" id="s-shops">${state.shops.map((s) => `<span class="tag-pill">${esc(s)}<button data-del-shop="${esc(s)}">×</button></span>`).join('')}</div>
      <div class="add-tag-row"><input class="text-input" id="s-new-shop" placeholder="Dodaj sklep…" maxlength="40"><button id="s-add-shop">Dodaj</button></div>
    </div>
    <div class="settings-row" style="display:block">
      <p class="settings-label">Jednostki</p>
      <div class="tag-list" id="s-units">${state.units.map((u) => `<span class="tag-pill">${esc(u)}<button data-del-unit="${esc(u)}">×</button></span>`).join('')}</div>
      <div class="add-tag-row"><input class="text-input" id="s-new-unit" placeholder="Dodaj jednostkę…" maxlength="20"><button id="s-add-unit">Dodaj</button></div>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn-secondary" id="s-clear">Wyczyść dane lokalne</button>
      <button type="button" class="btn-primary" id="s-close">Zamknij</button>
    </div>
  `, (root) => {
    root.querySelector('#go-stats').onclick = () => { closeModal(); location.hash = '#stats'; };
    root.querySelector('#go-archive').onclick = () => { closeModal(); location.hash = '#archive'; };
    
    root.querySelector('#s-user').addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      state.myName = btn.dataset.v; localStorage.setItem(NAME_KEY, state.myName);
      root.querySelectorAll('#s-user button').forEach((b) => b.classList.toggle('active', b === btn));
    });
    root.querySelector('#s-theme').addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      applyTheme(btn.dataset.v);
      root.querySelectorAll('#s-theme button').forEach((b) => b.classList.toggle('active', b === btn));
    });
    root.querySelector('#s-add-shop').onclick = () => {
      const input = root.querySelector('#s-new-shop'); const v = input.value.trim();
      if (v) { sendAction('addShop', { name: v }); input.value = ''; }
    };
    root.querySelector('#s-add-unit').onclick = () => {
      const input = root.querySelector('#s-new-unit'); const v = input.value.trim();
      if (v) { sendAction('addUnit', { name: v }); input.value = ''; }
    };
    root.querySelectorAll('[data-del-shop]').forEach((b) => b.addEventListener('click', () => sendAction('deleteShop', { name: b.dataset.delShop })));
    root.querySelectorAll('[data-del-unit]').forEach((b) => b.addEventListener('click', () => sendAction('deleteUnit', { name: b.dataset.delUnit })));
    root.querySelector('#s-clear').onclick = () => {
      if (confirm('To wyczyści tylko dane zapisane w tej przeglądarce (imię, motyw, kolejkę offline) — nie usunie list na serwerze. Kontynuować?')) {
        localStorage.removeItem(NAME_KEY); localStorage.removeItem(THEME_KEY); localStorage.removeItem(QUEUE_KEY);
        location.reload();
      }
    };
    root.querySelector('#s-close').onclick = closeModal;
  }, true);
}

// =====================================================================
// WYSZUKIWANIE (modal)
// =====================================================================

function openSearchModal() {
  openModal(`
    <div class="search-input-wrap"><input class="text-input" id="q-input" placeholder="Szukaj list, produktów, sklepów…" autofocus></div>
    <div id="q-results"></div>
  `, (root) => {
    const input = root.querySelector('#q-input');
    const results = root.querySelector('#q-results');
    input.addEventListener('input', () => renderSearchResults(input.value.trim().toLowerCase(), results));
    setTimeout(() => input.focus(), 50);
  }, true);
}

function renderSearchResults(q, root) {
  if (!q) { root.innerHTML = ''; return; }
  const listHits = state.lists.filter((l) => l.name.toLowerCase().includes(q) || (l.description || '').toLowerCase().includes(q));
  const itemHits = [];
  for (const [listId, items] of Object.entries(state.itemsByList)) {
    const list = state.lists.find((l) => l.id === listId);
    if (!list) continue;
    for (const it of items) if (it.name.toLowerCase().includes(q)) itemHits.push({ it, list });
  }
  const shopHits = state.shops.filter((s) => s.toLowerCase().includes(q));

  let html = '';
  if (listHits.length) html += `<div class="search-result-group"><h3>Listy</h3>${listHits.map((l) => `<div class="search-hit" data-list="${l.id}">${l.icon} ${esc(l.name)}</div>`).join('')}</div>`;
  if (itemHits.length) html += `<div class="search-result-group"><h3>Produkty</h3>${itemHits.slice(0, 20).map((h) => `<div class="search-hit" data-list="${h.list.id}">${esc(h.it.name)}<div class="sub">w liście „${esc(h.list.name)}”</div></div>`).join('')}</div>`;
  if (shopHits.length) html += `<div class="search-result-group"><h3>Sklepy</h3>${shopHits.map((s) => `<div class="search-hit">${esc(s)}</div>`).join('')}</div>`;
  if (!html) html = '<p class="welcome-sub">Brak wyników.</p>';
  root.innerHTML = html;
  root.querySelectorAll('[data-list]').forEach((el) => el.addEventListener('click', () => { closeModal(); location.hash = '#list/' + el.dataset.list; }));
}

// =====================================================================
// Modal generyczny
// =====================================================================

function openModal(innerHtml, onMount, tall) {
  modalRoot.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><div class="modal-sheet">${innerHtml}</div></div>`;
  const backdrop = document.getElementById('modal-backdrop');
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  if (onMount) onMount(modalRoot);
}

function closeModal() { modalRoot.innerHTML = ''; }
