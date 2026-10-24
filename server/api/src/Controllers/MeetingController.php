<?php

declare(strict_types=1);

/**
 * Google Meet integration for teams: any member can publish an active
 * meeting (a real meet.google.com link), everyone sees it with live
 * attendance; the creator or the team owner can end it.
 */
final class MeetingController
{
    public static function index(array $params): void
    {
        $user = Auth::requireUser();
        $teamId = (int) $params['id'];
        if (!Auth::isTeamMember($teamId, (int) $user['id'])) {
            Http::error(403, 'forbidden');
        }

        $meetings = array_map([self::class, 'shape'], Database::all(
            'SELECT m.*, ' . str_replace('u.', 'cu.', Shape::USER_COLUMNS) . '
             FROM team_meetings m JOIN users cu ON cu.id = m.created_by
             WHERE m.team_id = ?
             ORDER BY m.status ASC, m.id DESC LIMIT 30',
            [$teamId]
        ));
        Http::json(['ok' => true, 'meetings' => $meetings]);
    }

    public static function create(array $params): void
    {
        $user = Auth::requireUser();
        $teamId = (int) $params['id'];
        if (!Auth::isTeamMember($teamId, (int) $user['id'])) {
            Http::error(403, 'forbidden');
        }

        $body = Http::body();
        $url = trim((string) ($body['url'] ?? ''));
        $title = trim((string) ($body['title'] ?? ''));
        if (!preg_match('#^https://meet\.google\.com/[a-z0-9-]{3,}#i', $url)
            && !preg_match('#^https://[^\s]+$#i', $url)) {
            Http::error(422, 'invalid_meeting_url');
        }
        if (mb_strlen($title) > 160) {
            Http::error(422, 'invalid_name');
        }

        // one active meeting per team keeps the UI focused
        Database::run(
            "UPDATE team_meetings SET status = 'ended', ended_at = UTC_TIMESTAMP()
             WHERE team_id = ? AND status = 'active'",
            [$teamId]
        );

        $id = Database::insert(
            "INSERT INTO team_meetings (team_id, created_by, title, url, status, created_at) VALUES (?, ?, ?, ?, 'active', UTC_TIMESTAMP())",
            [$teamId, $user['id'], $title !== '' ? $title : null, $url]
        );
        Http::json(['ok' => true, 'meeting' => self::shape((array) Database::one(
            'SELECT m.*, ' . str_replace('u.', 'cu.', Shape::USER_COLUMNS) . ' FROM team_meetings m JOIN users cu ON cu.id = m.created_by WHERE m.id = ?',
            [$id]
        ))]);
    }

    /** Mark me as attending (live presence for the whole team). */
    public static function join(array $params): void
    {
        $user = Auth::requireUser();
        $meeting = Database::one("SELECT * FROM team_meetings WHERE id = ?", [(int) $params['id']]);
        if ($meeting === null) {
            Http::error(404, 'meeting_not_found');
        }
        if (!Auth::isTeamMember((int) $meeting['team_id'], (int) $user['id'])) {
            Http::error(403, 'forbidden');
        }
        if ($meeting['status'] !== 'active') {
            Http::error(422, 'meeting_ended');
        }
        Database::run(
            'INSERT IGNORE INTO meeting_attendance (meeting_id, user_id, joined_at) VALUES (?, ?, UTC_TIMESTAMP())',
            [$meeting['id'], $user['id']]
        );
        Http::json(['ok' => true]);
    }

    public static function end(array $params): void
    {
        $user = Auth::requireUser();
        $meeting = Database::one('SELECT * FROM team_meetings WHERE id = ?', [(int) $params['id']]);
        if ($meeting === null) {
            Http::error(404, 'meeting_not_found');
        }
        if (!Auth::isTeamMember((int) $meeting['team_id'], (int) $user['id'])) {
            Http::error(403, 'forbidden');
        }
        if ((int) $meeting['created_by'] !== (int) $user['id']) {
            TeamController::requireOwner((int) $meeting['team_id'], (int) $user['id']);
        }
        Database::run(
            "UPDATE team_meetings SET status = 'ended', ended_at = UTC_TIMESTAMP() WHERE id = ?",
            [$meeting['id']]
        );
        Http::json(['ok' => true]);
    }

    // ------------------------------------------------------------- helpers

    private static function shape(array $m): array
    {
        $attendees = array_map([Shape::class, 'user'], Database::all(
            'SELECT ' . Shape::USER_COLUMNS . '
             FROM meeting_attendance a JOIN users u ON u.id = a.user_id
             WHERE a.meeting_id = ?
             ORDER BY a.joined_at ASC',
            [$m['id']]
        ));
        return [
            'id' => (int) $m['id'],
            'team_id' => (int) $m['team_id'],
            'title' => $m['title'],
            'url' => $m['url'],
            'status' => $m['status'],
            'created_at' => $m['created_at'],
            'ended_at' => $m['ended_at'],
            'creator' => Shape::user($m),
            'attendees' => $attendees,
        ];
    }
}
