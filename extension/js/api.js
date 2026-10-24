// Minimal API client. JSON by default, FormData for uploads — nothing else.

const Api = {
  token: null,

  async request(path, { method = 'GET', body = null, form = null, auth = true } = {}) {
    const headers = {};
    if (auth && Api.token) headers.Authorization = 'Bearer ' + Api.token;

    let payload;
    if (form) {
      payload = form; // browser sets the multipart boundary itself
    } else if (body !== null) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(CONFIG.API_BASE + '/' + path, { method, headers, body: payload });
    } catch {
      throw new Error('network_error');
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'http_' + res.status);
      err.status = res.status;
      throw err;
    }
    return data;
  },

  /** Private file download — media is never a public URL, always fetch + auth. */
  async fetchBlob(fileId) {
    const res = await fetch(CONFIG.API_BASE + '/media/' + fileId, {
      headers: { Authorization: 'Bearer ' + Api.token },
    });
    if (!res.ok) throw new Error('forbidden');
    return res.blob();
  },
};
