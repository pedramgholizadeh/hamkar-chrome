// Friends: requests, friend grid, invitations, and full private DM view.

const Friends = {
  data: null,
  pollTimer: null,
  dmUser: null,
  afterId: 0,
  lastDay: null,
  lastMeta: null,

  stopPoll() {
    if (Friends.pollTimer) {
      clearInterval(Friends.pollTimer);
      Friends.pollTimer = null;
    }
  },

  async load() {
    try {
      Friends.data = await Api.request('friends');
    } catch {
      return;
    }
    Friends.renderSidebar();
    if (Util.byId('friends-main')) Friends.renderMain();
  },

  renderSidebar() {
    const list = Util.byId('friends-list');
    const badge = Util.byId('friends-badge');
    if (!list) return;

    const pending = Friends.data.incoming.length;
    if (badge) {
      badge.classList.toggle('hidden', pending === 0);
      badge.textContent = pending;
    }

    list.innerHTML = Friends.data.friends.map((f) => `
      <button data-friend="${f.user.id}" class="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-sm transition hover:bg-white/[0.06] ${App.state.currentFriend === f.user.id ? 'border border-accent/30 bg-accent/15 text-white' : 'border border-transparent'}">
        <span data-friend-avatar="${f.user.id}" class="relative shrink-0"><span class="absolute -bottom-0.5 -left-0.5 h-1.5 w-1.5 rounded-full border border-ink ${f.user.online ? 'bg-mint' : 'bg-cream/25'}"></span></span>
        <span class="min-w-0 flex-1 truncate text-right text-xs">${Util.esc(f.user.display_name)}</span>
      </button>`).join('');

    list.querySelectorAll('[data-friend]').forEach((btn) =>
      btn.addEventListener('click', () => Friends.openDm(Number(btn.dataset.friend))));
    list.querySelectorAll('[data-friend-avatar]').forEach(async (slot) => {
      const f = Friends.data.friends.find((x) => x.user.id === Number(slot.dataset.friendAvatar));
      if (f) slot.insertAdjacentHTML('afterbegin', await Util.avatarHtml(f.user, 'h-6 w-6 text-[9px]'));
    });
  },

  // ---------------------------------------------------------------- main

  open() {
    Tasks.stopPoll();
    Chat.stopPoll();
    Friends.stopPoll();
    App.state.currentFriend = null;
    Friends.renderSidebar();
    Friends.renderMain();
    Friends.load();
  },

  renderMain() {
    const d = Friends.data || { friends: [], incoming: [], outgoing: [] };

    const personRow = (f, actions) => `
      <div class="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5 transition hover:bg-white/[0.07]">
        <span data-friend-main-avatar="${f.user.id}"></span>
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-1.5 truncate text-sm font-medium">
            ${Util.esc(f.user.display_name)}
            <span class="chip ${f.user.online ? 'bg-mint/15 text-mint' : 'bg-white/5 text-cream/40'}">${f.user.online ? 'آنلاین' : Util.lastSeenFa(f.user.last_seen_at)}</span>
            ${!f.is_friend ? '<span class="chip bg-cyan/15 text-cyan">هم‌تیمی</span>' : ''}
          </p>
          <p class="truncate text-[11px] text-cream/35">${Util.esc(f.user.email)}</p>
        </div>
        <div class="flex shrink-0 gap-1">${actions}</div>
      </div>`;

    Util.byId('main').innerHTML = `
      <div class="h-full overflow-y-auto p-5">
        <div class="mx-auto grid max-w-2xl grid-cols-6 gap-3">

          <div class="panel col-span-6 p-4">
            <form id="friend-request-form" class="flex gap-2">
              <input name="email" type="email" required placeholder="ایمیل دوستت را بنویس تا درخواست دوستی برود" class="input text-xs" />
              <button class="btn-primary shrink-0 text-xs">درخواست</button>
            </form>
          </div>

          ${d.incoming.length ? `
          <div class="panel col-span-6 p-4">
            <h2 class="mb-2 flex items-center gap-1.5 text-sm font-bold text-vanilla"><span class="ms text-base text-cyan">move_to_inbox</span> درخواست‌های دوستی</h2>
            <div class="space-y-2">
              ${d.incoming.map((f) => personRow(f, `
                <button data-accept="${f.friendship_id}" class="btn-primary px-3 py-1.5 text-xs">پذیرش</button>
                <button data-decline="${f.friendship_id}" class="btn-danger px-3 py-1.5 text-xs">رد</button>`)).join('')}
            </div>
          </div>` : ''}

          ${d.outgoing.length ? `
          <div class="panel col-span-6 px-4 py-3">
            <p class="mb-1.5 text-[11px] font-bold text-cream/35">در انتظار پاسخ</p>
            ${d.outgoing.map((f) => `
              <div class="flex items-center gap-2 text-xs text-cream/45">
                ${Util.icon('hourglass_top', 'text-sm text-cream/30')}
                <span class="flex-1 truncate">${Util.esc(f.user.display_name)}</span>
                <button data-decline="${f.friendship_id}" class="btn-ghost h-6 px-2 text-[11px] text-rose-300/70">لغو</button>
              </div>`).join('')}
          </div>` : ''}

          <div class="panel col-span-6 p-4">
            <h2 class="mb-3 flex items-center gap-1.5 text-sm font-bold text-vanilla"><span class="ms text-base text-accent">diversity_3</span> دوستان <span class="text-cream/40">(${d.friends.length})</span></h2>
            <div id="friends-grid" class="space-y-2">
              ${d.friends.length ? '' : `<p class="rounded-xl border border-dashed border-white/15 py-6 text-center text-xs text-cream/30">هنوز دوستی نداری — با ایمیل، درخواست دوستی بفرست</p>`}
            </div>
          </div>

        </div>
      </div>`;

    const grid = Util.byId('friends-grid');
    Promise.all(d.friends.map(async (f) => personRow(f, `
      <button data-chat="${f.user.id}" class="btn-soft px-3 py-1.5 text-xs">${Util.icon('chat_bubble', 'text-sm')} چت</button>
      <button data-invite-team="${f.user.id}" class="btn-soft px-3 py-1.5 text-xs">${Util.icon('group_add', 'text-sm')} تیم</button>
      <button data-invite-project="${f.user.id}" class="btn-soft px-3 py-1.5 text-xs">${Util.icon('folder_shared', 'text-sm')} پروژه</button>
      <button data-unfriend="${f.friendship_id}" class="btn-ghost h-8 w-8 px-0 text-rose-300/60" title="حذف دوستی">${Util.icon('person_remove', 'text-base')}</button>`)))
      .then((rows) => { if (grid) grid.innerHTML = rows.join(''); })
      .then(() => Friends.wireFriendActions());

    Util.byId('friend-request-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = new FormData(e.target).get('email');
      try {
        const res = await Api.request('friends/request', { method: 'POST', body: { email } });
        e.target.reset();
        App.toast(res.auto_accepted ? 'او هم تو را دعوت کرده بود — دوست شدید 🎉' : 'درخواست دوستی ارسال شد', false);
        Friends.load();
      } catch (err) {
        App.toast(Util.errorFa(err));
      }
    });

    Util.byId('main').querySelectorAll('[data-accept]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          await Api.request(`friends/${btn.dataset.accept}/accept`, { method: 'POST' });
          App.toast('دوست شدید 🎉', false);
          Friends.load();
        } catch (err) { App.toast(Util.errorFa(err)); }
      }));
    Util.byId('main').querySelectorAll('[data-decline]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          await Api.request('friends/' + btn.dataset.decline, { method: 'DELETE' });
          Friends.load();
        } catch (err) { App.toast(Util.errorFa(err)); }
      }));
  },

  wireFriendActions() {
    const main = Util.byId('main');
    main.querySelectorAll('[data-friend-main-avatar]').forEach(async (slot) => {
      const f = Friends.data.friends.find((x) => x.user.id === Number(slot.dataset.friendMainAvatar));
      if (f) slot.innerHTML = await Util.avatarHtml(f.user, 'h-9 w-9 text-sm');
    });
    main.querySelectorAll('[data-chat]').forEach((btn) =>
      btn.addEventListener('click', () => Friends.openDm(Number(btn.dataset.chat))));
    main.querySelectorAll('[data-unfriend]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          await Api.request('friends/' + btn.dataset.unfriend, { method: 'DELETE' });
          App.toast('حذف شد', false);
          Friends.load();
        } catch (err) { App.toast(Util.errorFa(err)); }
      }));
    main.querySelectorAll('[data-invite-team]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const friend = Friends.data.friends.find((x) => x.user.id === Number(btn.dataset.inviteTeam));
        if (!App.state.teams.length) {
          App.toast('اول یک تیم بساز');
          return;
        }
        App.modal({
          title: `دعوت ${friend.user.display_name} به تیم`,
          fields: [{
            name: 'team_id', label: 'تیم', type: 'select',
            options: App.state.teams.map((t) => ({ value: t.id, label: t.name })),
          }],
          submitLabel: 'ارسال دعوت',
          onSubmit: async (v) => {
            await Api.request(`teams/${v.team_id}/invite`, { method: 'POST', body: { email: friend.user.email } });
            App.toast('دعوت ثبت شد', false);
          },
        });
      }));
    main.querySelectorAll('[data-invite-project]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const friend = Friends.data.friends.find((x) => x.user.id === Number(btn.dataset.inviteProject));
        const mine = App.state.projects.filter((p) => p.owner_id === App.state.user.id);
        if (!mine.length) {
          App.toast('هنوز پروژه‌ای نداری');
          return;
        }
        App.modal({
          title: `اشتراک پروژه با ${friend.user.display_name}`,
          fields: [{
            name: 'project_id', label: 'پروژه', type: 'select',
            options: mine.map((p) => ({ value: p.id, label: p.name })),
          }],
          submitLabel: 'کپی کد دعوت',
          onSubmit: async (v) => {
            const project = await Api.request('projects/' + v.project_id);
            await navigator.clipboard.writeText(project.project.invite_code);
            App.toast('کد دعوت پروژه کپی شد — برایش بفرست تا در «عضویت با کد پروژه» بزند', false);
          },
        });
      }));
  },

  // ------------------------------------------------------------------ DM

  async openDm(userId) {
    const friend = (Friends.data || { friends: [] }).friends.find((f) => f.user.id === userId);
    const user = friend ? friend.user : { id: userId, display_name: '...', email: '', online: false, avatar_file_id: null };
    if (friend) App.state.currentFriend = userId;

    Tasks.stopPoll();
    Chat.stopPoll();
    Friends.stopPoll();
    Friends.dmUser = user;
    Friends.afterId = 0;
    Friends.lastDay = null;
    Friends.lastMeta = null;

    Friends.renderSidebar();
    Util.byId('main').innerHTML = `
      <div class="flex h-full flex-col">
        <div class="flex shrink-0 items-center gap-2 border-b border-white/[0.07] bg-white/[0.02] px-4 py-2.5 backdrop-blur-xl">
          <button id="dm-friends-back" class="btn-ghost h-8 w-8 px-0 text-cream/50"><span class="ms text-lg">arrow_forward</span></button>
          <span id="dm-friend-avatar"></span>
          <div class="min-w-0">
            <p class="truncate text-sm font-bold text-vanilla">${Util.esc(user.display_name)}</p>
            <p class="text-[10px] ${user.online ? 'text-mint' : 'text-cream/35'}">${Util.lastSeenFa(user.last_seen_at)} · ${Util.esc(user.email || '')}</p>
          </div>
          <span class="chip ms-auto bg-white/5 text-cream/40">چت خصوصی</span>
        </div>
        <div id="dm-messages" class="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-4"></div>
        <form id="dm-form" class="glass flex shrink-0 items-end gap-2 border-x-0 border-b-0 p-3">
          <input type="file" id="dm-file" class="hidden" />
          <button type="button" id="dm-attach" class="btn-ghost text-xl">${Util.icon('attach_file', 'text-2xl')}</button>
          <textarea id="dm-input" rows="1" placeholder="پیام خصوصی…" class="input max-h-32 min-h-[42px] flex-1 resize-none py-2.5"></textarea>
          <button type="submit" class="btn-primary shrink-0">${Util.icon('send', 'text-base')}</button>
        </form>
      </div>`;

    Util.byId('dm-friend-avatar').innerHTML = await Util.avatarHtml(user, 'h-9 w-9 text-sm');
    Util.byId('dm-friends-back').addEventListener('click', () => {
      Friends.stopPoll();
      Friends.open();
    });

    const input = Util.byId('dm-input');
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 128) + 'px';
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        Util.byId('dm-form').requestSubmit();
      }
    });
    Util.byId('dm-attach').addEventListener('click', () => Util.byId('dm-file').click());

    Util.byId('dm-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      const fileInput = Util.byId('dm-file');
      if (!text && !fileInput.files.length) return;
      const form = new FormData();
      form.append('body', text);
      if (fileInput.files.length) form.append('file', fileInput.files[0]);
      input.value = '';
      input.style.height = 'auto';
      fileInput.value = '';
      try {
        await Api.request(`dm/${userId}/messages`, { method: 'POST', form });
        await Friends.refreshDm();
      } catch (err) {
        App.toast(Util.errorFa(err));
      }
    });

    await Friends.refreshDm();
    Friends.pollTimer = setInterval(() => Friends.refreshDm().catch(() => {}), 3000);
  },

  async refreshDm() {
    const data = await Api.request(`dm/${Friends.dmUser.id}/messages?after_id=${Friends.afterId}`);
    const box = Util.byId('dm-messages');
    if (!box) return;

    if (Friends.afterId === 0 && !data.messages.length) {
      box.innerHTML = `
        <div class="flex h-full flex-col items-center justify-center gap-2 text-cream/40">
          ${Util.icon('lock', 'ms-fill text-5xl text-cream/20')}
          <p class="text-sm font-medium text-cream/60">چت خصوصی و امن</p>
          <p class="text-xs">اولین پیام را بفرست</p>
        </div>`;
      return;
    }
    if (!data.messages.length) return;

    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 150;
    const empty = box.querySelector('.flex.h-full');
    if (empty) empty.remove();

    for (const m of data.messages) {
      box.insertAdjacentHTML('beforeend', Friends.bubble(m));
    }
    Friends.afterId = data.messages[data.messages.length - 1].id;

    box.querySelectorAll('img[data-file]:not([data-loaded])').forEach(async (img) => {
      img.dataset.loaded = '1';
      const url = await MediaStore.url(Number(img.dataset.file));
      if (url) img.src = url;
    });
    if (nearBottom || Friends.afterId === data.messages[data.messages.length - 1].id) {
      box.scrollTop = box.scrollHeight;
    }
    box.scrollTop = box.scrollHeight;
  },

  bubble(m) {
    const parts = [];
    const day = Util.dateFa(m.created_at);
    if (day && Friends.lastDay !== day) {
      Friends.lastDay = day;
      Friends.lastMeta = null;
      parts.push(`<div class="flex items-center justify-center py-2"><span class="rounded-full bg-white/5 px-3 py-1 text-[10px] text-cream/40">${day}</span></div>`);
    }

    let content = '';
    if (m.file) {
      if (String(m.file.mime).startsWith('image/')) {
        content += `<img data-file="${m.file.id}" alt="" class="mb-1.5 max-h-64 max-w-full cursor-pointer rounded-xl bg-white/10" />`;
      } else {
        content += `
          <a href="#" data-dm-file="${m.file.id}" data-name="${Util.esc(m.file.name)}" class="mb-1.5 flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${m.mine ? 'bg-ink/15' : 'bg-white/10'}">
            ${Util.icon('insert_drive_file', 'text-lg')}
            <span class="min-w-0 flex-1 truncate font-medium">${Util.esc(m.file.name)}</span>
            <span class="${m.mine ? 'text-white/70' : 'text-cream/40'}">${Util.bytes(m.file.size)}</span>
          </a>`;
      }
    }
    if (m.body) content += `<p class="whitespace-pre-wrap break-words text-sm leading-6">${Util.esc(m.body)}</p>`;

    const bubbleCls = m.mine
      ? 'bg-gradient-to-b from-accent to-accent/70 text-white shadow-lg shadow-accent/10'
      : 'glass text-cream';
    const tailCls = m.mine ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-bl-md';

    parts.push(`
      <div class="flex items-end gap-2 ${m.mine ? '' : 'justify-end'}">
        <div class="max-w-[85%] min-w-0">
          <div class="${bubbleCls} ${tailCls} px-3.5 py-2.5">${content}</div>
          <p class="mt-0.5 px-1 text-[9px] text-cream/30 ${m.mine ? 'text-left' : 'text-right'}">${Util.timeFa(m.created_at)}</p>
        </div>
      </div>`);
    return parts.join('');
  },
};

// sidebar: add friend button
Util.byId('add-friend-btn').addEventListener('click', () => {
  App.modal({
    title: 'درخواست دوستی',
    fields: [{ name: 'email', label: 'ایمیل دوستت', placeholder: 'friend@example.com' }],
    submitLabel: 'ارسال درخواست',
    onSubmit: async (v) => {
      const res = await Api.request('friends/request', { method: 'POST', body: { email: v.email.trim().toLowerCase() } });
      App.toast(res.auto_accepted ? 'او هم تو را دعوت کرده بود — دوست شدید 🎉' : 'درخواست ارسال شد', false);
      Friends.load();
    },
  });
});
