<?php
declare(strict_types=1);
date_default_timezone_set('Europe/Paris');

function social_accounts(): array
{
    return [
        ['id'=>'x-xavier', 'network'=>'X', 'owner'=>'Xavier', 'handle'=>'@XFenaux', 'url'=>'https://x.com/XFenaux', 'verified'=>true, 'source'=>'https://www.xavierfenaux.com/', 'analytics'=>'https://x.com/i/account_analytics', 'color'=>'#202622'],
        ['id'=>'instagram-xavier', 'network'=>'Instagram', 'owner'=>'Xavier', 'handle'=>'@xfenaux', 'url'=>'https://www.instagram.com/xfenaux/', 'verified'=>true, 'source'=>'https://videobourse.fr/forum-trading-bourse/viewtopic.php?start=325&t=9402', 'analytics'=>'https://www.instagram.com/accounts/professional_dashboard/', 'color'=>'#bc4278'],
        ['id'=>'tiktok-ivt', 'network'=>'TikTok', 'owner'=>'IVT', 'handle'=>'@interactivtrading', 'url'=>'https://www.tiktok.com/@interactivtrading', 'verified'=>true, 'source'=>'Confirmé par FT', 'analytics'=>'https://www.tiktok.com/tiktokstudio', 'color'=>'#008780'],
        ['id'=>'spotify-xavier', 'network'=>'Spotify', 'owner'=>'Xavier', 'handle'=>'Morning Mood', 'url'=>'https://open.spotify.com/show/4Kka5gOG1cnplAmHB0vGXD', 'verified'=>true, 'source'=>'Confirmé par FT', 'analytics'=>'https://creators.spotify.com/', 'color'=>'#38844a'],
        ['id'=>'twitch-xavier', 'network'=>'Twitch', 'owner'=>'Xavier', 'handle'=>'xavierfenaux', 'url'=>'https://www.twitch.tv/xavierfenaux', 'verified'=>true, 'source'=>'Confirmé par FT', 'analytics'=>'https://dashboard.twitch.tv/u/xavierfenaux/analytics/overview', 'color'=>'#8261b3'],
        ['id'=>'youtube-ivt', 'network'=>'YouTube', 'owner'=>'IVT', 'handle'=>'InteractivTrading', 'url'=>'https://www.youtube.com/c/InteractivTrading', 'verified'=>true, 'source'=>'https://www.xavierfenaux.com/', 'analytics'=>'https://studio.youtube.com/', 'color'=>'#cf4545'],
    ];
}

function social_path(): string
{
    return getenv('MASTER_SOCIAL_FILE') ?: '/var/lib/xavier-master/social.json';
}

function social_read(): array
{
    return master_store_read(social_path(), ['accounts'=>[], 'records'=>[], 'sync'=>[]]);
}

function social_update(callable $update): void
{
    master_store_update(social_path(), ['accounts'=>[], 'records'=>[], 'sync'=>[]], $update);
}

function master_store_read(string $path, array $default): array
{
    if (!is_file($path)) return $default;
    $file = fopen($path . '.lock', 'c');
    if (!$file || !flock($file, LOCK_SH)) throw new RuntimeException('Lecture indisponible.');
    try { return json_decode((string)file_get_contents($path), true, 512, JSON_THROW_ON_ERROR); }
    finally { flock($file, LOCK_UN); fclose($file); }
}

function master_store_update(string $path, array $default, callable $update): void
{
    $file = fopen($path . '.lock', 'c');
    if (!$file || !flock($file, LOCK_EX)) throw new RuntimeException('Enregistrement indisponible.');
    $temporary = null;
    try {
        $data = is_file($path) ? json_decode((string)file_get_contents($path), true, 512, JSON_THROW_ON_ERROR) : $default;
        $json = json_encode($update($data), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        // Stable lock + atomic replacement keep the previous file intact on failed writes.
        $temporary = tempnam(dirname($path), '.master-');
        if (!$temporary || file_put_contents($temporary, $json) !== strlen($json) || !chmod($temporary, 0600) || !rename($temporary, $path)) throw new RuntimeException('Enregistrement incomplet.');
    } finally {
        if ($temporary && is_file($temporary)) unlink($temporary);
        flock($file, LOCK_UN); fclose($file);
    }
}

function social_record(array $input, string $source): array
{
    $ids = array_column(social_accounts(), 'id');
    if (!in_array($input['account'] ?? '', $ids, true)) throw new InvalidArgumentException('Compte inconnu.');
    $date = (string) ($input['date'] ?? '');
    $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
    if (!$parsed || $parsed->format('Y-m-d') !== $date || $date > date('Y-m-d') || $date < '2020-01-01') throw new InvalidArgumentException('Choisis une date valide, au plus tard aujourd’hui.');
    $record = ['account'=>$input['account'], 'date'=>$date, 'source'=>$source, 'updatedAt'=>date(DATE_ATOM)];
    $count = 0;
    foreach (['followers', 'posts', 'reactions', 'views', 'comments', 'shares', 'totalPosts', 'totalViews', 'totalLikes', 'followersGained', 'followersLost', 'watchMinutes', 'saves'] as $field) {
        $value = $input[$field] ?? null;
        if ($value === '' || $value === null) continue;
        if (!is_numeric($value) || (float)$value < 0 || (float)$value > 1e12 || floor((float)$value) !== (float)$value) throw new InvalidArgumentException('Les statistiques doivent être des nombres entiers positifs.');
        $record[$field] = (int)$value;
        $count++;
    }
    if (!$count) throw new InvalidArgumentException('Ajoute au moins un chiffre.');
    // Keep provenance per metric when a manual daily report completes an API snapshot.
    $record['sources'] = [];
    foreach ($record as $key=>$value) if (is_int($value)) $record['sources'][$key] = $source;
    return $record;
}

function social_merge(array $data, array $records): array
{
    foreach ($records as $record) {
        $key = $record['account'] . ':' . $record['date'];
        $old = $data['records'][$key] ?? [];
        $record['sources'] = array_merge($old['sources'] ?? [], $record['sources']);
        $data['records'][$key] = array_merge($old, $record);
    }
    ksort($data['records']);
    return $data;
}
