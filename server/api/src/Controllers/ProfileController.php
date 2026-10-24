<?php

declare(strict_types=1);

/** Profile management: display name + avatar. */
final class ProfileController
{
    public static function me(): void
    {
        Http::json(['ok' => true, 'user' => Shape::user(Auth::requireUser())]);
    }

    public static function update(): void
    {
        $user = Auth::requireUser();
        $body = Http::body();

        $first = trim((string) ($body['first_name'] ?? ''));
        $last = trim((string) ($body['last_name'] ?? ''));
        if (mb_strlen($first) > 80 || mb_strlen($last) > 80) {
            Http::error(422, 'invalid_name');
        }

        Database::run(
            'UPDATE users SET first_name = ?, last_name = ? WHERE id = ?',
            [$first !== '' ? $first : null, $last !== '' ? $last : null, $user['id']]
        );

        $fresh = Database::one('SELECT ' . Shape::USER_COLUMNS . ' FROM users u WHERE u.id = ?', [$user['id']]);
        Http::json(['ok' => true, 'user' => Shape::user((array) $fresh)]);
    }

    public static function avatar(array $params, array $config): void
    {
        $user = Auth::requireUser();
        if (!isset($_FILES['avatar']) || !is_array($_FILES['avatar'])) {
            Http::error(422, 'upload_failed');
        }

        $maxBytes = (int) ($config['app']['upload_max_bytes'] ?? 10 * 1024 * 1024);
        $file = Files::store($_FILES['avatar'], null, (int) $user['id'], min($maxBytes, 5 * 1024 * 1024));

        if (!str_starts_with((string) $file['mime_type'], 'image/')) {
            Http::error(422, 'invalid_file_type');
        }

        $oldId = $user['avatar_file_id'] ?? null;
        Database::run('UPDATE users SET avatar_file_id = ? WHERE id = ?', [$file['id'], $user['id']]);

        // best-effort cleanup of the previous avatar
        if ($oldId !== null && (int) $oldId !== (int) $file['id']) {
            try {
                Database::run('DELETE FROM files WHERE id = ?', [(int) $oldId]);
            } catch (Throwable) {
            }
        }

        $fresh = Database::one('SELECT ' . Shape::USER_COLUMNS . ' FROM users u WHERE u.id = ?', [$user['id']]);
        Http::json(['ok' => true, 'user' => Shape::user((array) $fresh)]);
    }
}
