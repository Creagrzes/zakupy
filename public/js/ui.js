// =====================================================================
// UI: łatanie DOM, arkusze (bottom sheets), toasty, drobne pomocnicze
// =====================================================================

export function esc(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function haptic(ms = 10) {
  if (document.documentElement.dataset.haptics === 'off') return;
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* brak wsparcia */ }
}

export function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'przed chwilą';
  if (min < 60) return min + ' min temu';
  const h = Math.floor(min / 60);
  if (h < 24) return h + ' godz. temu';
  const d = Math.floor(h / 24);
  if (d === 1) return 'wczoraj';
  if (d < 7) return d + ' dni temu';
  return new Date(ts).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}

export function dueLabel(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const due = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((due - today) / 86400000);
  let text;
  if (days === 0) text = 'dziś';
  else if (days === 1) text = 'jutro';
  else if (days === -1) text = 'wczoraj';
  else if (days > 1 && days < 14) text = 'za ' + days + ' dni';
  else if (days < -1) text = Math.abs(days) + ' dni temu';
  else text = due.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
  return { text, days, urgent: days >= 0 && days <= 2, past: days < 0 };
}

export function money(n) {
  return (Number(n) || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
}

export function plural(n, one, few, many) {
  const n10 = n % 10, n100 = n % 100;
  if (n === 1) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

export const ICON = {
  back: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  more: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  drag: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
  folder: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  pen: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  send: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  share: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="m16 6-4-4-4 4M12 2v13"/></svg>'
};

// ---------------------------------------------------------------------
// morph — łata istniejący DOM do nowego HTML, zamiast podmieniać wszystko.
// Dzięki temu nie gubimy fokusu, przewinięcia ani animacji. Elementy
// z atrybutem data-key są dopasowywane po kluczu.
// ---------------------------------------------------------------------

function keyOf(n) { return n.nodeType === 1 ? n.getAttribute('data-key') : null; }

function sameKind(a, b) {
  return a.nodeType === b.nodeType && (a.nodeType !== 1 || a.tagName === b.tagName);
}

function patchAttrs(from, to) {
  const toAttrs = to.attributes;
  for (let i = 0; i < toAttrs.length; i++) {
    const { name, value } = toAttrs[i];
    if (from.getAttribute(name) !== value) from.setAttribute(name, value);
  }
  const fromAttrs = from.attributes;
  for (let i = fromAttrs.length - 1; i >= 0; i--) {
    const { name } = fromAttrs[i];
    if (!to.hasAttribute(name)) from.removeAttribute(name);
  }
}

function patchNode(from, to) {
  if (from.nodeType !== 1) {
    if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
    return;
  }
  if (from.hasAttribute('data-morph-skip')) return;
  const focused = document.activeElement === from;
  patchAttrs(from, to);
  const tag = from.tagName;
  if (tag === 'INPUT') {
    if (!focused && from.type !== 'file') {
      const v = to.getAttribute('value') ?? '';
      if (from.type === 'checkbox' || from.type === 'radio') from.checked = to.hasAttribute('checked');
      else if (from.value !== v) from.value = v;
    }
    return;
  }
  if (tag === 'TEXTAREA') {
    if (!focused && from.value !== to.value) from.value = to.value;
    return;
  }
  if (tag === 'SELECT') {
    patchChildren(from, to);
    if (!focused) {
      const sel = to.querySelector('option[selected]');
      const v = sel ? sel.value : (to.options[0] ? to.options[0].value : '');
      if (from.value !== v) from.value = v;
    }
    return;
  }
  patchChildren(from, to);
}

function patchChildren(parent, next) {
  const keyed = new Map();
  for (let n = parent.firstChild; n; n = n.nextSibling) {
    const k = keyOf(n);
    if (k) keyed.set(k, n);
  }
  let cursor = parent.firstChild;
  const incoming = [...next.childNodes];
  for (const nn of incoming) {
    const k = keyOf(nn);
    let match = null;
    if (k) {
      match = keyed.get(k) || null;
      if (match && !sameKind(match, nn)) match = null;
      if (match) keyed.delete(k);
    } else if (cursor && !keyOf(cursor) && sameKind(cursor, nn)) {
      match = cursor;
    }
    if (match) {
      if (match === cursor) cursor = cursor.nextSibling;
      else parent.insertBefore(match, cursor);
      patchNode(match, nn);
    } else {
      parent.insertBefore(nn, cursor);
    }
  }
  while (cursor) {
    const nx = cursor.nextSibling;
    parent.removeChild(cursor);
    cursor = nx;
  }
}

export function morph(el, html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  patchChildren(el, tpl.content);
}

// ---------------------------------------------------------------------
// Toasty
// ---------------------------------------------------------------------

export function toast(text, opts = {}) {
  const stack = document.getElementById('toasts');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = 'toast' + (opts.kind ? ' toast-' + opts.kind : '');
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="toast-text">${esc(text)}</span>${opts.action ? `<button type="button" class="toast-btn">${esc(opts.action)}</button>` : ''}`;
  stack.appendChild(el);
  while (stack.children.length > 2) stack.firstChild.remove();
  const remove = () => { el.classList.add('out'); setTimeout(() => el.remove(), 220); };
  const timer = setTimeout(remove, opts.duration || (opts.action ? 5500 : 3200));
  if (opts.action) {
    el.querySelector('.toast-btn').addEventListener('click', () => { clearTimeout(timer); remove(); opts.onAction && opts.onAction(); });
  }
  el.addEventListener('click', (e) => { if (!e.target.closest('.toast-btn')) { clearTimeout(timer); remove(); } });
}

// ---------------------------------------------------------------------
// Arkusze (bottom sheets) — zamykane gestem, tłem, Esc i przyciskiem Wstecz
// ---------------------------------------------------------------------

const sheetStack = [];
let ignorePop = 0;
let ignoreTimer = null;
const afterQueue = [];

function flushAfter() {
  ignorePop = 0;
  clearTimeout(ignoreTimer);
  const q = afterQueue.splice(0);
  for (const fn of q) fn();
}

// Uruchamia fn, gdy zakończy się cofanie historii po zamknięciu arkusza
// (inaczej nawigacja lub nowy arkusz zostałyby od razu "cofnięte").
export function afterSheets(fn) {
  if (ignorePop > 0) afterQueue.push(fn); else fn();
}

function goBackSilently() {
  ignorePop++;
  clearTimeout(ignoreTimer);
  ignoreTimer = setTimeout(flushAfter, 500);
  history.back();
}

window.addEventListener('popstate', (e) => {
  if (ignorePop > 0) {
    ignorePop--;
    if (!ignorePop) flushAfter();
    e.stopImmediatePropagation();
    return;
  }
  const top = sheetStack[sheetStack.length - 1];
  if (top) { top.close(true); e.stopImmediatePropagation(); }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetStack.length) sheetStack[sheetStack.length - 1].close();
});

export function sheetOpen() { return sheetStack.length > 0; }

export function openSheet({ title = '', html = '', onMount, onClose, full = false, className = '' }) {
  const root = document.getElementById('sheets');
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="sheet-backdrop"></div>
    <section class="sheet ${full ? 'sheet-full' : ''} ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grip" aria-hidden="true"><span></span></div>
      ${title ? `<header class="sheet-head"><h2>${title}</h2><button type="button" class="icon-btn sheet-x" aria-label="Zamknij">${ICON.close}</button></header>` : ''}
      <div class="sheet-body">${html}</div>
    </section>`;
  root.appendChild(wrap);
  const sheet = wrap.querySelector('.sheet');
  const prevFocus = document.activeElement;

  let closed = false;
  let pushed = false;
  let cancelled = false;
  const ctl = {
    el: sheet,
    body: wrap.querySelector('.sheet-body'),
    close(fromPop) {
      if (closed) return;
      closed = true;
      const i = sheetStack.indexOf(ctl);
      if (i >= 0) sheetStack.splice(i, 1);
      if (!fromPop && pushed) goBackSilently();
      cancelled = true;
      wrap.classList.add('closing');
      setTimeout(() => wrap.remove(), 230);
      document.body.classList.toggle('has-sheet', sheetStack.length > 0);
      if (onClose) onClose();
      if (prevFocus && prevFocus.focus && document.contains(prevFocus) && !sheetStack.length) {
        try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignoruj */ }
      }
    }
  };
  sheetStack.push(ctl);
  afterSheets(() => { if (!cancelled) { history.pushState({ sheet: true }, ''); pushed = true; } });
  document.body.classList.add('has-sheet');
  requestAnimationFrame(() => wrap.classList.add('open'));

  wrap.querySelector('.sheet-backdrop').addEventListener('click', () => ctl.close());
  const x = wrap.querySelector('.sheet-x');
  if (x) x.addEventListener('click', () => ctl.close());

  // przeciągnięcie w dół zamyka arkusz
  const grip = wrap.querySelector('.sheet-grip');
  const head = wrap.querySelector('.sheet-head');
  let startY = null, dy = 0;
  const onDown = (e) => { startY = e.clientY; dy = 0; sheet.style.transition = 'none'; (e.currentTarget).setPointerCapture(e.pointerId); };
  const onMove = (e) => { if (startY === null) return; dy = Math.max(0, e.clientY - startY); sheet.style.transform = `translateY(${dy}px)`; };
  const onUp = () => {
    if (startY === null) return;
    startY = null; sheet.style.transition = ''; sheet.style.transform = '';
    if (dy > 90) ctl.close();
  };
  for (const h of [grip, head].filter(Boolean)) {
    h.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; onDown(e); });
    h.addEventListener('pointermove', onMove);
    h.addEventListener('pointerup', onUp);
    h.addEventListener('pointercancel', onUp);
  }

  if (onMount) onMount(ctl.body, ctl);
  return ctl;
}

export function closeAllSheets() {
  while (sheetStack.length) sheetStack[sheetStack.length - 1].close();
}

// Menu akcji: [{ label, icon, danger, onClick, hint }]
export function actionSheet(title, actions) {
  const html = `<div class="action-list">${actions.filter(Boolean).map((a, i) => a.sep
    ? '<div class="action-sep"></div>'
    : `<button type="button" class="action-row${a.danger ? ' danger' : ''}" data-i="${i}"><span class="action-ico">${a.icon || ''}</span><span class="action-label">${esc(a.label)}${a.hint ? `<small>${esc(a.hint)}</small>` : ''}</span></button>`).join('')}</div>`;
  const list = actions.filter(Boolean);
  return openSheet({
    title: esc(title), html,
    onMount(body, ctl) {
      body.addEventListener('click', (e) => {
        const b = e.target.closest('.action-row');
        if (!b) return;
        const a = list[Number(b.dataset.i)];
        ctl.close();
        afterSheets(() => a.onClick && a.onClick());
      });
    }
  });
}

export function confirmSheet({ title, text = '', ok = 'OK', danger = false, cancel = 'Anuluj' }) {
  return new Promise((resolve) => {
    let answered = false;
    openSheet({
      title: esc(title),
      html: `${text ? `<p class="sheet-text">${esc(text)}</p>` : ''}<div class="sheet-actions"><button type="button" class="btn btn-ghost" data-r="0">${esc(cancel)}</button><button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-r="1">${esc(ok)}</button></div>`,
      onMount(body, ctl) {
        body.addEventListener('click', (e) => {
          const b = e.target.closest('[data-r]');
          if (!b) return;
          answered = true;
          ctl.close();
          resolve(b.dataset.r === '1');
        });
      },
      onClose() { if (!answered) resolve(false); }
    });
  });
}

export function promptSheet({ title, value = '', placeholder = '', ok = 'Zapisz', multiline = false, maxLength = 80 }) {
  return new Promise((resolve) => {
    let done = false;
    openSheet({
      title: esc(title),
      html: `<form class="prompt-form">${multiline
        ? `<textarea class="input" rows="5" maxlength="${maxLength}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
        : `<input class="input" maxlength="${maxLength}" placeholder="${esc(placeholder)}" value="${esc(value)}" enterkeyhint="done">`}
        <div class="sheet-actions"><button type="button" class="btn btn-ghost" data-cancel>Anuluj</button><button type="submit" class="btn btn-primary">${esc(ok)}</button></div></form>`,
      onMount(body, ctl) {
        const input = body.querySelector('.input');
        setTimeout(() => { input.focus(); if (input.select) input.select(); }, 60);
        body.querySelector('[data-cancel]').onclick = () => ctl.close();
        body.querySelector('form').addEventListener('submit', (e) => {
          e.preventDefault();
          done = true;
          ctl.close();
          resolve(input.value.trim());
        });
      },
      onClose() { if (!done) resolve(null); }
    });
  });
}

// Automatyczne dopasowanie wysokości pola tekstowego
export function autoGrow(ta) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, window.innerHeight * 0.7) + 'px'; };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
}

export async function shareText(title, text) {
  try {
    if (navigator.share) { await navigator.share({ title, text }); return; }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Skopiowano do schowka');
  } catch (e) {
    openSheet({ title: 'Skopiuj tekst', html: `<textarea class="input" rows="10" readonly>${esc(text)}</textarea>` });
  }
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
