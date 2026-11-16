// The researcher's own settings, kept in this browser only. Every access is wrapped:
// private windows and blocked storage must never break the page.
const PREFIX = "wv1:";

export const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(PREFIX + key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
  },
};

export function collectionItems() {
  const items = store.get("collection", []);
  return Array.isArray(items) ? items : [];
}
