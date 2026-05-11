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

function encode_pre(string $value): string
{
    $normalized = str_replace(["\r\n", "\r"], "\n", $value);
    return htmlspecialchars($normalized, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
}

function replace_block(string $article, string $class, string $label, string $value): string
{
    $encoded = encode_pre($value);
    $pattern = '/(<div class="block ' . preg_quote($class, '/') . '">\s*<div class="block-label">[^<]*<\/div>\s*<pre>)(.*?)(<\/pre>)/su';

    if (preg_match($pattern, $article)) {
        return preg_replace_callback($pattern, static function (array $match) use ($encoded): string {
            return $match[1] . $encoded . $match[3];
        }, $article, 1) ?? $article;
    }

    if (trim($value) === '') {
        return $article;
    }

    $block = "\n    <div class=\"block {$class}\"><div class=\"block-label\">{$label}</div><pre>{$encoded}</pre><button class=\"copy\" type=\"button\">Copier</button></div>";
    if ($class === 'image-prompt') {
        return preg_replace('/(<div class="block prompt">.*?<\/div>)/su', '$1' . $block, $article, 1) ?? ($article . $block);
    }

    return $article . $block;
}

$payload = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Payload JSON invalide']);
    exit;
}

$id = (string) ($payload['id'] ?? '');
$prompt = (string) ($payload['prompt'] ?? '');
$imagePrompt = (string) ($payload['imagePrompt'] ?? '');

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

$articlePattern = '/(<article class="post-card" id="' . preg_quote($id, '/') . '"[^>]*>)(.*?)(<\/article>)/su';
if (!preg_match($articlePattern, $html)) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'Post introuvable']);
    exit;
}

$updated = preg_replace_callback($articlePattern, static function (array $match) use ($prompt, $imagePrompt): string {
    $article = replace_block($match[2], 'prompt', 'Prompt unique à me donner pour ce post', $prompt);
    $article = replace_block($article, 'image-prompt', 'Prompt image / dessin', $imagePrompt);
    return $match[1] . $article . $match[3];
}, $html, 1);

if ($updated === null || file_put_contents($strategy, $updated, LOCK_EX) === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Sauvegarde impossible']);
    exit;
}

echo json_encode([
    'ok' => true,
    'postId' => $id,
    'strategyFile' => basename($strategy),
    'updatedAt' => date(DATE_ATOM),
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
