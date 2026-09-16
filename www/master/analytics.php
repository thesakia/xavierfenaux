<?php
declare(strict_types=1);
require __DIR__ . '/auth.php';
master_require_login();
header('Cache-Control: no-store');
header('Location: /master/#analytics');
exit;
