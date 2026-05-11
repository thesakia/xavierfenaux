<?php
declare(strict_types=1);
require __DIR__ . '/auth.php';
dashboard_require_auth(true);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$dir = __DIR__ . '/documents';
if (!is_dir($dir)) {
    mkdir($dir, 0755, true);
}

$allowed = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'md', 'png', 'jpg', 'jpeg', 'webp', 'html'];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_FILES['file']) || !is_uploaded_file($_FILES['file']['tmp_name'])) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Aucun fichier reçu']);
        exit;
    }

    $original = (string) $_FILES['file']['name'];
    $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
    if (!in_array($ext, $allowed, true)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Type de fichier non autorisé']);
        exit;
    }

    $base = preg_replace('/[^a-zA-Z0-9._-]+/', '-', pathinfo($original, PATHINFO_FILENAME));
    $base = trim((string) $base, '-._') ?: 'document';
    $name = $base . '-' . date('Ymd-His') . '.' . $ext;
    $target = $dir . '/' . $name;

    if (!move_uploaded_file($_FILES['file']['tmp_name'], $target)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Upload impossible']);
        exit;
    }
}

$documents = [];
foreach (scandir($dir) ?: [] as $file) {
    if ($file === '.' || $file === '..' || $file === '.htaccess') {
        continue;
    }
    $path = $dir . '/' . $file;
    if (!is_file($path)) {
        continue;
    }
    $documents[] = [
        'name' => $file,
        'size' => filesize($path) ?: 0,
        'updatedAt' => date(DATE_ATOM, filemtime($path) ?: time()),
        'url' => '/dashboard/download.php?file=' . rawurlencode($file),
    ];
}

usort($documents, static fn($a, $b) => strcmp($b['updatedAt'], $a['updatedAt']));
echo json_encode(['ok' => true, 'documents' => $documents], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
