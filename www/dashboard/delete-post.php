<?php
declare(strict_types=1);
require __DIR__ . '/auth.php';
dashboard_require_auth(true);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function latest_strategy_file(string $dir): ?string
{
    if (!is_dir($dir)) {
        return null;
    }

    $files = [];
    foreach (scandir($dir) ?: [] as $file) {
        $path = $dir . DIRECTORY_SEPARATOR . $file;
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        if (is_file($path) && in_array($ext, ['html', 'htm'], true)) {
            $files[$path] = filemtime($path) ?: 0;
        }
    }

    if (!$files) {
        return null;
    }

    arsort($files);
    return (string) array_key_first($files);
}

$payload = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Payload JSON invalide']);
    exit;
}

$id = (string) ($payload['id'] ?? '');
if (!preg_match('/^P\d{2}$/', $id)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'ID de post invalide']);
    exit;
}

$strategy = latest_strategy_file(__DIR__ . '/strategy');
if ($strategy === null) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'Aucune stratégie trouvée']);
    exit;
}

$html = file_get_contents($strategy);
if ($html === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Lecture stratégie impossible']);
    exit;
}

$articlePattern = '/\s*<article class="post-card" id="' . preg_quote($id, '/') . '"[^>]*>.*?<\/article>/su';
if (!preg_match($articlePattern, $html)) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'Post introuvable']);
    exit;
}

$updated = preg_replace($articlePattern, '', $html, 1);
if ($updated === null || file_put_contents($strategy, $updated, LOCK_EX) === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Suppression impossible']);
    exit;
}

echo json_encode([
    'ok' => true,
    'deleted' => $id,
    'strategyFile' => basename($strategy),
    'updatedAt' => date(DATE_ATOM),
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
