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
  <title>Plan de publication · Xavier Fenaux</title>
  <link rel="icon" type="image/png" href="/images/favicon-signature-black.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#f5f1e8;--panel:#fffaf0;--ink:#17140f;--muted:#6d6558;--accent:#997733;--line:rgba(23,20,15,.12);--green:#168a4a;--blue:#155eef;--red:#b42318}
    *{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#fffaf0 0%,var(--bg) 52%,#ece4d4 100%);color:var(--ink);font-family:Inter,system-ui,sans-serif;line-height:1.45}button,input,textarea,select{font:inherit}
    .wrap{max-width:1220px;margin:auto;padding:0 22px}.topbar{position:sticky;top:0;z-index:10;background:rgba(245,241,232,.9);backdrop-filter:blur(16px);border-bottom:1px solid var(--line)}
    .topbar .wrap{display:flex;justify-content:space-between;align-items:center;gap:14px;padding-top:12px;padding-bottom:12px}.brand{display:flex;align-items:center;gap:14px}.brand img{height:42px}.brand b{display:block}.brand span{font-size:13px;color:var(--muted)}
    .nav{display:flex;gap:8px;flex-wrap:wrap}.btn,.pill{border:1px solid var(--line);background:white;color:var(--ink);border-radius:999px;padding:9px 12px;text-decoration:none;font-size:13px;font-weight:900;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease,background .15s ease}.btn:hover,.pill:hover{transform:translateY(-1px);box-shadow:0 8px 20px rgba(56,43,20,.12)}.btn.dark{background:var(--ink);color:white}.btn.gold{background:var(--accent);border-color:var(--accent);color:white}.btn.ok{background:var(--green);border-color:var(--green);color:white}.btn.danger{background:#fff5f3;border-color:rgba(180,35,24,.25);color:var(--red)}.btn.danger:hover{background:var(--red);border-color:var(--red);color:white}
    header{padding:30px 0 18px}.kicker{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:var(--accent);font-weight:900}h1{font-size:clamp(34px,5vw,58px);line-height:.98;letter-spacing:-.04em;margin:10px 0 10px}.lead{font-size:17px;color:var(--muted);max-width:760px}
    .grid{display:grid;gap:16px}.two{grid-template-columns:1.05fr .95fr}.panel{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:18px;box-shadow:0 18px 50px rgba(56,43,20,.1)}.panel h2{margin:0 0 12px;font-size:24px;letter-spacing:-.03em}.panel h3{margin:0 0 8px;font-size:18px}
    .next{background:linear-gradient(135deg,#fffaf0,#fff,#f5ead1);border-color:rgba(153,119,51,.38)}.task-title{font-size:28px;line-height:1.08;letter-spacing:-.035em;margin:8px 0}.meta{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.tag{border:1px solid var(--line);background:white;border-radius:999px;padding:6px 9px;color:var(--muted);font-size:12px;font-weight:900}.tag.green{color:var(--green);border-color:rgba(22,138,74,.25)}.tag.blue{color:var(--blue);border-color:rgba(21,94,239,.24)}
    .countdown{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.countdown div{background:white;border:1px solid var(--line);border-radius:14px;padding:12px;text-align:center}.countdown strong{display:block;font-size:24px}.countdown span{font-size:11px;color:var(--muted);font-weight:900;text-transform:uppercase}
    .toolbar{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}.toolbar input,.toolbar select{border:1px solid var(--line);border-radius:999px;padding:11px 13px;background:white;min-width:210px}.post-list{display:grid;gap:12px}.post{background:white;border:1px solid var(--line);border-radius:16px;padding:15px;transition:border-color .15s ease,box-shadow .15s ease,transform .15s ease}.post:hover{border-color:rgba(153,119,51,.28);box-shadow:0 14px 34px rgba(56,43,20,.1);transform:translateY(-1px)}.post-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.post-main{min-width:0}.post-actions{display:flex;align-items:flex-start;gap:8px;flex-shrink:0}.post p{margin:0;color:var(--muted)}.post details{margin-top:12px;border-top:1px solid var(--line);padding-top:12px}.post summary{cursor:pointer;font-weight:900;color:var(--accent)}
    .prompt-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.field{display:grid;gap:7px}.field label{font-size:12px;font-weight:900;color:var(--accent);text-transform:uppercase;letter-spacing:.08em}.field textarea{width:100%;min-height:170px;border:1px solid var(--line);border-radius:14px;padding:12px;background:#fff;resize:vertical;color:var(--ink)}.field textarea.post-text{min-height:220px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.status{font-size:13px;color:var(--muted);margin-top:8px}.status.error{color:var(--red);font-weight:900}.empty{padding:18px;border:1px dashed var(--line);border-radius:16px;color:var(--muted);background:white}.muted{color:var(--muted)}.small{font-size:13px}
    @media(max-width:960px){.two,.prompt-grid{grid-template-columns:1fr}.topbar .wrap{align-items:flex-start;flex-direction:column}.countdown{grid-template-columns:repeat(2,1fr)}.post-top{display:block}.post-actions{margin-top:12px}}
  </style>
</head>
<body>
  <div class="topbar">
    <div class="wrap">
      <div class="brand">
        <img src="/images/SignatureXav.png" alt="Xavier Fenaux">
        <div><b>Plan de publication</b><span><?= htmlspecialchars($user, ENT_QUOTES, 'UTF-8') ?></span></div>
      </div>
      <nav class="nav">
        <a class="pill" href="#next">Prochaine tâche</a>
        <a class="pill" href="#plan">Plan</a>
        <button class="btn dark" type="button" id="refreshBtn">Actualiser</button>
        <a class="btn" href="/dashboard/logout.php">Déconnexion</a>
      </nav>
    </div>
  </div>

  <header class="wrap">
    <div class="kicker">xavierfenaux.com/dashboard</div>
    <h1>Plan de publication X</h1>
    <p class="lead">Uniquement le planning, la prochaine tâche et les prompts à copier. Les prompts post et image sont modifiables ici et sauvegardés dans le fichier de stratégie.</p>
  </header>

  <main class="wrap grid" style="padding-bottom:60px">
    <section class="grid two" id="next">
      <div class="panel next">
        <div class="kicker">Prochaine publication</div>
        <div id="nextTask"><p class="muted">Chargement...</p></div>
      </div>
      <aside class="panel">
        <h2>Source</h2>
        <p class="muted small">Fichier stratégie : <b id="strategyFile">...</b></p>
        <p class="muted small">Mis à jour : <span id="strategyUpdated">...</span></p>
        <p class="muted small">Dashboard : <span id="lastRefresh">...</span></p>
        <button class="btn gold" type="button" id="copyAllNext">Copier prompts de la prochaine tâche</button>
        <p class="status" id="copyAllStatus"></p>
      </aside>
    </section>

    <section class="panel" id="plan">
      <h2>Plan de publication</h2>
      <div class="toolbar">
        <input id="search" placeholder="Rechercher : CAC, CPI, ZEC...">
        <select id="category"><option value="">Toutes catégories</option></select>
        <select id="status"><option value="">Tous statuts</option></select>
      </div>
      <div id="postList" class="post-list"></div>
    </section>
  </main>

  <script>
    const state = { posts: [], next: null };
    const months = { janvier:0, fevrier:1, février:1, mars:2, avril:3, mai:4, juin:5, juillet:6, aout:7, août:7, septembre:8, octobre:9, novembre:10, decembre:11, décembre:11 };

    const $ = id => document.getElementById(id);

    function parseSchedule(post) {
      const label = (post.dateLabel || '').toLowerCase().replace('.', '');
      const dateMatch = label.match(/(\d{1,2})\s+([a-zéû]+)/i);
      const timeMatch = (post.time || '').match(/(\d{1,2}):(\d{2})/);
      if (!dateMatch || !timeMatch) return null;
      const normalizedMonth = dateMatch[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const month = months[normalizedMonth] ?? months[dateMatch[2]];
      if (month === undefined) return null;
      const now = new Date();
      return new Date(now.getFullYear(), month, Number(dateMatch[1]), Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
    }

    function formatDate(d) {
      return d ? new Intl.DateTimeFormat('fr-FR', { dateStyle:'full', timeStyle:'short' }).format(d) : 'Date non reconnue';
    }

    function findNext(posts) {
      const now = new Date();
      const dated = posts.map(post => ({ ...post, schedule: parseSchedule(post) })).filter(post => post.schedule);
      const upcoming = dated.filter(post => post.schedule >= now).sort((a, b) => a.schedule - b.schedule);
      return upcoming[0] || dated.sort((a, b) => b.schedule - a.schedule)[0] || null;
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

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
    }

    async function copyText(text, btn) {
      await navigator.clipboard.writeText(text);
      if (!btn) return;
      const old = btn.textContent;
      btn.textContent = 'Copié';
      btn.classList.add('ok');
      setTimeout(() => { btn.textContent = old; btn.classList.remove('ok'); }, 1200);
    }

    function promptFields(post, prefix) {
      const postId = escapeHtml(post.id);
      return `
        <div class="prompt-grid">
          <div class="field">
            <label for="${prefix}-prompt-${postId}">Prompt post</label>
            <textarea id="${prefix}-prompt-${postId}" data-kind="prompt" data-id="${postId}">${escapeHtml(post.prompt || '')}</textarea>
          </div>
          <div class="field">
            <label for="${prefix}-image-${postId}">Prompt image</label>
            <textarea id="${prefix}-image-${postId}" data-kind="imagePrompt" data-id="${postId}">${escapeHtml(post.imagePrompt || '')}</textarea>
          </div>
        </div>
        <div class="actions">
          <button class="btn dark" type="button" data-action="copy-prompts" data-id="${postId}">Copier prompts</button>
          <button class="btn gold" type="button" data-action="save-prompts" data-id="${postId}">Sauvegarder prompts</button>
        </div>
        <p class="status" id="status-${prefix}-${postId}"></p>
      `;
    }

    function wirePromptButtons(root = document) {
      root.querySelectorAll('[data-action="copy-prompts"]').forEach(btn => {
        btn.onclick = () => {
          const id = btn.dataset.id;
          const scope = btn.closest('.post') || btn.closest('#nextTask') || root;
          const prompt = scope.querySelector(`textarea[data-id="${id}"][data-kind="prompt"]`)?.value || '';
          const imagePrompt = scope.querySelector(`textarea[data-id="${id}"][data-kind="imagePrompt"]`)?.value || '';
          copyText(['PROMPT POST', prompt, '', 'PROMPT IMAGE', imagePrompt].join('\n'), btn);
        };
      });

      root.querySelectorAll('[data-action="save-prompts"]').forEach(btn => {
        btn.onclick = async () => savePrompts(btn.dataset.id, btn);
      });

      root.querySelectorAll('[data-action="delete-post"]').forEach(btn => {
        btn.onclick = async () => deletePost(btn.dataset.id, btn);
      });
    }

    async function savePrompts(id, btn) {
      const scope = btn.closest('.post') || btn.closest('#nextTask') || document;
      const prompt = scope.querySelector(`textarea[data-id="${id}"][data-kind="prompt"]`)?.value || '';
      const imagePrompt = scope.querySelector(`textarea[data-id="${id}"][data-kind="imagePrompt"]`)?.value || '';
      const statusNodes = document.querySelectorAll(`[id$="-${id}"].status`);
      statusNodes.forEach(node => { node.textContent = 'Sauvegarde...'; node.classList.remove('error'); });

      const res = await fetch('/dashboard/save-prompt.php', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ id, prompt, imagePrompt })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        statusNodes.forEach(node => { node.textContent = data.error || 'Sauvegarde impossible'; node.classList.add('error'); });
        return;
      }

      const post = state.posts.find(p => p.id === id);
      if (post) {
        post.prompt = prompt;
        post.imagePrompt = imagePrompt;
      }
      if (state.next && state.next.id === id) {
        state.next.prompt = prompt;
        state.next.imagePrompt = imagePrompt;
      }
      statusNodes.forEach(node => { node.textContent = 'Prompts sauvegardés.'; node.classList.remove('error'); });
      if (btn) {
        btn.textContent = 'Sauvegardé';
        setTimeout(() => btn.textContent = 'Sauvegarder prompts', 1200);
      }
      setTimeout(loadStrategy, 600);
    }

    async function deletePost(id, btn) {
      const post = state.posts.find(item => item.id === id);
      const label = post ? `${post.id} · ${post.title}` : id;
      if (!confirm(`Supprimer cette ligne du plan ?\n\n${label}`)) return;

      btn.disabled = true;
      btn.textContent = 'Suppression...';
      const res = await fetch('/dashboard/delete-post.php', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ id })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        btn.disabled = false;
        btn.textContent = 'Supprimer';
        alert(data.error || 'Suppression impossible');
        return;
      }

      state.posts = state.posts.filter(item => item.id !== id);
      state.next = findNext(state.posts);
      renderNext();
      renderPosts();
    }

    function renderNext() {
      const target = $('nextTask');
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
        ${promptFields(post, 'next')}
      `;
      wirePromptButtons(target);
    }

    function renderFilters() {
      const cats = [...new Set(state.posts.map(p => p.category).filter(Boolean))].sort();
      const statuses = [...new Set(state.posts.map(p => p.status).filter(Boolean))].sort();
      $('category').innerHTML = '<option value="">Toutes catégories</option>' + cats.map(x => `<option>${escapeHtml(x)}</option>`).join('');
      $('status').innerHTML = '<option value="">Tous statuts</option>' + statuses.map(x => `<option>${escapeHtml(x)}</option>`).join('');
    }

    function renderPosts() {
      const q = $('search').value.toLowerCase();
      const cat = $('category').value;
      const status = $('status').value;
      const posts = state.posts.filter(post => {
        const hay = [post.id, post.title, post.category, post.status, post.asset, post.prompt, post.imagePrompt].join(' ').toLowerCase();
        return (!q || hay.includes(q)) && (!cat || post.category === cat) && (!status || post.status === status);
      });

      $('postList').innerHTML = posts.map(post => `
        <article class="post">
          <div class="post-top">
            <div class="post-main">
              <div class="meta"><span class="tag">${escapeHtml(post.id)}</span><span class="tag">${escapeHtml(post.dateLabel)} · ${escapeHtml(post.time)}</span><span class="tag">${escapeHtml(post.category)}</span></div>
              <h3>${escapeHtml(post.title)}</h3>
              <p>${escapeHtml(post.asset || '')}</p>
            </div>
            <div class="post-actions">
              <button class="btn danger" type="button" data-action="delete-post" data-id="${escapeHtml(post.id)}">Supprimer</button>
            </div>
          </div>
          <details>
            <summary>Voir / modifier les prompts</summary>
            ${promptFields(post, 'post')}
          </details>
        </article>
      `).join('') || '<div class="empty">Aucun post ne correspond aux filtres.</div>';
      wirePromptButtons($('postList'));
    }

    async function loadStrategy() {
      const res = await fetch('/dashboard/api.php?ts=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('Stratégie inaccessible');
      const data = await res.json();
      state.posts = data.posts || [];
      state.next = findNext(state.posts);
      $('strategyFile').textContent = data.strategyFile || 'Aucun fichier';
      $('strategyUpdated').textContent = data.strategyUpdatedAt ? formatDate(new Date(data.strategyUpdatedAt)) : 'Non disponible';
      $('lastRefresh').textContent = formatDate(new Date());
      renderFilters();
      renderNext();
      renderPosts();
    }

    $('refreshBtn').addEventListener('click', loadStrategy);
    ['search','category','status'].forEach(id => $(id).addEventListener('input', renderPosts));
    $('copyAllNext').addEventListener('click', () => {
      if (!state.next) return;
      copyText(['PROMPT POST', state.next.prompt || '', '', 'PROMPT IMAGE', state.next.imagePrompt || ''].join('\n'), $('copyAllNext'));
      $('copyAllStatus').textContent = 'Prompts copiés.';
      setTimeout(() => $('copyAllStatus').textContent = '', 1500);
    });

    loadStrategy().catch(error => {
      $('nextTask').innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    });
    setInterval(renderNext, 1000);
    setInterval(loadStrategy, 60000);
  </script>
</body>
</html>
