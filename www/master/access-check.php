<?php
declare(strict_types=1);
require __DIR__ . '/access-lib.php';
header('Cache-Control: no-store');
// Only the internal Nginx location supplies this FastCGI parameter.
if (($_SERVER['MASTER_AUTH_REQUEST'] ?? '') !== '1') { http_response_code(404); exit; }
try {
    $access=master_access_current();
    if (!$access) { http_response_code(401); exit; }
    $credentials=master_tool_credentials();
    header('X-Master-Basic: Basic ' . base64_encode($credentials['username'] . ':' . $credentials['password']));
    http_response_code(204);
} catch (Throwable $error) { error_log('Master access check failed.'); http_response_code(503); }
