<?php
declare(strict_types=1);
require __DIR__ . '/auth.php';
require __DIR__ . '/social-store.php';
require __DIR__ . '/connections-lib.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if (!master_is_logged_in()) { http_response_code(401); echo json_encode(['error'=>'Reconnecte-toi pour continuer.']); exit; }
$csrf = $_SESSION['master_csrf'] ?? '';
session_write_close();
try {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!$csrf || !hash_equals($csrf, $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) { http_response_code(403); throw new InvalidArgumentException('Session expirée. Recharge la page.'); }
        if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 1048576) throw new InvalidArgumentException('Fichier trop volumineux (1 Mo maximum).');
        $input = json_decode(file_get_contents('php://input'), true, 64, JSON_THROW_ON_ERROR);
        if (($input['action'] ?? '') === 'sync') {
            touch(dirname(social_path()) . '/sync-requested');
        } elseif (($input['action'] ?? '') === 'account') {
            $account = $input['account'] ?? '';
            $base = array_column(social_accounts(), null, 'id')[$account] ?? null;
            if (!$base) throw new InvalidArgumentException('Compte inconnu.');
            if ($base['verified']) throw new InvalidArgumentException('Ce compte est déjà confirmé.');
            $url = trim((string)($input['url'] ?? ''));
            $parts = parse_url($url);
            $hosts = ['X'=>['x.com','twitter.com','www.x.com'], 'Instagram'=>['instagram.com','www.instagram.com'], 'TikTok'=>['tiktok.com','www.tiktok.com'], 'YouTube'=>['youtube.com','www.youtube.com']];
            if (!$parts || ($parts['scheme'] ?? '') !== 'https' || !in_array(strtolower($parts['host'] ?? ''), $hosts[$base['network']], true) || isset($parts['user']) || isset($parts['port']) || !preg_match('~^/(?:@?[a-zA-Z0-9_.-]+|(?:c|channel)/[a-zA-Z0-9_.-]+)/?$~', $parts['path'] ?? '')) throw new InvalidArgumentException('Ajoute le lien HTTPS du profil sur le bon réseau.');
            $url = 'https://' . strtolower($parts['host']) . rtrim($parts['path'], '/') . '/';
            social_update(static function(array $data) use ($account, $url, $parts): array {
                $changed = isset($data['accounts'][$account]) && $data['accounts'][$account]['url'] !== $url;
                if ($changed) throw new InvalidArgumentException('Ce profil a déjà été enregistré. Contacte FT pour le remplacer sans mélanger les historiques.');
                $data['accounts'][$account] = ['url'=>$url, 'handle'=>basename($parts['path']), 'verified'=>true, 'source'=>'Confirmé dans le cockpit'];
                return $data;
            });
        } else {
            $records = [];
            if (($input['action'] ?? '') === 'import') {
                $csv = (string)($input['csv'] ?? '');
                $stream = fopen('php://temp', 'r+');
                fwrite($stream, preg_replace('/^\xEF\xBB\xBF/', '', $csv)); rewind($stream);
                $first = fgets($stream); rewind($stream);
                $delimiter = substr_count((string)$first, ';') > substr_count((string)$first, ',') ? ';' : ',';
                $header = fgetcsv($stream, 0, $delimiter);
                $required = ['date','followers','posts','reactions','views','comments','shares'];
                if (!$header || count($header) !== count($required) || array_diff($required, $header)) throw new InvalidArgumentException('Utilise le modèle CSV proposé : date, followers, posts, reactions, views, comments, shares.');
                while (($row = fgetcsv($stream, 0, $delimiter)) !== false) {
                    if ($row === [null]) continue;
                    if (count($row) !== count($header)) throw new InvalidArgumentException('Une ligne CSV est incomplète.');
                    $item = array_combine($header, $row); $item['account'] = $input['account'] ?? '';
                    $records[] = social_record($item, 'Import CSV');
                    if (count($records) > 1500) throw new InvalidArgumentException('Import limité à 1 500 lignes.');
                }
                fclose($stream);
                if (!$records) throw new InvalidArgumentException('Le fichier ne contient aucun relevé.');
            } else { $records[] = social_record($input, 'Relevé manuel'); }
            social_update(static fn(array $data): array => social_merge($data, $records));
        }
    } elseif ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }
    $data = social_read();
    $accounts = array_map(static fn(array $account): array => array_merge($account, $data['accounts'][$account['id']] ?? []), social_accounts());
    echo json_encode(['accounts'=>$accounts, 'records'=>array_values($data['records']), 'sync'=>$data['sync'] ?? [], 'connections'=>connection_public(), 'generatedAt'=>date(DATE_ATOM)], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (InvalidArgumentException | JsonException $error) {
    if (http_response_code() < 400) http_response_code(422);
    echo json_encode(['error'=>$error->getMessage()]);
} catch (Throwable $error) { http_response_code(503); error_log('Master social: ' . $error->getMessage()); echo json_encode(['error'=>'Les statistiques sont momentanément indisponibles. Réessaie dans un instant.']); }
