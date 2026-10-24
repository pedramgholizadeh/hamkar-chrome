// Telegram-style project chat: bubbles, image previews, file chips, polling.

const Chat = {
  pollTimer: null,
  projectId: null,
  afterId: 0,
  mediaUrls: new Map(), // fileId -> objectURL cache

  stopPoll() {
    if (Chat.pollTimer) {
      clearInterval(Chat.pollTimer);
      Chat.pollTimer = null;
    }
  },

  async open(projectId) {
    Tasks.stopPoll();
    Chat.stopPoll();
    Chat.projectId = projectId;
    Chat.afterId = 0;

    Util.byId('panel').innerHTML = `
      <div class="flex h-full flex-col">
        <div id="chat-messages" class="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-100/60 p-4"></div>
        <form id="chat-form" class="flex shrink-0 items-end gap-2 border-t border-slate-200 bg-white p-3">
          <input type="file" id="chat-file" class="hidden" />
          <button type="button" id="chat-attach" class="btn-ghost text-xl" title="پیوست فایل">📎</button>
          <textarea id="chat-input" rows="1" placeholder="پیام…" class="input max-h-32 min-h-[42px] flex-1 resize-none py-2.5"></textarea>
          <button type="submit" class="btn-primary shrink-0">ارسال</button>
        </form>
      </div>`;

    const box = Util.byId('chat-messages');

    // one delegated click handler for file downloads (list grows via append)
    box.addEventListener('click', async (e) => {
      const chip = e.target.closest('[data-download]');
      if (!chip) return;
      e.preventDefault();
      try {
        const blob = await Api.fetchBlob(chip.dataset.download);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = chip.dataset.name || 'file';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch {
        App.toast('دریافت فایل ناموفق بود');
      }
    });

    const input = Util.byId('chat-input');
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 128) + 'px';
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        Util.byId('chat-form').requestSubmit();
      }
    });

    Util.byId('chat-attach').addEventListener('click', () => Util.byId('chat-file').click());

    Util.byId('chat-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      const fileInput = Util.byId('chat-file');
      if (!text && !fileInput.files.length) return;

      const form = new FormData();
      form.append('body', text);
      if (fileInput.files.length) form.append('file', fileInput.files[0]);
      input.value = '';
      input.style.height = 'auto';
      fileInput.value = '';

      try {
        await Api.request(`projects/${Chat.projectId}/messages`, { method: 'POST', form });
        await Chat.refresh(false);
      } catch (err) {
        App.toast(Util.errorFa(err));
      }
    });

    await Chat.refresh(true);
    Chat.pollTimer = setInterval(() => Chat.refresh(false).catch(() => {}), 3000);
  },

  async refresh(initial) {
    const data = await Api.request(`projects/${Chat.projectId}/messages?after_id=${Chat.afterId}`);
    const box = Util.byId('chat-messages');
    if (!box) return;

    if (initial && !data.messages.length) {
      box.innerHTML = `
        <div class="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
          <div class="text-4xl">💬</div>
          <p class="text-sm font-medium text-slate-500">اولین پیام را بفرست!</p>
          <p class="text-xs">می‌توانی متن، عکس یا فایل بفرستی</p>
        </div>`;
      return;
    }
    if (!data.messages.length) return;

    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 150;
    const empty = box.querySelector('.flex.h-full');
    if (empty) empty.remove();

    for (const message of data.messages) {
      box.insertAdjacentHTML('beforeend', Chat.bubble(message));
    }
    Chat.afterId = data.messages[data.messages.length - 1].id;

    Chat.hydrateImages(box);
    if (initial || nearBottom) box.scrollTop = box.scrollHeight;
  },

  /** Replace placeholder <img data-file> nodes with authenticated blob URLs. */
  hydrateImages(box) {
    box.querySelectorAll('img[data-file]:not([data-loaded])').forEach(async (img) => {
      img.dataset.loaded = '1';
      const fileId = img.dataset.file;
      try {
        if (!Chat.mediaUrls.has(fileId)) {
          const blob = await Api.fetchBlob(fileId);
          Chat.mediaUrls.set(fileId, URL.createObjectURL(blob));
        }
        img.src = Chat.mediaUrls.get(fileId);
      } catch {
        img.outerHTML = '<div class="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-500">پیش‌نمایش عکس ممکن نشد</div>';
      }
    });
  },

  bubble(m) {
    const mine = m.user.id === App.state.user.id;
    const who = mine ? 'من' : (m.user.name || m.user.email);
    const time = Util.timeFa(m.created_at);

    let content = '';
    if (m.file) {
      if (String(m.file.mime).startsWith('image/')) {
        content += `<img data-file="${m.file.id}" alt="${Util.esc(m.file.name)}" class="mb-1.5 max-h-64 max-w-full cursor-pointer rounded-xl bg-slate-200" />`;
      } else {
        content += `
          <a href="#" data-download="${m.file.id}" data-name="${Util.esc(m.file.name)}" class="mb-1.5 flex items-center gap-2 rounded-xl px-3 py-2 text-xs transition ${mine ? 'bg-white/15 hover:bg-white/25' : 'bg-slate-100 hover:bg-slate-200'}">
            <span class="text-lg">📄</span>
            <span class="min-w-0 flex-1 truncate font-medium">${Util.esc(m.file.name)}</span>
            <span class="${mine ? 'text-white/70' : 'text-slate-400'}">${Util.bytes(m.file.size)}</span>
          </a>`;
      }
    }
    if (m.body) {
      content += `<p class="whitespace-pre-wrap break-words text-sm leading-6">${Util.esc(m.body)}</p>`;
    }

    const bubbleCls = mine
      ? 'bg-indigo-600 text-white'
      : 'border border-slate-200 bg-white text-slate-800';
    const tailCls = mine ? 'rounded-2xl rounded-bl-md' : 'rounded-2xl rounded-br-md';

    return `
      <div class="max-w-[75%] ${mine ? 'ms-auto' : 'me-auto'}">
        <div class="${bubbleCls} ${tailCls} px-3.5 py-2.5 shadow-sm">${content}</div>
        <p class="mt-1 px-1 text-[10px] text-slate-400 ${mine ? 'text-left' : 'text-right'}">${Util.esc(who)} · ${time}</p>
      </div>`;
  },
};
