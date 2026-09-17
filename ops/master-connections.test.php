<?php
declare(strict_types=1);
$dir = sys_get_temp_dir().'/xavier-connections-'.bin2hex(random_bytes(8));
mkdir($dir, 0700);
putenv('MASTER_SOCIAL_FILE='.$dir.'/social.json');
putenv('MASTER_PROVIDERS_FILE='.$dir.'/base.json');
require dirname(__DIR__).'/www/master/social-store.php';
require dirname(__DIR__).'/www/master/connections-lib.php';
function expect(bool $ok, string $label): void { if (!$ok) throw new RuntimeException($label); }
function rejects(callable $f): void { try { $f(); } catch (InvalidArgumentException $e) { return; } throw new RuntimeException('Invalid settings accepted'); }
try {
    expect(count(connection_public()) === 6, 'six networks');
    $instagram = array_column(social_accounts(), null, 'id')['instagram-ivt'];
    expect($instagram['owner'] === 'IVT' && $instagram['handle'] === '@interactiv_trading', 'Instagram belongs to IVT');
    expect(!isset(connection_providers()['instagram-xavier']), 'old Instagram identity is not reused');
    foreach (connection_public() as $c) expect(!$c['active'] && !$c['configured'], 'no false connection');
    rejects(fn()=>connection_settings('x-xavier', ['client_id'=>'id','client_secret'=>'secret']));
    rejects(fn()=>connection_settings('spotify-xavier', ['client_id'=>'id','client_secret'=>'secret']));
    rejects(fn()=>connection_settings('instagram-ivt', ['mode'=>'api','api_key'=>'secret']));
    rejects(fn()=>connection_settings('instagram-ivt', ['client_id'=>'id','client_secret'=>"bad\nsecret"]));
    rejects(fn()=>connection_settings('youtube-ivt', ['mode'=>'api','api_key'=>'key','channel_id'=>'not-a-channel']));
    $config = connection_settings('instagram-ivt', ['client_id'=>'app-id','client_secret'=>'private-test-secret', 'extra'=>'ignored']);
    master_store_update($dir.'/providers.json', [], static fn($data)=>['instagram'=>$config, 'youtube'=>['api_key'=>'private-api-key']]);
    expect(connection_public()['instagram-ivt']['configured'], 'OAuth ready after configuration');
    expect(!connection_public()['instagram-ivt']['active'], 'settings alone do not authenticate');
    connection_save('youtube-ivt', ['mode'=>'api','status'=>'active','connected_at'=>date(DATE_ATOM),'user_id'=>'verified-channel']);
    expect(connection_public()['youtube-ivt']['active'] && connection_public()['youtube-ivt']['apiOnly'], 'verified public API mode');
    expect(!str_contains(json_encode(connection_public()), 'private-'), 'secrets never returned');
    connection_save('youtube-ivt', null);
    expect(!connection_public()['youtube-ivt']['active'], 'disconnect stops API mode');
    echo "Provider policy, settings validation, API state, disconnection and secret redaction: passed\n";
} finally { foreach (glob($dir.'/*') as $file) unlink($file); rmdir($dir); }
