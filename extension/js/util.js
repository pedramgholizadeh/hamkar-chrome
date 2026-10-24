// Shared helpers: escaping, Persian dates, avatars, markdown, icons.

const Util = {
  byId(id) {
    return document.getElementById(id);
  },

  /** Escape untrusted text before putting it into innerHTML. Always use this. */
  esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  },

  timeFa(iso) {
    try {
      return new Date(iso.replace(' ', 'T') + 'Z').toLocaleTimeString('fa-IR', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  },

  dateFa(iso) {
    try {
      return new Date(iso.replace(' ', 'T') + 'Z').toLocaleDateString('fa-IR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
    } catch {
      return '';
    }
  },

  dateTimeFa(iso) {
    try {
      return new Date(iso.replace(' ', 'T') + 'Z').toLocaleString('fa-IR', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  },

  bytes(n) {
    const num = Number(n) || 0;
    if (num < 1024) return num + ' B';
    if (num < 1024 * 1024) return (num / 1024).toFixed(1) + ' KB';
    return (num / (1024 * 1024)).toFixed(1) + ' MB';
  },

  /** Safe markdown renderer: escapes first, then formats. */
  mdToHtml(md) {
    let html = Util.esc(md);
    const blocks = [];
    html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
      blocks.push(`<pre><code>${code.replace(/^\n/, '')}</code></pre>`);
      return `\u0000${blocks.length - 1}\u0000`;
    });
    html = html
      .replace(/^### (.*)$/gm, '<h3>$1</h3>')
      .replace(/^## (.*)$/gm, '<h2>$1</h2>')
      .replace(/^# (.*)$/gm, '<h1>$1</h1>')
      .replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>')
      .replace(/^\s*[-*] (.*)$/gm, '<li>$1</li>')
      .replace(/^\s*\d+\. (.*)$/gm, '<li>$1</li>')
      .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|\s)\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/^---$/gm, '<hr>')
      .replace(/\n/g, '<br>');
    html = html.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[Number(i)]);
    return html;
  },

  icon(name, cls = '') {
    return `<span class="ms ${cls}">${name}</span>`;
  },

  /** Initials letter for avatar fallbacks. */
  initial(user) {
    const name = (user && (user.display_name || user.name || user.email)) || '?';
    return name.charAt(0).toUpperCase();
  },

  /** Colored initials avatar or the user's uploaded image. */
  async avatarHtml(user, size = 'h-9 w-9 text-sm') {
    const colors = ['bg-gold/20 text-gold', 'bg-emerald-500/20 text-emerald-300', 'bg-sky-500/20 text-sky-300', 'bg-rose-500/20 text-rose-300', 'bg-violet-500/20 text-violet-300'];
    const hue = colors[((user && user.id) || 0) % colors.length];
    if (user && user.avatar_file_id) {
      const url = await MediaStore.url(user.avatar_file_id);
      if (url) return `<img src="${url}" class="${size} shrink-0 rounded-full object-cover" alt="" />`;
    }
    return `<div class="${size} ${hue} flex shrink-0 items-center justify-center rounded-full font-bold">${Util.initial(user)}</div>`;
  },
};

/** objectURL cache for authenticated media (avatars, logos, chat images). */
const MediaStore = {
  cache: new Map(),
  pending: new Map(),

  async url(fileId) {
    if (!fileId) return null;
    if (MediaStore.cache.has(fileId)) return MediaStore.cache.get(fileId);
    if (MediaStore.pending.has(fileId)) return MediaStore.pending.get(fileId);
    const p = Api.fetchBlob(fileId)
      .then((blob) => {
        const u = URL.createObjectURL(blob);
        MediaStore.cache.set(fileId, u);
        MediaStore.pending.delete(fileId);
        return u;
      })
      .catch(() => {
        MediaStore.pending.delete(fileId);
        return null;
      });
    MediaStore.pending.set(fileId, p);
    return p;
  },
};

/** Map API error codes to friendly Persian messages. */
Util.errorFa = (err) => {
  const map = {
    invalid_email: 'ایمیل معتبر نیست',
    email_domain_not_allowed: 'این دامنه‌ی ایمیل مجاز نیست',
    too_many_requests: 'درخواست‌های زیاد؛ چند دقیقه بعد تلاش کن',
    mail_delivery_failed: 'ارسال ایمیل ناموفق بود؛ بعداً تلاش کن',
    mail_auth_failed: 'کلید API سرویس ایمیل نامعتبر است',
    mail_domain_not_verified: 'دامنه‌ی فرستنده در سرویس ایمیل تأیید نشده است',
    mail_invalid_from: 'آدرس فرستنده‌ی ایمیل نامعتبر است',
    unauthorized: 'نشست منقضی شده؛ دوباره وارد شو',
    invalid_credentials: 'ایمیل یا رمز عبور اشتباه است',
    password_too_short: 'رمز عبور حداقل ۸ کاراکتر باشد',
    invalid_code: 'کد واردشده اشتباه است',
    code_expired: 'کد منقضی یا نامعتبر است؛ کد جدید بگیر',
    invalid_token: 'نشست تغییر رمز منقضی شده؛ دوباره تلاش کن',
    forbidden: 'دسترسی به این بخش را نداری',
    invalid_name: 'نام را وارد کن',
    invalid_code: 'کد دعوت را وارد کن',
    invalid_title: 'عنوان تسک را وارد کن',
    invalid_assignee: 'این کاربر به پروژه دسترسی ندارد',
    invalid_phase: 'این فاز معتبر نیست',
    invalid_priority: 'اولویت معتبر نیست',
    invalid_due_date: 'تاریخ معتبر نیست',
    invalid_url: 'آدرس معتبر نیست',
    invalid_meeting_url: 'لینک جلسه معتبر نیست (لینک Google Meet بده)',
    invalid_skill: 'عنوان و محتوای اسکیل را وارد کن',
    invalid_file_type: 'فقط فایل تصویری مجاز است',
    empty_message: 'پیام خالی است',
    message_too_long: 'پیام خیلی بلند است',
    meeting_ended: 'این جلسه تمام شده است',
    file_too_large: 'حجم فایل بیشتر از حد مجاز است',
    upload_failed: 'آپلود ناموفق بود',
    already_member: 'این نفر قبلاً عضو تیم شده',
    invite_code_invalid: 'کد دعوت اشتباه است',
    only_owner_can_invite: 'فقط مالک تیم این کار را می‌تواند بکند',
    network_error: 'خطای شبکه؛ اتصال اینترنت را چک کن',
    server_error: 'خطای سرور؛ بعداً تلاش کن',
  };
  return map[err && err.message] || ('خطا: ' + ((err && err.message) || 'نامشخص'));
};
