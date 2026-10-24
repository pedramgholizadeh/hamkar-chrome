<?php

declare(strict_types=1);

final class TeamController
{
    public static function index(): void
    {
        $user = Auth::requireUser();
        $teams = Database::all(
            'SELECT t.id, t.name, t.invite_code, t.owner_id, tm.role, t.created_at
             FROM teams t JOIN team_members tm ON tm.team_id = t.id
             WHERE tm.user_id = ?
             ORDER BY t.id DESC',
            [$user['id']]
        );
        Http::json(['ok' => true, 'teams' => $teams]);
    }

    public static function create(): void
    {
        $user = Auth::requireUser();
        $name = trim((string) (Http::body()['name'] ?? ''));
        if ($name === '' || mb_strlen($name) > 120) {
            Http::error(422, 'invalid_name');
        }

        $inviteCode = strtoupper(substr(bin2hex(random_bytes(5)), 0, 10));
        $teamId = Database::insert(
            'INSERT INTO teams (name, owner_id, invite_code, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())',
            [$name, $user['id'], $inviteCode]
        );
        Database::run(
            "INSERT IGNORE INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'owner', UTC_TIMESTAMP())",
            [$teamId, $user['id']]
        );

        Http::json(['ok' => true, 'team' => self::row($teamId)]);
    }

    public static function join(): void
    {
        $user = Auth::requireUser();
        $code = strtoupper(trim((string) (Http::body()['code'] ?? '')));
        if ($code === '') {
            Http::error(422, 'invalid_code');
        }

        $team = Database::one('SELECT id, name FROM teams WHERE invite_code = ?', [$code]);
        if ($team === null) {
            Http::error(404, 'invite_code_invalid');
        }

        Database::run(
            "INSERT IGNORE INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'member', UTC_TIMESTAMP())",
            [$team['id'], $user['id']]
        );
        Http::json(['ok' => true, 'team' => $team]);
    }

    public static function show(array $params): void
    {
        $user = Auth::requireUser();
        $teamId = (int) $params['id'];
        if (!Auth::isTeamMember($teamId, (int) $user['id'])) {
            Http::error(403, 'forbidden');
        }

        $team = self::row($teamId);
        if ($team === null) {
            Http::error(404, 'team_not_found');
        }

        $members = Database::all(
            'SELECT u.id, u.email, u.name, tm.role
             FROM team_members tm JOIN users u ON u.id = tm.user_id
             WHERE tm.team_id = ?
             ORDER BY tm.joined_at ASC',
            [$teamId]
        );
        Http::json(['ok' => true, 'team' => $team, 'members' => $members]);
    }

    public static function invite(array $params): void
    {
        $user = Auth::requireUser();
        $teamId = (int) $params['id'];
        if (!Auth::isTeamMember($teamId, (int) $user['id'])) {
            Http::error(403, 'forbidden');
        }
        if ((int) $user['id'] !== (int) self::ownerId($teamId)) {
            Http::error(403, 'only_owner_can_invite');
        }

        $email = strtolower(trim((string) (Http::body()['email'] ?? '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Http::error(422, 'invalid_email');
        }

        $alreadyMember = Database::one(
            'SELECT tm.id FROM team_members tm JOIN users u ON u.id = tm.user_id
             WHERE tm.team_id = ? AND u.email = ?',
            [$teamId, $email]
        );
        if ($alreadyMember !== null) {
            Http::error(409, 'already_member');
        }

        Database::run(
            "INSERT INTO team_invites (team_id, email, invited_by, status, created_at)
             VALUES (?, ?, ?, 'pending', UTC_TIMESTAMP())
             ON DUPLICATE KEY UPDATE status = 'pending', invited_by = VALUES(invited_by), created_at = UTC_TIMESTAMP()",
            [$teamId, $email, $user['id']]
        );
        Http::json(['ok' => true]);
    }

    /** Pending invites waiting for my email address (visible after sign-in). */
    public static function myInvites(): void
    {
        $user = Auth::requireUser();
        $invites = Database::all(
            "SELECT ti.id, ti.team_id, t.name AS team_name, ti.created_at
             FROM team_invites ti JOIN teams t ON t.id = ti.team_id
             WHERE ti.email = ? AND ti.status = 'pending'
             ORDER BY ti.id DESC",
            [$user['email']]
        );
        Http::json(['ok' => true, 'invites' => $invites]);
    }

    public static function acceptInvite(array $params): void
    {
        $user = Auth::requireUser();
        $invite = Database::one(
            "SELECT * FROM team_invites WHERE id = ? AND email = ? AND status = 'pending'",
            [(int) $params['id'], $user['email']]
        );
        if ($invite === null) {
            Http::error(404, 'invite_not_found');
        }

        Database::run("UPDATE team_invites SET status = 'accepted' WHERE id = ?", [$invite['id']]);
        Database::run(
            "INSERT IGNORE INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'member', UTC_TIMESTAMP())",
            [$invite['team_id'], $user['id']]
        );
        Http::json(['ok' => true]);
    }

    // ------------------------------------------------------------- helpers

    public static function row(int $teamId): ?array
    {
        return Database::one(
            'SELECT id, name, invite_code, owner_id, created_at FROM teams WHERE id = ?',
            [$teamId]
        );
    }

    private static function ownerId(int $teamId): int
    {
        $row = Database::one('SELECT owner_id FROM teams WHERE id = ?', [$teamId]);
        return (int) ($row['owner_id'] ?? 0);
    }
}
