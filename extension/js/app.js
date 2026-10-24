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
      const me = await Api.request('me'); // validate the stored token
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

    Util.byId('user-email').textContent = App.state.user.email;
    App.renderEmptyMain();
    Teams.load().catch(() => {});
    Projects.load().catch(() => {});
    App.loadInvites();
  },

  renderEmptyMain() {
    Util.byId('main').innerHTML = `
      <div class="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
        <div class="text-5xl">👋</div>
        <p class="font-medium text-slate-500">از منوی کنار یک پروژه را انتخاب کن</p>
        <p class="text-xs">یا با دکمه‌های + تیم و پروژه‌ی جدید بساز</p>
      </div>`;
  },

  setTab(tab) {
    App.state.tab = tab;
    const active = 'rounded-lg bg-white px-4 py-1.5 font-medium text-indigo-600 shadow transition';
    const inactive = 'rounded-lg px-4 py-1.5 text-slate-500 transition';
    Util.byId('tab-chat').className = tab === 'chat' ? active : inactive;
    Util.byId('tab-tasks').className = tab === 'tasks' ? active : inactive;

    if (!App.state.currentProject) return;
    if (tab === 'chat') Chat.open(App.state.currentProject.id);
    else Tasks.open(App.state.currentProject.id);
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
        <div class="flex items-center gap-1 rounded-xl bg-amber-50 p-2 text-xs">
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium text-amber-800">${Util.esc(i.team_name)}</p>
            <p class="text-[10px] text-amber-600">تو را دعوت کرده</p>
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
    el.className = 'fixed bottom-4 left-4 z-50 rounded-xl px-4 py-2 text-sm text-white shadow-lg '
      + (isError ? 'bg-rose-600' : 'bg-slate-900');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  },

  /** Generic dialog with dynamic fields; resolves through onSubmit(values). */
  modal({ title, fields, submitLabel = 'ثبت', onSubmit }) {
    const dlg = Util.byId('modal');
    const form = Util.byId('modal-form');
    Util.byId('modal-title').textContent = title;

    form.innerHTML = fields.map((f) => {
      if (f.type === 'select') {
        const options = f.options.map((o) =>
          `<option value="${Util.esc(o.value)}">${Util.esc(o.label)}</option>`).join('');
        return `
          <label class="block">
            <span class="mb-1 block text-xs text-slate-500">${Util.esc(f.label)}</span>
            <select name="${Util.esc(f.name)}" class="input">${options}</select>
          </label>`;
      }
      return `
        <label class="block">
          <span class="mb-1 block text-xs text-slate-500">${Util.esc(f.label)}</span>
          <input name="${Util.esc(f.name)}" type="${f.type || 'text'}" required class="input" placeholder="${Util.esc(f.placeholder || '')}" />
        </label>`;
    }).join('') + `
      <div class="flex gap-2 pt-1">
        <button type="submit" class="btn-primary flex-1">${Util.esc(submitLabel)}</button>
        <button type="button" id="modal-cancel" class="btn-ghost">انصراف</button>
      </div>`;

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
      { name: 'description', label: 'توضیح (اختیاری)', type: 'text', placeholder: '' },
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
