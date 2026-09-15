<?php
declare(strict_types=1);
require __DIR__ . '/auth.php';
require __DIR__ . '/social-store.php';
require __DIR__ . '/connections-lib.php';
master_require_login();
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
$callback = 'https://xavierfenaux.com/master/connect.php';
try {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (empty($_SESSION['master_csrf']) || !hash_equals($_SESSION['master_csrf'], (string)($_POST['csrf'] ?? ''))) throw new RuntimeException('Session expirée. Recharge la page.');
        $account = (string)($_POST['account'] ?? '');
        $provider = connection_providers()[$account] ?? null;
        if (!$provider) throw new RuntimeException('Réseau inconnu.');
        if (($_POST['action'] ?? '') === 'disconnect') {
            connection_save($account, null);
            $_SESSION['master_flash'] = 'Synchronisation arrêtée. L’historique est conservé. Tu peux aussi retirer l’autorisation dans les réglages du réseau.';
            header('Location: /master/#accounts'); exit;
        }
        $config = connection_config()[$provider['key']] ?? [];
        if (empty($config['client_id']) || empty($config['client_secret'])) throw new RuntimeException('FT doit encore activer l’accès à ce réseau. Tu peux déjà consulter tes statistiques officielles ou ajouter un relevé.');
        $state = bin2hex(random_bytes(32)); $verifier = bin2hex(random_bytes(32));
        $_SESSION['master_oauth'] = ['account'=>$account, 'state'=>$state, 'verifier'=>$verifier, 'created'=>time()];
        $params = ['response_type'=>'code', 'redirect_uri'=>$callback, 'state'=>$state, 'scope'=>$provider['scope']];
        $params[$provider['key'] === 'tiktok' ? 'client_key' : 'client_id'] = $config['client_id'];
        if (!empty($provider['pkce'])) { $params['code_challenge'] = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '='); $params['code_challenge_method'] = 'S256'; }
        if ($provider['key'] === 'youtube') { $params['access_type'] = 'offline'; $params['prompt'] = 'consent'; }
        if ($provider['key'] === 'instagram') { $params['enable_fb_login'] = '0'; $params['force_authentication'] = '1'; }
        header('Location: ' . $provider['authorize'] . '?' . http_build_query($params)); exit;
    }
    $flow = $_SESSION['master_oauth'] ?? null; unset($_SESSION['master_oauth']);
    if (!$flow || time() - $flow['created'] > 600 || !hash_equals($flow['state'], (string)($_GET['state'] ?? ''))) throw new RuntimeException('Cette demande de connexion a expiré. Recommence depuis le cockpit.');
    if (isset($_GET['error']) || empty($_GET['code'])) throw new RuntimeException('Connexion annulée. Tu peux réessayer quand tu veux.');
    $account = $flow['account']; $provider = connection_providers()[$account];
    $fields = ['grant_type'=>'authorization_code', 'code'=>(string)$_GET['code'], 'redirect_uri'=>$callback];
    if (!empty($provider['pkce'])) $fields['code_verifier'] = $flow['verifier'];
    $token = connection_exchange($account, $fields);
    if (empty($token['access_token'])) throw new RuntimeException('La connexion n’a pas été validée par le réseau.');
    if ($provider['key'] === 'instagram') {
        $long = connection_http('https://graph.instagram.com/access_token?' . http_build_query(['grant_type'=>'ig_exchange_token', 'client_secret'=>connection_config()['instagram']['client_secret'], 'access_token'=>$token['access_token']]));
        $token = array_merge($token, $long);
    }
    $profile = connection_profile($account, $token);
    $token = array_merge($token, ['expires_at'=>time() + (int)($token['expires_in'] ?? 3600), 'status'=>'active', 'connected_at'=>date(DATE_ATOM), 'label'=>$profile['identity']['label'], 'user_id'=>$profile['identity']['id']]);
    connection_save($account, $token);
    social_update(static fn(array $data): array => social_merge($data, [$profile['record']]));
    touch(dirname(social_path()) . '/sync-requested');
    $_SESSION['master_flash'] = $profile['identity']['label'] . ' connecté. Le suivi peut commencer.';
} catch (Throwable $error) {
    $_SESSION['master_flash'] = $error instanceof RuntimeException ? $error->getMessage() : 'La connexion n’a pas abouti. Réessaie dans un instant.';
}
header('Location: /master/#accounts');
