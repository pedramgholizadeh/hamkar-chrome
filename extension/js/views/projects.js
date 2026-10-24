// Projects: sidebar list + project view shell with tasks/chat tabs.

const Projects = {
  async load() {
    const data = await Api.request('projects');
    App.state.projects = data.projects;
    Projects.renderList();
  },

  renderList() {
    const box = Util.byId('projects-list');
    if (!App.state.projects.length) {
      box.innerHTML = '<p class="px-2 py-1 text-xs text-slate-400">هنوز پروژه‌ای نداری</p>';
      return;
    }
    box.innerHTML = App.state.projects.map((p) => `
      <button data-project="${p.id}" class="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-right text-sm transition hover:bg-slate-100 ${App.state.currentProject && App.state.currentProject.id === p.id ? 'bg-indigo-50 font-medium text-indigo-700' : ''}">
        <span class="shrink-0 text-xs">${p.team_id ? '👥' : '📁'}</span>
        <span class="min-w-0 flex-1 truncate">${Util.esc(p.name)}</span>
      </button>`).join('');
    box.querySelectorAll('[data-project]').forEach((btn) =>
      btn.addEventListener('click', () => Projects.open(Number(btn.dataset.project))));
  },

  async open(projectId) {
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
        <div class="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <div class="min-w-0">
            <h1 class="truncate font-bold">${Util.esc(data.project.name)}</h1>
            <p class="text-xs text-slate-400">${data.project.team_name ? 'تیم: ' + Util.esc(data.project.team_name) : 'پروژه‌ی شخصی'}</p>
          </div>
          <div class="flex shrink-0 rounded-xl bg-slate-100 p-1 text-sm">
            <button id="tab-chat" class="rounded-lg px-4 py-1.5 transition">💬 چت</button>
            <button id="tab-tasks" class="rounded-lg px-4 py-1.5 transition">✅ تسک‌ها</button>
          </div>
        </div>
        <div id="panel" class="min-h-0 flex-1"></div>
      </div>`;

    Util.byId('tab-chat').addEventListener('click', () => App.setTab('chat'));
    Util.byId('tab-tasks').addEventListener('click', () => App.setTab('tasks'));
    App.setTab('chat');
  },
};
