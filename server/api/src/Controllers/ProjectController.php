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

    /** Register / edit the repository link (any member can add it). */
    public static function update(array $params): void
    {
        $user = Auth::requireUser();
        $project = Auth::requireProject((int) $params['id'], (int) $user['id']);

        $repoUrl = trim((string) (Http::body()['repo_url'] ?? ''));
        if ($repoUrl !== '' && !preg_match('#^https?://[^\s]+$#i', $repoUrl)) {
            Http::error(422, 'invalid_url');
        }
        Database::run('UPDATE projects SET repo_url = ? WHERE id = ?', [$repoUrl !== '' ? $repoUrl : null, $project['id']]);
        Http::json(['ok' => true, 'project' => self::row((int) $project['id'])]);
    }

    // ------------------------------------------------------------- phases

    public static function phases(array $params): void
    {
        $user = Auth::requireUser();
        $project = Auth::requireProject((int) $params['id'], (int) $user['id']);
        Http::json(['ok' => true, 'phases' => self::phasesFor((int) $project['id'])]);
    }

    public static function createPhase(array $params): void
    {
        $user = Auth::requireUser();
        $project = Auth::requireProject((int) $params['id'], (int) $user['id']);

        $title = trim((string) (Http::body()['title'] ?? ''));
        if ($title === '' || mb_strlen($title) > 160) {
            Http::error(422, 'invalid_name');
        }

        $max = Database::one('SELECT COALESCE(MAX(position), -1) AS p FROM project_phases WHERE project_id = ?', [$project['id']]);
        Database::insert(
            'INSERT INTO project_phases (project_id, title, position, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())',
            [$project['id'], $title, (int) ($max['p'] ?? -1) + 1]
        );
        Http::json(['ok' => true, 'phases' => self::phasesFor((int) $project['id'])]);
    }

    public static function deletePhase(array $params): void
    {
        $user = Auth::requireUser();
        $phase = Database::one('SELECT * FROM project_phases WHERE id = ?', [(int) $params['id']]);
        if ($phase === null) {
            Http::error(404, 'phase_not_found');
        }
        Auth::requireProject((int) $phase['project_id'], (int) $user['id']);

        Database::run('UPDATE tasks SET phase_id = NULL WHERE phase_id = ?', [$phase['id']]);
        Database::run('DELETE FROM project_phases WHERE id = ?', [$phase['id']]);
        Http::json(['ok' => true, 'phases' => self::phasesFor((int) $phase['project_id'])]);
    }

    // ------------------------------------------------------------ versions

    public static function versions(array $params): void
    {
        $user = Auth::requireUser();
        $project = Auth::requireProject((int) $params['id'], (int) $user['id']);

        $versions = array_map(fn (array $v) => [
            'id' => (int) $v['id'],
            'name' => $v['name'],
            'notes' => $v['notes'],
            'created_at' => $v['created_at'],
            'creator' => Shape::user(array_merge($v, [
                'first_name' => $v['creator_first_name'],
                'last_name' => $v['creator_last_name'],
                'avatar_file_id' => $v['creator_avatar_file_id'],
                'last_seen_at' => null,
            ])),
        ], Database::all(
            'SELECT v.*, cu.email AS creator_email, cu.first_name AS creator_first_name, cu.last_name AS creator_last_name, cu.name AS creator_name, cu.avatar_file_id AS creator_avatar_file_id
             FROM project_versions v JOIN users cu ON cu.id = v.created_by
             WHERE v.project_id = ?
             ORDER BY v.id DESC LIMIT 100',
            [$project['id']]
        ));
        Http::json(['ok' => true, 'versions' => $versions]);
    }

    public static function createVersion(array $params): void
    {
        $user = Auth::requireUser();
        $project = Auth::requireProject((int) $params['id'], (int) $user['id']);

        $body = Http::body();
        $name = trim((string) ($body['name'] ?? ''));
        $notes = trim((string) ($body['notes'] ?? ''));
        if ($name === '' || mb_strlen($name) > 60 || mb_strlen($notes) > 5000) {
            Http::error(422, 'invalid_name');
        }

        Database::insert(
            'INSERT INTO project_versions (project_id, name, notes, created_by, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())',
            [$project['id'], $name, $notes !== '' ? $notes : null, $user['id']]
        );
        Http::json(['ok' => true]);
    }

    public static function deleteVersion(array $params): void
    {
        $user = Auth::requireUser();
        $version = Database::one('SELECT * FROM project_versions WHERE id = ?', [(int) $params['id']]);
        if ($version === null) {
            Http::error(404, 'version_not_found');
        }
        $project = Auth::requireProject((int) $version['project_id'], (int) $user['id']);
        if ((int) $version['created_by'] !== (int) $user['id'] && (int) $project['owner_id'] !== (int) $user['id']) {
            Http::error(403, 'forbidden');
        }
        Database::run('DELETE FROM project_versions WHERE id = ?', [$version['id']]);
        Http::json(['ok' => true]);
    }

    // ------------------------------------------------------------- helpers

    public static function row(int $projectId): ?array
    {
        return Database::one(
            'SELECT p.id, p.owner_id, p.team_id, p.name, p.description, p.repo_url, p.created_at, t.name AS team_name
             FROM projects p LEFT JOIN teams t ON t.id = p.team_id
             WHERE p.id = ?',
            [$projectId]
        );
    }

    public static function phasesFor(int $projectId): array
    {
        return array_map(fn (array $p) => [
            'id' => (int) $p['id'],
            'title' => $p['title'],
            'position' => (int) $p['position'],
            'task_count' => (int) $p['task_count'],
            'done_count' => (int) $p['done_count'],
        ], Database::all(
            'SELECT ph.*,
                    (SELECT COUNT(*) FROM tasks tk WHERE tk.phase_id = ph.id) AS task_count,
                    (SELECT COUNT(*) FROM tasks tk WHERE tk.phase_id = ph.id AND tk.done = 1) AS done_count
             FROM project_phases ph
             WHERE ph.project_id = ?
             ORDER BY ph.position ASC, ph.id ASC',
            [$projectId]
        ));
    }

    /** Users with access to the project = possible task assignees. */
    public static function membersOf(array $project): array
    {
        if ($project['team_id'] !== null) {
            return array_map([Shape::class, 'user'], Database::all(
                'SELECT ' . Shape::USER_COLUMNS . ', tm.role
                 FROM team_members tm JOIN users u ON u.id = tm.user_id
                 WHERE tm.team_id = ?
                 ORDER BY u.email',
                [$project['team_id']]
            ));
        }

        $owner = Database::one('SELECT ' . Shape::USER_COLUMNS . ' FROM users u WHERE u.id = ?', [$project['owner_id']]);
        return $owner === null ? [] : [Shape::user($owner)];
    }
}
