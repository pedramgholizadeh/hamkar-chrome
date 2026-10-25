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

        [$phaseId, $priority, $dueDate] = self::readExtras($project, $body);

        Database::insert(
            'INSERT INTO tasks (project_id, title, assignee_id, created_by, phase_id, priority, due_date, done, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, UTC_TIMESTAMP())',
            [$project['id'], $title, $assigneeId, $user['id'], $phaseId, $priority, $dueDate]
        );
        Activity::write('project', (int) $project['id'], (int) $user['id'], 'task_created',
            'تسک «' . $title . '» ساخته شد');

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
            Activity::write('project', (int) $project['id'], (int) $user['id'], $done ? 'task_done' : 'task_reopened',
                ($done ? 'تسک «' : 'تسک «') . $task['title'] . '» ' . ($done ? 'انجام شد' : 'به حالت باز برگشت'));
        }
        if (isset($body['title'])) {
            $title = trim((string) $body['title']);
            if ($title !== '' && mb_strlen($title) <= 255) {
                Database::run('UPDATE tasks SET title = ? WHERE id = ?', [$title, $task['id']]);
            }
        }

        [$phaseId, $priority, $dueDate] = self::readExtras($project, $body, $task);
        if ($phaseId !== null) {
            Database::run('UPDATE tasks SET phase_id = ? WHERE id = ?', [$phaseId, $task['id']]);
        }
        if ($priority !== null) {
            Database::run('UPDATE tasks SET priority = ? WHERE id = ?', [$priority, $task['id']]);
        }
        if ($dueDate !== false) {
            Database::run('UPDATE tasks SET due_date = ? WHERE id = ?', [$dueDate, $task['id']]);
        }

        Http::json(['ok' => true, 'tasks' => self::allFor((int) $project['id'])]);
    }

    // ------------------------------------------------------------- helpers

    /** @return array{0: ?int, 1: string, 2: string|false|null} phase, priority, due (false = untouched) */
    private static function readExtras(array $project, array $body, ?array $task = null): array
    {
        // phase must belong to this project
        $phaseId = null;
        if (array_key_exists('phase_id', $body)) {
            $phaseId = $body['phase_id'] === null || $body['phase_id'] === '' ? null : (int) $body['phase_id'];
            if ($phaseId !== null) {
                $phase = Database::one('SELECT id FROM project_phases WHERE id = ? AND project_id = ?', [$phaseId, $project['id']]);
                if ($phase === null) {
                    Http::error(422, 'invalid_phase');
                }
            }
        }

        $priority = 'medium';
        if (isset($body['priority'])) {
            $priority = (string) $body['priority'];
            if (!in_array($priority, ['low', 'medium', 'high'], true)) {
                Http::error(422, 'invalid_priority');
            }
        } elseif ($task !== null) {
            $priority = (string) $task['priority'];
        }

        $dueDate = false;
        if (array_key_exists('due_date', $body)) {
            $due = trim((string) ($body['due_date'] ?? ''));
            $dueDate = null;
            if ($due !== '') {
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $due)) {
                    Http::error(422, 'invalid_due_date');
                }
                $dueDate = $due;
            }
        }

        return [$phaseId, $priority, $dueDate];
    }

    private static function allFor(int $projectId): array
    {
        $rows = Database::all(
            'SELECT tk.*, ph.title AS phase_title,
                    ua.email AS assignee_email, ua.first_name AS assignee_first_name, ua.last_name AS assignee_last_name, ua.name AS assignee_name, ua.avatar_file_id AS assignee_avatar_file_id,
                    uc.email AS creator_email, uc.first_name AS creator_first_name, uc.last_name AS creator_last_name, uc.name AS creator_name, uc.avatar_file_id AS creator_avatar_file_id
             FROM tasks tk
             LEFT JOIN project_phases ph ON ph.id = tk.phase_id
             LEFT JOIN users ua ON ua.id = tk.assignee_id
             JOIN users uc ON uc.id = tk.created_by
             WHERE tk.project_id = ?
             ORDER BY tk.done ASC, tk.id DESC',
            [$projectId]
        );
        return array_map([Shape::class, 'task'], $rows);
    }

    private static function canAssign(array $project, int $userId): bool
    {
        return Auth::canAccessProject($project, $userId);
    }
}
