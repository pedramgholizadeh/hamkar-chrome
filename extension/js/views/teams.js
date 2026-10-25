// Teams: sidebar list + Bento Grid team page (identity, meetings, members, invite, skills).

const Teams = {
  data: null,

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
      <button data-team="${t.id}" class="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-sm transition hover:bg-white/[0.06] ${App.state.currentTeam === t.id ? 'border border-accent/30 bg-accent/15 font-medium text-white' : 'border border-transparent'}">
        <span data-team-logo="${t.id}" class="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/10 text-[11px] font-bold"></span>
        <span class="min-w-0 flex-1 truncate text-right">${Util.esc(t.name)}</span>
        ${t.role === 'owner' ? '<span class="shrink-0 text-[10px]">👑</span>' : ''}
      </button>`).join('');
    box.querySelectorAll('[data-team]').forEach((btn) =>
      btn.addEventListener('click', () => Teams.open(Number(btn.dataset.team))));
    box.querySelectorAll('[data-team-logo]').forEach((el) => Teams.paintSidebarLogo(el));
  },

  async paintSidebarLogo(el) {
    const team = App.state.teams.find((t) => t.id === Number(el.dataset.teamLogo));
    if (team && team.logo_file_id) {
      const url = await MediaStore.url(team.logo_file_id);
      if (url) {
        el.innerHTML = `<img src="${url}" class="h-full w-full object-cover" alt="" />`;
        return;
      }
    }
    el.textContent = (team ? team.name : '?').charAt(0);
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
    Teams.data = data;

    const isOwner = data.team.owner_id === App.state.user.id;
    const teamProjects = App.state.projects.filter((p) => p.team_id === teamId).length;

    Util.byId('main').innerHTML = `
      <div class="h-full overflow-y-auto p-5">
        <div class="mx-auto grid max-w-3xl grid-cols-6 gap-3">

          <!-- identity -->
          <div class="panel col-span-6 p-5">
            <div class="flex items-center gap-4">
              <button id="team-logo-btn" class="${isOwner ? 'group relative' : 'cursor-default'} shrink-0">
                <span id="team-logo-holder" class="block"></span>
                ${isOwner ? `<span class="absolute inset-0 flex items-center justify-center rounded-2xl bg-ink/70 opacity-0 transition group-hover:opacity-100">${Util.icon('edit')}</span>` : ''}
              </button>
              <input type="file" id="team-logo-file" accept="image/*" class="hidden" />
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <h1 id="team-title" class="truncate text-xl font-extrabold text-vanilla">${Util.esc(data.team.name)}</h1>
                  ${isOwner ? `<button id="team-rename-btn" class="btn-ghost h-7 px-2 text-cream/40 transition hover:text-cyan" title="تغییر نام تیم"><span class="ms text-base">edit</span><span class="text-[10px]">تغییر نام</span></button>` : ''}
                </div>
                <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-cream/40">
                  <span class="chip bg-white/5"><span class="ms text-sm">group</span> ${data.members.length} عضو</span>
                  <span class="chip bg-white/5"><span class="ms text-sm">folder</span> ${teamProjects} پروژه</span>
                  <button id="team-copy-code" class="chip bg-white/5 transition hover:bg-white/10">
                    کد دعوت: <span class="font-mono font-bold tracking-widest text-cyan">${Util.esc(data.team.invite_code)}</span> <span class="ms text-sm">content_copy</span>
                  </button>
                </div>
              </div>
              <button id="new-meeting-btn" class="btn-primary shrink-0"><span class="ms text-base">videocam</span> جلسه آنلاین</button>
            </div>
          </div>

          <!-- active meeting -->
          <div id="meeting-slot" class="col-span-6"></div>

          <!-- members -->
          <div class="panel col-span-4 p-5">
            <h2 class="mb-3 flex items-center gap-1.5 text-sm font-bold text-vanilla"><span class="ms text-base text-accent">group</span> اعضا</h2>
            <div id="members-grid" class="grid grid-cols-1 gap-2"></div>
          </div>

          <!-- invite -->
          <div class="panel col-span-2 flex flex-col p-5">
            <h2 class="mb-2 flex items-center gap-1.5 text-sm font-bold text-vanilla"><span class="ms text-base text-cyan">person_add</span> دعوت همکار</h2>
            <p class="text-[11px] leading-5 text-cream/40">کد بالا را برایش بفرست، یا ایمیلش را وارد کن تا بعد از ورود، دعوت را ببیند.</p>
            <form id="invite-form" class="mt-auto space-y-2 pt-3">
              <input name="email" type="email" required placeholder="ایمیل همکار جدید" class="input text-xs" />
              <button class="btn-primary w-full text-xs">ثبت دعوت</button>
            </form>
          </div>

          <!-- recent activity -->
          <div class="panel col-span-6 p-5">
            <div class="mb-3 flex items-center justify-between">
              <h2 class="flex items-center gap-1.5 text-sm font-bold text-vanilla"><span class="ms text-base text-accent">history</span> فعالیت‌های اخیر تیم</h2>
              <button id="team-activity-all" class="btn-ghost h-7 text-[11px] text-cream/40">مشاهده همه</button>
            </div>
            <div id="team-activity" class="space-y-1.5"><p class="py-3 text-center text-xs text-cream/30">در حال بارگذاری…</p></div>
          </div>

          <!-- team projects -->
          <div class="panel col-span-6 p-5">
            <div class="mb-3 flex items-center justify-between">
              <h2 class="flex items-center gap-1.5 text-sm font-bold text-vanilla"><span class="ms text-base text-cyan">folder_shared</span> پروژه‌های تیم</h2>
              <button id="team-add-project" class="btn-soft h-8 text-xs">${Util.icon('add', 'text-base')} افزودن پروژه</button>
            </div>
            <div id="team-projects" class="grid grid-cols-3 gap-2"></div>
          </div>

          <!-- skills -->
          <div class="panel col-span-6 p-5">
            <div class="mb-3 flex items-center justify-between">
              <h2 class="flex items-center gap-1.5 text-sm font-bold text-vanilla"><span class="ms text-base text-accent">description</span> اسکیل‌های تیم</h2>
              <div class="flex gap-1">
                <button id="skill-upload-btn" class="btn-ghost h-8 text-xs" title="آپلود فایل Skill.md"><span class="ms text-base">upload_file</span> فایل</button>
                <button id="skill-new-btn" class="btn-soft h-8 text-xs"><span class="ms text-base">add</span> اسکیل جدید</button>
              </div>
            </div>
            <input type="file" id="skill-file" accept=".md,.markdown,text/markdown" class="hidden" />
            <div id="skills-grid" class="grid grid-cols-3 gap-2"><p class="col-span-3 py-3 text-center text-xs text-cream/30">در حال بارگذاری…</p></div>
          </div>

        </div>
      </div>`;

    Teams.loadActivity(teamId);
    Teams.renderTeamProjects(teamId, data.projects || []);
    Util.byId('team-add-project').addEventListener('click', () => Teams.addExistingProject(teamId, data.projects || []));
    Teams.paintPageLogo();
    Teams.renderMembers(data.members);
    Teams.loadMeetings(teamId);
    Teams.loadSkills(teamId);

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
    Util.byId('new-meeting-btn').addEventListener('click', () => Teams.newMeeting(teamId));

    if (isOwner) {
      Util.byId('team-rename-btn').addEventListener('click', () => {
        App.modal({
          title: 'تغییر نام تیم',
          fields: [{ name: 'name', label: 'نام تیم', value: data.team.name }],
          submitLabel: 'ذخیره',
          onSubmit: async (v) => {
            await Api.request(`teams/${teamId}`, { method: 'PATCH', body: { name: v.name } });
            await Teams.load();
            Teams.open(teamId);
          },
        });
      });
      Util.byId('team-logo-btn').addEventListener('click', () => Util.byId('team-logo-file').click());
      Util.byId('team-logo-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const form = new FormData();
        form.append('logo', file);
        try {
          const d = await Api.request(`teams/${teamId}/logo`, { method: 'POST', form });
          MediaStore.cache.delete(d.team.logo_file_id);
          await Teams.load();
          Teams.open(teamId);
          App.toast('لوگوی تیم به‌روز شد', false);
        } catch (err) {
          App.toast(Util.errorFa(err));
        }
      });
    }

    Util.byId('skill-new-btn').addEventListener('click', () => Teams.skillEditor(teamId));
    Util.byId('skill-upload-btn').addEventListener('click', () => Util.byId('skill-file').click());
    Util.byId('skill-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const form = new FormData();
      form.append('file', file);
      try {
        await Api.request(`teams/${teamId}/skills`, { method: 'POST', form });
        App.toast('اسکیل به اشتراک گذاشته شد', false);
        Teams.loadSkills(teamId);
      } catch (err) {
        App.toast(Util.errorFa(err));
      }
      e.target.value = '';
    });
  },

  /** Attach one of my existing projects to this team. */
  addExistingProject(teamId, teamProjects) {
    const inTeam = new Set(teamProjects.map((p) => p.id));
    const candidates = App.state.projects.filter((p) => p.owner_id === App.state.user.id && !inTeam.has(p.id));
    if (!candidates.length) {
      App.toast('پروژه‌ای از تو باقی نمانده — همه‌ی پروژه‌هایت این‌جا هستند یا مالِ دیگران است');
      return;
    }
    App.modal({
      title: 'افزودن پروژه به تیم',
      fields: [{
        name: 'project_id', label: 'از پروژه‌های موجود انتخاب کن', type: 'select',
        options: candidates.map((p) => ({ value: p.id, label: p.name })),
      }],
      submitLabel: 'افزودن به تیم',
      onSubmit: async (v) => {
        const project = await Api.request('projects/' + v.project_id);
        const teamIds = String(project.project.team_ids || '').split(',').filter(Boolean).map(Number);
        if (!teamIds.includes(teamId)) teamIds.push(teamId);
        await Api.request('projects/' + v.project_id, { method: 'PATCH', body: { team_ids: teamIds } });
        App.toast('پروژه به تیم اضافه شد', false);
        Teams.open(teamId);
      },
    });
  },

  async loadActivity(teamId) {
    const box = Util.byId('team-activity');
    if (!box) return;
    try {
      const data = await Api.request(`teams/${teamId}/activity`);
      const rows = data.activities.slice(0, 6);
      box.innerHTML = rows.length ? rows.map((a) => Projects.activityRow(a)).join('')
        : '<p class="py-3 text-center text-xs text-cream/30">هنوز فعالیتی ثبت نشده</p>';
      Util.byId('team-activity-all').onclick = () => {
        App.modal({
          title: 'فعالیت‌های تیم',
          customBody: `<div class="max-h-[55vh] space-y-1 overflow-y-auto pe-1">${data.activities.map((a) => Projects.activityRow(a)).join('') || '<p class="py-4 text-center text-xs text-cream/30">خالی است</p>'}</div>`,
          onSubmit: async () => {},
        });
      };
    } catch {
      box.innerHTML = '';
    }
  },

  renderTeamProjects(teamId, projects) {
    const box = Util.byId('team-projects');
    if (!box) return;
    if (!projects.length) {
      box.innerHTML = `<p class="col-span-3 rounded-xl border border-dashed border-white/15 py-6 text-center text-xs text-cream/30">
        هنوز پروژه‌ای به این تیم وصل نیست — هنگام ساخت پروژه، تیمش را انتخاب کن</p>`;
      return;
    }
    box.innerHTML = projects.map((pr) => `
      <button data-open-project="${pr.id}" class="card flex flex-col items-start gap-1 p-3 text-right transition hover:border-cyan/40">
        <span class="flex w-full items-center gap-2">
          ${Util.icon('folder_open', 'text-base text-cyan')}
          <span class="min-w-0 flex-1 truncate text-sm font-medium">${Util.esc(pr.name)}</span>
        </span>
        <span class="text-[10px] text-cream/35">${Util.dateTimeFa(pr.created_at)}</span>
      </button>`).join('');
    box.querySelectorAll('[data-open-project]').forEach((btn) =>
      btn.addEventListener('click', () => Projects.open(Number(btn.dataset.openProject))));
  },

  async paintPageLogo() {
    const holder = Util.byId('team-logo-holder');
    if (!holder) return;
    const team = Teams.data.team;
    if (team.logo_file_id) {
      const url = await MediaStore.url(team.logo_file_id);
      if (url) {
        holder.innerHTML = `<img src="${url}" class="h-16 w-16 rounded-2xl object-cover" alt="" />`;
        return;
      }
    }
    holder.innerHTML = `<div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/40 to-cyan/20 text-2xl font-extrabold text-white">${Util.esc(team.name.charAt(0))}</div>`;
  },

  renderMembers(members) {
    const grid = Util.byId('members-grid');
    if (!grid) return;
    Promise.all(members.map(async (m) => `
      <div class="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2 transition hover:bg-white/[0.07]">
        ${await Util.avatarHtml(m)}
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-1.5 truncate text-sm font-medium">
            ${Util.esc(m.display_name)}
            <span class="h-1.5 w-1.5 shrink-0 rounded-full ${m.online ? 'bg-mint shadow shadow-mint/50' : 'bg-cream/20'}" title="${m.online ? 'آنلاین' : 'آفلاین'}"></span>
          </p>
          <p class="truncate text-[11px] text-cream/35">${Util.esc(m.email)}</p>
        </div>
        <span class="chip ${m.role === 'owner' ? 'bg-accent/15 text-accent' : 'bg-white/5 text-cream/50'}">${m.role === 'owner' ? '👑 مالک' : 'عضو'}</span>
      </div>`)).then((rows) => { grid.innerHTML = rows.join(''); });
  },

  // ------------------------------------------------------------ meetings

  async loadMeetings(teamId) {
    const slot = Util.byId('meeting-slot');
    if (!slot) return;
    let data;
    try {
      data = await Api.request(`teams/${teamId}/meetings`);
    } catch {
      slot.innerHTML = '';
      return;
    }
    const active = data.meetings.find((m) => m.status === 'active');
    const past = data.meetings.filter((m) => m.status !== 'active').slice(0, 4);

    const activeHtml = active ? `
      <div class="panel col-span-6 border-accent/30 p-5">
        <div class="absolute -left-10 -top-10 h-36 w-36 rounded-full bg-accent/30 blur-3xl"></div>
        <div class="relative flex items-center gap-4">
          <div class="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/20">
            ${Util.icon('videocam', 'ms-fill text-2xl text-accent')}
            <span class="absolute -bottom-0.5 -left-0.5 h-3 w-3 animate-pulse rounded-full border-2 border-ink bg-mint"></span>
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-bold text-vanilla">${active.title ? Util.esc(active.title) : 'جلسه آنلاین فعال'}</p>
            <p class="text-[11px] text-cream/40">شروع: ${Util.dateTimeFa(active.created_at)} · توسط ${Util.esc(active.creator.display_name)}</p>
            <div class="mt-1 flex items-center gap-1" id="meeting-attendees"></div>
          </div>
          <div class="flex shrink-0 flex-col gap-1">
            <button data-join-meeting="${active.id}" data-url="${Util.esc(active.url)}" class="btn-primary"><span class="ms text-base">call</span> پیوستن</button>
            ${active.creator.id === App.state.user.id || Teams.data.team.owner_id === App.state.user.id
              ? `<button data-end-meeting="${active.id}" class="btn-danger text-xs">پایان</button>` : ''}
          </div>
        </div>
      </div>` : '';

    slot.innerHTML = activeHtml + (past.length ? `
      <div class="glass col-span-6 rounded-2xl px-5 py-3">
        <p class="mb-2 text-[11px] font-bold text-cream/35">جلسه‌های قبلی</p>
        <div class="space-y-1">
          ${past.map((m) => `
            <div class="flex items-center gap-2 text-xs text-cream/45">
              ${Util.icon('history', 'text-sm text-cream/30')}
              <span class="flex-1 truncate">${m.title ? Util.esc(m.title) : 'جلسه'}</span>
              <span>${Util.dateTimeFa(m.created_at)}</span>
            </div>`).join('')}
        </div>
      </div>` : '');

    if (active) {
      const att = Util.byId('meeting-attendees');
      if (att && active.attendees.length) {
        const avatars = await Promise.all(active.attendees.slice(0, 5).map((a) => Util.avatarHtml(a, 'h-5 w-5 text-[9px]')));
        att.innerHTML = avatars.join('')
          + `<span class="text-[10px] text-cream/40">${active.attendees.length} نفر جلسه‌اند</span>`;
      }
      slot.querySelectorAll('[data-join-meeting]').forEach((btn) =>
        btn.addEventListener('click', async () => {
          try {
            await Api.request(`meetings/${btn.dataset.joinMeeting}/join`, { method: 'POST' });
          } catch { /* already joined is fine */ }
          window.open(btn.dataset.url, '_blank');
          Teams.loadMeetings(teamId);
        }));
      slot.querySelectorAll('[data-end-meeting]').forEach((btn) =>
        btn.addEventListener('click', async () => {
          try {
            await Api.request(`meetings/${btn.dataset.endMeeting}/end`, { method: 'POST' });
            Teams.loadMeetings(teamId);
          } catch (err) {
            App.toast(Util.errorFa(err));
          }
        }));
    }
  },

  newMeeting(teamId) {
    App.modal({
      title: 'جلسه‌ی آنلاین جدید',
      fields: [
        { name: 'title', label: 'عنوان جلسه (اختیاری)', placeholder: 'مثلاً استندآپ روزانه' },
        { name: 'url', label: 'لینک Google Meet', placeholder: 'https://meet.google.com/xxx-xxxx-xxx' },
      ],
      submitLabel: 'شروع جلسه',
      onSubmit: async (v) => {
        await Api.request(`teams/${teamId}/meetings`, { method: 'POST', body: { title: v.title, url: v.url.trim() } });
        App.toast('جلسه فعال شد؛ همه‌ی اعضا می‌بینند', false);
        Teams.loadMeetings(teamId);
      },
    });
  },

  // --------------------------------------------------------------- skills

  async loadSkills(teamId) {
    const grid = Util.byId('skills-grid');
    if (!grid) return;
    let data;
    try {
      data = await Api.request(`teams/${teamId}/skills`);
    } catch {
      grid.innerHTML = '';
      return;
    }
    if (!data.skills.length) {
      grid.innerHTML = `<p class="col-span-3 rounded-xl border border-dashed border-white/15 py-6 text-center text-xs text-cream/30">
        هنوز اسکیلی نیست — فایل Skill.md خودت را بساز و با تیم به اشتراک بگذار</p>`;
      return;
    }
    grid.innerHTML = data.skills.map((s) => `
      <button data-skill="${s.id}" class="card group flex flex-col items-start gap-1 p-3 text-right transition hover:border-accent/40">
        <div class="flex w-full items-center gap-2">
          ${Util.icon('description', 'text-base text-accent')}
          <span class="min-w-0 flex-1 truncate text-sm font-medium">${Util.esc(s.title)}</span>
          ${s.owner.id === App.state.user.id ? `<span data-del-skill="${s.id}" class="btn-ghost h-6 px-1 text-rose-300/70" title="حذف">${Util.icon('delete', 'text-sm')}</span>` : ''}
        </div>
        <p class="text-[10px] text-cream/35">${Util.esc(s.owner.display_name)} · ${Util.dateTimeFa(s.updated_at)}</p>
      </button>`).join('');

    grid.querySelectorAll('[data-skill]').forEach((el) =>
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-del-skill]')) return;
        Teams.skillViewer(Number(el.dataset.skill));
      }));
    grid.querySelectorAll('[data-del-skill]').forEach((el) =>
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await Api.request('skills/' + el.dataset.delSkill, { method: 'DELETE' });
          App.toast('اسکیل حذف شد', false);
          Teams.loadSkills(teamId);
        } catch (err) {
          App.toast(Util.errorFa(err));
        }
      }));
  },

  async skillViewer(skillId) {
    try {
      const data = await Api.request('skills/' + skillId);
      App.modal({
        title: data.skill.title,
        customBody: `
          <div class="md max-h-[50vh] overflow-y-auto pe-1">${Util.mdToHtml(data.skill.content)}</div>
          <p class="mt-2 text-[10px] text-cream/30">نویسنده: ${Util.esc(data.skill.owner.display_name)}</p>
          <div class="flex gap-2 pt-2">
            <button type="button" id="skill-close" class="btn-soft flex-1">بستن</button>
            ${data.skill.owner.id === App.state.user.id ? '<button type="button" id="skill-edit" class="btn-primary flex-1">ویرایش</button>' : ''}
          </div>`,
        onSubmit: async () => {},
      });
      Util.byId('skill-close').addEventListener('click', () => Util.byId('modal').close());
      const editBtn = Util.byId('skill-edit');
      if (editBtn) {
        editBtn.addEventListener('click', () => {
          Util.byId('modal').close();
          Teams.skillEditor(data.skill.team_id, data.skill);
        });
      }
    } catch (err) {
      App.toast(Util.errorFa(err));
    }
  },

  skillEditor(teamId, existing = null) {
    App.modal({
      title: existing ? 'ویرایش اسکیل' : 'اسکیل جدید (Skill.md)',
      fields: [{ name: 'title', label: 'عنوان', value: existing ? existing.title : '', placeholder: 'مثلاً راهنمای دیپلوی' }],
      submitLabel: existing ? 'ذخیره' : 'ساخت',
      textareas: [{ name: 'content', label: 'محتوا (Markdown)', value: existing ? existing.content : '', placeholder: '# عنوان\n\nتوضیحات…' }],
      onSubmit: async (v) => {
        if (existing) {
          await Api.request('skills/' + existing.id, { method: 'PATCH', body: { title: v.title, content: v.content } });
        } else {
          await Api.request(`teams/${teamId}/skills`, { method: 'POST', body: { title: v.title, content: v.content } });
        }
        App.toast('ذخیره شد', false);
        Teams.loadSkills(teamId);
      },
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
