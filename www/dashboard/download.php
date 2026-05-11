<?php
declare(strict_types=1);
require __DIR__ . '/auth.php';
dashboard_require_auth(false);

$file = basename((string) ($_GET['file'] ?? ''));
$path = __DIR__ . '/documents/' . $file;

if ($file === '' || !is_file($path)) {
    http_response_code(404);
    echo 'Fichier introuvable';
    exit;
}

header('Content-Type: application/octet-stream');
header('Content-Length: ' . (string) filesize($path));
header('Content-Disposition: attachment; filename="' . addslashes($file) . '"');
readfile($path);
