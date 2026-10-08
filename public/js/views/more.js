// =====================================================================
// Więcej: profil, wygląd, sklepy/jednostki/kategorie, podpowiedzi,
// kopia zapasowa, statystyki, wyszukiwanie
// =====================================================================

import { store } from '../store.js';
import { buildTree, itemEmoji, KINDS, CATEGORY_EMOJI, DEFAULT_CATEGORIES } from '../core.js';
import { esc, morph, toast, openSheet, confirmSheet, promptSheet, money, ICON, download, plural, timeAgo } from '../ui.js';
import { prefs, go, dispatch, people, avatar, kindInfo } from '../ctx.js';
import { setHighlight } from './list.js';

export const APP_VERSION = '3.0.0';

export function applyTheme(theme) {
  const t = theme || prefs.get('theme', 'auto');
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#111513' : '#f6f4ef');
}

export function renderMore(viewEl, setTop) {
  setTop({ title: 'Więcej', eyebrow: 'ustawienia i narzędzia' });
  const theme = prefs.get('theme', 'auto');
  const meta = store.view.meta;
  const favCount = Object.keys(store.view.favs).length;
  const pend = store.pending.length;
  const st = store.status === 'online' ? (pend ? `🟡 Wysyłanie zmian (${pend})…` : '🟢 Połączono — zmiany na żywo') : store.status === 'connecting' ? '🟡 Łączenie…' : `🔴 Offline${pend ? ` — ${pend} ${plural(pend, 'zmiana czeka', 'zmiany czekają', 'zmian czeka')}` : ''}`;
  morph(viewEl, `
    <section class="card set-card" data-key="me">
      <div class="me-row">${avatar(store.me || '?', 'lg')}<div><p class="set-title">${esc(store.me || 'Bez imienia')}</p><p class="muted small">${esc(st)}</p></div></div>
      <p class="set-label">Kim jesteś na tym urządzeniu?</p>
      <div class="pick">${people().map((n) => `<button type="button" class="chip ${n === store.me ? 'on' : ''}" data-act="me" data-name="${esc(n)}">${avatar(n, 'xs')} ${esc(n)}</button>`).join('')}<button type="button" class="chip" data-act="add-person">${ICON.plus} Dodaj osobę</button></div>
    </section>

    <div class="menu-list" data-key="nav">
      <button type="button" class="link-row" data-act="go" data-to="#stats">📊 Statystyki ${ICON.right}</button>
      <button type="button" class="link-row" data-act="go" data-to="#archive">📦 Archiwum <b>${Object.values(store.view.lists).filter((l) => l.archived).length || ''}</b> ${ICON.right}</button>
      <button type="button" class="link-row" data-act="search">🔎 Szukaj wszędzie ${ICON.right}</button>
    </div>

    <section class="card set-card" data-key="look">
      <p class="set-label">Wygląd</p>
      <div class="seg">${[['auto', '🌓 Auto'], ['light', '☀️ Jasny'], ['dark', '🌙 Ciemny']].map(([k, l]) => `<button type="button" class="${theme === k ? 'on' : ''}" data-act="theme" data-theme="${k}">${l}</button>`).join('')}</div>
      <label class="switch-row"><span>Powiadomienia o zmianach innych osób <small>dyskretne dymki, gdy ktoś coś doda lub kupi</small></span><input type="checkbox" data-act="toasts" ${prefs.get('remoteToasts', true) ? 'checked' : ''}><i class="switch"></i></label>
      <label class="switch-row"><span>Wibracje <small>przy odhaczaniu (Android)</small></span><input type="checkbox" data-act="haptics" ${prefs.get('haptics', true) ? 'checked' : ''}><i class="switch"></i></label>
    </section>

    ${tagEditor('shops', '🏪 Sklepy', meta.shops, 'Dodaj sklep…', 'Kolejność sklepów decyduje o kolejności grup na liście.')}
    ${tagEditor('categories', '🏷️ Kategorie (kolejność alejek)', meta.categories, 'Dodaj kategorię…', 'Ustaw kolejność tak, jak idziesz po sklepie — lista zakupów pogrupuje się w tej kolejności.', true)}
    ${tagEditor('units', '⚖️ Jednostki', meta.units, 'Dodaj jednostkę…')}

    <div class="menu-list" data-key="tools">
      <button type="button" class="link-row" data-act="favs">💡 Podpowiedzi przy wpisywaniu <b>${favCount}</b> ${ICON.right}</button>
      <button type="button" class="link-row" data-act="export">💾 Pobierz kopię zapasową ${ICON.right}</button>
      <label class="link-row">📥 Wczytaj kopię zapasową <input type="file" accept="application/json,.json" data-act="import" hidden> ${ICON.right}</label>
      <button type="button" class="link-row" data-act="install">📲 Zainstaluj na telefonie ${ICON.right}</button>
      <button type="button" class="link-row" data-act="reconnect">🔄 Połącz ponownie ${ICON.right}</button>
      <button type="button" class="link-row danger" data-act="clear">🧹 Wyczyść dane tego urządzenia ${ICON.right}</button>
    </div>
    <p class="muted small center" data-key="ver">Zakupy ${APP_VERSION} · dane wspólne, synchronizowane na żywo</p>
  `);
}

function tagEditor(key, title, values, placeholder, hint = '', sortable = false) {
  return `<section class="card set-card" data-key="te-${key}">
    <details>
      <summary><span>${title}</span><b>${values.length}</b></summary>
      ${hint ? `<p class="muted small">${hint}</p>` : ''}
      <ul class="tag-edit">${values.map((v, i) => `<li data-key="${esc(key)}:${esc(v)}"><span>${key === 'categories' ? esc(CATEGORY_EMOJI[v] || '🏷️') + ' ' : ''}${esc(v)}</span>
        ${sortable || key === 'shops' ? `<button type="button" class="icon-btn xs" data-act="tag-up" data-k="${key}" data-i="${i}" aria-label="W górę" ${i === 0 ? 'disabled' : ''}>↑</button>` : ''}
        <button type="button" class="icon-btn xs" data-act="tag-del" data-k="${key}" data-i="${i}" aria-label="Usuń">${ICON.close}</button></li>`).join('')}</ul>
      <form class="tag-add" data-k="${key}"><input class="input" placeholder="${placeholder}" maxlength="40"><button type="submit" class="btn btn-primary sm">Dodaj</button></form>
      ${key === 'categories' ? '<button type="button" class="btn btn-ghost sm" data-act="cats-reset">Przywróć domyślne kategorie</button>' : ''}
    </details>
  </section>`;
}

export function handleMoreSubmit(e) {
  const form = e.target.closest('.tag-add');
  if (!form) return false;
  e.preventDefault();
  const input = form.querySelector('input');
  const v = input.value.trim();
  const key = form.dataset.k;
  if (!v) return true;
  const arr = store.view.meta[key];
  if (arr.some((x) => x.toLowerCase() === v.toLowerCase())) { toast('Już jest na liście'); return true; }
  dispatch({ t: 'meta.update', patch: { [key]: [...arr, v] } });
  input.value = '';
  return true;
}

export async function handleMoreClick(e, el) {
  const act = el.dataset.act;
  const meta = store.view.meta;
  switch (act) {
    case 'me': store.setMe(el.dataset.name); toast(`Cześć, ${el.dataset.name}!`); break;
    case 'add-person': {
      const name = await promptSheet({ title: 'Nowa osoba', placeholder: 'Imię', ok: 'Dodaj', maxLength: 40 });
      if (!name) return;
      if (!meta.people.includes(name)) dispatch({ t: 'meta.update', patch: { people: [...meta.people, name] } });
      if (await confirmSheet({ title: `Czy to Ty jesteś ${name}?`, text: 'Ustawić to imię na tym urządzeniu?', ok: 'Tak, to ja', cancel: 'Nie' })) store.setMe(name);
      break;
    }
    case 'go': go(el.dataset.to); break;
    case 'search': openSearch(); break;
    case 'theme': prefs.set('theme', el.dataset.theme); applyTheme(); store.notify(); break;
    case 'toasts': prefs.set('remoteToasts', el.checked); break;
    case 'haptics': prefs.set('haptics', el.checked); break;
    case 'tag-del': {
      const arr = meta[el.dataset.k].slice();
      arr.splice(Number(el.dataset.i), 1);
      dispatch({ t: 'meta.update', patch: { [el.dataset.k]: arr } });
      break;
    }
    case 'tag-up': {
      const arr = meta[el.dataset.k].slice();
      const i = Number(el.dataset.i);
      if (i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; dispatch({ t: 'meta.update', patch: { [el.dataset.k]: arr } }); }
      break;
    }
    case 'cats-reset': dispatch({ t: 'meta.update', patch: { categories: DEFAULT_CATEGORIES.slice() } }); toast('Przywrócono domyślne kategorie'); break;
    case 'favs': openFavs(); break;
    case 'export': {
      const date = new Date().toISOString().slice(0, 10);
      download(`zakupy-kopia-${date}.json`, JSON.stringify({ app: 'zakupy', exportedAt: Date.now(), ...store.view }, null, 1));
      break;
    }
    case 'install': showInstall(); break;
    case 'reconnect': store.forceReconnect(); toast('Łączenie…'); break;
    case 'clear': {
      const ok = await confirmSheet({ title: 'Wyczyścić dane urządzenia?', text: 'Usunie imię, ustawienia i kopię list z tego telefonu. Wspólne listy na serwerze zostaną nietknięte.' + (store.pending.length ? ` UWAGA: ${store.pending.length} niewysłanych zmian przepadnie.` : ''), ok: 'Wyczyść', danger: true });
      if (ok) { store.clearLocal(); location.reload(); }
      break;
    }
  }
}

export async function handleMoreChange(e) {
  const input = e.target.closest('[data-act="import"]');
  if (!input || !input.files || !input.files[0]) return;
  const file = input.files[0];
  input.value = '';
  let data;
  try { data = JSON.parse(await file.text()); } catch (err) { toast('To nie jest poprawny plik kopii', { kind: 'error' }); return; }
  const lists = data.lists ? (Array.isArray(data.lists) ? data.lists.length : Object.keys(data.lists).length) : 0;
  const ok = await confirmSheet({ title: 'Wczytać kopię zapasową?', text: `Plik zawiera ${lists} ${plural(lists, 'listę', 'listy', 'list')}. Obecne dane WSZYSTKICH osób zostaną zastąpione zawartością pliku.`, ok: 'Zastąp dane', danger: true });
  if (!ok) return;
  try {
    const r = await fetch('/api/import' + (store.key ? '?key=' + encodeURIComponent(store.key) : ''), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const res = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(res.error || 'Błąd serwera');
    toast(`Wczytano kopię (${res.lists} list)`);
  } catch (err) {
    toast('Nie udało się: ' + err.message, { kind: 'error' });
  }
}

function openFavs() {
  const favs = Object.entries(store.view.favs).sort((a, b) => (b[1].count || 0) - (a[1].count || 0));
  openSheet({
    title: '💡 Podpowiedzi',
    html: `<p class="sheet-text">Aplikacja zapamiętuje, co dodajesz, i podpowiada przy wpisywaniu (razem z ostatnim sklepem, kategorią i ceną). Usuń te, których nie chcesz widzieć.</p>
      ${favs.length ? `<input class="input" placeholder="Filtruj…" data-filter>
      <ul class="fav-list">${favs.map(([k, f]) => `<li data-k="${esc(k)}"><span>${esc(itemEmoji({ name: f.name }) || '•')} ${esc(f.name)}</span><small>${f.count}× ${f.shop ? '· ' + esc(f.shop) : ''}${f.price ? ' · ' + money(f.price) : ''}</small><button type="button" class="icon-btn xs" data-del="${esc(k)}" aria-label="Usuń">${ICON.close}</button></li>`).join('')}</ul>` : '<p class="muted">Jeszcze pusto.</p>'}`,
    onMount(body) {
      const filter = body.querySelector('[data-filter]');
      if (filter) filter.addEventListener('input', () => {
        const q = filter.value.toLowerCase();
        body.querySelectorAll('.fav-list li').forEach((li) => { li.hidden = q && !li.textContent.toLowerCase().includes(q); });
      });
      body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-del]');
        if (!b) return;
        dispatch({ t: 'fav.delete', key: b.dataset.del });
        b.closest('li').remove();
      });
    }
  });
}

let installEvent = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; });

function showInstall() {
  if (installEvent) { installEvent.prompt(); installEvent = null; return; }
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  openSheet({
    title: '📲 Aplikacja na ekranie głównym',
    html: standalone ? '<p class="sheet-text">Aplikacja jest już zainstalowana 🎉</p>' : `
      <p class="sheet-text"><b>iPhone (Safari):</b> stuknij <b>Udostępnij</b> ⬆️ → <b>Do ekranu początkowego</b>.</p>
      <p class="sheet-text"><b>Android (Chrome):</b> menu <b>⋮</b> → <b>Zainstaluj aplikację</b> / <b>Dodaj do ekranu głównego</b>.</p>
      <p class="muted small">Po instalacji aplikacja otwiera się na pełnym ekranie i działa też bez internetu — zmiany wyślą się same po odzyskaniu zasięgu.</p>`
  });
}

// ---------------------------------------------------------------------
// Statystyki
// ---------------------------------------------------------------------

export function renderStats(viewEl, setTop) {
  setTop({ title: 'Statystyki', eyebrow: 'jak Wam idzie', back: true });
  const lists = Object.values(store.view.lists);
  const allItems = [];
  for (const l of lists) for (const it of Object.values(store.view.items[l.id] || {})) allItems.push({ it, l });
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const weekStart = Date.now() - 7 * 86400000;
  const doneMonth = allItems.filter(({ it }) => it.done && it.doneAt >= monthStart);
  const spentMonth = doneMonth.reduce((s, { it }) => s + (it.price || 0), 0);
  const doneWeek = allItems.filter(({ it }) => it.done && it.doneAt >= weekStart).length;
  const open = allItems.filter(({ it, l }) => !it.done && !l.archived && it.type !== 'group').length;

  const byPerson = {};
  for (const { it } of allItems) if (it.done && it.doneBy) byPerson[it.doneBy] = (byPerson[it.doneBy] || 0) + 1;
  const persons = Object.entries(byPerson).sort((a, b) => b[1] - a[1]);
  const maxP = persons.length ? persons[0][1] : 1;

  const shopCount = {};
  for (const { it, l } of allItems) if (l.kind === 'shopping' && it.shop) shopCount[it.shop] = (shopCount[it.shop] || 0) + 1;
  const shops = Object.entries(shopCount).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxS = shops.length ? shops[0][1] : 1;

  const top = Object.values(store.view.favs).sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 10);
  const maxT = top.length ? top[0].count : 1;

  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).getTime();
    const sum = allItems.filter(({ it }) => it.done && it.price && it.doneAt >= d.getTime() && it.doneAt < end).reduce((s, { it }) => s + it.price, 0);
    months.push({ label: d.toLocaleDateString('pl-PL', { month: 'short' }), sum });
  }
  const maxM = Math.max(1, ...months.map((m) => m.sum));

  const bar = (label, val, max, right) => `<div class="bar-row"><span class="bl">${label}</span><span class="bt"><i style="width:${Math.max(4, (val / max) * 100)}%"></i></span><span class="bv">${right}</span></div>`;

  morph(viewEl, `
    <div class="kpis" data-key="kpi">
      <div class="kpi"><b>${lists.filter((l) => !l.archived).length}</b><span>aktywnych list</span></div>
      <div class="kpi"><b>${open}</b><span>pozycji czeka</span></div>
      <div class="kpi"><b>${doneWeek}</b><span>odhaczonych w 7 dni</span></div>
      <div class="kpi"><b>${money(spentMonth).replace(',00', '')}</b><span>wydane w tym miesiącu</span></div>
    </div>
    <section class="card stat-card" data-key="months"><h3>Wydatki (z cen na listach)</h3>
      <div class="cols">${months.map((m) => `<div class="col"><i style="height:${Math.max(3, (m.sum / maxM) * 100)}%" title="${money(m.sum)}"></i><span>${esc(m.label)}</span></div>`).join('')}</div>
      <p class="muted small">Wpisuj ceny w szczegółach produktu, a zobaczysz, ile wydajecie.</p>
    </section>
    ${persons.length ? `<section class="card stat-card" data-key="ppl"><h3>Kto odhacza najwięcej</h3>${persons.map(([n, c]) => bar(avatar(n, 'xs') + ' ' + esc(n), c, maxP, c)).join('')}</section>` : ''}
    ${top.length ? `<section class="card stat-card" data-key="top"><h3>Najczęściej dodawane</h3>${top.map((f) => bar(esc((itemEmoji({ name: f.name }) || '•') + ' ' + f.name), f.count, maxT, f.count + '×')).join('')}</section>` : ''}
    ${shops.length ? `<section class="card stat-card" data-key="shops"><h3>Ulubione sklepy</h3>${shops.map(([s, c]) => bar('🏪 ' + esc(s), c, maxS, c)).join('')}</section>` : ''}
  `);
}

// ---------------------------------------------------------------------
// Wyszukiwanie we wszystkim
// ---------------------------------------------------------------------

export function openSearch() {
  openSheet({
    title: '🔎 Szukaj',
    full: true,
    html: `<input class="input big" type="search" placeholder="Produkt, rzecz, lista, notatka…" data-q enterkeyhint="search"><div class="search-res" data-res><p class="muted small">Szukaj we wszystkich listach (także w kieszeniach bagaży), szablonach i notatkach.</p></div>`,
    onMount(body, ctl) {
      const input = body.querySelector('[data-q]');
      const res = body.querySelector('[data-res]');
      setTimeout(() => input.focus(), 120);
      input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        if (q.length < 1) { res.innerHTML = ''; return; }
        const out = [];
        const lists = Object.values(store.view.lists);
        const lh = lists.filter((l) => l.name.toLowerCase().includes(q));
        if (lh.length) out.push(`<h3 class="sec">Listy</h3>` + lh.map((l) => `<button type="button" class="search-hit" data-go="#list/${l.id}"><span>${esc(l.icon)}</span><span>${esc(l.name)}<small>${esc(kindInfo(l.kind).label)}${l.archived ? ' · archiwum' : ''}</small></span></button>`).join(''));
        const ih = [];
        for (const l of lists) {
          const items = store.view.items[l.id] || {};
          const tree = buildTree(items);
          for (const it of Object.values(items)) {
            if (it.name.toLowerCase().includes(q) || (it.note || '').toLowerCase().includes(q)) {
              const path = tree.path(it.id).slice(0, -1).map((g) => g.name);
              ih.push({ it, l, path, done: tree.isDone(it.id) });
            }
          }
        }
        if (ih.length) out.push(`<h3 class="sec">Pozycje</h3>` + ih.slice(0, 40).map(({ it, l, path, done }) => `<button type="button" class="search-hit ${done ? 'done' : ''}" data-go="#list/${l.id}" data-item="${it.id}"><span>${esc(itemEmoji(it) || (done ? '✅' : '▫️'))}</span><span>${esc(it.name)}<small>${esc(l.icon + ' ' + l.name)}${path.length ? ' › ' + esc(path.join(' › ')) : ''}${done ? ' · ' + esc(kindInfo(l.kind).done) : ''}</small></span></button>`).join(''));
        const nh = Object.values(store.view.notes).filter((n) => (n.title + '\n' + n.body).toLowerCase().includes(q));
        if (nh.length) out.push(`<h3 class="sec">Notatki</h3>` + nh.map((n) => `<button type="button" class="search-hit" data-go="#note/${n.id}"><span>🗒️</span><span>${esc(n.title || n.body.slice(0, 40))}<small>${timeAgo(n.updatedAt)}</small></span></button>`).join(''));
        const th = Object.values(store.view.templates).filter((t) => t.name.toLowerCase().includes(q) || t.items.some((i) => i.name.toLowerCase().includes(q)));
        if (th.length) out.push(`<h3 class="sec">Szablony</h3>` + th.map((t) => `<button type="button" class="search-hit" data-go="#templates"><span>${esc(t.icon)}</span><span>${esc(t.name)}<small>${esc(KINDS[t.kind].label)}</small></span></button>`).join(''));
        res.innerHTML = out.join('') || '<p class="muted">Nic nie znaleziono.</p>';
      });
      res.addEventListener('click', (e) => {
        const b = e.target.closest('[data-go]');
        if (!b) return;
        if (b.dataset.item) setHighlight(b.dataset.item);
        ctl.close();
        go(b.dataset.go);
      });
    }
  });
}
