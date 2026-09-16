<?php
declare(strict_types=1);
$dir = sys_get_temp_dir().'/xavier-insights-'.bin2hex(random_bytes(8));
mkdir($dir,0700);
putenv('MASTER_SOCIAL_FILE='.$dir.'/social.json');
require dirname(__DIR__).'/www/master/social-store.php';
require dirname(__DIR__).'/www/master/insights-lib.php';
function expect(bool $ok,string $label): void { if (!$ok) throw new RuntimeException($label); }
try {
    $yesterday = gmdate('Y-m-d',strtotime('-1 day'));
    $report = ['columnHeaders'=>array_map(static fn($n)=>['name'=>$n],['day','views','likes','comments','shares','subscribersGained','subscribersLost','estimatedMinutesWatched']),
        'rows'=>[[$yesterday,100,12,3,2,8,1,125]]];
    $row = insights_youtube_rows($report)[0];
    expect($row['views']===100 && $row['followersGained']===8 && $row['followersLost']===1 && $row['watchMinutes']===125,'YouTube daily details');
    expect(!isset($row['followers']),'new subscribers are not total followers');
    $ig = insights_instagram_row(['data'=>[['name'=>'views','total_value'=>['value'=>0]],['name'=>'likes','total_value'=>['value'=>12]]]],$yesterday);
    expect($ig['views']===0 && $ig['reactions']===12 && !isset($ig['shares']),'zero preserved, unavailable omitted');
    expect(insights_instagram_row(['data'=>[['name'=>'views','values'=>[['value'=>100]]]]],$yesterday)===null,'no guessed total from unknown response');
    $calls=0;
    $collected = insights_collect('instagram-xavier',['access_token'=>'secret-test','user_id'=>'42'],static function($url) use (&$calls): array {
        if (str_contains($url,'/media?')) return ['data'=>[]];
        parse_str(parse_url($url,PHP_URL_QUERY),$query);
        expect((int)$query['until']-(int)$query['since']===86400,'Instagram exact UTC day');
        expect($query['metric_type']==='total_value','explicit aggregation');
        $calls++;
        return ['data'=>[['name'=>'views','total_value'=>['value'=>100]]]];
    });
    expect($calls===7 && count($collected['records'])===7,'seven individual daily reports');
    expect(count(array_unique(array_column($collected['records'],'date')))===7,'no duplicate days');
    $pages=0;
    $tiktok = insights_collect('tiktok-ivt',['access_token'=>'secret-test'],static function($url,$headers,$body,$json) use (&$pages): array {
        expect($json===true && $body['max_count']===20,'TikTok JSON request');
        $pages++;
        return ['data'=>['videos'=>[['id'=>(string)$pages,'title'=>'Test video','share_url'=>'https://www.tiktok.com/@interactivtrading/video/'.$pages,
            'create_time'=>time()-86400,'view_count'=>1000,'like_count'=>10,'comment_count'=>2,'share_count'=>1]],'has_more'=>$pages<2,'cursor'=>$pages]];
    });
    expect($pages===2 && count($tiktok['posts'])===2 && $tiktok['postsComplete'],'pagination collected');
    expect($tiktok['records']===[] && $tiktok['posts'][0]['basis']==='lifetime','lifetime counts never enter daily totals');
    expect(!str_contains(json_encode($tiktok),'secret-test'),'no credentials stored');
    insights_save('tiktok-ivt',$tiktok);
    $failed = insights_collect('tiktok-ivt',['access_token'=>'secret-test'],static function(): array { throw new RuntimeException('upstream secret'); });
    insights_save('tiktok-ivt',$failed);
    $stored=social_read()['details']['tiktok-ivt'];
    expect(count($stored['posts'])===2 && count($stored['warnings'])===1,'old snapshots preserved on outage');
    expect(!str_contains(json_encode($stored),'upstream secret'),'upstream error bodies redacted');
    $bounded = insights_collect('tiktok-ivt',['access_token'=>'secret-test'],static function($url,$headers,$body): array {
        $cursor=($body['cursor'] ?? 0)+1;
        return ['data'=>['videos'=>[['id'=>(string)$cursor,'share_url'=>'https://www.tiktok.com/@interactivtrading/video/'.$cursor,
            'create_time'=>time(),'view_count'=>100]],'has_more'=>true,'cursor'=>$cursor]];
    });
    expect(count($bounded['posts'])===5 && !$bounded['postsComplete'],'pagination bounded without claiming complete history');
    try { insights_post('tiktok-ivt',['id'=>'bad','url'=>'javascript:alert(1)','publishedAt'=>$yesterday]); throw new LogicException('unsafe URL accepted'); }
    catch (RuntimeException $e) {}
    expect(insights_count(-1)===null && insights_count(1.5)===null && insights_count(null)===null,'invalid counts omitted');
    echo "Insights: daily windows, subscriber/watch metrics, TikTok pagination, cumulative separation, outage preservation and redaction passed\n";
} finally { foreach(glob($dir.'/*') as $file) unlink($file); rmdir($dir); }
