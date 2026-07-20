// =====================================================================
// Zakupy — Worker + Durable Object "ListRoom"
// =====================================================================

const ROOM_NAME = 'main';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/ws' || url.pathname === '/api/export') {
      const id = env.LIST_ROOM.idFromName(ROOM_NAME);
      const stub = env.LIST_ROOM.get(id);
      return stub.fetch(request);
    }

    return env.ASSETS.fetch(request);
  }
};

const DEFAULT_SHOPS = [
  'Lidl', 'Biedronka', 'Rossmann', 'Kaufland', 'Auchan', 'Carrefour', 'Dino',
  'Action', 'Pepco', 'Dealz', 'Media Expert', 'Media Markt', 'Decathlon',
  'Leroy Merlin', 'Castorama', 'OBI', 'IKEA'
];

const DEFAULT_UNITS = ['szt.', 'kg', 'g', 'l', 'ml', 'op.', 'paczka', 'butelka', 'm'];

const DEFAULT_CATEGORIES = [
  'Nabiał', 'Warzywa', 'Owoce', 'Mięso', 'Pieczywo', 'Chemia', 'Kosmetyki', 'Elektronika', 'Inne'
];

const EMOJI_MAP = [
  [/mlek/i, '🥛'], [/chleb|bułk|bagiet/i, '🍞'], [/jajk|jajec/i, '🥚'], [/ser\b|serek/i, '🧀'],
  [/banan/i, '🍌'], [/jabł/i, '🍎'], [/pomarań/i, '🍊'], [/cytryn/i, '🍋'], [/ziemniak/i, '🥔'],
  [/pomidor/i, '🍅'], [/ogórek/i, '🥒'], [/marchew/i, '🥕'], [/cebul/i, '🧅'], [/czosnek/i, '🧄'],
  [/kurczak|kurcz/i, '🍗'], [/mięso|wołow|schab|karkówk/i, '🥩'], [/ryb|łosoś|tuńczyk/i, '🐟'],
  [/masł/i, '🧈'], [/jogurt/i, '🥣'], [/makaron|spaghetti/i, '🍝'], [/ryż/i, '🍚'],
  [/kawa/i, '☕'], [/herbat/i, '🍵'], [/sok/i, '🧃'], [/woda/i, '💧'], [/piwo/i, '🍺'],
  [/wino/i, '🍷'], [/czekolad|batonik/i, '🍫'], [/cukierk|słodycz/i, '🍬'], [/lod[óy]/i, '🍦'],
  [/ciast/i, '🍰'], [/pieluch/i, '👶'], [/szampon|mydł/i, '🧴'], [/past[ay] do zębów/i, '🪥'],
  [/papier toaletowy/i, '🧻'], [/proszek|płyn do prania/i, '🧺'], [/żarówk/i, '💡'],
  [/bateri/i, '🔋'], [/kabel/i, '🔌'], [/kwiat/i, '🌸'], [/karm[ay] dla/i, '🐾']
];

function emojiFor(name) {
  for (const [re, emoji] of EMOJI_MAP) if (re.test(name)) return emoji;
  return '🛒';
}

function uid() {
  return crypto.randomUUID();
}

function now() {
  return Date.now();
}

export class ListRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sockets = new Set();
    this.ready = this.load();
  }

  async load() {
    const stored = await this.state.storage.get([
      'lists', 'items', 'shops', 'units', 'templates', 'favorites', 'history', 'notes'
    ]);
    this.lists = stored.get('lists') || [];
    this.items = stored.get('items') || {};       
    this.shops = stored.get('shops') || DEFAULT_SHOPS.slice();
    this.units = stored.get('units') || DEFAULT_UNITS.slice();
    this.templates = stored.get('templates') || [];
    this.favorites = stored.get('favorites') || {}; 
    this.history = stored.get('history') || {};     
    this.notes = stored.get('notes') || []; // NOWE

    // MIGRACJA: stare listy/notatki nie mają jeszcze pola "kind" / "lineMap".
    // Dopisujemy im wartości domyślne, żeby nic nie zniknęło i nie wywaliło błędu.
    let needsMigration = false;
    for (const l of this.lists) {
      if (!l.kind) { l.kind = 'shopping'; needsMigration = true; }
    }
    for (const n of this.notes) {
      if (!n.lineMap) { n.lineMap = {}; needsMigration = true; }
    }
    if (needsMigration) await this.persist(['lists', 'notes']);
  }

  async persist(keys) {
    const map = {
      lists: this.lists, items: this.items, shops: this.shops, units: this.units,
      templates: this.templates, favorites: this.favorites, history: this.history, notes: this.notes
    };
    const toSave = {};
    for (const k of keys) toSave[k] = map[k];
    await this.state.storage.put(toSave);
  }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);

    if (url.pathname === '/api/export') {
      return new Response(JSON.stringify({
        lists: this.lists, items: this.items, shops: this.shops, units: this.units,
        templates: this.templates, favorites: this.favorites, history: this.history, notes: this.notes
      }, null, 2), { headers: { 'Content-Type': 'application/json' } });
    }

    if (url.pathname !== '/ws') {
      return new Response('Not found', { status: 404 });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.sockets.add(server);

    server.addEventListener('message', (ev) => this.onMessage(server, ev));
    server.addEventListener('close', () => this.sockets.delete(server));
    server.addEventListener('error', () => this.sockets.delete(server));

    this.sendInit(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  send(socket, msg) {
    try { socket.send(JSON.stringify(msg)); } catch (e) { /* socket dead, ignore */ }
  }

  broadcast(msg, exclude = null) {
    const payload = JSON.stringify(msg);
    for (const s of this.sockets) {
      if (s === exclude) continue;
      try { s.send(payload); } catch (e) { this.sockets.delete(s); }
    }
  }

  sendInit(socket) {
    this.send(socket, {
      type: 'init',
      lists: this.listsForClient(),
      items: this.items,
      shops: this.shops,
      units: this.units,
      categories: DEFAULT_CATEGORIES,
      templates: this.templates,
      favorites: this.favorites,
      notes: this.notes
    });
  }

  broadcastItemsAll() {
    this.broadcast({ type: 'state', slice: 'items', data: this.items });
  }

  listsForClient() {
    return this.lists.map((l) => this.decorateList(l));
  }

  decorateList(l) {
    const items = this.items[l.id] || [];
    const done = items.filter((i) => i.done);
    const spent = done.reduce((s, i) => s + (Number(i.price) || 0), 0);
    return { ...l, itemCount: items.length, doneCount: done.length, spent };
  }

  pushHistory(listId, by, text) {
    if (!this.history[listId]) this.history[listId] = [];
    this.history[listId].unshift({ ts: now(), by, text });
    if (this.history[listId].length > 80) this.history[listId].length = 80;
  }

  touchList(id, by) {
    const l = this.lists.find((x) => x.id === id);
    if (l) { l.updatedAt = now(); l.updatedBy = by; }
  }

  bumpFavorite(name) {
    const key = name.trim().toLowerCase();
    if (!key) return;
    if (!this.favorites[key]) this.favorites[key] = { name: name.trim(), count: 0 };
    this.favorites[key].count += 1;
  }

  async onMessage(socket, ev) {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.type !== 'action') return;

    const { action, payload = {}, by = '?', cid } = msg;
    try {
      await this.handleAction(action, payload, by || 'Ktoś');
      if (cid) this.send(socket, { type: 'ack', cid });
    } catch (err) {
      this.send(socket, { type: 'error', cid, message: String(err && err.message || err) });
    }
  }

  async handleAction(action, p, by) {
    const fn = this['act_' + action];
    if (typeof fn !== 'function') throw new Error('Nieznana akcja: ' + action);
    await fn.call(this, p, by);
  }

  broadcastLists() {
    this.broadcast({ type: 'state', slice: 'lists', data: this.listsForClient() });
  }

  broadcastListDetail(listId) {
    const list = this.lists.find((x) => x.id === listId);
    if (!list) return;
    this.broadcast({
      type: 'listDetail',
      listId,
      list: this.decorateList(list),
      items: this.items[listId] || [],
      history: this.history[listId] || []
    });
  }

  event(by, text) {
    this.broadcast({ type: 'event', by, text, ts: now() });
  }

  // -------------------------------------------------------------
  // Akcje: LISTY
  // -------------------------------------------------------------

  async act_createList(p, by) {
    const id = p.id || uid(); // ZMIANA: Pozwala klientowi narzucić powiązane ID
    const list = {
      id,
      name: (p.name || 'Nowa lista').toString().slice(0, 60),
      description: (p.description || '').toString().slice(0, 200),
      color: p.color || '#7f8c6a',
      icon: p.icon || '🛒',
      kind: p.kind === 'todo' ? 'todo' : 'shopping',
      pinned: false,
      archived: false,
      budget: p.budget ? Number(p.budget) : null,
      createdAt: now(),
      updatedAt: now(),
      updatedBy: by
    };
    this.lists.unshift(list);
    this.items[id] = [];

    if (p.templateId) {
      const tpl = this.templates.find((t) => t.id === p.templateId);
      if (tpl) {
        this.items[id] = tpl.items.map((it) => ({
          id: uid(), name: it.name, emoji: emojiFor(it.name), qty: it.qty || 1, unit: it.unit || 'szt.',
          shop: it.shop || '', category: it.category || '', note: it.note || '',
          done: false, assignedTo: '', price: null, order: now(), createdAt: now()
        }));
      }
    }

    this.pushHistory(id, by, `${by} utworzył(a) listę "${list.name}"`);
    await this.persist(['lists', 'items', 'history']);
    this.broadcastLists();
    this.broadcastListDetail(id);
    this.broadcastItemsAll();
    this.event(by, `${by} utworzył(a) listę "${list.name}"`);
  }

  async act_updateList(p, by) {
    const list = this.lists.find((x) => x.id === p.id);
    if (!list) return;
    const patch = p.patch || {};
    for (const k of ['name', 'description', 'color', 'icon', 'kind', 'pinned', 'budget']) {
      if (k in patch) list[k] = patch[k];
    }
    this.touchList(list.id, by);
    await this.persist(['lists']);
    this.broadcastLists();
    this.broadcastListDetail(list.id);
  }

  async act_archiveList(p, by) {
    const list = this.lists.find((x) => x.id === p.id);
    if (!list) return;
    list.archived = !!p.archived;
    this.touchList(list.id, by);
    this.pushHistory(list.id, by, list.archived
      ? `${by} zarchiwizował(a) listę`
      : `${by} przywrócił(a) listę z archiwum`);
    await this.persist(['lists', 'history']);
    this.broadcastLists();
    this.event(by, `${by} ${list.archived ? 'zarchiwizował(a)' : 'przywrócił(a)'} listę "${list.name}"`);
  }

  async act_deleteList(p, by) {
    const list = this.lists.find((x) => x.id === p.id);
    if (!list) return;
    this.lists = this.lists.filter((x) => x.id !== p.id);
    delete this.items[p.id];
    delete this.history[p.id];
    await this.persist(['lists', 'items', 'history']);
    this.broadcastLists();
    this.broadcast({ type: 'listDeleted', listId: p.id });
    this.event(by, `${by} usunął(ęła) listę "${list.name}"`);
  }

  async act_duplicateList(p, by) {
    const src = this.lists.find((x) => x.id === p.id);
    if (!src) return;
    const id = uid();
    const copy = { ...src, id, name: src.name + ' (kopia)', createdAt: now(), updatedAt: now(), updatedBy: by, pinned: false, archived: false };
    this.lists.unshift(copy);
    this.items[id] = (this.items[src.id] || []).map((it) => ({ ...it, id: uid(), done: false }));
    this.pushHistory(id, by, `${by} zduplikował(a) listę "${src.name}"`);
    await this.persist(['lists', 'items', 'history']);
    this.broadcastLists();
    this.broadcastListDetail(id);
    this.broadcastItemsAll();
  }

  async act_mergeLists(p, by) {
    const target = this.lists.find((x) => x.id === p.targetId);
    if (!target) return;
    const sourceIds = (p.sourceIds || []).filter((id) => id !== p.targetId);
    const targetItems = this.items[target.id] || (this.items[target.id] = []);

    for (const sourceId of sourceIds) {
      const srcItems = this.items[sourceId] || [];
      for (const it of srcItems) {
        const match = targetItems.find((t) =>
          t.name.trim().toLowerCase() === it.name.trim().toLowerCase() &&
          (t.shop || '') === (it.shop || ''));
        if (match) {
          match.qty = (Number(match.qty) || 0) + (Number(it.qty) || 0);
        } else {
          targetItems.push({ ...it, id: uid() });
        }
      }
      this.lists = this.lists.filter((x) => x.id !== sourceId);
      delete this.items[sourceId];
      delete this.history[sourceId];
    }

    this.touchList(target.id, by);
    this.pushHistory(target.id, by, `${by} połączył(a) ${sourceIds.length} list(y) z "${target.name}"`);
    await this.persist(['lists', 'items', 'history']);
    this.broadcastLists();
    this.broadcastListDetail(target.id);
    this.broadcastItemsAll();
    for (const id of sourceIds) this.broadcast({ type: 'listDeleted', listId: id });
    this.event(by, `${by} połączył(a) listy w "${target.name}"`);
  }

  // -------------------------------------------------------------
  // Akcje: SZABLONY
  // -------------------------------------------------------------

  async act_saveTemplate(p, by) {
    const list = this.lists.find((x) => x.id === p.listId);
    if (!list) return;
    const tpl = {
      id: uid(),
      name: (p.name || list.name).toString().slice(0, 60),
      items: (this.items[list.id] || []).map((it) => ({
        name: it.name, qty: it.qty, unit: it.unit, shop: it.shop, category: it.category, note: it.note
      })),
      createdAt: now()
    };
    this.templates.unshift(tpl);
    await this.persist(['templates']);
    this.broadcast({ type: 'state', slice: 'templates', data: this.templates });
    this.event(by, `${by} zapisał(a) szablon "${tpl.name}"`);
  }

  async act_createTemplate(p, by) {
    const items = (p.items || []).map(name => ({
      name: name.trim(), qty: 1, unit: 'szt.', shop: '', category: '', note: ''
    })).filter(x => x.name);

    const tpl = {
      id: uid(),
      name: (p.name || 'Nowy szablon').toString().slice(0, 60),
      items,
      createdAt: now()
    };
    this.templates.unshift(tpl);
    await this.persist(['templates']);
    this.broadcast({ type: 'state', slice: 'templates', data: this.templates });
    this.event(by, `${by} utworzył(a) szablon "${tpl.name}"`);
  }

  async act_deleteTemplate(p) {
    this.templates = this.templates.filter((t) => t.id !== p.id);
    await this.persist(['templates']);
    this.broadcast({ type: 'state', slice: 'templates', data: this.templates });
  }

  // -------------------------------------------------------------
  // Akcje: PRODUKTY
  // -------------------------------------------------------------

  async act_addItems(p, by) {
    const list = this.lists.find((x) => x.id === p.listId);
    if (!list) return;
    const items = this.items[list.id] || (this.items[list.id] = []);
    const names = (p.names || []).map((n) => n.toString().trim().slice(0, 60)).filter(Boolean);
    if (!names.length) return;

    const created = [];
    for (const name of names) {
      const it = {
        id: uid(),
        name,
        emoji: emojiFor(name),
        qty: p.qty || 1,
        unit: p.unit || 'szt.',
        shop: p.shop || '',
        category: p.category || '',
        note: p.note || '',
        assignedTo: p.assignedTo || '',
        price: null,
        done: false,
        order: now(),
        createdAt: now()
      };
      items.push(it);
      created.push(it);
      this.bumpFavorite(name);
    }

    this.touchList(list.id, by);
    const text = created.length === 1
      ? `${by} dodał(a) "${created[0].name}"`
      : `${by} dodał(a) ${created.length} produkty/ów`;
    this.pushHistory(list.id, by, text);
    await this.persist(['lists', 'items', 'history', 'favorites']);
    this.broadcastLists();
    this.broadcastListDetail(list.id);
    this.broadcastItemsAll();
    this.broadcast({ type: 'state', slice: 'favorites', data: this.favorites });
    this.event(by, text);
  }

  async act_updateItem(p, by) {
    const items = this.items[p.listId];
    if (!items) return;
    const it = items.find((x) => x.id === p.itemId);
    if (!it) return;
    Object.assign(it, p.patch || {});
    this.touchList(p.listId, by);
    await this.persist(['lists', 'items']);
    this.broadcastLists();
    this.broadcastListDetail(p.listId);
    this.broadcastItemsAll();
  }

  async act_updateItemsShop(p, by) {
    const items = this.items[p.listId];
    if (!items || !p.itemIds || !p.itemIds.length) return;
    
    let count = 0;
    for (const it of items) {
      if (p.itemIds.includes(it.id)) {
        it.shop = p.shop || '';
        count++;
      }
    }
    
    if (count > 0) {
      this.touchList(p.listId, by);
      this.pushHistory(p.listId, by, `${by} przypisał(a) sklep "${p.shop}" do ${count} produktów`);
      await this.persist(['lists', 'items', 'history']);
      this.broadcastLists();
      this.broadcastListDetail(p.listId);
      this.broadcastItemsAll();
    }
  }

  async act_toggleItem(p, by) {
    const items = this.items[p.listId];
    if (!items) return;
    const it = items.find((x) => x.id === p.itemId);
    if (!it) return;
    it.done = !it.done;
    this.touchList(p.listId, by);
    const list = this.lists.find((x) => x.id === p.listId);
    this.pushHistory(p.listId, by, it.done
      ? `${by} oznaczył(a) "${it.name}" jako kupione`
      : `${by} cofnął(ęła) "${it.name}"`);
    await this.persist(['lists', 'items', 'history']);
    this.broadcastLists();
    this.broadcastListDetail(p.listId);
    this.broadcastItemsAll();
    if (it.done) this.event(by, `${by} kupił(a) "${it.name}"${list ? ' (' + list.name + ')' : ''}`);
  }

  async act_deleteItem(p, by) {
    const items = this.items[p.listId];
    if (!items) return;
    const it = items.find((x) => x.id === p.itemId);
    this.items[p.listId] = items.filter((x) => x.id !== p.itemId);
    this.touchList(p.listId, by);
    if (it) this.pushHistory(p.listId, by, `${by} usunął(ęła) "${it.name}"`);
    await this.persist(['lists', 'items', 'history']);
    this.broadcastLists();
    this.broadcastListDetail(p.listId);
    this.broadcastItemsAll();
  }

  async act_reorderItems(p, by) {
    const items = this.items[p.listId];
    if (!items) return;
    const order = p.order || [];
    items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    items.forEach((it, idx) => { it.order = idx; });
    await this.persist(['items']);
    this.broadcastListDetail(p.listId);
    this.broadcastItemsAll();
  }

  // -------------------------------------------------------------
  // Akcje: SKLEPY / JEDNOSTKI
  // -------------------------------------------------------------

  async act_addShop(p) {
    const name = (p.name || '').toString().trim().slice(0, 40);
    if (name && !this.shops.includes(name)) this.shops.push(name);
    await this.persist(['shops']);
    this.broadcast({ type: 'state', slice: 'shops', data: this.shops });
  }

  async act_deleteShop(p) {
    this.shops = this.shops.filter((s) => s !== p.name);
    await this.persist(['shops']);
    this.broadcast({ type: 'state', slice: 'shops', data: this.shops });
  }

  async act_reorderShops(p) {
    if (Array.isArray(p.order)) this.shops = p.order;
    await this.persist(['shops']);
    this.broadcast({ type: 'state', slice: 'shops', data: this.shops });
  }

  async act_addUnit(p) {
    const name = (p.name || '').toString().trim().slice(0, 20);
    if (name && !this.units.includes(name)) this.units.push(name);
    await this.persist(['units']);
    this.broadcast({ type: 'state', slice: 'units', data: this.units });
  }

  async act_deleteUnit(p) {
    this.units = this.units.filter((u) => u !== p.name);
    await this.persist(['units']);
    this.broadcast({ type: 'state', slice: 'units', data: this.units });
  }

  // -------------------------------------------------------------
  // Akcje: NOTATKI
  // -------------------------------------------------------------

  async act_createNote(p, by) {
    const id = p.id || uid();
    const note = {
      id,
      title: p.title || 'Bez tytułu',
      body: '',
      tiles: [],
      linkedListId: p.linkedListId || null,
      lineMap: {}, // mapowanie: id linijki w notatce -> id produktu na liście
      updatedAt: now()
    };
    this.notes.unshift(note);
    await this.persist(['notes']);
    this.broadcast({ type: 'state', slice: 'notes', data: this.notes });
  }

  async act_updateNote(p, by) {
    const note = this.notes.find(n => n.id === p.id);
    if (!note) return;

    if (p.patch) {
      // UWAGA: to tylko zapisuje treść notatki (tytuł, HTML, kafelki).
      // Dodawanie/aktualizowanie produktów na liście dzieje się teraz
      // osobno, w act_syncNoteLines — patrz niżej.
      Object.assign(note, p.patch);
      note.updatedAt = now();
    }

    await this.persist(['notes']);
    this.broadcast({ type: 'state', slice: 'notes', data: this.notes });
  }

  // Wywoływane, gdy użytkownik SKOŃCZY pisać daną linijkę notatki (przejdzie
  // do kolejnej linijki albo kliknie/wyjdzie z edytora) — a nie po każdej
  // wpisanej literze. Każda linijka ma swój stały identyfikator (lid),
  // dzięki czemu wracając do niej później aktualizujemy ten sam produkt,
  // a nie tworzymy nowego. Jeśli dwie linijki mają tę samą nazwę produktu,
  // są scalane w jeden wpis z licznikiem (np. "jajka razy 2").
  async act_syncNoteLines(p, by) {
    const note = this.notes.find(n => n.id === p.id);
    if (!note || !note.linkedListId) return;
    if (!note.lineMap) note.lineMap = {};

    const listItems = this.items[note.linkedListId] || (this.items[note.linkedListId] = []);
    let changed = false;

    const findByName = (name, excludeId) =>
      listItems.find((i) => i.id !== excludeId && i.name.toLowerCase() === name.toLowerCase());

    const removeMapping = (lid) => {
      const itemId = note.lineMap[lid];
      if (!itemId) return;
      delete note.lineMap[lid];
      const it = listItems.find((i) => i.id === itemId);
      if (!it) return;
      if ((it.count || 1) > 1) { it.count -= 1; }
      else { this.items[note.linkedListId] = this.items[note.linkedListId].filter((i) => i.id !== itemId); }
      changed = true;
    };

    for (const lid of (p.removedLids || [])) removeMapping(lid);

    for (const line of (p.lines || [])) {
      const lid = line && line.lid;
      if (!lid) continue;
      const text = (line.text || '').toString().replace(/&nbsp;/g, ' ').trim().slice(0, 60);

      if (!text) { removeMapping(lid); continue; }

      const mappedId = note.lineMap[lid];
      const mappedItem = mappedId ? listItems.find((i) => i.id === mappedId) : null;

      if (mappedItem) {
        if (mappedItem.name.toLowerCase() === text.toLowerCase()) continue; // bez zmian, nic nie rób

        // Linijka zmieniła nazwę produktu (np. dopisano literę albo poprawiono).
        const other = findByName(text, mappedItem.id);
        if (other) {
          // Ktoś ma już taki produkt na liście (np. inna linijka) — scalamy.
          other.count = (other.count || 1) + 1;
          if ((mappedItem.count || 1) > 1) { mappedItem.count -= 1; }
          else { this.items[note.linkedListId] = this.items[note.linkedListId].filter((i) => i.id !== mappedItem.id); }
          note.lineMap[lid] = other.id;
        } else {
          mappedItem.name = text;
          mappedItem.emoji = emojiFor(text);
        }
        changed = true;
      } else {
        // Nowa linijka, jeszcze niepowiązana z żadnym produktem.
        const other = findByName(text, null);
        if (other) {
          other.count = (other.count || 1) + 1;
          note.lineMap[lid] = other.id;
        } else {
          const newItem = {
            id: uid(), name: text, emoji: emojiFor(text), qty: 1, unit: 'szt.',
            shop: '', category: '', note: '', done: false, count: 1, order: now(), createdAt: now()
          };
          listItems.push(newItem);
          note.lineMap[lid] = newItem.id;
          this.bumpFavorite(text);
        }
        changed = true;
      }
    }

    if (changed) {
      this.touchList(note.linkedListId, 'System (Notatnik)');
      this.pushHistory(note.linkedListId, 'System', `Zaktualizowano listę z notatki "${note.title}"`);
      await this.persist(['items', 'favorites', 'lists', 'history', 'notes']);
      this.broadcastItemsAll();
      this.broadcastLists();
      this.broadcastListDetail(note.linkedListId);
      this.broadcast({ type: 'state', slice: 'favorites', data: this.favorites });
    } else {
      await this.persist(['notes']);
    }
  }

  async act_deleteNote(p, by) {
    this.notes = this.notes.filter(n => n.id !== p.id);
    await this.persist(['notes']);
    this.broadcast({ type: 'state', slice: 'notes', data: this.notes });
  }
}
