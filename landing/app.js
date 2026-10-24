/* Hamkar landing — تعاملات سبک بدون وابستگی */

(function () {
  'use strict';

  // ریویل عناصر هنگام اسکرول
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  }

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
          '<span class="material-symbols-rounded text-gold text-base">open_source</span>' +
          'متن‌باز و رایگان — ' + rel.name;
      });
    })
    .catch(function () { /* نسخه‌ی پیش‌فرض می‌ماند */ });
})();
