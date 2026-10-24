# استقرار بک‌اند همکار (Deploy)

راهنمای کامل راه‌اندازی `hamkar` روی هاست اشتراکی (Apache + PHP + MySQL). کل پروسه کمتر از ۱۰ دقیقه است.

## پیش‌نیازها

- PHP ≥ 8.1 با اکستنشن‌های `pdo_mysql`، `curl` و `fileinfo`
- MySQL 5.7+ (یا MariaDB معادل)
- آپاچی با `mod_rewrite` فعال (برای nginx در انتهای سند یک نمونه کانفیگ هست)

## ۱) آپلود فایل‌ها

محتوای پوشه‌ی `server/` را در مسیر `apps.webiro.ir/hamkar` قرار بده. دو راه داری:

**راه الف — با اسکریپت سینک (پیشنهادی):**

```bash
cp scripts/ftp.env.example scripts/ftp.env   # اطلاعات FTP را بنویس
./scripts/sync-ftp.sh          # اول dry-run ببین چه چیزی تغییر می‌کند
./scripts/sync-ftp.sh --apply  # آپلود واقعی
```

اسکریپت `config.php` را **هیچ‌وقت** آپلود نمی‌کند تا کانفیگ سرورت خراب نشود.

**راه ب — دستی:** با هر FTP کلاینت محتوای `server/` را در `hamkar/` آپلود کن.

ساختار نهایی روی هاست باید این‌طوری باشد:

```
apps.webiro.ir/hamkar/
├── api/            ← همه‌ی اندپوینت‌ها (index.php, src/, install.php, …)
│   └── config.php  ← خودت می‌سازی (گام ۲)
└── media/          ← محل آپلود فایل‌ها (دسترسی مستقیم وب: بسته)
```

## ۲) کانفیگ

```bash
cd server/api
cp config.example.php config.php
```

بعد `config.php` را باز کن و این مقادیر را پر کن:

| کلید | توضیح |
|---|---|
| `db.*` | اطلاعات دیتابیس MySQL (host, name, user, pass) |
| `app.base_url` | `https://apps.webiro.ir/hamkar` — برای ساخت لینک ایمیل ورود |
| `app.allowed_email_domain` | اگر می‌خواهی فقط ایمیل‌های یک دامنه خاص وارد شوند؛ `null` = همه |
| `app.debug` | در پروداکشن حتماً `false` |
| `resend.api_key` | کلید API از [resend.com/api-keys](https://resend.com/api-keys) |
| `resend.from` | فرستنده‌ی ایمیل، مثلاً `Hamkar <no-reply@webiro.ir>` — دامنه باید در Resend تأیید شده باشد |

> 💡 تا وقتی `resend.api_key` خالی/پیش‌فرض باشد، ایمیل‌ها به‌جای ارسال، در `api/storage/outbox/` ذخیره می‌شوند و می‌توانی لینک ورود را مستقیم از آنجا برداری — برای تست اولیه عالی است.

## ۳) ساخت جداول

یک‌بار در مرورگر باز کن:

```
https://apps.webiro.ir/hamkar/api/install.php
```

همه‌ی جداول با `CREATE TABLE IF NOT EXISTS` ساخته می‌شوند؛ فایل idempotent است ولی بعد از نصب می‌توانی حذفش کنی.

## ۴) تست سلامت

```
https://apps.webiro.ir/hamkar/api/index.php
→ {"ok":true,"service":"hamkar-api",...}
```

بعدش ایمیل ورود را از اکستنشن تست کن (بخش اکستنشن در [README](../README.md)).

## ۵) نصب اکستنشن

1. `chrome://extensions` → **Developer mode** → **Load unpacked** → پوشه‌ی `extension/`
2. تب جدید باز کن و با ایمیل وارد شو.

## امنیت مدیا — چطور مطمئن شویم؟

- فایل‌ها با نام تصادفی در `hamkar/media/سال/ماه/` ذخیره می‌شوند.
- `media/.htaccess` دسترسی مستقیم وب را کاملاً می‌بندد: آدرس مثل `https://apps.webiro.ir/hamkar/media/2026/10/xxx.png` در مرورگر باید **403** بدهد.
- دریافت فایل فقط از طریق `https://…/api/media/{id}` با توکن معتبر انجام می‌شود و سرور چک می‌کند کاربر عضو همان پروژه باشد.

## نکات پروداکشن

- **HTTPS اجباری** — توکن‌ها در هدر `Authorization` حرکت می‌کنند.
- در `php.ini` اگر می‌خواهی فایل‌های بزرگ‌تر رد و بدل شود: `upload_max_filesize` و `post_max_size` را بالا ببر و `app.upload_max_bytes` را در کانفیگ همگام کن.
- به‌طور پیش‌فرض CORS برای همه باز است (`Access-Control-Allow-Origin: *`) چون احراز هویت با توکن است نه کوکی. اگر دغدغه داری، در `src/Http.php` دامنه‌ی اکستنشن خودت را مشخص کن.
- بک‌آپ منظم دیتابیس و پوشه‌ی `media/` را فراموش نکن.

## nginx به‌جای Apache؟

معادل rewrite این است (بقیه‌ی کارها یکسان است):

```nginx
location /hamkar/api/ {
    try_files $uri $uri/ /hamkar/api/index.php?$query_string;
}
# و سرو کردن media را کلاً ببند:
location /hamkar/media/ { deny all; }
```

## عیب‌یابی

| مشکل | علت احتمالی |
|---|---|
| همه‌ی اندپوینت‌ها 404 می‌دهند | `mod_rewrite` خاموش است یا `AllowOverride All` نیست |
| `config.php is missing` | فایل کانفیگ را نساخته‌ای |
| خطای اتصال دیتابیس | `db.*` را چک کن؛ کاربر باید دسترسی SELECT/INSERT/UPDATE/CREATE داشته باشد |
| ایمیل نمی‌رسد | دامنه‌ی فرستنده در Resend تأیید نشده؛ لاگ خطا در `error_log` هاست |
| آپلود فایل خطا می‌دهد | `upload_max_filesize` در `php.ini` کمتر از `app.upload_max_bytes` است |
