<?php
declare(strict_types=1);

const MASTER_USERNAME = 'xav';
const MASTER_PASSWORD_SHA256 = 'c98cfe04b188b1d23bb6d1c503bbea2f51772d9bd5208ab512aed9367520ccec';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_name('xavier_master');
    session_start([
        'cookie_httponly' => true,
        'cookie_secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'cookie_samesite' => 'Lax',
    ]);
}

function master_is_logged_in(): bool
{
    return isset($_SESSION['master_user']) && $_SESSION['master_user'] === MASTER_USERNAME;
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

