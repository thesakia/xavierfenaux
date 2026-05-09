<?php
/**
 * Page Actualités - xavierfenaux.com
 * Design calé sur les rapports de journée IVT (violet, Montserrat, bg-soft)
 * 
 * STRUCTURE ATTENDUE :
 * /actualites/
 *   index.php                     ← cette page
 *   2026-02-18-rapport/
 *     index.html                  ← l'article complet
 *   2026-02-17-rapport/
 *     index.html
 * 
 * BALISES META À AJOUTER DANS LE <head> DE CHAQUE ARTICLE :
 *   <meta name="article-title" content="Ce que les abonnés IVT ont vécu le 18 février">
 *   <meta name="article-date" content="2026-02-18">
 *   <meta name="article-summary" content="41 notifications, 7 coachs actifs, 13h+ de couverture...">
 *   <meta name="article-category" content="Rapport de journée">
 *   <meta name="article-notifs" content="41">
 *   <meta name="article-coachs" content="7">
 *   <meta name="article-coverage" content="13h+">
 *   <meta name="article-likes" content="1 719">
 */

function getArticles($dir) {
    $articles = [];
    $folders = glob($dir . '/*/index.html');
    
    foreach ($folders as $file) {
        $html = file_get_contents($file);
        $folder = basename(dirname($file));
        
        $data = [
            'title' => '', 'date' => '', 'summary' => '',
            'category' => 'Rapport de journée',
            'notifs' => '', 'coachs' => '', 'coverage' => '', 'likes' => '',
            'url' => $folder . '/',
        ];
        
        $metaMap = [
            'article-title' => 'title', 'article-date' => 'date',
            'article-summary' => 'summary', 'article-category' => 'category',
            'article-notifs' => 'notifs', 'article-coachs' => 'coachs',
            'article-coverage' => 'coverage', 'article-likes' => 'likes',
        ];
        
        foreach ($metaMap as $metaName => $key) {
            if (preg_match('/<meta\s+name=["\']' . $metaName . '["\']\s+content=["\']([^"\']+)["\']/i', $html, $m)) {
                $data[$key] = $m[1];
            }
        }
        
        if (!$data['title'] && preg_match('/<title>([^<]+)<\/title>/i', $html, $m)) $data['title'] = $m[1];
        if (!$data['title'] && preg_match('/<h1[^>]*>([^<]+)<\/h1>/i', $html, $m)) $data['title'] = trim($m[1]);
        // Fallback date from folder name: IVTddmmyyyy format (ex: IVT19022026)
        if (!$data['date'] && preg_match('/^IVT(\d{2})(\d{2})(\d{4})$/i', $folder, $m)) {
            $data['date'] = $m[3] . '-' . $m[2] . '-' . $m[1]; // Convert to YYYY-MM-DD
        }
        // Fallback date from folder name: YYYY-MM-DD format
        if (!$data['date'] && preg_match('/^(\d{4}-\d{2}-\d{2})/', $folder, $m)) $data['date'] = $m[1];
        
        if ($data['title']) {
            $data['title'] = htmlspecialchars($data['title']);
            $data['summary'] = htmlspecialchars($data['summary']);
            $data['category'] = htmlspecialchars($data['category']);
            $articles[] = $data;
        }
    }
    
    usort($articles, function($a, $b) { return strcmp($b['date'], $a['date']); });
    return $articles;
}

$articles = getArticles(__DIR__);
$featured = !empty($articles) ? $articles[0] : null;
$rest = array_slice($articles, 1);

function dateFR($d) {
    if (!$d) return '';
    $jours = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
    $mois = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    $ts = strtotime($d);
    if (!$ts) return $d;
    return ucfirst($jours[date('w',$ts)]) . ' ' . date('j',$ts) . ' ' . $mois[date('n',$ts)-1] . ' ' . date('Y',$ts);
}

function shortDate($d) {
    if (!$d) return '';
    $mois = ['jan.','fév.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
    $p = explode('-', $d);
    return (count($p) === 3) ? intval($p[2]) . ' ' . $mois[intval($p[1])-1] . ' ' . $p[0] : $d;
}
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Actualités | Xavier Fenaux · InteractivTrading</title>
    <meta name="description" content="Rapports de journée, analyses et actualités des salles InteractivTrading.">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
            --accent-primary: #6F4FF2;
            --accent-light: #8B6FF2;
            --accent-hover: #5a3fd4;
            --vip-accent: #249DDF;
            --vip-accent-light: rgba(36,157,223,0.14);
            --logo-gold: #F4B454;

            --bg-white: #FFFFFF;
            --bg-soft: #F5F4FF;

            --text-primary: #1a1a1a;
            --text-muted: #555;
            --text-light: #888;
            --text-white: #ffffff;

            --border-soft: #e6e3ff;
            --border-light: rgba(26,26,26,0.08);
            --border-hover: rgba(111,79,242,0.3);

            --shadow-card: 0 12px 40px rgba(111,79,242,0.08);
            --shadow-card-hover: 0 18px 55px rgba(15,15,15,0.09);
            --shadow-button: 0 6px 20px rgba(111,79,242,0.25);
            --shadow-button-hover: 0 10px 28px rgba(111,79,242,0.32);

            --section-padding: clamp(4rem, 7vw, 6rem);
            --radius-sm: 6px;
            --radius-md: 8px;
            --radius-lg: 12px;
            --radius-xl: 16px;
            --radius-3xl: 20px;
            --radius-full: 999px;
        }

        html { scroll-behavior: smooth; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "Inter", Arial, sans-serif;
            background: var(--bg-white);
            color: var(--text-primary);
            line-height: 1.6;
            overflow-x: hidden;
        }

        /* HEADER */
        .site-header {
            position: sticky; top: 0; z-index: 100;
            background: rgba(255,255,255,0.92);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border-bottom: 1px solid var(--border-soft);
            display: flex; align-items: center; justify-content: space-between;
            padding: 0.9rem 2rem;
        }
        .logo {
            font-family: "Montserrat", Arial, sans-serif;
            font-size: 1rem; font-weight: 800;
            color: var(--text-primary); letter-spacing: -0.02em;
            text-decoration: none;
        }
        .logo em { font-style: normal; color: var(--accent-primary); }
        .header-back {
            font-size: 0.82rem; font-weight: 500;
            color: var(--text-light); text-decoration: none;
            display: flex; align-items: center; gap: 0.4rem;
            transition: color 0.2s ease;
        }
        .header-back:hover { color: var(--accent-primary); }
        .header-back svg { width: 14px; height: 14px; }

        /* HERO */
        .hero {
            background: #0a0a12;
            padding: clamp(4.5rem, 10vw, 7.5rem) 1.5rem clamp(3.5rem, 8vw, 6rem);
            text-align: center;
            position: relative; overflow: hidden;
        }
        .hero::before {
            content: '';
            position: absolute; inset: 0;
            background:
                radial-gradient(ellipse 600px 400px at 20% 50%, rgba(111,79,242,0.25) 0%, transparent 70%),
                radial-gradient(ellipse 500px 350px at 80% 30%, rgba(36,157,223,0.2) 0%, transparent 70%),
                radial-gradient(ellipse 400px 300px at 50% 80%, rgba(244,180,84,0.12) 0%, transparent 70%);
            animation: heroShift 8s ease-in-out infinite alternate;
            pointer-events: none;
        }
        .hero::after {
            content: '';
            position: absolute; inset: 0;
            background:
                radial-gradient(ellipse 450px 350px at 70% 60%, rgba(111,79,242,0.18) 0%, transparent 70%),
                radial-gradient(ellipse 350px 250px at 30% 20%, rgba(36,157,223,0.15) 0%, transparent 70%);
            animation: heroShift2 10s ease-in-out infinite alternate;
            pointer-events: none;
        }
        @keyframes heroShift {
            0% { transform: translate(0, 0) scale(1); opacity: 1; }
            50% { transform: translate(30px, -20px) scale(1.05); opacity: 0.85; }
            100% { transform: translate(-20px, 15px) scale(0.98); opacity: 1; }
        }
        @keyframes heroShift2 {
            0% { transform: translate(0, 0) scale(1); opacity: 0.7; }
            50% { transform: translate(-40px, 25px) scale(1.08); opacity: 1; }
            100% { transform: translate(25px, -10px) scale(0.95); opacity: 0.8; }
        }
        .hero-inner { position: relative; max-width: 760px; margin: 0 auto; z-index: 1; }
        .hero .kicker {
            color: var(--vip-accent);
            background: rgba(36,157,223,0.12);
            border: 1px solid rgba(36,157,223,0.2);
            padding: 0.3rem 0.85rem;
            border-radius: var(--radius-full);
            font-size: 0.65rem;
        }
        .hero-title {
            font-family: "Montserrat", Arial, sans-serif;
            font-size: clamp(2.5rem, 5.5vw, 4.2rem);
            font-weight: 800;
            line-height: 1.05; letter-spacing: -0.03em;
            margin-bottom: 1.25rem;
            opacity: 0; animation: fadeInUp 0.7s 0.1s ease forwards;
            background: linear-gradient(135deg, #ffffff 0%, #e0d4ff 40%, #a78bfa 60%, #7dd3fc 80%, #ffffff 100%);
            background-size: 200% 200%;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: fadeInUp 0.7s 0.1s ease forwards, gradientText 6s ease-in-out infinite;
        }
        @keyframes gradientText {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
        }
        .hero-lead {
            font-size: clamp(1.05rem, 2vw, 1.2rem);
            color: rgba(255,255,255,0.55); max-width: 620px;
            margin: 0 auto; line-height: 1.7;
            opacity: 0; animation: fadeInUp 0.7s 0.25s ease forwards;
        }

        /* Floating orbs */
        .hero-orb {
            position: absolute; border-radius: 50%;
            filter: blur(60px); pointer-events: none;
        }
        .hero-orb-1 {
            width: 200px; height: 200px;
            background: rgba(111,79,242,0.3);
            top: 10%; left: 10%;
            animation: orbFloat1 12s ease-in-out infinite;
        }
        .hero-orb-2 {
            width: 150px; height: 150px;
            background: rgba(36,157,223,0.25);
            top: 60%; right: 10%;
            animation: orbFloat2 14s ease-in-out infinite;
        }
        .hero-orb-3 {
            width: 120px; height: 120px;
            background: rgba(244,180,84,0.2);
            bottom: 15%; left: 30%;
            animation: orbFloat3 10s ease-in-out infinite;
        }
        @keyframes orbFloat1 {
            0%, 100% { transform: translate(0, 0); }
            33% { transform: translate(40px, -30px); }
            66% { transform: translate(-20px, 20px); }
        }
        @keyframes orbFloat2 {
            0%, 100% { transform: translate(0, 0); }
            33% { transform: translate(-30px, 20px); }
            66% { transform: translate(25px, -15px); }
        }
        @keyframes orbFloat3 {
            0%, 100% { transform: translate(0, 0); }
            33% { transform: translate(20px, 25px); }
            66% { transform: translate(-35px, -10px); }
        }

        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(24px); }
            to   { opacity: 1; transform: translateY(0); }
        }

        .kicker {
            display: inline-block;
            font-family: "Montserrat", Arial, sans-serif;
            font-size: 0.7rem; font-weight: 800;
            letter-spacing: 0.18em; text-transform: uppercase;
            color: var(--accent-primary); margin-bottom: 1.25rem;
        }

        /* CONTAINER */
        .container { max-width: 900px; margin: 0 auto; padding: 0 1.5rem; }
        .section { padding: var(--section-padding) 1.5rem; }
        .section-bg-soft { background: var(--bg-soft); }
        .section-bg-white { background: var(--bg-white); }

        /* FEATURED ARTICLE */
        .featured-card {
            max-width: 900px; margin: 0 auto;
            background: var(--bg-white);
            border: 1px solid var(--border-soft);
            border-radius: var(--radius-3xl);
            overflow: hidden;
            text-decoration: none; color: inherit;
            display: block;
            transition: transform 0.3s cubic-bezier(0.16,1,0.3,1), box-shadow 0.3s ease, border-color 0.25s ease;
            position: relative;
        }
        .featured-card::before {
            content: ''; position: absolute;
            left: 0; top: 0; bottom: 0; width: 5px;
            background: var(--accent-primary);
            border-radius: 5px 0 0 5px;
        }
        .featured-card:hover {
            transform: translateY(-4px);
            box-shadow: var(--shadow-card-hover);
            border-color: var(--border-hover);
        }
        .featured-inner { padding: 2.5rem 2.5rem 2.5rem 3rem; }

        .featured-top {
            display: flex; align-items: center; justify-content: space-between;
            gap: 1rem; flex-wrap: wrap;
            margin-bottom: 1.25rem;
        }
        .featured-badges { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }

        .badge {
            display: inline-flex; align-items: center; gap: 0.3rem;
            font-family: "Montserrat", Arial, sans-serif;
            font-size: 0.68rem; font-weight: 700; letter-spacing: 0.05em;
            padding: 0.3rem 0.75rem; border-radius: var(--radius-full); white-space: nowrap;
        }
        .badge-purple { background: rgba(111,79,242,0.08); color: var(--accent-primary); border: 1px solid var(--border-soft); }
        .badge-new {
            background: var(--accent-primary); color: var(--text-white);
            border: 1px solid var(--accent-primary);
            font-size: 0.62rem; letter-spacing: 0.12em; text-transform: uppercase;
        }

        .featured-date {
            font-size: 0.78rem; font-weight: 500; color: var(--text-light);
        }

        .featured-title {
            font-family: "Montserrat", Arial, sans-serif;
            font-size: clamp(1.4rem, 3vw, 1.85rem);
            font-weight: 800; color: var(--text-primary);
            line-height: 1.15; letter-spacing: -0.02em;
            margin-bottom: 0.85rem;
            transition: color 0.25s ease;
        }
        .featured-card:hover .featured-title { color: var(--accent-primary); }

        .featured-summary {
            font-size: clamp(0.95rem, 1.5vw, 1.02rem);
            color: var(--text-muted); line-height: 1.7;
            margin-bottom: 1.75rem; max-width: 680px;
        }

        .featured-stats {
            display: inline-flex; gap: 0;
            border: 1px solid var(--border-soft);
            border-radius: var(--radius-lg);
            background: var(--bg-soft);
            overflow: hidden;
        }
        .f-stat {
            padding: 0.85rem 1.35rem; text-align: center;
            border-right: 1px solid var(--border-soft);
        }
        .f-stat:last-child { border-right: none; }
        .f-stat-value {
            font-family: "Montserrat", Arial, sans-serif;
            font-size: 1.35rem; font-weight: 800;
            line-height: 1; letter-spacing: -0.03em;
            color: var(--text-primary);
        }
        .f-stat-value.purple { color: var(--accent-primary); }
        .f-stat-value.blue { color: var(--vip-accent); }
        .f-stat-label {
            font-size: 0.6rem; font-weight: 600;
            letter-spacing: 0.1em; text-transform: uppercase;
            color: var(--text-light); margin-top: 0.2rem;
        }

        .featured-cta {
            display: flex; align-items: center; justify-content: space-between;
            margin-top: 1.75rem; padding-top: 1.5rem;
            border-top: 1px solid var(--border-light);
        }
        .featured-read {
            font-family: "Montserrat", Arial, sans-serif;
            font-size: 0.82rem; font-weight: 700;
            color: var(--accent-primary);
            display: flex; align-items: center; gap: 0.4rem;
        }
        .featured-read svg {
            width: 16px; height: 16px;
            transition: transform 0.25s ease;
        }
        .featured-card:hover .featured-read svg { transform: translateX(4px); }

        /* ARTICLES LIST */
        .section-header { max-width: 900px; margin: 0 auto 2rem; }
        .section-title {
            font-family: "Montserrat", Arial, sans-serif;
            font-size: clamp(1.5rem, 3vw, 2rem);
            font-weight: 800; color: var(--text-primary);
            line-height: 1.1; letter-spacing: -0.02em; margin-bottom: 0.35rem;
        }
        .section-sub {
            font-size: clamp(0.9rem, 1.4vw, 0.95rem);
            color: var(--text-muted); line-height: 1.6;
        }

        .articles-list {
            max-width: 900px; margin: 0 auto;
            display: flex; flex-direction: column; gap: 0.75rem;
        }

        .article-row {
            background: var(--bg-white);
            border: 1px solid var(--border-soft);
            border-radius: var(--radius-xl);
            padding: 1.25rem 1.5rem;
            text-decoration: none; color: inherit;
            display: flex; align-items: center; gap: 1.25rem;
            transition: transform 0.25s cubic-bezier(0.16,1,0.3,1), box-shadow 0.25s ease, border-color 0.25s ease;
            position: relative; overflow: hidden;
        }
        .article-row::before {
            content: ''; position: absolute;
            left: 0; top: 0; bottom: 0; width: 3px;
            background: var(--accent-primary);
            transform: scaleY(0);
            transition: transform 0.3s cubic-bezier(0.16,1,0.3,1);
            transform-origin: bottom;
        }
        .article-row:hover {
            transform: translateY(-2px);
            box-shadow: var(--shadow-card);
            border-color: var(--border-hover);
        }
        .article-row:hover::before { transform: scaleY(1); }

        .article-row-date {
            flex-shrink: 0; width: 58px; text-align: center;
        }
        .article-row-date .day {
            font-family: "Montserrat", Arial, sans-serif;
            font-size: 1.6rem; font-weight: 800;
            line-height: 1; color: var(--text-primary);
            letter-spacing: -0.03em;
        }
        .article-row-date .month {
            font-size: 0.65rem; font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.08em;
            color: var(--text-light); margin-top: 0.15rem;
        }

        .article-row-content { flex: 1; min-width: 0; }
        .article-row-category {
            display: inline-block;
            font-family: "Montserrat", Arial, sans-serif;
            font-size: 0.6rem; font-weight: 700;
            letter-spacing: 0.08em; text-transform: uppercase;
            color: var(--accent-primary);
            background: rgba(111,79,242,0.06);
            padding: 0.15rem 0.55rem; border-radius: var(--radius-sm);
            margin-bottom: 0.35rem;
        }
        .article-row h3 {
            font-family: "Montserrat", Arial, sans-serif;
            font-size: 1rem; font-weight: 700;
            color: var(--text-primary); line-height: 1.3;
            letter-spacing: -0.01em; margin-bottom: 0.25rem;
            transition: color 0.25s ease;
        }
        .article-row:hover h3 { color: var(--accent-primary); }

        .article-row-summary {
            font-size: 0.85rem; color: var(--text-muted);
            line-height: 1.5;
            display: -webkit-box; -webkit-line-clamp: 1;
            -webkit-box-orient: vertical; overflow: hidden;
        }

        .article-row-mini-stats {
            flex-shrink: 0;
            display: flex; gap: 0.85rem; align-items: center;
        }
        .mini-stat {
            text-align: center;
        }
        .mini-stat-val {
            font-family: "Montserrat", Arial, sans-serif;
            font-size: 0.95rem; font-weight: 800;
            color: var(--accent-primary); line-height: 1;
        }
        .mini-stat-lbl {
            font-size: 0.55rem; font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.06em;
            color: var(--text-light); margin-top: 0.1rem;
        }

        .article-row-arrow {
            flex-shrink: 0;
            width: 32px; height: 32px;
            border-radius: 50%;
            background: var(--bg-soft);
            display: flex; align-items: center; justify-content: center;
            transition: background 0.25s ease;
        }
        .article-row-arrow svg {
            width: 14px; height: 14px; color: var(--text-light);
            transition: color 0.25s ease, transform 0.25s ease;
        }
        .article-row:hover .article-row-arrow { background: var(--accent-primary); }
        .article-row:hover .article-row-arrow svg { color: white; transform: translateX(2px); }

        /* EMPTY STATE */
        .empty-state {
            text-align: center; padding: 5rem 2rem;
            color: var(--text-light);
        }
        .empty-state p {
            font-size: 1rem; margin-top: 0.75rem;
        }

        /* FOOTER */
        .site-footer {
            max-width: 900px; margin: 0 auto;
            padding: 2rem 1.5rem 3rem;
            border-top: 1px solid var(--border-soft);
            display: flex; justify-content: space-between; align-items: center;
            font-size: 0.78rem; color: var(--text-light);
        }
        .site-footer a {
            color: var(--accent-primary); text-decoration: none;
            font-weight: 600;
        }
        .site-footer a:hover { text-decoration: underline; }

        /* REVEAL */
        .reveal {
            opacity: 0; transform: translateY(20px);
            transition: opacity 0.6s ease, transform 0.6s ease;
        }
        .reveal.visible { opacity: 1; transform: translateY(0); }

        /* RESPONSIVE */
        @media (max-width: 700px) {
            .site-header { padding: 0.8rem 1.25rem; }
            .featured-inner { padding: 1.75rem 1.5rem 1.75rem 1.75rem; }
            .featured-stats { flex-direction: column; width: fit-content; }
            .f-stat { border-right: none; border-bottom: 1px solid var(--border-soft); padding: 0.65rem 1.2rem; }
            .f-stat:last-child { border-bottom: none; }
            .article-row { flex-wrap: wrap; gap: 0.75rem; padding: 1rem 1.25rem; }
            .article-row-mini-stats { display: none; }
            .article-row-date { width: 48px; }
            .article-row-date .day { font-size: 1.3rem; }
            .site-footer { flex-direction: column; gap: 0.5rem; text-align: center; }
        }
    </style>
    <script defer src="https://analytics.parentsdejumeaux.fr/script.js" data-website-id="3ff9a2c0-10a3-4c98-8e96-777b0c04aadc" data-domains="xavierfenaux.com,www.xavierfenaux.com"></script>
</head>
<body>

    <!-- HEADER -->
    <header class="site-header">
        <a href="/" class="logo">Interactiv<em>Trading</em></a>
        <a href="/" class="header-back">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
            Retour au site
        </a>
    </header>

    <!-- HERO -->
    <section class="hero">
        <div class="hero-orb hero-orb-1"></div>
        <div class="hero-orb hero-orb-2"></div>
        <div class="hero-orb hero-orb-3"></div>
        <div class="hero-inner">
            <div class="kicker">Actualités</div>
            <h1 class="hero-title">Ce que vivent<br>les VIP chez<br>InteractivTrading</h1>
            <p class="hero-lead">Chaque jour, nos coachs partagent leurs analyses, leurs trades et leur pédagogie en temps réel. Retrouve ici tous les rapports.</p>
        </div>
    </section>

    <?php if ($featured): ?>
    <!-- FEATURED ARTICLE -->
    <section class="section section-bg-white reveal">
        <a href="<?= $featured['url'] ?>" class="featured-card">
            <div class="featured-inner">
                <div class="featured-top">
                    <div class="featured-badges">
                        <span class="badge badge-new">Dernier rapport</span>
                        <?php if ($featured['category']): ?>
                            <span class="badge badge-purple"><?= $featured['category'] ?></span>
                        <?php endif; ?>
                    </div>
                    <span class="featured-date"><?= dateFR($featured['date']) ?></span>
                </div>

                <h2 class="featured-title"><?= $featured['title'] ?></h2>

                <?php if ($featured['summary']): ?>
                    <p class="featured-summary"><?= $featured['summary'] ?></p>
                <?php endif; ?>

                <?php if ($featured['notifs'] || $featured['coachs'] || $featured['coverage'] || $featured['likes']): ?>
                <div class="featured-stats">
                    <?php if ($featured['notifs']): ?>
                    <div class="f-stat">
                        <div class="f-stat-value purple"><?= htmlspecialchars($featured['notifs']) ?></div>
                        <div class="f-stat-label">Notifications</div>
                    </div>
                    <?php endif; ?>
                    <?php if ($featured['coachs']): ?>
                    <div class="f-stat">
                        <div class="f-stat-value"><?= htmlspecialchars($featured['coachs']) ?></div>
                        <div class="f-stat-label">Coachs</div>
                    </div>
                    <?php endif; ?>
                    <?php if ($featured['coverage']): ?>
                    <div class="f-stat">
                        <div class="f-stat-value blue"><?= htmlspecialchars($featured['coverage']) ?></div>
                        <div class="f-stat-label">Couverture</div>
                    </div>
                    <?php endif; ?>
                    <?php if ($featured['likes']): ?>
                    <div class="f-stat">
                        <div class="f-stat-value"><?= htmlspecialchars($featured['likes']) ?></div>
                        <div class="f-stat-label">Likes</div>
                    </div>
                    <?php endif; ?>
                </div>
                <?php endif; ?>

                <div class="featured-cta">
                    <span class="featured-read">
                        Lire le rapport complet
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg>
                    </span>
                </div>
            </div>
        </a>
    </section>
    <?php endif; ?>

    <?php if (!empty($rest)): ?>
    <!-- PREVIOUS ARTICLES -->
    <section class="section section-bg-soft reveal">
        <div class="section-header container">
            <h2 class="section-title">Rapports précédents</h2>
            <p class="section-sub"><?= count($rest) ?> rapport<?= count($rest) > 1 ? 's' : '' ?> archivé<?= count($rest) > 1 ? 's' : '' ?></p>
        </div>
        <div class="articles-list">
            <?php foreach ($rest as $article):
                $dp = explode('-', $article['date']);
                $day = isset($dp[2]) ? intval($dp[2]) : '';
                $months = ['jan.','fév.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
                $mo = isset($dp[1]) ? $months[intval($dp[1])-1] : '';
            ?>
            <a href="<?= $article['url'] ?>" class="article-row">
                <div class="article-row-date">
                    <div class="day"><?= $day ?></div>
                    <div class="month"><?= $mo ?></div>
                </div>
                <div class="article-row-content">
                    <?php if ($article['category']): ?>
                        <div class="article-row-category"><?= $article['category'] ?></div>
                    <?php endif; ?>
                    <h3><?= $article['title'] ?></h3>
                    <?php if ($article['summary']): ?>
                        <p class="article-row-summary"><?= $article['summary'] ?></p>
                    <?php endif; ?>
                </div>
                <?php if ($article['notifs'] || $article['coachs']): ?>
                <div class="article-row-mini-stats">
                    <?php if ($article['notifs']): ?>
                    <div class="mini-stat">
                        <div class="mini-stat-val"><?= htmlspecialchars($article['notifs']) ?></div>
                        <div class="mini-stat-lbl">Notifs</div>
                    </div>
                    <?php endif; ?>
                    <?php if ($article['coachs']): ?>
                    <div class="mini-stat">
                        <div class="mini-stat-val"><?= htmlspecialchars($article['coachs']) ?></div>
                        <div class="mini-stat-lbl">Coachs</div>
                    </div>
                    <?php endif; ?>
                </div>
                <?php endif; ?>
                <div class="article-row-arrow">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>
                </div>
            </a>
            <?php endforeach; ?>
        </div>
    </section>
    <?php endif; ?>

    <?php if (empty($articles)): ?>
    <section class="section section-bg-white">
        <div class="empty-state">
            <div class="kicker">Bientôt disponible</div>
            <p>Aucun rapport publié pour le moment. Reviens vite !</p>
        </div>
    </section>
    <?php endif; ?>

    <!-- FOOTER -->
    <footer class="site-footer">
        <span>&copy; <?= date('Y') ?> Xavier Fenaux</span>
        <a href="https://interactivtrading.com/?aff=xf-site">Découvrir InteractivTrading</a>
    </footer>

    <script>
        const reveals = document.querySelectorAll('.reveal');
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.07 });
        reveals.forEach(el => observer.observe(el));
    </script>

</body>
</html>