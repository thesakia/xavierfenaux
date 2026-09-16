<?php
declare(strict_types=1);
require dirname(__DIR__) . '/www/master/analytics-report.php';
$file = tempnam(sys_get_temp_dir(), 'xavier-analytics-test-');
$base = ['domain'=>'xavierfenaux.com', 'generatedAt'=>date(DATE_ATOM), 'summary'=>['visitors_7d'=>0], 'days'=>[], 'daily'=>[], 'pages'=>[], 'sources'=>[]];
function rejected(string $file): void {
    try { master_analytics_report($file); } catch (Throwable $error) { return; }
    throw new RuntimeException('Invalid report accepted');
}
try {
    file_put_contents($file, json_encode($base + ['otherSites'=>['private']]));
    $result = master_analytics_report($file);
    if ($result !== $base) throw new RuntimeException('Unexpected fields exposed or zero lost');
    file_put_contents($file, json_encode(array_replace($base, ['domain'=>'parentsdejumeaux.fr'])));
    rejected($file);
    file_put_contents($file, json_encode(array_replace($base, ['summary'=>null])));
    rejected($file);
    file_put_contents($file, '{broken');
    rejected($file);
    unlink($file);
    rejected($file);
    echo "Xavier-only analytics, field allowlist, empty/malformed/missing reports: passed\n";
} finally { if (is_file($file)) unlink($file); }
