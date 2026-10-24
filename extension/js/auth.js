// Session handling: magic-link login + permanent token in chrome.storage.

const Auth = {
  async requestLogin(email) {
    const data = await Api.request('auth/request', { method: 'POST', body: { email }, auth: false });
    return data.request_id;
  },

  async poll(requestId) {
    return Api.request('auth/poll?request_id=' + encodeURIComponent(requestId), { auth: false });
  },

  async saveSession(token, user) {
    Api.token = token;
    await Store.set({ token, user });
  },

  /** Returns the stored user if a session exists. */
  async restore() {
    const { token, user } = await Store.get(['token', 'user']);
    if (!token) return null;
    Api.token = token;
    return user || null;
  },

  async logout() {
    try {
      await Api.request('auth/logout', { method: 'POST' });
    } catch {
      // token may already be dead — clear locally regardless
    }
    Api.token = null;
    await Store.clearSession();
  },
};
