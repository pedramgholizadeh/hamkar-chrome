// Profile view: avatar upload + first/last name.

const ProfileView = {
  open() {
    Tasks.stopPoll();
    Chat.stopPoll();
    const u = App.state.user;

    Util.byId('main').innerHTML = `
      <div class="h-full overflow-y-auto p-6">
        <div class="mx-auto max-w-md space-y-4">
          <div class="card p-6 text-center">
            <button id="avatar-btn" class="group relative mx-auto block" title="تغییر عکس پروفایل">
              <span id="avatar-holder" class="block"></span>
              <span class="absolute inset-0 flex items-center justify-center rounded-full bg-ink/60 opacity-0 transition group-hover:opacity-100">
                ${Util.icon('photo_camera', 'text-vanilla text-2xl')}
              </span>
            </button>
            <input type="file" id="avatar-file" accept="image/*" class="hidden" />
            <h1 class="mt-3 text-lg font-bold text-vanilla">${Util.esc(u.display_name || u.email)}</h1>
            <p class="text-xs text-cream/40">${Util.esc(u.email)}</p>
          </div>

          <form id="profile-form" class="card space-y-3 p-5">
            <h2 class="text-sm font-bold text-vanilla">اطلاعات فردی</h2>
            <div class="flex gap-2">
              <label class="flex-1">
                <span class="mb-1 block text-xs text-cream/45">نام</span>
                <input name="first_name" value="${Util.esc(u.first_name || '')}" class="input" placeholder="مثلاً پدرام" />
              </label>
              <label class="flex-1">
                <span class="mb-1 block text-xs text-cream/45">نام خانوادگی</span>
                <input name="last_name" value="${Util.esc(u.last_name || '')}" class="input" placeholder="مثلاً احمدی" />
              </label>
            </div>
            <button type="submit" class="btn-primary w-full">ذخیره</button>
          </form>

          <p class="px-2 text-center text-[11px] leading-5 text-cream/30">
            نام و عکس تو در چت، تسک‌ها، اعضای تیم و فعالیت‌ها نمایش داده می‌شود.
          </p>

          <div class="card p-5">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-sm font-bold text-vanilla">نسخه‌ی اکستنشن</h2>
                <p id="version-line" class="mt-0.5 text-xs text-cream/40">v${chrome.runtime.getManifest().version}</p>
              </div>
              <button id="check-update-btn" class="btn-soft text-xs">${Util.icon('system_update_alt', 'text-base')} بررسی بروزرسانی</button>
            </div>
            <p class="mt-2 text-[10px] leading-5 text-cream/30">با هر نسخه‌ی جدید، از همان دکمه‌ی «بررسی بروزرسانی» زیپ تازه را بگیر و در chrome://extensions جایگزین کن.</p>
          </div>
        </div>
      </div>`;

    ProfileView.renderAvatar();

    Util.byId('avatar-btn').addEventListener('click', () => Util.byId('avatar-file').click());
    Util.byId('avatar-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const form = new FormData();
      form.append('avatar', file);
      try {
        const data = await Api.request('me/avatar', { method: 'POST', form });
        App.state.user = data.user;
        ProfileView.renderAvatar();
        App.renderHeaderUser();
        App.toast('عکس پروفایل به‌روز شد', false);
      } catch (err) {
        App.toast(Util.errorFa(err));
      }
    });

    Util.byId('check-update-btn').addEventListener('click', async () => {
      const line = Util.byId('version-line');
      line.textContent = 'در حال بررسی…';
      const info = await Updater.check();
      if (!info) {
        line.textContent = 'بررسی ناموفق — اینترنت را چک کن';
      } else if (info.isNew) {
        line.innerHTML = `نسخه‌ی جدید <b class="text-cyan">v${info.remote}</b> موجود است`;
        window.open(info.url, '_blank');
      } else {
        line.textContent = `آخرین نسخه نصب است (v${info.local}) ✓`;
      }
    });

    Util.byId('profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(e.target).entries());
      try {
        const data = await Api.request('me', { method: 'PATCH', body: v });
        App.state.user = data.user;
        App.renderHeaderUser();
        App.toast('پروفایل ذخیره شد', false);
      } catch (err) {
        App.toast(Util.errorFa(err));
      }
    });
  },

  async renderAvatar() {
    const holder = Util.byId('avatar-holder');
    if (!holder) return;
    holder.innerHTML = await Util.avatarHtml(App.state.user, 'h-24 w-24 text-3xl');
  },
};
