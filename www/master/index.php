<?php
declare(strict_types=1);

require __DIR__ . '/auth.php';
require __DIR__ . '/services.php';

$error = '';

if (isset($_GET['logout'])) {
    $_SESSION = [];
    session_destroy();
    header('Location: /master/');
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = trim((string) ($_POST['username'] ?? ''));
    $password = (string) ($_POST['password'] ?? '');

    if (master_verify_login($username, $password)) {
        session_regenerate_id(true);
        $_SESSION['master_user'] = MASTER_USERNAME;
        header('Location: /master/');
        exit;
    }

    $error = 'Identifiants invalides.';
}

$loggedIn = master_is_logged_in();
$services = master_services();
$servicesJson = json_encode(array_map(static function (array $service): array {
    unset($service['statusCheck']);
    return $service;
}, $services), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Master Xavier</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%230b1020'/%3E%3Cpath d='M14 46 30 14h8L22 46z' fill='%23f6f0e8'/%3E%3Cpath d='M35 18h15L35 46H20z' fill='%232aa876'/%3E%3C/svg%3E">
  <style>
    :root {
      color-scheme: light;
      --ink: #14161f;
      --muted: #667085;
      --line: #dfe4ec;
      --panel: #ffffff;
      --soft: #f6f7f9;
      --brand: #172033;
      --green: #1f8f62;
      --blue: #246bfe;
      --amber: #b7791f;
      --red: #c2413d;
      --shadow: 0 20px 60px rgba(20, 22, 31, .08);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: #f4f6f8;
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }

    a { color: inherit; }

    .login-screen {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background:
        linear-gradient(135deg, rgba(36, 107, 254, .12), transparent 34%),
        linear-gradient(315deg, rgba(31, 143, 98, .14), transparent 38%),
        #f6f7f9;
    }

    .login-box {
      width: min(420px, 100%);
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
      padding: 28px;
    }

    .login-box h1 {
      margin: 0 0 8px;
      font-size: 1.8rem;
      line-height: 1.1;
    }

    .login-box p {
      margin: 0 0 24px;
      color: var(--muted);
      line-height: 1.55;
    }

    label {
      display: block;
      margin: 14px 0 8px;
      color: #344054;
      font-size: .92rem;
      font-weight: 700;
    }

    input, select, button {
      font: inherit;
    }

    input, select {
      width: 100%;
      min-height: 44px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px 12px;
      background: #fff;
      color: var(--ink);
    }

    button, .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 42px;
      border: 0;
      border-radius: 8px;
      background: var(--brand);
      color: #fff;
      padding: 10px 14px;
      text-decoration: none;
      font-weight: 800;
      cursor: pointer;
      white-space: nowrap;
    }

    button.secondary, .button.secondary {
      background: #eef2f7;
      color: var(--ink);
    }

    .error {
      margin: 0 0 12px;
      border: 1px solid rgba(194, 65, 61, .25);
      background: rgba(194, 65, 61, .08);
      color: var(--red);
      border-radius: 8px;
      padding: 10px 12px;
      font-weight: 700;
    }

    .app {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr);
    }

    .sidebar {
      position: sticky;
      top: 0;
      height: 100vh;
      overflow: auto;
      padding: 22px;
      background: #101624;
      color: #f8fafc;
    }

    .brand {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 24px;
    }

    .brand-mark {
      width: 38px;
      height: 38px;
      border-radius: 8px;
      background: linear-gradient(135deg, #f8fafc 0 45%, #2aa876 45% 100%);
      color: #101624;
      display: grid;
      place-items: center;
      font-weight: 950;
    }

    .brand strong {
      display: block;
      font-size: 1rem;
    }

    .brand span, .nav-label {
      color: rgba(248, 250, 252, .66);
      font-size: .82rem;
    }

    .nav {
      display: grid;
      gap: 7px;
      margin-top: 16px;
    }

    .nav button {
      width: 100%;
      justify-content: flex-start;
      min-height: 38px;
      background: transparent;
      color: rgba(248, 250, 252, .78);
      padding: 8px 10px;
      border: 1px solid transparent;
    }

    .nav button.is-active {
      color: #fff;
      background: rgba(255, 255, 255, .1);
      border-color: rgba(255, 255, 255, .12);
    }

    .content {
      min-width: 0;
      padding: 24px;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
    }

    .topbar h1 {
      margin: 0;
      font-size: clamp(1.7rem, 3vw, 2.45rem);
      line-height: 1.05;
    }

    .topbar p {
      margin: 8px 0 0;
      color: var(--muted);
      max-width: 720px;
      line-height: 1.5;
    }

    .summary-strip {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin: 18px 0;
    }

    .metric {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
    }

    .metric span {
      display: block;
      color: var(--muted);
      font-size: .82rem;
      margin-bottom: 8px;
    }

    .metric strong {
      font-size: 1.45rem;
      line-height: 1;
    }

    .toolbar {
      display: grid;
      grid-template-columns: minmax(240px, 1fr) 210px 180px;
      gap: 10px;
      margin: 20px 0;
    }

    .workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 380px;
      gap: 18px;
      align-items: start;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 14px;
    }

    .service-card, .detail {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 10px 30px rgba(20, 22, 31, .04);
    }

    .service-card {
      min-height: 236px;
      padding: 16px;
      display: grid;
      gap: 14px;
      cursor: pointer;
      transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease;
    }

    .service-card:hover, .service-card.is-selected {
      transform: translateY(-2px);
      border-color: rgba(36, 107, 254, .45);
      box-shadow: var(--shadow);
    }

    .card-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .service-card h2 {
      margin: 0;
      font-size: 1.08rem;
      line-height: 1.2;
    }

    .tag, .status {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 5px 8px;
      font-size: .75rem;
      font-weight: 850;
      white-space: nowrap;
    }

    .tag {
      color: #344054;
      background: #eef2f7;
    }

    .status {
      border: 1px solid transparent;
      background: #eef2f7;
      color: #344054;
    }

    .status.online { background: rgba(31, 143, 98, .1); color: var(--green); border-color: rgba(31, 143, 98, .2); }
    .status.offline, .status.missing { background: rgba(194, 65, 61, .09); color: var(--red); border-color: rgba(194, 65, 61, .18); }
    .status.unknown { background: rgba(183, 121, 31, .1); color: var(--amber); border-color: rgba(183, 121, 31, .2); }

    .service-card p {
      margin: 0;
      color: #475467;
      line-height: 1.5;
    }

    .card-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-top: auto;
    }

    .open-link {
      color: var(--blue);
      font-weight: 850;
      text-decoration: none;
    }

    .detail {
      position: sticky;
      top: 24px;
      padding: 18px;
    }

    .detail h2 {
      margin: 0 0 8px;
      font-size: 1.35rem;
    }

    .detail p {
      margin: 0 0 14px;
      color: #475467;
      line-height: 1.5;
    }

    .steps {
      margin: 14px 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 9px;
      counter-reset: step;
    }

    .steps li {
      counter-increment: step;
      display: grid;
      grid-template-columns: 28px minmax(0, 1fr);
      gap: 10px;
      align-items: start;
      color: #344054;
      line-height: 1.45;
    }

    .steps li::before {
      content: counter(step);
      width: 26px;
      height: 26px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      background: #101624;
      color: #fff;
      font-size: .78rem;
      font-weight: 900;
    }

    .result-box {
      border-left: 4px solid var(--green);
      background: rgba(31, 143, 98, .08);
      padding: 12px 14px;
      border-radius: 0 8px 8px 0;
      color: #1f2937;
      line-height: 1.45;
      margin: 14px 0;
    }

    .stats-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 8px;
      margin: 14px 0;
    }

    .stat-chip {
      border: 1px solid var(--line);
      background: #f8fafc;
      border-radius: 8px;
      padding: 10px;
    }

    .stat-chip span {
      display: block;
      color: var(--muted);
      font-size: .75rem;
      font-weight: 800;
      margin-bottom: 5px;
    }

    .stat-chip strong {
      display: block;
      font-size: .98rem;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }

    .muted {
      color: var(--muted);
      font-size: .9rem;
    }

    @media (max-width: 1080px) {
      .app { grid-template-columns: 1fr; }
      .sidebar {
        position: static;
        height: auto;
      }
      .nav { grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); }
      .workspace { grid-template-columns: 1fr; }
      .detail { position: static; }
      .summary-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }

    @media (max-width: 680px) {
      .content, .sidebar { padding: 16px; }
      .topbar { align-items: flex-start; flex-direction: column; }
      .summary-strip, .toolbar { grid-template-columns: 1fr; }
      .service-card { min-height: auto; }
      .card-actions { align-items: flex-start; flex-direction: column; }
      .button { width: 100%; }
    }
  </style>
</head>
<body>
<?php if (!$loggedIn): ?>
  <main class="login-screen">
    <form class="login-box" method="post" action="/master/" autocomplete="on">
      <h1>Master Xavier</h1>
      <p>Un seul acces pour retrouver les outils radar, clips, newsletter, live et pilotage.</p>
      <?php if ($error): ?><div class="error"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>
      <label for="username">Identifiant</label>
      <input id="username" name="username" autocomplete="username" required autofocus>
      <label for="password">Mot de passe</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button type="submit" style="width:100%; margin-top:18px;">Entrer</button>
    </form>
  </main>
<?php else: ?>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="brand-mark">X</div>
          <div>
            <strong>Master Xavier</strong>
            <span>Compte xav</span>
          </div>
        </div>
      </div>
      <div class="nav-label">Categories</div>
      <nav class="nav" id="categoryNav"></nav>
      <a class="button secondary" href="/master/?logout=1" style="width:100%; margin-top:24px;">Deconnexion</a>
    </aside>

    <main class="content">
      <header class="topbar">
        <div>
          <h1>Centre de commande</h1>
          <p>Tous les outils Xavier au meme endroit, avec un mode d emploi court et le resultat attendu avant d ouvrir chaque service.</p>
        </div>
        <button type="button" id="refreshButton">Actualiser</button>
      </header>

      <section class="summary-strip" aria-label="Synthese">
        <div class="metric"><span>Services</span><strong id="totalServices">0</strong></div>
        <div class="metric"><span>En ligne</span><strong id="onlineServices">0</strong></div>
        <div class="metric"><span>A verifier</span><strong id="checkServices">0</strong></div>
        <div class="metric"><span>Derniere lecture</span><strong id="lastRefresh">--:--</strong></div>
      </section>

      <section class="toolbar" aria-label="Filtres">
        <input id="searchInput" type="search" placeholder="Chercher un outil, une categorie, un usage">
        <select id="categorySelect" aria-label="Categorie"></select>
        <select id="statusSelect" aria-label="Statut">
          <option value="all">Tous les statuts</option>
          <option value="online">Disponibles</option>
          <option value="offline">A verifier</option>
          <option value="missing">Absents du webroot</option>
        </select>
      </section>

      <section class="workspace">
        <div class="grid" id="serviceGrid"></div>
        <aside class="detail" id="detailPanel"></aside>
      </section>
    </main>
  </div>

  <script>
    const baseServices = <?= $servicesJson ?: '[]' ?>;
    let services = baseServices.map((service) => ({ ...service, status: { state: 'unknown', label: 'Lecture...' } }));
    let selectedId = services[0]?.id || null;
    let category = 'Tous';
    let statusFilter = 'all';
    let query = '';

    const grid = document.getElementById('serviceGrid');
    const detail = document.getElementById('detailPanel');
    const categoryNav = document.getElementById('categoryNav');
    const categorySelect = document.getElementById('categorySelect');
    const statusSelect = document.getElementById('statusSelect');
    const searchInput = document.getElementById('searchInput');
    const refreshButton = document.getElementById('refreshButton');

    function categories() {
      return ['Tous', ...Array.from(new Set(services.map((service) => service.category))).sort()];
    }

    function filteredServices() {
      const needle = query.trim().toLowerCase();
      return services.filter((service) => {
        const matchesCategory = category === 'Tous' || service.category === category;
        const state = service.status?.state || 'unknown';
        const matchesStatus = statusFilter === 'all' || state === statusFilter || (statusFilter === 'offline' && state === 'unknown');
        const haystack = [service.name, service.category, service.summary, service.result].join(' ').toLowerCase();
        return matchesCategory && matchesStatus && (!needle || haystack.includes(needle));
      });
    }

    function statusLabel(service) {
      const status = service.status || { state: 'unknown', label: 'Non teste' };
      return `<span class="status ${status.state}">${status.label}</span>`;
    }

    function renderNav() {
      categoryNav.innerHTML = categories().map((item) => (
        `<button type="button" class="${item === category ? 'is-active' : ''}" data-category="${item}">${item}</button>`
      )).join('');
      categorySelect.innerHTML = categories().map((item) => (
        `<option value="${item}" ${item === category ? 'selected' : ''}>${item === 'Tous' ? 'Toutes les categories' : item}</option>`
      )).join('');
    }

    function renderGrid() {
      const list = filteredServices();
      if (!list.some((service) => service.id === selectedId)) {
        selectedId = list[0]?.id || services[0]?.id || null;
      }

      grid.innerHTML = list.map((service) => `
        <article class="service-card ${service.id === selectedId ? 'is-selected' : ''}" data-id="${service.id}" tabindex="0">
          <div class="card-head">
            <div>
              <h2>${service.name}</h2>
              <span class="tag">${service.category}</span>
            </div>
            ${statusLabel(service)}
          </div>
          <p>${service.summary}</p>
          <div class="card-actions">
            <a class="open-link" href="${service.href}" target="${service.href.startsWith('http') ? '_blank' : '_self'}" rel="noreferrer">${service.launchLabel}</a>
            <span class="muted">${service.status?.latencyMs ? service.status.latencyMs + ' ms' : ''}</span>
          </div>
        </article>
      `).join('');
    }

    function renderDetail() {
      const service = services.find((item) => item.id === selectedId) || services[0];
      if (!service) {
        detail.innerHTML = '<p>Aucun service trouve.</p>';
        return;
      }

      detail.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px;">
          <span class="tag">${service.category}</span>
          ${statusLabel(service)}
        </div>
        <h2>${service.name}</h2>
        <p>${service.summary}</p>
        ${service.stats ? `<div class="stats-list">${service.stats.map((stat) => `<div class="stat-chip"><span>${stat.label}</span><strong>${stat.value}</strong></div>`).join('')}</div>` : ''}
        <ol class="steps">${service.tutorial.map((step) => `<li>${step}</li>`).join('')}</ol>
        <div class="result-box"><strong>Resultat attendu</strong><br>${service.result}</div>
        <a class="button" href="${service.href}" target="${service.href.startsWith('http') ? '_blank' : '_self'}" rel="noreferrer">${service.launchLabel}</a>
      `;
    }

    function renderMetrics() {
      const online = services.filter((service) => service.status?.state === 'online').length;
      const check = services.filter((service) => ['offline', 'missing', 'unknown'].includes(service.status?.state)).length;
      document.getElementById('totalServices').textContent = services.length;
      document.getElementById('onlineServices').textContent = online;
      document.getElementById('checkServices').textContent = check;
      document.getElementById('lastRefresh').textContent = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date());
    }

    function render() {
      renderNav();
      renderGrid();
      renderDetail();
      renderMetrics();
    }

    async function refreshStatuses() {
      refreshButton.disabled = true;
      refreshButton.textContent = 'Lecture...';
      try {
        const response = await fetch('/master/status.php', { cache: 'no-store' });
        if (!response.ok) throw new Error('status');
        const data = await response.json();
        services = data.services;
      } catch (error) {
        services = services.map((service) => ({ ...service, status: { state: 'unknown', label: 'Non lu' } }));
      } finally {
        refreshButton.disabled = false;
        refreshButton.textContent = 'Actualiser';
        render();
      }
    }

    categoryNav.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-category]');
      if (!button) return;
      category = button.dataset.category;
      render();
    });

    categorySelect.addEventListener('change', (event) => {
      category = event.target.value;
      render();
    });

    statusSelect.addEventListener('change', (event) => {
      statusFilter = event.target.value;
      render();
    });

    searchInput.addEventListener('input', (event) => {
      query = event.target.value;
      render();
    });

    grid.addEventListener('click', (event) => {
      if (event.target.closest('a')) return;
      const card = event.target.closest('.service-card');
      if (!card) return;
      selectedId = card.dataset.id;
      render();
    });

    grid.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const card = event.target.closest('.service-card');
      if (!card) return;
      selectedId = card.dataset.id;
      render();
    });

    refreshButton.addEventListener('click', refreshStatuses);

    render();
    refreshStatuses();
  </script>
<?php endif; ?>
</body>
</html>
