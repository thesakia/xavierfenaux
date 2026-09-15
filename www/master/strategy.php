<?php
declare(strict_types=1);

require __DIR__ . '/auth.php';

master_require_login();

$strategyPath = __DIR__ . '/../dashboard/strategy/strategie_x_xfenaux_v7_source.html';

if (!is_file($strategyPath)) {
    http_response_code(404);
    echo '<!doctype html><meta charset="utf-8"><title>Strategie indisponible</title><p>La strategie X est introuvable sur ce serveur.</p>';
    exit;
}

header('Content-Type: text/html; charset=utf-8');
readfile($strategyPath);

