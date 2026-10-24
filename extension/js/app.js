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
    Util.byId('main').innerHTML = `
      <div class="flex h-full flex-col items-center justify-center gap-2 text-cream/40">
        <div class="text-5xl">👋</div>
        <p class="font-medium text-cream/60">از منوی کنار یک پروژه یا تیم را انتخاب کن</p>
        <p class="text-xs">یا با دکمه‌های + تیم و پروژه‌ی جدید بساز</p>
      </div>`;
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
        <div class="flex items-center gap-1 rounded-xl border border-gold/20 bg-gold/10 p-2 text-xs">
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium text-gold">${Util.esc(i.team_name)}</p>
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
