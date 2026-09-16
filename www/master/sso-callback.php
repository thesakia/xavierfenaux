<?php
declare(strict_types=1);
require __DIR__ . '/access-lib.php';
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
if (($_SERVER['MASTER_SSO_CALLBACK'] ?? '') !== '1') { http_response_code(404); exit; }
try {
    $grant=master_access_exchange((string)($_GET['ticket'] ?? ''), strtolower($_SERVER['HTTP_HOST'] ?? ''));
    master_access_cookie(MASTER_BRIDGE_COOKIE, $grant['token'], $grant['expires']);
    header('Location: ' . $grant['path']);
} catch (Throwable $error) {
    http_response_code(401);
    echo '<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connexion expirée</title><p>Cette connexion a expiré.</p><a href="https://xavierfenaux.com/master/launch.php?tool=ivt-radar">Revenir à mon espace</a></html>';
}
