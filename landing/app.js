/* Hamkar landing — تعاملات سبک بدون وابستگی */

(function () {
  'use strict';


  // (انیمیشن reveal حذف شد — محتوا همیشه نمایان است)

  // نمایش نسخه‌ی آخرین ریلیز روی دکمه‌های دانلود (اگر گیت‌هاب جواب داد)
  var DL_URL = 'https://github.com/pedramgholizadeh/hamkar-chrome/releases/download/latest/hamkar-extension-latest.zip';
  document.querySelectorAll('#dl-hero, #dl-cta').forEach(function (a) {
    a.setAttribute('href', DL_URL);
  });

  fetch('https://api.github.com/repos/pedramgholizadeh/hamkar-chrome/releases/latest')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (rel) {
      if (!rel || !rel.tag_name) return;
      document.querySelectorAll('.glass-pill').forEach(function (pill) {
        pill.innerHTML =
          '<span class="material-symbols-rounded text-gold text-base">verified</span>' +
          'متن‌باز و رایگان — ' + rel.name;
      });
    })
    .catch(function () { /* نسخه‌ی پیش‌فرض می‌ماند */ });
})();
