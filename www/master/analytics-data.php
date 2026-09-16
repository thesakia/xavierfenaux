<?php
declare(strict_types=1);
require __DIR__ . '/auth.php';
require __DIR__ . '/analytics-report.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
if (!master_is_logged_in()) {
    http_response_code(401);
    echo json_encode(['error' => 'Connexion requise.']);
    exit;
}
session_write_close();
try {
    echo json_encode(master_analytics_report(), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
} catch (Throwable $error) {
    http_response_code(503);
    echo json_encode(['error' => 'Le relevé du site est indisponible. Réessaie dans quelques minutes.']);
}
