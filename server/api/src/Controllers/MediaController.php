<?php

declare(strict_types=1);

/**
 * Authenticated media delivery. Accepts the session token either through the
 * Authorization header (fetch) or a ?token= query parameter (plain <img>/<a>).
 */
final class MediaController
{
    public static function get(array $params): void
    {
        $user = Auth::user();

        if ($user === null) {
            $token = (string) (Http::query('token') ?? '');
            if (preg_match('/^[a-f0-9]{64}$/', $token)) {
                $user = Database::one(
                    'SELECT u.id, u.email, u.name, u.created_at
                     FROM sessions s JOIN users u ON u.id = s.user_id
                     WHERE s.token_hash = ?',
                    [hash('sha256', $token)]
                );
            }
        }
        if ($user === null) {
            Http::error(401, 'unauthorized');
        }

        $file = Database::one('SELECT * FROM files WHERE id = ?', [(int) $params['id']]);
        if ($file === null) {
            Http::error(404, 'file_not_found');
        }
        if ($file['project_id'] === null) {
            // shared assets (avatars, team logos) — any signed-in member may view
        } else {
            Auth::requireProject((int) $file['project_id'], (int) $user['id']);
        }

        Files::stream((array) $file);
    }
}
