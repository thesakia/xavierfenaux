<?php
declare(strict_types=1);
require dirname(__DIR__) . '/www/master/services.php';
$ids = array_column(master_services(), 'id');
foreach (['dashboard-radar', 'ivtday', 'live', 'ivt-newsletter', 'tournage-ivt', 'actualites', 'strategy-x'] as $id) {
    if (in_array($id, $ids, true)) throw new RuntimeException('Retired service exposed: ' . $id);
}
foreach (['clips', 'ivt-radar', 'site-xavier', 'analytics'] as $id) {
    if (!in_array($id, $ids, true)) throw new RuntimeException('Retained service missing: ' . $id);
}
if (is_file(dirname(__DIR__) . '/www/master/strategy.php')) throw new RuntimeException('Retired strategy endpoint still exists.');
$cockpit = file_get_contents(dirname(__DIR__) . '/www/master/cockpit.js');
if (str_contains($cockpit, 'strategy-x') || str_contains($cockpit, '/master/strategy.php')) throw new RuntimeException('Retired strategy link remains in cockpit.');
echo "Retired services absent, retained services present: passed\n";
