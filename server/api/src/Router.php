<?php

declare(strict_types=1);

final class Router
{
    /** @var array<int, array{0: string, 1: string, 2: callable}> */
    private static array $routes = [];

    public static function add(string $method, string $pattern, callable $handler): void
    {
        self::$routes[] = [$method, trim($pattern, '/'), $handler];
    }

    /** Request path relative to the API folder, e.g. "teams/3/invite". */
    public static function path(): string
    {
        $scriptDir = rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? ''))), '/');
        $uri = (string) (parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/');

        $path = ($uri !== '/' && $scriptDir !== '' && str_starts_with($uri, $scriptDir))
            ? substr($uri, strlen($scriptDir))
            : $uri;

        return trim(trim($path, '/'));
    }

    public static function dispatch(): never
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $path = self::path();

        foreach (self::$routes as [$routeMethod, $pattern, $handler]) {
            if ($routeMethod !== $method) {
                continue;
            }
            $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', $pattern) . '$#';
            if (preg_match($regex, $path, $matches)) {
                $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);
                $handler($params);
                exit;
            }
        }

        Http::error(404, 'not_found');
    }
}
