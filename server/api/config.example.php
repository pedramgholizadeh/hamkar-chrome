<?php

/**
 * Hamkar — API configuration (template)
 *
 * 1) Copy this file to config.php   ->  cp config.example.php config.php
 * 2) Fill in the values below.
 *
 * NOTE: config.php is git-ignored. Never commit real credentials.
 */

declare(strict_types=1);

return [
    'db' => [
        'host'    => 'localhost',
        'name'    => 'hamkar',
        'user'    => 'hamkar_user',
        'pass'    => 'CHANGE_ME',
        'charset' => 'utf8mb4',
    ],

    'app' => [
        // Public URL of the hamkar folder on your host (no trailing slash).
        // Used to build the magic-link URL inside emails.
        'base_url' => 'https://apps.webiro.ir/hamkar',

        // Restrict sign-in to one email domain, e.g. 'webiro.ir'. null = any domain.
        'allowed_email_domain' => null,

        // Show detailed error messages (set false in production).
        'debug' => false,

        // Max upload size in bytes (10 MB default). Server php.ini limits still apply.
        'upload_max_bytes' => 10 * 1024 * 1024,
    ],

    'resend' => [
        // https://resend.com/api-keys
        'api_key' => 're_CHANGE_ME',

        // IMPORTANT: the from address must use a domain verified in Resend
        // (Domains tab). If you verified 'apps.webiro.ir' there, the address
        // must be something@apps.webiro.ir — otherwise Resend refuses to send.
        // Keep the "Name <email>" format with a space before the <.
        'from' => 'Hamkar <no-reply@apps.webiro.ir>',
    ],
];
