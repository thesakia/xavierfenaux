<?php
declare(strict_types=1);
require_once __DIR__ . '/access-lib.php';

const MASTER_USERNAME = 'xav';
const MASTER_PASSWORD_SHA256 = 'c98cfe04b188b1d23bb6d1c503bbea2f51772d9bd5208ab512aed9367520ccec';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_name('xavier_master');
    session_start([
        'cookie_httponly' => true,
        'cookie_secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'cookie_samesite' => 'Lax',
        'cookie_lifetime' => MASTER_ACCESS_SECONDS,
    ]);
}

function master_is_logged_in(): bool
{
    $access = master_access_current();
    if ($access) { $_SESSION['master_user'] = MASTER_USERNAME; $_SESSION['master_persistent'] = true; return true; }
    // Upgrade existing authenticated sessions once, without asking for the password again.
    if (($_SESSION['master_user'] ?? null) === MASTER_USERNAME && empty($_SESSION['master_persistent'])) {
        master_access_create(); $_SESSION['master_persistent'] = true; return true;
    }
    unset($_SESSION['master_user']);
    return false;
}

function master_login(): void {
    session_regenerate_id(true);
    $previous = master_access_current();
    if ($previous) master_access_revoke($previous['id']);
    master_access_create();
    $_SESSION['master_user'] = MASTER_USERNAME;
    $_SESSION['master_persistent'] = true;
}

function master_logout(): void {
    $access = master_access_current();
    if ($access) master_access_revoke($access['id']);
    master_access_cookie(MASTER_ACCESS_COOKIE, '', time()-3600);
    $_SESSION=[];
    session_destroy();
}

function master_verify_login(string $username, string $password): bool
{
    return hash_equals(MASTER_USERNAME, $username)
        && hash_equals(MASTER_PASSWORD_SHA256, hash('sha256', $password));
}

function master_require_login(): void
{
    if (!master_is_logged_in()) {
        header('Location: /master/');
        exit;
    }
}
