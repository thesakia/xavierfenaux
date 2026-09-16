<?php
declare(strict_types=1);
$dir=sys_get_temp_dir().'/master-access-test-'.bin2hex(random_bytes(8));
mkdir($dir,0700);
putenv('MASTER_ACCESS_FILE='.$dir.'/access.json');
require dirname(__DIR__).'/www/master/access-lib.php';
function expect(bool $ok, string $label): void { if (!$ok) throw new RuntimeException($label); }
try {
    $raw=bin2hex(random_bytes(32)); $id=hash('sha256',$raw);
    master_access_store(static function(array $data) use ($id): array { $data['sessions'][$id]=['user'=>'xav','expires'=>time()+MASTER_ACCESS_SECONDS]; return $data; });
    $cookies=[MASTER_ACCESS_COOKIE=>$raw];
    expect(master_access_resolve($cookies,'xavierfenaux.com')['id']===$id,'persistent cookie resolves without PHP session');
    expect(master_access_resolve($cookies,'www.xavierfenaux.com')['id']===$id,'www shares master session');
    expect(master_access_resolve($cookies,'evil.example')===null,'untrusted audience rejected');
    $ticket=master_access_ticket($id,'radar.ftfenaux.com','/newsletter/');
    try { master_access_exchange($ticket,'evil.example'); throw new RuntimeException('wrong audience accepted'); } catch (InvalidArgumentException $expected) {}
    $grant=master_access_exchange($ticket,'radar.ftfenaux.com');
    expect($grant['path']==='/newsletter/','destination preserved');
    $bridge=[MASTER_BRIDGE_COOKIE=>$grant['token']];
    expect(master_access_resolve($bridge,'radar.ftfenaux.com')['id']===$id,'bridge resolves same principal');
    expect(master_access_resolve($bridge,'ftfenaux.com')===null,'grant is host-bound');
    try { master_access_exchange($ticket,'radar.ftfenaux.com'); throw new RuntimeException('ticket replay accepted'); } catch (InvalidArgumentException $expected) {}
    master_access_revoke($id);
    expect(master_access_resolve($cookies,'xavierfenaux.com')===null,'logout revokes master');
    expect(master_access_resolve($bridge,'radar.ftfenaux.com')===null,'logout revokes linked tools');
    expect(!str_contains(file_get_contents(master_access_path()),$raw),'raw login secret is never persisted');
    echo "Persistent access, audience binding, replay prevention and global logout: passed\n";
} finally { foreach(glob($dir.'/*') as $file) unlink($file); rmdir($dir); }
