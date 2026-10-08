// =====================================================================
// Widok listy: drzewo (bagaż → kieszeń → rzeczy), grupowanie, gesty,
// przeciąganie, pasek szybkiego dodawania, tryb sklepu/pakowania
// =====================================================================

import { store } from '../store.js';
import {
  buildTree, parseLine, parseOutline, mergeOutline, serializeOutline, formatLine, cloneItems, guessCategory,
  itemEmoji, fmtQty, uid, norm, CATEGORY_EMOJI, KINDS
} from '../core.js';
import {
  esc, morph, toast, openSheet, actionSheet, confirmSheet, promptSheet, haptic, timeAgo, dueLabel, money,
  plural, ICON, shareText, autoGrow, afterSheets
} from '../ui.js';
import { prefs, go, dispatch, kindInfo, people, avatar } from '../ctx.js';
import { openListForm, openMergeSheet, listMenuActions } from './home.js';

// Stan widoku (lokalny dla urządzenia)
const ui = {
  listId: null,
  zoomId: null,
  target: null,     // do którego bagażu/grupy dodajemy
  asGroup: false,   // następna pozycja będzie bagażem / grupą
  highlight: null,
  dragging: false,
  wakeLock: null
};

export function setHighlight(id) { ui.highlight = id; }

function L() { return store.view.lists[ui.listId]; }
function itemsMap() { return store.view.items[ui.listId] || {}; }

// ---------------------------------------------------------------------
// Rysowanie
// ---------------------------------------------------------------------

export function renderList(viewEl, route, setTop) {
  const listId = route.id;
  if (ui.listId !== listId) {
    ui.listId = listId; ui.target = null; ui.asGroup = false;
    releaseWakeLock();
  }
  const list = L();
  if (!list) {
    setTop({ title: 'Lista', eyebrow: '', back: true });
    morph(viewEl, `<div class="empty"><div class="empty-ico">🤷</div><p>Ta lista nie istnieje lub została usunięta.</p><button class="btn btn-primary" data-act="home">Wróć do list</button></div>`);
    hideDock();
    return;
  }
  const items = itemsMap();
  const tree = buildTree(items);
  if (route.sub && !tree.byId.has(route.sub)) { go('#list/' + listId); return; }
  ui.zoomId = route.sub || null;
  if (ui.target && !tree.byId.has(ui.target)) ui.target = null;
  if (ui.target && ui.zoomId && ui.target !== ui.zoomId && !tree.path(ui.target).some((x) => x.id === ui.zoomId)) ui.target = null;

  const p = prefs.list(listId);
  const k = kindInfo(list.kind);
  const due = dueLabel(list.dueDate);

  setTop({
    title: `${list.icon} ${list.name}`,
    eyebrow: (list.archived ? 'archiwum · ' : '') + k.label.toLowerCase() + (due ? ' · ' + due.text : ''),
    back: true,
    actions: [
      { act: 'share', icon: ICON.share, label: 'Udostępnij' },
      { act: 'list-menu', icon: ICON.more, label: 'Więcej' }
    ]
  });

  const scopeId = ui.zoomId;
  const scopeStats = scopeId ? tree.stats.get(scopeId) : { total: tree.total, done: tree.done };
  const pct = scopeStats.total ? Math.round((scopeStats.done / scopeStats.total) * 100) : 0;
  const grouped = list.kind === 'shopping' && p.groupBy !== 'none' && !scopeId;
  const big = !!p.big;

  let html = '';

  // --- karta podsumowania
  const others = store.online.filter((o) => o.name && o.name !== store.me).map((o) => o.name);
  const uniqOthers = [...new Set(others)];
  let spent = 0, planned = 0;
  for (const it of tree.byId.values()) if (it.price) { planned += it.price; if (it.done) spent += it.price; }
  const allDone = scopeStats.total > 0 && scopeStats.done === scopeStats.total;
  html += `<section class="summary" data-key="summary" style="--accent:${list.color}">
    <div class="ring" style="--p:${pct}"><span>${pct}%</span></div>
    <div class="sum-main">
      <p class="sum-title">${allDone ? (list.kind === 'shopping' ? 'Wszystko kupione! 🎉' : list.kind === 'packing' ? 'Wszystko spakowane! 🎉' : 'Wszystko zrobione! 🎉') : `${scopeStats.done} z ${scopeStats.total} ${esc(k.done)}`}</p>
      <p class="sum-sub">${scopeStats.total - scopeStats.done ? `${scopeStats.total - scopeStats.done} ${esc(k.todo)}` : (scopeStats.total ? 'nic nie zostało' : 'lista jest pusta')}${due ? ` · <span class="due ${due.urgent ? 'urgent' : ''} ${due.past ? 'past' : ''}">📅 ${esc(due.text)}</span>` : ''}</p>
      ${uniqOthers.length ? `<p class="sum-online">${uniqOthers.map((n) => avatar(n, 'sm')).join('')}<span>${esc(uniqOthers.join(', '))} ${uniqOthers.length === 1 ? 'jest' : 'są'} teraz online</span></p>` : ''}
    </div>
  </section>`;
  if (list.kind === 'shopping' && (list.budget || planned)) {
    const over = list.budget && spent > list.budget;
    html += `<section class="budget" data-key="budget">
      <div><span class="lbl">Wydano</span><b class="${over ? 'over' : ''}">${money(spent)}</b></div>
      ${planned ? `<div><span class="lbl">Wszystko z cenami</span><b>${money(planned)}</b></div>` : ''}
      ${list.budget ? `<div><span class="lbl">Budżet</span><b>${money(list.budget)}</b></div>` : ''}
      ${list.budget ? `<div class="bar"><i style="width:${Math.min(100, (spent / list.budget) * 100)}%" class="${over ? 'over' : ''}"></i></div>` : ''}
    </section>`;
  }

  // --- pasek narzędzi
  const chips = [];
  if (list.kind === 'shopping') {
    const gl = { none: 'Bez grup', category: 'Kategorie', shop: 'Sklepy' }[p.groupBy] || 'Kategorie';
    chips.push(`<button type="button" class="chip" data-act="groupby">🗂️ ${gl}</button>`);
    chips.push(`<button type="button" class="chip ${big ? 'on' : ''}" data-act="big">🏃 Tryb sklepu</button>`);
  } else {
    chips.push(`<button type="button" class="chip ${big ? 'on' : ''}" data-act="big">${list.kind === 'packing' ? '🧳 Tryb pakowania' : '🔍 Duży widok'}</button>`);
    const hasGroups = [...tree.byId.values()].some((i) => tree.kids(i.id).length);
    if (hasGroups) {
      const anyCollapsed = Object.values(p.collapsed).some(Boolean);
      chips.push(`<button type="button" class="chip" data-act="collapse-all">${anyCollapsed ? '↕️ Rozwiń wszystko' : '↕️ Zwiń wszystko'}</button>`);
    }
  }
  chips.push(`<button type="button" class="chip ${p.hideDone ? 'on' : ''}" data-act="hide-done">${p.hideDone ? '👁️ Pokaż ' : '🙈 Ukryj '}${esc(k.done)}</button>`);
  chips.push(`<button type="button" class="chip" data-act="text-mode">✍️ Pisz tekstem</button>`);
  if (scopeStats.done && list.kind !== 'shopping') chips.push(`<button type="button" class="chip" data-act="reset">🔄 Od nowa</button>`);
  html += `<div class="chips" data-key="chips">${chips.join('')}</div>`;

  // --- filtr sklepów (zakupy)
  if (list.kind === 'shopping') {
    const shopCount = {};
    for (const it of tree.byId.values()) if (it.shop && !it.done && !tree.kids(it.id).length) shopCount[it.shop] = (shopCount[it.shop] || 0) + 1;
    const shops = Object.keys(shopCount);
    if (p.shopFilter && !shops.includes(p.shopFilter)) p.shopFilter = '';
    if (shops.length) {
      html += `<div class="chips shops" data-key="shops"><button type="button" class="chip sm ${!p.shopFilter ? 'on' : ''}" data-act="shop" data-shop="">Wszystkie sklepy</button>${shops.map((s) => `<button type="button" class="chip sm ${p.shopFilter === s ? 'on' : ''}" data-act="shop" data-shop="${esc(s)}">${esc(s)} <b>${shopCount[s]}</b></button>`).join('')}</div>`;
    }
  }

  // --- okruszki (powiększona grupa)
  if (scopeId) {
    const path = tree.path(scopeId);
    html += `<nav class="crumbs" data-key="crumbs"><button type="button" data-act="zoom" data-id="">🏠 Cała lista</button>${path.map((g) => `<span>›</span><button type="button" data-act="zoom" data-id="${g.id}">${esc(itemEmoji(g) || '📁')} ${esc(g.name)}</button>`).join('')}</nav>`;
  }

  // --- elementy
  const rows = [];
  const shopFilter = list.kind === 'shopping' ? p.shopFilter || '' : '';
  const matchesShop = (it) => !shopFilter || it.shop === shopFilter;
  const visibleCache = new Map();
  const visible = (it) => {
    if (visibleCache.has(it.id)) return visibleCache.get(it.id);
    const kids = tree.kids(it.id);
    let v;
    if (kids.length) v = kids.some(visible) && !(p.hideDone && tree.isDone(it.id));
    else v = matchesShop(it) && !(p.hideDone && it.done);
    if (!kids.length && it.type === 'group') v = !(p.hideDone && it.done) && !shopFilter;
    visibleCache.set(it.id, v);
    return v;
  };

  if (grouped) {
    const leaves = [...tree.byId.values()].filter((it) => !tree.kids(it.id).length && it.type !== 'group' && matchesShop(it));
    const open = leaves.filter((it) => !it.done);
    const done = leaves.filter((it) => it.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    const field = p.groupBy === 'shop' ? 'shop' : 'category';
    const order = field === 'shop' ? store.view.meta.shops : store.view.meta.categories;
    const groups = new Map();
    for (const it of open) {
      const key = it[field] || '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }
    const keys = [...groups.keys()].sort((a, b) => {
      if (!a) return 1; if (!b) return -1;
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b, 'pl');
    });
    for (const key of keys) {
      const label = key ? (field === 'category' ? `${CATEGORY_EMOJI[key] || '🏷️'} ${key}` : `🏪 ${key}`) : (field === 'category' ? '📦 Bez kategorii' : '🏪 Bez sklepu');
      rows.push(`<h3 class="sec" data-key="sec:${esc(key)}">${esc(label)} <span>${groups.get(key).length}</span></h3>`);
      for (const it of groups.get(key).sort((a, b) => (b.important - a.important) || tree.path(a.id).length - tree.path(b.id).length || 0)) {
        rows.push(rowHtml(it, tree, 0, { list, flat: true, field }));
      }
    }
    if (done.length && !p.hideDone) {
      rows.push(`<button type="button" class="sec sec-btn" data-key="sec:done" data-act="done-toggle">🧺 W koszyku <span>${done.length}</span> ${p.doneOpen === false ? ICON.right : ICON.chevron}</button>`);
      if (p.doneOpen !== false) for (const it of done) rows.push(rowHtml(it, tree, 0, { list, flat: true }));
    }
  } else {
    const walk = (parentId, depth) => {
      let kids = tree.kids(parentId).filter(visible);
      if (list.kind === 'shopping') kids = [...kids].sort((a, b) => (tree.isDone(a.id) - tree.isDone(b.id)));
      for (const it of kids) {
        rows.push(rowHtml(it, tree, depth, { list, collapsed: !!p.collapsed[it.id] }));
        if (tree.kids(it.id).length && !p.collapsed[it.id]) walk(it.id, depth + 1);
      }
    };
    walk(scopeId, 0);
  }

  if (!rows.length) {
    const empty = scopeStats.total && (p.hideDone || shopFilter)
      ? `<div class="empty small"><p>Wszystko ukryte filtrami.</p></div>`
      : `<div class="empty small"><div class="empty-ico">${list.kind === 'packing' ? '🧳' : list.kind === 'todo' ? '📝' : '🛒'}</div>
          <p>${scopeId ? 'Ten bagaż jest pusty.' : 'Lista jest pusta.'}</p>
          <p class="muted">${list.kind === 'packing'
            ? 'Zacznij od bagażu (np. <b>Plecak:</b> — dwukropek tworzy pojemnik), potem dodawaj do niego kieszenie i rzeczy.'
            : 'Wpisz na dole, np. <b>2 l mleko @Lidl</b>. Możesz wkleić całą listę naraz.'}</p>
          <button type="button" class="btn btn-ghost" data-act="text-mode">✍️ Napisz całą listę tekstem</button></div>`;
    rows.push(empty);
  }

  html += `<div class="rows ${big ? 'big' : ''} ${grouped ? 'grouped' : ''}" id="rows" data-key="rows">${rows.join('')}</div>`;
  html += `<div class="list-foot" data-key="foot">${list.updatedBy ? `Ostatnia zmiana: ${esc(list.updatedBy)}, ${timeAgo(list.updatedAt)}` : ''}</div>`;

  if (!ui.dragging) morph(viewEl, html);
  renderDock(list, tree);

  if (ui.highlight) {
    const id = ui.highlight;
    ui.highlight = null;
    // rozwiń rodziców i podświetl
    const path = tree.path(id).slice(0, -1);
    let changed = false;
    for (const g of path) if (p.collapsed[g.id]) { p.collapsed[g.id] = false; changed = true; }
    if (changed) { prefs.setList(listId, { collapsed: p.collapsed }); store.notify(); }
    requestAnimationFrame(() => {
      const el = viewEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
    });
  }
}

function rowHtml(it, tree, depth, { list, collapsed = false, flat = false, field = '' }) {
  const kids = tree.kids(it.id);
  const isGroup = kids.length > 0 || it.type === 'group';
  const st = tree.stats.get(it.id) || { total: 0, done: 0 };
  const done = tree.isDone(it.id);
  const emoji = itemEmoji(it);
  const qty = it.qty !== null && it.qty !== undefined && !(it.qty === 1 && !it.unit) ? `${fmtQty(it.qty)}${it.unit ? ' ' + esc(it.unit) : '×'}` : (it.unit ? esc(it.unit) : '');
  const meta = [];
  if (flat) {
    const path = tree.path(it.id).slice(0, -1);
    if (path.length) meta.push(`<span class="tag path">📍 ${esc(path.map((g) => g.name).join(' › '))}</span>`);
  }
  if (it.shop && field !== 'shop' && list.kind === 'shopping') meta.push(`<span class="tag">🏪 ${esc(it.shop)}</span>`);
  if (it.category && field !== 'category' && list.kind === 'shopping' && !flat) meta.push(`<span class="tag">${esc(CATEGORY_EMOJI[it.category] || '🏷️')} ${esc(it.category)}</span>`);
  if (it.note) meta.push(`<span class="note">${esc(it.note)}</span>`);
  if (it.price) meta.push(`<span class="price">${money(it.price)}</span>`);
  if (done && it.doneBy && !isGroup && list.kind !== 'shopping') meta.push(`<span class="by">✓ ${esc(it.doneBy)}</span>`);
  const cls = ['row', 'lvl-' + Math.min(depth, 5), isGroup ? 'group' : 'leaf', done ? 'done' : '', it.important ? 'important' : '', collapsed ? 'collapsed' : '', st.done && !done ? 'partial' : ''].filter(Boolean).join(' ');
  const pct = st.total ? Math.round((st.done / st.total) * 100) : 0;
  const draggable = !flat;

  if (isGroup) {
    return `<div class="${cls}" data-key="i:${it.id}" data-id="${it.id}" style="--d:${depth};--p:${pct}">
      <div class="swipe-bg"><span class="sb-l">${ICON.check}</span><span class="sb-r">${ICON.trash}</span></div>
      <div class="row-in">
        <button type="button" class="chk ring-chk" data-act="check" aria-label="${done ? 'Odznacz całość' : 'Odhacz całość'}"><span class="box">${done ? ICON.check : ''}</span></button>
        <button type="button" class="row-main" data-act="toggle" aria-expanded="${!collapsed}">
          <span class="row-title"><span class="emoji">${emoji || '📁'}</span><span class="name">${esc(it.name)}</span>${qty ? `<span class="qty">${qty}</span>` : ''}</span>
          <span class="row-meta"><span class="twisty" aria-hidden="true">${ICON.chevron}</span><span class="count">${st.total ? `${st.done}/${st.total}` : 'pusty'}</span>${meta.join('')}</span>
        </button>
        <button type="button" class="icon-btn sm add-in" data-act="add-in" aria-label="Dodaj do: ${esc(it.name)}">${ICON.plus}</button>
        <button type="button" class="icon-btn sm" data-act="group-menu" aria-label="Opcje: ${esc(it.name)}">${ICON.more}</button>
        ${draggable ? `<span class="handle" data-drag aria-label="Przeciągnij">${ICON.drag}</span>` : ''}
      </div>
    </div>`;
  }
  return `<div class="${cls}" data-key="i:${it.id}" data-id="${it.id}" style="--d:${depth}">
    <div class="swipe-bg"><span class="sb-l">${done ? '↩︎' : ICON.check}</span><span class="sb-r">${ICON.trash}</span></div>
    <div class="row-in">
      <button type="button" class="chk" data-act="check" aria-label="${done ? 'Odznacz' : 'Odhacz'}: ${esc(it.name)}" aria-pressed="${done}"><span class="box">${ICON.check}</span></button>
      <button type="button" class="row-main" data-act="edit">
        <span class="row-title">${emoji ? `<span class="emoji">${emoji}</span>` : ''}<span class="name">${esc(it.name)}</span>${qty ? `<span class="qty">${qty}</span>` : ''}${it.important ? '<span class="imp" title="Ważne">❗</span>' : ''}</span>
        ${meta.length ? `<span class="row-meta">${meta.join('')}</span>` : ''}
      </button>
      ${it.assignedTo ? avatar(it.assignedTo, 'sm') : ''}
      ${draggable ? `<span class="handle" data-drag aria-label="Przeciągnij">${ICON.drag}</span>` : ''}
    </div>
  </div>`;
}

// ---------------------------------------------------------------------
// Pasek dodawania (dock) — trwały element poza #view
// ---------------------------------------------------------------------

let dockWired = false;

function dockEl() { return document.getElementById('dock'); }

export function hideDock() {
  const d = dockEl();
  if (d) d.hidden = true;
  document.body.classList.remove('with-dock');
}

function renderDock(list, tree) {
  const d = dockEl();
  if (!d) return;
  d.hidden = false;
  document.body.classList.add('with-dock');
  if (!dockWired) wireDock(d);
  const k = kindInfo(list.kind);
  const target = ui.target || ui.zoomId;
  const path = target ? tree.path(target) : [];
  const input = d.querySelector('#add-input');
  input.placeholder = ui.asGroup ? (list.kind === 'packing' ? 'Nazwa bagażu lub kieszeni…' : 'Nazwa grupy…') : (target ? `Dodaj do „${path[path.length - 1].name}”…` : k.add);
  d.querySelector('[data-dock="group"]').setAttribute('aria-pressed', String(ui.asGroup));
  d.querySelector('[data-dock="group"]').title = list.kind === 'packing' ? 'Następna pozycja będzie bagażem / kieszenią' : 'Następna pozycja będzie grupą';
  const tgt = d.querySelector('.dock-target');
  if (path.length && ui.target && ui.target !== ui.zoomId) {
    tgt.hidden = false;
    const zoomIdx = ui.zoomId ? path.findIndex((g) => g.id === ui.zoomId) : -1;
    const shown = path.slice(zoomIdx + 1);
    morph(tgt, `<span class="dt-lbl">Dodajesz do:</span>${shown.map((g, i) => `${i ? '<span class="dt-sep">›</span>' : ''}<button type="button" data-dock="target" data-id="${g.id}">${esc(itemEmoji(g) || '📁')} ${esc(g.name)}</button>`).join('')}<button type="button" class="dt-x" data-dock="target" data-id="" aria-label="Dodawaj na główny poziom">${ICON.close}</button>`);
  } else {
    tgt.hidden = true;
  }
  updateSuggestions();
}

function wireDock(d) {
  dockWired = true;
  const form = d.querySelector('form');
  const input = d.querySelector('#add-input');

  const submit = () => { submitAdd(input.value); };
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  input.addEventListener('beforeinput', (e) => {
    if ((e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') && !input.value.includes('\n')) { e.preventDefault(); submit(); }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !input.value.includes('\n')) { e.preventDefault(); submit(); }
  });
  input.addEventListener('input', () => { fitInput(input); updateSuggestions(); });
  input.addEventListener('focus', () => { d.classList.add('focused'); updateSuggestions(); });
  input.addEventListener('blur', () => { setTimeout(() => { if (document.activeElement !== input) { d.classList.remove('focused'); updateSuggestions(); } }, 150); });
  input.addEventListener('paste', () => setTimeout(() => fitInput(input), 0));

  d.addEventListener('pointerdown', (e) => {
    // nie zabieraj fokusu z pola przy klikaniu podpowiedzi/przycisków (klawiatura zostaje)
    if (e.target.closest('button') && document.activeElement === input) e.preventDefault();
  });
  d.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dock]');
    if (!b) return;
    const what = b.dataset.dock;
    if (what === 'group') { ui.asGroup = !ui.asGroup; haptic(); store.notify(); input.focus(); }
    else if (what === 'target') { ui.target = b.dataset.id || null; store.notify(); }
    else if (what === 'sugg') { addFromFav(b.dataset.name); }
    else if (what === 'send') { submit(); }
  });
}

function fitInput(input) {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 140) + 'px';
}

function suggestionsFor(q, list, items) {
  const favs = Object.values(store.view.favs || {});
  const onList = new Set(Object.values(items).filter((i) => !i.done).map((i) => norm(i.name)));
  const nq = norm(q);
  const score = (f) => (f.kind === list.kind ? 1000 : 0) + (f.count || 0) * 10 + (f.last || 0) / 1e12;
  let hits;
  if (nq) {
    hits = favs.filter((f) => {
      const n = norm(f.name);
      return n !== nq && (n.startsWith(nq) || n.includes(' ' + nq)) && !onList.has(n);
    });
  } else {
    hits = favs.filter((f) => f.kind === list.kind && !onList.has(norm(f.name)) && (f.count || 0) >= 2);
  }
  return hits.sort((a, b) => score(b) - score(a)).slice(0, nq ? 6 : 10);
}

function updateSuggestions() {
  const d = dockEl();
  if (!d || d.hidden) return;
  const list = L();
  if (!list) return;
  const input = d.querySelector('#add-input');
  const box = d.querySelector('.suggest');
  const hint = d.querySelector('.parse-hint');
  const value = input.value;
  const focused = document.activeElement === input;
  const single = !value.includes('\n');
  const q = single ? parseLine(value, store.view.meta).name : '';
  const sugg = focused && single && !ui.asGroup ? suggestionsFor(value ? q : '', list, itemsMap()) : [];
  morph(box, sugg.length ? `${!value ? '<span class="sg-lbl">Często dodawane:</span>' : ''}${sugg.map((f) => `<button type="button" class="sg" data-dock="sugg" data-name="${esc(f.name)}">${esc(itemEmoji({ name: f.name }) || '')} ${esc(f.name)}</button>`).join('')}` : '');
  box.hidden = !sugg.length;

  // podgląd rozpoznanych pól
  let h = '';
  if (value.trim()) {
    if (!single) {
      const n = parseOutline(value, store.view.meta).length;
      h = `📋 Dodasz ${n} ${plural(n, 'pozycję', 'pozycje', 'pozycji')} (wcięcia = zagnieżdżenie, „:” na końcu = bagaż)`;
    } else if (!ui.asGroup && !/:\s*$/.test(value)) {
      const f = parseLine(value, store.view.meta);
      const parts = [];
      if (f.qty !== null) parts.push(`${fmtQty(f.qty)}${f.unit ? ' ' + f.unit : '×'}`);
      if (f.shop) parts.push('🏪 ' + f.shop);
      if (f.category) parts.push('🏷️ ' + f.category);
      if (f.note) parts.push('📝 ' + f.note);
      if (f.important) parts.push('❗ ważne');
      if (parts.length) h = `<b>${esc(f.name)}</b> · ${esc(parts.join(' · '))}`;
    } else {
      h = `📁 Utworzysz ${list.kind === 'packing' ? 'bagaż/kieszeń' : 'grupę'} — potem dodasz do środka`;
    }
  }
  hint.innerHTML = h;
  hint.hidden = !h;
}

function newItemFrom(fields, list, parentId) {
  const fav = store.view.favs[norm(fields.name)];
  const isShop = list.kind === 'shopping';
  const p = prefs.list(list.id);
  return {
    id: uid(),
    parentId: parentId || null,
    type: fields.type || 'item',
    name: fields.name,
    qty: fields.qty ?? null,
    unit: fields.unit || (fields.qty !== null && fav && fav.unit ? fav.unit : ''),
    shop: fields.shop || (isShop && p.shopFilter) || '',
    category: isShop && fields.type !== 'group' ? (fields.category || (fav && fav.category) || guessCategory(fields.name)) : (fields.category || ''),
    note: fields.note || '',
    important: !!fields.important
  };
}

function submitAdd(raw) {
  const list = L();
  if (!list) return;
  const input = document.getElementById('add-input');
  const text = String(raw || '').replace(/\r/g, '');
  if (!text.trim()) return;
  const parentId = ui.target || ui.zoomId || null;
  const items = itemsMap();
  const tree = buildTree(items);

  if (text.trim().includes('\n')) {
    const nodes = parseOutline(text, store.view.meta);
    if (!nodes.length) return;
    const created = mergeOutline({}, nodes, { autoCategory: list.kind === 'shopping', by: store.me });
    for (const c of created) {
      if (!c.parentId) c.parentId = parentId;
      if (list.kind === 'shopping' && c.type !== 'group' && !c.category) c.category = (store.view.favs[norm(c.name)] || {}).category || guessCategory(c.name);
      delete c.order;
    }
    dispatch({ t: 'item.add', listId: list.id, items: created });
    toast(`Dodano ${created.length} ${plural(created.length, 'pozycję', 'pozycje', 'pozycji')}`);
    input.value = ''; fitInput(input); haptic();
    store.notify();
    return;
  }

  let line = text.trim();
  let isGroup = ui.asGroup;
  if (/:\s*$/.test(line)) { isGroup = true; line = line.replace(/:\s*$/, ''); }
  const fields = isGroup
    ? { name: line.charAt(0).toLocaleUpperCase('pl-PL') + line.slice(1), qty: null, unit: '', type: 'group' }
    : parseLine(line, store.view.meta);
  if (!fields.name) return;

  // duplikaty
  if (!isGroup) {
    const siblings = list.kind === 'shopping' ? [...tree.byId.values()] : tree.kids(parentId);
    const dup = siblings.find((s) => norm(s.name) === norm(fields.name) && !tree.kids(s.id).length && s.type !== 'group');
    if (dup) {
      input.value = ''; fitInput(input);
      if (dup.done) {
        dispatch({ t: 'item.check', listId: list.id, ids: [dup.id], done: false });
        toast(`„${dup.name}” wraca na listę`);
      } else {
        const add = fields.qty || 1;
        toast(`„${dup.name}” już jest na liście`, {
          action: `+${fmtQty(add)}${dup.unit ? ' ' + dup.unit : ''}`,
          onAction: () => dispatch({ t: 'item.update', listId: list.id, id: dup.id, patch: { qty: (dup.qty || 1) + add } })
        });
        ui.highlight = dup.id;
      }
      store.notify();
      return;
    }
  }

  const it = newItemFrom({ ...fields, type: isGroup ? 'group' : 'item' }, list, parentId);
  dispatch({ t: 'item.add', listId: list.id, items: [it] });
  haptic();
  input.value = ''; fitInput(input);
  if (isGroup) {
    ui.target = it.id;
    ui.asGroup = false;
    toast(`Teraz dodajesz do „${it.name}”`);
  }
  if (parentId) { const p = prefs.list(list.id); if (p.collapsed[parentId]) { p.collapsed[parentId] = false; prefs.setList(list.id, { collapsed: p.collapsed }); } }
  store.notify();
  requestAnimationFrame(() => {
    const el = document.querySelector(`#rows [data-id="${CSS.escape(it.id)}"]`);
    if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); const r = el.getBoundingClientRect(); const dockTop = dockEl().getBoundingClientRect().top; if (r.bottom > dockTop || r.top < 60) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  });
}

function addFromFav(name) {
  const list = L();
  const input = document.getElementById('add-input');
  const parsed = parseLine(input.value, store.view.meta);
  const fav = store.view.favs[norm(name)] || { name };
  const parentId = ui.target || ui.zoomId || null;
  const it = newItemFrom({ name: fav.name, qty: parsed.qty, unit: parsed.unit || '', shop: parsed.shop, category: parsed.category || fav.category || '', important: parsed.important, note: parsed.note }, list, parentId);
  dispatch({ t: 'item.add', listId: list.id, items: [it] });
  haptic();
  input.value = ''; fitInput(input);
  store.notify();
}

// ---------------------------------------------------------------------
// Akcje (delegacja kliknięć z #view)
// ---------------------------------------------------------------------

export function handleListClick(e, el) {
  const list = L();
  if (!list) { if (el.dataset.act === 'home') go('#home'); return; }
  const act = el.dataset.act;
  const row = el.closest('.row');
  const id = row ? row.dataset.id : el.dataset.id;
  const p = prefs.list(list.id);
  const items = itemsMap();

  switch (act) {
    case 'home': go('#home'); break;
    case 'check': {
      const tree = buildTree(items);
      const done = !tree.isDone(id);
      dispatch({ t: 'item.check', listId: list.id, ids: [id], done });
      haptic(done ? 12 : 6);
      if (done && list.kind !== 'shopping') {
        // automatyczne zwinięcie spakowanej grupy
        const it = items[id];
        if (it && it.parentId) {
          const t2 = buildTree(store.view.items[list.id]);
          if (t2.isDone(it.parentId) && !p.collapsed[it.parentId]) {
            setTimeout(() => { p.collapsed[it.parentId] = true; prefs.setList(list.id, { collapsed: p.collapsed }); store.notify(); }, 450);
          }
        }
      }
      break;
    }
    case 'edit': openItemSheet(list.id, id); break;
    case 'toggle': {
      p.collapsed[id] = !p.collapsed[id];
      prefs.setList(list.id, { collapsed: p.collapsed });
      store.notify();
      break;
    }
    case 'add-in': {
      ui.target = id;
      ui.asGroup = false;
      if (p.collapsed[id]) { p.collapsed[id] = false; prefs.setList(list.id, { collapsed: p.collapsed }); }
      store.notify();
      const input = document.getElementById('add-input');
      input.focus();
      break;
    }
    case 'group-menu': openGroupMenu(list.id, id); break;
    case 'zoom': go('#list/' + list.id + (el.dataset.id ? '/' + el.dataset.id : '')); break;
    case 'groupby': {
      const next = { category: 'shop', shop: 'none', none: 'category' }[p.groupBy] || 'category';
      prefs.setList(list.id, { groupBy: next });
      toast({ category: 'Grupowanie po kategoriach (kolejność alejek)', shop: 'Grupowanie po sklepach', none: 'Bez grupowania — kolejność ręczna' }[next]);
      store.notify();
      break;
    }
    case 'big': {
      const big = !p.big;
      prefs.setList(list.id, { big });
      if (big) requestWakeLock(); else releaseWakeLock();
      if (big) toast(list.kind === 'shopping' ? 'Tryb sklepu: duże przyciski, ekran nie wygasa' : 'Duży widok: wygodne odhaczanie, ekran nie wygasa');
      store.notify();
      break;
    }
    case 'hide-done': prefs.setList(list.id, { hideDone: !p.hideDone }); store.notify(); break;
    case 'collapse-all': {
      const tree = buildTree(items);
      const anyCollapsed = Object.values(p.collapsed).some(Boolean);
      const collapsed = {};
      if (!anyCollapsed) for (const it of tree.byId.values()) if (tree.kids(it.id).length) collapsed[it.id] = true;
      prefs.setList(list.id, { collapsed });
      store.notify();
      break;
    }
    case 'shop': prefs.setList(list.id, { shopFilter: el.dataset.shop || '' }); store.notify(); break;
    case 'done-toggle': prefs.setList(list.id, { doneOpen: p.doneOpen === false }); store.notify(); break;
    case 'text-mode': openTextEditor(list.id); break;
    case 'reset': resetList(list.id); break;
    case 'share': shareList(list.id); break;
    case 'list-menu': openListMenu(list.id); break;
  }
}

async function resetList(listId) {
  const list = store.view.lists[listId];
  const k = kindInfo(list.kind);
  const ok = await confirmSheet({ title: 'Zacząć od nowa?', text: `Wszystkie pozycje zostaną odznaczone (${k.done} → ${k.todo}). Przydatne, gdy używasz tej samej listy kolejny raz.`, ok: 'Odznacz wszystko' });
  if (!ok) return;
  const roots = buildTree(store.view.items[listId] || {}).kids(null).map((i) => i.id);
  dispatch({ t: 'item.check', listId, ids: roots, done: false });
  prefs.setList(listId, { collapsed: {} });
  store.notify();
}

function snapshotSubtree(listId, ids) {
  const items = store.view.items[listId] || {};
  const tree = buildTree(items);
  const out = [];
  for (const id of ids) { if (items[id]) { out.push({ ...items[id] }); for (const d of tree.descendants(id)) out.push({ ...d }); } }
  return out;
}

export async function deleteItems(listId, ids, { confirmGroups = true } = {}) {
  const snap = snapshotSubtree(listId, ids);
  if (!snap.length) return;
  const nested = snap.length - ids.length;
  if (confirmGroups && nested > 0) {
    const ok = await confirmSheet({ title: `Usunąć „${snap[0].name}”?`, text: `Razem z zawartością (${nested} ${plural(nested, 'pozycja', 'pozycje', 'pozycji')}).`, ok: 'Usuń', danger: true });
    if (!ok) return;
  }
  dispatch({ t: 'item.delete', listId, ids });
  haptic(15);
  toast(snap.length === 1 ? `Usunięto „${snap[0].name}”` : `Usunięto ${snap.length} ${plural(snap.length, 'pozycję', 'pozycje', 'pozycji')}`, {
    action: 'Cofnij',
    onAction: () => dispatch({ t: 'item.add', listId, items: snap })
  });
}

function openGroupMenu(listId, id) {
  const items = store.view.items[listId] || {};
  const it = items[id];
  if (!it) return;
  const tree = buildTree(items);
  const done = tree.isDone(id);
  const list = store.view.lists[listId];
  actionSheet(`${itemEmoji(it) || '📁'} ${it.name}`, [
    { icon: '➕', label: 'Dodaj do środka', onClick: () => { ui.target = id; store.notify(); document.getElementById('add-input').focus(); } },
    { icon: '🔍', label: 'Otwórz osobno', hint: 'pokazuje tylko zawartość', onClick: () => go(`#list/${listId}/${id}`) },
    { icon: '✏️', label: 'Edytuj / zmień nazwę', onClick: () => openItemSheet(listId, id) },
    { icon: done ? '↩️' : '✅', label: done ? 'Odznacz całą zawartość' : `Odhacz całą zawartość`, onClick: () => dispatch({ t: 'item.check', listId, ids: [id], done: !done }) },
    { icon: '📦', label: 'Przenieś do…', onClick: () => openMoveSheet(listId, [id]) },
    { icon: '📄', label: 'Duplikuj z zawartością', onClick: () => duplicateItems(listId, id) },
    list.kind === 'shopping' ? null : { icon: '💾', label: 'Zapisz jako szablon', onClick: () => saveSubtreeAsTemplate(listId, id) },
    { sep: true },
    { icon: '🗑️', label: 'Usuń z zawartością', danger: true, onClick: () => deleteItems(listId, [id]) }
  ]);
}

function duplicateItems(listId, id) {
  const snap = snapshotSubtree(listId, [id]);
  if (!snap.length) return;
  const copies = cloneItems(snap, { by: store.me });
  copies[0].parentId = snap[0].parentId || null;
  copies[0].name = snap[0].name + ' (kopia)';
  for (const c of copies) delete c.order;
  dispatch({ t: 'item.add', listId, items: copies });
  toast('Zduplikowano');
}

async function saveSubtreeAsTemplate(listId, id) {
  const snap = snapshotSubtree(listId, [id]);
  const list = store.view.lists[listId];
  const name = await promptSheet({ title: 'Nazwa szablonu', value: snap[0].name, ok: 'Zapisz szablon', maxLength: 60 });
  if (!name) return;
  const items = snap.map((x) => ({ ...x }));
  items[0].parentId = null;
  dispatch({ t: 'tpl.save', tpl: { id: uid(), name, kind: list.kind, icon: itemEmoji(snap[0]) || list.icon, color: list.color, items } });
  toast('Zapisano szablon');
}

// ---------------------------------------------------------------------
// Edycja pozycji
// ---------------------------------------------------------------------

export function openItemSheet(listId, id) {
  const list = store.view.lists[listId];
  const items = store.view.items[listId] || {};
  const it = items[id];
  if (!it || !list) return;
  const tree = buildTree(items);
  const isGroup = tree.kids(id).length > 0 || it.type === 'group';
  const meta = store.view.meta;
  const path = tree.path(id).slice(0, -1);
  const isShop = list.kind === 'shopping';
  const units = [...new Set(['', ...meta.units, it.unit].filter((u) => u !== undefined))];
  const fav = store.view.favs[norm(it.name)];

  const html = `<form class="item-form" autocomplete="off">
    <div class="name-row">
      <input class="input emoji-in" name="emoji" value="${esc(it.emoji)}" placeholder="${esc(itemEmoji({ ...it, emoji: '' }) || '🙂')}" maxlength="8" aria-label="Emoji">
      <input class="input big" name="name" value="${esc(it.name)}" maxlength="80" required aria-label="Nazwa">
    </div>
    <div class="field">
      <label>Ilość</label>
      <div class="qty-row">
        <button type="button" class="step" data-step="-1" aria-label="Mniej">−</button>
        <input class="input qty-in" name="qty" inputmode="decimal" value="${it.qty ?? ''}" placeholder="1">
        <button type="button" class="step" data-step="1" aria-label="Więcej">+</button>
        <select class="input unit-in" name="unit" aria-label="Jednostka">${units.map((u) => `<option value="${esc(u)}" ${u === (it.unit || '') ? 'selected' : ''}>${u ? esc(u) : '—'}</option>`).join('')}</select>
      </div>
    </div>
    ${isShop && !isGroup ? `
    <div class="field"><label>Sklep</label>
      <div class="pick" data-pick="shop">${['', ...meta.shops].map((s) => `<button type="button" class="chip sm ${s === (it.shop || '') ? 'on' : ''}" data-v="${esc(s)}">${s ? esc(s) : 'Dowolny'}</button>`).join('')}</div>
    </div>
    <div class="field"><label>Kategoria</label>
      <select class="input" name="category"><option value="">— brak —</option>${[...new Set([...meta.categories, it.category].filter(Boolean))].map((c) => `<option ${c === it.category ? 'selected' : ''} value="${esc(c)}">${esc(CATEGORY_EMOJI[c] || '🏷️')} ${esc(c)}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Cena (zł)${fav && fav.price && !it.price ? ` <small class="muted">ostatnio ${money(fav.price)}</small>` : ''}</label><input class="input" name="price" inputmode="decimal" value="${it.price ?? ''}" placeholder="opcjonalnie"></div>` : ''}
    <div class="field"><label>Notatka</label><input class="input" name="note" value="${esc(it.note)}" maxlength="240" placeholder="${isShop ? 'np. bez laktozy, duże opakowanie' : 'np. naładować wieczorem'}"></div>
    <div class="field"><label>Kto się zajmuje</label>
      <div class="pick" data-pick="assignedTo">${['', ...people()].map((n) => `<button type="button" class="chip sm ${n === (it.assignedTo || '') ? 'on' : ''}" data-v="${esc(n)}">${n ? avatar(n, 'xs') + ' ' + esc(n) : 'Nikt'}</button>`).join('')}</div>
    </div>
    <label class="switch-row"><span>❗ Ważne</span><input type="checkbox" name="important" ${it.important ? 'checked' : ''}><i class="switch"></i></label>
    ${tree.kids(id).length ? '' : `<label class="switch-row"><span>📁 ${list.kind === 'packing' ? 'To jest bagaż / kieszeń' : 'To jest grupa'} <small>może mieć zawartość</small></span><input type="checkbox" name="isGroup" ${it.type === 'group' ? 'checked' : ''}><i class="switch"></i></label>`}
    <div class="field"><label>Miejsce</label>
      <button type="button" class="loc-btn" data-a="move">📍 ${path.length ? esc(path.map((g) => g.name).join(' › ')) : 'Główny poziom listy'} <span>Zmień</span></button>
    </div>
    <p class="muted small">${it.createdBy ? `Dodane przez ${esc(it.createdBy)} · ${timeAgo(it.createdAt)}` : ''}${it.done && it.doneBy ? `<br>✓ ${esc(kindInfo(list.kind).done)} przez ${esc(it.doneBy)} · ${timeAgo(it.doneAt)}` : ''}</p>
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost danger" data-a="delete">${ICON.trash} Usuń</button>
      <button type="button" class="btn btn-ghost" data-a="dup">Duplikuj</button>
      <button type="submit" class="btn btn-primary">Zapisz</button>
    </div>
  </form>`;

  openSheet({
    title: isGroup ? (list.kind === 'packing' ? 'Bagaż / kieszeń' : 'Grupa') : 'Szczegóły',
    html,
    onMount(body, ctl) {
      const form = body.querySelector('form');
      const picks = { shop: it.shop || '', assignedTo: it.assignedTo || '' };
      body.querySelectorAll('.pick').forEach((pk) => pk.addEventListener('click', (e) => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        picks[pk.dataset.pick] = b.dataset.v;
        pk.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
      }));
      body.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
        const q = form.qty;
        const cur = Number(String(q.value).replace(',', '.')) || (Number(b.dataset.step) > 0 ? 1 : 0);
        const unit = form.unit.value;
        const step = ['g', 'ml'].includes(unit) ? 100 : ['kg', 'l'].includes(unit) ? 0.5 : 1;
        const next = Math.max(0, Math.round((cur + Number(b.dataset.step) * step) * 1000) / 1000);
        q.value = next ? String(next).replace('.', ',') : '';
        haptic(5);
      }));
      body.querySelector('[data-a="move"]').addEventListener('click', () => { ctl.close(); afterSheets(() => openMoveSheet(listId, [id])); });
      body.querySelector('[data-a="delete"]').addEventListener('click', () => { ctl.close(); afterSheets(() => deleteItems(listId, [id])); });
      body.querySelector('[data-a="dup"]').addEventListener('click', () => { ctl.close(); duplicateItems(listId, id); });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const patch = {
          name: form.name.value.trim() || it.name,
          emoji: form.emoji.value.trim(),
          qty: form.qty.value.trim() === '' ? null : form.qty.value,
          unit: form.unit.value,
          note: form.note.value.trim(),
          important: form.important.checked,
          assignedTo: picks.assignedTo
        };
        if (form.isGroup) patch.type = form.isGroup.checked ? 'group' : 'item';
        if (isShop && !isGroup) {
          patch.shop = picks.shop;
          patch.category = form.category.value;
          patch.price = form.price.value.trim() === '' ? null : form.price.value;
        }
        dispatch({ t: 'item.update', listId, id, patch });
        ctl.close();
      });
    }
  });
}

// Przenoszenie do innego bagażu / kieszeni
export function openMoveSheet(listId, ids) {
  const items = store.view.items[listId] || {};
  const tree = buildTree(items);
  const blocked = new Set();
  for (const id of ids) { blocked.add(id); for (const d of tree.descendants(id)) blocked.add(d.id); }
  const current = items[ids[0]] ? items[ids[0]].parentId || '' : '';
  const rows = [];
  const walk = (pid, depth) => {
    for (const it of tree.kids(pid)) {
      if (blocked.has(it.id)) continue;
      const isG = tree.kids(it.id).length > 0 || it.type === 'group';
      if (!isG) continue;
      rows.push(`<button type="button" class="move-row ${current === it.id ? 'on' : ''}" data-to="${it.id}" style="--d:${depth}">${esc(itemEmoji(it) || '📁')} ${esc(it.name)}</button>`);
      walk(it.id, depth + 1);
    }
  };
  walk(null, 1);
  const name = items[ids[0]] ? items[ids[0]].name : '';
  openSheet({
    title: `Przenieś „${esc(name)}”`,
    html: `<div class="move-list"><button type="button" class="move-row ${!current ? 'on' : ''}" data-to="" style="--d:0">🏠 Główny poziom listy</button>${rows.join('')}</div>
      ${rows.length ? '' : '<p class="muted small">Nie ma jeszcze żadnych bagaży ani grup. Utwórz je przyciskiem 📁 w pasku dodawania albo dopisując „:” na końcu nazwy.</p>'}
      <button type="button" class="btn btn-ghost wide" data-new>📁 Nowy bagaż / grupa…</button>`,
    onMount(body, ctl) {
      body.addEventListener('click', async (e) => {
        if (e.target.closest('[data-new]')) {
          ctl.close();
          const nm = await promptSheet({ title: 'Nowy bagaż / grupa', placeholder: 'np. Mała kieszeń', ok: 'Utwórz i przenieś' });
          if (!nm) return;
          const gid = uid();
          dispatch({ t: 'item.add', listId, items: [{ id: gid, type: 'group', name: nm, parentId: null }] });
          for (const id of ids) dispatch({ t: 'item.move', listId, id, parentId: gid });
          toast(`Przeniesiono do „${nm}”`);
          return;
        }
        const b = e.target.closest('[data-to]');
        if (!b) return;
        const to = b.dataset.to || null;
        for (const id of ids) dispatch({ t: 'item.move', listId, id, parentId: to });
        const p = prefs.list(listId);
        if (to && p.collapsed[to]) { p.collapsed[to] = false; prefs.setList(listId, { collapsed: p.collapsed }); }
        ctl.close();
        ui.highlight = ids[0];
        toast(to ? `Przeniesiono do „${items[to].name}”` : 'Przeniesiono na główny poziom');
      });
    }
  });
}

// ---------------------------------------------------------------------
// Tryb pisania (konspekt)
// ---------------------------------------------------------------------

export function openTextEditor(listId) {
  const list = store.view.lists[listId];
  const items = store.view.items[listId] || {};
  const initial = serializeOutline(items);
  const example = list.kind === 'packing'
    ? 'Plecak:\n  Mała kieszeń:\n    Ładowarka\n    Słuchawki\n  Duża komora:\n    2x Koszulka\nPrzy sobie:\n  Telefon'
    : list.kind === 'shopping' ? '2 l Mleko\nChleb @Lidl\n1 kg Ziemniaki #warzywa\nKawa (ziarnista) !' : 'Zadzwonić do mechanika\nZakupy:\n  Mleko\n  Chleb';
  openSheet({
    title: '✍️ Pisz tekstem',
    full: true,
    className: 'text-sheet',
    html: `<div class="te-tools">
        <button type="button" class="chip sm" data-te="out" aria-label="Zmniejsz wcięcie">⇤ Wyciągnij</button>
        <button type="button" class="chip sm" data-te="in" aria-label="Zwiększ wcięcie">⇥ Do środka</button>
        <button type="button" class="chip sm" data-te="group">📁 Bagaż „:”</button>
        <button type="button" class="chip sm" data-te="check">☑ Odhacz</button>
        <button type="button" class="chip sm" data-te="help">❔ Pomoc</button>
      </div>
      <div class="te-help" hidden>
        <p><b>Każda linijka</b> to jedna pozycja. <b>Wcięcie</b> (2 spacje albo przycisk ⇥) wkłada ją do pozycji powyżej — tak budujesz <b>bagaż → kieszeń → rzeczy</b>.</p>
        <p><b>Dwukropek na końcu</b> („Plecak:”) tworzy bagaż/grupę. <b>[x]</b> na początku = odhaczone.</p>
        <p>Skróty: <code>2x</code>, <code>2 kg</code>, <code>500 g</code> — ilość · <code>@Lidl</code> — sklep · <code>#nabiał</code> — kategoria · <code>(notatka)</code> · <code>!</code> — ważne.</p>
        <p class="muted">Odhaczenia, ceny i przypisania istniejących pozycji zostaną zachowane.</p>
      </div>
      <textarea class="input te" spellcheck="false" autocapitalize="sentences" placeholder="${esc(example)}">${esc(initial)}</textarea>
      <div class="sheet-actions sticky"><button type="button" class="btn btn-ghost" data-te="cancel">Anuluj</button><button type="button" class="btn btn-primary" data-te="save">Zapisz listę</button></div>`,
    onMount(body, ctl) {
      const ta = body.querySelector('textarea');
      setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 120);
      body.addEventListener('pointerdown', (e) => { if (e.target.closest('[data-te]') && document.activeElement === ta) e.preventDefault(); });
      body.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-te]');
        if (!b) return;
        const a = b.dataset.te;
        if (a === 'help') { body.querySelector('.te-help').hidden = !body.querySelector('.te-help').hidden; return; }
        if (a === 'cancel') { ctl.close(); return; }
        if (a === 'save') {
          const text = ta.value;
          if (!text.trim() && Object.keys(store.view.items[listId] || {}).length) {
            const ok = await confirmSheet({ title: 'Wyczyścić listę?', text: 'Tekst jest pusty — wszystkie pozycje zostaną usunięte.', ok: 'Wyczyść', danger: true });
            if (!ok) return;
          }
          const nodes = parseOutline(text, store.view.meta);
          const merged = mergeOutline(store.view.items[listId] || {}, nodes, { by: store.me, autoCategory: list.kind === 'shopping' });
          for (const m of merged) if (list.kind === 'shopping' && m.type !== 'group' && !m.category) m.category = (store.view.favs[norm(m.name)] || {}).category || guessCategory(m.name);
          dispatch({ t: 'list.setItems', listId, items: merged });
          ctl.close();
          toast(`Zapisano · ${merged.length} ${plural(merged.length, 'pozycja', 'pozycje', 'pozycji')}`);
          return;
        }
        editLines(ta, a);
      });
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') { e.preventDefault(); editLines(ta, e.shiftKey ? 'out' : 'in'); }
        if (e.key === 'Enter' && !e.isComposing) {
          // nowa linijka zachowuje wcięcie (a po "Bagaż:" wchodzi poziom głębiej)
          const pos = ta.selectionStart;
          const lineStart = ta.value.lastIndexOf('\n', pos - 1) + 1;
          const line = ta.value.slice(lineStart, pos);
          const indent = line.match(/^\s*/)[0] + (/:\s*$/.test(line) ? '  ' : '');
          if (indent) { e.preventDefault(); ta.setRangeText('\n' + indent, pos, ta.selectionEnd, 'end'); }
        }
      });
    }
  });
}

function editLines(ta, action) {
  const v = ta.value;
  let s = ta.selectionStart, en = ta.selectionEnd;
  const start = v.lastIndexOf('\n', s - 1) + 1;
  let end = v.indexOf('\n', en);
  if (end < 0) end = v.length;
  const block = v.slice(start, end).split('\n');
  const out = block.map((line) => {
    if (action === 'in') return '  ' + line;
    if (action === 'out') return line.replace(/^ {1,2}|^\t/, '');
    if (action === 'group') return /:\s*$/.test(line) ? line.replace(/:\s*$/, '') : (line.trim() ? line.replace(/\s*$/, ':') : line);
    if (action === 'check') {
      const m = line.match(/^(\s*)(\[[xX ]\]\s*)?(.*)$/);
      return m[2] && /x/i.test(m[2]) ? m[1] + m[3] : m[1] + '[x] ' + m[3];
    }
    return line;
  }).join('\n');
  ta.setRangeText(out, start, end, 'preserve');
  const delta = out.length - (end - start);
  ta.setSelectionRange(Math.max(start, s + (block.length === 1 ? delta : 0)), en + delta);
  ta.focus();
}

// ---------------------------------------------------------------------
// Menu listy, udostępnianie, historia
// ---------------------------------------------------------------------

export function listAsText(listId) {
  const list = store.view.lists[listId];
  const tree = buildTree(store.view.items[listId] || {});
  const lines = [`${list.icon} ${list.name}`];
  const walk = (pid, depth) => {
    for (const it of tree.kids(pid)) {
      const kids = tree.kids(it.id).length;
      const done = tree.isDone(it.id);
      lines.push('   '.repeat(depth) + (kids ? `${done ? '✅' : '▫️'} ${it.name}:` : `${done ? '☑' : '☐'} ${formatLine({ ...it, shop: list.kind === 'shopping' ? it.shop : '', category: '' })}`));
      walk(it.id, depth + 1);
    }
  };
  walk(null, 0);
  return lines.join('\n');
}

function shareList(listId) {
  const list = store.view.lists[listId];
  shareText(list.name, listAsText(listId));
}

function openListMenu(listId) {
  const list = store.view.lists[listId];
  const extra = [
    { icon: '✍️', label: 'Pisz tekstem', hint: 'edytuj całą listę jak notatkę', onClick: () => openTextEditor(listId) },
    { icon: '🕒', label: 'Historia zmian', onClick: () => openHistory(listId) },
    { icon: '🧹', label: `Usuń ${kindInfo(list.kind).done}`, onClick: () => clearDone(listId) },
    list.kind !== 'shopping' ? { icon: '🔄', label: 'Odznacz wszystko', hint: 'zacznij pakowanie od nowa', onClick: () => resetList(listId) } : null
  ];
  actionSheet(`${list.icon} ${list.name}`, [...extra, { sep: true }, ...listMenuActions(listId, { inList: true })]);
}

async function clearDone(listId) {
  const items = store.view.items[listId] || {};
  const tree = buildTree(items);
  const snap = Object.values(items).filter((it) => tree.isDone(it.id)).map((x) => ({ ...x }));
  if (!snap.length) { toast('Nie ma nic odhaczonego'); return; }
  dispatch({ t: 'list.clearDone', listId });
  toast(`Usunięto ${snap.length} ${plural(snap.length, 'pozycję', 'pozycje', 'pozycji')}`, {
    action: 'Cofnij',
    onAction: () => {
      const existing = store.view.items[listId] || {};
      dispatch({ t: 'item.add', listId, items: snap.filter((s) => !existing[s.id]) });
    }
  });
}

function openHistory(listId) {
  const hist = store.view.history[listId] || [];
  openSheet({
    title: '🕒 Historia zmian',
    html: hist.length
      ? `<ul class="history">${hist.map((h) => `<li>${avatar(h.by, 'xs')}<div><p>${esc(h.text)}</p><small>${new Date(h.ts).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div></li>`).join('')}</ul>`
      : '<p class="muted">Brak historii.</p>'
  });
}

// ---------------------------------------------------------------------
// Gesty: przesunięcie (odhacz / usuń) i przeciąganie (kolejność / bagaż)
// ---------------------------------------------------------------------

export function wireListGestures(viewEl) {
  let sw = null; // stan przesunięcia

  viewEl.addEventListener('pointerdown', (e) => {
    if (!ui.listId || location.hash.indexOf('#list/') !== 0) return;
    const handle = e.target.closest('[data-drag]');
    if (handle) { startDrag(e, handle.closest('.row'), viewEl); return; }
    const row = e.target.closest('.row');
    if (!row || e.button > 0 || e.pointerType === 'mouse') return;
    sw = { row, inner: row.querySelector('.row-in'), x0: e.clientX, y0: e.clientY, dx: 0, active: false, id: e.pointerId };
  });

  viewEl.addEventListener('pointermove', (e) => {
    if (!sw || e.pointerId !== sw.id) return;
    const dx = e.clientX - sw.x0, dy = e.clientY - sw.y0;
    if (!sw.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { sw = null; return; }
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        sw.active = true;
        sw.row.classList.add('swiping');
        try { sw.row.setPointerCapture(e.pointerId); } catch (err) { /* ignoruj */ }
      } else return;
    }
    sw.dx = Math.max(-140, Math.min(140, dx));
    sw.inner.style.transform = `translateX(${sw.dx}px)`;
    sw.row.classList.toggle('sw-right', sw.dx > 0);
    sw.row.classList.toggle('sw-left', sw.dx < 0);
    sw.row.classList.toggle('sw-armed', Math.abs(sw.dx) > 80);
  }, { passive: true });

  const end = () => {
    if (!sw) return;
    const s = sw;
    sw = null;
    if (!s.active) return;
    s.inner.style.transition = 'transform .18s ease';
    s.inner.style.transform = '';
    setTimeout(() => { s.inner.style.transition = ''; s.row.classList.remove('swiping', 'sw-right', 'sw-left', 'sw-armed'); }, 200);
    // zablokuj "click" po geście
    const block = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', block, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', block, { capture: true }), 350);
    const list = L();
    if (!list) return;
    const id = s.row.dataset.id;
    if (s.dx > 80) {
      const tree = buildTree(itemsMap());
      dispatch({ t: 'item.check', listId: list.id, ids: [id], done: !tree.isDone(id) });
      haptic(12);
    } else if (s.dx < -80) {
      deleteItems(list.id, [id]);
    }
  };
  viewEl.addEventListener('pointerup', end);
  viewEl.addEventListener('pointercancel', end);
}

function startDrag(e, row, viewEl) {
  const list = L();
  if (!list || !row) return;
  e.preventDefault();
  const rowsEl = viewEl.querySelector('#rows');
  const id = row.dataset.id;
  const items = itemsMap();
  const tree = buildTree(items);
  const sub = new Set([id, ...tree.descendants(id).map((d) => d.id)]);
  const all = [...rowsEl.querySelectorAll('.row')];
  const hiddenRows = all.filter((r) => sub.has(r.dataset.id) && r !== row);
  hiddenRows.forEach((r) => r.classList.add('drag-hidden'));
  const others = all.filter((r) => !sub.has(r.dataset.id));
  ui.dragging = true;
  row.classList.add('dragging');
  document.body.classList.add('is-dragging');
  haptic(15);

  const startY = e.clientY;
  const scroll0 = window.scrollY;
  const indicator = document.createElement('div');
  indicator.className = 'drop-line';
  rowsEl.appendChild(indicator);
  let target = null; // { mode:'before'|'into'|'end', row }
  let scrollRAF = null;
  let lastY = e.clientY;

  const compute = (y) => {
    others.forEach((r) => r.classList.remove('drop-into'));
    indicator.style.display = 'none';
    target = null;
    for (const r of others) {
      const rc = r.getBoundingClientRect();
      if (y < rc.top || y > rc.bottom) {
        if (y < rc.top) { target = { mode: 'before', row: r }; break; }
        continue;
      }
      const rel = (y - rc.top) / rc.height;
      if (r.classList.contains('group') && rel > 0.28 && rel < 0.72) { target = { mode: 'into', row: r }; break; }
      if (rel <= 0.5) { target = { mode: 'before', row: r }; break; }
      const idx = others.indexOf(r);
      target = idx + 1 < others.length ? { mode: 'before', row: others[idx + 1] } : { mode: 'end', row: r };
      break;
    }
    if (!target && others.length) target = { mode: 'end', row: others[others.length - 1] };
    if (!target) return;
    const base = rowsEl.getBoundingClientRect();
    if (target.mode === 'into') { target.row.classList.add('drop-into'); return; }
    const rc = target.row.getBoundingClientRect();
    const top = target.mode === 'end' ? rc.bottom : rc.top;
    const depth = Number(getComputedStyle(target.row).getPropertyValue('--d')) || 0;
    indicator.style.display = 'block';
    indicator.style.top = (top - base.top - 1) + 'px';
    indicator.style.left = (14 + Math.min(depth, 5) * 18) + 'px';
  };

  const autoScroll = () => {
    const edge = 80;
    const vh = window.innerHeight;
    let v = 0;
    if (lastY < edge + 60) v = -Math.ceil((edge + 60 - lastY) / 6);
    else if (lastY > vh - edge - 90) v = Math.ceil((lastY - (vh - edge - 90)) / 6);
    if (v) { window.scrollBy(0, v); move({ clientY: lastY, fromScroll: true }); }
    scrollRAF = requestAnimationFrame(autoScroll);
  };

  const move = (ev) => {
    lastY = ev.clientY;
    row.style.setProperty('--dy', `${ev.clientY - startY + (window.scrollY - scroll0)}px`);
    compute(ev.clientY);
  };
  const onMove = (ev) => { ev.preventDefault(); move(ev); };
  const finish = (cancel) => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    cancelAnimationFrame(scrollRAF);
    indicator.remove();
    others.forEach((r) => r.classList.remove('drop-into'));
    hiddenRows.forEach((r) => r.classList.remove('drag-hidden'));
    row.classList.remove('dragging');
    row.style.removeProperty('--dy');
    document.body.classList.remove('is-dragging');
    ui.dragging = false;
    if (!cancel && target) applyDrop(list.id, id, target, tree);
    store.notify();
  };
  const onUp = () => finish(false);
  const onCancel = () => finish(true);
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  scrollRAF = requestAnimationFrame(autoScroll);
}

function applyDrop(listId, id, target, tree) {
  const tid = target.row.dataset.id;
  const t = tree.byId.get(tid);
  if (!t) return;
  if (target.mode === 'into') {
    if (tid === id) return;
    dispatch({ t: 'item.move', listId, id, parentId: tid });
    const p = prefs.list(listId);
    if (p.collapsed[tid]) { p.collapsed[tid] = false; prefs.setList(listId, { collapsed: p.collapsed }); }
    haptic(12);
    return;
  }
  if (target.mode === 'end') {
    const parentId = ui.zoomId || null;
    const siblings = tree.kids(parentId).filter((s) => s.id !== id);
    const last = siblings[siblings.length - 1];
    dispatch({ t: 'item.move', listId, id, parentId, order: (last ? (last.order ?? 0) : 0) + 1 });
    return;
  }
  const parentId = t.parentId && tree.byId.has(t.parentId) ? t.parentId : null;
  const siblings = tree.kids(parentId).filter((s) => s.id !== id);
  const idx = siblings.findIndex((s) => s.id === tid);
  const prev = siblings[idx - 1];
  const tOrder = t.order ?? 0;
  const order = prev ? ((prev.order ?? 0) + tOrder) / 2 : tOrder - 1;
  const cur = tree.byId.get(id);
  if (cur && (cur.parentId || null) === parentId && siblings[idx - 1] && siblings[idx - 1].id === id) return;
  dispatch({ t: 'item.move', listId, id, parentId, order });
}

// ---------------------------------------------------------------------
// Blokada wygaszania ekranu (tryb sklepu / pakowania)
// ---------------------------------------------------------------------

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !ui.wakeLock) {
      ui.wakeLock = await navigator.wakeLock.request('screen');
      ui.wakeLock.addEventListener('release', () => { ui.wakeLock = null; });
    }
  } catch (e) { /* brak wsparcia lub odmowa */ }
}

function releaseWakeLock() {
  if (ui.wakeLock) { ui.wakeLock.release().catch(() => {}); ui.wakeLock = null; }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ui.listId && location.hash.startsWith('#list/')) {
    const p = prefs.list(ui.listId);
    if (p.big) requestWakeLock();
  }
});

export function leaveList() {
  releaseWakeLock();
  hideDock();
}

export function onEnterList(listId) {
  const p = prefs.list(listId);
  if (p.big) requestWakeLock();
}

export { KINDS };
