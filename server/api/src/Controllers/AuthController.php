<?php

declare(strict_types=1);

/**
 * Passwordless auth: POST /auth/request emails a magic link
 * (GET /auth/verify?token=…); the extension polls GET /auth/poll
 * until the link is clicked, then receives a permanent session token.
 */
final class AuthController
{
    public static function request(array $config): void
    {
        $body = Http::body();
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Http::error(422, 'invalid_email');
        }

        $allowedDomain = $config['app']['allowed_email_domain'] ?? null;
        if (is_string($allowedDomain) && $allowedDomain !== '' && !str_ends_with($email, '@' . strtolower($allowedDomain))) {
            Http::error(403, 'email_domain_not_allowed');
        }

        // light abuse guard: max 5 pending requests per address within 15 minutes
        $recent = Database::one(
            "SELECT COUNT(*) AS c FROM auth_requests
             WHERE email = ? AND status = 'pending' AND created_at > UTC_TIMESTAMP() - INTERVAL 15 MINUTE",
            [$email]
        );
        if ((int) ($recent['c'] ?? 0) >= 5) {
            Http::error(429, 'too_many_requests');
        }

        $requestId = Auth::uuid();
        $token = bin2hex(random_bytes(32));
        Database::insert(
            "INSERT INTO auth_requests (email, request_id, token, status, created_at, expires_at)
             VALUES (?, ?, ?, 'pending', UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL 15 MINUTE)",
            [$email, $requestId, $token]
        );

        $link = rtrim((string) $config['app']['base_url'], '/') . '/api/auth/verify?token=' . $token;
        Mailer::send($email, 'ورود به همکار — لینک ورود شما', self::loginEmailHtml($link), $config);

        Http::json(['ok' => true, 'request_id' => $requestId, 'expires_in' => 900]);
    }

    public static function poll(): void
    {
        $requestId = (string) (Http::query('request_id') ?? '');
        if (!preg_match('/^[0-9a-f-]{36}$/i', $requestId)) {
            Http::error(422, 'missing_request_id');
        }

        $row = Database::one('SELECT * FROM auth_requests WHERE request_id = ?', [$requestId]);
        if ($row === null) {
            Http::error(404, 'request_not_found');
        }

        if ($row['status'] === 'pending' && strtotime((string) $row['expires_at']) <= time()) {
            Database::run("UPDATE auth_requests SET status = 'expired' WHERE id = ?", [$row['id']]);
            Http::json(['status' => 'expired']);
        }

        if ($row['status'] !== 'approved') {
            Http::json(['status' => $row['status']]);
        }

        // approved -> find/create the user, mint a session, consume the request.
        // (Two concurrent polls each mint a valid session; harmless.)
        $userId = self::findOrCreateUser((string) $row['email']);
        $token = Auth::createSession($userId);
        Database::run("UPDATE auth_requests SET status = 'used' WHERE id = ?", [$row['id']]);

        $user = Database::one(
            'SELECT id, email, name, created_at FROM users WHERE id = ?',
            [$userId]
        );
        Http::json(['status' => 'approved', 'token' => $token, 'user' => $user]);
    }

    /** Landing page opened from the email link — marks the request approved. */
    public static function verify(): void
    {
        $token = (string) (Http::query('token') ?? '');
        $state = 'invalid';

        if (preg_match('/^[a-f0-9]{64}$/', $token)) {
            $row = Database::one("SELECT * FROM auth_requests WHERE token = ? AND status = 'pending'", [$token]);
            if ($row !== null) {
                if (strtotime((string) $row['expires_at']) > time()) {
                    Database::run("UPDATE auth_requests SET status = 'approved' WHERE id = ?", [$row['id']]);
                    $state = 'approved';
                } else {
                    Database::run("UPDATE auth_requests SET status = 'expired' WHERE id = ?", [$row['id']]);
                    $state = 'expired';
                }
            }
        }

        header('Content-Type: text/html; charset=utf-8');
        $title = match ($state) {
            'approved' => '✅ تأیید شد',
            'expired'  => '⏳ لینک منقضی شده',
            default    => '❌ لینک نامعتبر',
        };
        $message = match ($state) {
            'approved' => 'ورودت تأیید شد! به تب اکستنشن همکار برگرد؛ به‌صورت خودکار وارد می‌شوی.',
            'expired'  => 'این لینک ورود منقضی شده است. در اکستنشن دوباره درخواست ورود بده.',
            default    => 'این لینک معتبر نیست (شاید قبلاً استفاده شده). در اکستنشن دوباره درخواست ورود بده.',
        };

        echo <<<HTML
<!doctype html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><title>همکار — ورود</title></head>
<body style="font-family:Tahoma,Arial,sans-serif;background:linear-gradient(135deg,#030164,#253C6D);display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;color:#FCF9EA">
  <div style="background:rgba(37,60,109,.55);border:1px solid rgba(255,250,211,.14);border-radius:20px;padding:44px 52px;text-align:center;max-width:420px;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:0 20px 60px rgba(0,0,0,.35)">
    <div style="font-size:40px">🤝</div>
    <h1 style="color:#FCAD38;margin:8px 0 12px">{$title}</h1>
    <p style="color:#FCF9EA;line-height:1.9;opacity:.9">{$message}</p>
  </div>
</body>
</html>
HTML;
        exit;
    }

    public static function me(): void
    {
        Http::json(['ok' => true, 'user' => Auth::requireUser()]);
    }

    public static function logout(): void
    {
        Auth::requireUser();
        $token = Http::bearer();
        if ($token !== null) {
            Database::run('DELETE FROM sessions WHERE token_hash = ?', [hash('sha256', $token)]);
        }
        Http::json(['ok' => true]);
    }

    // ------------------------------------------------------------- helpers

    private static function findOrCreateUser(string $email): int
    {
        Database::run(
            'INSERT INTO users (email, created_at, last_login_at)
             VALUES (?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
             ON DUPLICATE KEY UPDATE last_login_at = UTC_TIMESTAMP()',
            [$email]
        );
        $row = Database::one('SELECT id FROM users WHERE email = ?', [$email]);
        return (int) ($row['id'] ?? 0);
    }

    private static function loginEmailHtml(string $link): string
    {
        $safeLink = htmlspecialchars($link, ENT_QUOTES, 'UTF-8');
        return <<<HTML
<!doctype html>
<html lang="fa" dir="rtl">
<body style="font-family:Tahoma,Arial,sans-serif;background:#f1f5f9;padding:32px;margin:0">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:36px;text-align:center">
    <div style="font-size:36px">🤝</div>
    <h1 style="color:#4f46e5;margin:8px 0 4px">همکار</h1>
    <p style="color:#334155;line-height:2">برای ورود به فضای کاری همکار روی دکمه‌ی زیر بزن.</p>
    <p style="margin:24px 0">
      <a href="{$safeLink}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:12px 32px;border-radius:12px;display:inline-block;font-size:15px">ورود به همکار</a>
    </p>
    <p style="color:#64748b;font-size:12px;line-height:1.9">این لینک ۱۵ دقیقه اعتبار دارد و فقط یک‌بار قابل استفاده است.<br>
    اگر دکمه کار نکرد، این لینک را در مرورگر باز کن:<br>
    <a href="{$safeLink}" style="color:#4f46e5;word-break:break-all">{$safeLink}</a></p>
    <p style="color:#94a3b8;font-size:12px">اگر تو این درخواست را نداده بودی، این ایمیل را نادیده بگیر.</p>
  </div>
</body>
</html>
HTML;
    }
}
