// Thin promise wrapper around chrome.storage.local — the session token lives
// here (not in localStorage) so it survives forever and stays out of the web.
// Graceful fallback to in-memory storage lets the UI be previewed in a plain
// browser tab (contributors: just open newtab.html — nothing persists).

const memoryStore = {};
const storage = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local)
  ? chrome.storage.local
  : {
      get: async (keys) => {
        const out = {};
        for (const k of (Array.isArray(keys) ? keys : Object.keys(memoryStore))) out[k] = memoryStore[k];
        return out;
      },
      set: async (items) => Object.assign(memoryStore, items),
      remove: async (keys) => { for (const k of keys) delete memoryStore[k]; },
    };

const Store = {
  async get(keys) {
    return storage.get(keys);
  },

  async set(items) {
    return storage.set(items);
  },

  async clearSession() {
    return storage.remove(['token', 'user']);
  },
};
