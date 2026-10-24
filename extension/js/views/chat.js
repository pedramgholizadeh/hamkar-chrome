// Project chat: two-column layout — chat on the right (own messages right,
// others left, mobile-like max width), member list on the left with one-click
// private DM. One polling loop serves both group chat and DM mode.

const Chat = {
  pollTimer: null,
  projectId: null,
  members: [],
  mode: null, // {type: 'project'} | {type: 'dm', user}
  afterId: 0,
  lastDay: null,
  lastMeta: null,
  cache: [],

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
    Chat.mode = { type: 'project' };
    Chat.afterId = 0;
    Chat.lastDay = null;
    Chat.lastMeta = null;
    Chat.cache = [];

    Util.byId('panel').innerHTML = `
      <div class="flex h-full">
        <!-- chat column (right side in RTL) -->
        <div id="chat-col" class="flex min-w-0 flex-1 flex-col"></div>
        <!-- members column (left half) -->
        <div id="members-col" class="flex w-1/2 max-w-56 min-w-44 shrink-0 flex-col overflow-y-auto border-s border-white/[0.07] bg-white/[0.02] backdrop-blur-xl"></div>
      </div>`;

    Chat.renderProjectChat();
    Chat.renderMembers();

    await Chat.refresh(true);
    Chat.pollTimer = setInterval(() => Chat.refresh(false).catch(() => {}), 3000);
  },

  // -------------------------------------------------------- project columns

  async renderProjectChat() {
    Util.byId('chat-col').innerHTML = `
      <div class="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-4 py-2 text-xs text-cream/50">
        ${Util.icon('forum', 'text-base text-accent')} چت پروژه
        <span class="ms-auto">${Util.icon('swipe_left', 'text-sm text-cream/25')} روی اعضا بزن تا خصوصی حرف بزنی</span>
      </div>
      ${Chat.composerHtml()}
      <div class="pt-2"></div>`;

    Chat.mountComposer(() => Chat.mode.type === 'project');
  },

  async renderMembers() {
    const col = Util.byId('members-col');
    if (!col) return;
    let data;
    try {
      data = await Api.request('projects/' + Chat.projectId);
    } catch {
      col.innerHTML = '';
      return;
    }
    Chat.members = data.members || [];
    col.innerHTML = `
      <p class="sticky top-0 bg-ink/40 px-3 py-2 text-[11px] font-bold text-cream/35 backdrop-blur">اعضا (${Chat.members.length})</p>
      <div class="space-y-0.5 p-2 pt-0">
        ${Chat.members.map((m) => `
          <button data-dm="${m.id}" class="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-right transition hover:bg-white/[0.06] ${m.id === App.state.user.id ? 'opacity-50' : ''}">
            <span data-dm-avatar="${m.id}" class="relative shrink-0"></span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-xs font-medium">${m.id === App.state.user.id ? 'من' : Util.esc(m.display_name)}</span>
            </span>
            <span class="ms text-sm ${m.id === App.state.user.id ? 'hidden' : 'text-cream/30'}">chat_bubble</span>
          </button>`).join('')}
      </div>`;

    col.querySelectorAll('[data-dm-avatar]').forEach(async (slot) => {
      const m = Chat.members.find((x) => x.id === Number(slot.dataset.dmAvatar));
      if (m) slot.innerHTML = await Util.avatarHtml(m, 'h-7 w-7 text-[10px]');
    });
    col.querySelectorAll('[data-dm]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const m = Chat.members.find((x) => x.id === Number(btn.dataset.dm));
        if (m && m.id !== App.state.user.id) Chat.openDm(m);
      }));
  },

  // ----------------------------------------------------------------- DM

  async openDm(user) {
    Chat.stopPoll();
    Chat.mode = { type: 'dm', user };
    Chat.afterId = 0;
    Chat.lastDay = null;
    Chat.lastMeta = null;
    Chat.cache = [];

    const col = Util.byId('chat-col');
    if (!col) return;
    col.innerHTML = `
      <div class="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-3 py-2">
        <button id="dm-back" class="btn-ghost h-7 w-7 px-0 text-cream/50"><span class="ms text-lg">arrow_forward</span></button>
        <span id="dm-avatar"></span>
        <div class="min-w-0">
          <p class="truncate text-xs font-bold text-vanilla">${Util.esc(user.display_name)}</p>
          <p class="text-[10px] ${user.online ? 'text-mint' : 'text-cream/35'}">${user.online ? 'آنلاین' : 'آفلاین'}</p>
        </div>
        <span class="chip ms-auto bg-white/5 text-cream/40">چت خصوصی</span>
      </div>
      ${Chat.composerHtml()}`;

    const avatarSlot = Util.byId('dm-avatar');
    avatarSlot.innerHTML = await Util.avatarHtml(user, 'h-8 w-8 text-[11px]');
    Util.byId('dm-back').addEventListener('click', async () => {
      Chat.stopPoll();
      Chat.mode = { type: 'project' };
      Chat.afterId = 0;
      Chat.lastDay = null;
      Chat.lastMeta = null;
      Chat.cache = [];
      Chat.renderProjectChat();
      await Chat.refresh(true);
      Chat.pollTimer = setInterval(() => Chat.refresh(false).catch(() => {}), 3000);
    });

    Chat.mountComposer(() => Chat.mode.type === 'dm');
    await Chat.refresh(true);
    Chat.pollTimer = setInterval(() => Chat.refresh(false).catch(() => {}), 3000);
  },

  // ------------------------------------------------------------- plumbing

  composerHtml() {
    return `
      <form id="chat-form" class="glass mt-auto flex shrink-0 items-end gap-2 border-x-0 border-b-0 p-3">
        <input type="file" id="chat-file" class="hidden" />
        <button type="button" id="chat-attach" class="btn-ghost text-xl" title="پیوست فایل">${Util.icon('attach_file', 'text-2xl')}</button>
        <textarea id="chat-input" rows="1" placeholder="پیام…" class="input max-h-32 min-h-[42px] flex-1 resize-none py-2.5"></textarea>
        <button type="submit" class="btn-primary shrink-0">${Util.icon('send', 'text-base')}</button>
      </form>
      <div id="chat-messages" class="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-4"></div>`;
  },

  mountComposer(isActive) {
    const box = Util.byId('chat-messages');
    const input = Util.byId('chat-input');

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
      }
    });

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
      if (!isActive()) return;
      const text = input.value.trim();
      const fileInput = Util.byId('chat-file');
      if (!text && !fileInput.files.length) return;

      const form = new FormData();
      form.append('body', text);
      if (fileInput.files.length) form.append('file', fileInput.files[0]);
      input.value = '';
      input.style.height = 'auto';
      fileInput.value = '';

      const endpoint = Chat.mode.type === 'dm'
        ? `dm/${Chat.mode.user.id}/messages`
        : `projects/${Chat.projectId}/messages`;
      try {
        await Api.request(endpoint, { method: 'POST', form });
        await Chat.refresh(false);
      } catch (err) {
        App.toast(Util.errorFa(err));
      }
    });
  },

  async refresh(initial) {
    const endpoint = Chat.mode.type === 'dm'
      ? `dm/${Chat.mode.user.id}/messages?after_id=${Chat.afterId}`
      : `projects/${Chat.projectId}/messages?after_id=${Chat.afterId}`;
    const data = await Api.request(endpoint);
    const box = Util.byId('chat-messages');
    if (!box) return;

    if (initial && !data.messages.length) {
      box.innerHTML = `
        <div class="flex h-full flex-col items-center justify-center gap-2 text-cream/40">
          ${Util.icon('forum', 'ms-fill text-5xl text-cream/20')}
          <p class="text-sm font-medium text-cream/60">اولین پیام را بفرست!</p>
        </div>`;
      return;
    }
    if (!data.messages.length) return;

    Chat.cache = Chat.cache.concat(data.messages);
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

  hydrateImages(box) {
    box.querySelectorAll('img[data-file]:not([data-loaded])').forEach(async (img) => {
      img.dataset.loaded = '1';
      const url = await MediaStore.url(Number(img.dataset.file));
      if (url) {
        img.src = url;
      } else {
        img.outerHTML = '<div class="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">پیش‌نمایش عکس ممکن نشد</div>';
      }
    });
  },

  /** Own messages on the RIGHT, others on the LEFT, mobile-like width. */
  render(m, initial) {
    const mine = m.mine !== undefined ? m.mine : m.user.id === App.state.user.id;
    const parts = [];

    const day = Util.dateFa(m.created_at);
    if (day && Chat.lastDay !== day) {
      Chat.lastDay = day;
      Chat.lastMeta = null;
      parts.push(`
        <div class="flex items-center justify-center py-2">
          <span class="rounded-full bg-white/5 px-3 py-1 text-[10px] text-cream/40">${day}</span>
        </div>`);
    }

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
            <span class="${mine ? 'text-white/70' : 'text-cream/40'}">${Util.bytes(m.file.size)}</span>
          </a>`;
      }
    }
    if (m.body) {
      content += `<p class="whitespace-pre-wrap break-words text-sm leading-6">${Util.esc(m.body)}</p>`;
    }

    const bubbleCls = mine
      ? 'bg-gradient-to-b from-accent to-accent/70 text-white shadow-lg shadow-accent/10'
      : 'glass text-cream';
    const tailCls = mine ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-bl-md';

    const headHtml = (!mine && !grouped) ? `
      <p class="mb-0.5 px-1 text-[11px] font-bold text-cyan">${Util.esc(m.user.display_name)}</p>` : '';

    // RTL flex: row start = RIGHT edge. Own bubble packed right (default),
    // others packed left (justify-end); their avatar sits on the outer edge.
    parts.push(`
      <div class="group flex items-end gap-2 ${mine ? '' : 'justify-end'}" data-msg="${m.id}">
        <div class="max-w-[85%] min-w-0">
          ${headHtml}
          <div class="${bubbleCls} ${tailCls} px-3.5 py-2.5">${content}</div>
          <p class="mt-0.5 px-1 text-[9px] text-cream/30 ${mine ? 'text-left' : 'text-right'}">${Util.timeFa(m.created_at)}</p>
        </div>
        ${!mine && !grouped ? `<span data-chat-avatar="${m.id}" class="shrink-0 self-end"></span>` : ''}
      </div>`);

    if (!mine && !grouped) {
      setTimeout(async () => {
        const slot = Util.byId('chat-messages')?.querySelector(`[data-chat-avatar="${m.id}"]`);
        if (slot) slot.innerHTML = await Util.avatarHtml(m.user, 'h-8 w-8 text-[10px]');
      }, 0);
    }

    return parts.join('');
  },
};
