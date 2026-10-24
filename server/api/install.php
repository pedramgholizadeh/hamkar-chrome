<?php

/**
 * Hamkar — one-shot installer.
 *
 * Creates all tables (CREATE TABLE IF NOT EXISTS, safe to re-run) and the
 * media folder. Open  https://…/hamkar/api/install.php  once after upload.
 */

declare(strict_types=1);

require __DIR__ . '/src/Database.php';

date_default_timezone_set('UTC');

header('Content-Type: text/html; charset=utf-8');

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
    http_response_code(500);
    exit('<p dir="rtl" style="font-family:Tahoma">فایل <code>config.php</code> پیدا نشد. اول از <code>config.example.php</code> یک نسخه بساز و اطلاعات دیتابیس را داخلش بنویس.</p>');
}

$config = require $configFile;

try {
    Database::init($config['db']);
} catch (Throwable $e) {
    http_response_code(500);
    exit('<p dir="rtl" style="font-family:Tahoma">اتصال به دیتابیس ناموفق بود: <code>' . htmlspecialchars($e->getMessage(), ENT_QUOTES) . '</code></p>');
}

$tables = [
    'users' => <<<'SQL'
        CREATE TABLE IF NOT EXISTS users (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          email VARCHAR(190) NOT NULL,
          name VARCHAR(120) DEFAULT NULL,
          created_at DATETIME NOT NULL,
          last_login_at DATETIME DEFAULT NULL,
          UNIQUE KEY uq_users_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        SQL,
    'auth_requests' => <<<'SQL'
        CREATE TABLE IF NOT EXISTS auth_requests (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          email VARCHAR(190) NOT NULL,
          request_id CHAR(36) NOT NULL,
          token CHAR(64) NOT NULL,
          status ENUM('pending','approved','used','expired') NOT NULL DEFAULT 'pending',
          created_at DATETIME NOT NULL,
          expires_at DATETIME NOT NULL,
          UNIQUE KEY uq_auth_request_id (request_id),
          UNIQUE KEY uq_auth_token (token),
          KEY ix_auth_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        SQL,
    'sessions' => <<<'SQL'
        CREATE TABLE IF NOT EXISTS sessions (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          user_id BIGINT UNSIGNED NOT NULL,
          token_hash CHAR(64) NOT NULL,
          created_at DATETIME NOT NULL,
          UNIQUE KEY uq_sessions_token (token_hash),
          CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        SQL,
    'teams' => <<<'SQL'
        CREATE TABLE IF NOT EXISTS teams (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(120) NOT NULL,
          owner_id BIGINT UNSIGNED NOT NULL,
          invite_code CHAR(10) NOT NULL,
          created_at DATETIME NOT NULL,
          UNIQUE KEY uq_teams_code (invite_code),
          CONSTRAINT fk_teams_owner FOREIGN KEY (owner_id) REFERENCES users (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        SQL,
    'team_members' => <<<'SQL'
        CREATE TABLE IF NOT EXISTS team_members (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          team_id BIGINT UNSIGNED NOT NULL,
          user_id BIGINT UNSIGNED NOT NULL,
          role ENUM('owner','admin','member') NOT NULL DEFAULT 'member',
          joined_at DATETIME NOT NULL,
          UNIQUE KEY uq_team_member (team_id, user_id),
          CONSTRAINT fk_tm_team FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
          CONSTRAINT fk_tm_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        SQL,
    'team_invites' => <<<'SQL'
        CREATE TABLE IF NOT EXISTS team_invites (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          team_id BIGINT UNSIGNED NOT NULL,
          email VARCHAR(190) NOT NULL,
          invited_by BIGINT UNSIGNED NOT NULL,
          status ENUM('pending','accepted') NOT NULL DEFAULT 'pending',
          created_at DATETIME NOT NULL,
          UNIQUE KEY uq_team_invite (team_id, email),
          CONSTRAINT fk_ti_team FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        SQL,
    'projects' => <<<'SQL'
        CREATE TABLE IF NOT EXISTS projects (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          owner_id BIGINT UNSIGNED NOT NULL,
          team_id BIGINT UNSIGNED DEFAULT NULL,
          name VARCHAR(160) NOT NULL,
          description TEXT DEFAULT NULL,
          created_at DATETIME NOT NULL,
          KEY ix_projects_team (team_id),
          CONSTRAINT fk_projects_owner FOREIGN KEY (owner_id) REFERENCES users (id),
          CONSTRAINT fk_projects_team FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        SQL,
    'tasks' => <<<'SQL'
        CREATE TABLE IF NOT EXISTS tasks (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          project_id BIGINT UNSIGNED NOT NULL,
          title VARCHAR(255) NOT NULL,
          assignee_id BIGINT UNSIGNED DEFAULT NULL,
          created_by BIGINT UNSIGNED NOT NULL,
          done TINYINT(1) NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL,
          done_at DATETIME DEFAULT NULL,
          KEY ix_tasks_project (project_id),
          CONSTRAINT fk_tasks_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        SQL,
    'messages' => <<<'SQL'
        CREATE TABLE IF NOT EXISTS messages (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          project_id BIGINT UNSIGNED NOT NULL,
          user_id BIGINT UNSIGNED NOT NULL,
          body TEXT DEFAULT NULL,
          file_id BIGINT UNSIGNED DEFAULT NULL,
          created_at DATETIME NOT NULL,
          KEY ix_messages_project (project_id, id),
          CONSTRAINT fk_messages_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
          CONSTRAINT fk_messages_user FOREIGN KEY (user_id) REFERENCES users (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        SQL,
    'files' => <<<'SQL'
        CREATE TABLE IF NOT EXISTS files (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          project_id BIGINT UNSIGNED NOT NULL,
          uploader_id BIGINT UNSIGNED NOT NULL,
          stored_path VARCHAR(255) NOT NULL,
          original_name VARCHAR(255) NOT NULL,
          mime_type VARCHAR(120) NOT NULL,
          size BIGINT UNSIGNED NOT NULL,
          created_at DATETIME NOT NULL,
          UNIQUE KEY uq_files_path (stored_path),
          KEY ix_files_project (project_id),
          CONSTRAINT fk_files_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        SQL,
];

$results = [];
foreach ($tables as $name => $sql) {
    try {
        Database::run($sql);
        $results[] = [$name, true, ''];
    } catch (Throwable $e) {
        $results[] = [$name, false, $e->getMessage()];
    }
}

// media folder must exist and keep its protective .htaccess
$mediaDir = dirname(__DIR__) . '/media';
if (!is_dir($mediaDir)) {
    mkdir($mediaDir, 0775, true);
}
$htaccess = $mediaDir . '/.htaccess';
if (!is_file($htaccess)) {
    copy(__DIR__ . '/media.htaccess.dist', $htaccess);
}

echo '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>همکار — نصب</title></head>';
echo '<body style="font-family:Tahoma,sans-serif;background:#f1f5f9;padding:40px">';
echo '<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px">';
echo '<h1 style="color:#4f46e5;margin-top:0">🤝 نصب همکار</h1><ul style="line-height:2.2">';
foreach ($results as [$name, $ok, $err]) {
    echo $ok
        ? "<li>✅ جدول <code>{$name}</code> آماده است</li>"
        : "<li style='color:#e11d48'>❌ جدول <code>{$name}</code>: " . htmlspecialchars($err, ENT_QUOTES) . '</li>';
}
echo '</ul>';
$allOk = !in_array(false, array_column($results, 1), true);
echo $allOk
    ? '<p style="color:#059669"><b>همه‌چیز آماده است!</b> حالا اکستنشن را از پوشه‌ی <code>extension/</code> در کروم نصب کن.</p>'
    : '<p style="color:#e11d48">یک یا چند جدول ساخته نشد — دسترسی‌های کاربر دیتابیس را چک کن.</p>';
echo '<p style="color:#94a3b8;font-size:12px">این فایل idempotent است و می‌توانی بعد از نصب آن را حذف کنی.</p>';
echo '</div></body></html>';
