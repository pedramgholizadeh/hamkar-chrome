<?php

declare(strict_types=1);

/**
 * Telegram-style project chat: text, files, replies. Polled by the extension.
 */
final class ChatController
{
    private const SELECT = '
        SELECT m.id, m.body, m.created_at, m.user_id,
               u.email AS user_email, u.first_name AS user_first_name, u.last_name AS user_last_name,
               u.name AS user_name, u.avatar_file_id AS user_avatar_file_id, u.last_seen_at AS user_last_seen_at,
               f.id AS f_id, f.original_name AS f_name, f.mime_type AS f_mime, f.size AS f_size,
               r.id AS reply_id, r.body AS reply_body,
               ru.email AS reply_email, ru.first_name AS reply_first_name, ru.last_name AS reply_last_name, ru.name AS reply_name
        FROM messages m
        JOIN users u ON u.id = m.user_id
        LEFT JOIN files f ON f.id = m.file_id
        LEFT JOIN messages r ON r.id = m.reply_to_id
        LEFT JOIN users ru ON ru.id = r.user_id';

    public static function messages(array $params): void
    {
        $user = Auth::requireUser();
        $project = Auth::requireProject((int) $params['id'], (int) $user['id']);

        $afterId = (int) (Http::query('after_id') ?? 0);
        $rows = Database::all(
            self::SELECT . ' WHERE m.project_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT 300',
            [$project['id'], $afterId]
        );

        Http::json(['ok' => true, 'messages' => array_map([Shape::class, 'message'], $rows)]);
    }

    public static function send(array $params, array $config): void
    {
        $user = Auth::requireUser();
        $project = Auth::requireProject((int) $params['id'], (int) $user['id']);

        $body = Http::body();
        $text = trim((string) ($body['body'] ?? ''));

        $replyToId = null;
        if (isset($body['reply_to_id']) && $body['reply_to_id'] !== '' && $body['reply_to_id'] !== null) {
            $replyToId = (int) $body['reply_to_id'];
            $parent = Database::one('SELECT id FROM messages WHERE id = ? AND project_id = ?', [$replyToId, $project['id']]);
            if ($parent === null) {
                Http::error(422, 'invalid_reply');
            }
        }

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
            'INSERT INTO messages (project_id, user_id, body, file_id, reply_to_id, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())',
            [$project['id'], $user['id'], $text !== '' ? $text : null, $fileRow['id'] ?? null, $replyToId]
        );

        $row = Database::one(self::SELECT . ' WHERE m.id = ?', [$messageId]);
        Http::json(['ok' => true, 'message' => Shape::message((array) $row)]);
    }
}
