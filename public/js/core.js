// =====================================================================
// Zakupy — wspólny rdzeń (działa i w przeglądarce, i w Durable Object)
//
// Cały stan aplikacji zmienia się WYŁĄCZNIE przez operacje ("opy")
// przepuszczone przez applyOp(). Ten sam kod liczy wynik na telefonie
// (natychmiast, optymistycznie) i na serwerze (autorytatywnie), więc
// obie strony zawsze dochodzą do identycznego stanu.
// =====================================================================

export const SCHEMA = 3;

export const KINDS = {
  shopping: { label: 'Zakupy', icon: '🛒', item: 'produkt', items: 'produkty', done: 'kupione', todo: 'do kupienia', verb: 'kupił(a)', unverb: 'odznaczył(a)', add: 'Dodaj produkt…' },
  packing: { label: 'Pakowanie', icon: '🎒', item: 'rzecz', items: 'rzeczy', done: 'spakowane', todo: 'do spakowania', verb: 'spakował(a)', unverb: 'wypakował(a)', add: 'Dodaj rzecz lub bagaż…' },
  todo: { label: 'Zadania', icon: '✅', item: 'zadanie', items: 'zadania', done: 'zrobione', todo: 'do zrobienia', verb: 'zrobił(a)', unverb: 'cofnął(ęła)', add: 'Dodaj zadanie…' }
};

export const DEFAULT_SHOPS = [
  'Lidl', 'Biedronka', 'Rossmann', 'Kaufland', 'Auchan', 'Carrefour', 'Dino', 'Żabka',
  'Action', 'Pepco', 'Media Expert', 'Decathlon', 'Leroy Merlin', 'Castorama', 'IKEA', 'Apteka'
];

export const DEFAULT_UNITS = ['szt.', 'kg', 'g', 'dag', 'l', 'ml', 'op.', 'opak.', 'paczka', 'butelka', 'puszka', 'słoik', 'para', 'm'];

export const DEFAULT_CATEGORIES = [
  'Warzywa i owoce', 'Pieczywo', 'Nabiał', 'Mięso i ryby', 'Wędliny', 'Mrożonki',
  'Spiżarnia', 'Przyprawy i sosy', 'Słodycze i przekąski', 'Napoje', 'Alkohol',
  'Chemia', 'Kosmetyki', 'Apteka', 'Dziecko', 'Zwierzęta', 'Dom i ogród', 'Elektronika', 'Inne'
];

export const DEFAULT_PEOPLE = ['Grzegorz', 'Ola'];

export const CATEGORY_EMOJI = {
  'Warzywa i owoce': '🥦', 'Pieczywo': '🍞', 'Nabiał': '🧀', 'Mięso i ryby': '🥩', 'Wędliny': '🥓',
  'Mrożonki': '🧊', 'Spiżarnia': '🥫', 'Przyprawy i sosy': '🧂', 'Słodycze i przekąski': '🍫',
  'Napoje': '🧃', 'Alkohol': '🍷', 'Chemia': '🧽', 'Kosmetyki': '🧴', 'Apteka': '💊', 'Dziecko': '🍼',
  'Zwierzęta': '🐾', 'Dom i ogród': '🏡', 'Elektronika': '🔌', 'Inne': '📦'
};

export const LIST_ICONS = ['🛒', '🎒', '🧳', '✅', '🏠', '🏖️', '⛺', '🎿', '🚗', '✈️', '🎁', '🎉', '🍳', '🐶', '👶', '🔧', '🌱', '💼', '🏋️', '📝'];
export const LIST_COLORS = ['#3f8f6b', '#2f7dd1', '#c0573e', '#c9952b', '#8a5cc7', '#d0517f', '#2a9aa8', '#6b7280'];
export const NOTE_COLORS = ['', '#fde68a', '#fecaca', '#bfdbfe', '#c7f0d8', '#e9d5ff'];

// ---------------------------------------------------------------------
// Rozpoznawanie kategorii i emoji
// ---------------------------------------------------------------------

const CATEGORY_RULES = [
  [/(pomidor|ogór|marchew|cebul|czosn|ziemniak|kapust|sałat|papryk|brokuł|kalafior|cukini|pietruszk|seler|por\b|rzodkiew|burak|szpinak|rukol|koper|szczypior|pieczark|grzyb|awokado|bakłażan|dyni|kukurydz(?!.*puszk)|fasolk|jabł|gruszk|banan|pomarańcz|mandaryn|cytryn|limonk|grejpfrut|winogro|truskaw|malin|borówk|jagod|wiśni|czereśn|śliwk|brzoskwi|morel|arbuz|melon|ananas|kiwi|mango|natk|owoc|warzyw|imbir)/i, 'Warzywa i owoce'],
  [/(chleb|bułk|bagiet|rogal|croissant|pieczyw|chałk|grahamk|tortill|pita|kajzerk)/i, 'Pieczywo'],
  [/(mlek|mleczk|ser\b|sera\b|serek|serki|twaróg|twarog|jogurt|kefir|maślank|śmietan|masło|masła|margaryn|jaj|mozzarell|parmezan|feta|skyr|budyń|kremówk)/i, 'Nabiał'],
  [/(kurczak|kurcz|indyk|wołow|wieprz|schab|karkówk|boczek(?! wędz)|mięs|mielon|filet|udk|skrzyd|łosoś|dorsz|tuńczyk|ryb|krewet|pstrąg|mintaj|śledź|żeberk|polędwic|wątrób)/i, 'Mięso i ryby'],
  [/(szynk|kiełbas|parówk|salami|wędlin|kabanos|pasztet|baleron|mortadel)/i, 'Wędliny'],
  [/(mrożon|lody|lodów|pizza mroż|frytki|pierogi mroż)/i, 'Mrożonki'],
  [/(makaron|spaghetti|penne|ryż|kasz|mąk|cukier|płatk|musli|owsian|olej|oliw|ocet|konserw|puszk|fasol|ciecierzyc|soczewic|groch|dżem|miód|nutell|kakao|bulion|mąka|bułka tarta|drożdż|proszek do piecz)/i, 'Spiżarnia'],
  [/(sól|pieprz|przypraw|ketchup|majonez|musztard|sos|bazyli|oregano|curry|papryk[ai] słodk|cynamon|vegeta|chrzan)/i, 'Przyprawy i sosy'],
  [/(czekolad|baton|cukierk|chips|chrupk|ciastk|wafl|paluszk|orzech|żelk|słodycz|herbatnik|popcorn|krakers|delicje|pierniki)/i, 'Słodycze i przekąski'],
  [/(woda|wody|sok|napój|napoje|cola|pepsi|fanta|sprite|lemoniad|kawa|kawy|herbat|izoton|energetyk|syrop)/i, 'Napoje'],
  [/(piwo|piwa|wino|wina|wódk|whisk|gin\b|rum\b|prosecco|szampan|nalewk|cydr)/i, 'Alkohol'],
  [/(płyn do|proszek|kapsułk|tabletki do zmyw|domestos|ręcznik papier|papier toalet|chusteczk|worki na śmie|gąbk|ścierk|odplamiacz|zmiękczacz|płyn do naczyń|cif|ajax|wybielacz|odkamieniacz|folia|zmywak)/i, 'Chemia'],
  [/(szampon|mydł|żel pod|dezodorant|antyperspir|past[ay] do zęb|szczoteczk|krem|balsam|odżywk|maszynk|pianka do gol|podpask|tampon|wacik|patyczk|kosmetyk|perfum|lakier|tusz|pomadk|nici dentyst)/i, 'Kosmetyki'],
  [/(lek|tablet|apap|ibuprom|witamin|syrop na|plaster|bandaż|termometr|krople|aspiryn|probiotyk|magnez|ból|elektrolit)/i, 'Apteka'],
  [/(pieluch|kaszk|smoczek|chusteczki naw|mleko modyf|słoiczek|butelka dla)/i, 'Dziecko'],
  [/(karma|karmy|żwirek|dla psa|dla kota|przysmak dla)/i, 'Zwierzęta'],
  [/(żarówk|bateri|kabel|ładowark|przedłużacz|słuchawk|powerbank|pendrive|myszk)/i, 'Elektronika'],
  [/(kwiat|ziemia do|doniczk|nawóz|świeczk|świec|ręcznik(?! papier)|pościel|serwetk|talerz|kubek|garnek|patelni)/i, 'Dom i ogród']
];

export function guessCategory(name) {
  const n = String(name || '');
  for (const [re, cat] of CATEGORY_RULES) if (re.test(n)) return cat;
  return '';
}

const EMOJI_RULES = [
  // bagaże i pojemniki
  [/plecak/i, '🎒'], [/walizk|bagaż/i, '🧳'], [/kosmetyczk|saszetk|nerk/i, '👝'], [/torb|torebk/i, '👜'],
  [/kieszeń|kieszon|przegród|komor/i, '🗂️'], [/pudeł|karton|skrzyn/i, '📦'], [/bagażnik|samoch|auto\b/i, '🚗'],
  [/apteczk/i, '🩹'], [/lodówk|termotorb/i, '🧊'], [/przy sobie|na sobie/i, '🧍'],
  // rzeczy do zabrania
  [/ładowark|kabel|przejściówk/i, '🔌'], [/powerbank|bateri/i, '🔋'], [/telefon|smartfon/i, '📱'], [/laptop|komputer/i, '💻'],
  [/słuchawk/i, '🎧'], [/aparat|kamer/i, '📷'], [/paszport/i, '🛂'], [/dowód|dokument|bilet|rezerwac/i, '🪪'],
  [/portfel|pieniąd|gotówk|karta/i, '👛'], [/klucz/i, '🔑'], [/okular/i, '🕶️'], [/kurtk|płaszcz/i, '🧥'],
  [/bluz|sweter/i, '🧶'], [/koszulk|t-shirt|koszul/i, '👕'], [/spodn|jeans|legginsy/i, '👖'], [/szort|kąpielówk/i, '🩳'],
  [/strój kąpiel|bikini/i, '👙'], [/sukienk/i, '👗'], [/skarpet/i, '🧦'], [/majtk|bielizn|bokserk/i, '🩲'],
  [/but|adidas|trampk/i, '👟'], [/klapk|japonk/i, '🩴'], [/czapk/i, '🧢'], [/rękawiczk/i, '🧤'], [/szalik/i, '🧣'],
  [/parasol/i, '☂️'], [/ręcznik(?! papier)/i, '🏖️'], [/szczoteczk/i, '🪥'], [/past[ay] do zęb/i, '🪥'],
  [/krem z filtr|filtr uv|krem do opal/i, '🧴'], [/książk|czytnik/i, '📖'], [/namiot/i, '⛺'], [/śpiwór|karimat/i, '🛏️'],
  [/latark|czołówk/i, '🔦'], [/zegarek/i, '⌚'], [/piżam/i, '🛌'], [/zabawk/i, '🧸'], [/gry\b|karty do gry/i, '🃏'],
  // jedzenie i zakupy
  [/mlek|mleczk/i, '🥛'], [/chleb|bułk|bagiet|pieczyw|kajzerk/i, '🍞'], [/croissant|rogal/i, '🥐'], [/jaj/i, '🥚'],
  [/ser\b|sera\b|serek|mozzarell|parmezan|feta/i, '🧀'], [/masło|masła/i, '🧈'], [/jogurt|kefir|skyr/i, '🥣'],
  [/banan/i, '🍌'], [/jabł/i, '🍎'], [/gruszk/i, '🍐'], [/pomarańcz|mandaryn/i, '🍊'], [/cytryn|limonk/i, '🍋'],
  [/winogro/i, '🍇'], [/truskaw/i, '🍓'], [/borówk|jagod/i, '🫐'], [/wiśni|czereśn/i, '🍒'], [/brzoskwi|morel/i, '🍑'],
  [/arbuz/i, '🍉'], [/melon/i, '🍈'], [/ananas/i, '🍍'], [/kiwi/i, '🥝'], [/mango/i, '🥭'], [/awokado/i, '🥑'],
  [/ziemniak/i, '🥔'], [/pomidor/i, '🍅'], [/ogór/i, '🥒'], [/marchew/i, '🥕'], [/cebul/i, '🧅'], [/czosn/i, '🧄'],
  [/papryk/i, '🫑'], [/brokuł/i, '🥦'], [/sałat|rukol|szpinak/i, '🥬'], [/kukurydz/i, '🌽'], [/pieczark|grzyb/i, '🍄'],
  [/bakłażan/i, '🍆'], [/kurczak|kurcz|udk|skrzyd/i, '🍗'], [/boczek|bekon/i, '🥓'],
  [/mięs|wołow|schab|karkówk|mielon|stek|żeberk|polędwic/i, '🥩'], [/ryb|łosoś|dorsz|tuńczyk|pstrąg|śledź/i, '🐟'],
  [/krewet/i, '🦐'], [/szynk|kiełbas|parówk|salami|kabanos|wędlin/i, '🌭'], [/makaron|spaghetti|penne/i, '🍝'],
  [/ryż/i, '🍚'], [/kasz|płatk|musli|owsian/i, '🥣'], [/mąk/i, '🌾'], [/cukier/i, '🧂'], [/sól|pieprz|przypraw/i, '🧂'],
  [/olej|oliw/i, '🫒'], [/miód/i, '🍯'], [/pizza/i, '🍕'], [/frytk/i, '🍟'], [/lod[óy]|lody/i, '🍦'],
  [/czekolad|baton/i, '🍫'], [/cukierk|żelk|słodycz/i, '🍬'], [/ciastk|herbatnik/i, '🍪'], [/ciast|tort/i, '🍰'],
  [/chips|chrupk|paluszk|popcorn/i, '🍿'], [/orzech/i, '🥜'], [/kawa|kawy/i, '☕'], [/herbat/i, '🍵'],
  [/sok|napój|lemoniad/i, '🧃'], [/woda|wody/i, '💧'], [/cola|pepsi|fanta|sprite/i, '🥤'], [/piwo|piwa/i, '🍺'],
  [/wino|wina|prosecco|szampan/i, '🍷'], [/wódk|whisk|gin\b|rum\b/i, '🥃'], [/pieluch/i, '👶'],
  [/szampon|mydł|żel pod|balsam|krem/i, '🧴'], [/papier toalet|ręcznik papier/i, '🧻'], [/proszek|płyn do prani|kapsułk/i, '🧺'],
  [/płyn do naczyń|gąbk|zmywak/i, '🧽'], [/żarówk/i, '💡'], [/kwiat/i, '💐'], [/karm|żwirek/i, '🐾'],
  [/lek|tablet|witamin|apap|ibuprom|aspiryn/i, '💊'], [/plaster|bandaż/i, '🩹'], [/świec/i, '🕯️'],
  [/prezent/i, '🎁'], [/zadzwo|telefon do/i, '📞'], [/zapła|rachun|opłat/i, '💸'], [/sprząt|odkurz/i, '🧹'],
  [/pranie|wyprać/i, '🧺'], [/umów|wizyt|lekarz/i, '🩺'], [/mail|napisz|wyślij/i, '✉️']
];

export function guessEmoji(name, type) {
  const n = String(name || '');
  for (const [re, e] of EMOJI_RULES) if (re.test(n)) return e;
  return type === 'group' ? '📁' : '';
}

export function itemEmoji(it) {
  if (it.emoji) return it.emoji;
  return guessEmoji(it.name, it.type) || (it.category && CATEGORY_EMOJI[it.category]) || '';
}

// ---------------------------------------------------------------------
// Pomocnicze
// ---------------------------------------------------------------------

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function norm(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
function isId(v) { return typeof v === 'string' && ID_RE.test(v); }
function str(v, max) { return (v === undefined || v === null ? '' : String(v)).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max); }
function text(v, max) { return (v === undefined || v === null ? '' : String(v)).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max); }
function numOrNull(v, min = 0, max = 1e7) {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n * 1000) / 1000));
}
function strArray(v, maxItems, maxLen) {
  if (!Array.isArray(v)) return [];
  const out = [];
  const seen = new Set();
  for (const x of v) {
    const s = str(x, maxLen);
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}
function color(v, fallback) { return typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : fallback; }
function dateStr(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; }

export function fmtQty(n) {
  if (n === null || n === undefined || n === '') return '';
  return String(Math.round(Number(n) * 1000) / 1000).replace('.', ',');
}

export function capitalize(s) {
  s = String(s || '');
  return s ? s.charAt(0).toLocaleUpperCase('pl-PL') + s.slice(1) : s;
}

// ---------------------------------------------------------------------
// Stan początkowy
// ---------------------------------------------------------------------

export function emptyState() {
  return {
    schema: SCHEMA,
    meta: {
      shops: DEFAULT_SHOPS.slice(),
      units: DEFAULT_UNITS.slice(),
      categories: DEFAULT_CATEGORIES.slice(),
      people: DEFAULT_PEOPLE.slice()
    },
    lists: {},      // id -> lista
    items: {},      // listId -> { itemId -> element }
    history: {},    // listId -> [{ ts, by, text }]
    templates: {},  // id -> szablon
    notes: {},      // id -> notatka
    favs: {}        // klucz (nazwa małymi) -> { name, count, last, shop, category, unit, price, kind }
  };
}

// ---------------------------------------------------------------------
// Sanityzacja
// ---------------------------------------------------------------------

const ITEM_TEXT_FIELDS = { name: 80, unit: 20, shop: 40, category: 40, note: 240, assignedTo: 40, emoji: 16 };

export function cleanItem(raw, fallbackId) {
  raw = raw || {};
  const it = {
    id: isId(raw.id) ? raw.id : (fallbackId || uid()),
    parentId: isId(raw.parentId) ? raw.parentId : null,
    type: raw.type === 'group' ? 'group' : 'item',
    name: str(raw.name, ITEM_TEXT_FIELDS.name) || 'Bez nazwy',
    emoji: str(raw.emoji, 16),
    qty: numOrNull(raw.qty, 0, 100000),
    unit: str(raw.unit, 20),
    shop: str(raw.shop, 40),
    category: str(raw.category, 40),
    note: str(raw.note, 240),
    price: numOrNull(raw.price, 0, 1000000),
    assignedTo: str(raw.assignedTo, 40),
    important: !!raw.important,
    done: !!raw.done,
    doneBy: str(raw.doneBy, 40),
    doneAt: Number.isFinite(raw.doneAt) ? raw.doneAt : 0,
    order: Number.isFinite(raw.order) ? raw.order : null,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : 0,
    createdBy: str(raw.createdBy, 40)
  };
  if (it.parentId === it.id) it.parentId = null;
  return it;
}

function cleanItemPatch(patch) {
  const out = {};
  if (!patch || typeof patch !== 'object') return out;
  for (const [k, max] of Object.entries(ITEM_TEXT_FIELDS)) {
    if (k in patch) out[k] = str(patch[k], max);
  }
  if ('name' in out && !out.name) delete out.name;
  if ('qty' in patch) out.qty = numOrNull(patch.qty, 0, 100000);
  if ('price' in patch) out.price = numOrNull(patch.price, 0, 1000000);
  if ('important' in patch) out.important = !!patch.important;
  if ('type' in patch) out.type = patch.type === 'group' ? 'group' : 'item';
  return out;
}

export function cleanList(raw, ts, by) {
  raw = raw || {};
  const kind = KINDS[raw.kind] ? raw.kind : 'shopping';
  return {
    id: isId(raw.id) ? raw.id : uid(),
    name: str(raw.name, 60) || 'Nowa lista',
    description: str(raw.description, 300),
    kind,
    icon: str(raw.icon, 16) || KINDS[kind].icon,
    color: color(raw.color, LIST_COLORS[0]),
    pinned: !!raw.pinned,
    archived: !!raw.archived,
    budget: numOrNull(raw.budget, 0, 10000000),
    dueDate: dateStr(raw.dueDate),
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : ts,
    createdBy: str(raw.createdBy, 40) || by,
    updatedAt: ts,
    updatedBy: by
  };
}

function cleanListPatch(patch) {
  const out = {};
  if (!patch || typeof patch !== 'object') return out;
  if ('name' in patch) { const n = str(patch.name, 60); if (n) out.name = n; }
  if ('description' in patch) out.description = str(patch.description, 300);
  if ('kind' in patch && KINDS[patch.kind]) out.kind = patch.kind;
  if ('icon' in patch) out.icon = str(patch.icon, 16);
  if ('color' in patch) out.color = color(patch.color, LIST_COLORS[0]);
  if ('pinned' in patch) out.pinned = !!patch.pinned;
  if ('archived' in patch) out.archived = !!patch.archived;
  if ('budget' in patch) out.budget = numOrNull(patch.budget, 0, 10000000);
  if ('dueDate' in patch) out.dueDate = dateStr(patch.dueDate);
  return out;
}

export function cleanTemplate(raw, ts) {
  raw = raw || {};
  const kind = KINDS[raw.kind] ? raw.kind : 'shopping';
  const items = Array.isArray(raw.items) ? raw.items.slice(0, 1500).map((x) => cleanItem({ ...x, done: false, doneBy: '', doneAt: 0, assignedTo: '' })) : [];
  fixTree(items);
  return {
    id: isId(raw.id) ? raw.id : uid(),
    name: str(raw.name, 60) || 'Szablon',
    kind,
    icon: str(raw.icon, 16) || KINDS[kind].icon,
    color: color(raw.color, LIST_COLORS[0]),
    items,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : ts,
    updatedAt: ts
  };
}

export function cleanNote(raw, ts, by) {
  raw = raw || {};
  return {
    id: isId(raw.id) ? raw.id : uid(),
    title: str(raw.title, 80),
    body: text(raw.body, 20000),
    color: NOTE_COLORS.includes(raw.color) ? raw.color : '',
    pinned: !!raw.pinned,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : ts,
    updatedAt: ts,
    updatedBy: by
  };
}

// Naprawia drzewo: rodzic musi istnieć i nie może być pętli.
function fixTree(items) {
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const it of items) {
    if (it.parentId && !byId.has(it.parentId)) it.parentId = null;
  }
  for (const it of items) {
    const seen = new Set([it.id]);
    let p = it.parentId;
    while (p) {
      if (seen.has(p)) { it.parentId = null; break; }
      seen.add(p);
      p = byId.get(p) ? byId.get(p).parentId : null;
    }
  }
  return items;
}

// ---------------------------------------------------------------------
// Drzewo
// ---------------------------------------------------------------------

export function sortItems(a, b) {
  const ao = a.order ?? a.createdAt ?? 0;
  const bo = b.order ?? b.createdAt ?? 0;
  return ao - bo || (a.createdAt || 0) - (b.createdAt || 0) || (a.id < b.id ? -1 : 1);
}

// Zwraca strukturę ułatwiającą rysowanie i liczenie postępu.
export function buildTree(itemsMap) {
  const all = Object.values(itemsMap || {});
  const byId = new Map(all.map((i) => [i.id, i]));
  const children = new Map();
  children.set(null, []);
  for (const it of all) {
    const p = it.parentId && byId.has(it.parentId) ? it.parentId : null;
    if (!children.has(p)) children.set(p, []);
    children.get(p).push(it);
  }
  for (const arr of children.values()) arr.sort(sortItems);

  const stats = new Map();
  const visiting = new Set();
  function calc(id) {
    if (stats.has(id)) return stats.get(id);
    if (visiting.has(id)) return { total: 0, done: 0, isDone: false };
    visiting.add(id);
    const kids = children.get(id) || [];
    const it = byId.get(id);
    let res;
    if (!kids.length) {
      res = { total: 1, done: it && it.done ? 1 : 0, isDone: !!(it && it.done) };
    } else {
      let total = 0, done = 0;
      for (const k of kids) { const s = calc(k.id); total += s.total; done += s.done; }
      res = { total, done, isDone: total > 0 && done === total };
    }
    visiting.delete(id);
    stats.set(id, res);
    return res;
  }
  let total = 0, done = 0;
  for (const it of children.get(null)) { const s = calc(it.id); total += s.total; done += s.done; }
  for (const it of all) calc(it.id);

  return {
    byId,
    children,
    stats,
    total,
    done,
    kids: (id) => children.get(id ?? null) || [],
    isDone: (id) => (stats.get(id) || {}).isDone || false,
    path(id) {
      const out = [];
      const seen = new Set();
      let cur = byId.get(id);
      while (cur && !seen.has(cur.id)) { seen.add(cur.id); out.unshift(cur); cur = cur.parentId ? byId.get(cur.parentId) : null; }
      return out;
    },
    descendants(id) {
      const out = [];
      const stack = [...(children.get(id) || [])];
      while (stack.length) { const n = stack.pop(); out.push(n); stack.push(...(children.get(n.id) || [])); }
      return out;
    },
    depth(id) { return this.path(id).length - 1; }
  };
}

export function listSummary(itemsMap) {
  const t = buildTree(itemsMap);
  let spent = 0, planned = 0;
  for (const it of t.byId.values()) {
    if (it.price) { planned += it.price; if (it.done) spent += it.price; }
  }
  return { total: t.total, done: t.done, spent, planned };
}

function descendantIds(itemsMap, ids) {
  const all = Object.values(itemsMap);
  const kids = new Map();
  for (const it of all) {
    if (!it.parentId) continue;
    if (!kids.has(it.parentId)) kids.set(it.parentId, []);
    kids.get(it.parentId).push(it.id);
  }
  const out = new Set();
  const stack = ids.filter((id) => itemsMap[id]);
  while (stack.length) {
    const id = stack.pop();
    if (out.has(id)) continue;
    out.add(id);
    for (const k of kids.get(id) || []) stack.push(k);
  }
  return out;
}

function nextOrder(itemsMap, parentId) {
  let max = 0;
  for (const it of Object.values(itemsMap)) {
    if ((it.parentId || null) === (parentId || null) && Number.isFinite(it.order) && it.order > max) max = it.order;
  }
  return max + 1;
}

// ---------------------------------------------------------------------
// Parser pojedynczej linijki: "2 kg ziemniaki @Lidl #warzywa (młode) !"
// ---------------------------------------------------------------------

const UNIT_ALIASES = {
  'szt': 'szt.', 'sztuk': 'szt.', 'sztuki': 'szt.', 'sztuka': 'szt.', 'x': 'szt.',
  'op': 'op.', 'opak': 'opak.', 'opakowanie': 'op.', 'opakowania': 'op.', 'opakowań': 'op.',
  'kilo': 'kg', 'kg.': 'kg', 'gr': 'g', 'gram': 'g', 'gramów': 'g', 'litr': 'l', 'litry': 'l', 'litrów': 'l', 'ltr': 'l',
  'paczki': 'paczka', 'paczek': 'paczka', 'butelki': 'butelka', 'butelek': 'butelka', 'puszki': 'puszka', 'puszek': 'puszka',
  'słoiki': 'słoik', 'słoików': 'słoik', 'pary': 'para', 'par': 'para', 'dag.': 'dag', 'deko': 'dag'
};

function matchUnit(token, units) {
  const t = token.toLowerCase();
  for (const u of units) if (u.toLowerCase() === t || u.toLowerCase().replace(/\.$/, '') === t.replace(/\.$/, '')) return u;
  if (UNIT_ALIASES[t]) return UNIT_ALIASES[t];
  return null;
}

const NUM = '(\\d+(?:[.,]\\d+)?|\\d+\\/\\d+)';
function toNum(s) {
  if (s.includes('/')) { const [a, b] = s.split('/').map(Number); return b ? a / b : null; }
  return Number(s.replace(',', '.'));
}

export function parseLine(input, meta = {}) {
  const units = meta.units || DEFAULT_UNITS;
  const shops = meta.shops || DEFAULT_SHOPS;
  const categories = meta.categories || DEFAULT_CATEGORIES;
  let s = String(input || '').replace(/\s+/g, ' ').trim();
  const out = { name: '', qty: null, unit: '', shop: '', category: '', note: '', important: false };

  // ważne: "!" na początku lub na końcu
  if (/^!+\s*/.test(s)) { out.important = true; s = s.replace(/^!+\s*/, ''); }
  if (/\s*!+$/.test(s)) { out.important = true; s = s.replace(/\s*!+$/, ''); }

  // notatka w nawiasie
  const noteM = s.match(/\(([^)]*)\)/);
  if (noteM) { out.note = noteM[1].trim(); s = (s.slice(0, noteM.index) + ' ' + s.slice(noteM.index + noteM[0].length)).trim(); }

  // sklep: @Sklep — dopasuj najdłuższą znaną nazwę (obsługuje "@Media Expert")
  const atIdx = s.search(/(^|\s)@/);
  if (atIdx >= 0) {
    const start = s.indexOf('@', atIdx);
    const rest = s.slice(start + 1);
    let found = null;
    for (const shop of [...shops].sort((a, b) => b.length - a.length)) {
      const low = shop.toLowerCase();
      const r = rest.toLowerCase();
      if (r.startsWith(low) && (r.length === low.length || /[\s,#!]/.test(r[low.length]))) { found = shop; break; }
      const dashed = low.replace(/\s+/g, '-');
      if (r.startsWith(dashed) && (r.length === dashed.length || /[\s,#!]/.test(r[dashed.length]))) { found = shop; break; }
    }
    let consumed;
    if (found) {
      out.shop = found;
      consumed = found.length;
    } else {
      const w = rest.match(/^[^\s#]+/);
      out.shop = w ? capitalize(w[0].replace(/-/g, ' ')) : '';
      consumed = w ? w[0].length : 0;
    }
    s = (s.slice(0, start) + ' ' + s.slice(start + 1 + consumed)).replace(/\s+/g, ' ').trim();
  }

  // kategoria: #kategoria
  const hashM = s.match(/(^|\s)#([^\s#@]+(?:\s+(?:i|and)\s+[^\s#@]+)?)/);
  if (hashM) {
    const raw = hashM[2].replace(/-/g, ' ').toLowerCase();
    const cat = categories.find((c) => c.toLowerCase() === raw) || categories.find((c) => c.toLowerCase().startsWith(raw));
    out.category = cat || capitalize(raw);
    s = (s.slice(0, hashM.index) + ' ' + s.slice(hashM.index + hashM[0].length)).replace(/\s+/g, ' ').trim();
  }

  // ilość na początku: "2x", "2 x", "x2", "2 kg", "1,5l", "500g", "2"
  let m;
  if ((m = s.match(new RegExp('^' + NUM + '\\s*[x×*]\\s+(.+)$', 'i')))) {
    out.qty = toNum(m[1]); s = m[2];
  } else if ((m = s.match(new RegExp('^[x×]\\s*' + NUM + '\\s+(.+)$', 'i')))) {
    out.qty = toNum(m[1]); s = m[2];
  } else if ((m = s.match(new RegExp('^' + NUM + '\\s*([A-Za-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ.]+)\\s+(.+)$')))) {
    const u = matchUnit(m[2], units);
    if (u) { out.qty = toNum(m[1]); out.unit = u === 'szt.' && /^x$/i.test(m[2]) ? '' : u; s = m[3]; }
    else if (/^\d+$/.test(m[1])) { out.qty = toNum(m[1]); s = m[2] + ' ' + m[3]; }
  } else if ((m = s.match(new RegExp('^' + NUM + '\\s+(.+)$')))) {
    out.qty = toNum(m[1]); s = m[2];
  }

  // ilość na końcu: "mleko x2", "mleko 2 szt", "mleko 2l", "mleko *3"
  if (out.qty === null) {
    if ((m = s.match(new RegExp('^(.+?)\\s+[x×*]\\s*' + NUM + '$', 'i')))) {
      out.qty = toNum(m[2]); s = m[1];
    } else if ((m = s.match(new RegExp('^(.+?)\\s+' + NUM + '\\s*[x×]$', 'i')))) {
      out.qty = toNum(m[2]); s = m[1];
    } else if ((m = s.match(new RegExp('^(.+?)\\s+' + NUM + '\\s*([A-Za-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ.]+)$')))) {
      const u = matchUnit(m[3], units);
      if (u) { out.qty = toNum(m[2]); out.unit = u; s = m[1]; }
    }
  }

  if (out.qty !== null && (!Number.isFinite(out.qty) || out.qty <= 0)) out.qty = null;
  out.name = capitalize(s.replace(/\s+/g, ' ').replace(/^[-–•*,;:\s]+|[,;\s]+$/g, '').trim()).slice(0, 80);
  return out;
}

export function formatLine(it) {
  let s = '';
  if (it.qty !== null && it.qty !== undefined && !(it.qty === 1 && !it.unit)) {
    s += fmtQty(it.qty) + (it.unit ? ' ' + it.unit : 'x') + ' ';
  }
  s += it.name;
  if (it.note) s += ' (' + it.note.replace(/[()]/g, '') + ')';
  if (it.shop) s += ' @' + it.shop;
  if (it.category) s += ' #' + it.category.replace(/\s+/g, '-');
  if (it.important) s += ' !';
  return s;
}

// ---------------------------------------------------------------------
// Konspekt (tryb pisania): wcięcia = zagnieżdżenie, "Plecak:" = bagaż
// ---------------------------------------------------------------------

export function parseOutline(input, meta = {}) {
  const lines = String(input || '').replace(/\r/g, '').split('\n');
  const nodes = [];
  const stack = []; // { indent, node }
  for (let raw of lines) {
    if (!raw.trim()) continue;
    raw = raw.replace(/\t/g, '  ');
    let indent = raw.match(/^\s*/)[0].length;
    let body = raw.trim();
    // "> > rzecz" też oznacza zagnieżdżenie
    const gt = body.match(/^((?:>\s*)+)/);
    if (gt) { indent += (gt[1].match(/>/g).length) * 2; body = body.slice(gt[1].length).trim(); }
    // punktory
    body = body.replace(/^([-*•–]|\d+[.)])\s+/, '');
    let done = false;
    const chk = body.match(/^\[([ xXvV✓✔]?)\]\s*/);
    if (chk) { done = /[xXvV✓✔]/.test(chk[1]); body = body.slice(chk[0].length); }
    else if (/^[✓✔☑]\s*/.test(body)) { done = true; body = body.replace(/^[✓✔☑]\s*/, ''); }
    else if (/^☐\s*/.test(body)) { body = body.replace(/^☐\s*/, ''); }
    let isGroup = false;
    if (/:\s*$/.test(body)) { isGroup = true; body = body.replace(/:\s*$/, ''); }
    if (!body.trim()) continue;

    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack.length ? stack[stack.length - 1].node : null;
    const f = isGroup ? { name: capitalize(body.trim()).slice(0, 80), qty: null, unit: '', shop: '', category: '', note: '', important: false } : parseLine(body, meta);
    if (!f.name) continue;
    const node = { tmp: nodes.length, parent: parent ? parent.tmp : null, type: isGroup ? 'group' : 'item', done, ...f };
    if (parent) parent.type = 'group';
    nodes.push(node);
    stack.push({ indent, node });
  }
  return nodes;
}

export function serializeOutline(itemsMap) {
  const tree = buildTree(itemsMap);
  const out = [];
  const walk = (parentId, depth) => {
    for (const it of tree.kids(parentId)) {
      const hasKids = tree.kids(it.id).length > 0;
      const pad = '  '.repeat(depth);
      if (it.type === 'group' || hasKids) {
        out.push(pad + (!hasKids && it.done ? '[x] ' : '') + it.name + ':');
        walk(it.id, depth + 1);
      } else {
        out.push(pad + (it.done ? '[x] ' : '') + formatLine(it));
      }
    }
  };
  walk(null, 0);
  return out.join('\n');
}

// Łączy konspekt z istniejącymi elementami — zachowuje id, odhaczenia,
// ceny i przypisania dla rzeczy, które się nie zmieniły (lub tylko przeniosły).
export function mergeOutline(existingMap, nodes, opts = {}) {
  const ts = opts.ts || Date.now();
  const by = opts.by || '';
  const old = Object.values(existingMap || {});
  const used = new Set();
  const tmpToId = new Map();
  const orderCounter = new Map();
  const result = [];
  for (const n of nodes) {
    const parentId = n.parent === null ? null : tmpToId.get(n.parent) || null;
    const key = norm(n.name);
    let match = old.find((o) => !used.has(o.id) && (o.parentId || null) === parentId && norm(o.name) === key);
    if (!match) match = old.find((o) => !used.has(o.id) && norm(o.name) === key && o.type === n.type);
    const ord = (orderCounter.get(parentId) || 0) + 1;
    orderCounter.set(parentId, ord);
    let it;
    if (match) {
      used.add(match.id);
      it = { ...match };
    } else {
      it = { id: uid(), createdAt: ts, createdBy: by, price: null, assignedTo: '', emoji: '', doneBy: '', doneAt: 0 };
    }
    Object.assign(it, {
      parentId, type: n.type, name: n.name, qty: n.qty, unit: n.unit, shop: n.shop, category: n.category || (opts.autoCategory ? guessCategory(n.name) : ''),
      note: n.note, important: n.important, order: ord
    });
    if (n.done && !it.done) { it.done = true; it.doneBy = by; it.doneAt = ts; }
    if (!n.done && it.done) { it.done = false; it.doneBy = ''; it.doneAt = 0; }
    tmpToId.set(n.tmp, it.id);
    result.push(it);
  }
  // grupy z dziećmi nie trzymają własnego "done"
  const parents = new Set(result.map((r) => r.parentId).filter(Boolean));
  for (const r of result) if (parents.has(r.id)) { r.done = false; r.doneBy = ''; r.doneAt = 0; }
  return result;
}

// Kopiuje elementy (np. z szablonu) z nowymi id, zachowując strukturę.
export function cloneItems(items, opts = {}) {
  const ts = opts.ts || Date.now();
  const map = new Map();
  for (const it of items) map.set(it.id, uid());
  return items.map((it) => ({
    ...it,
    id: map.get(it.id),
    parentId: it.parentId && map.has(it.parentId) ? map.get(it.parentId) : (opts.parentId || null),
    done: opts.keepDone ? !!it.done : false,
    doneBy: opts.keepDone ? it.doneBy : '',
    doneAt: opts.keepDone ? it.doneAt : 0,
    assignedTo: opts.keepAssigned ? it.assignedTo : '',
    createdAt: ts,
    createdBy: opts.by || ''
  }));
}

// ---------------------------------------------------------------------
// Szablony wbudowane (zapisane jako konspekt — łatwo je rozbudować)
// ---------------------------------------------------------------------

export const BUILTIN_TEMPLATES = [
  {
    id: 'b-weekend', name: 'Weekend z plecakiem', kind: 'packing', icon: '🎒', color: '#2a9aa8',
    outline: `Plecak:
  Duża komora:
    Kurtka przeciwdeszczowa
    Bluza
    2x Koszulka
    Spodnie na zmianę
    3 para Skarpetki
    3x Bielizna
    Piżama
  Mała kieszeń:
    Ładowarka do telefonu
    Powerbank
    Słuchawki
    Chusteczki
  Kieszeń boczna:
    Butelka na wodę
    Parasol
Kosmetyczka:
  Szczoteczka do zębów
  Pasta do zębów
  Dezodorant
  Szampon
  Leki
Przy sobie:
  Telefon
  Portfel
  Dowód osobisty
  Klucze`
  },
  {
    id: 'b-wakacje', name: 'Wakacje z walizką', kind: 'packing', icon: '🏖️', color: '#c9952b',
    outline: `Walizka:
  Ubrania:
    5x Koszulka
    2x Szorty
    Długie spodnie
    Bluza
    Sukienka / koszula
    7x Bielizna
    7 para Skarpetki
    Piżama
  Plaża:
    Strój kąpielowy
    Ręcznik plażowy
    Klapki
    Krem z filtrem
    Okulary przeciwsłoneczne
    Czapka
  Buty:
    Sandały
    Wygodne buty
Kosmetyczka:
  Szczoteczka do zębów
  Pasta do zębów
  Szampon
  Żel pod prysznic
  Dezodorant
  Maszynka do golenia
Apteczka:
  Leki przeciwbólowe
  Plastry
  Środek na komary
  Leki na żołądek
Plecak podręczny:
  Mała kieszeń:
    Paszport / dowód
    Bilety i rezerwacje
    Karta płatnicza
    Gotówka
  Elektronika:
    Telefon
    Ładowarka
    Powerbank
    Słuchawki
    Przejściówka do gniazdka
  Książka / czytnik
  Przekąski
Przed wyjazdem:
  Wyłączyć gaz i wodę
  Podlać kwiaty
  Wynieść śmieci
  Zamknąć okna`
  },
  {
    id: 'b-basen', name: 'Basen / siłownia', kind: 'packing', icon: '🏋️', color: '#2f7dd1',
    outline: `Torba sportowa:
  Strój kąpielowy / sportowy
  Ręcznik
  Klapki
  Czepek
  Okularki
  Kosmetyczka:
    Żel pod prysznic
    Szampon
    Dezodorant
  Butelka na wodę
  Karnet
  Kłódka do szafki`
  },
  {
    id: 'b-tydzien', name: 'Tygodniowe zakupy', kind: 'shopping', icon: '🛒', color: '#3f8f6b',
    outline: `2 l Mleko
Chleb
10x Jajka
Masło
Ser żółty
Jogurt naturalny
1 kg Ziemniaki
Pomidory
Ogórki
Cebula
Banany
Jabłka
Kurczak
Makaron
Ryż
Kawa
Herbata
Papier toaletowy
Płyn do naczyń`
  },
  {
    id: 'b-grill', name: 'Grill ze znajomymi', kind: 'shopping', icon: '🔥', color: '#c0573e',
    outline: `2 kg Karkówka
Kiełbasa
Kurczak
Węgiel drzewny
Podpałka
Pieczywo
Ketchup
Musztarda
Warzywa na sałatkę
Piwo
Woda
Sok
Talerzyki i kubki
Serwetki`
  },
  {
    id: 'b-przeprowadzka', name: 'Przeprowadzka', kind: 'todo', icon: '📦', color: '#8a5cc7',
    outline: `Miesiąc przed:
  Zamówić transport
  Wypowiedzieć umowy
  Zebrać kartony
Tydzień przed:
  Spakować kuchnię
  Spakować książki
  Przepisać liczniki
Dzień przeprowadzki:
  Spisać liczniki
  Oddać klucze
  Sprawdzić wszystkie szafki`
  }
];

export function builtinTemplateItems(tpl, meta) {
  const nodes = parseOutline(tpl.outline, meta);
  return mergeOutline({}, nodes, { autoCategory: tpl.kind === 'shopping' });
}

// ---------------------------------------------------------------------
// REDUCER — jedyne miejsce, które zmienia stan
// ---------------------------------------------------------------------

export const OP_TYPES = [
  'list.create', 'list.update', 'list.delete', 'list.merge', 'list.setItems', 'list.clearDone',
  'item.add', 'item.update', 'item.check', 'item.delete', 'item.move', 'item.patchMany',
  'meta.update', 'tpl.save', 'tpl.delete', 'note.save', 'note.update', 'note.delete', 'fav.delete'
];

const MAX_HISTORY = 60;
const MAX_FAVS = 800;
const MAX_ITEMS_PER_LIST = 2000;

function pushHistory(state, listId, ts, by, text) {
  if (!state.history[listId]) state.history[listId] = [];
  state.history[listId].unshift({ ts, by, text });
  if (state.history[listId].length > MAX_HISTORY) state.history[listId].length = MAX_HISTORY;
}

function bumpFav(state, it, kind, ts) {
  if (it.type === 'group') return;
  const key = norm(it.name);
  if (!key) return;
  const f = state.favs[key] || { name: it.name, count: 0 };
  f.name = it.name;
  f.count = (f.count || 0) + 1;
  f.last = ts;
  f.kind = kind;
  if (it.shop) f.shop = it.shop;
  if (it.category) f.category = it.category;
  if (it.unit) f.unit = it.unit;
  if (it.price) f.price = it.price;
  state.favs[key] = f;
  const keys = Object.keys(state.favs);
  if (keys.length > MAX_FAVS) {
    keys.sort((a, b) => (state.favs[a].last || 0) - (state.favs[b].last || 0));
    for (const k of keys.slice(0, keys.length - MAX_FAVS)) delete state.favs[k];
  }
}

function touch(state, listId, ts, by) {
  const l = state.lists[listId];
  if (l) { l.updatedAt = ts; l.updatedBy = by; }
}

function quote(s) { return '„' + s + '”'; }

/**
 * Stosuje operację do stanu (mutuje go).
 * Zwraca { keys:Set<string>, log?:string, listId?:string } albo rzuca błąd.
 * keys to klucze magazynu, które trzeba zapisać na serwerze.
 */
export function applyOp(state, op) {
  if (!op || typeof op !== 'object' || !OP_TYPES.includes(op.t)) throw new Error('Nieznana operacja');
  const ts = Number.isFinite(op.ts) ? op.ts : Date.now();
  const by = str(op.by, 40) || 'Ktoś';
  const keys = new Set();
  const res = { keys, log: '', listId: null };
  const listKeys = (id) => { keys.add('list:' + id); keys.add('items:' + id); keys.add('hist:' + id); };

  switch (op.t) {
    case 'list.create': {
      const list = cleanList(op.list, ts, by);
      if (state.lists[list.id]) throw new Error('Lista już istnieje');
      state.lists[list.id] = list;
      const map = {};
      const items = Array.isArray(op.items) ? op.items.slice(0, MAX_ITEMS_PER_LIST) : [];
      const cleaned = fixTree(items.map((x) => cleanItem(x)));
      let ord = 0;
      for (const it of cleaned) {
        if (!Number.isFinite(it.order)) it.order = ++ord;
        if (!it.createdAt) it.createdAt = ts;
        map[it.id] = it;
      }
      state.items[list.id] = map;
      pushHistory(state, list.id, ts, by, `${by} utworzył(a) listę`);
      listKeys(list.id);
      res.listId = list.id;
      res.log = `${by} utworzył(a) listę ${quote(list.name)}`;
      break;
    }
    case 'list.update': {
      const list = state.lists[op.id];
      if (!list) return res;
      const patch = cleanListPatch(op.patch);
      const wasArchived = list.archived;
      Object.assign(list, patch);
      if (!list.icon) list.icon = KINDS[list.kind].icon;
      touch(state, list.id, ts, by);
      keys.add('list:' + list.id);
      res.listId = list.id;
      if ('archived' in patch && patch.archived !== wasArchived) {
        res.log = `${by} ${patch.archived ? 'zarchiwizował(a)' : 'przywrócił(a)'} listę ${quote(list.name)}`;
        pushHistory(state, list.id, ts, by, res.log);
        keys.add('hist:' + list.id);
      }
      break;
    }
    case 'list.delete': {
      const list = state.lists[op.id];
      if (!list) return res;
      delete state.lists[op.id];
      delete state.items[op.id];
      delete state.history[op.id];
      listKeys(op.id);
      res.log = `${by} usunął(ęła) listę ${quote(list.name)}`;
      break;
    }
    case 'list.merge': {
      const target = state.lists[op.targetId];
      if (!target) return res;
      const tItems = state.items[target.id] || (state.items[target.id] = {});
      const sources = (Array.isArray(op.sourceIds) ? op.sourceIds : []).filter((id) => id !== target.id && state.lists[id]);
      for (const sid of sources) {
        const sItems = state.items[sid] || {};
        const sTree = buildTree(sItems);
        // elementy z korzenia źródła trafiają do korzenia celu; zagnieżdżenie zostaje
        const walk = (parentId, newParent) => {
          for (const it of sTree.kids(parentId)) {
            const hasKids = sTree.kids(it.id).length > 0;
            const existing = Object.values(tItems).find((t) => (t.parentId || null) === newParent && norm(t.name) === norm(it.name) && (t.shop || '') === (it.shop || '') && t.type === it.type);
            if (existing && !hasKids && existing.type === 'item') {
              if ((existing.unit || '') === (it.unit || '')) existing.qty = (existing.qty || 1) + (it.qty || 1);
              existing.done = existing.done && it.done;
            } else if (existing && existing.type === 'group') {
              walk(it.id, existing.id);
            } else {
              const copy = { ...it, parentId: newParent, order: nextOrder(tItems, newParent) };
              if (tItems[copy.id]) copy.id = uid();
              tItems[copy.id] = copy;
              if (hasKids) walk(it.id, copy.id);
            }
          }
        };
        walk(null, null);
        delete state.lists[sid];
        delete state.items[sid];
        delete state.history[sid];
        listKeys(sid);
      }
      touch(state, target.id, ts, by);
      res.log = `${by} połączył(a) ${sources.length} list(y) z ${quote(target.name)}`;
      pushHistory(state, target.id, ts, by, res.log);
      listKeys(target.id);
      res.listId = target.id;
      break;
    }
    case 'list.setItems': {
      const list = state.lists[op.listId];
      if (!list) return res;
      const items = Array.isArray(op.items) ? op.items.slice(0, MAX_ITEMS_PER_LIST) : [];
      const cleaned = fixTree(items.map((x) => cleanItem(x)));
      const prev = state.items[list.id] || {};
      const map = {};
      for (const it of cleaned) {
        if (!it.createdAt) it.createdAt = ts;
        if (!prev[it.id]) bumpFav(state, it, list.kind, ts);
        map[it.id] = it;
      }
      state.items[list.id] = map;
      touch(state, list.id, ts, by);
      res.log = `${by} zmienił(a) listę ${quote(list.name)} w trybie pisania`;
      pushHistory(state, list.id, ts, by, res.log);
      listKeys(list.id);
      keys.add('favs');
      res.listId = list.id;
      break;
    }
    case 'list.clearDone': {
      const list = state.lists[op.listId];
      const items = state.items[op.listId];
      if (!list || !items) return res;
      const tree = buildTree(items);
      let removed = 0;
      // usuń odhaczone liście; potem puste grupy, które były w całości odhaczone
      for (const it of Object.values(items)) {
        if (tree.isDone(it.id) && !tree.kids(it.id).length) { delete items[it.id]; removed++; }
      }
      let again = true;
      while (again) {
        again = false;
        const t2 = buildTree(items);
        for (const it of Object.values(items)) {
          if (it.type === 'group' && !t2.kids(it.id).length && tree.isDone(it.id)) { delete items[it.id]; removed++; again = true; }
        }
      }
      if (!removed) return res;
      touch(state, list.id, ts, by);
      res.log = `${by} usunął(ęła) ${removed} odhaczonych z ${quote(list.name)}`;
      pushHistory(state, list.id, ts, by, res.log);
      listKeys(list.id);
      res.listId = list.id;
      break;
    }
    case 'item.add': {
      const list = state.lists[op.listId];
      if (!list) return res;
      const items = state.items[list.id] || (state.items[list.id] = {});
      const incoming = Array.isArray(op.items) ? op.items.slice(0, 500) : [];
      if (Object.keys(items).length + incoming.length > MAX_ITEMS_PER_LIST) throw new Error('Za dużo elementów na liście');
      const added = [];
      const newIds = new Set(incoming.map((x) => x && x.id).filter(Boolean));
      for (const raw of incoming) {
        const it = cleanItem(raw);
        if (items[it.id]) continue;
        if (it.parentId && !items[it.parentId] && !newIds.has(it.parentId)) it.parentId = null;
        if (!Number.isFinite(it.order)) it.order = nextOrder(items, it.parentId);
        if (!it.createdAt) it.createdAt = ts;
        if (!it.createdBy) it.createdBy = by;
        items[it.id] = it;
        added.push(it);
        bumpFav(state, it, list.kind, ts);
      }
      if (!added.length) return res;
      fixTree(Object.values(items));
      touch(state, list.id, ts, by);
      const parent = added[0].parentId && items[added[0].parentId];
      const where = parent ? ` do ${quote(parent.name)}` : '';
      res.log = added.length === 1
        ? `${by} dodał(a) ${quote(added[0].name)}${where}`
        : `${by} dodał(a) ${added.length} pozycji${where}`;
      pushHistory(state, list.id, ts, by, res.log);
      listKeys(list.id);
      keys.add('favs');
      res.listId = list.id;
      break;
    }
    case 'item.update': {
      const items = state.items[op.listId];
      const it = items && items[op.id];
      if (!it) return res;
      const patch = cleanItemPatch(op.patch);
      Object.assign(it, patch);
      if (patch.price && state.lists[op.listId]) {
        const f = state.favs[norm(it.name)];
        if (f) { f.price = patch.price; keys.add('favs'); }
      }
      touch(state, op.listId, ts, by);
      keys.add('list:' + op.listId); keys.add('items:' + op.listId);
      res.listId = op.listId;
      break;
    }
    case 'item.check': {
      const list = state.lists[op.listId];
      const items = state.items[op.listId];
      if (!list || !items) return res;
      const ids = Array.isArray(op.ids) ? op.ids : [op.id];
      const all = descendantIds(items, ids);
      const done = !!op.done;
      let n = 0;
      for (const id of all) {
        const it = items[id];
        if (!it || it.done === done) continue;
        it.done = done;
        it.doneBy = done ? by : '';
        it.doneAt = done ? ts : 0;
        n++;
      }
      if (!n && !all.size) return res;
      touch(state, list.id, ts, by);
      const k = KINDS[list.kind];
      if (ids.length === 1 && items[ids[0]]) {
        res.log = `${by} ${done ? k.verb : k.unverb} ${quote(items[ids[0]].name)}`;
      } else {
        res.log = done ? `${by} odhaczył(a) ${n} pozycji` : `${by} odznaczył(a) ${n} pozycji`;
      }
      if (op.silent) res.log = '';
      else pushHistory(state, list.id, ts, by, res.log);
      listKeys(list.id);
      res.listId = list.id;
      break;
    }
    case 'item.delete': {
      const list = state.lists[op.listId];
      const items = state.items[op.listId];
      if (!list || !items) return res;
      const ids = Array.isArray(op.ids) ? op.ids : [op.id];
      const all = descendantIds(items, ids);
      if (!all.size) return res;
      const first = items[ids[0]];
      for (const id of all) delete items[id];
      touch(state, list.id, ts, by);
      res.log = all.size === 1 && first ? `${by} usunął(ęła) ${quote(first.name)}` : `${by} usunął(ęła) ${all.size} pozycji`;
      pushHistory(state, list.id, ts, by, res.log);
      listKeys(list.id);
      res.listId = list.id;
      break;
    }
    case 'item.move': {
      const list = state.lists[op.listId];
      const items = state.items[op.listId];
      const it = items && items[op.id];
      if (!it) return res;
      let parentId = isId(op.parentId) && items[op.parentId] ? op.parentId : null;
      // nie wolno włożyć elementu do własnego wnętrza
      if (parentId && descendantIds(items, [it.id]).has(parentId)) return res;
      const changedParent = (it.parentId || null) !== parentId;
      it.parentId = parentId;
      it.order = Number.isFinite(op.order) ? op.order : nextOrder(items, parentId);
      if (parentId && items[parentId].type !== 'group') items[parentId].type = 'group';
      touch(state, list.id, ts, by);
      if (changedParent) {
        res.log = `${by} przeniósł(a) ${quote(it.name)} ${parentId ? 'do ' + quote(items[parentId].name) : 'na główny poziom'}`;
        pushHistory(state, list.id, ts, by, res.log);
      }
      listKeys(list.id);
      res.listId = list.id;
      break;
    }
    case 'item.patchMany': {
      const items = state.items[op.listId];
      if (!items) return res;
      const patch = cleanItemPatch(op.patch);
      delete patch.name; delete patch.type;
      let n = 0;
      for (const id of Array.isArray(op.ids) ? op.ids : []) {
        if (items[id]) { Object.assign(items[id], patch); n++; }
      }
      if (!n) return res;
      touch(state, op.listId, ts, by);
      const what = Object.keys(patch).map((k) => ({ shop: 'sklep', category: 'kategorię', assignedTo: 'osobę', unit: 'jednostkę', important: 'ważność' }[k] || k)).join(', ');
      res.log = `${by} zmienił(a) ${what} dla ${n} pozycji`;
      pushHistory(state, op.listId, ts, by, res.log);
      listKeys(op.listId);
      res.listId = op.listId;
      break;
    }
    case 'meta.update': {
      const p = op.patch || {};
      if ('shops' in p) state.meta.shops = strArray(p.shops, 200, 40);
      if ('units' in p) state.meta.units = strArray(p.units, 60, 20);
      if ('categories' in p) state.meta.categories = strArray(p.categories, 80, 40);
      if ('people' in p) state.meta.people = strArray(p.people, 30, 40);
      keys.add('meta');
      break;
    }
    case 'tpl.save': {
      const tpl = cleanTemplate(op.tpl, ts);
      const prev = state.templates[tpl.id];
      if (prev) tpl.createdAt = prev.createdAt;
      state.templates[tpl.id] = tpl;
      keys.add('tpl:' + tpl.id);
      res.log = `${by} zapisał(a) szablon ${quote(tpl.name)}`;
      break;
    }
    case 'tpl.delete': {
      if (!state.templates[op.id]) return res;
      delete state.templates[op.id];
      keys.add('tpl:' + op.id);
      break;
    }
    case 'note.save': {
      const note = cleanNote(op.note, ts, by);
      const prev = state.notes[note.id];
      if (prev) note.createdAt = prev.createdAt;
      state.notes[note.id] = note;
      keys.add('note:' + note.id);
      break;
    }
    case 'note.update': {
      const note = state.notes[op.id];
      if (!note) return res;
      const p = op.patch || {};
      if ('title' in p) note.title = str(p.title, 80);
      if ('body' in p) note.body = text(p.body, 20000);
      if ('color' in p && NOTE_COLORS.includes(p.color)) note.color = p.color;
      if ('pinned' in p) note.pinned = !!p.pinned;
      note.updatedAt = ts;
      note.updatedBy = by;
      keys.add('note:' + note.id);
      break;
    }
    case 'note.delete': {
      if (!state.notes[op.id]) return res;
      delete state.notes[op.id];
      keys.add('note:' + op.id);
      break;
    }
    case 'fav.delete': {
      const k = norm(op.key);
      if (state.favs[k]) { delete state.favs[k]; keys.add('favs'); }
      break;
    }
  }
  return res;
}

// ---------------------------------------------------------------------
// Klucze magazynu (Durable Object) <-> stan
// ---------------------------------------------------------------------

export function valueForKey(state, key) {
  if (key === 'meta') return state.meta;
  if (key === 'favs') return state.favs;
  const i = key.indexOf(':');
  const kind = key.slice(0, i);
  const id = key.slice(i + 1);
  if (kind === 'list') return state.lists[id];
  if (kind === 'items') return state.lists[id] ? state.items[id] || {} : undefined;
  if (kind === 'hist') return state.lists[id] ? state.history[id] || [] : undefined;
  if (kind === 'tpl') return state.templates[id];
  if (kind === 'note') return state.notes[id];
  return undefined;
}

export function stateFromEntries(entries) {
  const st = emptyState();
  for (const [key, val] of entries) {
    if (key === 'meta') st.meta = { ...st.meta, ...val };
    else if (key === 'favs') st.favs = val || {};
    else if (key.startsWith('list:')) st.lists[key.slice(5)] = val;
    else if (key.startsWith('items:')) st.items[key.slice(6)] = val || {};
    else if (key.startsWith('hist:')) st.history[key.slice(5)] = val || [];
    else if (key.startsWith('tpl:')) st.templates[key.slice(4)] = val;
    else if (key.startsWith('note:')) st.notes[key.slice(5)] = val;
  }
  for (const id of Object.keys(st.lists)) if (!st.items[id]) st.items[id] = {};
  return st;
}

// ---------------------------------------------------------------------
// Migracja z poprzedniej wersji aplikacji (tablice 'lists', 'items', ...)
// ---------------------------------------------------------------------

function htmlToText(html) {
  return String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '')
    .replace(/<\/(div|p|ul|ol|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function migrateLegacy(old) {
  const st = emptyState();
  const ts = Date.now();
  if (Array.isArray(old.shops) && old.shops.length) st.meta.shops = strArray(old.shops, 200, 40);
  if (Array.isArray(old.units) && old.units.length) st.meta.units = strArray([...old.units, ...DEFAULT_UNITS], 60, 20);
  for (const l of old.lists || []) {
    const kind = l.kind === 'todo' ? 'packing' : 'shopping';
    const list = cleanList({ ...l, kind, icon: l.icon, color: l.color }, l.updatedAt || ts, l.updatedBy || '');
    list.createdAt = l.createdAt || ts;
    st.lists[list.id] = list;
    const map = {};
    let ord = 0;
    for (const it of (old.items && old.items[l.id]) || []) {
      const c = cleanItem({ ...it, parentId: null, type: 'item', emoji: '', qty: it.count && it.count > 1 ? it.count : (it.qty === 1 ? null : it.qty), unit: it.unit === 'szt.' ? '' : it.unit, order: ++ord });
      map[c.id] = c;
    }
    st.items[list.id] = map;
    st.history[list.id] = Array.isArray(old.history && old.history[l.id]) ? old.history[l.id].slice(0, MAX_HISTORY) : [];
  }
  for (const t of old.templates || []) {
    const tpl = cleanTemplate({ id: t.id, name: t.name, kind: 'shopping', items: (t.items || []).map((x, i) => ({ ...x, id: uid(), order: i + 1, unit: x.unit === 'szt.' ? '' : x.unit, qty: x.qty === 1 ? null : x.qty })) }, t.createdAt || ts);
    st.templates[tpl.id] = tpl;
  }
  for (const [k, f] of Object.entries(old.favorites || {})) {
    st.favs[norm(k)] = { name: f.name, count: f.count || 1, last: ts };
  }
  for (const n of old.notes || []) {
    let body = htmlToText(n.body);
    for (const tile of n.tiles || []) { const t = htmlToText(tile.text); if (t) body += '\n\n' + t; }
    const note = cleanNote({ id: n.id, title: n.title, body }, n.updatedAt || ts, '');
    st.notes[note.id] = note;
  }
  return st;
}

// ---------------------------------------------------------------------
// Import kopii zapasowej (z tej lub poprzedniej wersji) — z pełną sanityzacją
// ---------------------------------------------------------------------

export function importState(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Nieprawidłowy plik');
  if (Array.isArray(raw.lists)) return migrateLegacy(raw);
  const ts = Date.now();
  const st = emptyState();
  const m = raw.meta || {};
  if (Array.isArray(m.shops)) st.meta.shops = strArray(m.shops, 200, 40);
  if (Array.isArray(m.units)) st.meta.units = strArray(m.units, 60, 20);
  if (Array.isArray(m.categories)) st.meta.categories = strArray(m.categories, 80, 40);
  if (Array.isArray(m.people)) st.meta.people = strArray(m.people, 30, 40);
  for (const l of Object.values(raw.lists || {})) {
    const list = cleanList(l, Number.isFinite(l && l.updatedAt) ? l.updatedAt : ts, (l && l.updatedBy) || '');
    st.lists[list.id] = list;
    const items = fixTree(Object.values((raw.items || {})[list.id] || {}).slice(0, MAX_ITEMS_PER_LIST).map((x) => cleanItem(x)));
    st.items[list.id] = Object.fromEntries(items.map((i) => [i.id, i]));
    const h = (raw.history || {})[list.id];
    st.history[list.id] = Array.isArray(h) ? h.slice(0, MAX_HISTORY).map((e) => ({ ts: Number(e.ts) || ts, by: str(e.by, 40), text: str(e.text, 200) })) : [];
  }
  for (const t of Object.values(raw.templates || {})) { const tpl = cleanTemplate(t, ts); st.templates[tpl.id] = tpl; }
  for (const n of Object.values(raw.notes || {})) { const note = cleanNote(n, Number.isFinite(n && n.updatedAt) ? n.updatedAt : ts, ''); st.notes[note.id] = note; }
  for (const [k, f] of Object.entries(raw.favs || {})) {
    if (!f || !f.name) continue;
    st.favs[norm(k)] = { name: str(f.name, 80), count: Number(f.count) || 1, last: Number(f.last) || ts, shop: str(f.shop, 40), category: str(f.category, 40), unit: str(f.unit, 20), price: numOrNull(f.price), kind: KINDS[f.kind] ? f.kind : '' };
  }
  return st;
}

export function allKeys(state) {
  const keys = ['meta', 'favs'];
  for (const id of Object.keys(state.lists)) keys.push('list:' + id, 'items:' + id, 'hist:' + id);
  for (const id of Object.keys(state.templates)) keys.push('tpl:' + id);
  for (const id of Object.keys(state.notes)) keys.push('note:' + id);
  return keys;
}
