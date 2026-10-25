<?php

declare(strict_types=1);

/** Read-only views of the shared activity log. */
final class ActivityController
{
    public static function forProject(array $params): void
    {
        $user = Auth::requireUser();
        Auth::requireProject((int) $params['id'], (int) $user['id']);
        Http::json(['ok' => true, 'activities' => Activity::forScope('project', (int) $params['id'])]);
    }

    public static function forTeam(array $params): void
    {
        $user = Auth::requireUser();
        if (!Auth::isTeamMember((int) $params['id'], (int) $user['id'])) {
            Http::error(403, 'forbidden');
        }
        Http::json(['ok' => true, 'activities' => Activity::forScope('team', (int) $params['id'])]);
    }
}
