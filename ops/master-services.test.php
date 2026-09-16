<?php
declare(strict_types=1);
require dirname(__DIR__) . '/www/master/services.php';
$ids = array_column(master_services(), 'id');
foreach (['dashboard-radar', 'ivtday', 'live', 'ivt-newsletter', 'tournage-ivt', 'actualites'] as $id) {
    if (in_array($id, $ids, true)) throw new RuntimeException('Retired service exposed: ' . $id);
}
foreach (['clips', 'ivt-radar', 'strategy-x', 'site-xavier', 'analytics'] as $id) {
    if (!in_array($id, $ids, true)) throw new RuntimeException('Retained service missing: ' . $id);
}
echo "Retired services absent, retained services present: passed\n";
