<?php
declare(strict_types=1);
require __DIR__ . '/auth.php';
master_require_login();
session_write_close();
header('Cache-Control: no-store');
$path='/var/lib/xavier-master/analytics.json';
$data=is_file($path)?json_decode((string)file_get_contents($path),true):null;
function e($s): string { return htmlspecialchars((string)$s, ENT_QUOTES,'UTF-8'); }
function n($v): string { return $v===null?'—':number_format((int)$v,0,',',' '); }
$summary=$data['summary']??[];
?>
<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Audience du site · Xavier</title><link rel="stylesheet" href="/master/cockpit.css?v=2"><script defer src="/master/chart.umd.js"></script><script defer src="/master/analytics.js"></script></head><body>
<style>table{width:100%;table-layout:fixed}th,td{white-space:normal;overflow-wrap:anywhere}th:last-child,td:last-child{width:110px}.split>section{min-width:0}</style>
<header class="topbar"><a href="/master/#tools">← Mon cockpit</a><span>Session Xavier active</span></header>
<main id="main"><div class="page-heading"><div><span class="eyebrow">XAVIERFENAUX.COM</span><h1>L’audience de ton site</h1><p>Les visites, les pages lues et les sources de tes visiteurs.</p></div><a class="secondary" href="/master/analytics.php">Actualiser</a></div>
<?php if (!$data): ?><p class="error-banner">Les statistiques sont en cours de préparation. Réessaie dans quelques minutes.</p><?php else: ?>
<p class="table-hint">Source : Umami · relevé du <?= e(date('d/m/Y à H:i',strtotime($data['generatedAt']))) ?> · actualisation toutes les 5 minutes.</p>
<?php if (time()-strtotime($data['generatedAt'])>900): ?><p class="error-banner">Le dernier relevé date de plus de 15 minutes. Les chiffres ci-dessous n’ont pas encore été actualisés.</p><?php endif; ?>
<section class="kpis"><?php foreach (['visitors_24h'=>'Visiteurs · 24 heures','visitors_7d'=>'Visiteurs · 7 jours','pageviews_7d'=>'Pages vues · 7 jours','clicks_7d'=>'Clics suivis · 7 jours'] as $key=>$label): ?><article class="kpi"><span class="kpi-title"><?= e($label) ?></span><strong class="kpi-value"><?= n($summary[$key]??null) ?></strong></article><?php endforeach; ?></section>
<section class="surface"><h2>Les pages vues au fil des jours</h2><p>Les 14 derniers jours · journées UTC.</p><div class="chart-wrap"><canvas id="audience-chart" role="img" aria-label="Pages vues par jour, également détaillées dans le tableau ci-dessous."></canvas></div></section>
<div class="split"><section><div class="section-title"><h2>Les pages les plus lues</h2></div><table><thead><tr><th>Page</th><th>Vues · 7 j.</th></tr></thead><tbody><?php foreach ($data['pages'] as $row): ?><tr><td><?= e($row['path']) ?></td><td><?= n($row['views']) ?></td></tr><?php endforeach; ?></tbody></table></section><section><div class="section-title"><h2>D’où viennent les visiteurs ?</h2></div><table><thead><tr><th>Source</th><th>Visites · 7 j.</th></tr></thead><tbody><?php foreach ($data['sources'] as $row): ?><tr><td><?= e($row['referrer']) ?></td><td><?= n($row['visits']) ?></td></tr><?php endforeach; ?></tbody></table></section></div>
<details><summary>Voir les chiffres jour par jour</summary><table><thead><tr><th>Date UTC</th><th>Pages vues</th><th>Clics</th></tr></thead><tbody><?php foreach ($data['days'] as $day): ?><tr><td><?= e($day) ?></td><td><?= n($data['daily'][$day]['pageviews']??0) ?></td><td><?= n($data['daily'][$day]['clicks']??0) ?></td></tr><?php endforeach; ?></tbody></table></details>
<script type="application/json" id="analytics-data"><?= json_encode($data,JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT) ?></script>
<?php endif; ?></main></body></html>
