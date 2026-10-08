// =====================================================================
// Szablony: własne (zapisane z list lub napisane tekstem) i wbudowane
// =====================================================================

import { store } from '../store.js';
import { buildTree, parseOutline, mergeOutline, serializeOutline, itemEmoji, uid, KINDS, LIST_ICONS, BUILTIN_TEMPLATES, builtinTemplateItems } from '../core.js';
import { esc, morph, toast, openSheet, actionSheet, confirmSheet, ICON, plural } from '../ui.js';
import { prefs, dispatch, kindInfo } from '../ctx.js';
import { openListForm } from './home.js';

function preview(items, max = 5) {
  const tree = buildTree(Object.fromEntries(items.map((i) => [i.id, i])));
  const top = tree.kids(null);
  const parts = top.slice(0, max).map((it) => {
    const n = tree.kids(it.id).length;
    return `${itemEmoji(it) ? itemEmoji(it) + ' ' : ''}${it.name}${n ? ` (${tree.stats.get(it.id).total})` : ''}`;
  });
  return parts.join(' · ') + (top.length > max ? ` · +${top.length - max}` : '');
}

export function renderTemplates(viewEl, setTop) {
  setTop({ title: 'Szablony', eyebrow: 'gotowe zestawy do powtarzania' });
  const filter = prefs.get('tplKind', 'all');
  const user = Object.values(store.view.templates).filter((t) => filter === 'all' || t.kind === filter).sort((a, b) => b.updatedAt - a.updatedAt);
  const builtin = BUILTIN_TEMPLATES.filter((t) => filter === 'all' || t.kind === filter);
  let html = `<div class="seg" data-key="seg">${[['all', 'Wszystkie'], ['shopping', '🛒 Zakupy'], ['packing', '🎒 Pakowanie'], ['todo', '✅ Zadania']].map(([k, l]) => `<button type="button" class="${filter === k ? 'on' : ''}" data-act="tkind" data-kind="${k}">${l}</button>`).join('')}</div>`;
  html += `<h3 class="sec" data-key="h-user">Twoje szablony</h3>`;
  if (!user.length) {
    html += `<div class="hint-card" data-key="hint">💡 Zapisz dowolną listę jako szablon (menu ⋯ → „Zapisz jako szablon”) albo napisz nowy przyciskiem <b>+</b>. Świetne do powtarzalnych wyjazdów i cotygodniowych zakupów.</div>`;
  } else {
    html += user.map((t) => `<article class="card tpl-card" data-key="t:${t.id}" style="--accent:${t.color}">
      <div class="lc-icon">${esc(t.icon)}</div>
      <div class="lc-body"><h3>${esc(t.name)}</h3><p class="lc-meta"><span>${esc(kindInfo(t.kind).label)}</span><span>${t.items.length} ${plural(t.items.length, 'pozycja', 'pozycje', 'pozycji')}</span></p>
      <p class="lc-desc">${esc(preview(t.items))}</p>
      <div class="card-actions"><button type="button" class="chip sm on" data-act="t-use" data-id="${t.id}">Utwórz listę</button><button type="button" class="chip sm" data-act="t-edit" data-id="${t.id}">Edytuj</button><button type="button" class="icon-btn sm" data-act="t-menu" data-id="${t.id}" aria-label="Więcej">${ICON.more}</button></div></div>
    </article>`).join('');
  }
  if (builtin.length) {
    html += `<h3 class="sec" data-key="h-b">Gotowe szablony</h3>`;
    html += builtin.map((t) => {
      const items = builtinTemplateItems(t, store.view.meta);
      return `<article class="card tpl-card builtin" data-key="b:${t.id}" style="--accent:${t.color}">
        <div class="lc-icon">${esc(t.icon)}</div>
        <div class="lc-body"><h3>${esc(t.name)}</h3><p class="lc-meta"><span>${esc(kindInfo(t.kind).label)}</span><span>${items.length} ${plural(items.length, 'pozycja', 'pozycje', 'pozycji')}</span></p>
        <p class="lc-desc">${esc(preview(items))}</p>
        <div class="card-actions"><button type="button" class="chip sm on" data-act="t-use" data-id="${t.id}">Utwórz listę</button><button type="button" class="chip sm" data-act="t-copy" data-id="${t.id}">Dostosuj</button></div></div>
      </article>`;
    }).join('');
  }
  html += `<button type="button" class="fab" data-act="t-new" data-key="fab" aria-label="Nowy szablon">${ICON.plus}<span>Szablon</span></button>`;
  morph(viewEl, html);
}

export function handleTemplatesClick(e, el) {
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'tkind': prefs.set('tplKind', el.dataset.kind); store.notify(); break;
    case 't-use': {
      const t = store.view.templates[id] || BUILTIN_TEMPLATES.find((x) => x.id === id);
      if (t) openListForm(null, { kind: t.kind, templateId: id });
      break;
    }
    case 't-edit': openTemplateEditor(store.view.templates[id]); break;
    case 't-copy': {
      const b = BUILTIN_TEMPLATES.find((x) => x.id === id);
      if (b) openTemplateEditor({ ...b, id: null, items: builtinTemplateItems(b, store.view.meta) });
      break;
    }
    case 't-new': openTemplateEditor(null); break;
    case 't-menu': {
      const t = store.view.templates[id];
      actionSheet(t.name, [
        { icon: '📋', label: 'Utwórz listę', onClick: () => openListForm(null, { kind: t.kind, templateId: id }) },
        { icon: '✏️', label: 'Edytuj', onClick: () => openTemplateEditor(t) },
        { icon: '📄', label: 'Duplikuj', onClick: () => { dispatch({ t: 'tpl.save', tpl: { ...t, id: uid(), name: t.name + ' (kopia)' } }); toast('Zduplikowano'); } },
        { sep: true },
        { icon: '🗑️', label: 'Usuń szablon', danger: true, onClick: async () => { if (await confirmSheet({ title: `Usunąć szablon „${t.name}”?`, ok: 'Usuń', danger: true })) dispatch({ t: 'tpl.delete', id }); } }
      ]);
      break;
    }
  }
}

export function openTemplateEditor(tpl) {
  const isNew = !tpl || !tpl.id;
  let kind = tpl ? tpl.kind : (prefs.get('tplKind', 'all') === 'all' ? 'packing' : prefs.get('tplKind'));
  let icon = tpl ? tpl.icon : KINDS[kind].icon;
  const text = tpl ? serializeOutline(Object.fromEntries(tpl.items.map((i) => [i.id, { ...i, done: false }]))) : '';
  openSheet({
    title: isNew ? 'Nowy szablon' : 'Edytuj szablon',
    full: true,
    className: 'text-sheet',
    html: `<div class="seg kind-seg">${Object.entries(KINDS).map(([k, v]) => `<button type="button" class="${k === kind ? 'on' : ''}" data-kind="${k}">${v.icon} ${v.label}</button>`).join('')}</div>
      <div class="name-row"><button type="button" class="input emoji-in" data-icon-btn>${esc(icon)}</button><input class="input big" name="name" maxlength="60" placeholder="Nazwa szablonu" value="${esc(tpl ? tpl.name : '')}"></div>
      <div class="icon-pick" hidden data-icons>${LIST_ICONS.map((i) => `<button type="button" data-icon="${i}">${i}</button>`).join('')}</div>
      <p class="muted small">Jedna pozycja na linijkę. Wcięcie = do środka, „:” na końcu = bagaż/grupa. Np.:<br><code>Plecak:</code><br><code>&nbsp;&nbsp;Mała kieszeń:</code><br><code>&nbsp;&nbsp;&nbsp;&nbsp;Ładowarka</code></p>
      <textarea class="input te" spellcheck="false" placeholder="Plecak:\n  Mała kieszeń:\n    Ładowarka">${esc(text)}</textarea>
      <div class="sheet-actions sticky"><button type="button" class="btn btn-ghost" data-x>Anuluj</button><button type="button" class="btn btn-primary" data-save>Zapisz szablon</button></div>`,
    onMount(body, ctl) {
      const name = body.querySelector('[name="name"]');
      const ta = body.querySelector('textarea');
      if (isNew && !tpl) setTimeout(() => name.focus(), 100);
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; const ls = ta.value.lastIndexOf('\n', s - 1) + 1; if (e.shiftKey) { if (ta.value.slice(ls, ls + 2) === '  ') ta.setRangeText('', ls, ls + 2, 'end'); } else ta.setRangeText('  ', ls, ls, 'end'); }
        if (e.key === 'Enter' && !e.isComposing) {
          const pos = ta.selectionStart; const ls = ta.value.lastIndexOf('\n', pos - 1) + 1; const line = ta.value.slice(ls, pos);
          const ind = line.match(/^\s*/)[0] + (/:\s*$/.test(line) ? '  ' : '');
          if (ind) { e.preventDefault(); ta.setRangeText('\n' + ind, pos, ta.selectionEnd, 'end'); }
        }
      });
      body.addEventListener('click', (e) => {
        const k = e.target.closest('[data-kind]');
        if (k) { kind = k.dataset.kind; body.querySelectorAll('[data-kind]').forEach((b) => b.classList.toggle('on', b === k)); return; }
        if (e.target.closest('[data-icon-btn]')) { const box = body.querySelector('[data-icons]'); box.hidden = !box.hidden; return; }
        const ic = e.target.closest('[data-icon]');
        if (ic) { icon = ic.dataset.icon; body.querySelector('[data-icon-btn]').textContent = icon; body.querySelector('[data-icons]').hidden = true; return; }
        if (e.target.closest('[data-x]')) { ctl.close(); return; }
        if (e.target.closest('[data-save]')) {
          const nm = name.value.trim();
          if (!nm) { name.focus(); toast('Podaj nazwę szablonu'); return; }
          const nodes = parseOutline(ta.value, store.view.meta);
          if (!nodes.length) { toast('Szablon jest pusty'); ta.focus(); return; }
          const items = mergeOutline(tpl && tpl.id ? Object.fromEntries(tpl.items.map((i) => [i.id, i])) : {}, nodes, { autoCategory: kind === 'shopping' });
          dispatch({ t: 'tpl.save', tpl: { id: tpl && tpl.id ? tpl.id : uid(), name: nm, kind, icon, color: tpl ? tpl.color : undefined, items } });
          ctl.close();
          toast('Zapisano szablon');
        }
      });
    }
  });
}
