<?php

declare(strict_types=1);

/**
 * Telegram-style project chat: text messages and file attachments.
 * The extension polls GET /projects/{id}/messages?after_id=… every few seconds.
 */
final class ChatController
{
    private const SELECT = '
        SELECT m.id, m.body, m.created_at, m.user_id,
               u.email AS user_email, u.name AS user_name,
               f.id AS f_id, f.original_name AS f_name, f.mime_type AS f_mime, f.size AS f_size
        FROM messages m
        JOIN users u ON u.id = m.user_id
        LEFT JOIN files f ON f.id = m.file_id';

    public static function messages(array $params): void
    {
        $user = Auth::requireUser();
        $project = Auth::requireProject((int) $params['id'], (int) $user['id']);

        $afterId = (int) (Http::query('after_id') ?? 0);
        $rows = Database::all(
            self::SELECT . ' WHERE m.project_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT 300',
            [$project['id'], $afterId]
        );

        Http::json(['ok' => true, 'messages' => array_map([self::class, 'shape'], $rows)]);
    }

    public static function send(array $params, array $config): void
    {
        $user = Auth::requireUser();
        $project = Auth::requireProject((int) $params['id'], (int) $user['id']);

        $text = trim((string) (Http::body()['body'] ?? ''));

        $fileRow = null;
        if (isset($_FILES['file']) && is_array($_FILES['file'])
            && ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
            $maxBytes = (int) ($config['app']['upload_max_bytes'] ?? 10 * 1024 * 1024);
            $fileRow = Files::store($_FILES['file'], (int) $project['id'], (int) $user['id'], $maxBytes);
        }

        if ($text === '' && $fileRow === null) {
            Http::error(422, 'empty_message');
        }
        if (mb_strlen($text) > 8000) {
            Http::error(422, 'message_too_long');
        }

        $messageId = Database::insert(
            'INSERT INTO messages (project_id, user_id, body, file_id, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())',
            [$project['id'], $user['id'], $text !== '' ? $text : null, $fileRow['id'] ?? null]
        );

        $row = Database::one(self::SELECT . ' WHERE m.id = ?', [$messageId]);
        Http::json(['ok' => true, 'message' => self::shape((array) $row)]);
    }

    // ------------------------------------------------------------- helpers

    private static function shape(array $r): array
    {
        return [
            'id' => (int) $r['id'],
            'body' => $r['body'],
            'created_at' => $r['created_at'],
            'user' => [
                'id' => (int) $r['user_id'],
                'email' => $r['user_email'],
                'name' => $r['user_name'],
            ],
            'file' => $r['f_id'] === null ? null : [
                'id' => (int) $r['f_id'],
                'name' => $r['f_name'],
                'mime' => $r['f_mime'],
                'size' => (int) $r['f_size'],
            ],
        ];
    }
}
