<?php

declare(strict_types=1);

/**
 * Update proxy: the extension polls our own API (always reachable) instead of
 * api.github.com (blocked on many user networks, and /releases/latest 404s for
 * prerelease-only repos). The host fetches GitHub server-side with a cache.
 */
final class UpdateController
{
    private const REPO = 'pedramgholizadeh/hamkar-chrome';
    private const CACHE_SECONDS = 300;

    public static function latest(): void
    {
        Http::json(['ok' => true, 'release' => self::fetchRelease()]);
    }

    /** Stream the latest release zip through this server. */
    public static function download(): void
    {
        $release = self::fetchRelease();
        if ($release === null || empty($release['zip'])) {
            Http::error(404, 'update_not_found');
        }

        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="hamkar-extension-' . $release['version'] . '.zip"');
        header('X-Content-Type-Options: nosniff');

        $out = fopen('php://output', 'w');
        $ch = curl_init($release['zip']);
        curl_setopt_array($ch, [
            CURLOPT_FILE           => $out,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_USERAGENT      => 'hamkar-updater',
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_TIMEOUT        => 180,
        ]);
        curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        fclose($out);

        if ($status !== 200) {
            error_log('[hamkar-update] zip download failed http=' . $status);
        }
        exit;
    }

    // ------------------------------------------------------------- helpers

    private static function fetchRelease(): ?array
    {
        $cacheDir = __DIR__ . '/../storage';
        if (!is_dir($cacheDir)) {
            @mkdir($cacheDir, 0775, true);
        }
        $cacheFile = $cacheDir . '/release-cache.json';

        if (is_file($cacheFile) && time() - (int) filemtime($cacheFile) < self::CACHE_SECONDS) {
            $cached = json_decode((string) file_get_contents($cacheFile), true);
            if (is_array($cached)) {
                return $cached;
            }
        }

        $body = self::ghGet('https://api.github.com/repos/' . self::REPO . '/releases?per_page=5');
        if ($body === null) {
            // stale cache is better than nothing
            if (is_file($cacheFile)) {
                $cached = json_decode((string) file_get_contents($cacheFile), true);
                return is_array($cached) ? $cached : null;
            }
            return null;
        }

        $releases = json_decode($body, true);
        $rel = is_array($releases) && isset($releases[0]) ? $releases[0] : null;
        if ($rel === null) {
            return null;
        }

        $zip = null;
        foreach ((array) ($rel['assets'] ?? []) as $asset) {
            if (str_ends_with((string) ($asset['name'] ?? ''), '.zip')) {
                $zip = $asset['browser_download_url'];
                break;
            }
        }

        $out = [
            'version' => ltrim((string) ($rel['tag_name'] ?? ''), 'v'),
            'tag' => (string) ($rel['tag_name'] ?? ''),
            'commit' => substr((string) ($rel['target_commitish'] ?? ''), 0, 7),
            'published_at' => $rel['published_at'] ?? null,
            'prerelease' => (bool) ($rel['prerelease'] ?? false),
            'zip' => $zip,
        ];
        @file_put_contents($cacheFile, json_encode($out, JSON_UNESCAPED_SLASHES));
        return $out;
    }

    private static function ghGet(string $url): ?string
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_USERAGENT      => 'hamkar-updater',
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_TIMEOUT        => 15,
        ]);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return ($body === false || $status !== 200) ? null : (string) $body;
    }
}
