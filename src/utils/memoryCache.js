/** Tiny in-process TTL cache for hot read endpoints (single-instance API). */

const store = new Map();

export function cacheGet(key) {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expires <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return hit.value;
}

export function cacheSet(key, value, ttlMs = 15_000) {
  store.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

export function cacheDel(prefix = '') {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Express helper: cache JSON GET responses briefly. */
export function withCache(keyFn, ttlMs = 15_000) {
  return (handler) =>
    asyncHandlerWrapper(async (req, res) => {
      const key = typeof keyFn === 'function' ? keyFn(req) : keyFn;
      const cached = cacheGet(key);
      if (cached !== undefined) {
        res.set('X-Cache', 'HIT');
        return res.json(cached);
      }
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        try {
          cacheSet(key, body, ttlMs);
        } catch {
          /* ignore */
        }
        res.set('X-Cache', 'MISS');
        return originalJson(body);
      };
      return handler(req, res);
    });
}

function asyncHandlerWrapper(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
