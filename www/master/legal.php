<?php
declare(strict_types=1);
$terms = ($_GET['page'] ?? '') === 'terms';
$title = $terms ? "Conditions d'utilisation" : 'Confidentialite';
header('Content-Type: text/html; charset=utf-8');
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= $title ?> | Xavier Master</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font: 16px/1.7 system-ui, sans-serif; color: #25302b; background: #fff; }
    main { max-width: 800px; padding: 40px 24px 64px; margin: auto; }
    a { color: #18765b; overflow-wrap: anywhere; }
    h1 { font-size: 30px; line-height: 1.2; margin-top: 32px; }
    h2 { font-size: 20px; margin: 28px 0 8px; }
    nav { display: flex; flex-wrap: wrap; gap: 12px 24px; border-top: 1px solid #dce3de; padding-top: 20px; margin-top: 32px; }
    .date { color: #5f6b65; font-size: 14px; }
  </style>
</head>
<body><main>
  <a href="/master/">Xavier Master &middot; Le cockpit de Xavier</a>
  <?php if ($terms): ?>
  <h1>Conditions d'utilisation</h1>
  <p class="date">Mise &agrave; jour : 17 septembre 2026</p>
  <h2>Un espace priv&eacute;</h2>
  <p>Xavier Master est le cockpit priv&eacute; de Xavier Fenaux et de son &eacute;quipe. Il regroupe leurs outils et le suivi de leurs comptes sociaux. L'acc&egrave;s est r&eacute;serv&eacute; aux personnes autoris&eacute;es ; il ne propose ni inscription publique ni abonnement payant.</p>
  <h2>Connexion des comptes</h2>
  <p>Vous devez &ecirc;tre propri&eacute;taire du compte connect&eacute; ou autoris&eacute; &agrave; le g&eacute;rer. La connexion passe par l'&eacute;cran d'autorisation du r&eacute;seau concern&eacute;. N'entrez jamais votre mot de passe TikTok dans le cockpit. Les autorisations demand&eacute;es pour TikTok concernent uniquement le profil, ses compteurs et les vid&eacute;os publiques. Cette int&eacute;gration ne publie pas de contenu et n'acc&egrave;de pas aux messages priv&eacute;s.</p>
  <h2>Lecture des statistiques</h2>
  <p>Les chiffres d&eacute;pendent des donn&eacute;es et autorisations fournies par chaque plateforme. Ils peuvent &ecirc;tre retard&eacute;s, incomplets ou indisponibles. Les compteurs cumul&eacute;s ne sont pas des r&eacute;sultats quotidiens. Le cockpit ne garantit pas l'acc&egrave;s permanent aux API ; les conditions du r&eacute;seau concern&eacute; restent applicables.</p>
  <h2>S&eacute;curit&eacute; et fin de connexion</h2>
  <p>Gardez vos acc&egrave;s confidentiels et signalez tout acc&egrave;s non autoris&eacute;. Vous pouvez d&eacute;connecter un r&eacute;seau dans &laquo; Mes comptes &raquo; et r&eacute;voquer son autorisation depuis les param&egrave;tres de ce r&eacute;seau. Pour supprimer les donn&eacute;es d&eacute;j&agrave; enregistr&eacute;es ou demander la fermeture de votre acc&egrave;s, contactez <a href="mailto:fenauxft@gmail.com">fenauxft@gmail.com</a>.</p>
  <?php else: ?>
  <h1>Politique de confidentialit&eacute;</h1>
  <p class="date">Mise &agrave; jour : 17 septembre 2026</p>
  <h2>Service concern&eacute; et contact</h2>
  <p>Cette page d&eacute;crit le traitement des donn&eacute;es de connexion et des statistiques sociales dans Xavier Master, le cockpit priv&eacute; de Xavier Fenaux et de son &eacute;quipe. Pour toute question, demande d'acc&egrave;s, de correction ou de suppression : <a href="mailto:fenauxft@gmail.com">fenauxft@gmail.com</a>.</p>
  <h2>Donn&eacute;es utilis&eacute;es</h2>
  <p>Lorsque vous autorisez TikTok, le cockpit re&ccedil;oit un identifiant de compte, les informations de profil accessibles, des jetons d'acc&egrave;s et de renouvellement, le nombre d'abonn&eacute;s, de vid&eacute;os et de mentions J'aime, ainsi que les informations et compteurs des vid&eacute;os publiques : vues, J'aime, commentaires et partages. Il ne re&ccedil;oit pas votre mot de passe TikTok, vos messages priv&eacute;s ni la liste nominative de vos abonn&eacute;s.</p>
  <h2>Finalit&eacute; et acc&egrave;s</h2>
  <p>Ces donn&eacute;es servent &agrave; identifier le compte autoris&eacute;, actualiser le tableau de bord et suivre l'&eacute;volution de ses performances. Elles sont accessibles aux utilisateurs autoris&eacute;s du cockpit et &agrave; son administrateur technique. Les prestataires d'h&eacute;bergement assurent le stockage technique. La connexion utilise les API du r&eacute;seau concern&eacute;. Les donn&eacute;es sociales ne sont ni vendues ni utilis&eacute;es pour du ciblage publicitaire.</p>
  <h2>Stockage et conservation</h2>
  <p>Les identifiants techniques de connexion sont conserv&eacute;s sur le serveur, hors des fichiers publics du site. Les jetons servent &agrave; synchroniser le compte tant que la connexion reste active. La d&eacute;connexion depuis &laquo; Mes comptes &raquo; supprime les jetons enregistr&eacute;s par le cockpit. Les relev&eacute;s statistiques d&eacute;j&agrave; collect&eacute;s restent dans l'historique tant qu'ils sont utilis&eacute;s pour le suivi du compte ou jusqu'&agrave; une demande de suppression ; la d&eacute;connexion seule ne les efface pas.</p>
  <h2>Vos choix et la suppression</h2>
  <p>Vous pouvez refuser la connexion, la d&eacute;connecter dans le cockpit et r&eacute;voquer l'autorisation dans les param&egrave;tres TikTok. Pour obtenir ou supprimer les donn&eacute;es conserv&eacute;es, &eacute;crivez &agrave; <a href="mailto:fenauxft@gmail.com">fenauxft@gmail.com</a> en indiquant le compte concern&eacute;. Une v&eacute;rification de votre autorit&eacute; sur ce compte peut &ecirc;tre n&eacute;cessaire. La suppression concerne les donn&eacute;es du cockpit, pas celles h&eacute;berg&eacute;es par TikTok.</p>
  <h2>Session et services externes</h2>
  <p>Le cockpit utilise des cookies de session et de connexion persistante pour maintenir l'acc&egrave;s &agrave; l'espace priv&eacute;. Les pages des r&eacute;seaux sociaux ouvertes pour l'authentification ou la consultation sont r&eacute;gies par leurs propres politiques de confidentialit&eacute;.</p>
  <?php endif; ?>
  <nav aria-label="Informations du service"><a href="/master/legal.php?page=terms">Conditions d'utilisation</a><a href="/master/legal.php">Confidentialit&eacute;</a><a href="mailto:fenauxft@gmail.com">Contact</a></nav>
</main></body></html>
