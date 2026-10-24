// Tasks panel: phases, priority, due dates, assignees — full task management.

const Tasks = {
  pollTimer: null,
  phaseFilter: '',

  stopPoll() {
    if (Tasks.pollTimer) {
      clearInterval(Tasks.pollTimer);
      Tasks.pollTimer = null;
    }
  },

  async open(projectId) {
    Chat.stopPoll();
    Tasks.stopPoll();
    Tasks.phaseFilter = '';

    Util.byId('panel').innerHTML = `
      <div class="h-full overflow-y-auto p-5">
        <div class="mx-auto max-w-2xl space-y-3">
          <form id="task-form" class="card space-y-2 p-3">
            <div class="flex gap-2">
              <input name="title" required placeholder="تسک جدید…" class="input flex-1" />
              <button class="btn-primary shrink-0">${Util.icon('add', 'text-base')} افزودن</button>
            </div>
            <div class="flex flex-wrap gap-2">
              <select id="task-assignee" name="assignee_id" class="input w-40 flex-none text-xs"></select>
              <select id="task-phase" name="phase_id" class="input w-40 flex-none text-xs"></select>
              <select id="task-priority" name="priority" class="input w-32 flex-none text-xs">
                <option value="low">🟢 اولویت کم</option>
                <option value="medium" selected>🟡 اولویت متوسط</option>
                <option value="high">🔴 اولویت بالا</option>
              </select>
              <input id="task-due" name="due_date" type="date" class="input w-36 flex-none text-xs" title="ددلاین" />
            </div>
          </form>
          <div id="tasks-toolbar" class="flex items-center gap-2"></div>
          <div id="tasks-list" class="space-y-2"></div>
        </div>
      </div>`;

    // assignee + phase options
    try {
      const [proj, phases] = await Promise.all([
        Api.request('projects/' + projectId),
        Api.request(`projects/${projectId}/phases`),
      ]);
      const sel = Util.byId('task-assignee');
      if (sel) {
        sel.innerHTML = '<option value="">برای خودم</option>' + proj.members.map((m) =>
          `<option value="${m.id}">${Util.esc(m.display_name)}${m.id === App.state.user.id ? ' (من)' : ''}</option>`).join('');
      }
      const ph = Util.byId('task-phase');
      if (ph) {
        ph.innerHTML = '<option value="">بدون فاز</option>' + phases.phases.map((p) =>
          `<option value="${p.id}">${Util.esc(p.title)}</option>`).join('');
      }
    } catch { /* selects stay default */ }

    Util.byId('task-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const body = {
        title: f.querySelector('input[name="title"]').value,
        priority: Util.byId('task-priority').value,
      };
      const assignee = Util.byId('task-assignee').value;
      const phase = Util.byId('task-phase').value;
      const due = Util.byId('task-due').value;
      if (assignee) body.assignee_id = Number(assignee);
      if (phase) body.phase_id = Number(phase);
      if (due) body.due_date = due;
      try {
        await Api.request(`projects/${projectId}/tasks`, { method: 'POST', body });
        f.querySelector('input[name="title"]').value = '';
        f.querySelector('input[name="due_date"]').value = '';
        await Tasks.refresh(projectId);
        Projects.loadProgress(projectId);
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

    Tasks.cache = data.tasks;
    Tasks.paintToolbar(projectId);

    const filtered = Tasks.phaseFilter
      ? data.tasks.filter((t) => String(t.phase_id || '') === String(Tasks.phaseFilter))
      : data.tasks;

    if (!filtered.length) {
      box.innerHTML = '<div class="card p-6 text-center text-sm text-cream/40">تسکی اینجا نیست — اولین تسک را اضافه کن! ✨</div>';
      return;
    }

    const open = filtered.filter((t) => !t.done);
    const done = filtered.filter((t) => t.done);
    box.innerHTML =
      (open.length ? `<p class="px-1 text-[11px] font-bold text-cream/35">در جریان (${open.length})</p>` : '')
      + open.map((t) => Tasks.item(t)).join('')
      + (done.length ? `<p class="px-1 pt-2 text-[11px] font-bold text-cream/35">انجام‌شده (${done.length})</p>` : '')
      + done.map((t) => Tasks.item(t)).join('');

    box.querySelectorAll('[data-toggle]').forEach((cb) =>
      cb.addEventListener('change', async () => {
        try {
          await Api.request('tasks/' + cb.dataset.toggle, { method: 'PATCH', body: { done: cb.checked } });
          await Tasks.refresh(projectId);
          Projects.loadProgress(projectId);
        } catch (err) {
          App.toast(Util.errorFa(err));
        }
      }));

    // assignee avatars (async, painted after the list itself)
    box.querySelectorAll('[data-avatar-task]').forEach(async (el) => {
      const task = (Tasks.cache || []).find((t) => String(t.id) === el.dataset.avatarTask);
      if (task && task.assignee) el.innerHTML = await Util.avatarHtml(task.assignee, 'h-7 w-7 text-[10px]');
    });
  },

  paintToolbar(projectId) {
    const bar = Util.byId('tasks-toolbar');
    if (!bar) return;
    const phases = [];
    for (const t of Tasks.cache || []) {
      if (t.phase_id && t.phase_title && !phases.some((p) => p.id === t.phase_id)) {
        phases.push({ id: t.phase_id, title: t.phase_title });
      }
    }
    if (!phases.length) {
      bar.innerHTML = '';
      return;
    }
    bar.innerHTML = `<span class="text-[10px] text-cream/35">فیلتر فاز:</span>` + [{
      id: '', title: 'همه',
    }].concat(phases).map((p) => `
      <button data-filter="${p.id}" class="chip ${String(Tasks.phaseFilter) === String(p.id) ? 'bg-gold/20 text-gold' : 'bg-white/5 text-cream/50 hover:bg-white/10'}">${Util.esc(p.title)}</button>`).join('');
    bar.querySelectorAll('[data-filter]').forEach((btn) =>
      btn.addEventListener('click', () => {
        Tasks.phaseFilter = btn.dataset.filter;
        Tasks.refresh(projectId);
      }));
  },

  item(t) {
    const mine = t.assignee && t.assignee.id === App.state.user.id;
    const prioCls = { high: 'bg-rose-500/15 text-rose-300', medium: 'bg-amber-500/15 text-amber-300', low: 'bg-emerald-500/15 text-emerald-300' }[t.priority] || '';
    const prioFa = { high: 'بالا', medium: 'متوسط', low: 'کم' }[t.priority] || '';
    const overdue = t.due_date && !t.done && t.due_date < new Date().toISOString().slice(0, 10);

    return `
      <div class="card flex items-start gap-3 px-4 py-3 transition ${t.done ? 'opacity-55' : ''}">
        <input type="checkbox" data-toggle="${t.id}" ${t.done ? 'checked' : ''} class="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-gold" />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium ${t.done ? 'text-cream/40 line-through' : ''}">${Util.esc(t.title)}</p>
          <div class="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-cream/40">
            <span class="chip ${prioCls}">${prioFa}</span>
            ${t.phase_title ? `<span class="chip bg-white/5">${Util.icon('timeline', 'text-xs')}${Util.esc(t.phase_title)}</span>` : ''}
            ${t.due_date ? `<span class="chip ${overdue ? 'bg-rose-500/15 text-rose-300' : 'bg-white/5'}">${Util.icon('event', 'text-xs')}${Util.dateFa(t.due_date + ' 00:00:00')}</span>` : ''}
            <span class="chip bg-white/5">${mine ? 'برای من' : 'برای ' + Util.esc(t.assignee ? t.assignee.display_name : '—')}</span>
          </div>
        </div>
        <span data-avatar-task="${t.id}" class="mt-0.5 shrink-0" title="${t.done ? 'انجام شد ✓' : ''}"></span>
      </div>`;
  },
};
