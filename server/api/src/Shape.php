<?php

declare(strict_types=1);

/** Consistent JSON shapes shared across controllers. */
final class Shape
{
    public static function user(?array $u): ?array
    {
        if ($u === null) {
            return null;
        }
        $online = $u['last_seen_at'] !== null && (time() - strtotime((string) $u['last_seen_at'])) < 120;
        return [
            'id' => (int) $u['id'],
            'email' => $u['email'],
            'first_name' => $u['first_name'] ?? null,
            'last_name' => $u['last_name'] ?? null,
            'name' => $u['name'] ?? null,
            'display_name' => self::displayName($u),
            'avatar_file_id' => isset($u['avatar_file_id']) && $u['avatar_file_id'] !== null ? (int) $u['avatar_file_id'] : null,
            'online' => $online,
        ];
    }

    public static function displayName(?array $u): string
    {
        if ($u === null) {
            return '';
        }
        $full = trim(($u['first_name'] ?? '') . ' ' . ($u['last_name'] ?? ''));
        if ($full !== '') {
            return $full;
        }
        if (!empty($u['name'])) {
            return (string) $u['name'];
        }
        return explode('@', (string) $u['email'])[0];
    }

    /** SELECT fragment with all fields Shape::user needs. */
    public const USER_COLUMNS = 'u.id, u.email, u.first_name, u.last_name, u.name, u.avatar_file_id, u.last_seen_at';

    public static function task(array $t): array
    {
        return [
            'id' => (int) $t['id'],
            'project_id' => (int) $t['project_id'],
            'title' => $t['title'],
            'done' => (bool) $t['done'],
            'priority' => $t['priority'] ?? 'medium',
            'due_date' => $t['due_date'] ?? null,
            'phase_id' => isset($t['phase_id']) && $t['phase_id'] !== null ? (int) $t['phase_id'] : null,
            'phase_title' => $t['phase_title'] ?? null,
            'created_at' => $t['created_at'],
            'done_at' => $t['done_at'],
            'assignee' => self::user([
                'id' => $t['assignee_id'], 'email' => $t['assignee_email'],
                'first_name' => $t['assignee_first_name'], 'last_name' => $t['assignee_last_name'],
                'name' => $t['assignee_name'], 'avatar_file_id' => $t['assignee_avatar_file_id'],
                'last_seen_at' => null,
            ]),
            'creator' => self::user([
                'id' => $t['created_by'], 'email' => $t['creator_email'],
                'first_name' => $t['creator_first_name'], 'last_name' => $t['creator_last_name'],
                'name' => $t['creator_name'], 'avatar_file_id' => $t['creator_avatar_file_id'],
                'last_seen_at' => null,
            ]),
        ];
    }

    public static function message(array $r): array
    {
        return [
            'id' => (int) $r['id'],
            'body' => $r['body'],
            'created_at' => $r['created_at'],
            'user' => self::user([
                'id' => $r['user_id'], 'email' => $r['user_email'],
                'first_name' => $r['user_first_name'], 'last_name' => $r['user_last_name'],
                'name' => $r['user_name'], 'avatar_file_id' => $r['user_avatar_file_id'],
                'last_seen_at' => $r['user_last_seen_at'],
            ]),
            'file' => $r['f_id'] === null ? null : [
                'id' => (int) $r['f_id'],
                'name' => $r['f_name'],
                'mime' => $r['f_mime'],
                'size' => (int) $r['f_size'],
            ],
            'reply_to' => $r['reply_id'] === null ? null : [
                'id' => (int) $r['reply_id'],
                'body' => mb_substr((string) $r['reply_body'], 0, 140),
                'author' => $r['reply_author'],
            ],
        ];
    }

    public static function file(?array $f): ?array
    {
        if ($f === null) {
            return null;
        }
        return [
            'id' => (int) $f['id'],
            'name' => $f['original_name'],
            'mime' => $f['mime_type'],
            'size' => (int) $f['size'],
        ];
    }
}
