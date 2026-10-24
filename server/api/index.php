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
require __DIR__ . '/src/Shape.php';
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

// auth & profile
Router::add('POST', 'auth/start', fn ($p) => AuthController::start($config));
Router::add('POST', 'auth/login', fn ($p) => AuthController::login());
Router::add('POST', 'auth/otp/verify', fn ($p) => AuthController::verifyOtp());
Router::add('POST', 'auth/password', fn ($p) => AuthController::setPassword());
Router::add('POST', 'auth/logout', fn ($p) => AuthController::logout());
Router::add('GET', 'me', fn ($p) => ProfileController::me());
Router::add('PATCH', 'me', fn ($p) => ProfileController::update());
Router::add('POST', 'me/avatar', fn ($p) => ProfileController::avatar($p, $config));

// teams
Router::add('GET', 'teams', fn ($p) => TeamController::index());
Router::add('POST', 'teams', fn ($p) => TeamController::create());
Router::add('POST', 'teams/join', fn ($p) => TeamController::join());
Router::add('GET', 'invites', fn ($p) => TeamController::myInvites());
Router::add('POST', 'invites/{id}/accept', fn ($p) => TeamController::acceptInvite($p));
Router::add('GET', 'teams/{id}', fn ($p) => TeamController::show($p));
Router::add('PATCH', 'teams/{id}', fn ($p) => TeamController::update($p));
Router::add('POST', 'teams/{id}/logo', fn ($p) => TeamController::logo($p, $config));
Router::add('POST', 'teams/{id}/invite', fn ($p) => TeamController::invite($p));

// team skills (Skill.md sharing)
Router::add('GET', 'teams/{id}/skills', fn ($p) => SkillsController::index($p));
Router::add('POST', 'teams/{id}/skills', fn ($p) => SkillsController::create($p, $config));
Router::add('GET', 'skills/{id}', fn ($p) => SkillsController::show($p));
Router::add('PATCH', 'skills/{id}', fn ($p) => SkillsController::update($p, $config));
Router::add('DELETE', 'skills/{id}', fn ($p) => SkillsController::delete($p));

// google meet rooms
Router::add('GET', 'teams/{id}/meetings', fn ($p) => MeetingController::index($p));
Router::add('POST', 'teams/{id}/meetings', fn ($p) => MeetingController::create($p));
Router::add('POST', 'meetings/{id}/join', fn ($p) => MeetingController::join($p));
Router::add('POST', 'meetings/{id}/end', fn ($p) => MeetingController::end($p));

// friends & private DM
Router::add('GET', 'friends', fn ($p) => FriendController::index());
Router::add('POST', 'friends/request', fn ($p) => FriendController::request());
Router::add('POST', 'friends/{id}/accept', fn ($p) => FriendController::accept($p));
Router::add('DELETE', 'friends/{id}', fn ($p) => FriendController::remove($p));
Router::add('GET', 'dm/{id}/messages', fn ($p) => FriendController::messages($p));
Router::add('POST', 'dm/{id}/messages', fn ($p) => FriendController::send($p, $config));

// projects
Router::add('GET', 'projects', fn ($p) => ProjectController::index());
Router::add('POST', 'projects', fn ($p) => ProjectController::create());
Router::add('GET', 'projects/{id}', fn ($p) => ProjectController::show($p));
Router::add('PATCH', 'projects/{id}', fn ($p) => ProjectController::update($p));
Router::add('GET', 'projects/{id}/phases', fn ($p) => ProjectController::phases($p));
Router::add('POST', 'projects/{id}/phases', fn ($p) => ProjectController::createPhase($p));
Router::add('DELETE', 'phases/{id}', fn ($p) => ProjectController::deletePhase($p));
Router::add('GET', 'projects/{id}/versions', fn ($p) => ProjectController::versions($p));
Router::add('POST', 'projects/{id}/versions', fn ($p) => ProjectController::createVersion($p));
Router::add('DELETE', 'versions/{id}', fn ($p) => ProjectController::deleteVersion($p));
Router::add('DELETE', 'projects/{id}', fn ($p) => ProjectController::destroy($p));
Router::add('POST', 'projects/{id}/code', fn ($p) => ProjectController::rotateCode($p));
Router::add('POST', 'projects/join', fn ($p) => ProjectController::joinByCode());

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
