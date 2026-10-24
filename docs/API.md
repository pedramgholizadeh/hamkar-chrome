# مرجع API همکار

همه‌ی اندپوینت‌ها زیر `https://apps.webiro.ir/hamkar/api/` هستند و JSON برمی‌گردانند.

## قراردادهای کلی

- **احراز هویت:** هدر `Authorization: Bearer <token>` — توکن از جریان ورودMagic Link به دست می‌آید و تا خروج (logout) معتبر است.
- **بدنه‌ی درخواست:** `application/json`؛ استثنا: ارسال پیام چت با فایل که `multipart/form-data` است.
- **خطاها:** کد HTTP مناسب + `{"ok": false, "error": "error_code"}`.
  کدهای رایج: `unauthorized` (401)، `forbidden` (403)، `not_found` (404)، `invalid_*` (422)، `too_many_requests` (429).
- **مجوزها:** پروژه برای مالکش و اعضای تیمش (اگر تیمی باشد) قابل مشاهده است؛ تسک و چت از همین قانون تبعیت می‌کنند.

## جریان ورود (Magic Link)

```
۱. POST /auth/request        {"email": "user@example.com"}
   → {"ok":true, "request_id":"<uuid>", "expires_in":900}
   ایمیل حاوی لینک  GET /auth/verify?token=<64hex>  ارسال می‌شود.

۲. کاربر لینک را باز می‌کند → صفحه‌ی تأیید HTML؛ درخواست به status=approved می‌رود.

۳. اکستنشن (هر ۲.۵ ثانیه):
   GET /auth/poll?request_id=<uuid>
   → {"status":"pending"}
   → {"status":"expired"}
   → {"status":"approved", "token":"<64hex>", "user":{"id":1,"email":"…","name":null}}
   توکن ذخیره می‌شود؛ ورود برای همیشه معتبر است.
```

## اندپوینت‌ها

### عمومی

| متد | مسیر | توضیح |
|---|---|---|
| GET | `/` | Health check |
| POST | `/auth/request` | شروع ورود با ایمیل |
| GET | `/auth/poll?request_id=` | پیگیری وضعیت درخواست ورود |
| GET | `/auth/verify?token=` | صفحه‌ی تأیید لینک ایمیل (HTML، نه JSON) |

### با توکن

| متد | مسیر | بدنه | توضیح |
|---|---|---|---|
| GET | `/me` | — | کاربر فعلی |
| POST | `/auth/logout` | — | ابطال توکن فعلی |

#### تیم‌ها

| متد | مسیر | بدنه | توضیح |
|---|---|---|---|
| GET | `/teams` | — | تیم‌های من |
| POST | `/teams` | `{"name"}` | ساخت تیم (من مالک می‌شوم) |
| POST | `/teams/join` | `{"code"}` | عضویت با کد دعوت |
| GET | `/teams/{id}` | — | جزئیات تیم + اعضا (فقط اعضا) |
| POST | `/teams/{id}/invite` | `{"email"}` | دعوت ایمیلی (فقط مالک) |
| GET | `/invites` | — | دعوت‌نامه‌های در انتظار من |
| POST | `/invites/{id}/accept` | — | پذیرش دعوت‌نامه |

پاسخ `GET /teams/{id}`:

```json
{
  "ok": true,
  "team": { "id": 1, "name": "تیم محصول", "invite_code": "A1B2C3D4E5", "owner_id": 1 },
  "members": [ { "id": 1, "email": "a@b.c", "name": null, "role": "owner" } ]
}
```

#### پروژه‌ها

| متد | مسیر | بدنه | توضیح |
|---|---|---|---|
| GET | `/projects` | — | پروژه‌های شخصی من + پروژه‌های تیم‌های من |
| POST | `/projects` | `{"name", "description"?, "team_id"?}` | `team_id` نده = پروژه‌ی شخصی |
| GET | `/projects/{id}` | — | جزئیات + `members` (برای انتخاب مسئول تسک) |

#### تسک‌ها

| متد | مسیر | بدنه | توضیح |
|---|---|---|---|
| GET | `/projects/{id}/tasks` | — | لیست تسک‌ها |
| POST | `/projects/{id}/tasks` | `{"title", "assignee_id"?}` | بدون `assignee_id` = برای خودم |
| PATCH | `/tasks/{id}` | `{"done": true}` یا `{"title": "…"}` | تیک زدن/برگرداندن، ویرایش عنوان |

#### چت

| متد | مسیر | بدنه | توضیح |
|---|---|---|---|
| GET | `/projects/{id}/messages?after_id=0` | — | پیام‌های جدید بعد از `after_id` (حداکثر ۳۰۰) |
| POST | `/projects/{id}/messages` | JSON `{"body"}` یا multipart با فیلدهای `body` و `file` | متن، فایل، یا هر دو |

شکل پیام:

```json
{
  "id": 12,
  "body": "سلام!",
  "created_at": "2026-10-24 12:34:56",
  "user": { "id": 2, "email": "x@y.z", "name": null },
  "file": { "id": 5, "name": "report.pdf", "mime": "application/pdf", "size": 48213 }
}
```

`file` وقتی `null` است یعنی پیام متنی بوده. `created_at` به UTC است.

#### مدیا

| متد | مسیر | توضیح |
|---|---|---|
| GET | `/media/{fileId}` | دریافت فایل با هدر Authorization؛ فالبک: `?token=` برای `<img>` |

دسترسی فقط برای اعضای پروژه‌ی صاحب فایل. تصویر/صدا/ویدیو/PDF با `inline` سرو می‌شوند؛ بقیه با `Content-Disposition: attachment`. لینک مستقیم از `hamkar/media/` با 403 بسته است.

## محدودیت‌های نسخه‌ی فعلی (v0.1)

- چت با polling (هر ۳ ثانیه) کار می‌کند؛ WebSocket در هاست اشتراکی PHP ممکن نیست. (SSE در نقشه‌ی راه)
- دعوت تیم ایمیلی ثبت می‌شود اما هنوز ایمیل اطلاع‌رسانی دعوت ارسال نمی‌شود؛ دعوت‌شده بعد از ورود، دعوت‌نامه را در اکستنشن می‌بیند.
- پیام‌ها حذف/ویرایش نمی‌شوند و صفحه‌بندی ندارند (فقط `after_id`).
