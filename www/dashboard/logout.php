<?php
declare(strict_types=1);
require __DIR__ . '/auth.php';
dashboard_logout();
header('Location: /dashboard/login.php');
exit;
