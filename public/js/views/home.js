// =====================================================================
// Ekran główny: listy, tworzenie/edycja listy, menu listy, archiwum
// =====================================================================

import { store } from '../store.js';
import { buildTree, listSummary, cloneItems, uid, KINDS, LIST_ICONS, LIST_COLORS, BUILTIN_TEMPLATES, builtinTemplateItems } from '../core.js';
import { esc, morph, toast, openSheet, actionSheet, confirmSheet, promptSheet, timeAgo, dueLabel, ICON, plural, shareText } from '../ui.js';
import { prefs, go, dispatch, kindInfo, avatar } from '../ctx.js';

function activeLists() {
  return Object.values(store.view.lists).filter((l) => !l.archived)
    .sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
}

export function renderHome(viewEl, setTop) {
  const filter = prefs.get('homeKind', 'all');
  const all = activeLists();
  const counts = { all: all.length, shopping: 0, packing: 0, todo: 0 };
  for (const l of all) counts[l.kind] = (counts[l.kind] || 0) + 1;
  const lists = filter === 'all' ? all : all.filter((l) => l.kind === filter);
  const hour = new Date().getHours();
  const hello = hour < 5 ? 'Dobranoc' : hour < 12 ? 'Dzień dobry' : hour < 18 ? 'Cześć' : 'Dobry wieczór';
  setTop({ title: 'Twoje listy', eyebrow: `${hello}${store.me ? ', ' + store.me : ''}`, actions: [{ act: 'search', icon: ICON.search, label: 'Szukaj' }] });

  const others = [...new Set(store.online.filter((o) => o.name && o.name !== store.me).map((o) => o.name))];
  let html = '';
  if (others.length) html += `<p class="online-bar" data-key="online">${others.map((n) => avatar(n, 'sm')).join('')} <span>${esc(others.join(', '))} ${others.length === 1 ? 'jest' : 'są'} teraz w aplikacji</span></p>`;

  html += `<div class="seg" role="tablist" data-key="seg">
    ${[['all', 'Wszystkie'], ['shopping', '🛒 Zakupy'], ['packing', '🎒 Pakowanie'], ['todo', '✅ Zadania']].map(([k, label]) =>
      `<button type="button" role="tab" class="${filter === k ? 'on' : ''}" data-act="kind" data-kind="${k}">${label}${counts[k] ? ` <b>${counts[k]}</b>` : ''}</button>`).join('')}
  </div>`;

  if (!store.synced && !store.hasData) {
    html += `<div class="skeleton" data-key="sk">${'<div class="sk-card"></div>'.repeat(3)}</div>`;
  } else if (!lists.length) {
    const k = filter === 'all' ? null : KINDS[filter];
    const suggestions = BUILTIN_TEMPLATES.filter((t) => filter === 'all' || t.kind === filter).slice(0, 4);
    html += `<div class="empty" data-key="empty">
      <div class="empty-ico">${k ? k.icon : '📋'}</div>
      <p>${k ? `Nie masz jeszcze list typu „${k.label}”.` : 'Nie masz jeszcze żadnych list.'}</p>
      <button type="button" class="btn btn-primary" data-act="new-list">${ICON.plus} Nowa lista</button>
      ${suggestions.length ? `<p class="muted small">albo zacznij od gotowca:</p><div class="tpl-quick">${suggestions.map((t) => `<button type="button" class="chip" data-act="use-builtin" data-id="${t.id}">${t.icon} ${esc(t.name)}</button>`).join('')}</div>` : ''}
    </div>`;
  } else {
    const pinned = lists.filter((l) => l.pinned);
    const rest = lists.filter((l) => !l.pinned);
    if (pinned.length) html += `<h3 class="sec" data-key="h-pin">📌 Przypięte</h3>` + pinned.map(listCard).join('');
    if (rest.length) html += (pinned.length ? `<h3 class="sec" data-key="h-rest">Pozostałe</h3>` : '') + rest.map(listCard).join('');
  }
  const archived = Object.values(store.view.lists).filter((l) => l.archived).length;
  if (archived) html += `<button type="button" class="link-row" data-act="archive" data-key="arch">📦 Archiwum <b>${archived}</b> ${ICON.right}</button>`;
  html += `<button type="button" class="fab" data-act="new-list" data-key="fab" aria-label="Nowa lista">${ICON.plus}<span>Nowa lista</span></button>`;
  morph(viewEl, html);
}

function listCard(l) {
  const s = listSummary(store.view.items[l.id] || {});
  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
  const k = kindInfo(l.kind);
  const due = dueLabel(l.dueDate);
  const left = s.total - s.done;
  return `<article class="card list-card ${pct === 100 ? 'complete' : ''}" data-key="l:${l.id}" data-act="open" data-id="${l.id}" style="--accent:${l.color};--p:${pct}">
    <div class="lc-icon">${esc(l.icon)}</div>
    <div class="lc-body">
      <h3>${esc(l.name)}</h3>
      <p class="lc-meta">
        ${s.total ? (left ? `<span><b>${left}</b> ${esc(k.todo)}</span>` : `<span class="ok">✓ ${esc(k.done)}</span>`) : '<span>pusta</span>'}
        ${due ? `<span class="due ${due.urgent ? 'urgent' : ''} ${due.past ? 'past' : ''}">📅 ${esc(due.text)}</span>` : ''}
        ${l.budget ? `<span>💰 ${Math.round(s.spent)}/${Math.round(l.budget)} zł</span>` : ''}
      </p>
      ${l.description ? `<p class="lc-desc">${esc(l.description)}</p>` : ''}
      <p class="lc-foot">${l.updatedBy ? `${avatar(l.updatedBy, 'xs')} ` : ''}${timeAgo(l.updatedAt)}</p>
    </div>
    <div class="lc-side">
      ${s.total ? `<div class="mini-ring"><span>${s.done}/${s.total}</span></div>` : ''}
      <button type="button" class="icon-btn sm" data-act="card-menu" data-id="${l.id}" aria-label="Opcje listy">${ICON.more}</button>
    </div>
  </article>`;
}

export function handleHomeClick(e, el) {
  const act = el.dataset.act;
  switch (act) {
    case 'kind': prefs.set('homeKind', el.dataset.kind); store.notify(); break;
    case 'open': if (!e.target.closest('[data-act="card-menu"]')) go('#list/' + el.dataset.id); break;
    case 'card-menu': e.stopPropagation(); openCardMenu(el.dataset.id); break;
    case 'new-list': openListForm(null, { kind: prefs.get('homeKind', 'all') === 'all' ? 'shopping' : prefs.get('homeKind') }); break;
    case 'use-builtin': {
      const t = BUILTIN_TEMPLATES.find((x) => x.id === el.dataset.id);
      if (t) openListForm(null, { kind: t.kind, templateId: t.id });
      break;
    }
    case 'archive': go('#archive'); break;
  }
}

function openCardMenu(listId) {
  const l = store.view.lists[listId];
  if (!l) return;
  actionSheet(`${l.icon} ${l.name}`, [{ icon: '📂', label: 'Otwórz', onClick: () => go('#list/' + listId) }, ...listMenuActions(listId)]);
}

export function listMenuActions(listId, { inList = false } = {}) {
  const l = store.view.lists[listId];
  if (!l) return [];
  return [
    { icon: '✏️', label: 'Edytuj listę', hint: 'nazwa, ikona, kolor, termin', onClick: () => openListForm(l) },
    { icon: '📌', label: l.pinned ? 'Odepnij' : 'Przypnij na górze', onClick: () => dispatch({ t: 'list.update', id: listId, patch: { pinned: !l.pinned } }) },
    { icon: '📤', label: 'Udostępnij jako tekst', onClick: async () => { const { listAsText } = await import('./list.js'); shareText(l.name, listAsText(listId)); } },
    { icon: '💾', label: 'Zapisz jako szablon', onClick: () => saveAsTemplate(listId) },
    { icon: '📄', label: 'Duplikuj', onClick: () => duplicateList(listId, inList) },
    { icon: '🔗', label: 'Połącz z inną listą', onClick: () => openMergeSheet(listId) },
    { icon: '📦', label: l.archived ? 'Przywróć z archiwum' : 'Archiwizuj', onClick: () => { dispatch({ t: 'list.update', id: listId, patch: { archived: !l.archived } }); if (!l.archived && inList) go('#home'); toast(l.archived ? 'Przywrócono' : 'Przeniesiono do archiwum'); } },
    { sep: true },
    { icon: '🗑️', label: 'Usuń listę', danger: true, onClick: () => deleteList(listId) }
  ];
}

async function deleteList(listId) {
  const l = store.view.lists[listId];
  const n = Object.keys(store.view.items[listId] || {}).length;
  const ok = await confirmSheet({ title: `Usunąć „${l.name}”?`, text: n ? `Lista ma ${n} ${plural(n, 'pozycję', 'pozycje', 'pozycji')}. Możesz ją też zarchiwizować zamiast usuwać.` : '', ok: 'Usuń na zawsze', danger: true });
  if (!ok) return;
  const snapList = { ...l };
  const snapItems = Object.values(store.view.items[listId] || {}).map((x) => ({ ...x }));
  dispatch({ t: 'list.delete', id: listId });
  if (location.hash.startsWith('#list/' + listId)) go('#home');
  toast(`Usunięto „${l.name}”`, { action: 'Cofnij', onAction: () => dispatch({ t: 'list.create', list: snapList, items: snapItems }) });
}

function duplicateList(listId, navigate) {
  const l = store.view.lists[listId];
  const id = uid();
  const items = cloneItems(Object.values(store.view.items[listId] || {}), { by: store.me });
  dispatch({ t: 'list.create', list: { ...l, id, name: l.name + ' (kopia)', pinned: false, archived: false, createdAt: undefined }, items });
  toast('Utworzono kopię');
  if (navigate) go('#list/' + id);
}

async function saveAsTemplate(listId) {
  const l = store.view.lists[listId];
  const name = await promptSheet({ title: 'Zapisz jako szablon', value: l.name, ok: 'Zapisz', maxLength: 60 });
  if (!name) return;
  dispatch({ t: 'tpl.save', tpl: { id: uid(), name, kind: l.kind, icon: l.icon, color: l.color, items: Object.values(store.view.items[listId] || {}) } });
  toast('Zapisano szablon — znajdziesz go w zakładce Szablony');
}

export function openMergeSheet(targetId) {
  const target = store.view.lists[targetId];
  const others = Object.values(store.view.lists).filter((l) => l.id !== targetId && !l.archived)
    .sort((a, b) => (b.kind === target.kind) - (a.kind === target.kind) || b.updatedAt - a.updatedAt);
  if (!others.length) { toast('Brak innych list do połączenia'); return; }
  openSheet({
    title: `Połącz z „${esc(target.name)}”`,
    html: `<p class="sheet-text">Zaznaczone listy zostaną przeniesione do tej listy i usunięte. Takie same pozycje zsumują się, a bagaże o tej samej nazwie połączą.</p>
      <div class="check-list">${others.map((l) => `<label class="check-row"><input type="checkbox" value="${l.id}"><span>${esc(l.icon)} ${esc(l.name)} <small>${esc(kindInfo(l.kind).label)}</small></span></label>`).join('')}</div>
      <div class="sheet-actions"><button type="button" class="btn btn-ghost" data-x>Anuluj</button><button type="button" class="btn btn-primary" data-go>Połącz</button></div>`,
    onMount(body, ctl) {
      body.querySelector('[data-x]').onclick = () => ctl.close();
      body.querySelector('[data-go]').onclick = () => {
        const ids = [...body.querySelectorAll('input:checked')].map((c) => c.value);
        if (!ids.length) { toast('Zaznacz co najmniej jedną listę'); return; }
        dispatch({ t: 'list.merge', targetId, sourceIds: ids });
        ctl.close();
        toast('Połączono listy');
      };
    }
  });
}

// ---------------------------------------------------------------------
// Formularz listy (nowa / edycja)
// ---------------------------------------------------------------------

export function templateOptions(kind) {
  const user = Object.values(store.view.templates).filter((t) => t.kind === kind).sort((a, b) => b.updatedAt - a.updatedAt);
  const builtin = BUILTIN_TEMPLATES.filter((t) => t.kind === kind);
  return { user, builtin };
}

export function templateItems(tplId) {
  const b = BUILTIN_TEMPLATES.find((t) => t.id === tplId);
  if (b) return { tpl: b, items: builtinTemplateItems(b, store.view.meta) };
  const t = store.view.templates[tplId];
  if (t) return { tpl: t, items: cloneItems(t.items, { by: store.me }) };
  return null;
}

export function openListForm(existing, opts = {}) {
  const isEdit = !!existing;
  let kind = isEdit ? existing.kind : (KINDS[opts.kind] ? opts.kind : 'shopping');
  let icon = isEdit ? existing.icon : KINDS[kind].icon;
  let color = isEdit ? existing.color : LIST_COLORS[Object.keys(store.view.lists).length % LIST_COLORS.length];
  let templateId = opts.templateId || '';
  let iconTouched = isEdit;
  let nameTouched = false;
  const pre = templateId ? templateItems(templateId) : null;
  if (pre && !isEdit) { icon = pre.tpl.icon || icon; color = pre.tpl.color || color; }

  const html = `<form class="list-form" autocomplete="off">
    <div class="seg kind-seg">${Object.entries(KINDS).map(([k, v]) => `<button type="button" class="${k === kind ? 'on' : ''}" data-kind="${k}">${v.icon} ${v.label}</button>`).join('')}</div>
    <div class="field"><label>Nazwa</label><input class="input big" name="name" maxlength="60" required value="${esc(isEdit ? existing.name : (pre ? pre.tpl.name : ''))}" placeholder="${kind === 'packing' ? 'np. Mazury — sierpień' : kind === 'todo' ? 'np. Przed wyjazdem' : 'np. Zakupy na weekend'}"></div>
    ${isEdit ? '' : `<div class="field"><label>Zacznij od</label><div class="tpl-pick" data-tpls></div></div>`}
    <div class="field"><label>Ikona</label><div class="icon-pick">${LIST_ICONS.map((i) => `<button type="button" class="${i === icon ? 'on' : ''}" data-icon="${i}">${i}</button>`).join('')}</div></div>
    <div class="field"><label>Kolor</label><div class="color-pick">${LIST_COLORS.map((c) => `<button type="button" class="${c === color ? 'on' : ''}" data-color="${c}" style="--c:${c}" aria-label="Kolor ${c}"></button>`).join('')}</div></div>
    <div class="field-row">
      <div class="field"><label data-due-label>${kind === 'packing' ? 'Data wyjazdu' : 'Termin'}</label><input class="input" type="date" name="dueDate" value="${esc(isEdit ? existing.dueDate : '')}"></div>
      <div class="field" data-budget ${kind === 'shopping' ? '' : 'hidden'}><label>Budżet (zł)</label><input class="input" name="budget" inputmode="decimal" value="${isEdit && existing.budget ? existing.budget : ''}" placeholder="opcjonalnie"></div>
    </div>
    <div class="field"><label>Opis</label><input class="input" name="description" maxlength="300" value="${esc(isEdit ? existing.description : '')}" placeholder="opcjonalnie"></div>
    <div class="sheet-actions sticky"><button type="button" class="btn btn-ghost" data-x>Anuluj</button><button type="submit" class="btn btn-primary">${isEdit ? 'Zapisz' : 'Utwórz listę'}</button></div>
  </form>`;

  openSheet({
    title: isEdit ? 'Edytuj listę' : 'Nowa lista',
    html,
    onMount(body, ctl) {
      const form = body.querySelector('form');
      const tplBox = body.querySelector('[data-tpls]');
      const renderTpls = () => {
        if (!tplBox) return;
        const { user, builtin } = templateOptions(kind);
        const opt = (t, items) => `<button type="button" class="tpl-opt ${templateId === t.id ? 'on' : ''}" data-tpl="${t.id}"><span>${esc(t.icon || '📋')}</span><b>${esc(t.name)}</b><small>${items} ${plural(items, 'pozycja', 'pozycje', 'pozycji')}</small></button>`;
        tplBox.innerHTML = `<button type="button" class="tpl-opt ${!templateId ? 'on' : ''}" data-tpl=""><span>✨</span><b>Pusta lista</b><small>od zera</small></button>`
          + user.map((t) => opt(t, t.items.length)).join('')
          + builtin.map((t) => opt(t, t.outline.split('\n').filter((x) => x.trim()).length)).join('');
      };
      renderTpls();
      if (!isEdit && !pre) setTimeout(() => form.name.focus(), 80);
      form.name.addEventListener('input', () => { nameTouched = true; });

      body.addEventListener('click', (e) => {
        const k = e.target.closest('[data-kind]');
        if (k) {
          kind = k.dataset.kind;
          body.querySelectorAll('[data-kind]').forEach((b) => b.classList.toggle('on', b === k));
          body.querySelector('[data-budget]').hidden = kind !== 'shopping';
          body.querySelector('[data-due-label]').textContent = kind === 'packing' ? 'Data wyjazdu' : 'Termin';
          if (!iconTouched) { icon = KINDS[kind].icon; body.querySelectorAll('[data-icon]').forEach((b) => b.classList.toggle('on', b.dataset.icon === icon)); }
          if (templateId && !templateOptions(kind).user.concat(templateOptions(kind).builtin).some((t) => t.id === templateId)) templateId = '';
          renderTpls();
          return;
        }
        const ic = e.target.closest('[data-icon]');
        if (ic) { icon = ic.dataset.icon; iconTouched = true; body.querySelectorAll('[data-icon]').forEach((b) => b.classList.toggle('on', b === ic)); return; }
        const co = e.target.closest('[data-color]');
        if (co) { color = co.dataset.color; body.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('on', b === co)); return; }
        const tp = e.target.closest('[data-tpl]');
        if (tp) {
          templateId = tp.dataset.tpl;
          tplBox.querySelectorAll('[data-tpl]').forEach((b) => b.classList.toggle('on', b === tp));
          const t = templateId ? templateItems(templateId) : null;
          if (t) {
            if (!nameTouched || !form.name.value.trim()) form.name.value = t.tpl.name;
            if (!iconTouched && t.tpl.icon) { icon = t.tpl.icon; body.querySelectorAll('[data-icon]').forEach((b) => b.classList.toggle('on', b.dataset.icon === icon)); }
          }
          return;
        }
        if (e.target.closest('[data-x]')) ctl.close();
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = form.name.value.trim();
        if (!name) { form.name.focus(); return; }
        const data = {
          name, kind, icon, color,
          description: form.description.value.trim(),
          dueDate: form.dueDate.value,
          budget: kind === 'shopping' && form.budget.value.trim() ? form.budget.value : null
        };
        if (isEdit) {
          dispatch({ t: 'list.update', id: existing.id, patch: data });
          ctl.close();
          return;
        }
        const id = uid();
        const t = templateId ? templateItems(templateId) : null;
        dispatch({ t: 'list.create', list: { id, ...data }, items: t ? t.items : [] });
        ctl.close();
        go('#list/' + id);
      });
    }
  });
}

// ---------------------------------------------------------------------
// Archiwum
// ---------------------------------------------------------------------

export function renderArchive(viewEl, setTop) {
  setTop({ title: 'Archiwum', eyebrow: 'zakończone listy', back: true });
  const lists = Object.values(store.view.lists).filter((l) => l.archived).sort((a, b) => b.updatedAt - a.updatedAt);
  if (!lists.length) { morph(viewEl, `<div class="empty"><div class="empty-ico">📦</div><p>Archiwum jest puste.</p><p class="muted">Zarchiwizowane listy trafią tutaj — możesz je potem przywrócić lub skopiować.</p></div>`); return; }
  morph(viewEl, lists.map((l) => {
    const s = listSummary(store.view.items[l.id] || {});
    return `<article class="card arch-card" data-key="a:${l.id}" style="--accent:${l.color}">
      <div class="lc-icon">${esc(l.icon)}</div>
      <div class="lc-body"><h3>${esc(l.name)}</h3><p class="lc-meta"><span>${s.done}/${s.total} ${esc(kindInfo(l.kind).done)}</span><span>${timeAgo(l.updatedAt)}</span></p>
        <div class="card-actions">
          <button type="button" class="chip sm" data-act="a-open" data-id="${l.id}">Otwórz</button>
          <button type="button" class="chip sm" data-act="a-restore" data-id="${l.id}">Przywróć</button>
          <button type="button" class="chip sm" data-act="a-copy" data-id="${l.id}">Użyj ponownie</button>
          <button type="button" class="chip sm danger" data-act="a-del" data-id="${l.id}">Usuń</button>
        </div>
      </div></article>`;
  }).join(''));
}

export function handleArchiveClick(e, el) {
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'a-open': go('#list/' + id); break;
    case 'a-restore': dispatch({ t: 'list.update', id, patch: { archived: false } }); toast('Przywrócono'); break;
    case 'a-copy': duplicateList(id, true); break;
    case 'a-del': deleteList(id); break;
  }
}

export { buildTree };
