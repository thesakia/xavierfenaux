<?php
declare(strict_types=1);
require __DIR__ . '/auth.php';
dashboard_require_auth(false);
$user = dashboard_current_user();
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dashboard · Xavier Fenaux</title>
  <link rel="icon" type="image/png" href="/images/favicon-signature-black.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#f5f1e8;--panel:#fffaf0;--ink:#17140f;--muted:#6d6558;--accent:#997733;--line:rgba(23,20,15,.12);--soft:rgba(255,250,240,.72);--dark:#050505;--green:#168a4a;--red:#b42318;--blue:#155eef}
    *{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#fffaf0 0%,var(--bg) 44%,#ece4d4 100%);color:var(--ink);font-family:Inter,system-ui,sans-serif;line-height:1.45}button,input{font:inherit}
    .wrap{max-width:1240px;margin:auto;padding:0 22px}.topbar{position:sticky;top:0;z-index:10;background:rgba(245,241,232,.88);backdrop-filter:blur(16px);border-bottom:1px solid var(--line)}
    .topbar .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:12px;padding-bottom:12px}.brand{display:flex;align-items:center;gap:14px}.brand img{height:44px}.brand b{display:block}.brand span{color:var(--muted);font-size:13px}
    .nav{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.pill,.btn{border:1px solid var(--line);background:white;color:var(--ink);border-radius:999px;padding:9px 12px;text-decoration:none;font-size:13px;font-weight:900;cursor:pointer}.btn.dark{background:var(--ink);color:white}.btn.gold{background:var(--accent);color:white;border-color:var(--accent)}
    header{padding:38px 0 18px}.kicker{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:var(--accent);font-weight:900}h1{font-size:clamp(36px,6vw,72px);line-height:.95;letter-spacing:-.045em;margin:10px 0 14px;max-width:980px}.lead{font-size:18px;color:var(--muted);max-width:780px}
    .grid{display:grid;gap:16px}.grid.two{grid-template-columns:1.25fr .75fr}.grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.panel{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:18px;box-shadow:0 18px 50px rgba(56,43,20,.1)}.panel h2{margin:0 0 12px;font-size:24px;letter-spacing:-.03em}.panel h3{margin:0 0 8px;font-size:18px}
    .next{border-color:rgba(153,119,51,.38);background:linear-gradient(135deg,#fffaf0,#fff,#f5ead1)}.task-title{font-size:28px;line-height:1.08;letter-spacing:-.035em;margin:8px 0}.meta{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.tag{border:1px solid var(--line);background:white;border-radius:999px;padding:6px 9px;color:var(--muted);font-size:12px;font-weight:900}.tag.green{color:var(--green);border-color:rgba(22,138,74,.25)}.tag.blue{color:var(--blue);border-color:rgba(21,94,239,.24)}
    .countdown{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}.countdown div{background:white;border:1px solid var(--line);border-radius:14px;padding:12px;text-align:center}.countdown strong{display:block;font-size:24px}.countdown span{font-size:11px;color:var(--muted);font-weight:900;text-transform:uppercase}
    .copy-block{position:relative;background:#fff;border:1px solid var(--line);border-radius:16px;margin:12px 0;overflow:hidden}.copy-block label{display:block;background:#f7f1e3;border-bottom:1px solid var(--line);padding:10px 12px;font-size:12px;color:var(--accent);font-weight:900;text-transform:uppercase;letter-spacing:.08em}.copy-block pre{white-space:pre-wrap;margin:0;padding:14px 104px 14px 14px;font-family:Inter,system-ui,sans-serif;color:#1d1a14}.copy-btn{position:absolute;right:10px;top:44px;border:0;border-radius:999px;background:var(--ink);color:white;padding:8px 10px;font-size:12px;font-weight:900;cursor:pointer}.copy-btn.ok{background:var(--green)}
    .toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 16px}.toolbar input,.toolbar select{border:1px solid var(--line);border-radius:999px;padding:11px 13px;background:white;min-width:210px}.post-list{display:grid;gap:12px}.post{background:white;border:1px solid var(--line);border-radius:16px;padding:14px}.post-top{display:flex;justify-content:space-between;gap:12px}.post h3{margin:4px 0}.post p{color:var(--muted);margin:0}.post details{margin-top:10px}.post summary{cursor:pointer;font-weight:900;color:var(--accent)}
    .doc-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid var(--line)}.doc-row:last-child{border-bottom:0}.muted{color:var(--muted)}.small{font-size:13px}.upload{display:flex;gap:8px;flex-wrap:wrap}.upload input{border:1px dashed var(--line);border-radius:12px;padding:10px;background:white;flex:1;min-width:220px}.status{font-size:13px;color:var(--muted);margin-top:10px}.empty{padding:18px;border:1px dashed var(--line);border-radius:16px;color:var(--muted);background:white}
    @media(max-width:920px){.grid.two,.grid.three{grid-template-columns:1fr}.topbar .wrap{align-items:flex-start;flex-direction:column}.countdown{grid-template-columns:repeat(2,1fr)}.copy-block pre{padding-right:14px}.copy-btn{position:static;margin:0 0 12px 12px}.post-top{display:block}}
  </style>
</head>
<body>
  <div class="topbar">
    <div class="wrap">
      <div class="brand">
        <img src="/images/SignatureXav.png" alt="Xavier Fenaux">
        <div><b>Dashboard publication IA</b><span><?= htmlspecialchars($user, ENT_QUOTES, 'UTF-8') ?></span></div>
      </div>
      <nav class="nav">
        <a class="pill" href="#next">Prochaine tâche</a>
        <a class="pill" href="#posts">Planning</a>
        <a class="pill" href="#documents">Documents</a>
        <button class="btn dark" type="button" id="refreshBtn">Actualiser</button>
        <a class="btn" href="/dashboard/logout.php">Déconnexion</a>
      </nav>
    </div>
  </div>

  <header class="wrap">
    <div class="kicker">xavierfenaux.com/dashboard</div>
    <h1>Publication X, prompts IA et documents partagés</h1>
    <p class="lead">Le dashboard relit la stratégie depuis le dossier protégé à chaque actualisation. Si le fichier de stratégie change, la prochaine tâche, les textes, les prompts et les visuels se mettent à jour.</p>
  </header>

  <main class="wrap grid" style="padding-bottom:60px">
    <section class="grid two" id="next">
      <div class="panel next">
        <div class="kicker">À faire maintenant</div>
        <div id="nextTask"><p class="muted">Chargement de la stratégie...</p></div>
      </div>
      <aside class="panel">
        <h2>Source active</h2>
        <p class="muted small">Fichier de stratégie lu en temps réel :</p>
        <p><b id="strategyFile">...</b></p>
        <p class="muted small">Dernière modification : <span id="strategyUpdated">...</span></p>
        <p class="muted small">Dernier rafraîchissement dashboard : <span id="lastRefresh">...</span></p>
        <button class="btn gold" type="button" id="copyAllNext">Copier tout pour la tâche</button>
        <p class="status" id="copyAllStatus"></p>
      </aside>
    </section>

    <section class="grid two">
      <div class="panel" id="posts">
        <h2>Planning et prompts</h2>
        <div class="toolbar">
          <input id="search" placeholder="Rechercher : CAC, CPI, ZEC...">
          <select id="category"><option value="">Toutes catégories</option></select>
          <select id="status"><option value="">Tous statuts</option></select>
        </div>
        <div id="postList" class="post-list"></div>
      </div>

      <div class="grid">
        <section class="panel" id="documents">
          <h2>Documents partagés</h2>
          <form class="upload" id="uploadForm">
            <input type="file" name="file" required>
            <button class="btn dark" type="submit">Ajouter</button>
          </form>
          <p class="status" id="uploadStatus"></p>
          <div id="documentList"></div>
        </section>
        <section class="panel">
          <h2>Règles de collaboration</h2>
          <div class="empty">
            Déposer ici les documents, exports, prompts et stratégies à partager entre les deux comptes. Pour mettre la stratégie à jour, remplacer le fichier HTML dans <b>/dashboard/strategy</b> : le dashboard prendra automatiquement le fichier le plus récemment modifié.
          </div>
        </section>
      </div>
    </section>
  </main>

  <script>
    const state = { posts: [], next: null };
    const months = { janvier:0, fevrier:1, février:1, mars:2, avril:3, mai:4, juin:5, juillet:6, aout:7, août:7, septembre:8, octobre:9, novembre:10, decembre:11, décembre:11 };

    function parseSchedule(post) {
      const label = (post.dateLabel || '').toLowerCase().replace('.', '');
      const dateMatch = label.match(/(\d{1,2})\s+([a-zéû]+)/i);
      const timeMatch = (post.time || '').match(/(\d{1,2}):(\d{2})/);
      if (!dateMatch || !timeMatch) return null;
      const now = new Date();
      const year = now.getFullYear();
      const month = months[dateMatch[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '')] ?? months[dateMatch[2]];
      if (month === undefined) return null;
      return new Date(year, month, Number(dateMatch[1]), Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
    }

    function formatDate(d) {
      return d ? new Intl.DateTimeFormat('fr-FR', { dateStyle:'full', timeStyle:'short' }).format(d) : 'Date non reconnue';
    }

    function formatBytes(size) {
      if (size < 1024) return size + ' o';
      if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' Ko';
      return (size / 1024 / 1024).toFixed(1) + ' Mo';
    }

    function findNext(posts) {
      const now = new Date();
      const dated = posts.map(post => ({ ...post, schedule: parseSchedule(post) })).filter(post => post.schedule);
      const upcoming = dated.filter(post => post.schedule >= now).sort((a, b) => a.schedule - b.schedule);
      if (upcoming.length) return upcoming[0];
      return dated.sort((a, b) => b.schedule - a.schedule)[0] || null;
    }

    function countdownParts(target) {
      const diff = Math.max(0, target - new Date());
      const totalMinutes = Math.floor(diff / 60000);
      return {
        days: Math.floor(totalMinutes / 1440),
        hours: Math.floor((totalMinutes % 1440) / 60),
        minutes: totalMinutes % 60,
        seconds: Math.floor((diff % 60000) / 1000)
      };
    }

    async function copyText(text, btn) {
      await navigator.clipboard.writeText(text);
      if (btn) {
        const old = btn.textContent;
        btn.textContent = 'Copié';
        btn.classList.add('ok');
        setTimeout(() => { btn.textContent = old; btn.classList.remove('ok'); }, 1200);
      }
    }

    function block(label, text, type = '') {
      if (!text) return '';
      const id = 'copy-' + Math.random().toString(36).slice(2);
      setTimeout(() => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', () => copyText(text, btn));
      });
      return `<div class="copy-block ${type}"><label>${label}</label><pre>${escapeHtml(text)}</pre><button class="copy-btn" id="${id}" type="button">Copier</button></div>`;
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
    }

    function renderNext() {
      const target = document.getElementById('nextTask');
      const post = state.next;
      if (!post) {
        target.innerHTML = '<div class="empty">Aucune tâche trouvée dans la stratégie.</div>';
        return;
      }
      const c = countdownParts(post.schedule);
      target.innerHTML = `
        <div class="meta"><span class="tag green">${escapeHtml(post.id)}</span><span class="tag">${escapeHtml(post.dateLabel)} · ${escapeHtml(post.time)}</span><span class="tag blue">${escapeHtml(post.category)}</span><span class="tag">${escapeHtml(post.status)}</span></div>
        <div class="task-title">${escapeHtml(post.title)}</div>
        <p class="muted">${escapeHtml(post.asset || post.meta)}</p>
        <div class="countdown"><div><strong>${c.days}</strong><span>jours</span></div><div><strong>${c.hours}</strong><span>heures</span></div><div><strong>${c.minutes}</strong><span>minutes</span></div><div><strong>${c.seconds}</strong><span>secondes</span></div></div>
        ${block('Post prêt à publier', post.text)}
        ${block('Réponse sous le post', post.reply)}
        ${block('Prompt post à envoyer à l’IA', post.prompt)}
        ${block('Prompt image à envoyer à l’IA', post.imagePrompt)}
      `;
    }

    function renderFilters() {
      const cats = [...new Set(state.posts.map(p => p.category).filter(Boolean))].sort();
      const statuses = [...new Set(state.posts.map(p => p.status).filter(Boolean))].sort();
      document.getElementById('category').innerHTML = '<option value="">Toutes catégories</option>' + cats.map(x => `<option>${escapeHtml(x)}</option>`).join('');
      document.getElementById('status').innerHTML = '<option value="">Tous statuts</option>' + statuses.map(x => `<option>${escapeHtml(x)}</option>`).join('');
    }

    function renderPosts() {
      const q = document.getElementById('search').value.toLowerCase();
      const cat = document.getElementById('category').value;
      const status = document.getElementById('status').value;
      const posts = state.posts.filter(post => {
        const hay = [post.id, post.title, post.category, post.status, post.asset, post.text, post.prompt, post.imagePrompt].join(' ').toLowerCase();
        return (!q || hay.includes(q)) && (!cat || post.category === cat) && (!status || post.status === status);
      });
      document.getElementById('postList').innerHTML = posts.map(post => `
        <article class="post">
          <div class="post-top">
            <div>
              <div class="meta"><span class="tag">${escapeHtml(post.id)}</span><span class="tag">${escapeHtml(post.dateLabel)} · ${escapeHtml(post.time)}</span><span class="tag">${escapeHtml(post.category)}</span></div>
              <h3>${escapeHtml(post.title)}</h3>
              <p>${escapeHtml(post.asset || '')}</p>
            </div>
            <span class="tag">${escapeHtml(post.status)}</span>
          </div>
          <details>
            <summary>Copier les contenus</summary>
            ${block('Post', post.text)}
            ${block('Réponse', post.reply)}
            ${block('Prompt post', post.prompt)}
            ${block('Prompt image', post.imagePrompt)}
          </details>
        </article>
      `).join('') || '<div class="empty">Aucun post ne correspond aux filtres.</div>';
    }

    async function loadStrategy() {
      const res = await fetch('/dashboard/api.php?ts=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('Stratégie inaccessible');
      const data = await res.json();
      state.posts = data.posts || [];
      state.next = findNext(state.posts);
      document.getElementById('strategyFile').textContent = data.strategyFile || 'Aucun fichier';
      document.getElementById('strategyUpdated').textContent = data.strategyUpdatedAt ? formatDate(new Date(data.strategyUpdatedAt)) : 'Non disponible';
      document.getElementById('lastRefresh').textContent = formatDate(new Date());
      renderFilters();
      renderNext();
      renderPosts();
    }

    async function loadDocuments() {
      const res = await fetch('/dashboard/documents.php?ts=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const docs = data.documents || [];
      document.getElementById('documentList').innerHTML = docs.map(doc => `
        <div class="doc-row">
          <div><b>${escapeHtml(doc.name)}</b><div class="muted small">${formatBytes(doc.size)} · ${formatDate(new Date(doc.updatedAt))}</div></div>
          <a class="btn" href="${doc.url}">Télécharger</a>
        </div>
      `).join('') || '<div class="empty" style="margin-top:12px">Aucun document partagé pour le moment.</div>';
    }

    document.getElementById('refreshBtn').addEventListener('click', () => Promise.all([loadStrategy(), loadDocuments()]));
    ['search','category','status'].forEach(id => document.getElementById(id).addEventListener('input', renderPosts));
    document.getElementById('copyAllNext').addEventListener('click', async () => {
      if (!state.next) return;
      const text = [
        `Tâche ${state.next.id} · ${state.next.dateLabel} ${state.next.time}`,
        state.next.title,
        '',
        'POST',
        state.next.text || 'À générer',
        '',
        'RÉPONSE',
        state.next.reply || 'À générer',
        '',
        'PROMPT POST',
        state.next.prompt || 'Aucun prompt',
        '',
        'PROMPT IMAGE',
        state.next.imagePrompt || 'Aucun prompt image'
      ].join('\n');
      await copyText(text);
      document.getElementById('copyAllStatus').textContent = 'Tâche complète copiée.';
      setTimeout(() => document.getElementById('copyAllStatus').textContent = '', 1500);
    });

    document.getElementById('uploadForm').addEventListener('submit', async event => {
      event.preventDefault();
      const status = document.getElementById('uploadStatus');
      status.textContent = 'Upload en cours...';
      const res = await fetch('/dashboard/documents.php', { method: 'POST', body: new FormData(event.currentTarget) });
      status.textContent = res.ok ? 'Document ajouté.' : 'Upload impossible.';
      if (res.ok) {
        event.currentTarget.reset();
        loadDocuments();
      }
    });

    Promise.all([loadStrategy(), loadDocuments()]).catch(error => {
      document.getElementById('nextTask').innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    });
    setInterval(() => { renderNext(); }, 1000);
    setInterval(() => { loadStrategy(); loadDocuments(); }, 60000);
  </script>
</body>
</html>
