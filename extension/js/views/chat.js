// Telegram-style project chat: avatars, replies, day dividers, grouped bubbles.

const Chat = {
  pollTimer: null,
  projectId: null,
  afterId: 0,

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
    Chat.replyTo = null;
    Chat.lastMeta = null; // for grouping
    Chat.lastDay = null;
    Chat.msgCache = [];

    Util.byId('panel').innerHTML = `
      <div class="flex h-full flex-col">
        <div id="chat-messages" class="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-4"></div>
        <div id="reply-bar" class="hidden shrink-0 border-t border-white/10 bg-navy/30 px-4 py-2"></div>
        <form id="chat-form" class="glass flex shrink-0 items-end gap-2 border-x-0 border-b-0 p-3">
          <input type="file" id="chat-file" class="hidden" />
          <button type="button" id="chat-attach" class="btn-ghost text-xl" title="پیوست فایل">${Util.icon('attach_file', 'text-2xl')}</button>
          <textarea id="chat-input" rows="1" placeholder="پیام…" class="input max-h-32 min-h-[42px] flex-1 resize-none py-2.5"></textarea>
          <button type="submit" class="btn-primary shrink-0">${Util.icon('send', 'text-base')} ارسال</button>
        </form>
      </div>`;

    const box = Util.byId('chat-messages');

    // delegated clicks: file downloads + "reply" buttons
    box.addEventListener('click', async (e) => {
      const chip = e.target.closest('[data-download]');
      if (chip) {
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
        return;
      }
      const replyBtn = e.target.closest('[data-reply]');
      if (replyBtn) {
        const msg = (Chat.msgCache || []).find((m) => m.id === Number(replyBtn.dataset.reply));
        if (msg) Chat.setReply(msg);
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
      if (Chat.replyTo) form.append('reply_to_id', Chat.replyTo.id);
      if (fileInput.files.length) form.append('file', fileInput.files[0]);
      input.value = '';
      input.style.height = 'auto';
      fileInput.value = '';
      Chat.setReply(null);

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

  setReply(msg) {
    Chat.replyTo = msg;
    const bar = Util.byId('reply-bar');
    if (!bar) return;
    if (!msg) {
      bar.classList.add('hidden');
      return;
    }
    bar.classList.remove('hidden');
    bar.innerHTML = `
      <div class="flex items-center gap-2 rounded-xl border-e-2 border-accent bg-white/5 px-3 py-1.5">
        <div class="min-w-0 flex-1">
          <p class="text-[10px] font-bold text-accent">پاسخ به ${Util.esc(msg.user.display_name)}</p>
          <p class="truncate text-xs text-cream/50">${Util.esc(msg.body || '📎 فایل پیوست')}</p>
        </div>
        <button id="reply-cancel" class="btn-ghost h-6 px-1">${Util.icon('close', 'text-sm')}</button>
      </div>`;
    Util.byId('reply-cancel').addEventListener('click', () => Chat.setReply(null));
    Util.byId('chat-input').focus();
  },

  async refresh(initial) {
    const data = await Api.request(`projects/${Chat.projectId}/messages?after_id=${Chat.afterId}`);
    const box = Util.byId('chat-messages');
    if (!box) return;

    if (initial && !data.messages.length) {
      box.innerHTML = `
        <div class="flex h-full flex-col items-center justify-center gap-2 text-cream/40">
          ${Util.icon('forum', 'ms-fill text-5xl text-cream/20')}
          <p class="text-sm font-medium text-cream/60">اولین پیام را بفرست!</p>
          <p class="text-xs">می‌توانی متن، عکس یا فایل بفرستی</p>
        </div>`;
      return;
    }
    if (!data.messages.length) return;

    Chat.msgCache = (Chat.msgCache || []).concat(data.messages);
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 150;
    const empty = box.querySelector('.flex.h-full');
    if (empty) empty.remove();

    for (const m of data.messages) {
      box.insertAdjacentHTML('beforeend', Chat.render(m, initial));
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
      const url = await MediaStore.url(Number(fileId));
      if (url) {
        img.src = url;
      } else {
        img.outerHTML = '<div class="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">پیش‌نمایش عکس ممکن نشد</div>';
      }
    });
  },

  render(m, initial) {
    const mine = m.user.id === App.state.user.id;
    const parts = [];

    // day divider
    const day = Util.dateFa(m.created_at);
    if (day && Chat.lastDay !== day) {
      Chat.lastDay = day;
      parts.push(`
        <div class="flex items-center justify-center py-2">
          <span class="rounded-full bg-white/5 px-3 py-1 text-[10px] text-cream/40">${day}</span>
        </div>`);
      Chat.lastMeta = null; // don't group across days
    }

    // grouping: consecutive messages from the same author within 5 minutes
    const prev = Chat.lastMeta;
    const grouped = prev && prev.userId === m.user.id
      && (new Date(m.created_at.replace(' ', 'T') + 'Z') - new Date(prev.at.replace(' ', 'T') + 'Z')) < 5 * 60 * 1000;
    Chat.lastMeta = { userId: m.user.id, at: m.created_at };

    let content = '';
    if (m.file) {
      if (String(m.file.mime).startsWith('image/')) {
        content += `<img data-file="${m.file.id}" alt="${Util.esc(m.file.name)}" class="mb-1.5 max-h-64 max-w-full cursor-pointer rounded-xl bg-white/10" />`;
      } else {
        content += `
          <a href="#" data-download="${m.file.id}" data-name="${Util.esc(m.file.name)}" class="mb-1.5 flex items-center gap-2 rounded-xl px-3 py-2 text-xs transition ${mine ? 'bg-ink/15 hover:bg-ink/25' : 'bg-white/10 hover:bg-white/20'}">
            ${Util.icon('insert_drive_file', 'text-lg')}
            <span class="min-w-0 flex-1 truncate font-medium">${Util.esc(m.file.name)}</span>
            <span class="${mine ? 'text-ink/60' : 'text-cream/40'}">${Util.bytes(m.file.size)}</span>
          </a>`;
      }
    }
    if (m.body) {
      content += `<p class="whitespace-pre-wrap break-words text-sm leading-6">${Util.esc(m.body)}</p>`;
    }

    const bubbleCls = mine
      ? 'bg-gradient-to-b from-accent to-accent/85 text-ink shadow-lg shadow-accent/10'
      : 'glass text-cream';
    const tailCls = mine ? 'rounded-2xl rounded-bl-md' : 'rounded-2xl rounded-br-md';

    const replyHtml = m.reply_to ? `
      <div class="mb-1.5 border-e-2 ${mine ? 'border-ink/50' : 'border-accent/60'} bg-black/10 rounded-lg px-2.5 py-1">
        <p class="text-[10px] font-bold ${mine ? 'text-ink/70' : 'text-accent'}">${Util.esc(m.reply_to.author)}</p>
        <p class="truncate text-[11px] ${mine ? 'text-ink/60' : 'text-cream/50'}">${Util.esc(m.reply_to.body || '📎 فایل پیوست')}</p>
      </div>` : '';

    const headHtml = (!mine && !grouped) ? `
      <p class="mb-0.5 px-1 text-[11px] font-bold text-accent">${Util.esc(m.user.display_name)}</p>` : '';

    const metaTime = Util.timeFa(m.created_at);
    const avatarSlot = `
      <span data-avatar="${m.id}" class="w-9 shrink-0 ${grouped ? '' : 'self-end'}"></span>`;

    parts.push(`
      <div class="group flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}" data-msg="${m.id}">
        ${avatarSlot}
        <div class="max-w-[70%]">
          ${headHtml}
          <div class="${bubbleCls} ${tailCls} px-3.5 py-2.5">${replyHtml}${content}</div>
          <p class="mt-0.5 px-1 text-[9px] text-cream/30 ${mine ? 'text-left' : 'text-right'}">${metaTime}</p>
        </div>
        <button data-reply="${m.id}" class="btn-ghost mb-4 h-6 px-1 opacity-0 transition group-hover:opacity-100" title="پاسخ">
          ${Util.icon('reply', 'text-sm')}
        </button>
      </div>`);

    // async avatar (skip for grouped continuation rows)
    if (!grouped) {
      setTimeout(async () => {
        const slot = Util.byId('chat-messages')?.querySelector(`[data-avatar="${m.id}"]`);
        if (slot) slot.innerHTML = await Util.avatarHtml(m.user, 'h-9 w-9 text-xs');
      }, 0);
    }

    return parts.join('');
  },
};
