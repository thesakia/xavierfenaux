<?php
declare(strict_types=1);

function insights_count(mixed $value): ?int
{
    return is_numeric($value) && (float)$value >= 0 && (float)$value <= 1e12 && floor((float)$value) === (float)$value ? (int)$value : null;
}

function insights_post(string $account, array $input): array
{
    $hosts = ['tiktok-ivt'=>['www.tiktok.com','tiktok.com'], 'instagram-ivt'=>['www.instagram.com','instagram.com'],
        'youtube-ivt'=>['www.youtube.com','youtube.com','youtu.be'], 'twitch-xavier'=>['www.twitch.tv','twitch.tv']];
    $parts = parse_url((string)($input['url'] ?? ''));
    if (!$parts || ($parts['scheme'] ?? '') !== 'https' || !in_array($parts['host'] ?? '', $hosts[$account] ?? [], true) || isset($parts['user']) || isset($parts['port'])) throw new RuntimeException('Lien de publication invalide.');
    if (!preg_match('/^[A-Za-z0-9_-]{1,100}$/',(string)($input['id'] ?? '')) || !preg_match('/^\d{4}-\d{2}-\d{2}T/',(string)($input['publishedAt'] ?? ''))) throw new RuntimeException('Publication incomplete.');
    $date = new DateTimeImmutable((string)$input['publishedAt']);
    preg_match('/\A.{0,350}/us',(string)($input['title'] ?? ''),$title);
    $post = ['id'=>(string)$input['id'], 'account'=>$account, 'title'=>$title[0] ?? '',
        'url'=>$input['url'], 'publishedAt'=>$date->format(DATE_ATOM), 'updatedAt'=>date(DATE_ATOM), 'basis'=>'lifetime'];
    foreach (['views','reactions','comments','shares'] as $key) {
        $count = insights_count($input[$key] ?? null);
        if ($count !== null) $post[$key] = $count;
    }
    return $post;
}

function insights_youtube_rows(array $report): array
{
    $headers = array_column($report['columnHeaders'] ?? [], 'name');
    $records = [];
    foreach ($report['rows'] ?? [] as $row) {
        if (count($row) !== count($headers)) throw new RuntimeException('Rapport YouTube incomplet.');
        $r = array_combine($headers, $row);
        $input = ['account'=>'youtube-ivt', 'date'=>$r['day'] ?? ''];
        foreach (['views'=>'views','likes'=>'reactions','comments'=>'comments','shares'=>'shares',
                  'subscribersGained'=>'followersGained','subscribersLost'=>'followersLost','estimatedMinutesWatched'=>'watchMinutes'] as $from=>$to) {
            if (array_key_exists($from, $r)) $input[$to] = $r[$from];
        }
        $records[] = social_record($input, 'YouTube Analytics (jour du reseau, heure du Pacifique)');
    }
    return $records;
}

function insights_instagram_row(array $report, string $day): ?array
{
    $input = ['account'=>'instagram-ivt', 'date'=>$day];
    $map = ['views'=>'views','likes'=>'reactions','comments'=>'comments','shares'=>'shares','saves'=>'saves'];
    foreach ($report['data'] ?? [] as $metric) {
        $key = $map[$metric['name'] ?? ''] ?? null;
        $value = insights_count($metric['total_value']['value'] ?? null);
        if ($key && $value !== null) $input[$key] = $value;
    }
    return count($input) > 2 ? social_record($input, 'Instagram Insights (intervalle UTC)') : null;
}

function insights_collect(string $account, array $token, ?callable $request = null): array
{
    $http = $request ?? 'connection_http';
    $headers = ['Authorization: Bearer '.$token['access_token']];
    $result = ['records'=>[], 'posts'=>null, 'warnings'=>[], 'checkedAt'=>date(DATE_ATOM)];
    if ($account === 'youtube-ivt') {
        try {
            $query = ['ids'=>'channel==MINE','startDate'=>date('Y-m-d',strtotime('-90 days')), 'endDate'=>date('Y-m-d',strtotime('-1 day')),
                'metrics'=>'views,likes,comments,shares,subscribersGained,subscribersLost,estimatedMinutesWatched','dimensions'=>'day','sort'=>'day'];
            $result['records'] = insights_youtube_rows($http('https://youtubeanalytics.googleapis.com/v2/reports?'.http_build_query($query),$headers));
        } catch (Throwable $e) { $result['warnings'][] = 'Les statistiques quotidiennes YouTube ne sont pas accessibles. Verifie les droits Analytics.'; }
        return $result;
    }
    if ($account === 'instagram-ivt') {
        // Fetch each UTC interval separately: total_value over seven days is NOT seven daily values.
        $utc = new DateTimeImmutable('today', new DateTimeZone('UTC'));
        for ($i=1; $i<=7; $i++) {
            $start = $utc->modify('-'.$i.' days');
            $query = ['metric'=>'views,likes,comments,shares,saves','period'=>'day','metric_type'=>'total_value',
                'since'=>$start->getTimestamp(),'until'=>$start->modify('+1 day')->getTimestamp()];
            try {
                $row = insights_instagram_row($http('https://graph.instagram.com/'.rawurlencode($token['user_id']).'/insights?'.http_build_query($query),$headers),$start->format('Y-m-d'));
                if ($row) $result['records'][] = $row;
                else $result['warnings'][] = 'Aucun detail quotidien Instagram disponible pour certains jours.';
            } catch (Throwable $e) {
                $result['warnings'][] = 'Le detail Instagram est indisponible. Verifie le compte professionnel et les droits Insights.';
                break;
            }
        }
        try {
            $query = ['fields'=>'id,caption,permalink,timestamp,like_count,comments_count','limit'=>50];
            $items = $http('https://graph.instagram.com/'.rawurlencode($token['user_id']).'/media?'.http_build_query($query),$headers);
            if (!isset($items['data']) || !is_array($items['data'])) throw new RuntimeException('Liste Instagram incomplete.');
            $result['posts'] = [];
            foreach ($items['data'] ?? [] as $item) $result['posts'][] = insights_post($account,
                ['id'=>$item['id'],'title'=>$item['caption'] ?? '', 'url'=>$item['permalink'],'publishedAt'=>$item['timestamp'],
                 'reactions'=>$item['like_count'] ?? null,'comments'=>$item['comments_count'] ?? null]);
            $result['postsComplete'] = empty($items['paging']['next']);
        } catch (Throwable $e) { $result['posts']=null; $result['warnings'][]='Les publications Instagram ne sont pas accessibles.'; }
    } elseif ($account === 'tiktok-ivt') {
        try {
            $cursor = null; $posts = []; $hasMore = true;
            for ($page=0; $page<5 && $hasMore; $page++) {
                $body = ['max_count'=>20];
                if ($cursor !== null) $body['cursor'] = $cursor;
                $response = $http('https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,share_url,create_time,view_count,like_count,comment_count,share_count',$headers,$body,true);
                $data = $response['data'] ?? [];
                if (!isset($data['videos']) || !is_array($data['videos'])) throw new RuntimeException('Liste TikTok incomplete.');
                foreach ($data['videos'] as $item) {
                    $post = insights_post($account,['id'=>$item['id'],'title'=>$item['title'] ?? $item['video_description'] ?? '',
                        'url'=>$item['share_url'],'publishedAt'=>gmdate(DATE_ATOM,(int)$item['create_time']),
                        'views'=>$item['view_count'] ?? null,'reactions'=>$item['like_count'] ?? null,
                        'comments'=>$item['comment_count'] ?? null,'shares'=>$item['share_count'] ?? null]);
                    $posts[$post['id']] = $post;
                }
                $hasMore = !empty($data['has_more']); $next = $data['cursor'] ?? null;
                if ($hasMore && (!$data['videos'] || $next === $cursor || $next === null)) throw new RuntimeException('Pagination TikTok incomplete.');
                $cursor = $next;
            }
            $result['posts'] = array_values($posts); $result['postsComplete'] = !$hasMore;
        } catch (Throwable $e) { $result['warnings'][]='Les statistiques des videos TikTok sont indisponibles. Autorise la lecture des videos.'; }
    } elseif ($account === 'twitch-xavier') {
        $headers[] = 'Client-Id: '.connection_config()['twitch']['client_id'];
        try {
            $stream = $http('https://api.twitch.tv/helix/streams?user_id='.rawurlencode($token['user_id']),$headers)['data'];
            $result['live'] = ['online'=>count($stream)>0,'viewers'=>isset($stream[0]) ? insights_count($stream[0]['viewer_count'] ?? null) : null,'checkedAt'=>date(DATE_ATOM)];
            $videos = $http('https://api.twitch.tv/helix/videos?'.http_build_query(['user_id'=>$token['user_id'],'first'=>100,'type'=>'archive']),$headers);
            if (!isset($videos['data']) || !is_array($videos['data'])) throw new RuntimeException('Liste Twitch incomplete.');
            $result['posts'] = [];
            foreach ($videos['data'] ?? [] as $item) $result['posts'][] = insights_post($account,
                ['id'=>$item['id'],'title'=>$item['title'],'url'=>$item['url'],'publishedAt'=>$item['published_at'],'views'=>$item['view_count'] ?? null]);
            $result['postsComplete'] = empty($videos['pagination']['cursor']);
        } catch (Throwable $e) { $result['warnings'][]='Le direct ou les replays Twitch ne sont pas accessibles.'; }
    }
    $result['warnings'] = array_values(array_unique($result['warnings']));
    return $result;
}

function insights_save(string $account, array $result): void
{
    social_update(static function(array $data) use ($account,$result): array {
        $data = social_merge($data,$result['records']);
        $old = $data['details'][$account] ?? [];
        // A failed collector never erases the last successful publication snapshot.
        if ($result['posts'] !== null) {
            $old['posts'] = $result['posts']; $old['postsComplete'] = $result['postsComplete'] ?? false;
            $old['postsUpdatedAt'] = $result['checkedAt'];
        }
        if (isset($result['live'])) $old['live'] = $result['live'];
        $old['warnings'] = $result['warnings'];
        $old['checkedAt'] = $result['checkedAt'];
        $data['details'][$account] = $old;
        return $data;
    });
}
