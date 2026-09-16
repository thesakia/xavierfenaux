<?php
declare(strict_types=1);
require __DIR__ . '/auth.php';
require __DIR__ . '/services.php';
header('Cache-Control: no-store');
$error = '';
if (isset($_GET['logout'])) { master_logout(); header('Location: /master/'); exit; }
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (master_verify_login(trim((string)($_POST['username'] ?? '')), (string)($_POST['password'] ?? ''))) {
        master_login();
        $next = $_SESSION['master_next_tool'] ?? '';
        unset($_SESSION['master_next_tool']);
        header('Location: ' . ($next ? '/master/launch.php?tool=' . rawurlencode($next) : '/master/')); exit;
    }
    $error = 'Ces identifiants ne correspondent pas. Réessaie.';
}
$loggedIn = master_is_logged_in();
$_SESSION['master_csrf'] = $_SESSION['master_csrf'] ?? bin2hex(random_bytes(32));
$csrf = $_SESSION['master_csrf'];
$flash = $_SESSION['master_flash'] ?? null;
unset($_SESSION['master_flash']);
session_write_close();
$services = array_values(array_filter(master_services(), static fn(array $s): bool => $s['category'] !== 'Reseaux'));
$services = array_map(static function(array $s): array { unset($s['statusCheck']); return $s; }, $services);
$socialBoot = null;
if ($loggedIn) {
    require __DIR__ . '/social-store.php';
    require __DIR__ . '/connections-lib.php';
    $connections = [];
    try { $connections = connection_public(); }
    catch (Throwable $error) { error_log('Master connection directory unavailable: ' . $error->getMessage()); }
    // The account directory must not depend on analytics or service health requests.
    $socialBoot = ['accounts'=>social_accounts(), 'connections'=>$connections, 'records'=>[], 'sync'=>[]];
}
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#f7f9f8">
  <title>Le cockpit de Xavier</title>
  <link rel="stylesheet" href="/master/cockpit.css?v=8">
  <script defer src="/master/lucide.min.js"></script>
  <?php if ($loggedIn): ?><script defer src="/master/chart.umd.js"></script><?php endif; ?>
</head>
<body>
<?php if (!$loggedIn): ?>
  <main class="login-screen">
    <form class="login-box" method="post" action="/master/">
      <div class="avatar lea" role="img" aria-label="Léa, ton assistante"></div>
      <span class="eyebrow">L’ESPACE DE XAVIER</span>
      <h1>Prêt pour la suite ?</h1><p>Heureuse de te retrouver.<br>Ton cockpit t’attend.</p>
      <?php if ($error): ?><p class="form-error" role="alert"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></p><?php endif; ?>
      <label for="username">Identifiant</label><input id="username" name="username" autocomplete="username" required autofocus>
      <label for="password">Mot de passe</label><input id="password" name="password" type="password" autocomplete="current-password" required>
      <button class="primary" type="submit">Entrer dans mon cockpit <span aria-hidden="true">&rarr;</span></button>
      <small>Xavier Fenaux &amp; Interactiv Trading</small>
    </form>
  </main>
<?php else: ?>
  <div class="app">
    <aside class="sidebar">
      <a class="brand" href="#home"><span class="brand-mark">xf.</span><span><strong>Le cockpit</strong><small>Xavier Fenaux</small></span></a>
      <span class="nav-label">MON ESPACE</span>
      <nav aria-label="Navigation principale">
        <a href="#home" data-view="home"><i data-lucide="layout-dashboard"></i>Vue d’ensemble</a>
        <a href="#social" data-view="social"><i data-lucide="chart-no-axes-combined"></i>Statistiques réseaux</a>
        <a href="#analytics" data-view="analytics"><i data-lucide="mouse-pointer-2"></i>Analytics</a>
        <a href="#content" data-view="content"><i data-lucide="clapperboard"></i>Créer du contenu</a>
        <a href="/brief-mood/"><i data-lucide="notebook-pen"></i>Brief Mood</a>
        <a href="#markets" data-view="markets"><i data-lucide="radar"></i>Ma veille</a>
        <a href="#tools" data-view="tools"><i data-lucide="grid-2x2"></i>Tous mes outils</a>
        <a href="#accounts" data-view="accounts" class="mobile-accounts"><i data-lucide="plug"></i>Mes comptes</a>
      </nav>
      <div class="sidebar-bottom">
        <button class="nav-help" data-guide="welcome"><i data-lucide="circle-help"></i>Un coup de main ?</button>
        <div class="profile"><img src="/images/events/speaker-portrait-color.webp" alt="Xavier Fenaux"><span><strong>Xavier</strong><small>Espace personnel</small></span><a href="/master/?logout=1" class="icon-button" title="Se déconnecter" aria-label="Se déconnecter"><i data-lucide="log-out"></i></a></div>
      </div>
    </aside>
    <div class="main-shell">
      <header class="topbar"><span id="breadcrumb">Mon espace <b>/</b> Vue d’ensemble</span><div><span id="today"></span><button id="refresh" class="icon-button" title="Actualiser les données" aria-label="Actualiser les données"><i data-lucide="refresh-cw"></i></button><a class="mobile-logout icon-button" href="/master/?logout=1" title="Se déconnecter" aria-label="Se déconnecter"><i data-lucide="log-out"></i></a></div></header>
      <main id="main" tabindex="-1"></main>
      <footer><span>Xavier Fenaux <b>×</b> Interactiv Trading</span><span id="sync-label" role="status">Lecture des données…</span></footer>
    </div>
  </div>
  <dialog id="guide-dialog" aria-labelledby="guide-title"><button class="dialog-close icon-button" data-close title="Fermer" aria-label="Fermer"><i data-lucide="x"></i></button><div id="guide-body"></div></dialog>
  <dialog id="data-dialog" aria-labelledby="data-title"><button class="dialog-close icon-button" data-close title="Fermer" aria-label="Fermer"><i data-lucide="x"></i></button><div id="data-body"></div></dialog>
  <div id="toast" class="toast" role="status" hidden></div>
  <script id="boot" type="application/json"><?= json_encode(['services'=>$services, 'csrf'=>$csrf, 'flash'=>$flash, 'social'=>$socialBoot], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE) ?></script>
  <script defer src="/master/metrics.js?v=4"></script>
  <script defer src="/master/cockpit.js?v=10"></script>
<?php endif; ?>
</body>
</html>
