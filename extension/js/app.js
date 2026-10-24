// App shell: boots the session, routes between views, hosts the modal & toast.

const App = {
  state: {
    user: null,
    teams: [],
    projects: [],
    currentTeam: null,
    currentProject: null,
    tab: 'chat',
  },

  async boot() {
    const user = await Auth.restore();
    if (!user) {
      LoginView.show();
      return;
    }
    try {
      const me = await Api.request('me'); // validate the stored token + refresh profile
      App.state.user = me.user;
    } catch {
      await Auth.logout();
      LoginView.show();
      return;
    }
    App.showApp();
  },

  showApp() {
    Util.byId('login-view').classList.add('hidden');
    Util.byId('login-view').classList.remove('flex');
    const app = Util.byId('app-view');
    app.classList.remove('hidden');
    app.classList.add('flex');

    App.renderHeaderUser();
    App.renderEmptyMain();
    Teams.load().catch(() => {});
    Projects.load().catch(() => {});
    App.loadInvites();
  },

  async renderHeaderUser() {
    const holder = Util.byId('header-user');
    if (!holder) return;
    const u = App.state.user;
    holder.innerHTML = `${Util.esc(u.display_name || u.email)}`
      + `<span id="header-avatar" class="inline-block align-middle"></span>`;
    const slot = Util.byId('header-avatar');
    if (slot) slot.innerHTML = await Util.avatarHtml(u, 'h-7 w-7 text-[10px]');
  },

  renderEmptyMain() {
    const action = (id, icon, title, sub, cls) => `
      <button id="${id}" class="panel col-span-2 flex flex-col items-start gap-2 p-5 text-right transition hover:border-accent/40">
        <div class="flex h-11 w-11 items-center justify-center rounded-2xl ${cls}">${Util.icon(icon, 'ms-fill text-2xl text-white')}</div>
        <p class="text-sm font-bold text-vanilla">${title}</p>
        <p class="text-[11px] leading-5 text-cream/40">${sub}</p>
      </button>`;
    Util.byId('main').innerHTML = `
      <div class="flex h-full flex-col items-center justify-center p-8">
        <div class="w-full max-w-md">
          <p class="mb-4 text-center text-sm text-cream/50">👋 خوش آمدی — از کجا شروع کنیم؟</p>
          <div class="grid grid-cols-6 gap-3">
            ${action('qa-team', 'group_add', 'تیم جدید بساز', 'همکارانت را دور هم جمع کن', 'bg-gradient-to-br from-accent to-accent/60')}
            ${action('qa-project', 'rocket_launch', 'پروژه‌ی جدید', 'کارها را فازبندی و پیگیری کن', 'bg-gradient-to-br from-cyan to-cyan/50')}
            ${action('qa-join', 'key', 'عضویت با کد', 'با کد دعوت به تیم بپیوند', 'bg-gradient-to-br from-fuchsia-500 to-fuchsia-500/50')}
          </div>
        </div>
      </div>`;

    Util.byId('qa-team').addEventListener('click', () => Util.byId('new-team-btn').click());
    Util.byId('qa-project').addEventListener('click', () => Util.byId('new-project-btn').click());
    Util.byId('qa-join').addEventListener('click', () => Util.byId('join-team-btn').click());
  },

  async loadInvites() {
    try {
      const data = await Api.request('invites');
      const box = Util.byId('invites-box');
      const list = Util.byId('invites-list');
      if (!data.invites.length) {
        box.classList.add('hidden');
        return;
      }
      box.classList.remove('hidden');
      list.innerHTML = data.invites.map((i) => `
        <div class="flex items-center gap-1 rounded-xl border border-accent/20 bg-accent/10 p-2 text-xs">
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium text-accent">${Util.esc(i.team_name)}</p>
            <p class="text-[10px] text-cream/40">تو را دعوت کرده</p>
          </div>
          <button data-accept="${i.id}" class="btn-primary shrink-0 px-2 py-1 text-[11px]">پذیرش</button>
        </div>`).join('');
      list.querySelectorAll('[data-accept]').forEach((btn) =>
        btn.addEventListener('click', async () => {
          try {
            await Api.request(`invites/${btn.dataset.accept}/accept`, { method: 'POST' });
            await Teams.load();
            App.loadInvites();
            App.toast('به تیم اضافه شدی 🎉', false);
          } catch (err) {
            App.toast(Util.errorFa(err));
          }
        }));
    } catch { /* invites are optional chrome */ }
  },

  // ------------------------------------------------------------- chrome UI

  toast(message, isError = true) {
    const el = document.createElement('div');
    el.className = 'fixed bottom-4 left-4 z-50 rounded-xl border px-4 py-2 text-sm shadow-lg backdrop-blur-xl '
      + (isError ? 'border-rose-400/20 bg-rose-500/90 text-white' : 'border-white/10 bg-navy/90 text-vanilla');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  },

  /** Generic dialog: text inputs, textareas, or a fully custom body. */
  modal({ title, fields = [], textareas = [], submitLabel = 'ثبت', customBody = null, onSubmit }) {
    const dlg = Util.byId('modal');
    const form = Util.byId('modal-form');
    Util.byId('modal-title').textContent = title;

    if (customBody !== null) {
      form.innerHTML = customBody;
      form.onsubmit = async (e) => e.preventDefault();
      dlg.showModal();
      return;
    }

    form.innerHTML = fields.map((f) => `
      <label class="block">
        <span class="mb-1 block text-xs text-cream/45">${Util.esc(f.label)}</span>
        <input name="${Util.esc(f.name)}" type="${f.type || 'text'}" ${f.required === false ? '' : 'required'} class="input" placeholder="${Util.esc(f.placeholder || '')}" value="${Util.esc(f.value || '')}" />
      </label>`).join('')
      + textareas.map((f) => `
      <label class="block">
        <span class="mb-1 block text-xs text-cream/45">${Util.esc(f.label)}</span>
        <textarea name="${Util.esc(f.name)}" rows="7" class="input resize-y font-mono text-xs leading-6" placeholder="${Util.esc(f.placeholder || '')}">${Util.esc(f.value || '')}</textarea>
      </label>`).join('')
      + (submitLabel ? `
      <div class="flex gap-2 pt-1">
        <button type="submit" class="btn-primary flex-1">${Util.esc(submitLabel)}</button>
        <button type="button" id="modal-cancel" class="btn-ghost">انصراف</button>
      </div>` : '<button type="button" id="modal-cancel" class="btn-ghost mt-1 w-full">بستن</button>');

    form.onsubmit = async (e) => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      try {
        await onSubmit(values);
        dlg.close();
      } catch (err) {
        App.toast(Util.errorFa(err));
      }
    };
    form.querySelector('#modal-cancel').addEventListener('click', () => dlg.close());

    dlg.showModal();
  },
};

// -------------------------------------------------------------- wiring

Util.byId('header-user-btn').addEventListener('click', () => ProfileView.open());
Util.byId('logout-btn').addEventListener('click', async () => {
  Tasks.stopPoll();
  Chat.stopPoll();
  await Auth.logout();
  App.state = { user: null, teams: [], projects: [], currentTeam: null, currentProject: null, tab: 'chat' };
  LoginView.show();
});

Util.byId('new-team-btn').addEventListener('click', () => {
  App.modal({
    title: 'تیم جدید',
    fields: [{ name: 'name', label: 'نام تیم', placeholder: 'مثلاً تیم محصول' }],
    submitLabel: 'ساخت تیم',
    onSubmit: async (v) => {
      await Api.request('teams', { method: 'POST', body: { name: v.name } });
      await Teams.load();
      App.toast('تیم ساخته شد 🎉', false);
    },
  });
});

Util.byId('new-project-btn').addEventListener('click', () => {
  App.modal({
    title: 'پروژه‌ی جدید',
    fields: [
      { name: 'name', label: 'نام پروژه', placeholder: 'مثلاً بازطراحی سایت' },
      { name: 'description', label: 'توضیح (اختیاری)', required: false },
      {
        name: 'team_id',
        label: 'متعلق به تیم',
        type: 'select',
        options: [{ value: '', label: 'شخصی (فقط خودم)' }]
          .concat(App.state.teams.map((t) => ({ value: t.id, label: t.name }))),
      },
    ],
    submitLabel: 'ساخت پروژه',
    onSubmit: async (v) => {
      const body = { name: v.name, description: v.description || '' };
      if (v.team_id) body.team_id = Number(v.team_id);
      await Api.request('projects', { method: 'POST', body });
      await Projects.load();
      App.toast('پروژه ساخته شد 🎉', false);
    },
  });
});

App.boot();
