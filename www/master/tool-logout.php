<?php
declare(strict_types=1);
require __DIR__ . '/auth.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }
$origin=parse_url($_SERVER['HTTP_ORIGIN'] ?? '', PHP_URL_HOST);
if ($origin && !in_array($origin,['xavierfenaux.com','www.xavierfenaux.com'],true)) { http_response_code(403); exit; }
master_logout();
header('Content-Type: application/json');
header('Cache-Control: no-store');
echo '{"ok":true}';
