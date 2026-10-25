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
    App.renderHome();
    Teams.load().then(() => { if (!App.state.currentTeam && !App.state.currentProject) App.renderHome(); }).catch(() => {});
    Projects.load().then(() => { if (!App.state.currentTeam && !App.state.currentProject) App.renderHome(); }).catch(() => {});
    App.loadInvites();
    Friends.load();
    Updater.check();
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

  /** New-tab home: team carousel, projects, and my open tasks. */
  renderHome() {
    const teams = App.state.teams;
    const projects = App.state.projects;

    if (!teams.length && !projects.length) {
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
      return;
    }

    const projectCard = (p) => `
      <button data-home-project="${p.id}" class="panel flex items-center gap-3 p-3.5 text-right transition hover:border-cyan/40">
        ${Util.icon('folder_open', 'text-lg text-cyan')}
        <span class="min-w-0 flex-1">
          <span class="block truncate text-xs font-bold text-vanilla">${Util.esc(p.name)}</span>
          <span class="block truncate text-[10px] text-cream/35">${p.team_name ? Util.esc(p.team_name) : 'پروژه‌ی شخصی'}</span>
        </span>
        ${Util.icon('chevron_left', 'text-base text-cream/25')}
      </button>`;

    Util.byId('main').innerHTML = `
      <div class="h-full overflow-y-auto p-6">
        <div class="mx-auto max-w-4xl space-y-7">

          ${teams.length ? `
          <section>
            <h2 class="mb-3 flex items-center gap-2 text-sm font-bold text-vanilla">${Util.icon('groups', 'text-base text-accent')} تیم‌های من</h2>
            <div class="flex snap-x gap-3 overflow-x-auto pb-2">
              ${teams.map((t) => `
                <button data-home-team="${t.id}" class="panel w-44 shrink-0 snap-start p-4 text-right transition hover:border-accent/40">
                  <span data-home-team-logo="${t.id}" class="block"></span>
                  <p class="mt-2 truncate text-sm font-bold text-vanilla">${Util.esc(t.name)}</p>
                  <p class="text-[10px] text-cream/40">${t.role === 'owner' ? '👑 مالک تیم' : 'عضو تیم'}</p>
                </button>`).join('')}
            </div>
          </section>` : ''}

          ${projects.length ? `
          <section>
            <h2 class="mb-3 flex items-center gap-2 text-sm font-bold text-vanilla">${Util.icon('folder_open', 'text-base text-cyan')} پروژه‌ها</h2>
            <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              ${projects.map(projectCard).join('')}
            </div>
          </section>` : ''}

          <section>
            <h2 class="mb-3 flex items-center gap-2 text-sm font-bold text-vanilla">${Util.icon('checklist', 'text-base text-mint')} کارهایی که باید انجام بدهی</h2>
            <div id="home-tasks" class="grid gap-2 sm:grid-cols-2"><p class="text-xs text-cream/30">در حال بارگذاری…</p></div>
          </section>

        </div>
      </div>`;

    // team logos (image or initial)
    Util.byId('main').querySelectorAll('[data-home-team-logo]').forEach(async (slot) => {
      const team = teams.find((t) => t.id === Number(slot.dataset.homeTeamLogo));
      if (!team) return;
      if (team.logo_file_id) {
        const url = await MediaStore.url(team.logo_file_id);
        if (url) {
          slot.innerHTML = `<img src="${url}" class="h-12 w-12 rounded-2xl object-cover" alt="" />`;
          return;
        }
      }
      slot.innerHTML = `<span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/40 to-cyan/20 text-lg font-extrabold text-white">${Util.esc(team.name.charAt(0))}</span>`;
    });

    const main = Util.byId('main');
    main.querySelectorAll('[data-home-team]').forEach((btn) =>
      btn.addEventListener('click', () => Teams.open(Number(btn.dataset.homeTeam))));
    main.querySelectorAll('[data-home-project]').forEach((btn) =>
      btn.addEventListener('click', () => Projects.open(Number(btn.dataset.homeProject))));

    App.loadHomeTasks(projects);
  },

  /** My open tasks across every project, newest/deadline first. */
  async loadHomeTasks(projects) {
    const box = Util.byId('home-tasks');
    if (!box) return;
    const mine = [];
    await Promise.all(projects.map(async (p) => {
      try {
        const d = await Api.request(`projects/${p.id}/tasks`);
        for (const t of d.tasks) {
          if (!t.done && t.assignee && t.assignee.id === App.state.user.id) mine.push({ ...t, project: p });
        }
      } catch { /* skip unreachable project */ }
    }));
    if (!Util.byId('home-tasks')) return;

    if (!mine.length) {
      box.innerHTML = '<div class="panel col-span-2 p-5 text-center text-xs text-cream/35">هیچ کار بازی برای تو نیست — عالیه! ☕</div>';
      return;
    }
    mine.sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || b.id - a.id);

    box.innerHTML = mine.slice(0, 12).map((t) => {
      const overdue = t.due_date && t.due_date < new Date().toISOString().slice(0, 10);
      return `
      <div class="panel flex items-center gap-3 p-3">
        <input type="checkbox" data-home-task="${t.id}" class="h-5 w-5 shrink-0 cursor-pointer accent-accent" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-xs font-medium text-cream/90">${Util.esc(t.title)}</p>
          <p class="truncate text-[10px] text-cream/35">${Util.esc(t.project.name)}${t.due_date ? ` · <span class="${overdue ? 'text-rose-300' : ''}">${Util.icon('event', 'text-xs')}${Util.dateFa(t.due_date + ' 00:00:00')}</span>` : ''}</p>
        </div>
        <span class="chip shrink-0 ${t.priority === 'high' ? 'bg-rose-500/15 text-rose-300' : t.priority === 'low' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}">${{ high: 'فوری', medium: 'عادی', low: 'کم' }[t.priority] || ''}</span>
      </div>`;
    }).join('');

    box.querySelectorAll('[data-home-task]').forEach((cb) =>
      cb.addEventListener('change', async () => {
        try {
          await Api.request('tasks/' + cb.dataset.homeTask, { method: 'PATCH', body: { done: cb.checked } });
          if (cb.checked) App.toast('انجام شد ✓', false);
          App.loadHomeTasks(App.state.projects);
          if (App.state.currentProject) Projects.loadProgress(App.state.currentProject.id);
        } catch (err) {
          App.toast(Util.errorFa(err));
        }
      }));
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
  modal({ title, fields = [], textareas = [], checkboxes = [], submitLabel = 'ثبت', customBody = null, onSubmit }) {
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
      + checkboxes.map((f) => `
      <fieldset class="rounded-xl border border-white/10 p-3">
        <legend class="px-1 text-xs text-cream/45">${Util.esc(f.label)}</legend>
        <div class="max-h-36 space-y-1 overflow-y-auto">
          ${f.options.map((o) => `
          <label class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-white/[0.06]">
            <input type="checkbox" name="${Util.esc(f.name)}" value="${Util.esc(o.value)}" ${o.checked ? 'checked' : ''} class="h-4 w-4 accent-accent" />
            <span class="truncate">${Util.esc(o.label)}</span>
          </label>`).join('')}
        </div>
      </fieldset>`).join('')
      + (submitLabel ? `
      <div class="flex gap-2 pt-1">
        <button type="submit" class="btn-primary flex-1">${Util.esc(submitLabel)}</button>
        <button type="button" id="modal-cancel" class="btn-ghost">انصراف</button>
      </div>` : '<button type="button" id="modal-cancel" class="btn-ghost mt-1 w-full">بستن</button>');

    form.onsubmit = async (e) => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      for (const f of checkboxes) {
        values[f.name] = [...form.querySelectorAll(`input[name="${f.name}"]:checked`)].map((el) => Number(el.value));
      }
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

// ─────────────────────────── auto-update ───────────────────────────────
// Reads the Latest release from GitHub; if newer than the installed
// manifest version, shows an in-panel update banner.

const Updater = {
  RELEASES: 'https://api.github.com/repos/pedramgholizadeh/hamkar-chrome/releases/latest',

  compare(a, b) {
    const pa = String(a).split('.').map(Number);
    const pb = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const diff = (pa[i] || 0) - (pb[i] || 0);
      if (diff) return diff;
    }
    return 0;
  },

  async check() {
    try {
      const res = await fetch(Updater.RELEASES, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) return null;
      const data = await res.json();
      const remote = String(data.tag_name || '').replace(/^v/, '');
      const local = chrome.runtime.getManifest().version;
      let isNew = remote && Updater.compare(remote, local) > 0;
      // prefer commit comparison when build-info exists
      try {
        const build = await (await fetch(chrome.runtime.getURL('build-info.json'))).json();
        const released = String(data.target_commitish || '').slice(0, 7);
        if (build.commit && released) isNew = released !== build.commit;
      } catch { /* no build info — version compare */ }

      const banner = Util.byId('update-banner');
      if (isNew && banner) {
        banner.classList.remove('hidden');
        banner.classList.add('flex');
        banner.querySelector('[data-update-version]').textContent = 'v' + remote;
        Util.byId('update-btn').onclick = () => {
          window.open(data.html_url, '_blank');
          App.toast('زیپ جدید را دانلود کن، پوشه را جایگزین کن و اکستنشن را Reload کن', false);
        };
      }
      return { remote, local, isNew, url: data.html_url };
    } catch {
      return null;
    }
  },

  open() {
    window.open(CONFIG.API_BASE + '/update/download', '_blank');
    App.toast('زیپ جدید دانلود شد — Extract کن، پوشه را جایگزین کن و در chrome://extensions دکمه‌ی Reload را بزن. دیتا سمت سرور است و هیچ‌چیز از دست نمی‌رود', false);
  },
};

// ───────────────────── join project by invite code ─────────────────────
Util.byId('join-project-btn').addEventListener('click', () => {
  App.modal({
    title: 'عضویت در پروژه',
    fields: [{ name: 'code', label: 'کد دعوت پروژه', placeholder: 'مثلاً X9Y8Z7W6V5' }],
    submitLabel: 'عضویت',
    onSubmit: async (v) => {
      await Api.request('projects/join', { method: 'POST', body: { code: v.code.trim().toUpperCase() } });
      await Projects.load();
      App.toast('به پروژه اضافه شدی 🎉', false);
    },
  });
});

// presence heartbeat: being on the extension page = online
setInterval(() => {
  if (Api.token) Api.request('presence', { method: 'POST' }).catch(() => {});
}, 45000);

// close the project settings menu when clicking elsewhere
document.addEventListener('click', (e) => {
  const menu = Util.byId('project-settings-menu');
  if (menu && !menu.classList.contains('hidden') && !e.target.closest('#project-settings-menu, #project-settings-btn')) {
    menu.classList.add('hidden');
  }
});

// version chip: version + commit, and an inline update button when newer
Updater.check().then(async (info) => {
  const text = Util.byId('version-text');
  const commit = Util.byId('version-commit');
  const update = Util.byId('version-update');
  if (!text) return;
  text.textContent = 'v' + chrome.runtime.getManifest().version;
  try {
    const build = await (await fetch(chrome.runtime.getURL('build-info.json'))).json();
    commit.textContent = '· ' + build.commit;
  } catch { /* dev mode without build-info */ }
  if (info && info.isNew) {
    update.classList.remove('hidden');
    update.classList.add('inline-flex');
    Util.byId('version-chip').onclick = () => Updater.open();
  }
});

App.boot();
