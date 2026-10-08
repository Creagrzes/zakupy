// =====================================================================
// Notatnik: szybkie notatki, które jednym ruchem zamieniasz w listę
// =====================================================================

import { store } from '../store.js';
import { parseOutline, mergeOutline, guessCategory, norm, uid, KINDS, NOTE_COLORS } from '../core.js';
import { esc, morph, toast, openSheet, actionSheet, confirmSheet, timeAgo, ICON, plural, shareText } from '../ui.js';
import { go, dispatch, kindInfo } from '../ctx.js';

export function renderNotes(viewEl, setTop) {
  setTop({ title: 'Notatnik', eyebrow: 'pomysły, przepisy, zapiski' });
  const notes = Object.values(store.view.notes).sort((a, b) => (b.pinned - a.pinned) || b.updatedAt - a.updatedAt);
  let html = '';
  if (!notes.length) {
    html = `<div class="empty" data-key="empty"><div class="empty-ico">🗒️</div><p>Brak notatek.</p><p class="muted">Zapisz przepis, pomysł na prezent albo listę rzeczy „na kiedyś” — a potem jednym dotknięciem zrób z niej listę zakupów lub pakowania.</p><button type="button" class="btn btn-primary" data-act="n-new">${ICON.plus} Nowa notatka</button></div>`;
  } else {
    html = `<div class="notes-grid" data-key="grid">${notes.map((n) => {
      const lines = n.body.split('\n').filter((l) => l.trim()).slice(0, 6);
      return `<article class="note-card" data-key="n:${n.id}" data-act="n-open" data-id="${n.id}" style="${n.color ? `--note:${n.color}` : ''}">
        ${n.pinned ? '<span class="pin">📌</span>' : ''}
        <h3>${esc(n.title || lines[0] || 'Bez tytułu')}</h3>
        <p>${esc((n.title ? lines : lines.slice(1)).join('\n'))}</p>
        <small>${timeAgo(n.updatedAt)}${n.updatedBy ? ' · ' + esc(n.updatedBy) : ''}</small>
      </article>`;
    }).join('')}</div>`;
  }
  html += `<button type="button" class="fab" data-act="n-new" data-key="fab" aria-label="Nowa notatka">${ICON.plus}<span>Notatka</span></button>`;
  morph(viewEl, html);
}

export function handleNotesClick(e, el) {
  switch (el.dataset.act) {
    case 'n-open': go('#note/' + el.dataset.id); break;
    case 'n-new': {
      const id = uid();
      dispatch({ t: 'note.save', note: { id, title: '', body: '' } });
      go('#note/' + id);
      break;
    }
  }
}

// ---------------------------------------------------------------------
// Edytor notatki
// ---------------------------------------------------------------------

let saveTimer = null;
let editing = null;

function flushNote() {
  if (!editing) return;
  clearTimeout(saveTimer);
  const { id, title, body } = editing;
  const n = store.view.notes[id];
  const t = title.value, b = body.value;
  if (n && (n.title !== t || n.body !== b)) dispatch({ t: 'note.update', id, patch: { title: t, body: b } });
}

export function leaveNote() {
  flushNote();
  const ed = editing;
  editing = null;
  if (ed) {
    const n = store.view.notes[ed.id];
    if (n && !n.title.trim() && !n.body.trim()) dispatch({ t: 'note.delete', id: ed.id });
  }
}

window.addEventListener('pagehide', flushNote);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNote(); });

export function renderNote(viewEl, id, setTop) {
  const n = store.view.notes[id];
  if (!n) {
    setTop({ title: 'Notatka', back: true });
    morph(viewEl, `<div class="empty"><p>Ta notatka nie istnieje.</p></div>`);
    return;
  }
  setTop({
    title: n.title || 'Notatka', eyebrow: `zmieniono ${timeAgo(n.updatedAt)}${n.updatedBy ? ' · ' + n.updatedBy : ''}`, back: true,
    actions: [{ act: 'n-tolist', icon: '<span class="ti">📋</span>', label: 'Zrób listę' }, { act: 'n-menu', icon: ICON.more, label: 'Więcej' }]
  });
  morph(viewEl, `<div class="note-editor" data-key="ne:${id}" style="${n.color ? `--note:${n.color}` : ''}">
    <input class="note-title" name="title" placeholder="Tytuł" maxlength="80" value="${esc(n.title)}">
    <textarea class="note-body" name="body" placeholder="Pisz… Każda linijka może potem stać się pozycją na liście.">${esc(n.body)}</textarea>
  </div>`);
  const title = viewEl.querySelector('.note-title');
  const body = viewEl.querySelector('.note-body');
  if (!editing || editing.id !== id || editing.title !== title) {
    editing = { id, title, body };
    const schedule = () => { clearTimeout(saveTimer); saveTimer = setTimeout(flushNote, 600); };
    title.addEventListener('input', schedule);
    body.addEventListener('input', () => { schedule(); fit(body); });
    title.addEventListener('blur', flushNote);
    body.addEventListener('blur', flushNote);
    if (!n.title && !n.body) setTimeout(() => body.focus(), 80);
  }
  fit(body);
}

function fit(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.max(ta.scrollHeight, window.innerHeight * 0.55) + 'px';
}

export function handleNoteClick(e, el, id) {
  flushNote();
  const n = store.view.notes[id];
  if (!n) return;
  if (el.dataset.act === 'n-tolist') { openNoteToList(n); return; }
  if (el.dataset.act === 'n-menu') {
    actionSheet(n.title || 'Notatka', [
      { icon: '📋', label: 'Zrób z notatki listę', onClick: () => openNoteToList(n) },
      { icon: '➕', label: 'Dopisz linijki do istniejącej listy', onClick: () => openAppendToList(n) },
      { icon: '📌', label: n.pinned ? 'Odepnij' : 'Przypnij', onClick: () => dispatch({ t: 'note.update', id: n.id, patch: { pinned: !n.pinned } }) },
      { icon: '🎨', label: 'Kolor', onClick: () => openColor(n) },
      { icon: '📤', label: 'Udostępnij', onClick: () => shareText(n.title || 'Notatka', (n.title ? n.title + '\n\n' : '') + n.body) },
      { sep: true },
      { icon: '🗑️', label: 'Usuń notatkę', danger: true, onClick: async () => {
        if (await confirmSheet({ title: 'Usunąć notatkę?', ok: 'Usuń', danger: true })) {
          const snap = { ...n };
          editing = null;
          dispatch({ t: 'note.delete', id: n.id });
          go('#notes');
          toast('Usunięto notatkę', { action: 'Cofnij', onAction: () => dispatch({ t: 'note.save', note: snap }) });
        }
      } }
    ]);
  }
}

function openColor(n) {
  openSheet({
    title: 'Kolor notatki',
    html: `<div class="color-pick notes">${NOTE_COLORS.map((c) => `<button type="button" class="${c === n.color ? 'on' : ''}" data-c="${c}" style="--c:${c || 'var(--card)'}" aria-label="${c || 'Domyślny'}"></button>`).join('')}</div>`,
    onMount(body, ctl) {
      body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-c]');
        if (!b) return;
        dispatch({ t: 'note.update', id: n.id, patch: { color: b.dataset.c } });
        ctl.close();
      });
    }
  });
}

function noteItems(n, kind) {
  const nodes = parseOutline(n.body, store.view.meta);
  const items = mergeOutline({}, nodes, { by: store.me });
  if (kind === 'shopping') for (const it of items) if (it.type !== 'group' && !it.category) it.category = (store.view.favs[norm(it.name)] || {}).category || guessCategory(it.name);
  return items;
}

function openNoteToList(n) {
  if (!n.body.trim()) { toast('Notatka jest pusta'); return; }
  openSheet({
    title: 'Zrób listę z notatki',
    html: `<p class="sheet-text">Każda linijka stanie się pozycją. Wcięcia i „:” na końcu tworzą bagaże i grupy.</p>
      <div class="action-list">${Object.entries(KINDS).map(([k, v]) => `<button type="button" class="action-row" data-k="${k}"><span class="action-ico">${v.icon}</span><span class="action-label">${v.label}<small>${noteItems(n, k).length} pozycji</small></span></button>`).join('')}</div>`,
    onMount(body, ctl) {
      body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]');
        if (!b) return;
        const kind = b.dataset.k;
        const id = uid();
        dispatch({ t: 'list.create', list: { id, name: n.title || n.body.split('\n')[0].slice(0, 60) || 'Lista z notatki', kind, icon: KINDS[kind].icon }, items: noteItems(n, kind) });
        ctl.close();
        go('#list/' + id);
        toast('Utworzono listę z notatki');
      });
    }
  });
}

function openAppendToList(n) {
  const lists = Object.values(store.view.lists).filter((l) => !l.archived).sort((a, b) => b.updatedAt - a.updatedAt);
  if (!lists.length) { openNoteToList(n); return; }
  openSheet({
    title: 'Dopisz do listy',
    html: `<div class="action-list">${lists.map((l) => `<button type="button" class="action-row" data-l="${l.id}"><span class="action-ico">${esc(l.icon)}</span><span class="action-label">${esc(l.name)}<small>${esc(kindInfo(l.kind).label)}</small></span></button>`).join('')}</div>`,
    onMount(body, ctl) {
      body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-l]');
        if (!b) return;
        const l = store.view.lists[b.dataset.l];
        const items = noteItems(n, l.kind);
        for (const it of items) delete it.order;
        dispatch({ t: 'item.add', listId: l.id, items });
        ctl.close();
        toast(`Dopisano ${items.length} ${plural(items.length, 'pozycję', 'pozycje', 'pozycji')} do „${l.name}”`, { action: 'Otwórz', onAction: () => go('#list/' + l.id) });
      });
    }
  });
}
