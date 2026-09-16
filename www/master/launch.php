<?php
declare(strict_types=1);
require __DIR__ . '/auth.php';
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
$targets = ['clips'=>'https://xavierfenaux.com/clips/', 'brief-mood'=>'https://xavierfenaux.com/brief-mood/', 'ivt-radar'=>'https://radar.ftfenaux.com/'];
$tool = (string)($_GET['tool'] ?? '');
if (!isset($targets[$tool])) { http_response_code(400); exit('Outil inconnu.'); }
if (!master_is_logged_in()) {
    $_SESSION['master_next_tool']=$tool;
    header('Location: /master/'); exit;
}
$access=master_access_current();
session_write_close();
$url=$targets[$tool];
if (str_starts_with($tool,'ivt-')) {
    $parts=parse_url($url);
    $ticket=master_access_ticket($access['id'],$parts['host'],$parts['path']);
    $url='https://' . $parts['host'] . '/__master/complete?ticket=' . rawurlencode($ticket);
}
header('Location: ' . $url);
