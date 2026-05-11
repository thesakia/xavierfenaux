<?php
declare(strict_types=1);
require __DIR__ . '/auth.php';
dashboard_require_auth(true);

if (function_exists('session_write_close')) {
    session_write_close();
}

header('Content-Type: text/event-stream; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Connection: keep-alive');
header('X-Accel-Buffering: no');

function latest_strategy_file_for_events(string $dir): ?string
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

function strategy_version(?string $path): string
{
    if ($path === null || !is_file($path)) {
        return '';
    }

    clearstatcache(true, $path);
    return (string) (filemtime($path) ?: 0) . '-' . (string) (filesize($path) ?: 0);
}

function send_event(string $event, array $payload): void
{
    echo "event: {$event}\n";
    echo 'data: ' . json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n\n";
    if (ob_get_level() > 0) {
        @ob_flush();
    }
    flush();
}

$dir = __DIR__ . '/strategy';
$last = '';

for ($i = 0; $i < 45; $i++) {
    if (connection_aborted()) {
        break;
    }

    $strategy = latest_strategy_file_for_events($dir);
    $version = strategy_version($strategy);

    if ($version !== $last) {
        $last = $version;
        send_event('strategy', [
            'version' => $version,
            'file' => $strategy ? basename($strategy) : null,
            'updatedAt' => $strategy ? date(DATE_ATOM, filemtime($strategy) ?: time()) : null,
        ]);
    } else {
        echo ": heartbeat\n\n";
        if (ob_get_level() > 0) {
            @ob_flush();
        }
        flush();
    }

    sleep(2);
}
