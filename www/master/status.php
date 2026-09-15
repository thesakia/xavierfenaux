<?php
declare(strict_types=1);

require __DIR__ . '/auth.php';
require __DIR__ . '/services.php';

master_require_login();
session_write_close();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function master_port_open(string $host, int $port): array
{
    $start = microtime(true);
    $socket = @fsockopen($host, $port, $errno, $errstr, 0.8);
    $latency = (int) round((microtime(true) - $start) * 1000);
    if (is_resource($socket)) {
        fclose($socket);
        return ['state' => 'online', 'label' => 'En ligne', 'latencyMs' => $latency];
    }

    return ['state' => 'offline', 'label' => 'A verifier', 'latencyMs' => null];
}

function master_http_status(string $url): array
{
    $context = stream_context_create(['http'=>['timeout'=>3, 'method'=>'HEAD', 'follow_location'=>0]]);
    $headers = @get_headers($url, true, $context);
    if (!is_array($headers) || empty($headers[0])) {
        return ['state' => 'offline', 'label' => 'A verifier', 'code' => null];
    }

    preg_match('/\s(\d{3})\s/', (string) $headers[0], $matches);
    $code = isset($matches[1]) ? (int) $matches[1] : null;
    $state = $code !== null && (($code >= 200 && $code < 400) || $code === 401) ? 'online' : 'offline';

    return ['state' => $state, 'label' => $state === 'online' ? 'Repond' : 'A verifier', 'code' => $code];
}

function master_file_status(string $path): array
{
    if (is_file($path)) {
        return [
            'state' => 'online',
            'label' => 'Disponible',
            'updatedAt' => date(DATE_ATOM, (int) filemtime($path)),
        ];
    }

    return ['state' => 'missing', 'label' => 'Indisponible', 'updatedAt' => null];
}

$services = array_map(static function (array $service): array {
    $check = $service['statusCheck'] ?? ['type' => 'none'];

    if (($check['type'] ?? '') === 'port') {
        $status = master_port_open((string) $check['host'], (int) $check['port']);
    } elseif (($check['type'] ?? '') === 'file') {
        $status = master_file_status((string) $check['path']);
    } elseif (($check['type'] ?? '') === 'http') {
        $status = master_http_status((string) $check['url']);
    } else {
        $status = ['state' => 'unknown', 'label' => 'Non teste'];
    }

    unset($service['statusCheck']);
    $service['status'] = $status;
    return $service;
}, array_values(array_filter(master_services(), static fn(array $s): bool => $s['category'] !== 'Reseaux')));

$revisionPath = dirname(__DIR__, 2) . '/.deploy-revision';

echo json_encode([
    'generatedAt' => date(DATE_ATOM),
    'revision' => is_file($revisionPath) ? trim((string) file_get_contents($revisionPath)) : null,
    'services' => $services,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
