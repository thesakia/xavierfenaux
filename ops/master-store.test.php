<?php
declare(strict_types=1);
require dirname(__DIR__) . '/www/master/social-store.php';
function check(bool $value, string $message): void { if (!$value) throw new RuntimeException($message); }
$a = social_record(['account'=>'x-xavier','date'=>'2026-01-01','followers'=>100,'posts'=>0], 'manual');
$data = social_merge(['records'=>[]], [$a]);
$b = social_record(['account'=>'x-xavier','date'=>'2026-01-01','followers'=>105,'posts'=>''], 'API');
$data = social_merge($data, [$b]);
check(count($data['records']) === 1, 'same date must upsert');
$row = array_values($data['records'])[0];
check($row['followers'] === 105 && $row['posts'] === 0, 'blank must preserve real zero');
check($row['sources']['posts'] === 'manual' && $row['sources']['followers'] === 'API', 'keep source per field');
foreach ([['account'=>'bad','date'=>'2026-01-01','posts'=>1],['account'=>'x-xavier','date'=>'2026-02-30','posts'=>1],['account'=>'x-xavier','date'=>'2026-01-01','posts'=>-1],['account'=>'x-xavier','date'=>'2026-01-01','posts'=>1.5],['account'=>'x-xavier','date'=>'2026-01-01','posts'=>'']] as $invalid) {
    try { social_record($invalid,'test'); throw new RuntimeException('invalid record accepted'); }
    catch (InvalidArgumentException $expected) {}
}
echo "Store validation and idempotency: passed\n";
