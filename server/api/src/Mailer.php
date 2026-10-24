<?php

declare(strict_types=1);

/**
 * Email delivery through the Resend API (https://resend.com).
 *
 * Development fallback: with an empty/placeholder api_key, emails are written
 * to api/storage/outbox/*.html instead of being sent — open one and click the
 * login link to test the full flow without any mail credentials.
 */
final class Mailer
{
    /** @param array{resend?: array{api_key?: string, from?: string}} $config */
    public static function send(string $to, string $subject, string $html, array $config): array
    {
        $apiKey = trim((string) ($config['resend']['api_key'] ?? ''));
        if ($apiKey === '' || str_contains($apiKey, 'CHANGE_ME')) {
            return self::devOutbox($to, $subject, $html);
        }

        $payload = json_encode([
            'from'    => (string) ($config['resend']['from'] ?? ''),
            'to'      => [$to],
            'subject' => $subject,
            'html'    => $html,
        ], JSON_UNESCAPED_UNICODE);

        $ch = curl_init('https://api.resend.com/emails');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $apiKey,
                'Content-Type: application/json',
            ],
            CURLOPT_TIMEOUT        => 15,
        ]);
        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false || $status >= 300) {
            error_log('[hamkar] resend failed: status=' . $status . ' err=' . $curlError . ' body=' . (string) $response);
            Http::error(502, 'mail_delivery_failed');
        }

        return ['ok' => true];
    }

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
