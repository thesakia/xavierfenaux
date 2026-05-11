<?php
declare(strict_types=1);

const DASHBOARD_USERS = [
    'xfenaux@gmail.com',
    'fenauxft@gmail.com',
];

const DASHBOARD_PASSWORD_SHA256 = '43d958a31912b52b8ad6d4c0f440d96b5784fb074df5df4be97c865319bc00e5';

function dashboard_start_session(): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_name('xavier_dashboard');
        session_start();
    }
}

function dashboard_is_authenticated(): bool
{
    dashboard_start_session();
    return isset($_SESSION['dashboard_user']) && in_array($_SESSION['dashboard_user'], DASHBOARD_USERS, true);
}

function dashboard_require_auth(bool $json = false): void
{
    if (dashboard_is_authenticated()) {
        return;
    }

    if ($json) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => 'Authentication required']);
        exit;
    }

    header('Location: /dashboard/login.php');
    exit;
}

function dashboard_login(string $email, string $password): bool
{
    dashboard_start_session();
    $email = strtolower(trim($email));
    $passwordHash = hash('sha256', $password);

    if (!in_array($email, DASHBOARD_USERS, true)) {
        return false;
    }

    if (!hash_equals(DASHBOARD_PASSWORD_SHA256, $passwordHash)) {
        return false;
    }

    session_regenerate_id(true);
    $_SESSION['dashboard_user'] = $email;
    return true;
}

function dashboard_logout(): void
{
    dashboard_start_session();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], (bool) $params['secure'], (bool) $params['httponly']);
    }
    session_destroy();
}

function dashboard_current_user(): string
{
    dashboard_start_session();
    return (string) ($_SESSION['dashboard_user'] ?? '');
}
