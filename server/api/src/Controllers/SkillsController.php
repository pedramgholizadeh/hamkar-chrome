<?php

declare(strict_types=1);

/**
 * Team skills: personal Skill.md files shared inside a team.
 * Create with a pasted markdown body or by uploading a .md file.
 */
final class SkillsController
{
    public static function index(array $params): void
    {
        $user = Auth::requireUser();
        $teamId = (int) $params['id'];
        if (!Auth::isTeamMember($teamId, (int) $user['id'])) {
            Http::error(403, 'forbidden');
        }

        $skills = Database::all(
            'SELECT s.id, s.team_id, s.title, s.owner_id, s.created_at, s.updated_at,
                    ' . str_replace('u.', 'ou.', Shape::USER_COLUMNS) . '
             FROM skills s
             JOIN users ou ON ou.id = s.owner_id
             WHERE s.team_id = ?
             ORDER BY s.updated_at DESC',
            [$teamId]
        );
        Http::json(['ok' => true, 'skills' => array_map([self::class, 'shape'], $skills)]);
    }

    public static function create(array $params, array $config): void
    {
        $user = Auth::requireUser();
        $teamId = (int) $params['id'];
        if (!Auth::isTeamMember($teamId, (int) $user['id'])) {
            Http::error(403, 'forbidden');
        }

        [$title, $content] = self::readInput($config);
        if ($title === '' || $content === '') {
            Http::error(422, 'invalid_skill');
        }

        $id = Database::insert(
            'INSERT INTO skills (team_id, owner_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())',
            [$teamId, $user['id'], $title, $content]
        );
        Activity::write('team', $teamId, (int) $user['id'], 'skill_created', 'اسکیل «' . $title . '» را به اشتراک گذاشت');
        Http::json(['ok' => true, 'skill' => self::row($id)]);
    }

    public static function show(array $params): void
    {
        $user = Auth::requireUser();
        $skill = self::row((int) $params['id']);
        if ($skill === null) {
            Http::error(404, 'skill_not_found');
        }
        if (!Auth::isTeamMember((int) $skill['team_id'], (int) $user['id'])) {
            Http::error(403, 'forbidden');
        }
        Http::json(['ok' => true, 'skill' => $skill]);
    }

    public static function update(array $params, array $config): void
    {
        $user = Auth::requireUser();
        $skill = self::row((int) $params['id']);
        if ($skill === null) {
            Http::error(404, 'skill_not_found');
        }
        if ((int) $skill['owner_id'] !== (int) $user['id']) {
            Http::error(403, 'forbidden');
        }

        [$title, $content] = self::readInput($config);
        Database::run(
            'UPDATE skills SET title = ?, content = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
            [$title !== '' ? $title : $skill['title'], $content !== '' ? $content : $skill['content'], $skill['id']]
        );
        Http::json(['ok' => true, 'skill' => self::row((int) $skill['id'])]);
    }

    public static function delete(array $params): void
    {
        $user = Auth::requireUser();
        $skill = self::row((int) $params['id']);
        if ($skill === null) {
            Http::error(404, 'skill_not_found');
        }
        if ((int) $skill['owner_id'] !== (int) $user['id']) {
            Http::error(403, 'forbidden');
        }
        Database::run('DELETE FROM skills WHERE id = ?', [$skill['id']]);
        Activity::write('team', (int) $skill['team_id'], (int) $user['id'], 'skill_deleted', 'اسکیل «' . $skill['title'] . '» حذف شد');
        Http::json(['ok' => true]);
    }

    // ------------------------------------------------------------- helpers

    private static function readInput(array $config): array
    {
        // uploaded .md file wins over pasted text
        if (isset($_FILES['file']) && is_array($_FILES['file'])
            && ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
            $maxBytes = (int) ($config['app']['upload_max_bytes'] ?? 10 * 1024 * 1024);
            if ((int) $_FILES['file']['size'] > $maxBytes) {
                Http::error(413, 'file_too_large');
            }
            $content = (string) file_get_contents((string) $_FILES['file']['tmp_name']);
            $name = pathinfo((string) $_FILES['file']['name'], PATHINFO_FILENAME);
            $title = trim((string) (Http::body()['title'] ?? '')) ?: trim($name) ?: 'Skill';
            return [$title, $content];
        }

        $body = Http::body();
        $title = trim((string) ($body['title'] ?? ''));
        $content = (string) ($body['content'] ?? '');
        if (mb_strlen($title) > 160 || mb_strlen($content) > 200000) {
            Http::error(422, 'invalid_skill');
        }
        return [$title, $content];
    }

    private static function row(int $id): ?array
    {
        $r = Database::one(
            'SELECT s.*, ' . str_replace('u.', 'ou.', Shape::USER_COLUMNS) . '
             FROM skills s JOIN users ou ON ou.id = s.owner_id
             WHERE s.id = ?',
            [$id]
        );
        if ($r === null) {
            return null;
        }
        return [
            'id' => (int) $r['id'],
            'team_id' => (int) $r['team_id'],
            'title' => $r['title'],
            'content' => $r['content'],
            'created_at' => $r['created_at'],
            'updated_at' => $r['updated_at'],
            'owner' => Shape::user($r),
        ];
    }
}
