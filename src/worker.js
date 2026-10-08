// =====================================================================
// Zakupy — Worker + Durable Object "ListRoom"
//
// Worker serwuje pliki z public/ i przekazuje /ws oraz /api/* do jednego
// Durable Object, który trzyma cały wspólny stan. Logika zmian stanu jest
// wspólna z przeglądarką (public/js/core.js), więc serwer i telefony
// liczą dokładnie to samo.
// =====================================================================

import { DurableObject } from 'cloudflare:workers';
import { applyOp, emptyState, stateFromEntries, valueForKey, migrateLegacy, importState, allKeys, SCHEMA } from '../public/js/core.js';

const ROOM_NAME = 'main';
const LEGACY_KEYS = ['lists', 'items', 'shops', 'units', 'templates', 'favorites', 'history', 'notes'];
const PREFIXES = ['list:', 'items:', 'hist:', 'tpl:', 'note:'];

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}

function authorized(request, env) {
  if (!env.ACCESS_KEY) return true;
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || request.headers.get('X-Access-Key') || '';
  if (key.length !== env.ACCESS_KEY.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ env.ACCESS_KEY.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws' || url.pathname.startsWith('/api/')) {
      if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);
      if (url.pathname === '/api/ping') return json({ ok: true });
      const stub = env.LIST_ROOM.get(env.LIST_ROOM.idFromName(ROOM_NAME));
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};

export class ListRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.recentOps = new Map(); // id -> true (ochrona przed podwójnym zastosowaniem po ponownym połączeniu)
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.ctx.blockConcurrencyWhile(() => this.load());
  }

  async load() {
    const storage = this.ctx.storage;
    const schema = await storage.get('schema');
    if (schema === SCHEMA) {
      const entries = [];
      const meta = await storage.get(['meta', 'favs']);
      for (const e of meta) entries.push(e);
      for (const prefix of PREFIXES) {
        const map = await storage.list({ prefix });
        for (const e of map) entries.push(e);
      }
      this.state = stateFromEntries(entries);
      return;
    }

    // Pierwsze uruchomienie nowej wersji: przenieś dane ze starego formatu.
    const legacy = await storage.get(LEGACY_KEYS);
    if (legacy.size) {
      const old = Object.fromEntries(legacy);
      this.state = migrateLegacy(old);
      // kopia bezpieczeństwa starych danych (pod innymi kluczami)
      const backup = {};
      for (const [k, v] of legacy) backup['v2bak:' + k] = v;
      await storage.put(backup);
      await storage.delete([...legacy.keys()]);
    } else {
      this.state = emptyState();
    }
    await this.writeKeys(allKeys(this.state));
    await storage.put('schema', SCHEMA);
  }

  async writeKeys(keys) {
    const puts = {};
    const dels = [];
    for (const k of keys) {
      const v = valueForKey(this.state, k);
      if (v === undefined) dels.push(k); else puts[k] = v;
    }
    const putKeys = Object.keys(puts);
    for (let i = 0; i < putKeys.length; i += 100) {
      const chunk = {};
      for (const k of putKeys.slice(i, i + 100)) chunk[k] = puts[k];
      await this.ctx.storage.put(chunk);
    }
    for (let i = 0; i < dels.length; i += 100) await this.ctx.storage.delete(dels.slice(i, i + 100));
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/api/export') {
      const date = new Date().toISOString().slice(0, 10);
      return json({ app: 'zakupy', schema: SCHEMA, exportedAt: Date.now(), ...this.state }, 200, {
        'Content-Disposition': `attachment; filename="zakupy-kopia-${date}.json"`
      });
    }

    if (url.pathname === '/api/import' && request.method === 'POST') {
      let raw;
      try { raw = await request.json(); } catch (e) { return json({ error: 'To nie jest plik JSON' }, 400); }
      let next;
      try { next = importState(raw); } catch (e) { return json({ error: String(e.message || e) }, 400); }
      const oldKeys = allKeys(this.state);
      this.state = next;
      const newKeys = new Set(allKeys(next));
      const stale = oldKeys.filter((k) => !newKeys.has(k));
      for (let i = 0; i < stale.length; i += 100) await this.ctx.storage.delete(stale.slice(i, i + 100));
      await this.writeKeys([...newKeys]);
      for (const ws of this.ctx.getWebSockets()) this.sendSnapshot(ws);
      return json({ ok: true, lists: Object.keys(next.lists).length });
    }

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ name: (url.searchParams.get('name') || '').slice(0, 40), device: (url.searchParams.get('device') || '').slice(0, 40) });
      return new Response(null, { status: 101, webSocket: client });
    }

    return json({ error: 'not found' }, 404);
  }

  send(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch (e) { /* martwe połączenie */ }
  }

  sendSnapshot(ws) {
    this.send(ws, { type: 'snapshot', state: this.state, serverTime: Date.now() });
  }

  broadcast(msg, except) {
    const payload = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try { ws.send(payload); } catch (e) { /* ignoruj */ }
    }
  }

  presence(except) {
    const online = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const a = ws.deserializeAttachment() || {};
      if (a.name) online.push({ name: a.name, device: a.device || '' });
    }
    this.broadcast({ type: 'presence', online }, except);
  }

  async webSocketMessage(ws, data) {
    if (typeof data !== 'string') return;
    let msg;
    try { msg = JSON.parse(data); } catch (e) { return; }

    if (msg.type === 'hello') {
      const a = ws.deserializeAttachment() || {};
      if (msg.name) a.name = String(msg.name).slice(0, 40);
      if (msg.device) a.device = String(msg.device).slice(0, 40);
      ws.serializeAttachment(a);
      this.sendSnapshot(ws);
      this.presence();
      return;
    }

    if (msg.type === 'ops' && Array.isArray(msg.ops)) {
      const a = ws.deserializeAttachment() || {};
      const dirty = new Set();
      const out = [];
      for (const raw of msg.ops.slice(0, 200)) {
        if (!raw || typeof raw.oid !== 'string') continue;
        if (this.recentOps.has(raw.oid)) { this.send(ws, { type: 'ack', oid: raw.oid }); continue; }
        const op = { ...raw, ts: Date.now(), by: String(raw.by || a.name || 'Ktoś').slice(0, 40) };
        let res;
        try {
          res = applyOp(this.state, op);
        } catch (e) {
          this.send(ws, { type: 'reject', oid: op.oid, error: String(e.message || e) });
          continue;
        }
        this.recentOps.set(op.oid, true);
        if (this.recentOps.size > 1000) this.recentOps.delete(this.recentOps.keys().next().value);
        for (const k of res.keys) dirty.add(k);
        out.push({ op, log: res.log || '', listId: res.listId || null });
      }
      if (dirty.size) await this.writeKeys([...dirty]);
      for (const o of out) this.broadcast({ type: 'op', ...o });
    }
  }

  async webSocketClose(ws, code, reason) {
    try { ws.close(code, reason); } catch (e) { /* już zamknięte */ }
    this.presence(ws);
  }

  async webSocketError(ws) {
    this.presence(ws);
  }
}
