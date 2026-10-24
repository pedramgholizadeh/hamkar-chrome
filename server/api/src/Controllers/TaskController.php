<?php

declare(strict_types=1);

final class TaskController
{
    public static function listForProject(array $params): void
    {
        $user = Auth::requireUser();
        $project = Auth::requireProject((int) $params['id'], (int) $user['id']);
        Http::json(['ok' => true, 'tasks' => self::allFor((int) $project['id'])]);
    }

    public static function create(array $params): void
    {
        $user = Auth::requireUser();
        $project = Auth::requireProject((int) $params['id'], (int) $user['id']);
        $body = Http::body();

        $title = trim((string) ($body['title'] ?? ''));
        if ($title === '' || mb_strlen($title) > 255) {
            Http::error(422, 'invalid_title');
        }

        // Assign to myself by default; the assignee must have project access.
        $assigneeId = isset($body['assignee_id']) && $body['assignee_id'] !== ''
            ? (int) $body['assignee_id']
            : (int) $user['id'];
        if (!self::canAssign($project, $assigneeId)) {
            Http::error(422, 'invalid_assignee');
        }

        Database::insert(
            'INSERT INTO tasks (project_id, title, assignee_id, created_by, done, created_at)
             VALUES (?, ?, ?, ?, 0, UTC_TIMESTAMP())',
            [$project['id'], $title, $assigneeId, $user['id']]
        );

        Http::json(['ok' => true, 'tasks' => self::allFor((int) $project['id'])]);
    }

    public static function update(array $params): void
    {
        $user = Auth::requireUser();
        $task = Database::one('SELECT * FROM tasks WHERE id = ?', [(int) $params['id']]);
        if ($task === null) {
            Http::error(404, 'task_not_found');
        }
        $project = Auth::requireProject((int) $task['project_id'], (int) $user['id']);

        $body = Http::body();
        if (array_key_exists('done', $body)) {
            $done = (bool) $body['done'];
            Database::run(
                'UPDATE tasks SET done = ?, done_at = ? WHERE id = ?',
                [$done ? 1 : 0, $done ? gmdate('Y-m-d H:i:s') : null, $task['id']]
            );
        }
        if (isset($body['title'])) {
            $title = trim((string) $body['title']);
            if ($title !== '' && mb_strlen($title) <= 255) {
                Database::run('UPDATE tasks SET title = ? WHERE id = ?', [$title, $task['id']]);
            }
        }

        Http::json(['ok' => true, 'tasks' => self::allFor((int) $project['id'])]);
    }

    // ------------------------------------------------------------- helpers

    private static function allFor(int $projectId): array
    {
        return Database::all(
            'SELECT tk.id, tk.project_id, tk.title, tk.done, tk.created_at, tk.done_at,
                    tk.assignee_id, ua.email AS assignee_email, ua.name AS assignee_name,
                    tk.created_by, uc.email AS creator_email, uc.name AS creator_name
             FROM tasks tk
             LEFT JOIN users ua ON ua.id = tk.assignee_id
             JOIN users uc ON uc.id = tk.created_by
             WHERE tk.project_id = ?
             ORDER BY tk.done ASC, tk.id DESC',
            [$projectId]
        );
    }

    private static function canAssign(array $project, int $userId): bool
    {
        if ($project['team_id'] !== null) {
            return Auth::isTeamMember((int) $project['team_id'], $userId);
        }
        return $userId === (int) $project['owner_id'];
    }
}
