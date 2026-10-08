// =====================================================================
// Magazyn stanu + synchronizacja w czasie rzeczywistym
//
//  confirmed — stan potwierdzony przez serwer
//  pending   — moje operacje jeszcze niepotwierdzone (zapisywane lokalnie,
//              więc przetrwają zamknięcie aplikacji bez internetu)
//  view      — confirmed + pending: to widzi użytkownik (natychmiast)
// =====================================================================

import { applyOp, emptyState, uid } from './core.js';

const CACHE_KEY = 'lz3_cache';
const PENDING_KEY = 'lz3_pending';
const NAME_KEY = 'lz3_name';
const ACCESS_KEY = 'lz3_key';
const DEVICE_KEY = 'lz3_device';

function lsGet(k, fallback = null) {
  try { const v = localStorage.getItem(k); return v === null ? fallback : v; } catch (e) { return fallback; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, v); return true; } catch (e) { return false; }
}
function lsJSON(k, fallback) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
}

const clone = typeof structuredClone === 'function' ? structuredClone : (o) => JSON.parse(JSON.stringify(o));

class Store {
  constructor() {
    this.confirmed = lsJSON(CACHE_KEY, null) || emptyState();
    if (!this.confirmed.meta || !this.confirmed.lists) this.confirmed = emptyState();
    this.hasData = !!lsGet(CACHE_KEY);
    this.pending = lsJSON(PENDING_KEY, []);
    if (!Array.isArray(this.pending)) this.pending = [];
    this.pending = this.pending.filter((op) => op && typeof op.oid === 'string');
    this.view = this.confirmed;
    this.recompute();
    // imię — także z poprzedniej wersji aplikacji
    this.me = lsGet(NAME_KEY) || lsGet('lz_name') || '';
    this.key = lsGet(ACCESS_KEY) || '';
    this.device = lsGet(DEVICE_KEY) || '';
    if (!this.device) { this.device = uid().slice(0, 8); lsSet(DEVICE_KEY, this.device); }
    this.status = 'offline'; // offline | connecting | online
    this.synced = false;     // czy dostaliśmy już stan z serwera w tej sesji
    this.online = [];
    this.listeners = new Set();
    this.eventListeners = new Set();
    this.ws = null;
    this.backoff = 1000;
    this.reconnectTimer = null;
    this.lastMsgAt = 0;
    this.saveTimer = null;
    this.notifyQueued = false;
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onEvent(fn) { this.eventListeners.add(fn); return () => this.eventListeners.delete(fn); }

  notify() {
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    requestAnimationFrame(() => {
      this.notifyQueued = false;
      for (const fn of this.listeners) { try { fn(); } catch (e) { console.error(e); } }
    });
  }

  emit(evt) { for (const fn of this.eventListeners) { try { fn(evt); } catch (e) { console.error(e); } } }

  setMe(name) { this.me = name; lsSet(NAME_KEY, name); this.sendHello(); this.notify(); }
  setKey(key) { this.key = key; lsSet(ACCESS_KEY, key); }

  recompute() {
    if (!this.pending.length) { this.view = this.confirmed; return; }
    const v = clone(this.confirmed);
    const keep = [];
    for (const op of this.pending) {
      try { applyOp(v, op); keep.push(op); } catch (e) { /* operacja już nieważna */ }
    }
    this.pending = keep;
    this.view = v;
  }

  savePending() { lsSet(PENDING_KEY, JSON.stringify(this.pending)); }

  scheduleCacheSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      if (!lsSet(CACHE_KEY, JSON.stringify(this.confirmed))) {
        // brak miejsca: zapisz bez historii
        const slim = { ...this.confirmed, history: {} };
        lsSet(CACHE_KEY, JSON.stringify(slim));
      }
    }, 800);
  }

  // Wykonaj operację: od razu lokalnie, potem na serwerze.
  dispatch(partial) {
    const op = { ...partial, oid: uid(), by: this.me || 'Ktoś', ts: Date.now() };
    if (this.view === this.confirmed) this.view = clone(this.confirmed);
    let res;
    try {
      res = applyOp(this.view, op);
    } catch (e) {
      this.recompute();
      this.emit({ type: 'error', text: e.message || String(e) });
      return null;
    }
    this.pending.push(op);
    this.savePending();
    this.sendOps([op]);
    this.notify();
    return res;
  }

  sendOps(ops) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.synced) {
      try { this.ws.send(JSON.stringify({ type: 'ops', ops })); } catch (e) { /* ponowimy po połączeniu */ }
    }
  }

  // -----------------------------------------------------------------
  // Połączenie
  // -----------------------------------------------------------------

  wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const q = new URLSearchParams({ name: this.me || '', device: this.device });
    if (this.key) q.set('key', this.key);
    return `${proto}//${location.host}/ws?${q}`;
  }

  async checkAccess() {
    try {
      const r = await fetch('/api/ping' + (this.key ? '?key=' + encodeURIComponent(this.key) : ''), { cache: 'no-store' });
      if (r.status === 401) return 'denied';
      return r.ok ? 'ok' : 'error';
    } catch (e) {
      return 'offline';
    }
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    clearTimeout(this.reconnectTimer);
    this.status = 'connecting';
    this.synced = false;
    this.notify();
    let ws;
    try { ws = new WebSocket(this.wsUrl()); } catch (e) { this.scheduleReconnect(); return; }
    this.ws = ws;

    ws.addEventListener('open', () => {
      if (this.ws !== ws) return;
      this.lastMsgAt = Date.now();
      this.sendHello();
    });
    ws.addEventListener('message', (ev) => {
      if (this.ws !== ws) return;
      this.lastMsgAt = Date.now();
      if (ev.data === 'pong') return;
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      this.handle(msg);
    });
    const onDown = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.status = 'offline';
      this.synced = false;
      this.online = [];
      this.notify();
      this.scheduleReconnect();
    };
    ws.addEventListener('close', onDown);
    ws.addEventListener('error', () => { try { ws.close(); } catch (e) { /* ignoruj */ } });
  }

  sendHello() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'hello', name: this.me || '', device: this.device }));
    }
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    if (!navigator.onLine) return; // wrócimy po zdarzeniu "online"
    this.reconnectTimer = setTimeout(() => this.connect(), this.backoff);
    this.backoff = Math.min(this.backoff * 2, 15000);
  }

  forceReconnect() {
    if (this.ws) { const w = this.ws; this.ws = null; try { w.close(); } catch (e) { /* ignoruj */ } }
    this.status = 'offline';
    this.backoff = 1000;
    this.connect();
  }

  // Sprawdza, czy połączenie naprawdę żyje (telefony potrafią "uśpić" gniazdo).
  heartbeat() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (this.status !== 'connecting') this.connect();
      return;
    }
    if (Date.now() - this.lastMsgAt > 65000) { this.forceReconnect(); return; }
    try { this.ws.send('ping'); } catch (e) { this.forceReconnect(); }
  }

  probe() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) { this.backoff = 1000; this.connect(); return; }
    const before = this.lastMsgAt;
    try { this.ws.send('ping'); } catch (e) { this.forceReconnect(); return; }
    setTimeout(() => { if (this.lastMsgAt === before) this.forceReconnect(); }, 4000);
  }

  start() {
    this.connect();
    setInterval(() => this.heartbeat(), 25000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.probe(); });
    window.addEventListener('online', () => { this.backoff = 1000; this.connect(); });
    window.addEventListener('offline', () => { this.notify(); });
    window.addEventListener('pageshow', (e) => { if (e.persisted) this.probe(); });
  }

  handle(msg) {
    switch (msg.type) {
      case 'snapshot': {
        this.confirmed = msg.state;
        this.hasData = true;
        this.synced = true;
        this.status = 'online';
        this.backoff = 1000;
        this.recompute();
        this.scheduleCacheSave();
        if (this.pending.length) this.sendOps(this.pending);
        this.notify();
        this.emit({ type: 'synced' });
        break;
      }
      case 'op': {
        const { op } = msg;
        try { applyOp(this.confirmed, op); } catch (e) { /* ignoruj */ }
        const i = this.pending.findIndex((p) => p.oid === op.oid);
        const mine = i >= 0;
        if (mine) { this.pending.splice(i, 1); this.savePending(); }
        this.recompute();
        this.scheduleCacheSave();
        this.notify();
        if (!mine && msg.log) this.emit({ type: 'remote', by: op.by, text: msg.log, listId: msg.listId, op });
        break;
      }
      case 'ack': {
        const i = this.pending.findIndex((p) => p.oid === msg.oid);
        if (i >= 0) { this.pending.splice(i, 1); this.savePending(); this.recompute(); this.notify(); }
        break;
      }
      case 'reject': {
        const i = this.pending.findIndex((p) => p.oid === msg.oid);
        if (i >= 0) { this.pending.splice(i, 1); this.savePending(); this.recompute(); this.notify(); }
        this.emit({ type: 'error', text: msg.error || 'Serwer odrzucił zmianę' });
        break;
      }
      case 'presence': {
        this.online = Array.isArray(msg.online) ? msg.online : [];
        this.notify();
        break;
      }
    }
  }

  clearLocal() {
    try {
      for (const k of [CACHE_KEY, PENDING_KEY, NAME_KEY, 'lz3_prefs', 'lz3_theme', 'lz_name', 'lz_theme', 'lz_queue']) localStorage.removeItem(k);
    } catch (e) { /* ignoruj */ }
  }
}

export const store = new Store();
