<?php

declare(strict_types=1);

final class ProjectController
{
    /** Projects I own + projects registered in one of my teams. */
    public static function index(): void
    {
        $user = Auth::requireUser();
        $projects = Database::all(
            'SELECT DISTINCT p.id, p.owner_id, p.team_id, p.name, p.description, p.created_at, t.name AS team_name
             FROM projects p
             LEFT JOIN teams t ON t.id = p.team_id
             LEFT JOIN team_members tm ON tm.team_id = p.team_id AND tm.user_id = ?
             WHERE p.owner_id = ? OR tm.user_id IS NOT NULL
             ORDER BY p.id DESC',
            [$user['id'], $user['id']]
        );
        Http::json(['ok' => true, 'projects' => $projects]);
    }

    public static function create(): void
    {
        $user = Auth::requireUser();
        $body = Http::body();

        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '' || mb_strlen($name) > 160) {
            Http::error(422, 'invalid_name');
        }
        $description = trim((string) ($body['description'] ?? ''));
        $teamId = isset($body['team_id']) && $body['team_id'] !== '' && $body['team_id'] !== null
            ? (int) $body['team_id']
            : null;

        // A project registered in a team requires team membership.
        if ($teamId !== null && !Auth::isTeamMember($teamId, (int) $user['id'])) {
            Http::error(403, 'forbidden');
        }

        $id = Database::insert(
            'INSERT INTO projects (owner_id, team_id, name, description, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())',
            [$user['id'], $teamId, $name, $description !== '' ? $description : null]
        );

        Http::json(['ok' => true, 'project' => self::row($id)]);
    }

    public static function show(array $params): void
    {
        $user = Auth::requireUser();
        $project = Auth::requireProject((int) $params['id'], (int) $user['id']);
        Http::json([
            'ok' => true,
            'project' => self::row((int) $project['id']),
            'members' => self::membersOf($project),
        ]);
    }

    // ------------------------------------------------------------- helpers

    public static function row(int $projectId): ?array
    {
        return Database::one(
            'SELECT p.id, p.owner_id, p.team_id, p.name, p.description, p.created_at, t.name AS team_name
             FROM projects p LEFT JOIN teams t ON t.id = p.team_id
             WHERE p.id = ?',
            [$projectId]
        );
    }

    /** Users with access to the project = possible task assignees. */
    public static function membersOf(array $project): array
    {
        if ($project['team_id'] !== null) {
            return Database::all(
                'SELECT u.id, u.email, u.name, tm.role
                 FROM team_members tm JOIN users u ON u.id = tm.user_id
                 WHERE tm.team_id = ?
                 ORDER BY u.email',
                [$project['team_id']]
            );
        }

        $owner = Database::one('SELECT id, email, name FROM users WHERE id = ?', [$project['owner_id']]);
        return $owner === null ? [] : [$owner];
    }
}
