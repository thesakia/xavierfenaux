<?php
declare(strict_types=1);

function master_analytics_report(string $path = '/var/lib/xavier-master/analytics.json'): array
{
    if (!is_file($path)) throw new RuntimeException('Relevé indisponible.');
    $report = json_decode((string) file_get_contents($path), true, 64, JSON_THROW_ON_ERROR);
    if (($report['domain'] ?? null) !== 'xavierfenaux.com'
        || !is_array($report['summary'] ?? null)
        || !is_array($report['days'] ?? null)
        || !is_array($report['daily'] ?? null)
        || !is_array($report['pages'] ?? null)
        || !is_array($report['sources'] ?? null)
        || !is_string($report['generatedAt'] ?? null)
        || strtotime($report['generatedAt']) === false) {
        throw new RuntimeException('Relevé du site Xavier indisponible.');
    }
    return array_intersect_key($report, array_flip(['domain', 'generatedAt', 'summary', 'days', 'daily', 'pages', 'sources']));
}
