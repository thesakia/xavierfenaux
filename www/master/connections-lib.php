<?php
declare(strict_types=1);

function connection_providers(): array
{
    return [
        'x-xavier'=>['key'=>'x', 'authorize'=>'https://x.com/i/oauth2/authorize', 'token'=>'https://api.x.com/2/oauth2/token', 'scope'=>'tweet.read users.read offline.access', 'pkce'=>true],
        'instagram-xavier'=>['key'=>'instagram', 'authorize'=>'https://www.instagram.com/oauth/authorize', 'token'=>'https://api.instagram.com/oauth/access_token', 'scope'=>'instagram_business_basic,instagram_business_manage_insights'],
        'tiktok-ivt'=>['key'=>'tiktok', 'authorize'=>'https://www.tiktok.com/v2/auth/authorize/', 'token'=>'https://open.tiktokapis.com/v2/oauth/token/', 'scope'=>'user.info.basic,user.info.profile,user.info.stats,video.list'],
        'youtube-ivt'=>['key'=>'youtube', 'authorize'=>'https://accounts.google.com/o/oauth2/v2/auth', 'token'=>'https://oauth2.googleapis.com/token', 'scope'=>'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly', 'pkce'=>true],
        'twitch-xavier'=>['key'=>'twitch', 'authorize'=>'https://id.twitch.tv/oauth2/authorize', 'token'=>'https://id.twitch.tv/oauth2/token', 'scope'=>'moderator:read:followers'],
        'spotify-xavier'=>['key'=>'spotify', 'authorize'=>'https://accounts.spotify.com/authorize', 'token'=>'https://accounts.spotify.com/api/token', 'scope'=>'user-read-private', 'pkce'=>true],
    ];
}

function connection_config(): array
{
    $path = getenv('MASTER_PROVIDERS_FILE') ?: '/etc/xavier-master/providers.json';
    $base = is_file($path) ? json_decode((string)file_get_contents($path), true, 64, JSON_THROW_ON_ERROR) : [];
    return array_replace_recursive($base, master_store_read(dirname(social_path()) . '/providers.json', []));
}

function connection_setup(string $account): array
{
    $common = ['callback'=>'https://xavierfenaux.com/master/connect.php'];
    $options = [
        'instagram-xavier'=>['mode'=>'oauth', 'portal'=>'https://developers.facebook.com/apps/', 'note'=>'Compte Instagram professionnel (créateur ou entreprise). Application Meta avec Instagram Login et accès au profil et aux statistiques. Le propriétaire doit autoriser le compte ou être ajouté comme testeur.'],
        'tiktok-ivt'=>['mode'=>'oauth', 'portal'=>'https://developers.tiktok.com/apps/', 'note'=>'Application TikTok avec Login Kit et Display API. Les permissions de profil, statistiques et vidéos doivent être approuvées, ou le compte ajouté au sandbox pour les tests.'],
        'youtube-ivt'=>['mode'=>'oauth', 'portal'=>'https://console.cloud.google.com/apis/credentials', 'note'=>'Client OAuth Google de type application Web, avec YouTube Data API et YouTube Analytics API activées. Une clé API seule suffit pour les compteurs publics, dans le quota gratuit.'],
        'twitch-xavier'=>['mode'=>'oauth', 'portal'=>'https://dev.twitch.tv/console/apps', 'note'=>'Application Twitch confidentielle avec cette URL de retour. Le propriétaire doit avoir activé la double authentification.'],
        'x-xavier'=>['mode'=>'official', 'note'=>'La lecture des statistiques par l’API X est payante. Aucun appel payant n’est activé. Connecte-toi sur X pour consulter les chiffres disponibles dans ton offre, puis ajoute un relevé ici.'],
        'spotify-xavier'=>['mode'=>'official', 'note'=>'Les statistiques privées du podcast se consultent dans Spotify for Creators. La Web API ne donne pas ces écoutes : inutile de relier un compte d’écoute au cockpit.'],
    ];
    if (!isset($options[$account])) throw new InvalidArgumentException('Compte inconnu.');
    return $options[$account] + $common;
}

function connection_settings(string $account, array $input): array
{
    if (connection_setup($account)['mode'] !== 'oauth') throw new InvalidArgumentException('API non activée pour ce réseau.');
    $mode = $input['mode'] ?? 'oauth';
    if (!in_array($mode, ['oauth','api'], true) || ($mode === 'api' && $account !== 'youtube-ivt')) throw new InvalidArgumentException('Mode non disponible.');
    $fields = $mode === 'api' ? ['api_key','channel_id'] : ['client_id','client_secret'];
    $result = [];
    foreach ($fields as $field) {
        $value = $input[$field] ?? '';
        if (!is_string($value) || trim($value) === '' || strlen($value)>2048 || preg_match('/[\x00-\x20]/', $value)) throw new InvalidArgumentException('Renseigne les identifiants de l’application, sans espaces.');
        $result[$field] = $value;
    }
    if ($mode === 'api' && !preg_match('/^UC[A-Za-z0-9_-]{22}$/', $result['channel_id'])) throw new InvalidArgumentException('L’identifiant de la chaîne YouTube commence par UC et contient 24 caractères.');
    return $result;
}

function connection_youtube_public(array $config): array
{
    $data = connection_http('https://www.googleapis.com/youtube/v3/channels?' . http_build_query(['part'=>'snippet,statistics', 'id'=>$config['channel_id'], 'key'=>$config['api_key']]));
    $user = $data['items'][0] ?? [];
    $name = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $user['snippet']['title'] ?? ''));
    if (!in_array($name, ['interactivtrading','ivtinteractivtrading'], true)) throw new RuntimeException('Cette clé ne permet pas de lire la chaîne InteractivTrading. Vérifie la clé, la chaîne et l’activation de YouTube Data API.');
    return ['identity'=>['id'=>$user['id'], 'label'=>$user['snippet']['title']], 'record'=>social_record(['account'=>'youtube-ivt', 'date'=>date('Y-m-d'), 'followers'=>!empty($user['statistics']['hiddenSubscriberCount']) ? null : ($user['statistics']['subscriberCount'] ?? null), 'totalPosts'=>$user['statistics']['videoCount'] ?? null, 'totalViews'=>$user['statistics']['viewCount'] ?? null], 'YouTube Data API (compteurs publics)')];
}

function connection_path(): string { return dirname(social_path()) . '/connections.json'; }
function connection_read(): array
{
    return master_store_read(connection_path(), []);
}
function connection_save(string $account, ?array $value, ?string $expectedAccess = null): void
{
    master_store_update(connection_path(), [], static function(array $data) use ($account, $value, $expectedAccess): array {
        if ($expectedAccess !== null && ($data[$account]['access_token'] ?? null) !== $expectedAccess) throw new RuntimeException('La connexion a changé pendant la lecture.');
        if ($value === null) unset($data[$account]); else $data[$account] = $value;
        return $data;
    });
}

function connection_public(): array
{
    $saved = connection_read(); $config = connection_config(); $result = [];
    foreach (connection_providers() as $id=>$provider) {
        $c = $config[$provider['key']] ?? [];
        $token = $saved[$id] ?? [];
        $setup = connection_setup($id);
        $api = $id === 'youtube-ivt' && ($token['mode'] ?? '') === 'api' && !empty($c['api_key']);
        $active = $setup['mode'] !== 'official' && ($token['status'] ?? '') === 'active' && ($api || (!empty($token['access_token']) && (($token['expires_at'] ?? 0) > time() || !empty($token['refresh_token']))));
        $result[$id] = ['configured'=>$setup['mode'] !== 'official' && !empty($c['client_id']) && !empty($c['client_secret']), 'active'=>$active, 'label'=>$token['label'] ?? null, 'connectedAt'=>$token['connected_at'] ?? null, 'needsReconnect'=>!empty($token) && !$active, 'catalogOnly'=>false, 'apiOnly'=>$api, 'setup'=>$setup];
    }
    return $result;
}

function connection_http(string $url, array $headers = [], ?array $form = null, bool $jsonBody = false): array
{
    $curl = curl_init($url);
    curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_CONNECTTIMEOUT=>8, CURLOPT_TIMEOUT=>20, CURLOPT_FOLLOWLOCATION=>false, CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS, CURLOPT_HTTPHEADER=>array_merge(['Accept: application/json'], $headers)]);
    if ($form !== null) {
        curl_setopt($curl, CURLOPT_POST, true);
        curl_setopt($curl, CURLOPT_POSTFIELDS, $jsonBody ? json_encode($form) : http_build_query($form));
        curl_setopt($curl, CURLOPT_HTTPHEADER, array_merge($headers, ['Accept: application/json', 'Content-Type: ' . ($jsonBody ? 'application/json' : 'application/x-www-form-urlencoded')]));
    }
    $body = curl_exec($curl); $code = curl_getinfo($curl, CURLINFO_HTTP_CODE); curl_close($curl);
    if ($body === false || $code < 200 || $code >= 300) throw new RuntimeException('Le réseau n’a pas autorisé la lecture des données (HTTP ' . $code . ').', (int)$code);
    $data = json_decode($body, true, 64, JSON_THROW_ON_ERROR);
    if (!is_array($data) || (!empty($data['error']) && ($data['error']['code'] ?? '') !== 'ok')) throw new RuntimeException('Le réseau a refusé cette demande. Vérifie les autorisations du compte.');
    return $data;
}

function connection_exchange(string $account, array $fields): array
{
    $p = connection_providers()[$account]; $c = connection_config()[$p['key']] ?? [];
    $headers = [];
    if (in_array($p['key'], ['x', 'spotify'], true)) $headers[] = 'Authorization: Basic ' . base64_encode($c['client_id'] . ':' . $c['client_secret']);
    else { $fields[$p['key'] === 'tiktok' ? 'client_key' : 'client_id'] = $c['client_id']; $fields['client_secret'] = $c['client_secret']; }
    return connection_http($p['token'], $headers, $fields);
}

function connection_access(string $account, array $token): array
{
    if ($account === 'youtube-ivt' && ($token['mode'] ?? '') === 'api') return $token;
    if (($token['expires_at'] ?? 0) > time() + 300) return $token;
    if ($account === 'instagram-xavier' && ($token['expires_at'] ?? 0) > time()) {
        $fresh = connection_http('https://graph.instagram.com/refresh_access_token?' . http_build_query(['grant_type'=>'ig_refresh_token', 'access_token'=>$token['access_token']]));
    } elseif (!empty($token['refresh_token'])) {
        $fresh = connection_exchange($account, ['grant_type'=>'refresh_token', 'refresh_token'=>$token['refresh_token']]);
    } else throw new RuntimeException('Reconnecte le compte pour reprendre la synchronisation.', 401);
    if (empty($fresh['access_token'])) throw new RuntimeException('Le réseau n’a pas renouvelé la connexion.', 401);
    $oldAccess = $token['access_token'];
    $token = array_merge($token, $fresh, ['expires_at'=>time() + (int)($fresh['expires_in'] ?? 3600)]);
    connection_save($account, $token, $oldAccess);
    return $token;
}

function connection_profile(string $account, array $token): array
{
    if (connection_setup($account)['mode'] === 'official') throw new RuntimeException('Suivi API désactivé pour ce réseau.');
    if ($account === 'youtube-ivt' && ($token['mode'] ?? '') === 'api') return connection_youtube_public(connection_config()['youtube']);
    $bearer = ['Authorization: Bearer ' . $token['access_token']];
    $record = ['account'=>$account, 'date'=>date('Y-m-d')];
    $identity = ['id'=>'', 'label'=>''];
    switch ($account) {
        case 'x-xavier':
            $user = connection_http('https://api.x.com/2/users/me?user.fields=public_metrics', $bearer)['data'] ?? [];
            if (strtolower($user['username'] ?? '') !== 'xfenaux') throw new RuntimeException('Connecte le compte X @XFenaux.');
            $identity = ['id'=>$user['id'], 'label'=>'@' . $user['username']];
            $record['followers'] = $user['public_metrics']['followers_count'] ?? null;
            $record['totalPosts'] = $user['public_metrics']['tweet_count'] ?? null;
            break;
        case 'instagram-xavier':
            $user = connection_http('https://graph.instagram.com/me?fields=user_id,username,followers_count,media_count', $bearer);
            if (strtolower($user['username'] ?? '') !== 'xfenaux') throw new RuntimeException('Connecte le compte Instagram @xfenaux.');
            $identity = ['id'=>$user['user_id'] ?? $user['id'], 'label'=>'@' . $user['username']];
            $record['followers'] = $user['followers_count'] ?? null; $record['totalPosts'] = $user['media_count'] ?? null;
            break;
        case 'tiktok-ivt':
            $user = connection_http('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username,follower_count,video_count,likes_count', $bearer)['data']['user'] ?? [];
            if (strtolower($user['username'] ?? '') !== 'interactivtrading') throw new RuntimeException('Connecte le compte TikTok @interactivtrading et autorise la lecture du profil.');
            $identity = ['id'=>$user['open_id'], 'label'=>'@' . $user['username']];
            $record['followers'] = $user['follower_count'] ?? null; $record['totalPosts'] = $user['video_count'] ?? null; $record['totalLikes'] = $user['likes_count'] ?? null;
            break;
        case 'youtube-ivt':
            $channels = connection_http('https://www.googleapis.com/youtube/v3/channels?part=id,snippet,statistics&mine=true', $bearer)['items'] ?? [];
            $expected = connection_config()['youtube']['channel_id'] ?? '';
            $user = null;
            foreach ($channels as $channel) {
                $name = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $channel['snippet']['title'] ?? ''));
                if (($expected && $channel['id'] === $expected) || (!$expected && in_array($name, ['interactivtrading','ivtinteractivtrading'], true))) { $user = $channel; break; }
            }
            if (!$user) throw new RuntimeException('Choisis la chaîne YouTube InteractivTrading lors de la connexion.');
            $identity = ['id'=>$user['id'], 'label'=>$user['snippet']['title']];
            $record['followers'] = !empty($user['statistics']['hiddenSubscriberCount']) ? null : ($user['statistics']['subscriberCount'] ?? null);
            $record['totalPosts'] = $user['statistics']['videoCount'] ?? null; $record['totalViews'] = $user['statistics']['viewCount'] ?? null;
            break;
        case 'twitch-xavier':
            $bearer[] = 'Client-Id: ' . connection_config()['twitch']['client_id'];
            $user = connection_http('https://api.twitch.tv/helix/users', $bearer)['data'][0] ?? [];
            if (strtolower($user['login'] ?? '') !== 'xavierfenaux') throw new RuntimeException('Connecte le compte Twitch xavierfenaux.');
            $identity = ['id'=>$user['id'], 'label'=>$user['display_name']];
            $record['followers'] = connection_http('https://api.twitch.tv/helix/channels/followers?broadcaster_id=' . rawurlencode($user['id']) . '&first=1', $bearer)['total'] ?? null;
            break;
        case 'spotify-xavier':
            $user = connection_http('https://api.spotify.com/v1/me', $bearer);
            $show = connection_http('https://api.spotify.com/v1/shows/4Kka5gOG1cnplAmHB0vGXD?market=FR', $bearer);
            $identity = ['id'=>$user['id'], 'label'=>$show['name'] ?? 'Morning Mood'];
            $record['totalPosts'] = $show['total_episodes'] ?? null;
            break;
    }
    return ['identity'=>$identity, 'record'=>social_record($record, 'API ' . connection_providers()[$account]['key'])];
}
