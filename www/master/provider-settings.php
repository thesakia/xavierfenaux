<?php
declare(strict_types=1);
require __DIR__ . '/auth.php';
require __DIR__ . '/social-store.php';
require __DIR__ . '/connections-lib.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if (!master_is_logged_in()) { http_response_code(401); echo '{"error":"Connexion requise."}'; exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo '{"error":"POST requis."}'; exit; }
if (empty($_SESSION['master_csrf']) || !hash_equals($_SESSION['master_csrf'], (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) { http_response_code(403); echo '{"error":"Session expirée."}'; exit; }
session_write_close();
try {
    $raw = file_get_contents('php://input', false, null, 0, 8193);
    if (strlen($raw)>8192) throw new InvalidArgumentException('Paramètres trop volumineux.');
    $input = json_decode($raw, true, 16, JSON_THROW_ON_ERROR);
    if (!is_array($input) || !is_string($input['account'] ?? null)) throw new InvalidArgumentException('Compte requis.');
    $account = $input['account'];
    $config = connection_settings($account, $input);
    $profile = ($input['mode'] ?? '') === 'api' ? connection_youtube_public($config) : null;
    $key = connection_providers()[$account]['key'];
    master_store_update(dirname(social_path()).'/providers.json', [], static function(array $data) use ($key, $config): array {
        $data[$key] = array_replace($data[$key] ?? [], $config);
        return $data;
    });
    if ($profile) {
        connection_save($account, ['mode'=>'api', 'status'=>'active', 'user_id'=>$profile['identity']['id'], 'label'=>$profile['identity']['label'], 'connected_at'=>date(DATE_ATOM)]);
        social_update(static fn(array $data): array => social_merge($data, [$profile['record']]));
        touch(dirname(social_path()).'/sync-requested');
    }
    echo json_encode(['ok'=>true, 'connections'=>connection_public(), 'mode'=>$input['mode'] ?? 'oauth']);
} catch (Throwable $error) {
    http_response_code(400);
    echo json_encode(['error'=>$error instanceof InvalidArgumentException || $error instanceof RuntimeException ? $error->getMessage() : 'Paramètres invalides.']);
}
