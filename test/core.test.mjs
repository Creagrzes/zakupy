import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLine, parseOutline, serializeOutline, mergeOutline, applyOp, emptyState, buildTree,
  migrateLegacy, guessCategory, valueForKey, stateFromEntries, BUILTIN_TEMPLATES, builtinTemplateItems
} from '../public/js/core.js';

test('parseLine: ilości, jednostki, sklep, kategoria, notatka, ważne', () => {
  assert.deepEqual(parseLine('2 kg ziemniaki @Lidl #warzywa (młode) !'), {
    name: 'Ziemniaki', qty: 2, unit: 'kg', shop: 'Lidl', category: 'Warzywa i owoce', note: 'młode', important: true
  });
  const a = parseLine('mleko x3');
  assert.equal(a.name, 'Mleko'); assert.equal(a.qty, 3); assert.equal(a.unit, '');
  const b = parseLine('2x jajka');
  assert.equal(b.name, 'Jajka'); assert.equal(b.qty, 2);
  const c = parseLine('1,5l woda');
  assert.equal(c.qty, 1.5); assert.equal(c.unit, 'l'); assert.equal(c.name, 'Woda');
  const d = parseLine('ser żółty 30 dag');
  assert.equal(d.name, 'Ser żółty'); assert.equal(d.qty, 30); assert.equal(d.unit, 'dag');
  const e = parseLine('słuchawki @media expert');
  assert.equal(e.shop, 'Media Expert'); assert.equal(e.name, 'Słuchawki');
  const f = parseLine('7 dni ferii');
  assert.equal(f.qty, 7); assert.equal(f.name, 'Dni ferii');
  const g = parseLine('Pasta do zębów');
  assert.equal(g.qty, null); assert.equal(g.name, 'Pasta do zębów');
});

test('guessCategory', () => {
  assert.equal(guessCategory('Mleko 3,2%'), 'Nabiał');
  assert.equal(guessCategory('Banany'), 'Warzywa i owoce');
  assert.equal(guessCategory('Papier toaletowy'), 'Chemia');
  assert.equal(guessCategory('Coś dziwnego'), '');
});

test('parseOutline + serialize round trip z zagnieżdżeniem', () => {
  const txt = `Plecak:
  Mała kieszeń:
    Ładowarka
    [x] Powerbank
  Duża kieszeń:
    2x Koszulka
Kosmetyczka
  Szczoteczka
Telefon`;
  const nodes = parseOutline(txt);
  assert.equal(nodes.length, 9);
  assert.equal(nodes[0].type, 'group');
  assert.equal(nodes[1].parent, 0);
  assert.equal(nodes[3].done, true);
  assert.equal(nodes[6].type, 'group', 'linia z dziećmi staje się grupą');
  const items = mergeOutline({}, nodes);
  const map = Object.fromEntries(items.map((i) => [i.id, i]));
  const out = serializeOutline(map);
  assert.equal(out, `Plecak:
  Mała kieszeń:
    Ładowarka
    [x] Powerbank
  Duża kieszeń:
    2x Koszulka
Kosmetyczka:
  Szczoteczka
Telefon`);
  // ponowne scalenie zachowuje id
  const again = mergeOutline(map, parseOutline(out));
  assert.deepEqual(again.map((i) => i.id), items.map((i) => i.id));
});

test('mergeOutline zachowuje id przy przeniesieniu do innej kieszeni', () => {
  const items = mergeOutline({}, parseOutline('A:\n  Ładowarka\nB:\n  Książka'));
  const map = Object.fromEntries(items.map((i) => [i.id, i]));
  const charger = items.find((i) => i.name === 'Ładowarka');
  map[charger.id].price = 10;
  const moved = mergeOutline(map, parseOutline('A:\nB:\n  Książka\n  Ładowarka'));
  const m = moved.find((i) => i.name === 'Ładowarka');
  assert.equal(m.id, charger.id);
  assert.equal(m.price, 10);
  assert.equal(m.parentId, moved.find((i) => i.name === 'B').id);
});

function setup() {
  const st = emptyState();
  applyOp(st, { t: 'list.create', by: 'Ola', ts: 1, list: { id: 'L1', name: 'Wyjazd', kind: 'packing' } });
  applyOp(st, { t: 'item.add', by: 'Ola', ts: 2, listId: 'L1', items: [
    { id: 'bag', name: 'Plecak', type: 'group' },
    { id: 'pocket', name: 'Kieszeń', type: 'group', parentId: 'bag' },
    { id: 'a', name: 'Ładowarka', parentId: 'pocket' },
    { id: 'b', name: 'Bluza', parentId: 'bag' },
    { id: 'c', name: 'Telefon' }
  ] });
  return st;
}

test('applyOp: zaznaczenie grupy zaznacza całe wnętrze, postęp liczy liście', () => {
  const st = setup();
  let t = buildTree(st.items.L1);
  assert.equal(t.total, 3);
  applyOp(st, { t: 'item.check', by: 'G', ts: 3, listId: 'L1', ids: ['bag'], done: true });
  t = buildTree(st.items.L1);
  assert.equal(t.done, 2);
  assert.ok(t.isDone('bag'));
  assert.ok(t.isDone('pocket'));
  assert.ok(!t.isDone('c'));
  assert.equal(st.items.L1.a.doneBy, 'G');
});

test('applyOp: usuwanie grupy usuwa zawartość, przenoszenie blokuje pętle', () => {
  const st = setup();
  applyOp(st, { t: 'item.move', by: 'G', ts: 3, listId: 'L1', id: 'bag', parentId: 'pocket' });
  assert.equal(st.items.L1.bag.parentId, null, 'pętla zablokowana');
  applyOp(st, { t: 'item.move', by: 'G', ts: 3, listId: 'L1', id: 'c', parentId: 'pocket' });
  assert.equal(st.items.L1.c.parentId, 'pocket');
  const r = applyOp(st, { t: 'item.delete', by: 'G', ts: 4, listId: 'L1', ids: ['bag'] });
  assert.deepEqual(Object.keys(st.items.L1), []);
  assert.ok(r.keys.has('items:L1'));
});

test('applyOp: clearDone, merge, setItems, sanityzacja', () => {
  const st = setup();
  applyOp(st, { t: 'item.check', by: 'G', ts: 3, listId: 'L1', ids: ['pocket'], done: true });
  applyOp(st, { t: 'list.clearDone', by: 'G', ts: 4, listId: 'L1' });
  assert.deepEqual(Object.keys(st.items.L1).sort(), ['b', 'bag', 'c']);
  applyOp(st, { t: 'list.create', by: 'Ola', ts: 5, list: { id: 'L2', name: 'Inne', kind: 'packing' }, items: [{ id: 'x', name: 'Plecak', type: 'group' }, { id: 'y', name: 'Czapka', parentId: 'x' }, { id: 'z', name: 'telefon' }] });
  applyOp(st, { t: 'list.merge', by: 'G', ts: 6, targetId: 'L1', sourceIds: ['L2'] });
  assert.ok(!st.lists.L2);
  assert.equal(st.items.L1.y.parentId, 'bag', 'Czapka trafiła do istniejącego plecaka');
  assert.equal(st.items.L1.c.qty, 2, 'duplikat zsumowany');
  assert.throws(() => applyOp(st, { t: 'evil' }));
  applyOp(st, { t: 'item.update', by: 'G', ts: 7, listId: 'L1', id: 'b', patch: { name: '<b>x</b>'.repeat(50), qty: 'abc', hacked: 1 } });
  assert.equal(st.items.L1.b.name.length, 80);
  assert.equal(st.items.L1.b.qty, null);
  assert.ok(!('hacked' in st.items.L1.b));
});

test('stan <-> klucze magazynu', () => {
  const st = setup();
  const entries = [];
  for (const k of ['meta', 'favs', 'list:L1', 'items:L1', 'hist:L1']) entries.push([k, valueForKey(st, k)]);
  const back = stateFromEntries(entries);
  assert.deepEqual(back.items.L1, st.items.L1);
  assert.deepEqual(back.lists, st.lists);
});

test('migracja starej wersji', () => {
  const st = migrateLegacy({
    lists: [{ id: 'old1', name: 'Stara', kind: 'todo', icon: '🎒', color: '#7f8c6a', updatedAt: 5 }, { id: 'old2', name: 'Sklep' }],
    items: { old1: [{ id: 'i1', name: 'Kurtka', qty: 1, unit: 'szt.', done: true }], old2: [{ id: 'i2', name: 'Jajka', count: 2, qty: 1 }] },
    templates: [{ id: 't1', name: 'Tpl', items: [{ name: 'Mleko', qty: 1, unit: 'szt.' }] }],
    favorites: { mleko: { name: 'Mleko', count: 3 } },
    notes: [{ id: 'n1', title: 'N', body: '<ul><li>raz</li><li>dwa</li></ul>', tiles: [{ text: 'kafel' }] }],
    shops: ['Lidl'], units: ['szt.']
  });
  assert.equal(st.lists.old1.kind, 'packing');
  assert.equal(st.items.old1.i1.done, true);
  assert.equal(st.items.old2.i2.qty, 2);
  assert.equal(Object.values(st.templates)[0].items[0].name, 'Mleko');
  assert.match(st.notes.n1.body, /raz\n- dwa[\s\S]*kafel/);
});

test('szablony wbudowane parsują się', () => {
  for (const t of BUILTIN_TEMPLATES) {
    const items = builtinTemplateItems(t, {});
    assert.ok(items.length > 5, t.name);
  }
  const w = builtinTemplateItems(BUILTIN_TEMPLATES[0], {});
  const tree = buildTree(Object.fromEntries(w.map((i) => [i.id, i])));
  assert.equal(tree.kids(null)[0].name, 'Plecak');
  assert.equal(tree.kids(tree.kids(null)[0].id).length, 3);
});
