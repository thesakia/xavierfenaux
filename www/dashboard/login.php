<?php
declare(strict_types=1);
require __DIR__ . '/auth.php';

if (dashboard_is_authenticated()) {
    header('Location: /dashboard/');
    exit;
}

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = (string) ($_POST['email'] ?? '');
    $password = (string) ($_POST['password'] ?? '');
    if (dashboard_login($email, $password)) {
        header('Location: /dashboard/');
        exit;
    }
    $error = 'Accès refusé. Vérifie l’email et le mot de passe.';
}
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dashboard Xavier Fenaux · Connexion</title>
  <link rel="icon" type="image/png" href="/images/favicon-signature-black.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#f5f1e8;--panel:#fffaf0;--text:#17140f;--muted:#6d6558;--accent:#997733;--line:rgba(23,20,15,.12)}
    *{box-sizing:border-box} body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 20% 10%,rgba(153,119,51,.2),transparent 32%),var(--bg);font-family:Inter,system-ui,sans-serif;color:var(--text)}
    .card{width:min(440px,92vw);background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:28px;box-shadow:0 24px 70px rgba(56,43,20,.14)}
    img{height:56px;margin-bottom:20px}.kicker{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:var(--accent);font-weight:900}h1{margin:8px 0 8px;font-size:30px;line-height:1}.muted{color:var(--muted)}
    label{display:block;font-size:13px;font-weight:900;margin-top:16px}input{width:100%;margin-top:7px;border:1px solid var(--line);border-radius:12px;padding:13px 14px;background:white;font:inherit}
    button{width:100%;border:0;border-radius:999px;margin-top:20px;padding:13px 16px;background:var(--text);color:white;font-weight:900;cursor:pointer}.error{margin-top:14px;color:#b42318;font-weight:700}
  </style>
</head>
<body>
  <form class="card" method="post">
    <img src="/images/SignatureXav.png" alt="Xavier Fenaux">
    <div class="kicker">Dashboard privé</div>
    <h1>Connexion</h1>
    <p class="muted">Accès réservé à xfenaux@gmail.com et fenauxft@gmail.com.</p>
    <label for="email">Email</label>
    <input id="email" name="email" type="email" autocomplete="username" required autofocus>
    <label for="password">Mot de passe</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Entrer dans le dashboard</button>
    <?php if ($error !== ''): ?><p class="error"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></p><?php endif; ?>
  </form>
</body>
</html>
