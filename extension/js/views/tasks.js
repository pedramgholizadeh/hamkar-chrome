// Tasks panel: create for self or teammates, check off as done.

const Tasks = {
  pollTimer: null,

  stopPoll() {
    if (Tasks.pollTimer) {
      clearInterval(Tasks.pollTimer);
      Tasks.pollTimer = null;
    }
  },

  async open(projectId) {
    Chat.stopPoll();
    Tasks.stopPoll();

    Util.byId('panel').innerHTML = `
      <div class="h-full overflow-y-auto p-5">
        <div class="mx-auto max-w-2xl space-y-3">
          <form id="task-form" class="card flex gap-2 p-3">
            <input name="title" required placeholder="تسک جدید…" class="input" />
            <select id="task-assignee" name="assignee_id" class="input w-44 shrink-0"></select>
            <button class="btn-primary shrink-0">افزودن</button>
          </form>
          <div id="tasks-list" class="space-y-2"></div>
        </div>
      </div>`;

    // assignee options = everyone with access to the project
    try {
      const data = await Api.request('projects/' + projectId);
      const select = Util.byId('task-assignee');
      if (select) {
        select.innerHTML = data.members.map((m) =>
          `<option value="${m.id}">${Util.esc(m.name || m.email)}${m.id === App.state.user.id ? ' (من)' : ''}</option>`).join('');
      }
    } catch { /* assignee select stays empty; server still defaults to me */ }

    Util.byId('task-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      try {
        await Api.request(`projects/${projectId}/tasks`, {
          method: 'POST',
          body: {
            title: new FormData(form).get('title'),
            assignee_id: Number(Util.byId('task-assignee').value) || undefined,
          },
        });
        form.querySelector('input[name="title"]').value = '';
        await Tasks.refresh(projectId);
      } catch (err) {
        App.toast(Util.errorFa(err));
      }
    });

    await Tasks.refresh(projectId);
    Tasks.pollTimer = setInterval(() => Tasks.refresh(projectId).catch(() => {}), 8000);
  },

  async refresh(projectId) {
    const data = await Api.request(`projects/${projectId}/tasks`);
    const box = Util.byId('tasks-list');
    if (!box) return;

    box.innerHTML = data.tasks.length
      ? data.tasks.map(Tasks.item).join('')
      : '<div class="card p-6 text-center text-sm text-slate-400">هنوز تسکی نیست — اولین تسک را اضافه کن! ✨</div>';

    box.querySelectorAll('[data-toggle]').forEach((cb) =>
      cb.addEventListener('change', async () => {
        try {
          await Api.request('tasks/' + cb.dataset.toggle, { method: 'PATCH', body: { done: cb.checked } });
          await Tasks.refresh(projectId);
        } catch (err) {
          App.toast(Util.errorFa(err));
        }
      }));
  },

  item(t) {
    const mine = t.assignee_id === App.state.user.id;
    const assignee = mine ? 'من' : (t.assignee_name || t.assignee_email || '—');
    return `
      <div class="card flex items-center gap-3 px-4 py-3 transition ${Number(t.done) ? 'opacity-60' : ''}">
        <input type="checkbox" data-toggle="${t.id}" ${Number(t.done) ? 'checked' : ''} class="h-5 w-5 shrink-0 cursor-pointer accent-indigo-600" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium ${Number(t.done) ? 'text-slate-400 line-through' : ''}">${Util.esc(t.title)}</p>
          <p class="text-[11px] text-slate-400">برای: ${Util.esc(assignee)} · توسط: ${Util.esc(t.creator_name || t.creator_email)}</p>
        </div>
        ${Number(t.done) ? '<span class="shrink-0 text-xs text-emerald-500">انجام شد ✓</span>' : ''}
      </div>`;
  },
};
