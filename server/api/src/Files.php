<?php

declare(strict_types=1);

/**
 * Uploads live in hamkar/media (outside the API folder). Direct web access is
 * blocked by media/.htaccess — files are only streamed through the
 * authenticated endpoint /api/media/{id}.
 */
final class Files
{
    public static function mediaDir(): string
    {
        // hamkar/api/src/Files.php -> hamkar/media
        return dirname(__DIR__, 2) . '/media';
    }

    private static function extFor(string $mime, string $originalName): string
    {
        $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if ($ext !== '' && strlen($ext) <= 8 && preg_match('/^[a-z0-9]+$/', $ext)) {
            return '.' . $ext;
        }
        return match ($mime) {
            'image/png'       => '.png',
            'image/jpeg'      => '.jpg',
            'image/gif'       => '.gif',
            'image/webp'      => '.webp',
            'application/pdf' => '.pdf',
            'text/plain'      => '.txt',
            default           => '',
        };
    }

    /** Validate + persist an uploaded file and create its DB row. */
    public static function store(array $upload, int $projectId, int $uploaderId, int $maxBytes): array
    {
        if (($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            Http::error(400, 'upload_failed');
        }
        if ((int) $upload['size'] <= 0) {
            Http::error(400, 'empty_file');
        }
        if ((int) $upload['size'] > $maxBytes) {
            Http::error(413, 'file_too_large');
        }

        $mime = (string) (mime_content_type((string) $upload['tmp_name']) ?: 'application/octet-stream');
        $subDir = gmdate('Y/m');
        $dir = self::mediaDir() . '/' . $subDir;
        if (!is_dir($dir) && !mkdir($dir, 0775, true)) {
            Http::error(500, 'storage_error');
        }

        $storedPath = $subDir . '/' . bin2hex(random_bytes(16)) . self::extFor($mime, (string) $upload['name']);
        if (!move_uploaded_file((string) $upload['tmp_name'], self::mediaDir() . '/' . $storedPath)) {
            Http::error(500, 'storage_error');
        }

        $id = Database::insert(
            'INSERT INTO files (project_id, uploader_id, stored_path, original_name, mime_type, size, created_at)
             VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
            [
                $projectId,
                $uploaderId,
                $storedPath,
                mb_substr(trim((string) $upload['name']), 0, 255) ?: 'file',
                $mime,
                (int) $upload['size'],
            ]
        );

        return (array) self::row($id);
    }

    public static function row(int $id): ?array
    {
        return Database::one(
            'SELECT id, project_id, original_name, mime_type, size, created_at FROM files WHERE id = ?',
            [$id]
        );
    }

    /** Stream a stored file to an authorized user (never a direct web URL). */
    public static function stream(array $file): never
    {
        $path = self::mediaDir() . '/' . $file['stored_path'];
        if (!is_file($path)) {
            Http::error(404, 'file_missing');
        }

        $mime = (string) $file['mime_type'];
        $inline = str_starts_with($mime, 'image/')
            || str_starts_with($mime, 'audio/')
            || str_starts_with($mime, 'video/')
            || $mime === 'application/pdf';
        $name = str_replace(["\r", "\n", '"'], '', (string) $file['original_name']);
        $asciiName = preg_replace('/[^A-Za-z0-9._-]/', '_', $name) ?: 'file';

        header('Content-Type: ' . $mime);
        header('Content-Length: ' . (string) filesize($path));
        header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment')
            . '; filename="' . $asciiName . '"; filename*=UTF-8\'\'' . rawurlencode($name));
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: private, max-age=86400');

        readfile($path);
        exit;
    }
}
