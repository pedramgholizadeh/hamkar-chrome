<?php

declare(strict_types=1);

/**
 * Auth flow:
 *   POST /auth/start       {email, forgot?}  → {mode: "password"} or sends a
 *                           6-digit OTP (2-minute validity) → {mode: "otp"}
 *   POST /auth/login       {email, password} → session token (returning users)
 *   POST /auth/otp/verify  {email, code}     → {setup_token} (10 minutes)
 *   POST /auth/password    {setup_token, password} → sets/updates the password
 *                           and returns a session token
 */
final class AuthController
{
    private const OTP_TTL_MIN = 2;
    private const OTP_MAX_ATTEMPTS = 5;
    private const SETUP_TTL_MIN = 10;

    public static function start(array $config): void
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

        $user = Database::one('SELECT id, password_hash FROM users WHERE email = ?', [$email]);
        $forgot = !empty($body['forgot']);

        if ($user !== null && $user['password_hash'] !== null && !$forgot) {
            Http::json(['ok' => true, 'mode' => 'password']);
        }

        // first sign-in, or password recovery — send a one-time code
        self::sendOtp($email, $config);
        Http::json(['ok' => true, 'mode' => 'otp', 'expires_in' => self::OTP_TTL_MIN * 60]);
    }

    public static function login(): void
    {
        $body = Http::body();
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        $password = (string) ($body['password'] ?? '');

        $user = Database::one('SELECT *, last_login_at FROM users WHERE email = ?', [$email]);
        if ($user === null || $user['password_hash'] === null
            || !password_verify($password, (string) $user['password_hash'])) {
            Http::error(401, 'invalid_credentials');
        }

        Database::run('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [$user['id']]);
        $token = Auth::createSession((int) $user['id']);
        Http::json(['ok' => true, 'token' => $token, 'user' => Shape::user($user)]);
    }

    public static function verifyOtp(): void
    {
        $body = Http::body();
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        $code = preg_replace('/\D/', '', (string) ($body['code'] ?? ''));
        if (strlen($code) !== 6) {
            Http::error(422, 'invalid_code');
        }

        $row = Database::one(
            'SELECT * FROM otp_codes
             WHERE email = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()
             ORDER BY id DESC LIMIT 1',
            [$email]
        );
        if ($row === null || (int) $row['attempts'] >= self::OTP_MAX_ATTEMPTS) {
            Http::error(422, 'code_expired');
        }

        if (!hash_equals((string) $row['code_hash'], hash('sha256', $code))) {
            Database::run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [$row['id']]);
            Http::error(422, 'invalid_code');
        }

        Database::run('UPDATE otp_codes SET used_at = UTC_TIMESTAMP() WHERE id = ?', [$row['id']]);

        // short-lived token that authorizes setting a new password
        $setupToken = bin2hex(random_bytes(32));
        Database::insert(
            'INSERT INTO password_setups (email, token, created_at, expires_at) VALUES (?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL ' . self::SETUP_TTL_MIN . ' MINUTE)',
            [$email, $setupToken]
        );
        Http::json(['ok' => true, 'setup_token' => $setupToken]);
    }

    public static function setPassword(): void
    {
        $body = Http::body();
        $setupToken = (string) ($body['setup_token'] ?? '');
        $password = (string) ($body['password'] ?? '');

        if (!preg_match('/^[a-f0-9]{64}$/', $setupToken)) {
            Http::error(422, 'invalid_token');
        }
        if (strlen($password) < 8 || strlen($password) > 100) {
            Http::error(422, 'password_too_short');
        }

        $row = Database::one(
            'SELECT * FROM password_setups WHERE token = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()',
            [$setupToken]
        );
        if ($row === null) {
            Http::error(422, 'invalid_token');
        }
        Database::run('UPDATE password_setups SET used_at = UTC_TIMESTAMP() WHERE id = ?', [$row['id']]);

        $userId = self::findOrCreateUser((string) $row['email']);
        Database::run(
            'UPDATE users SET password_hash = ?, last_login_at = UTC_TIMESTAMP() WHERE id = ?',
            [password_hash($password, PASSWORD_DEFAULT), $userId]
        );

        $token = Auth::createSession($userId);
        $user = Shape::user((array) Database::one(
            'SELECT ' . Shape::USER_COLUMNS . ' FROM users u WHERE u.id = ?',
            [$userId]
        ));
        Http::json(['ok' => true, 'token' => $token, 'user' => $user]);
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

    private static function sendOtp(string $email, array $config): void
    {
        // abuse guard: max 3 codes per address within 10 minutes
        $recent = Database::one(
            'SELECT COUNT(*) AS c FROM otp_codes WHERE email = ? AND created_at > UTC_TIMESTAMP() - INTERVAL 10 MINUTE',
            [$email]
        );
        if ((int) ($recent['c'] ?? 0) >= 3) {
            Http::error(429, 'too_many_requests');
        }

        $code = (string) random_int(100000, 999999);
        Database::insert(
            'INSERT INTO otp_codes (email, code_hash, attempts, created_at, expires_at) VALUES (?, ?, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL ' . self::OTP_TTL_MIN . ' MINUTE)',
            [$email, hash('sha256', $code)]
        );

        Mailer::send($email, 'کد ورود همکار — ' . $code, self::otpEmailHtml($code), $config);
    }

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

    private static function otpEmailHtml(string $code): string
    {
        $digits = implode('', array_map(
            fn ($d) => '<span style="display:inline-block;background:#030164;color:#FCF9EA;border-radius:10px;padding:10px 12px;margin:0 2px;font-size:24px;font-weight:bold;font-family:monospace">' . $d . '</span>',
            str_split($code)
        ));
        return <<<HTML
<!doctype html>
<html lang="fa" dir="rtl">
<body style="font-family:Tahoma,Arial,sans-serif;background:#f1f5f9;padding:32px;margin:0">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:36px;text-align:center">
    <div style="font-size:36px">🤝</div>
    <h1 style="color:#4f46e5;margin:8px 0 4px">کد ورود همکار</h1>
    <p style="color:#334155;line-height:2">این کد را در اکستنشن وارد کن:</p>
    <div style="margin:20px 0" dir="ltr">{$digits}</div>
    <p style="color:#64748b;font-size:12px;line-height:1.9">این کد ۲ دقیقه اعتبار دارد و فقط یک‌بار قابل استفاده است.<br>
    اگر تو این درخواست را نداده بودی، این ایمیل را نادیده بگیر.</p>
  </div>
</body>
</html>
HTML;
    }
}
