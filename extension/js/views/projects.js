// Projects: sidebar list + project workspace (chat / tasks / phases / versions / repo).

const Projects = {
  tab: 'chat',

  async load() {
    const data = await Api.request('projects');
    App.state.projects = data.projects;
    Projects.renderList();
  },

  renderList() {
    const box = Util.byId('projects-list');
    if (!App.state.projects.length) {
      box.innerHTML = '<p class="px-2 py-1 text-xs text-cream/35">هنوز پروژه‌ای نداری</p>';
      return;
    }
    box.innerHTML = App.state.projects.map((p) => `
      <button data-project="${p.id}" class="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-right text-sm transition hover:bg-white/5 ${App.state.currentProject && App.state.currentProject.id === p.id ? 'bg-gold/15 font-medium text-gold' : ''}">
        <span class="shrink-0 text-xs">${p.team_id ? '👥' : '📁'}</span>
        <span class="min-w-0 flex-1 truncate">${Util.esc(p.name)}</span>
      </button>`).join('');
    box.querySelectorAll('[data-project]').forEach((btn) =>
      btn.addEventListener('click', () => Projects.open(Number(btn.dataset.project))));
  },

  async open(projectId, tab = 'chat') {
    let data;
    try {
      data = await Api.request('projects/' + projectId);
    } catch (err) {
      App.toast(Util.errorFa(err));
      return;
    }

    App.state.currentProject = data.project;
    App.state.currentTeam = null;
    Teams.renderList();
    Projects.renderList();
    Tasks.stopPoll();
    Chat.stopPoll();

    Util.byId('main').innerHTML = `
      <div class="flex h-full flex-col">
        <div class="glass shrink-0 border-x-0 border-t-0 px-5 py-3">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <h1 class="truncate font-bold text-vanilla">${Util.esc(data.project.name)}</h1>
              <div class="mt-0.5 flex items-center gap-2 text-xs text-cream/40">
                <span>${data.project.team_name ? Util.icon('group', 'text-sm') + ' ' + Util.esc(data.project.team_name) : 'پروژه‌ی شخصی'}</span>
                <span id="repo-chip"></span>
              </div>
            </div>
            <div class="flex shrink-0 rounded-xl bg-white/5 p-1 text-xs">
              <button data-tab="chat" class="rounded-lg px-3 py-1.5 transition">💬 چت</button>
              <button data-tab="tasks" class="rounded-lg px-3 py-1.5 transition">✅ تسک‌ها</button>
              <button data-tab="phases" class="rounded-lg px-3 py-1.5 transition">${Util.icon('timeline', 'text-sm')} فازها</button>
              <button data-tab="versions" class="rounded-lg px-3 py-1.5 transition">${Util.icon('new_releases', 'text-sm')} نسخه‌ها</button>
            </div>
          </div>
          <div id="project-progress" class="mt-2"></div>
        </div>
        <div id="panel" class="min-h-0 flex-1"></div>
      </div>`;

    Util.byId('main').querySelectorAll('[data-tab]').forEach((btn) =>
      btn.addEventListener('click', () => Projects.setTab(btn.dataset.tab)));

    Projects.paintRepoChip(data.project);
    Projects.loadProgress(projectId);
    Projects.setTab(tab);
  },

  setTab(tab) {
    Projects.tab = tab;
    const on = 'rounded-lg bg-gradient-to-b from-gold to-gold/85 px-3 py-1.5 font-semibold text-ink shadow transition';
    const off = 'rounded-lg px-3 py-1.5 text-cream/50 transition hover:text-cream';
    Util.byId('main').querySelectorAll('[data-tab]').forEach((btn) => {
      btn.className = btn.dataset.tab === tab ? on : off;
    });

    const id = App.state.currentProject.id;
    if (tab === 'chat') Chat.open(id);
    else if (tab === 'tasks') Tasks.open(id);
    else if (tab === 'phases') Projects.renderPhases(id);
    else if (tab === 'versions') Projects.renderVersions(id);
  },

  async loadProgress(projectId) {
    const bar = Util.byId('project-progress');
    if (!bar) return;
    try {
      const data = await Api.request(`projects/${projectId}/tasks`);
      const total = data.tasks.length;
      const done = data.tasks.filter((t) => t.done).length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      bar.innerHTML = total ? `
        <div class="flex items-center gap-2">
          <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div class="h-full rounded-full bg-gradient-to-l from-gold to-gold/60 transition-all" style="width:${pct}%"></div>
          </div>
          <span class="text-[10px] text-cream/40">${done} از ${total} · ٪${pct}</span>
        </div>` : '';
    } catch { /* progress is cosmetic */ }
  },

  // ----------------------------------------------------------------- repo

  paintRepoChip(project) {
    const chip = Util.byId('repo-chip');
    if (!chip) return;
    if (project.repo_url) {
      chip.innerHTML = `<a href="${Util.esc(project.repo_url)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2 py-0.5 transition hover:bg-white/10 hover:text-gold">
        ${Util.icon('code', 'text-sm')} ریپازیتوری</a>`;
    } else {
      chip.innerHTML = `<button id="repo-add-btn" class="inline-flex items-center gap-1 rounded-lg border border-dashed border-white/20 px-2 py-0.5 text-cream/40 transition hover:border-gold/40 hover:text-gold">
        ${Util.icon('add_link', 'text-sm')} ثبت ریپازیتوری</button>`;
      Util.byId('repo-add-btn').addEventListener('click', () => Projects.repoEditor(project.id, ''));
    }
  },

  repoEditor(projectId, current) {
    App.modal({
      title: 'لینک ریپازیتوری پروژه',
      fields: [{ name: 'repo_url', label: 'آدرس Git (GitHub, GitLab و…)', value: current, placeholder: 'https://github.com/team/repo' }],
      submitLabel: 'ذخیره',
      onSubmit: async (v) => {
        await Api.request('projects/' + projectId, { method: 'PATCH', body: { repo_url: v.repo_url.trim() } });
        const d = await Api.request('projects/' + projectId);
        App.state.currentProject = d.project;
        Projects.paintRepoChip(d.project);
        App.toast('ذخیره شد', false);
      },
    });
  },

  // --------------------------------------------------------------- phases

  async renderPhases(projectId) {
    Chat.stopPoll();
    Tasks.stopPoll();
    Util.byId('panel').innerHTML = `
      <div class="h-full overflow-y-auto p-5">
        <div class="mx-auto max-w-xl space-y-3">
          <form id="phase-form" class="card flex gap-2 p-3">
            <input name="title" required placeholder="نام فاز جدید… مثلاً طراحی رابط کاربری" class="input" />
            <button class="btn-primary shrink-0">${Util.icon('add', 'text-base')} فاز</button>
          </form>
          <div id="phases-list" class="space-y-2"><p class="py-4 text-center text-xs text-cream/30">در حال بارگذاری…</p></div>
        </div>
      </div>`;

    Util.byId('phase-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = new FormData(e.target).get('title');
      try {
        await Api.request(`projects/${projectId}/phases`, { method: 'POST', body: { title } });
        e.target.reset();
        Projects.renderPhases(projectId);
      } catch (err) {
        App.toast(Util.errorFa(err));
      }
    });

    const data = await Api.request(`projects/${projectId}/phases`);
    const box = Util.byId('phases-list');
    if (!box) return;
    if (!data.phases.length) {
      box.innerHTML = `<p class="rounded-xl border border-dashed border-white/15 py-6 text-center text-xs text-cream/30">
        هنوز فازی نساخته‌ای — پروژه‌ات را به فازهای قابل مدیریت تقسیم کن</p>`;
      return;
    }
    box.innerHTML = data.phases.map((ph, i) => {
      const pct = ph.task_count ? Math.round((ph.done_count / ph.task_count) * 100) : 0;
      return `
      <div class="card flex items-center gap-3 p-4">
        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-sm font-bold text-gold">${i + 1}</div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">${Util.esc(ph.title)}</p>
          <div class="mt-1.5 flex items-center gap-2">
            <div class="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
              <div class="h-full rounded-full bg-gold/70" style="width:${pct}%"></div>
            </div>
            <span class="text-[10px] text-cream/35">${ph.done_count}/${ph.task_count}</span>
          </div>
        </div>
        <button data-del-phase="${ph.id}" class="btn-ghost h-8 px-2 text-rose-300/70" title="حذف فاز">${Util.icon('delete', 'text-base')}</button>
      </div>`;
    }).join('');

    box.querySelectorAll('[data-del-phase]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          await Api.request('phases/' + btn.dataset.delPhase, { method: 'DELETE' });
          Projects.renderPhases(projectId);
        } catch (err) {
          App.toast(Util.errorFa(err));
        }
      }));
  },

  // ------------------------------------------------------------- versions

  async renderVersions(projectId) {
    Chat.stopPoll();
    Tasks.stopPoll();
    Util.byId('panel').innerHTML = `
      <div class="h-full overflow-y-auto p-5">
        <div class="mx-auto max-w-xl space-y-3">
          <button id="new-version-btn" class="btn-soft w-full">${Util.icon('new_releases', 'text-base')} ثبت نسخه‌ی جدید</button>
          <div id="versions-list" class="space-y-2"><p class="py-4 text-center text-xs text-cream/30">در حال بارگذاری…</p></div>
        </div>
      </div>`;

    Util.byId('new-version-btn').addEventListener('click', () => {
      App.modal({
        title: 'ثبت نسخه‌ی جدید',
        fields: [{ name: 'name', label: 'شماره نسخه', placeholder: 'مثلاً 1.2.0' }],
        textareas: [{ name: 'notes', label: 'تغییرات این نسخه (Release Notes)', placeholder: '- فیچر جدید…\n- رفع باگ…' }],
        submitLabel: 'ثبت نسخه',
        onSubmit: async (v) => {
          await Api.request(`projects/${projectId}/versions`, { method: 'POST', body: { name: v.name, notes: v.notes } });
          App.toast('نسخه ثبت شد 🚀', false);
          Projects.renderVersions(projectId);
        },
      });
    });

    const data = await Api.request(`projects/${projectId}/versions`);
    const box = Util.byId('versions-list');
    if (!box) return;
    if (!data.versions.length) {
      box.innerHTML = `<p class="rounded-xl border border-dashed border-white/15 py-6 text-center text-xs text-cream/30">
        هنوز نسخه‌ای ثبت نشده — هر انتشار مهم را با شماره نسخه مستند کن</p>`;
      return;
    }
    box.innerHTML = data.versions.map((v) => `
      <div class="card relative p-4 pe-12">
        <div class="flex items-center gap-2">
          <span class="chip bg-gold/15 font-mono text-gold">v${Util.esc(v.name)}</span>
          <span class="text-[10px] text-cream/35">${Util.dateTimeFa(v.created_at)} · ${Util.esc(v.creator.display_name)}</span>
          <button data-del-version="${v.id}" class="btn-ghost ms-auto h-6 px-1 text-rose-300/60">${Util.icon('delete', 'text-sm')}</button>
        </div>
        ${v.notes ? `<div class="md mt-2">${Util.mdToHtml(v.notes)}</div>` : ''}
      </div>`).join('');

    box.querySelectorAll('[data-del-version]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          await Api.request('versions/' + btn.dataset.delVersion, { method: 'DELETE' });
          Projects.renderVersions(projectId);
        } catch (err) {
          App.toast(Util.errorFa(err));
        }
      }));
  },
};
