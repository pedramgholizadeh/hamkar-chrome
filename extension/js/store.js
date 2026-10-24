// Thin promise wrapper around chrome.storage.local — the session token lives
// here (not in localStorage) so it survives forever and stays out of the web.
const Store = {
  async get(keys) {
    return chrome.storage.local.get(keys);
  },

  async set(items) {
    return chrome.storage.local.set(items);
  },

  async clearSession() {
    return chrome.storage.local.remove(['token', 'user']);
  },
};
