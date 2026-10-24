<?php

declare(strict_types=1);

final class Auth
{
    private static ?array $user = null;

    public static function uuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40); // version 4
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80); // RFC 4122 variant
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }

    /** Current session user (from Bearer token) or null. */
    public static function user(): ?array
    {
        if (self::$user !== null) {
            return self::$user;
        }

        $token = Http::bearer();
        if ($token === null || !preg_match('/^[a-f0-9]{64}$/', $token)) {
            return null;
        }

        $row = Database::one(
            'SELECT u.id, u.email, u.name, u.created_at
             FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token_hash = ?',
            [hash('sha256', $token)]
        );

        self::$user = $row;
        return $row;
    }

    public static function requireUser(): array
    {
        $user = self::user();
        if ($user === null) {
            Http::error(401, 'unauthorized');
        }
        return $user;
    }

    /** Long-lived session token (stays valid until logout). */
    public static function createSession(int $userId): string
    {
        $token = bin2hex(random_bytes(32));
        Database::insert(
            'INSERT INTO sessions (user_id, token_hash, created_at) VALUES (?, ?, UTC_TIMESTAMP())',
            [$userId, hash('sha256', $token)]
        );
        return $token;
    }

    // ---------------------------------------------------------------- access

    public static function isTeamMember(int $teamId, int $userId): bool
    {
        return Database::one(
            'SELECT id FROM team_members WHERE team_id = ? AND user_id = ?',
            [$teamId, $userId]
        ) !== null;
    }

    /** A project is visible to its owner and to members of its team (if any). */
    public static function canAccessProject(array $project, int $userId): bool
    {
        if ((int) $project['owner_id'] === $userId) {
            return true;
        }
        if ($project['team_id'] !== null && self::isTeamMember((int) $project['team_id'], $userId)) {
            return true;
        }
        return false;
    }

    /** Fetch a project after checking access, or fail with 404/403. */
    public static function requireProject(int $projectId, int $userId): array
    {
        $project = Database::one('SELECT * FROM projects WHERE id = ?', [$projectId]);
        if ($project === null) {
            Http::error(404, 'project_not_found');
        }
        if (!self::canAccessProject($project, $userId)) {
            Http::error(403, 'forbidden');
        }
        return $project;
    }
}
