<?php

declare(strict_types=1);

final class ProjectController
{
    /** Projects I own, projects of my teams, and projects I joined by code. */
    public static function index(): void
    {
        $user = Auth::requireUser();
        $projects = Database::all(
            'SELECT p.id, p.owner_id, p.team_id, p.name, p.description, p.created_at,
                    GROUP_CONCAT(DISTINCT t.name SEPARATOR "، ") AS team_name
             FROM projects p
             LEFT JOIN project_teams pt ON pt.project_id = p.id
             LEFT JOIN teams t ON t.id = pt.team_id
             LEFT JOIN team_members tm ON tm.team_id = pt.team_id AND tm.user_id = ?
             LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
             WHERE p.owner_id = ? OR tm.user_id IS NOT NULL OR pm.user_id IS NOT NULL
             GROUP BY p.id
             ORDER BY p.id DESC',
            [$user['id'], $user['id'], $user['id']]
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
        $teamIds = self::requestedTeams($body, (int) $user['id']);

        $inviteCode = strtoupper(substr(bin2hex(random_bytes(5)), 0, 10));
        $id = Database::insert(
            'INSERT INTO projects (owner_id, team_id, invite_code, name, description, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())',
            [$user['id'], $teamIds[0] ?? null, $inviteCode, $name, $description !== '' ? $description : null]
        );
        self::syncTeams($id, $teamIds);

        foreach ($teamIds as $teamId) {
            Activity::write('team', $teamId, (int) $user['id'], 'project_created', 'پروژه‌ی «' . $name . '» ساخته شد');
        }
        Activity::write('project', $id, (int) $user['id'], 'project_created', 'پروژه ساخته شد');

        Http::json(['ok' => true, 'project' => self::row($id)]);
    }

    /** Edit: name/description and the team(s) the project belongs to. */
    public static function update(array $params): void
    {
        $user = Auth::requireUser();
        $project = Auth::requireProject((int) $params['id'], (int) $user['id']);
        if ((int) $project['owner_id'] !== (int) $user['id']) {
            Http::error(403, 'only_owner_can_edit');
        }

        $body = Http::body();
        $changes = [];

        if (isset($body['name'])) {
            $name = trim((string) $body['name']);
            if ($name === '' || mb_strlen($name) > 160) {
                Http::error(422, 'invalid_name');
            }
            Database::run('UPDATE projects SET name = ? WHERE id = ?', [$name, $project['id']]);
            $changes[] = 'نام به «' . $name . '»';
        }
        if (array_key_exists('description', $body)) {
            $description = trim((string) ($body['description'] ?? ''));
            Database::run('UPDATE projects SET description = ? WHERE id = ?', [$description !== '' ? $description : null, $project['id']]);
            $changes[] = 'توضیحات';
        }
        if (isset($body['repo_url'])) {
            $repoUrl = trim((string) ($body['repo_url'] ?? ''));
            if ($repoUrl !== '' && !preg_match('#^https?://[^\s]+$#i', $repoUrl)) {
                Http::error(422, 'invalid_url');
            }
            Database::run('UPDATE projects SET repo_url = ? WHERE id = ?', [$repoUrl !== '' ? $repoUrl : null, $project['id']]);
            $changes[] = 'ریپازیتوری';
        }
        if (array_key_exists('team_ids', $body) || array_key_exists('team_id', $body)) {
            $teamIds = self::requestedTeams($body, (int) $user['id']);
            $old = array_map('intval', array_column(
                Database::all('SELECT team_id FROM project_teams WHERE project_id = ?', [$project['id']]),
                'team_id'
            ));
            self::syncTeams((int) $project['id'], $teamIds);
            Database::run('UPDATE projects SET team_id = ? WHERE id = ?', [$teamIds[0] ?? null, $project['id']]);

            $names = Database::all('SELECT id, name FROM teams');
            $nameOf = fn ($id) => (string) ($names[array_search($id, array_column($names, 'id'), true)]['name'] ?? $id);
            $added = array_diff($teamIds, $old);
            $removed = array_diff($old, $teamIds);
            foreach ($added as $teamId) {
                Activity::write('team', (int) $teamId, (int) $user['id'], 'project_added', 'پروژه‌ی «' . $project['name'] . '» به تیم اضافه شد');
            }
            foreach ($removed as $teamId) {
                Activity::write('team', (int) $teamId, (int) $user['id'], 'project_removed', 'پروژه‌ی «' . $project['name'] . '» از تیم خارج شد');
            }
            $changes[] = 'تیم‌ها (' . implode('، ', array_map($nameOf, $teamIds)) . ')';
        }

        Activity::write('project', (int) $project['id'], (int) $user['id'], 'project_updated', $changes ? 'ویرایش: ' . implode('، ', $changes) : 'ویرایش پروژه');
        Http::json(['ok' => true, 'project' => self::row((int) $project['id'])]);
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

    /** Delete completely — project owner or the owner of any of its teams. */
    public static function destroy(array $params): void
    {
        $user = Auth::requireUser();
        $project = Database::one('SELECT * FROM projects WHERE id = ?', [(int) $params['id']]);
        if ($project === null) {
            Http::error(404, 'project_not_found');
        }

        $isOwner = (int) $project['owner_id'] === (int) $user['id'];
        $teamOwnerOf = $isOwner ? null : Database::one(
            'SELECT pt.team_id FROM project_teams pt JOIN teams t ON t.id = pt.team_id
             WHERE pt.project_id = ? AND t.owner_id = ? LIMIT 1',
            [$project['id'], $user['id']]
        );
        if (!$isOwner && $teamOwnerOf === null) {
            Http::error(403, 'forbidden');
        }

        $files = Database::all('SELECT stored_path FROM files WHERE project_id = ?', [$project['id']]);
        foreach ($files as $f) {
            $path = Files::mediaDir() . '/' . $f['stored_path'];
            if (is_file($path)) {
                @unlink($path);
            }
        }

        // log into every team the project belonged to (project rows cascade away)
        $teamIds = array_map('intval', array_column(
            Database::all('SELECT team_id FROM project_teams WHERE project_id = ?', [$project['id']]),
            'team_id'
        ));
        foreach ($teamIds as $teamId) {
            Activity::write('team', $teamId, (int) $user['id'], 'project_deleted', 'پروژه‌ی «' . $project['name'] . '» کاملاً حذف شد');
        }

        Database::run('DELETE FROM projects WHERE id = ?', [$project['id']]);
        Http::json(['ok' => true]);
    }

    /** Leave a project I joined by code (owner cannot leave their own project). */
    public static function leave(array $params): void
    {
        $user = Auth::requireUser();
        $project = Database::one('SELECT * FROM projects WHERE id = ?', [(int) $params['id']]);
        if ($project === null) {
            Http::error(404, 'project_not_found');
        }
        if (!Auth::canAccessProject($project, (int) $user['id'])) {
            Http::error(403, 'forbidden');
        }
        if ((int) $project['owner_id'] === (int) $user['id']) {
            Http::error(422, 'owner_cannot_leave');
        }

        Database::run(
            'DELETE FROM project_members WHERE project_id = ? AND user_id = ?',
            [$project['id'], $user['id']]
        );
        Activity::write('project', (int) $project['id'], (int) $user['id'], 'member_left', 'از پروژه خارج شد');
        Http::json(['ok' => true]);
    }

    // ------------------------------------------------------- invite codes

    public static function rotateCode(array $params): void
    {
        $user = Auth::requireUser();
        $project = Database::one('SELECT * FROM projects WHERE id = ?', [(int) $params['id']]);
        if ($project === null) {
            Http::error(404, 'project_not_found');
        }
        if (!self::canManage($project, (int) $user['id'])) {
            Http::error(403, 'forbidden');
        }

        $code = strtoupper(substr(bin2hex(random_bytes(5)), 0, 10));
        Database::run('UPDATE projects SET invite_code = ? WHERE id = ?', [$code, $project['id']]);
        Activity::write('project', (int) $project['id'], (int) $user['id'], 'code_rotated', 'کد دعوت پروژه جدید شد');
        Http::json(['ok' => true, 'project' => self::row((int) $project['id'])]);
    }

    public static function joinByCode(): void
    {
        $user = Auth::requireUser();
        $code = strtoupper(trim((string) (Http::body()['code'] ?? '')));
        if ($code === '') {
            Http::error(422, 'invalid_code');
        }

        $project = Database::one('SELECT id, name FROM projects WHERE invite_code = ?', [$code]);
        if ($project === null) {
            Http::error(404, 'invite_code_invalid');
        }

        $inserted = Database::insert(
            'INSERT IGNORE INTO project_members (project_id, user_id, joined_at) VALUES (?, ?, UTC_TIMESTAMP())',
            [$project['id'], $user['id']]
        );
        if ($inserted > 0) {
            Activity::write('project', (int) $project['id'], (int) $user['id'], 'member_joined', 'با کد دعوت به پروژه پیوست');
        }
        Http::json(['ok' => true, 'project' => $project]);
    }

    // -------------------------------------------------------------- phases

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
        Activity::write('project', (int) $project['id'], (int) $user['id'], 'phase_created', 'فاز «' . $title . '» ساخته شد');
        Http::json(['ok' => true, 'phases' => self::phasesFor((int) $project['id'])]);
    }

    public static function deletePhase(array $params): void
    {
        $user = Auth::requireUser();
        $phase = Database::one('SELECT * FROM project_phases WHERE id = ?', [(int) $params['id']]);
        if ($phase === null) {
            Http::error(404, 'phase_not_found');
        }
        $project = Auth::requireProject((int) $phase['project_id'], (int) $user['id']);

        Database::run('UPDATE tasks SET phase_id = NULL WHERE phase_id = ?', [$phase['id']]);
        Database::run('DELETE FROM project_phases WHERE id = ?', [$phase['id']]);
        Activity::write('project', (int) $project['id'], (int) $user['id'], 'phase_deleted', 'فاز «' . $phase['title'] . '» حذف شد');
        Http::json(['ok' => true, 'phases' => self::phasesFor((int) $project['id'])]);
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
        Activity::write('project', (int) $project['id'], (int) $user['id'], 'version_released', 'نسخه‌ی v' . $name . ' منتشر شد');
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
        Activity::write('project', (int) $project['id'], (int) $user['id'], 'version_deleted', 'نسخه‌ی v' . $version['name'] . ' حذف شد');
        Http::json(['ok' => true]);
    }

    // ------------------------------------------------------------- helpers

    /** Teams requested in the body (team_ids[] preferred, legacy team_id). */
    private static function requestedTeams(array $body, int $userId): array
    {
        $ids = [];
        if (isset($body['team_ids']) && is_array($body['team_ids'])) {
            $ids = $body['team_ids'];
        } elseif (isset($body['team_id']) && $body['team_id'] !== '' && $body['team_id'] !== null) {
            $ids = [$body['team_id']];
        }
        $ids = array_values(array_unique(array_map('intval', array_filter($ids, fn ($v) => $v !== null && $v !== ''))));
        foreach ($ids as $teamId) {
            if (!Auth::isTeamMember($teamId, $userId)) {
                Http::error(403, 'forbidden');
            }
        }
        return $ids;
    }

    private static function syncTeams(int $projectId, array $teamIds): void
    {
        Database::run('DELETE FROM project_teams WHERE project_id = ?', [$projectId]);
        foreach ($teamIds as $teamId) {
            Database::run('INSERT IGNORE INTO project_teams (project_id, team_id) VALUES (?, ?)', [$projectId, (int) $teamId]);
        }
    }

    private static function canManage(array $project, int $userId): bool
    {
        if ((int) $project['owner_id'] === $userId) {
            return true;
        }
        return Database::one(
            'SELECT t.id FROM project_teams pt JOIN teams t ON t.id = pt.team_id
             WHERE pt.project_id = ? AND t.owner_id = ? LIMIT 1',
            [$project['id'], $userId]
        ) !== null;
    }

    public static function row(int $projectId): ?array
    {
        return Database::one(
            'SELECT p.id, p.owner_id, p.team_id, p.invite_code, p.name, p.description, p.created_at,
                    (SELECT GROUP_CONCAT(t.name SEPARATOR "، ") FROM project_teams pt JOIN teams t ON t.id = pt.team_id WHERE pt.project_id = p.id) AS team_name,
                    (SELECT GROUP_CONCAT(pt.team_id) FROM project_teams pt WHERE pt.project_id = p.id) AS team_ids
             FROM projects p WHERE p.id = ?',
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

    /** Users with access: owner + members of all its teams + direct members. */
    public static function membersOf(array $project): array
    {
        $rows = Database::all(
            'SELECT DISTINCT ' . Shape::USER_COLUMNS . ",
                    CASE WHEN u.id = ? THEN 'owner' ELSE 'member' END AS role
             FROM users u
             WHERE u.id = ?
                OR u.id IN (SELECT tm.user_id FROM project_teams pt JOIN team_members tm ON tm.team_id = pt.team_id WHERE pt.project_id = ?)
                OR u.id IN (SELECT user_id FROM project_members WHERE project_id = ?)
             ORDER BY u.email",
            [
                (int) $project['owner_id'],
                (int) $project['owner_id'],
                (int) $project['id'],
                (int) $project['id'],
            ]
        );
        return array_map([Shape::class, 'user'], $rows);
    }
}
