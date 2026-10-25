<?php

declare(strict_types=1);

/**
 * User activity log, scoped to a team or a project, visible to all members.
 */
final class Activity
{
    public static function write(string $scopeType, int $scopeId, int $userId, string $action, ?string $detail = null): void
    {
        try {
            Database::insert(
                'INSERT INTO activity_logs (scope_type, scope_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())',
                [$scopeType, $scopeId, $userId, mb_substr($action, 0, 60), $detail !== null ? mb_substr($detail, 0, 500) : null]
            );
        } catch (Throwable $e) {
            error_log('[hamkar-activity] ' . $e->getMessage());
        }
    }

    public static function forScope(string $scopeType, int $scopeId): array
    {
        return array_map(fn (array $r) => [
            'id' => (int) $r['id'],
            'action' => $r['action'],
            'detail' => $r['detail'],
            'created_at' => $r['created_at'],
            'user' => Shape::user(array_merge($r, ['last_seen_at' => null])),
        ], Database::all(
            'SELECT a.*, u.email, u.first_name, u.last_name, u.name, u.avatar_file_id
             FROM activity_logs a JOIN users u ON u.id = a.user_id
             WHERE a.scope_type = ? AND a.scope_id = ?
             ORDER BY a.id DESC LIMIT 150',
            [$scopeType, $scopeId]
        ));
    }
}
