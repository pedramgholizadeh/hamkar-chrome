// Teams: sidebar list, team panel (members / invite / code), join by code.

const Teams = {
  async load() {
    const data = await Api.request('teams');
    App.state.teams = data.teams;
    Teams.renderList();
  },

  renderList() {
    const box = Util.byId('teams-list');
    if (!App.state.teams.length) {
      box.innerHTML = '<p class="px-2 py-1 text-xs text-cream/35">هنوز تیمی نداری</p>';
      return;
    }
    box.innerHTML = App.state.teams.map((t) => `
      <button data-team="${t.id}" class="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-sm transition hover:bg-white/5 ${App.state.currentTeam === t.id ? 'bg-gold/15 font-medium text-gold' : ''}">
        <span class="truncate">${Util.esc(t.name)}</span>
        ${t.role === 'owner' ? '<span class="shrink-0 text-[10px]">👑</span>' : ''}
      </button>`).join('');
    box.querySelectorAll('[data-team]').forEach((btn) =>
      btn.addEventListener('click', () => Teams.open(Number(btn.dataset.team))));
  },

  async open(teamId) {
    let data;
    try {
      data = await Api.request('teams/' + teamId);
    } catch (err) {
      App.toast(Util.errorFa(err));
      return;
    }
    App.state.currentTeam = teamId;
    App.state.currentProject = null;
    Teams.renderList();
    Projects.renderList();
    Tasks.stopPoll();
    Chat.stopPoll();

    Util.byId('main').innerHTML = `
      <div class="h-full overflow-y-auto p-6">
        <div class="mx-auto max-w-lg space-y-4">
          <div class="card p-5">
            <h1 class="text-lg font-bold">${Util.esc(data.team.name)}</h1>
            <button id="team-copy-code" class="mt-2 flex w-full items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-xs text-cream/50 transition hover:bg-white/10">
              <span>کد دعوت (برای همکارانت بفرست)</span>
              <span class="font-mono text-sm font-bold tracking-widest text-gold">${Util.esc(data.team.invite_code)} 📋</span>
            </button>
          </div>

          <div class="card p-5">
            <h2 class="mb-3 text-sm font-bold text-vanilla">اعضا <span class="text-cream/40">(${data.members.length})</span></h2>
            <div class="space-y-2">
              ${data.members.map((m) => `
                <div class="flex items-center gap-3">
                  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/20 text-xs font-bold text-gold">${Util.esc((m.name || m.email).charAt(0).toUpperCase())}</div>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium">${Util.esc(m.name || m.email)}</p>
                    ${m.name ? `<p class="truncate text-[11px] text-cream/40">${Util.esc(m.email)}</p>` : ''}
                  </div>
                  <span class="text-[11px] text-cream/40">${m.role === 'owner' ? 'مالک' : 'عضو'}</span>
                </div>`).join('')}
            </div>
            <form id="invite-form" class="mt-4 flex gap-2">
              <input name="email" type="email" required placeholder="ایمیل همکار جدید" class="input" />
              <button class="btn-primary shrink-0">دعوت</button>
            </form>
          </div>
        </div>
      </div>`;

    Util.byId('team-copy-code').addEventListener('click', () => {
      navigator.clipboard.writeText(data.team.invite_code).then(() => App.toast('کد دعوت کپی شد', false));
    });
    Util.byId('invite-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = new FormData(e.target).get('email');
      try {
        await Api.request(`teams/${teamId}/invite`, { method: 'POST', body: { email } });
        e.target.reset();
        App.toast('دعوت ثبت شد؛ بعد از ورود، دعوت‌نامه را می‌بیند', false);
      } catch (err) {
        App.toast(Util.errorFa(err));
      }
    });
  },
};

// sidebar: join-by-code button
Util.byId('join-team-btn').addEventListener('click', () => {
  App.modal({
    title: 'عضویت در تیم',
    fields: [{ name: 'code', label: 'کد دعوت', placeholder: 'مثلاً A1B2C3D4E5' }],
    submitLabel: 'عضویت',
    onSubmit: async (v) => {
      await Api.request('teams/join', { method: 'POST', body: { code: v.code.trim().toUpperCase() } });
      await Teams.load();
      App.toast('به تیم اضافه شدی 🎉', false);
    },
  });
});
