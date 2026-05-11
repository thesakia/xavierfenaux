<?php
declare(strict_types=1);
require __DIR__ . '/auth.php';
dashboard_require_auth(true);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function latest_file(string $dir, array $extensions): ?string
{
    if (!is_dir($dir)) {
        return null;
    }
    $files = [];
    foreach (scandir($dir) ?: [] as $file) {
        if ($file === '.' || $file === '..') {
            continue;
        }
        $path = $dir . DIRECTORY_SEPARATOR . $file;
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        if (is_file($path) && in_array($ext, $extensions, true)) {
            $files[$path] = filemtime($path) ?: 0;
        }
    }
    if (!$files) {
        return null;
    }
    arsort($files);
    return (string) array_key_first($files);
}

function text_between(string $html, string $pattern): string
{
    if (preg_match($pattern, $html, $match)) {
        return trim(html_entity_decode(strip_tags($match[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    }
    return '';
}

function parse_blocks(string $article): array
{
    $blocks = [];
    if (preg_match_all('/<div class="block ([^"]+)">\s*<div class="block-label">([^<]+)<\/div>\s*<pre>(.*?)<\/pre>/su', $article, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $match) {
            $type = trim($match[1]);
            $label = trim(html_entity_decode($match[2], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
            $text = trim(html_entity_decode(strip_tags($match[3]), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
            $blocks[] = ['type' => $type, 'label' => $label, 'text' => $text];
        }
    }
    return $blocks;
}

function parse_strategy(string $path): array
{
    $html = file_get_contents($path);
    if ($html === false) {
        return [];
    }

    $posts = [];
    if (!preg_match_all('/<article class="post-card" id="([^"]+)"([^>]*)>(.*?)<\/article>/su', $html, $matches, PREG_SET_ORDER)) {
        return [];
    }

    foreach ($matches as $match) {
        $id = $match[1];
        $attrs = $match[2];
        $article = $match[3];
        $attr = static function (string $name) use ($attrs): string {
            if (preg_match('/' . preg_quote($name, '/') . '="([^"]*)"/u', $attrs, $m)) {
                return html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
            }
            return '';
        };

        $postId = text_between($article, '/<div class="post-id">(.*?)<\/div>/su');
        $parts = array_map('trim', explode('·', $postId));
        $blocks = parse_blocks($article);
        $blockByType = [];
        foreach ($blocks as $block) {
            $blockByType[$block['type']] = $block['text'];
        }

        $posts[] = [
            'id' => $id,
            'dateLabel' => $parts[1] ?? '',
            'time' => $parts[2] ?? '',
            'category' => $attr('data-cat'),
            'status' => $attr('data-status'),
            'asset' => $attr('data-asset'),
            'title' => text_between($article, '/<h3>(.*?)<\/h3>/su'),
            'meta' => text_between($article, '/<div class="mini-meta">(.*?)<\/div>/su'),
            'text' => $blockByType['text'] ?? '',
            'reply' => $blockByType['reply'] ?? '',
            'prompt' => $blockByType['prompt'] ?? '',
            'imagePrompt' => $blockByType['image-prompt'] ?? '',
            'blocks' => $blocks,
        ];
    }

    return $posts;
}

$strategy = latest_file(__DIR__ . '/strategy', ['html', 'htm']);
$posts = $strategy ? parse_strategy($strategy) : [];

echo json_encode([
    'ok' => true,
    'generatedAt' => date(DATE_ATOM),
    'strategyFile' => $strategy ? basename($strategy) : null,
    'strategyUpdatedAt' => $strategy ? date(DATE_ATOM, filemtime($strategy) ?: time()) : null,
    'posts' => $posts,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
