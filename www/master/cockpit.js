"use strict";
const boot = JSON.parse(document.getElementById("boot").textContent);
const main = document.getElementById("main");
const labels = {
  home: "Vue d’ensemble",
  social: "Mes statistiques",
  content: "Créer du contenu",
  markets: "Ma veille",
  tools: "Tous mes outils",
  accounts: "Mes comptes & données",
};
const state = {
  view: "home",
  days: 30,
  owner: "all",
  network: "all",
  metric: "followers",
  social: null,
  socialError: "",
  statusError: "",
  services: boot.services,
  query: "",
  category: "all",
  chart: null,
  loading: false,
};
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const fmt = (n) =>
  n === null || n === undefined
    ? "—"
    : new Intl.NumberFormat("fr-FR").format(n);
const shortDate = (d) =>
  d
    ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
      })
    : "Pas de relevé";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const dateOffset = (day, n) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const period = () => ({
  start: dateOffset(today(), 1 - state.days),
  end: today(),
});
const icons = () => window.lucide?.createIcons();
const external = (url, label, cls = "secondary") =>
  `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}${icon("arrow-up-right")}</a>`;
const accountList = () =>
  (state.social?.accounts || []).filter(
    (a) =>
      (state.owner === "all" || a.owner === state.owner) &&
      (state.network === "all" || a.id === state.network),
  );
const summary = (a) => {
  const p = period();
  return CockpitMetrics.summarize(
    state.social?.records || [],
    a.id,
    p.start,
    p.end,
  );
};
const connection = (a) => state.social?.connections?.[a.id] || {};
const networkIcon = (a) =>
  `<span class="network-icon" style="--network:${esc(a.color)}">${a.network === "X" ? "𝕏" : icon({ Instagram: "instagram", TikTok: "music-2", YouTube: "youtube", Spotify: "audio-lines", Twitch: "twitch" }[a.network])}</span>`;
function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 5500);
}
function guideBand(person, title, text, theme = "", help = "welcome") {
  const names = {
    lea: "LÉA · TON ASSISTANTE",
    bobby: "BOBBY · TON COMMUNITY MANAGER",
    maya: "MAYA · TON STUDIO CRÉATIF",
  };
  return `<section class="guide-band ${theme}"><div class="avatar ${person}" role="img" aria-label="${esc(names[person])}"></div><div class="guide-copy"><span class="eyebrow">${names[person]}</span><h2>${title}</h2><p>${text}</p></div><button class="secondary" data-guide="${help}">${icon("circle-help")}Guide express</button></section>`;
}
function heading(title, description, actions = "") {
  return `<div class="page-heading"><div><span class="eyebrow">LE COCKPIT DE XAVIER</span><h1>${title}</h1><p>${description}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ""}</div>`;
}
function connectButton(a) {
  const c = connection(a);
  return c.active
    ? `<span class="chip ok">${icon("check")}Connecté${c.catalogOnly ? " · catalogue" : ""}</span>`
    : `<button class="primary" data-connect="${a.id}">${icon("plug")}${c.needsReconnect ? "Reconnecter" : "Connecter"} ${esc(a.network)}</button>`;
}
function kpis() {
  const accounts = accountList(),
    summaries = accounts.map(summary);
  return `<div class="kpis">${[
    ["followers", "Abonnés cumulés", "users-round"],
    ["gain", "Gain d’abonnés", "trending-up"],
    ["posts", "Publications", "files"],
    ["reactions", "J’aime reçus", "heart"],
  ]
    .map(([key, label, i]) => {
      const result = CockpitMetrics.aggregate(summaries, key);
      let hint =
        key === "followers"
          ? `${result.count}/${accounts.length} comptes renseignés · non dédupliqués`
          : `${result.count}/${accounts.length} comptes · ${state.days} jours`;
      if (!result.count)
        hint = state.social ? "Données à connecter" : "Chargement…";
      else if (key === "gain")
        hint = `${shortDate(period().start)} → ${shortDate(period().end)} · ${result.count}/${accounts.length} comptes`;
      else if (key !== "followers") hint += " · relevés disponibles";
      return `<article class="kpi"><div class="kpi-title">${label}${icon(i)}</div><strong class="kpi-value ${key === "gain" && result.value !== null ? (result.value >= 0 ? "positive" : "negative") : ""}">${key === "gain" && result.value > 0 ? "+" : ""}${fmt(result.value)}</strong><small>${hint}</small></article>`;
    })
    .join("")}</div>`;
}
function chartSection() {
  const hasData = accountList().some((a) =>
    summary(a).rows.some((r) => typeof r[state.metric] === "number"),
  );
  return `<section class="surface"><div class="section-title"><div><h2>${{ followers: "L’évolution de ta communauté", views: "Les vues au fil des jours", reactions: "Les réactions à tes contenus" }[state.metric]}</h2><p>${shortDate(period().start)} au ${shortDate(period().end)}</p></div><button class="icon-button" title="Comprendre ce graphique" aria-label="Comprendre ce graphique" data-guide="metrics">${icon("circle-help")}</button></div><div class="chart-wrap">${hasData ? '<canvas id="social-chart" role="img" aria-label="Évolution des statistiques par réseau. Les valeurs sont aussi disponibles dans le tableau et l’export CSV."></canvas>' : `<div class="chart-empty">${icon("chart-no-axes-combined")}<strong>${state.social ? "Ton histoire commence ici" : "Lecture des statistiques…"}</strong><p>${state.social ? "Connecte un premier réseau. Chaque relevé ajoutera un point à ta courbe." : "Un instant, nous récupérons tes données."}</p>${state.social ? '<a href="#accounts" class="text-button">Connecter mes comptes &rarr;</a>' : ""}</div>`}</div><div class="chart-note">Les jours sans relevé restent vides. ${state.metric === "followers" ? "Abonnements cumulés, pas des personnes uniques." : "Valeurs quotidiennes sur les seuls jours renseignés."}</div></section>`;
}
function channels() {
  return `<section class="surface"><div class="section-title"><div><h2>Tes six rendez-vous</h2><p>Xavier &amp; Interactiv Trading</p></div><a href="#accounts" class="text-button">Gérer ${icon("arrow-right")}</a></div><ul class="channel-list">${
    (state.social?.accounts || [])
      .map((a) => {
        const s = summary(a);
        return `<li class="channel-row">${networkIcon(a)}<div><strong>${esc(a.network)}</strong><small>${esc(a.handle)}</small></div><span class="channel-count"><strong>${fmt(s.followers)}</strong><small>${s.followers !== null ? shortDate(s.followerDate) : connection(a).active ? "Connecté" : "À connecter"}</small></span>${external(a.url, `<span class="sr-only">Voir ${esc(a.network)}</span>`, "icon-button")}</li>`;
      })
      .join("") || "<p>Chargement des comptes…</p>"
  }</ul></section>`;
}
function home() {
  const connected = Object.values(state.social?.connections || {}).filter(
    (c) => c.active,
  ).length;
  return (
    heading(
      "Bonjour Xavier,",
      "Un peu de recul, les bonnes infos, puis place à l’action.",
      `<a class="secondary" href="#accounts">${icon("plug")}Mes comptes <span class="chip">${connected}/6</span></a>`,
    ) +
    guideBand(
      "lea",
      "On commence par quoi aujourd’hui ?",
      "Bobby suit tes réseaux. Maya t’aide à préparer tes contenus. Et tes outils de veille sont juste à côté.",
      "coral",
    ) +
    `<div class="section-title"><div><h2>Ta communauté, en un regard</h2><p>Les ${state.days} derniers jours · d’après les données disponibles</p></div><a class="text-button" href="#social">Toutes mes stats ${icon("arrow-right")}</a></div>` +
    kpis() +
    `<div class="split">${chartSection()}${channels()}</div><div class="section-title"><div><h2>Une idée, une action</h2><p>Choisis ce que tu veux faire.</p></div></div><section class="actions-grid">${[
      [
        "social",
        "chart-no-axes-combined",
        "Voir ce qui plaît",
        "Retrouve les abonnés, les vues et les réactions sur chacun de tes réseaux.",
        "Retrouver Bobby",
      ],
      [
        "content",
        "clapperboard",
        "Préparer mes contenus",
        "Un extrait du Morning Mood ou ton prochain post X.",
        "Retrouver Maya",
      ],
      [
        "markets",
        "radar",
        "Préparer ma journée",
        "La veille IVT et les sujets à surveiller.",
        "Ouvrir ma veille",
      ],
    ]
      .map(
        ([url, i, title, text, action]) =>
          `<a href="#${url}" class="action-card"><span class="action-icon">${icon(i)}</span><h3>${title}</h3><p>${text}</p><span class="text-button">${action} ${icon("arrow-right")}</span></a>`,
      )
      .join("")}</section>`
  );
}
function filters() {
  return `<div class="filter-bar"><div class="segmented" aria-label="Période">${[7, 30, 90].map((d) => `<button data-days="${d}" aria-pressed="${state.days === d}">${d} jours</button>`).join("")}</div><select id="owner-filter" aria-label="Compte"><option value="all">Xavier + IVT</option value="Xavier" ${state.owner === "Xavier" ? "selected" : ""}>Xavier</option><option value="IVT" ${state.owner === "IVT" ? "selected" : ""}>Interactiv Trading</option></select><select id="network-filter" aria-label="Réseau"><option value="all">Tous les réseaux</option>${(
    state.social?.accounts || []
  )
    .filter((a) => state.owner === "all" || a.owner === state.owner)
    .map(
      (a) =>
        `<option value="${a.id}" ${state.network === a.id ? "selected" : ""}>${esc(a.network)}</option>`,
    )
    .join("")}</select></div>`;
}
function statsTable() {
  return `<div class="section-title"><div><h2>Le détail, réseau par réseau</h2><p>Abonnés : dernier relevé. Activité : somme des jours renseignés sur la période.</p></div><button class="text-button" data-export>${icon("download")}Exporter</button></div><div class="table-scroll"><table><thead><tr><th>Réseau</th><th>Abonnés</th><th>Gain</th><th>Posts</th><th>J’aime</th><th>Vues / écoutes</th><th>Commentaires</th><th>Partages</th><th>Relevés</th></tr></thead><tbody>${accountList()
    .map((a) => {
      const s = summary(a);
      return `<tr><td><div>${networkIcon(a)}<span>${esc(a.network)}<small>${esc(a.owner)}</small></span></div></td><td>${fmt(s.followers)}<small>${shortDate(s.followerDate)}</small></td><td class="${s.gain > 0 ? "positive" : s.gain < 0 ? "negative" : ""}">${s.gain > 0 ? "+" : ""}${fmt(s.gain)}</td>${["posts", "reactions", "views", "comments", "shares"].map((k) => `<td title="${s[k + "Days"]} jours renseignés sur ${state.days}">${fmt(s[k])}${s[k] !== null ? `<small>${s[k + "Days"]}/${state.days} j.</small>` : ""}</td>`).join("")}<td><button class="icon-button" title="Ajouter un relevé ${esc(a.network)}" aria-label="Ajouter un relevé ${esc(a.network)}" data-entry="${a.id}">${icon("plus")}</button></td></tr>`;
    })
    .join(
      "",
    )}</tbody></table></div><p class="table-hint">— = donnée indisponible, jamais zéro par défaut. Le gain nécessite un relevé aux deux dates limites. Les vues et les écoutes ne sont pas directement comparables.</p>`;
}
function socialPage() {
  return (
    heading(
      "Mes statistiques",
      "Ce qui grandit, ce qui attire l’attention, ce qui donne envie de réagir.",
      `<a href="#accounts" class="secondary">${icon("plug")}Mes connexions</a><button class="primary" data-entry="">${icon("plus")}Ajouter un relevé</button>`,
    ) +
    guideBand(
      "bobby",
      "Faisons parler tes chiffres.",
      "Commence par les abonnés pour suivre ta communauté. Puis regarde les vues et les réactions pour repérer les contenus à refaire.",
      "",
      "metrics",
    ) +
    filters() +
    kpis() +
    `<div class="segmented" aria-label="Indicateur du graphique">${[
      ["followers", "Abonnés"],
      ["views", "Vues / écoutes"],
      ["reactions", "J’aime"],
    ]
      .map(
        ([k, v]) =>
          `<button data-metric="${k}" aria-pressed="${state.metric === k}">${v}</button>`,
      )
      .join("")}</div><div class="split">${chartSection()}${channels()}</div>` +
    statsTable() +
    `<div class="help-line">${icon("info")}Les chiffres évoluent avec les connexions et les relevés. Les autorisations de chaque réseau déterminent les statistiques disponibles.</div>`
  );
}
const toolCopy = {
  "ivt-radar": [
    "scan-eye",
    "Les actualités et sujets IVT qui méritent ton attention ce matin.",
  ],
  clips: [
    "scissors",
    "Transforme un Morning Mood en extraits courts à relire puis exporter.",
  ],
  "strategy-x": [
    "notebook-pen",
    "Choisis un sujet, un angle et une accroche pour ton prochain post X.",
  ],
  analytics: [
    "mouse-pointer-2",
    "Suis les visites du site, les pages lues et l’origine des visiteurs.",
  ],
  "site-xavier": [
    "globe",
    "Ouvre ton site public et retrouve les contenus et les demandes Morning Mood.",
  ],
};
function serviceRows(list) {
  return `<div class="tool-list">${
    list
      .map((s) => {
        const copy = toolCopy[s.id] || ["grid-2x2", s.summary];
        const offline = ["missing", "offline"].includes(s.status?.state);
        return `<article class="tool-row"><span class="tool-icon">${icon(copy[0])}</span><div><h3>${esc(s.name)}</h3><p>${esc(copy[1])}</p>${offline ? '<small class="negative">Cet outil est momentanément indisponible.</small>' : ""}</div><span class="chip ${s.status?.state === "online" ? "ok" : offline ? "bad" : ""}"><span class="dot"></span>${s.status?.state === "online" ? "Disponible" : offline ? "À vérifier" : "Vérification…"}</span><div class="tool-actions"><button class="icon-button" data-tool="${s.id}" title="Comment utiliser ${esc(s.name)}" aria-label="Comment utiliser ${esc(s.name)}">${icon("circle-help")}</button>${offline ? "" : external(s.href, "Ouvrir")}</div></article>`;
      })
      .join("") ||
    '<div class="empty-result">Aucun outil pour cette recherche.</div>'
  }</div>`;
}
function taskList() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem("xavier-tasks:" + today()) || "{}");
  } catch {}
  return [
    ["veille", "Lire ma veille", "Les sujets IVT du jour.", "https://radar.ftfenaux.com/"],
    [
      "clip",
      "Choisir un extrait",
      "Un passage utile du Morning Mood.",
      "/clips/",
    ],
    [
      "post",
      "Préparer un post",
      "Une idée claire à partager.",
      "/master/strategy.php",
    ],
  ]
    .map(
      ([id, title, desc, url]) =>
        `<div class="task"><input type="checkbox" id="task-${id}" data-task="${id}" ${saved[id] ? "checked" : ""}><label for="task-${id}">${title}<small>${desc}</small></label>${external(url, "Ouvrir", "text-button")}</div>`,
    )
    .join("");
}
function contentPage() {
  return (
    heading(
      "Créer du contenu",
      "Une bonne idée peut devenir plusieurs contenus.",
    ) +
    guideBand(
      "maya",
      "On part de ce que tu as déjà.",
      "Un passage du Morning Mood peut devenir un clip. Un sujet du radar peut nourrir ton prochain post X. Choisis le format, je t’indique les étapes.",
      "lilac",
      "content",
    ) +
    `<section class="actions-grid">${[
      [
        "clips",
        "scissors",
        "Un extrait vidéo",
        "À partir d’un épisode ou d’un enregistrement.",
      ],
      [
        "strategy-x",
        "notebook-pen",
        "Un post X",
        "À partir de tes sujets et de ta stratégie éditoriale.",
      ],
    ]
      .map(
        ([id, i, t, p]) =>
          `<button class="action-card" data-tool="${id}"><span class="action-icon">${icon(i)}</span><h3>${t}</h3><p>${p}</p><span class="text-button">Les 3 étapes ${icon("arrow-right")}</span></button>`,
      )
      .join(
        "",
      )}</section><div class="section-title"><h2>Les outils de ton studio</h2></div>` +
    serviceRows(
      state.services.filter((s) =>
        ["Contenu", "Editorial", "Production"].includes(s.category),
      ),
    ) +
    `<div class="help-line">${icon("circle-check")}Avant de publier : relis le texte, vérifie les chiffres et regarde l’extrait jusqu’au bout.</div>`
  );
}
function marketsPage() {
  return (
    heading(
      "Ma veille",
      "Les sujets IVT du matin, à portée de main.",
    ) +
    guideBand(
      "lea",
      "Le bon ordre pour démarrer.",
      "Lis le contexte du marché, retiens les sujets utiles et choisis les angles à approfondir.",
      "coral",
      "markets",
    ) +
    `<div class="split"><section><div class="section-title"><h2>Mon petit rituel</h2><span class="chip">Aujourd’hui</span></div>${taskList()}</section><section><div class="section-title"><h2>Rendez-vous du matin</h2></div><div class="task"><span class="chip">07:15</span><label>Veille IVT<small>Horaire prévu du radar quotidien.</small></label></div></section></div><div class="section-title"><h2>Ma veille IVT</h2></div>` +
    serviceRows(
      state.services.filter((s) =>
        ["Marches", "Presentation", "Evenement"].includes(s.category),
      ),
    )
  );
}
function toolsPage() {
  const categories = [...new Set(state.services.map((s) => s.category))];
  const list = state.services.filter(
    (s) =>
      (state.category === "all" || s.category === state.category) &&
      [s.name, toolCopy[s.id]?.[1], s.category]
        .join(" ")
        .toLowerCase()
        .includes(state.query.toLowerCase()),
  );
  return (
    heading(
      "Tous mes outils",
      "Tout retrouver, même quand on ne sait plus où chercher.",
    ) +
    `<div class="filter-bar"><input type="search" id="tool-search" class="search" placeholder="Chercher un outil ou un usage…" aria-label="Chercher un outil" value="${esc(state.query)}"><select id="tool-category" aria-label="Catégorie"><option value="all">Toutes les catégories</option>${categories.map((c) => `<option ${state.category === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div><div class="status-summary">${icon("circle-check")}${state.services.filter((s) => s.status?.state === "online").length} outils répondent · ${list.length} affichés</div><div id="tools-results">${serviceRows(list)}</div>`
  );
}
function accountsPage() {
  return (
    heading(
      "Mes comptes & données",
      "Tes six réseaux, un endroit pour les retrouver.",
    ) +
    guideBand(
      "bobby",
      "Une connexion, puis on suit la suite.",
      "Choisis un réseau, autorise la lecture de tes données et reviens ici. Le bouton Connecter laisse sa place à l’état de synchronisation.",
      "",
      "connections",
    ) +
    `<section class="accounts-grid">${
      (state.social?.accounts || [])
        .map((a) => {
          const c = connection(a),
            s = summary(a),
            sync = state.social?.sync?.[a.id];
          return `<article class="account-card"><div class="account-head">${networkIcon(a)}<div><h3>${esc(a.network)} <small>· ${esc(a.owner)}</small></h3><small>${esc(a.handle)}</small></div><span class="chip ${c.active ? "ok" : ""}">${c.active ? "Connexion active" : "Compte confirmé"}</span></div><p>${a.network === "Spotify" ? "Le catalogue et les épisodes dans le cockpit. Pour les écoutes, la rétention et les auditeurs : Spotify for Creators." : c.active ? "Les relevés automatiques alimentent ton historique. Les statistiques disponibles dépendent des accès accordés." : "Connecte ton compte pour démarrer le suivi automatique des statistiques disponibles."}</p><div class="account-actions">${connectButton(a)}${external(a.analytics, "Statistiques officielles")}<button class="secondary" data-entry="${a.id}">${icon("plus")}Relevé</button></div><div class="account-source">${c.active ? `Connecté le ${shortDate(c.connectedAt?.slice(0, 10))}` : "En attente de connexion"}${sync?.lastSuccess ? " · Dernière lecture : " + new Date(sync.lastSuccess).toLocaleString("fr-FR") : ""}${sync?.error ? `<p class="form-error">${esc(sync.error)}</p>` : ""}<br>${external(a.url, "Voir le profil", "text-button")}${c.active ? ` · <button class="text-button" data-disconnect="${a.id}">Déconnecter</button>` : ""}</div>${s.totalPosts !== null ? `<small>${fmt(s.totalPosts)} ${a.network === "Spotify" ? "épisodes au catalogue" : "publications au total"} · ${shortDate(s.totalPostsDate)}</small>` : ""}</article>`;
        })
        .join("") || "<p>Chargement…</p>"
    }</section><div class="section-title"><h2>Besoin d’un repère ?</h2></div><details><summary>Quels chiffres sont récupérés automatiquement ?</summary><p>Les abonnés et le total des publications selon le réseau. YouTube fournit aussi des vues, des j’aime, des commentaires et des partages par jour. Les autres chiffres peuvent être complétés par des relevés ou des imports.</p></details><details><summary>Et les écoutes de mon podcast ?</summary><p>La connexion Spotify donne accès au catalogue, pas aux statistiques privées de Spotify for Creators. Ouvre les statistiques officielles et ajoute un relevé pour suivre les écoutes ici.</p></details><details><summary>Pourquoi le bouton de connexion demande l’aide de FT ?</summary><p>Chaque réseau doit d’abord autoriser le cockpit à se connecter. Si cet accès n’est pas encore activé, FT termine la configuration. Ensuite, tu n’auras qu’à te connecter avec ton compte habituel.</p></details>`
  );
}
function render() {
  state.chart?.destroy();
  state.chart = null;
  document.querySelectorAll("[data-view]").forEach((el) => {
    el.classList.toggle("active", el.dataset.view === state.view);
    if (el.dataset.view === state.view) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  });
  document.getElementById("breadcrumb").innerHTML =
    "Mon espace <b>/</b> " + esc(labels[state.view]);
  main.innerHTML =
    (state.socialError
      ? `<div class="error-banner" role="alert">${esc(state.socialError)} <button data-retry>Réessayer</button></div>`
      : "") +
    (state.statusError
      ? `<div class="error-banner">${esc(state.statusError)}</div>`
      : "") +
    {
      home,
      social: socialPage,
      content: contentPage,
      markets: marketsPage,
      tools: toolsPage,
      accounts: accountsPage,
    }[state.view]();
  icons();
  drawChart();
}
function drawChart() {
  const canvas = document.getElementById("social-chart");
  if (!canvas || !window.Chart) return;
  const p = period(),
    dates = Array.from({ length: state.days }, (_, i) =>
      dateOffset(p.start, i),
    );
  const datasets = accountList()
    .map((a) => {
      const rows = summary(a).rows;
      return {
        label: a.network,
        data: dates.map(
          (d) => rows.find((r) => r.date === d)?.[state.metric] ?? null,
        ),
        borderColor: a.color,
        backgroundColor: a.color,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.18,
        spanGaps: false,
      };
    })
    .filter((d) => d.data.some((v) => v !== null));
  state.chart = new Chart(canvas, {
    type: "line",
    data: { labels: dates.map(shortDate), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 6,
            font: { size: 10 },
            padding: 18,
          },
        },
        tooltip: {
          callbacks: { label: (c) => c.dataset.label + ": " + fmt(c.raw) },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxTicksLimit: 6, font: { size: 10 } },
          border: { display: false },
        },
        y: {
          beginAtZero: state.metric !== "followers",
          ticks: {
            maxTicksLimit: 5,
            font: { size: 10 },
            callback: (v) => fmt(v),
          },
          grid: { color: "#edf1ee" },
          border: { display: false },
        },
      },
    },
  });
}
async function request(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", ...options });
  if (response.status === 401 || response.redirected) {
    location.href = "/master/";
    throw new Error("Reconnecte-toi pour continuer.");
  }
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Lecture impossible. Réessaie.");
  return data;
}
async function refresh(schedule = false) {
  if (state.loading) return;
  state.loading = true;
  const button = document.getElementById("refresh");
  button.classList.add("spinning");
  button.disabled = true;
  const result = await Promise.allSettled([
    request(
      "/master/social.php",
      schedule
        ? {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": boot.csrf,
            },
            body: JSON.stringify({ action: "sync" }),
          }
        : {},
    ),
    request("/master/status.php"),
  ]);
  if (result[0].status === "fulfilled") {
    state.social = result[0].value;
    state.socialError = "";
  } else
    state.socialError =
      "Les statistiques n’ont pas pu être actualisées. " +
      result[0].reason.message;
  if (result[1].status === "fulfilled") {
    state.services = result[1].value.services;
    state.statusError = "";
  } else
    state.statusError = "La disponibilité des outils n’a pas pu être vérifiée.";
  state.loading = false;
  button.disabled = false;
  button.classList.remove("spinning");
  document.getElementById("sync-label").textContent = state.socialError
    ? "Actualisation incomplète"
    : "Cockpit actualisé à " +
      new Date().toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });
  render();
  if (schedule)
    toast(
      "Cockpit actualisé. Les comptes connectés seront synchronisés dans la minute.",
    );
}
const guides = {
  welcome: [
    "lea",
    "Bienvenue à bord.",
    "Ton cockpit se parcourt selon ce que tu veux faire.",
    [
      "Mes statistiques : retrouve les abonnés, l’activité et les résultats de tes réseaux.",
      "Créer du contenu : prépare un clip ou un post.",
      "Ma veille : retrouve les sujets du jour dans IVT Radar.",
    ],
    "Tu sais où aller sans avoir à retenir le nom de chaque outil.",
  ],
  metrics: [
    "bobby",
    "Les chiffres, simplement.",
    "Choisis 7, 30 ou 90 jours, puis un réseau si tu veux regarder de plus près.",
    [
      "Abonnés : le nombre d’abonnements au dernier relevé. Une personne peut te suivre sur plusieurs réseaux.",
      "Gain : la différence entre les abonnés au premier et au dernier jour. Sans ces deux relevés, le gain reste vide.",
      "Posts, j’aime, vues et partages : l’activité des jours renseignés. Le petit compteur indique combien de jours sont couverts.",
    ],
    "Repère une progression et les formats qui suscitent des réactions. Une donnée absente ne signifie pas un mauvais résultat.",
  ],
  connections: [
    "bobby",
    "Branchons tes réseaux.",
    "Tu gardes la main sur chaque autorisation.",
    [
      "Clique sur Connecter pour le réseau de ton choix.",
      "Sur la page officielle du réseau, choisis le compte Xavier ou IVT et autorise la lecture.",
      "De retour ici, la connexion active remplace le bouton. Les relevés s’ajoutent à ton historique.",
    ],
    "Un suivi automatique des données autorisées. Si l’accès n’est pas encore activé, FT termine la configuration.",
  ],
  content: [
    "maya",
    "Une idée, plusieurs formats.",
    "Commence avec un contenu déjà prêt.",
    [
      "Pour un clip : ouvre Clips Morning Mood et sélectionne un épisode.",
      "Pour X : ouvre Stratégie X et choisis un angle.",
    ],
    "Un contenu à relire et à valider avant publication.",
  ],
  markets: [
    "lea",
    "Prépare ta séance.",
    "Quelques minutes pour retrouver le contexte.",
    [
      "Ouvre IVT Radar pour lire les sujets du jour.",
      "Repère les actualités pertinentes pour ta communauté.",
      "Garde les angles à approfondir dans tes prochains contenus.",
    ],
    "Une journée préparée, avec les sujets utiles sous la main.",
  ],
};
function showGuide(id, tool = false) {
  let person, title, text, steps, result, href;
  if (tool) {
    const s = state.services.find((s) => s.id === id);
    if (!s) return;
    person = ["Contenu", "Editorial", "Production"].includes(s.category)
      ? "maya"
      : "lea";
    title = s.name;
    text = toolCopy[s.id]?.[1] || s.summary;
    steps = s.tutorial;
    result = s.result;
    if (!["offline", "missing"].includes(s.status?.state)) href = s.href;
  } else [person, title, text, steps, result] = guides[id] || guides.welcome;
  document.getElementById("guide-body").innerHTML =
    `<div class="dialog-avatar"><div class="avatar ${person}"></div><div><strong>${{ lea: "Léa", bobby: "Bobby", maya: "Maya" }[person]}</strong><p>Ton guide express</p></div></div><h2 id="guide-title">${esc(title)}</h2><p>${esc(text)}</p><ol>${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol><div class="result"><strong>À l’arrivée</strong>${esc(result)}</div><div class="dialog-actions">${href ? external(href, "Ouvrir l’outil", "primary") : ""}<button class="secondary" data-close>C’est compris</button></div>`;
  document.getElementById("guide-dialog").showModal();
  icons();
}
function showConnection(id) {
  const a = state.social?.accounts.find((a) => a.id === id);
  if (!a) return;
  const c = connection(a);
  document.getElementById("data-body").innerHTML =
    `<div class="dialog-avatar"><div class="avatar bobby"></div><div><strong>Bobby</strong><p>Connexion ${esc(a.network)}</p></div></div><h2 id="data-title">Connecter ${esc(a.network)}</h2><p>${c.configured ? "La connexion s’ouvre sur le site officiel. Choisis le compte " + esc(a.handle) + " puis autorise la lecture." : "L’accès du cockpit à " + esc(a.network) + " doit encore être activé par FT. Ton compte est bien identifié ; tu peux déjà ouvrir ses statistiques officielles."}</p>${a.network === "Spotify" ? '<div class="result">Spotify connectera le catalogue du podcast. Les écoutes privées restent dans Spotify for Creators.</div>' : ""}<div class="dialog-actions">${c.configured ? `<form method="post" action="/master/connect.php"><input type="hidden" name="account" value="${a.id}"><input type="hidden" name="csrf" value="${esc(boot.csrf)}"><button class="primary" type="submit">Continuer sur ${esc(a.network)} ${icon("arrow-up-right")}</button></form>` : external(a.analytics, "Ouvrir les statistiques", "primary")}<button class="secondary" data-entry="${a.id}">Ajouter un relevé</button></div>${!c.configured ? '<p class="field-note">Le bouton restera visible jusqu’à une connexion réellement active.</p>' : ""}`;
  document.getElementById("data-dialog").showModal();
  icons();
}
function showEntry(id = "", mode = "manual") {
  const accounts = state.social?.accounts || [];
  if (!accounts.length) {
    toast("Les comptes ne sont pas encore chargés.");
    return;
  }
  id = id || accounts[0].id;
  const a = accounts.find((a) => a.id === id) || accounts[0];
  document.getElementById("data-body").innerHTML =
    `<h2 id="data-title">Ajouter un relevé</h2><p>Recopie les chiffres d’une journée. Laisse vides ceux que tu n’as pas.</p><div class="segmented form-tabs"><button data-entry-mode="manual" data-account="${a.id}" aria-pressed="${mode === "manual"}">Saisie simple</button><button data-entry-mode="import" data-account="${a.id}" aria-pressed="${mode === "import"}">Importer un CSV</button></div><form id="entry-form" data-mode="${mode}"><label for="entry-account">Réseau</label><select name="account" id="entry-account">${accounts.map((a) => `<option value="${a.id}" ${a.id === id ? "selected" : ""}>${esc(a.network)} · ${esc(a.handle)}</option>`).join("")}</select><div class="help-line" id="entry-help">${icon("info")}${external(a.analytics, "Où trouver mes chiffres ?", "text-button")}</div>${
      mode === "manual"
        ? `<label for="entry-date">Journée du relevé</label><input type="date" id="entry-date" name="date" value="${today()}" min="2020-01-01" max="${today()}" required><div class="form-grid">${[
            ["followers", "Abonnés", "Total à cette date"],
            ["posts", "Publications", "Publiées ce jour-là"],
            ["reactions", "J’aime reçus", "Reçus ce jour-là"],
            ["views", "Vues / écoutes", "Sur cette journée"],
            ["comments", "Commentaires", "Reçus ce jour-là"],
            ["shares", "Partages", "Sur cette journée"],
          ]
            .map(
              ([k, t, n]) =>
                `<div><label for="field-${k}">${t}</label><input id="field-${k}" name="${k}" type="number" min="0" max="1000000000000" step="1" inputmode="numeric" placeholder="Non renseigné"><span class="field-note">${n}</span></div>`,
            )
            .join(
              "",
            )}</div><p class="field-note">Les champs renseignés remplacent les valeurs du même jour ; les champs vides conservent les données existantes.</p>`
        : `<p>Le modèle utilise une ligne par jour. Les abonnés sont un total ; les autres colonnes décrivent uniquement la journée.</p><button class="text-button" type="button" data-template>${icon("download")}Télécharger le modèle CSV</button><label for="entry-csv">Ton fichier CSV</label><input id="entry-csv" type="file" accept=".csv,text/csv" required><span class="field-note">Modèle du cockpit, 1 Mo maximum. Les exports natifs des réseaux doivent être adaptés à ces colonnes.</span>`
    }<p id="entry-error" class="form-error" role="alert"></p><div class="dialog-actions"><button class="primary" type="submit">${icon("check")}Enregistrer</button><button class="secondary" type="button" data-close>Annuler</button></div></form>`;
  const dialog = document.getElementById("data-dialog");
  if (!dialog.open) dialog.showModal();
  icons();
}
function download(name, text) {
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportRecords() {
  const ids = accountList().map((a) => a.id),
    p = period();
  const rows = (state.social?.records || []).filter(
    (r) => ids.includes(r.account) && r.date >= p.start && r.date <= p.end,
  );
  const cols = [
    "account",
    "date",
    "followers",
    "posts",
    "reactions",
    "views",
    "comments",
    "shares",
    "source",
  ];
  download(
    "xavier-statistiques-" + today() + ".csv",
    [
      cols.join(","),
      ...rows.map((r) =>
        cols
          .map((k) => '"' + String(r[k] ?? "").replace(/"/g, '""') + '"')
          .join(","),
      ),
    ].join("\r\n"),
  );
}
document.addEventListener("click", (e) => {
  const button = e.target.closest("button,a");
  if (!button) return;
  if (button.hasAttribute("data-close")) button.closest("dialog").close();
  else if (button.dataset.guide) showGuide(button.dataset.guide);
  else if (button.dataset.tool) showGuide(button.dataset.tool, true);
  else if (button.dataset.connect) showConnection(button.dataset.connect);
  else if (button.hasAttribute("data-entry")) showEntry(button.dataset.entry);
  else if (button.dataset.entryMode)
    showEntry(
      document.getElementById("entry-account")?.value || button.dataset.account,
      button.dataset.entryMode,
    );
  else if (button.dataset.days) {
    state.days = Number(button.dataset.days);
    render();
  } else if (button.dataset.metric) {
    state.metric = button.dataset.metric;
    render();
  } else if (button.hasAttribute("data-retry")) refresh();
  else if (button.hasAttribute("data-export")) exportRecords();
  else if (button.hasAttribute("data-template"))
    download(
      "modele-statistiques.csv",
      "date,followers,posts,reactions,views,comments,shares\r\n",
    );
  else if (button.dataset.disconnect) {
    const a = state.social.accounts.find(
      (a) => a.id === button.dataset.disconnect,
    );
    document.getElementById("data-body").innerHTML =
      `<h2 id="data-title">Déconnecter ${esc(a.network)} ?</h2><p>Le suivi automatique s’arrêtera. Tes relevés restent disponibles.</p><form method="post" action="/master/connect.php"><input type="hidden" name="account" value="${a.id}"><input type="hidden" name="action" value="disconnect"><input type="hidden" name="csrf" value="${esc(boot.csrf)}"><div class="dialog-actions"><button class="primary">Déconnecter</button><button type="button" class="secondary" data-close>Annuler</button></div></form>`;
    document.getElementById("data-dialog").showModal();
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "owner-filter") {
    state.owner = e.target.value;
    state.network = "all";
    render();
  }
  if (e.target.id === "network-filter") {
    state.network = e.target.value;
    render();
  }
  if (e.target.id === "tool-category") {
    state.category = e.target.value;
    render();
  }
  if (e.target.id === "entry-account") {
    const a = state.social.accounts.find((a) => a.id === e.target.value);
    document.getElementById("entry-help").innerHTML =
      icon("info") +
      external(a.analytics, "Où trouver mes chiffres ?", "text-button");
    icons();
  }
  if (e.target.dataset.task) {
    try {
      const key = "xavier-tasks:" + today(),
        data = JSON.parse(localStorage.getItem(key) || "{}");
      data[e.target.dataset.task] = e.target.checked;
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      toast("Ce navigateur ne permet pas de conserver la checklist.");
    }
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "tool-search") {
    state.query = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const input = document.getElementById("tool-search");
    input.focus();
    input.setSelectionRange(pos, pos);
  }
});
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "entry-form") return;
  e.preventDefault();
  const form = e.target,
    button = form.querySelector("[type=submit]");
  button.disabled = true;
  try {
    const input = Object.fromEntries(new FormData(form));
    if (form.dataset.mode === "import") {
      const file = document.getElementById("entry-csv").files[0];
      if (!file || file.size > 1048576)
        throw new Error("Choisis un fichier CSV de moins de 1 Mo.");
      input.action = "import";
      input.csv = await file.text();
    }
    state.social = await request("/master/social.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": boot.csrf,
      },
      body: JSON.stringify(input),
    });
    document.getElementById("data-dialog").close();
    render();
    toast("Relevé enregistré. Tes statistiques sont à jour.");
  } catch (error) {
    document.getElementById("entry-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
document.querySelectorAll("dialog").forEach((d) =>
  d.addEventListener("click", (e) => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        d.close();
    }
  }),
);
function route() {
  const next = location.hash.slice(1) || "home";
  state.view = labels[next] ? next : "home";
  render();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
document
  .getElementById("refresh")
  .addEventListener("click", () => refresh(true));
document.getElementById("today").textContent = new Date().toLocaleDateString(
  "fr-FR",
  { weekday: "long", day: "numeric", month: "long" },
);
route();
refresh();
if (boot.flash) toast(boot.flash);
setInterval(() => {
  if (
    !document.hidden &&
    !state.loading &&
    !document.querySelector("dialog[open]")
  )
    refresh();
}, 120000);
