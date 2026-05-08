// Comments storage adapter — swap implementation, keep interface stable.
//
// v1: localStorage. v2: Supabase (one-file swap).
//
// Comment shape:
//   { id, scope, scopeId, author, body, tags: string[], createdAt, updatedAt }
//
// scope: 'tract' | 'local'
// scopeId: tract id (e.g. '410300') or local name (e.g. 'North Oakland')

const STORAGE_KEY = 'tanc-map.comments.v1';
const SCHEMA_VERSION = 1;

// In-memory cache. Populated lazily on first read; flushed back to
// localStorage on every mutation. Keeping the whole blob in memory is
// fine — comments are tiny strings, and we expect O(100s) at most.
let cache = null;
const subscribers = new Set();

function loadFromStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed; // pre-versioned blob
    if (parsed && Array.isArray(parsed.comments)) return parsed.comments;
    return [];
  } catch (e) {
    // Corrupt blob — keep silent (no logging by design — these are personal notes).
    return [];
  }
}

function ensureCache() {
  if (cache === null) cache = loadFromStorage();
  return cache;
}

function flush() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: SCHEMA_VERSION, comments: cache })
    );
  } catch (e) {
    // Quota exhaustion or private mode. Fail silently — UI will still work
    // for the rest of the session via in-memory cache.
  }
  notify();
}

function notify() {
  for (const fn of subscribers) {
    try { fn(); } catch (_) { /* subscriber errors must not break the store */ }
  }
}

function newId() {
  // Crypto UUID where available; fallback for older browsers.
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso() { return new Date().toISOString(); }

export const commentsAdapter = {
  list(scope, scopeId) {
    const all = ensureCache();
    return all
      .filter(c => c.scope === scope && c.scopeId === String(scopeId))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  },

  listByLocal(localName) {
    // Convenience: every comment whose scope is this local OR whose
    // scope is a tract in this local. The drawer needs the tract→local
    // mapping passed in, so this method takes a predicate instead.
    const all = ensureCache();
    return all
      .filter(c => c.scope === 'local' && c.scopeId === String(localName))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  },

  listAll() {
    return ensureCache().slice().sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );
  },

  add(scope, scopeId, { author, body, tags }) {
    ensureCache();
    const c = {
      id: newId(),
      scope,
      scopeId: String(scopeId),
      author: (author || '').trim() || 'anonymous',
      body: (body || '').trim(),
      tags: Array.isArray(tags) ? tags.filter(Boolean) : [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    cache.push(c);
    flush();
    return c;
  },

  update(id, { body, tags }) {
    ensureCache();
    const idx = cache.findIndex(c => c.id === id);
    if (idx < 0) return null;
    const next = { ...cache[idx] };
    if (body !== undefined) next.body = String(body).trim();
    if (tags !== undefined) next.tags = Array.isArray(tags) ? tags.filter(Boolean) : [];
    next.updatedAt = nowIso();
    cache[idx] = next;
    flush();
    return next;
  },

  delete(id) {
    ensureCache();
    const before = cache.length;
    cache = cache.filter(c => c.id !== id);
    if (cache.length !== before) flush();
  },

  countFor(scope, scopeId) {
    const all = ensureCache();
    let n = 0;
    const sid = String(scopeId);
    for (const c of all) if (c.scope === scope && c.scopeId === sid) n++;
    return n;
  },

  exportAll() {
    return { version: SCHEMA_VERSION, comments: ensureCache().slice() };
  },

  importAll(data) {
    ensureCache();
    if (!data) return;
    const incoming = Array.isArray(data) ? data : (data.comments || []);
    if (!Array.isArray(incoming)) return;
    // Merge by ID — incoming overwrites existing on collision (assumes the
    // import is the more authoritative copy; the alternative is to keep the
    // newer updatedAt, but that's surprising for a "restore my notes" flow).
    const byId = new Map(cache.map(c => [c.id, c]));
    for (const c of incoming) {
      if (!c || !c.id) continue;
      byId.set(c.id, {
        id: c.id,
        scope: c.scope,
        scopeId: String(c.scopeId),
        author: c.author || 'anonymous',
        body: c.body || '',
        tags: Array.isArray(c.tags) ? c.tags : [],
        createdAt: c.createdAt || nowIso(),
        updatedAt: c.updatedAt || c.createdAt || nowIso(),
      });
    }
    cache = Array.from(byId.values());
    flush();
  },

  // Subscribe to any change in the store. CommentChip uses this so its badge
  // re-renders the moment a note is added from any surface (drawer, import).
  subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  },
};

// Predefined tag chips — one-click in the Add form.
export const PREDEFINED_TAGS = [
  'canvassed',
  'needs follow-up',
  'good contact',
  'do not approach',
  'language barrier',
];

// Author identity is remembered per-browser. Free text — not auth.
const AUTHOR_KEY = 'tanc-map.comments.author';
export function getRememberedAuthor() {
  if (typeof window === 'undefined' || !window.localStorage) return '';
  try { return window.localStorage.getItem(AUTHOR_KEY) || ''; } catch (_) { return ''; }
}
export function setRememberedAuthor(name) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try { window.localStorage.setItem(AUTHOR_KEY, String(name || '').trim()); } catch (_) {}
}
