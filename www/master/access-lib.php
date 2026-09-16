<?php
declare(strict_types=1);

const MASTER_ACCESS_SECONDS = 30 * 86400;
const MASTER_ACCESS_COOKIE = '__Secure-xf_master_access';
const MASTER_BRIDGE_COOKIE = '__Host-xf_master_bridge';

function master_access_path(): string {
    return getenv('MASTER_ACCESS_FILE') ?: '/var/lib/xavier-master/access.json';
}

function master_access_store(?callable $update = null): array {
    $path = master_access_path();
    $lock = fopen($path . '.lock', 'c');
    if (!$lock || !flock($lock, $update ? LOCK_EX : LOCK_SH)) throw new RuntimeException('Accès temporairement indisponible.');
    $temp = null;
    try {
        $data = is_file($path) ? json_decode((string)file_get_contents($path), true, 64, JSON_THROW_ON_ERROR) : ['sessions'=>[], 'grants'=>[], 'tickets'=>[]];
        if ($update) {
            foreach (['sessions','grants','tickets'] as $group) {
                $data[$group] = array_filter($data[$group] ?? [], static fn(array $item): bool => $item['expires'] > time());
            }
            $data = $update($data);
            $json = json_encode($data, JSON_THROW_ON_ERROR);
            $temp = tempnam(dirname($path), '.access-');
            if (!$temp || file_put_contents($temp, $json) !== strlen($json) || !chmod($temp, 0600) || !rename($temp, $path)) throw new RuntimeException('Accès non enregistré.');
        }
        return $data;
    } finally {
        if ($temp && is_file($temp)) unlink($temp);
        flock($lock, LOCK_UN); fclose($lock);
    }
}

function master_access_resolve(array $cookies, string $host, ?array $data = null): ?array {
    $data = $data ?? master_access_store();
    if (in_array($host, ['xavierfenaux.com','www.xavierfenaux.com'], true)) {
        $raw = $cookies[MASTER_ACCESS_COOKIE] ?? '';
        if (!preg_match('/^[a-f0-9]{64}$/', $raw)) return null;
        $id = hash('sha256', $raw);
    } else {
        $raw = $cookies[MASTER_BRIDGE_COOKIE] ?? '';
        if (!preg_match('/^[a-f0-9]{64}$/', $raw)) return null;
        $grant = $data['grants'][hash('sha256', $raw)] ?? null;
        if (!$grant || $grant['host'] !== $host || $grant['expires'] <= time()) return null;
        $id = $grant['session'];
    }
    $session = $data['sessions'][$id] ?? null;
    return $session && $session['expires'] > time() ? ['id'=>$id] + $session : null;
}

function master_access_current(): ?array {
    return master_access_resolve($_COOKIE, strtolower(explode(':', $_SERVER['HTTP_HOST'] ?? '')[0]));
}

function master_access_cookie(string $name, string $token, int $expires): void {
    $options = ['expires'=>$expires,'path'=>'/','secure'=>true,'httponly'=>true,'samesite'=>'Lax'];
    if ($name === MASTER_ACCESS_COOKIE) $options['domain'] = 'xavierfenaux.com';
    setcookie($name, $token, $options);
    $_COOKIE[$name] = $token;
}

function master_access_create(): array {
    $raw = bin2hex(random_bytes(32)); $id = hash('sha256', $raw);
    $session = ['user'=>'xav', 'created'=>time(), 'expires'=>time() + MASTER_ACCESS_SECONDS];
    master_access_store(static function(array $data) use ($id, $session): array { $data['sessions'][$id] = $session; return $data; });
    master_access_cookie(MASTER_ACCESS_COOKIE, $raw, $session['expires']);
    return ['id'=>$id] + $session;
}

function master_access_revoke(string $id): void {
    master_access_store(static function(array $data) use ($id): array {
        unset($data['sessions'][$id]);
        foreach (['grants','tickets'] as $group) $data[$group] = array_filter($data[$group], static fn(array $row): bool => $row['session'] !== $id);
        return $data;
    });
}

function master_access_ticket(string $id, string $host, string $path): string {
    if ($host !== 'radar.ftfenaux.com' || !in_array($path, ['/', '/newsletter/'], true)) throw new InvalidArgumentException('Destination non autorisée.');
    $ticket = bin2hex(random_bytes(32));
    master_access_store(static function(array $data) use ($ticket,$id,$host,$path): array {
        if (empty($data['sessions'][$id])) throw new RuntimeException('Session expirée.');
        $data['tickets'][hash('sha256',$ticket)] = ['session'=>$id,'host'=>$host,'path'=>$path,'expires'=>time()+60];
        return $data;
    });
    return $ticket;
}

function master_access_exchange(string $ticket, string $host): array {
    if (!preg_match('/^[a-f0-9]{64}$/', $ticket)) throw new InvalidArgumentException('Connexion invalide.');
    $result = null;
    master_access_store(static function(array $data) use ($ticket,$host,&$result): array {
        $key=hash('sha256',$ticket); $row=$data['tickets'][$key] ?? null;
        if (!$row || $row['host'] !== $host || empty($data['sessions'][$row['session']])) throw new InvalidArgumentException('Connexion expirée. Reviens au cockpit.');
        unset($data['tickets'][$key]);
        $raw=bin2hex(random_bytes(32)); $expires=$data['sessions'][$row['session']]['expires'];
        $data['grants'][hash('sha256',$raw)] = ['session'=>$row['session'],'host'=>$host,'expires'=>$expires];
        $result=['token'=>$raw,'expires'=>$expires,'path'=>$row['path']];
        return $data;
    });
    return $result;
}

function master_tool_credentials(): array {
    return json_decode((string)file_get_contents('/etc/xavier-master/tool-access.json'), true, 16, JSON_THROW_ON_ERROR);
}

function master_dashboard_cookie(string $id): string {
    $value = '';
    // Serialize refreshes so parallel dashboard requests do not trigger repeated logins.
    master_access_store(static function(array $data) use ($id,&$value): array {
        $session = $data['sessions'][$id] ?? null;
        if (!$session) throw new RuntimeException('Session expirée.');
        if (($session['dashboard_expires'] ?? 0) > time()) { $value=$session['dashboard_cookie']; return $data; }
        $credentials=master_tool_credentials();
        $curl=curl_init('https://xavierfenaux.com/api/auth/login');
        curl_setopt_array($curl, [CURLOPT_RESOLVE=>['xavierfenaux.com:443:127.0.0.1'],CURLOPT_RETURNTRANSFER=>true,CURLOPT_POST=>true,CURLOPT_TIMEOUT=>12,CURLOPT_CONNECTTIMEOUT=>3,CURLOPT_HTTPHEADER=>['Content-Type: application/json'],CURLOPT_POSTFIELDS=>json_encode(['username'=>$credentials['username'],'password'=>$credentials['password']]),CURLOPT_HEADERFUNCTION=>static function($curl,string $line) use (&$value): int {
            if (preg_match('/^Set-Cookie:\s*xf_dashboard_session=([^;\r\n]+)/i',$line,$matches)) $value=$matches[1];
            return strlen($line);
        }]);
        curl_exec($curl); $status=curl_getinfo($curl,CURLINFO_HTTP_CODE); curl_close($curl);
        if ($status !== 200 || !$value) throw new RuntimeException('Connexion au radar temporairement indisponible.');
        $data['sessions'][$id]['dashboard_cookie']=$value;
        $data['sessions'][$id]['dashboard_expires']=time()+10*3600;
        return $data;
    });
    return $value;
}
