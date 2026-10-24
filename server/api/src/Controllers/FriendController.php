<?php

declare(strict_types=1);

/**
 * Friends: requests by email, accept/decline, and private DM (also allowed
 * between users who share a team or a project, even without friendship).
 */
final class FriendController
{
    public static function index(): void
    {
        $me = Auth::requireUser();
        $id = (int) $me['id'];

        $friends = array_map([self::class, 'friendShape'], Database::all(
            "(SELECT f.id AS friendship_id, 'accepted' AS fr_status, 'requester' AS my_side, " . self::USERSEL . "
              FROM friendships f JOIN users u ON u.id = f.addressee_id WHERE f.requester_id = ? AND f.status = 'accepted')
             UNION ALL
             (SELECT f.id, 'accepted', 'addressee', " . self::USERSEL . "
              FROM friendships f JOIN users u ON u.id = f.requester_id WHERE f.addressee_id = ? AND f.status = 'accepted')
             ORDER BY 3",
            [$id, $id]
        ));

        $incoming = array_map([self::class, 'friendShape'], Database::all(
            'SELECT f.id AS friendship_id, \'incoming\' AS fr_status, \'addressee\' AS my_side, ' . self::USERSEL . '
             FROM friendships f JOIN users u ON u.id = f.requester_id
             WHERE f.addressee_id = ? AND f.status = \'pending\' ORDER BY f.id DESC',
            [$id]
        ));

        $outgoing = array_map([self::class, 'friendShape'], Database::all(
            'SELECT f.id AS friendship_id, \'outgoing\' AS fr_status, \'requester\' AS my_side, ' . self::USERSEL . '
             FROM friendships f JOIN users u ON u.id = f.addressee_id
             WHERE f.requester_id = ? AND f.status = \'pending\' ORDER BY f.id DESC',
            [$id]
        ));

        Http::json(['ok' => true, 'friends' => $friends, 'incoming' => $incoming, 'outgoing' => $outgoing]);
    }

    public static function request(): void
    {
        $me = Auth::requireUser();
        $email = strtolower(trim((string) (Http::body()['email'] ?? '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Http::error(422, 'invalid_email');
        }
        if ($email === $me['email']) {
            Http::error(422, 'invalid_friend');
        }

        $target = Database::one('SELECT id, email FROM users WHERE email = ?', [$email]);
        if ($target === null) {
            Http::error(404, 'user_not_found');
        }
        $meId = (int) $me['id'];
        $targetId = (int) $target['id'];

        $existing = Database::one(
            "SELECT * FROM friendships
             WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)",
            [$meId, $targetId, $targetId, $meId]
        );
        if ($existing !== null) {
            if ($existing['status'] === 'accepted') {
                Http::error(409, 'already_friends');
            }
            // they already asked me — accept instantly
            if ((int) $existing['addressee_id'] === $meId) {
                Database::run("UPDATE friendships SET status = 'accepted' WHERE id = ?", [$existing['id']]);
                Http::json(['ok' => true, 'auto_accepted' => true]);
            }
            Http::error(409, 'already_requested');
        }

        Database::insert(
            "INSERT INTO friendships (requester_id, addressee_id, status, created_at) VALUES (?, ?, 'pending', UTC_TIMESTAMP())",
            [$meId, $targetId]
        );
        Http::json(['ok' => true]);
    }

    public static function accept(array $params): void
    {
        $me = Auth::requireUser();
        $friendship = Database::one(
            "SELECT * FROM friendships WHERE id = ? AND addressee_id = ? AND status = 'pending'",
            [(int) $params['id'], $me['id']]
        );
        if ($friendship === null) {
            Http::error(404, 'friendship_not_found');
        }
        Database::run("UPDATE friendships SET status = 'accepted' WHERE id = ?", [$friendship['id']]);
        Http::json(['ok' => true]);
    }

    public static function remove(array $params): void
    {
        $me = Auth::requireUser();
        Database::run(
            'DELETE FROM friendships WHERE id = ? AND (requester_id = ? OR addressee_id = ?)',
            [(int) $params['id'], $me['id'], $me['id']]
        );
        Http::json(['ok' => true]);
    }

    // -------------------------------------------------------------- private DM

    public static function messages(array $params): void
    {
        $me = Auth::requireUser();
        $other = (int) $params['id'];
        self::assertCanDm((int) $me['id'], $other);

        $afterId = (int) (Http::query('after_id') ?? 0);
        $rows = Database::all(
            'SELECT m.id, m.body, m.created_at, m.sender_id,
                    u.email AS user_email, u.first_name AS user_first_name, u.last_name AS user_last_name,
                    u.name AS user_name, u.avatar_file_id AS user_avatar_file_id, u.last_seen_at AS user_last_seen_at,
                    f.id AS f_id, f.original_name AS f_name, f.mime_type AS f_mime, f.size AS f_size
             FROM dm_messages m
             JOIN users u ON u.id = m.sender_id
             LEFT JOIN files f ON f.id = m.file_id
             WHERE ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
               AND m.id > ?
             ORDER BY m.id ASC LIMIT 300',
            [$me['id'], $other, $other, $me['id'], $afterId]
        );

        $messages = array_map(function (array $r) use ($me) {
            return [
                'id' => (int) $r['id'],
                'body' => $r['body'],
                'created_at' => $r['created_at'],
                'mine' => (int) $r['sender_id'] === (int) $me['id'],
                'user' => Shape::user($r),
                'file' => Shape::file([
                    'id' => $r['f_id'], 'original_name' => $r['f_name'],
                    'mime_type' => $r['f_mime'], 'size' => $r['f_size'],
                ]),
            ];
        }, $rows);

        Http::json(['ok' => true, 'messages' => $messages]);
    }

    public static function send(array $params, array $config): void
    {
        $me = Auth::requireUser();
        $other = (int) $params['id'];
        self::assertCanDm((int) $me['id'], $other);

        $text = trim((string) (Http::body()['body'] ?? ''));
        $fileRow = null;
        if (isset($_FILES['file']) && is_array($_FILES['file'])
            && ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
            $maxBytes = (int) ($config['app']['upload_max_bytes'] ?? 10 * 1024 * 1024);
            $fileRow = Files::store($_FILES['file'], null, (int) $me['id'], $maxBytes);
        }
        if ($text === '' && $fileRow === null) {
            Http::error(422, 'empty_message');
        }
        if (mb_strlen($text) > 8000) {
            Http::error(422, 'message_too_long');
        }

        $messageId = Database::insert(
            'INSERT INTO dm_messages (sender_id, receiver_id, body, file_id, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())',
            [$me['id'], $other, $text !== '' ? $text : null, $fileRow['id'] ?? null]
        );

        $row = Database::one(
            'SELECT m.id, m.body, m.created_at, m.sender_id,
                    u.email AS user_email, u.first_name AS user_first_name, u.last_name AS user_last_name,
                    u.name AS user_name, u.avatar_file_id AS user_avatar_file_id, u.last_seen_at AS user_last_seen_at,
                    f.id AS f_id, f.original_name AS f_name, f.mime_type AS f_mime, f.size AS f_size
             FROM dm_messages m
             JOIN users u ON u.id = m.sender_id
             LEFT JOIN files f ON f.id = m.file_id
             WHERE m.id = ?',
            [$messageId]
        );

        Http::json(['ok' => true, 'message' => [
            'id' => (int) $row['id'],
            'body' => $row['body'],
            'created_at' => $row['created_at'],
            'mine' => (int) $row['sender_id'] === (int) $me['id'],
            'user' => Shape::user($row),
            'file' => Shape::file([
                'id' => $row['f_id'], 'original_name' => $row['f_name'],
                'mime_type' => $row['f_mime'], 'size' => $row['f_size'],
            ]),
        ]]);
    }

    // ------------------------------------------------------------- helpers

    private const USERSEL = 'u.id, u.email, u.first_name, u.last_name, u.name, u.avatar_file_id, u.last_seen_at';

    private static function friendShape(array $r): array
    {
        $user = Shape::user($r);
        return [
            'friendship_id' => (int) $r['friendship_id'],
            'status' => $r['fr_status'],
            'user' => $user,
        ];
    }

    /** DM is allowed between friends and between users sharing a team or project. */
    private static function assertCanDm(int $me, int $other): void
    {
        if ($me === $other) {
            return;
        }
        $row = Database::one(
            "SELECT (
                (SELECT COUNT(*) FROM friendships
                 WHERE status = 'accepted'
                   AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)))
              + (SELECT COUNT(*) FROM team_members x JOIN team_members y ON x.team_id = y.team_id
                 WHERE x.user_id = ? AND y.user_id = ?)
              + (SELECT COUNT(*) FROM project_members x JOIN project_members y ON x.project_id = y.project_id
                 WHERE x.user_id = ? AND y.user_id = ?)
            ) AS c",
            [$me, $other, $other, $me, $me, $other, $me, $other]
        );
        if ((int) ($row['c'] ?? 0) === 0) {
            Http::error(403, 'forbidden');
        }
    }
}
