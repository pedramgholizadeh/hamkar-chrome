<?php

declare(strict_types=1);

/**
 * Email delivery with dual transport:
 *
 *   1. Resend API (preferred, needs a verified domain + api_key)
 *   2. PHP mail() via the host's own mail server (automatic fallback —
 *      always reachable, since it is local to the hosting machine)
 *
 * Development fallback: with an empty/placeholder api_key, emails are
 * written to api/storage/outbox/*.html instead of being sent.
 */
final class Mailer
{
    /** @param array{resend?: array{api_key?: string, from?: string}, app?: array{base_url?: string}} $config */
    public static function send(string $to, string $subject, string $html, array $config): array
    {
        $apiKey = trim((string) ($config['resend']['api_key'] ?? ''));
        if ($apiKey === '' || str_contains($apiKey, 'CHANGE_ME')) {
            return self::devOutbox($to, $subject, $html);
        }

        $result = self::viaResend($to, $subject, $html, $config);
        if (isset($result['ok'])) {
            return $result;
        }

        error_log('[hamkar] resend unavailable (' . $result['error'] . ') — falling back to mail()');
        return self::viaPhpMail($to, $subject, $html, $config);
    }

    // ------------------------------------------------------------- resend

    private static function viaResend(string $to, string $subject, string $html, array $config): array
    {
        $payload = json_encode([
            'from'    => (string) ($config['resend']['from'] ?? ''),
            'to'      => [$to],
            'subject' => $subject,
            'html'    => $html,
        ], JSON_UNESCAPED_UNICODE);

        // short timeouts: if the host cannot reach Resend, fall back fast
        $ch = curl_init('https://api.resend.com/emails');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . trim((string) ($config['resend']['api_key'] ?? '')),
                'Content-Type: application/json',
            ],
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT        => 8,
        ]);
        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            return ['error' => 'curl: ' . $curlError];
        }
        if ($status >= 300) {
            error_log('[hamkar] resend http ' . $status . ': ' . (string) $response);
            // 4xx = real API problem (auth/domain) — report precisely
            $body = json_decode((string) $response, true);
            $message = strtolower((string) ($body['message'] ?? ''));
            if ($status === 401) {
                Http::error(502, 'mail_auth_failed');
            }
            if ($status === 403 || ($status === 422 && str_contains($message, 'domain'))) {
                Http::error(502, 'mail_domain_not_verified');
            }
            if ($status === 422 && str_contains($message, 'from')) {
                Http::error(502, 'mail_invalid_from');
            }
            return ['error' => 'http ' . $status];
        }
        return ['ok' => true, 'transport' => 'resend'];
    }

    // ------------------------------------------------------ host mail()

    private static function viaPhpMail(string $to, string $subject, string $html, array $config): array
    {
        $host = parse_url((string) ($config['app']['base_url'] ?? ''), PHP_URL_HOST) ?: 'localhost';
        $headers = "MIME-Version: 1.0\r\n"
            . "Content-Type: text/html; charset=UTF-8\r\n"
            . "From: Hamkar <no-reply@{$host}>\r\n";

        $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        if (!@mail($to, $encodedSubject, $html, $headers)) {
            Http::error(502, 'mail_delivery_failed');
        }
        return ['ok' => true, 'transport' => 'mail'];
    }

    // ------------------------------------------------------------- dev outbox

    private static function devOutbox(string $to, string $subject, string $html): array
    {
        $dir = __DIR__ . '/../storage/outbox';
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
            file_put_contents($dir . '/.htaccess', "Require all denied\n");
        }
        $safe = preg_replace('/[^a-z0-9]+/i', '_', $to);
        file_put_contents(
            sprintf('%s/%s-%s.html', $dir, gmdate('Ymd-His'), $safe),
            "<!-- to: {$to} | subject: {$subject} -->\n" . $html
        );
        return ['ok' => true, 'dev' => true];
    }
}
