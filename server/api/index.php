<?php

/**
 * Hamkar API — front controller.
 *
 * Every request under /api/ (except real files) is routed here by .htaccess.
 * Add new routes in the route table below; keep logic inside src/Controllers.
 */

declare(strict_types=1);

require __DIR__ . '/src/Http.php';
require __DIR__ . '/src/Router.php';
require __DIR__ . '/src/Database.php';
require __DIR__ . '/src/Auth.php';
require __DIR__ . '/src/Mailer.php';
require __DIR__ . '/src/Files.php';
foreach (glob(__DIR__ . '/src/Controllers/*.php') ?: [] as $controllerFile) {
    require $controllerFile;
}

date_default_timezone_set('UTC');
Http::cors();

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
    Http::error(500, 'config.php is missing — copy config.example.php to config.php and fill it in.');
}
/** @var array $config */
$config = require $configFile;

set_exception_handler(function (Throwable $e) use ($config): void {
    error_log('[hamkar] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    Http::error(500, !empty($config['app']['debug']) ? $e->getMessage() : 'server_error');
});

Database::init($config['db']);

// ------------------------------------------------------------------ routes

Router::add('GET', '', fn () => Http::json(['ok' => true, 'service' => 'hamkar-api', 'time' => gmdate('c')]));

// auth
Router::add('POST', 'auth/request', fn ($p) => AuthController::request($config));
Router::add('GET', 'auth/poll', fn ($p) => AuthController::poll());
Router::add('GET', 'auth/verify', fn ($p) => AuthController::verify());
Router::add('POST', 'auth/logout', fn ($p) => AuthController::logout());
Router::add('GET', 'me', fn ($p) => AuthController::me());

// teams
Router::add('GET', 'teams', fn ($p) => TeamController::index());
Router::add('POST', 'teams', fn ($p) => TeamController::create());
Router::add('POST', 'teams/join', fn ($p) => TeamController::join());
Router::add('GET', 'invites', fn ($p) => TeamController::myInvites());
Router::add('POST', 'invites/{id}/accept', fn ($p) => TeamController::acceptInvite($p));
Router::add('GET', 'teams/{id}', fn ($p) => TeamController::show($p));
Router::add('POST', 'teams/{id}/invite', fn ($p) => TeamController::invite($p));

// projects
Router::add('GET', 'projects', fn ($p) => ProjectController::index());
Router::add('POST', 'projects', fn ($p) => ProjectController::create());
Router::add('GET', 'projects/{id}', fn ($p) => ProjectController::show($p));

// tasks
Router::add('GET', 'projects/{id}/tasks', fn ($p) => TaskController::listForProject($p));
Router::add('POST', 'projects/{id}/tasks', fn ($p) => TaskController::create($p));
Router::add('PATCH', 'tasks/{id}', fn ($p) => TaskController::update($p));

// chat
Router::add('GET', 'projects/{id}/messages', fn ($p) => ChatController::messages($p));
Router::add('POST', 'projects/{id}/messages', fn ($p) => ChatController::send($p, $config));

// media (private, authenticated streaming)
Router::add('GET', 'media/{id}', fn ($p) => MediaController::get($p));

Router::dispatch();
