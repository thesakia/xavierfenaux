<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
date_default_timezone_set('Europe/Paris');
require dirname(__DIR__) . '/www/master/social-store.php';
require dirname(__DIR__) . '/www/master/connections-lib.php';
$lock = fopen(dirname(social_path()) . '/sync.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) exit;
$requested = dirname(social_path()) . '/sync-requested';
$lastRun = dirname(social_path()) . '/last-sync';
if (!in_array('--force', $argv, true) && !is_file($requested) && is_file($lastRun) && time() - filemtime($lastRun) < 3600) exit;
if (is_file($requested)) unlink($requested);
foreach (connection_read() as $account=>$token) {
    if (($token['status'] ?? '') !== 'active' || !isset(connection_providers()[$account])) continue;
    try {
        $token = connection_access($account, $token);
        $profile = connection_profile($account, $token);
        if ($profile['identity']['id'] !== ($token['user_id'] ?? '')) throw new RuntimeException('Le compte a changé. Reconnecte le bon profil.', 401);
        $records = [$profile['record']];
        $partial = null;
        if ($account === 'youtube-ivt') {
            try {
                $query = ['ids'=>'channel==MINE', 'startDate'=>date('Y-m-d', strtotime('-90 days')), 'endDate'=>date('Y-m-d', strtotime('-1 day')), 'metrics'=>'views,likes,comments,shares', 'dimensions'=>'day', 'sort'=>'day'];
                $report = connection_http('https://youtubeanalytics.googleapis.com/v2/reports?' . http_build_query($query), ['Authorization: Bearer ' . $token['access_token']]);
                $headers = array_column($report['columnHeaders'] ?? [], 'name');
                foreach ($report['rows'] ?? [] as $row) {
                    $r = array_combine($headers, $row);
                    $records[] = social_record(['account'=>$account, 'date'=>$r['day'], 'views'=>$r['views'], 'reactions'=>$r['likes'], 'comments'=>$r['comments'], 'shares'=>$r['shares']], 'YouTube Analytics (journée du réseau)');
                }
            } catch (Throwable $e) { $partial = 'Abonnés actualisés. Le détail quotidien YouTube est indisponible ; vérifie les autorisations Analytics.'; }
        }
        social_update(static function(array $data) use ($records, $account, $partial): array {
            $data = social_merge($data, $records);
            $data['sync'][$account] = ['lastSuccess'=>date(DATE_ATOM), 'lastAttempt'=>date(DATE_ATOM), 'error'=>$partial];
            return $data;
        });
        echo $account . ': synchronized' . PHP_EOL;
    } catch (Throwable $error) {
        if (in_array($error->getCode(), [401,403], true)) {
            $token['status'] = 'expired';
            try { connection_save($account, $token, $token['access_token']); } catch (RuntimeException $changed) {}
        }
        social_update(static function(array $data) use ($account): array {
            $data['sync'][$account] = array_merge($data['sync'][$account] ?? [], ['lastAttempt'=>date(DATE_ATOM), 'error'=>'La lecture a échoué. Réessaie ou reconnecte ce réseau.']);
            return $data;
        });
        // Do not log upstream bodies: they can contain credentials or personal data.
        echo $account . ': synchronization failed (' . (int)$error->getCode() . ')' . PHP_EOL;
    }
}
touch($lastRun);
flock($lock, LOCK_UN); fclose($lock);
