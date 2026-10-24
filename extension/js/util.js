// Small shared helpers: HTML escaping, Persian dates, byte formatting.

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

  bytes(n) {
    const num = Number(n) || 0;
    if (num < 1024) return num + ' B';
    if (num < 1024 * 1024) return (num / 1024).toFixed(1) + ' KB';
    return (num / (1024 * 1024)).toFixed(1) + ' MB';
  },

  /** Map API error codes to friendly Persian messages. */
  errorFa(err) {
    const map = {
      invalid_email: 'ایمیل معتبر نیست',
      email_domain_not_allowed: 'این دامنه‌ی ایمیل مجاز نیست',
      too_many_requests: 'درخواست‌های زیاد؛ چند دقیقه بعد تلاش کن',
      mail_delivery_failed: 'ارسال ایمیل ناموفق بود؛ بعداً تلاش کن',
      unauthorized: 'نشست منقضی شده؛ دوباره وارد شو',
      forbidden: 'دسترسی به این بخش را نداری',
      invalid_name: 'نام را وارد کن',
      invalid_code: 'کد دعوت را وارد کن',
      invalid_title: 'عنوان تسک را وارد کن',
      invalid_assignee: 'این کاربر به پروژه دسترسی ندارد',
      empty_message: 'پیام خالی است',
      message_too_long: 'پیام خیلی بلند است',
      file_too_large: 'حجم فایل بیشتر از حد مجاز است',
      upload_failed: 'آپلود فایل ناموفق بود',
      already_member: 'این نفر قبلاً عضو تیم شده',
      invite_code_invalid: 'کد دعوت اشتباه است',
      only_owner_can_invite: 'فقط مالک تیم می‌تواند دعوت کند',
      network_error: 'خطای شبکه؛ اتصال اینترنت را چک کن',
      server_error: 'خطای سرور؛ بعداً تلاش کن',
    };
    return map[err && err.message] || ('خطا: ' + ((err && err.message) || 'نامشخص'));
  },
};
