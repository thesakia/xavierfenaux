"use strict";
const boot = JSON.parse(document.getElementById("boot").textContent);
const main = document.getElementById("main");
const labels = {
  home: "Vue d’ensemble",
  social: "Statistiques réseaux",
  analytics: "Analytics",
  content: "Créer du contenu",
  markets: "Ma veille",
  tools: "Tous mes outils",
  accounts: "Mes comptes & données",
  integrations: "Administration des connexions",
};
const state = {
  view: "home",
  days: 30,
  owner: "all",
  network: "all",
  metric: "followers",
  chartMode: "combined",
  social: null,
  socialError: "",
  analytics: null,
  analyticsError: "",
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
  `<a class="${cls}" href="${esc(url)}"${url.startsWith("#") ? "" : ' target="_blank" rel="noopener noreferrer"'}>${label}${icon(url.startsWith("#") ? "arrow-right" : "arrow-up-right")}</a>`;
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
  if (c.setup?.mode === "official") return external(a.analytics, a.network === "Spotify" ? "Ouvrir Spotify for Creators" : "Ouvrir X", "primary");
  return c.active
    ? `<span class="chip ok">${icon("check")}${c.apiOnly ? "API publique active" : "Connecté"}</span>`
    : c.configured ? `<form method="post" action="/master/connect.php"><input type="hidden" name="account" value="${a.id}"><input type="hidden" name="csrf" value="${esc(boot.csrf)}"><button class="primary" type="submit">${icon("plug")}${c.needsReconnect ? "Reconnecter" : "Connecter"} ${esc(a.network)}</button></form>`
    : `<button class="primary" data-connect="${a.id}">${icon("plug")}Connecter ${esc(a.network)}</button>`;
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
  const connected = (state.social?.accounts || []).filter(a => connection(a).active).length;
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
    `<div class="split">${chartSection()}${channels()}</div>${siteSummary()}<div class="section-title"><div><h2>Une idée, une action</h2><p>Choisis ce que tu veux faire.</p></div></div><section class="actions-grid">${[
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
function siteReportNotice() {
  const data = state.analytics;
  if (!data) return `<p class="${state.analyticsError ? "error-banner" : "table-hint"}" role="status">${esc(state.analyticsError || "Lecture des statistiques du site…")}${state.analyticsError ? ' <button data-retry>Réessayer</button>' : ""}</p>`;
  const stale = Date.now() - Date.parse(data.generatedAt) > 15 * 60 * 1000;
  const stamp = new Date(data.generatedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });
  return `<p class="table-hint">Umami · relevé du ${esc(stamp)} (Paris) · toutes les 5 minutes</p>${state.analyticsError || stale ? `<p class="error-banner" role="status">${esc(state.analyticsError || "Le relevé a plus de 15 minutes. Les chiffres ci-dessous n’ont pas encore été actualisés.")} <button data-retry>Réessayer</button></p>` : ""}`;
}
function siteSummary() {
  const s = state.analytics?.summary;
  return `<section class="site-summary" aria-label="Audience de xavierfenaux.com"><div class="section-title"><div><h2>Ton site, en un regard</h2><p>xavierfenaux.com</p></div><a href="#analytics" class="text-button">Analytics ${icon("arrow-right")}</a></div><dl class="site-summary-numbers">${[["visitors_24h", "Visiteurs · 24 h"], ["visitors_7d", "Visiteurs · 7 j."], ["pageviews_7d", "Pages vues · 7 j."]].map(([key, label]) => `<div><dt>${label}</dt><dd>${fmt(s?.[key])}</dd></div>`).join("")}</dl>${siteReportNotice()}</section>`;
}
function analyticsPage() {
  const data = state.analytics;
  const intro = heading("Analytics", "L’audience de xavierfenaux.com", `<button class="icon-button" data-retry title="Actualiser les statistiques du site" aria-label="Actualiser les statistiques du site">${icon("refresh-cw")}</button>`) + siteReportNotice();
  if (!data) return intro;
  const table = (rows, key, value, label) => `<div class="site-table"><table><thead><tr><th>${label}</th><th>Pages vues · 7 j.</th></tr></thead><tbody>${rows.length ? rows.map(row => `<tr><td>${esc(row[key] === "(direct)" ? "Accès direct" : row[key])}</td><td>${fmt(row[value])}</td></tr>`).join("") : '<tr><td colspan="2">Aucune visite enregistrée sur cette période.</td></tr>'}</tbody></table></div>`;
  return intro + `<section class="kpis" aria-label="Statistiques du site">${[
    ["visitors_24h", "Visiteurs · 24 heures", "users-round"],
    ["visitors_7d", "Visiteurs · 7 jours", "users-round"],
    ["pageviews_7d", "Pages vues · 7 jours", "files"],
    ["clicks_7d", "Clics suivis · 7 jours", "mouse-pointer-2"],
  ].map(([key, label, i]) => `<article class="kpi"><div class="kpi-title">${label}${icon(i)}</div><strong class="kpi-value">${fmt(data.summary[key])}</strong><small>xavierfenaux.com</small></article>`).join("")}</section>
  <section class="surface"><div class="section-title"><div><h2>Les pages vues au fil des jours</h2><p>Les 14 derniers jours · journées UTC</p></div></div><div class="chart-wrap"><canvas id="site-chart" role="img" aria-label="Pages vues par jour. Les valeurs sont disponibles dans le tableau jour par jour."></canvas></div></section>
  <div class="split site-details"><section><div class="section-title"><h2>Les pages les plus lues</h2></div>${table(data.pages, "path", "views", "Page")}</section><section><div class="section-title"><h2>D’où viennent les visiteurs ?</h2></div>${table(data.sources, "referrer", "visits", "Source")}</section></div>
  <details class="site-daily"><summary>Les chiffres jour par jour</summary><div class="site-table"><table><thead><tr><th>Date UTC</th><th>Pages vues</th><th>Clics suivis</th></tr></thead><tbody>${data.days.map(day => `<tr><td>${esc(shortDate(day))}</td><td>${fmt(data.daily[day]?.pageviews)}</td><td>${fmt(data.daily[day]?.clicks)}</td></tr>`).join("")}</tbody></table></div></details><p class="table-hint">Visiteurs estimés à partir des sessions Umami. Une personne peut utiliser plusieurs appareils. Les clics comptent uniquement les événements suivis.</p>`;
}
function drawSiteChart() {
  const canvas = document.getElementById("site-chart"), data = state.analytics;
  if (!canvas || !data || !window.Chart) return;
  state.chart = new Chart(canvas, {
    type: "bar",
    data: { labels: data.days.map(shortDate), datasets: [{ label: "Pages vues", data: data.days.map(day => data.daily[day]?.pageviews ?? null), backgroundColor: "#21785b", borderRadius: 3, maxBarThickness: 32 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 7 } } } },
  });
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
function socialHealth(a) {
  const c = connection(a), sync = state.social?.sync?.[a.id];
  if (c.needsReconnect) return { label: "À reconnecter", tone: "bad", detail: "L’autorisation a expiré." };
  if (c.active && sync?.error) return { label: "Données partielles", tone: "bad", detail: sync.error };
  if (c.active) {
    const last = sync?.lastSuccess;
    const stale = last && Date.now() - Date.parse(last) > 86400000;
    return { label: stale ? "Données en retard" : last ? "Synchronisé" : "Première lecture en attente", tone: stale ? "" : "ok", detail: last ? "Dernière lecture : " + new Date(last).toLocaleString("fr-FR") : "Le compte est autorisé. Le premier relevé n’est pas encore disponible." };
  }
  return c.setup?.mode === "official"
    ? { label: "Suivi par relevés", tone: "", detail: "Statistiques disponibles dans l’espace officiel. Pas de synchronisation automatique." }
    : { label: "Non connecté", tone: "", detail: c.configured ? "Autorise la lecture depuis ton compte sur le réseau." : "La connexion doit encore être activée côté cockpit. Aucune configuration technique à faire sur ton compte." };
}
function networkTabs() {
  return `<nav class="network-tabs" aria-label="Réseaux sociaux"><a href="#social" ${state.network === "all" ? 'aria-current="page"' : ""}>${icon("panels-top-left")}Ensemble</a>${(state.social?.accounts || []).map(a => `<a href="#social/${a.id}" ${state.network === a.id ? 'aria-current="page"' : ""}>${networkIcon(a)}${esc(a.network)}<span class="connection-dot ${connection(a).active ? "active" : ""}" title="${esc(socialHealth(a).label)}"></span></a>`).join("")}</nav>`;
}
function socialKpis() {
  const p = period(), selected = accountList();
  const podcast = selected.length === 1 && selected[0].network === "Spotify";
  return `<section class="social-kpis" aria-label="Chiffres clés">${[
    ["followers", selected.length === 1 ? "Abonnés" : "Abonnés cumulés", "users-round"],
    ["gain", "Gain d’abonnés", "trending-up"],
    ["posts", podcast ? "Épisodes publiés" : "Publications", "files"],
    ["views", podcast ? "Écoutes" : "Vues", "play"],
    ["reactions", "J’aime", "heart"],
    ["comments", "Commentaires", "message-circle"],
  ].map(([key, label, glyph]) => {
    const accounts = key === "views" && !podcast ? selected.filter(a => a.network !== "Spotify") : selected;
    const sums = accounts.map(summary), result = CockpitMetrics.aggregate(sums, key);
    const comparison = key === "gain" ? null : CockpitMetrics.comparison(state.social?.records || [], accounts.map(a => a.id), p.start, p.end, key).percent;
    const coverage = key === "followers" ? (selected.length === 1 ? shortDate(sums[0]?.followerDate) : `${result.count}/${accounts.length} comptes · non dédupliqués`) : key === "gain" ? "Entre le premier et le dernier jour" : `${sums.reduce((n, s) => n + s[key + "Days"], 0)}/${accounts.length * state.days} journées de compte`;
    return `<article class="social-kpi"><span>${icon(glyph)}${label}</span><strong class="${key === "gain" && result.value !== null ? (result.value >= 0 ? "positive" : "negative") : ""}">${key === "gain" && result.value > 0 ? "+" : ""}${fmt(result.value)}</strong><small>${result.value === null ? "Donnée indisponible" : coverage}</small>${comparison !== null ? `<small class="${comparison >= 0 ? "positive" : "negative"}">${comparison > 0 ? "+" : ""}${comparison.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}% vs période précédente</small>` : ""}${key === "views" && selected.length > 1 ? "<small>Hors écoutes Spotify</small>" : ""}</article>`;
  }).join("")}</section>`;
}
function audienceBreakdown() {
  const accounts = accountList(), total = CockpitMetrics.aggregate(accounts.map(summary), "followers");
  return `<section class="audience-breakdown"><div class="section-title"><div><h2>Répartition de l’audience</h2><p>${total.count}/${accounts.length} comptes renseignés</p></div></div>${accounts.map(a => {
    const s = summary(a), share = s.followers !== null && total.value > 0 ? s.followers / total.value * 100 : null;
    return `<a class="audience-row" href="#social/${a.id}">${networkIcon(a)}<span><span class="audience-label"><strong>${esc(a.network)}</strong><b>${fmt(s.followers)}</b></span><span class="audience-track"><span style="width:${share ?? 0}%;background:${esc(a.color)}"></span></span><small>${share === null ? "Pas de répartition disponible" : share.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + "% des abonnements renseignés"}</small></span></a>`;
  }).join("")}<p class="table-hint">Une personne peut suivre plusieurs comptes. Les derniers relevés peuvent dater de jours différents.</p></section>`;
}
function networkOverview() {
  return `<section><div class="section-title"><div><h2>Tous tes réseaux</h2><p>${shortDate(period().start)} au ${shortDate(period().end)}</p></div><a href="#accounts" class="text-button">Gérer les connexions ${icon("arrow-right")}</a></div><div class="network-overview">${accountList().map(a => {
    const s = summary(a), health = socialHealth(a);
    return `<article class="network-summary"><div class="network-summary-head">${networkIcon(a)}<div><h3><a href="#social/${a.id}">${esc(a.network)}</a></h3><small>${esc(a.handle)}</small></div><span class="chip ${health.tone}">${esc(health.label)}</span></div><dl><div><dt>Abonnés</dt><dd>${fmt(s.followers)}</dd></div><div><dt>Gain</dt><dd class="${s.gain > 0 ? "positive" : s.gain < 0 ? "negative" : ""}">${s.gain > 0 ? "+" : ""}${fmt(s.gain)}</dd></div><div><dt>${a.network === "Spotify" ? "Écoutes" : "Vues"}</dt><dd>${fmt(s.views)}</dd></div></dl><div class="network-summary-foot"><small>${s.followerDate ? "Audience au " + shortDate(s.followerDate) : "Aucun relevé d’audience"}</small><a href="#social/${a.id}" class="icon-button" title="Voir les statistiques ${esc(a.network)}" aria-label="Voir les statistiques ${esc(a.network)}">${icon("arrow-right")}</a></div></article>`;
  }).join("")}</div></section>`;
}
function networkDetail(a) {
  const s = summary(a), health = socialHealth(a);
  const last = s.rows.at(-1);
  if (a.network === "Spotify") return `<section class="network-detail"><div class="section-title"><div><h2>Morning Mood · Acast</h2><p>Le podcast, au-delà de Spotify</p></div></div><p>Les épisodes sont hébergés chez Acast. Les téléchargements et les auditeurs se consultent dans Acast Insights, pas dans son API de publication.</p><div class="dialog-actions">${external("https://insights.acast.com/", "Acast Insights", "primary")}${external(a.analytics, "Spotify for Creators")}${external("https://shows.acast.com/xavierfenaux", "Épisodes Acast")}</div><dl class="detail-list"><div><dt>Statistiques Acast dans le cockpit</dt><dd>Non connectées</dd></div><div><dt>Dernier relevé Spotify</dt><dd>${shortDate(last?.date)}</dd></div></dl><p class="table-hint">Les téléchargements Acast ne doivent pas être ajoutés aux écoutes Spotify : les audiences peuvent se recouper.</p><button class="text-button" data-entry="${a.id}">${icon("upload")}Compléter les données Spotify</button></section>`;
  return `<section class="network-detail"><div class="section-title"><div><h2>Le compte en détail</h2><p>${esc(a.owner)} · ${esc(a.handle)}</p></div></div><dl class="detail-list"><div><dt>Synchronisation</dt><dd><span class="chip ${health.tone}">${esc(health.label)}</span></dd></div><div><dt>${a.network === "Spotify" ? "Épisodes au total" : "Publications au total"}</dt><dd>${fmt(s.totalPosts)}<small>${shortDate(s.totalPostsDate)}</small></dd></div><div><dt>${a.network === "Spotify" ? "Écoutes cumulées" : "Vues cumulées"}</dt><dd>${fmt(s.totalViews)}<small>${shortDate(s.totalViewsDate)}</small></dd></div><div><dt>Partages sur la période</dt><dd>${fmt(s.shares)}<small>${s.sharesDays}/${state.days} jours renseignés</small></dd></div><div><dt>Dernier relevé de la période</dt><dd>${shortDate(last?.date)}</dd></div></dl><p class="table-hint">${esc(health.detail)}</p><div class="dialog-actions">${external(a.url, "Profil public")}${external(a.analytics, "Statistiques officielles")}</div><button class="text-button" data-entry="${a.id}">${icon("upload")}Compléter les données</button></section>`;
}
function socialHistory(a) {
  const rows = summary(a).rows.slice().reverse();
  return `<section class="social-history"><div class="section-title"><div><h2>Historique ${esc(a.network)}</h2><p>${rows.length} journées avec un relevé · ${state.days} jours</p></div><button class="icon-button" data-export title="Exporter les relevés" aria-label="Exporter les relevés">${icon("download")}</button></div>${rows.length ? `<div class="table-scroll history-scroll"><table><thead><tr><th>Date</th><th>Abonnés</th><th>Publications</th><th>${a.network === "Spotify" ? "Écoutes" : "Vues"}</th><th>J’aime</th><th>Commentaires</th><th>Partages</th><th>Sources</th></tr></thead><tbody>${rows.map(r => `<tr><td>${shortDate(r.date)}</td>${["followers", "posts", "views", "reactions", "comments", "shares"].map(k => `<td title="${esc(r.sources?.[k] || r.source || "")}">${fmt(r[k])}</td>`).join("")}<td>${esc([...new Set(Object.values(r.sources || { source: r.source }))].filter(Boolean).join(" · "))}</td></tr>`).join("")}</tbody></table></div>` : `<div class="history-empty">${icon("calendar-days")}<div><h3>Aucun relevé sur cette période</h3><p>Les statistiques apparaîtront après la première synchronisation ou un import.</p></div><button class="secondary" data-entry="${a.id}">Importer un relevé</button></div>`}</section>`;
}
function socialConnections() {
  return `<details class="social-connections" ${(state.social?.accounts || []).some(a => connection(a).active) ? "" : "open"}><summary>Connexions et données disponibles</summary><div class="social-connection-list">${(state.social?.accounts || []).map(a => {
    const c = connection(a), health = socialHealth(a);
    return `<div class="social-connection-row">${networkIcon(a)}<div><strong>${esc(a.network)} <small>${esc(a.handle)}</small></strong><p>${esc(c.capabilities?.metrics || "Statistiques du compte")}</p><small>${c.active ? esc(health.detail) : c.configured ? "Prêt à autoriser depuis le réseau" : c.setup?.mode === "official" ? esc(c.capabilities?.limitation || health.detail) : "Application de connexion à configurer par FT, puis autorisation du compte"}</small></div><div>${connectButton(a)}</div></div>`;
  }).join("")}</div></details>`;
}
function socialExtraMetrics(a) {
  const sums = accountList().map(summary);
  const metrics = a?.network === "YouTube" ? [["followersGained","Nouveaux abonnés"],["followersLost","Abonnés perdus"],["watchMinutes","Minutes visionnées"]]
    : a?.network === "Instagram" ? [["saves","Enregistrements"]] : [];
  const details = a ? state.social?.details?.[a.id] : null;
  const live = details?.live;
  const values = metrics.map(([key,label]) => {
    const total = CockpitMetrics.aggregate(sums,key);
    return `<div><dt>${label}</dt><dd>${fmt(total.value)}</dd><small>${sums.reduce((n,s)=>n+s[key+"Days"],0)}/${state.days} jours renseignés</small></div>`;
  }).join("");
  const stream = live ? `<div><dt>Direct Twitch</dt><dd>${live.online ? fmt(live.viewers)+" spectateurs" : "Hors ligne"}</dd><small>${esc(new Date(live.checkedAt).toLocaleString("fr-FR"))}</small></div>` : "";
  return values || stream ? `<dl class="social-extra-metrics">${values}${stream}</dl>` : "";
}
function socialPosts() {
  const accounts = accountList(), p = period();
  const rows = accounts.flatMap(a => (state.social?.details?.[a.id]?.posts || []).filter(post => {
    const date = post.publishedAt.slice(0,10);
    return date >= p.start && date <= p.end;
  }).map(post => ({...post, network:a.network, color:a.color})));
  rows.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
  const available = accounts.filter(a => state.social?.details?.[a.id]?.postsUpdatedAt);
  return `<section class="social-posts"><div class="section-title"><div><h2>Résultats des publications</h2><p>Publiées du ${shortDate(p.start)} au ${shortDate(p.end)} · compteurs cumulés depuis leur publication</p></div><span class="chip">${rows.length} publications</span></div>${rows.length ? `<div class="table-scroll"><table><thead><tr><th>Publication</th><th>Réseau</th><th>Vues</th><th>J’aime</th><th>Commentaires</th><th>Partages</th></tr></thead><tbody>${rows.slice(0,150).map(post=>`<tr><td><a href="${esc(post.url)}" target="_blank" rel="noopener noreferrer">${esc(post.title || "Publication sans titre")}${icon("arrow-up-right")}</a><small>${shortDate(post.publishedAt.slice(0,10))} · relevé ${esc(new Date(post.updatedAt).toLocaleString("fr-FR"))}</small></td><td>${esc(post.network)}</td>${["views","reactions","comments","shares"].map(k=>`<td>${fmt(post[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<p class="table-hint">${available.length ? "Aucune publication disponible sur cette période." : "Les résultats apparaîtront après connexion et première lecture des publications."}</p>`}${available.map(a=>`<p class="table-hint">${esc(a.network)} · ${state.social.details[a.id].postsComplete ? "Toutes les publications renvoyées par le réseau" : "Publications récentes uniquement"} · dernière lecture ${esc(new Date(state.social.details[a.id].postsUpdatedAt).toLocaleString("fr-FR"))}</p>`).join("")}<p class="table-hint">Ces compteurs ne sont pas ajoutés aux résultats quotidiens : une vue reçue aujourd’hui peut concerner une ancienne vidéo.</p></section>`;
}
function socialPage() {
  const a = state.social?.accounts.find(a => a.id === state.network);
  const active = (state.social?.accounts || []).filter(a => connection(a).active).length;
  const health = a ? socialHealth(a) : null;
  return heading("Statistiques réseaux", "Xavier Fenaux & Interactiv Trading", `<button class="icon-button" data-export title="Exporter les statistiques" aria-label="Exporter les statistiques">${icon("download")}</button><a href="#accounts" class="secondary">${icon("plug")}Connexions <span class="chip">${active}/6</span></a>`)
    + networkTabs()
    + `<div class="social-toolbar"><div class="social-identity">${a ? networkIcon(a) : '<img src="/images/events/speaker-portrait-color.webp" alt="Xavier Fenaux">'}<div><h2>${a ? esc(a.network) : "Vue d’ensemble"}</h2><p>${a ? esc(a.handle) : "Tous tes comptes, une seule lecture"}</p></div>${a ? `<span class="chip ${health.tone}">${esc(health.label)}</span>` : ""}</div><div class="social-period"><div class="segmented" aria-label="Période">${[7, 30, 90].map(d => `<button data-days="${d}" aria-pressed="${state.days === d}">${d} jours</button>`).join("")}</div>${a ? connectButton(a) : '<select id="owner-filter" aria-label="Propriétaire"><option value="all">Xavier + IVT</option><option value="Xavier" ' + (state.owner === "Xavier" ? "selected" : "") + '>Xavier</option><option value="IVT" ' + (state.owner === "IVT" ? "selected" : "") + '>Interactiv Trading</option></select>'}</div></div>`
    + (!active && !a ? `<aside class="social-notice">${icon("unplug")}<div><strong>Aucun compte synchronisé pour le moment</strong><p>Les profils sont identifiés ; leurs statistiques ne sont pas encore autorisées.</p></div><a href="#accounts" class="text-button">Mes connexions ${icon("arrow-right")}</a></aside>` : "")
    + socialConnections() + socialKpis() + socialExtraMetrics(a)
    + `<div class="social-chart-toolbar"><div class="segmented" aria-label="Indicateur du graphique">${[["followers", "Abonnés"], ["views", a?.network === "Spotify" ? "Écoutes" : "Vues"], ["reactions", "J’aime"]].map(([key, label]) => `<button data-metric="${key}" aria-pressed="${state.metric === key}">${label}</button>`).join("")}</div>${!a ? `<div class="segmented" aria-label="Courbes"><button data-chart-mode="combined" aria-pressed="${state.chartMode === "combined"}">Cumul</button><button data-chart-mode="networks" aria-pressed="${state.chartMode === "networks"}">Par réseau</button></div>` : ""}</div><div class="social-chart-layout">${chartSection()}${a ? networkDetail(a) : audienceBreakdown()}</div>`
    + socialPosts() + (a ? socialHistory(a) : networkOverview() + `<details class="social-comparison"><summary>Comparer tous les indicateurs</summary>${statsTable()}</details>`)
    + `<aside class="bobby-note"><div class="avatar bobby" role="img" aria-label="Bobby, ton community manager"></div><div><strong>Bobby · Le point sur tes données</strong><p>${a ? esc(health.detail) : "Les pourcentages d’évolution comparent des comptes identiques sur deux périodes complètes. Les valeurs absentes restent vides."}</p></div><button class="icon-button" data-guide="metrics" title="Comprendre les indicateurs" aria-label="Comprendre les indicateurs">${icon("circle-help")}</button></aside>`;
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
      "Retrouve un passage du Morning Mood, prépare ton extrait et vérifie le résultat avant publication.",
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
      "Tes comptes restent entre tes mains.",
      "Les connexions se font sur les sites officiels. Ton mot de passe social ne passe jamais par le cockpit.",
      "",
      "connections",
    ) +
    `<section class="accounts-grid">${
      (state.social?.accounts || [])
        .map((a) => {
          const c = connection(a), s = summary(a);
          const health = socialHealth(a);
          return `<article class="account-card"><div class="account-head">${networkIcon(a)}<div><h3>${esc(a.network)} <small>· ${esc(a.owner)}</small></h3><small>${esc(a.handle)}</small></div><span class="chip ${health.tone}">${esc(health.label)}</span></div><p>${esc(health.detail)}</p><div class="account-actions">${connectButton(a)}<a class="secondary" href="#social/${a.id}">${icon("chart-no-axes-combined")}Statistiques</a></div><div class="account-source">${external(a.url, "Voir le profil", "text-button")}${c.active ? ` · <button class="text-button" data-disconnect="${a.id}">Déconnecter</button>` : ""}</div>${s.totalPosts !== null ? `<small>${fmt(s.totalPosts)} publications au total · ${shortDate(s.totalPostsDate)}</small>` : ""}</article>`;
        })
        .join("") || "<p>Chargement…</p>"
    }</section><div class="section-title"><h2>Besoin d’un repère ?</h2></div><details><summary>Quels chiffres sont récupérés automatiquement ?</summary><p>Les connexions autorisées fournissent les compteurs du profil selon les droits accordés. YouTube peut aussi fournir des statistiques quotidiennes. Les données manquantes restent vides.</p></details><details><summary>Et les écoutes de mon podcast ?</summary><p>Acast Insights donne les téléchargements et les auditeurs du podcast. L’API de publication Acast ne fournit pas ces statistiques. Spotify for Creators conserve ses propres mesures. Ces chiffres ne doivent pas être additionnés.</p></details>`
  );
}
function integrationsPage() {
  return heading("Administration des connexions", "Configuration de la plateforme · réservée à la maintenance", '<a href="#accounts" class="secondary">Retour aux comptes</a>') + `<section class="accounts-grid">${(state.social?.accounts || []).filter(a => connection(a).setup?.mode === "oauth").map(a => `<article class="account-card"><h2>${esc(a.network)}</h2><p>${esc(connection(a).setup.note)}</p><button class="secondary" data-provider="${a.id}">${icon("settings-2")}Configuration de l’application</button></article>`).join("")}</section>`;
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
      analytics: analyticsPage,
      content: contentPage,
      markets: marketsPage,
      tools: toolsPage,
      accounts: accountsPage,
      integrations: integrationsPage,
    }[state.view]();
  icons();
  drawChart();
  drawSiteChart();
}
function drawChart() {
  const canvas = document.getElementById("social-chart");
  if (!canvas || !window.Chart) return;
  const p = period(),
    dates = Array.from({ length: state.days }, (_, i) =>
      dateOffset(p.start, i),
    );
  const chartAccounts = accountList().filter(a => !(state.view === "social" && state.network === "all" && state.metric === "views" && a.network === "Spotify"));
  let datasets = chartAccounts
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
  if (state.view === "social" && state.network === "all" && state.chartMode === "combined") {
    const points = CockpitMetrics.series(state.social?.records || [], chartAccounts.map(a => a.id), dates, state.metric);
    datasets = [{ label: "Cumul des comptes renseignés", data: points.map(p => p.value), borderColor: "#21785b", backgroundColor: "#21785b18", fill: true, borderWidth: 2, pointRadius: 3, spanGaps: false, coverage: points.map(p => p.count), total: chartAccounts.length }];
  }
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
          callbacks: { label: (c) => c.dataset.label + ": " + fmt(c.raw) + (c.dataset.coverage ? ` · ${c.dataset.coverage[c.dataIndex]}/${c.dataset.total} comptes` : "") },
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
    request("/master/analytics-data.php"),
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
  if (result[2].status === "fulfilled") {
    state.analytics = result[2].value;
    state.analyticsError = "";
  } else state.analyticsError = result[2].reason.message;
  button.disabled = false;
  button.classList.remove("spinning");
  document.getElementById("sync-label").textContent = state.socialError || state.analyticsError || state.statusError
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
    "Une connexion OAuth autorisée alimente le suivi. Ouvrir un espace officiel, comme X ou Spotify for Creators, ne synchronise pas les chiffres dans le cockpit.",
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
function providerFields(id, mode) {
  if (mode === "api") return '<label for="provider-api-key">Clé YouTube Data API</label><input id="provider-api-key" name="api_key" type="password" autocomplete="new-password" required maxlength="2048"><label for="provider-channel">Identifiant de la chaîne InteractivTrading</label><input id="provider-channel" name="channel_id" placeholder="UC…" required pattern="UC[A-Za-z0-9_-]{22}"><p class="field-note">Abonnés publics, vidéos et vues cumulées. Pas de statistiques privées. Limite : quota gratuit du projet Google.</p>';
  return `<label for="provider-id">${id === "tiktok-ivt" ? "Client key" : "Client ID / identifiant de l’application"}</label><input id="provider-id" name="client_id" autocomplete="off" required maxlength="2048"><label for="provider-secret">Client secret</label><input id="provider-secret" name="client_secret" type="password" autocomplete="new-password" required maxlength="2048"><label for="provider-callback">URL de retour à enregistrer sur la plateforme</label><input id="provider-callback" value="https://xavierfenaux.com/master/connect.php" readonly><p class="field-note">Les secrets restent sur le serveur. Ne saisis jamais ici ton mot de passe Instagram, Google, TikTok ou Twitch.</p>`;
}
function showProviderSetup(id) {
  const a = state.social?.accounts.find(a => a.id === id);
  if (!a) return;
  const c = connection(a), setup = c.setup || {};
  document.getElementById("data-body").innerHTML =
    `<div class="dialog-avatar"><div class="avatar bobby"></div><div><strong>Bobby</strong><p>${esc(a.network)} · ${esc(a.handle)}</p></div></div><h2 id="data-title">${setup.mode === "official" ? "Ton espace officiel" : "Relier " + esc(a.network)}</h2><p>${esc(setup.note || "Lecture des possibilités de connexion…")}</p><div class="dialog-actions">${external(a.analytics, "Ouvrir " + esc(a.network))}${setup.portal ? external(setup.portal, "Application développeur") : ""}<button class="secondary" data-entry="${a.id}">Ajouter un relevé</button></div>${setup.mode === "oauth" ? `<details class="provider-setup"><summary>Configuration de l’application</summary><form id="provider-form"><input type="hidden" name="account" value="${a.id}">${a.network === "YouTube" ? '<label for="provider-mode">Mode de suivi</label><select id="provider-mode" name="mode"><option value="oauth">Connexion Google · statistiques privées</option><option value="api">API publique · quota gratuit</option></select>' : '<input type="hidden" name="mode" value="oauth">'}<div id="provider-fields">${providerFields(a.id, "oauth")}</div><p class="form-error" id="provider-error" role="alert"></p><button class="primary" type="submit">${icon("save")}Enregistrer et continuer</button></form></details>` : ""}`;
  document.getElementById("data-dialog").showModal();
  icons();
}
function showConnection(id) {
  const a = state.social?.accounts.find(a => a.id === id);
  if (!a) return;
  const health = socialHealth(a);
  document.getElementById("data-body").innerHTML = `<div class="dialog-avatar"><div class="avatar bobby"></div><div><strong>Bobby</strong><p>${esc(a.network)}</p></div></div><h2 id="data-title">Connexion ${esc(a.network)}</h2><p>${esc(health.detail)}</p><p>Aucun mot de passe social ni identifiant développeur à saisir ici.</p><div class="dialog-actions">${external(a.analytics, "Ouvrir les statistiques officielles")}<button class="secondary" data-close>Fermer</button></div>`;
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
  else if (button.dataset.provider) showProviderSetup(button.dataset.provider);
  else if (button.hasAttribute("data-entry")) showEntry(button.dataset.entry);
  else if (button.dataset.entryMode)
    showEntry(
      document.getElementById("entry-account")?.value || button.dataset.account,
      button.dataset.entryMode,
    );
  else if (button.dataset.days) {
    state.days = Number(button.dataset.days);
    render();
  } else if (button.dataset.chartMode) {
    state.chartMode = button.dataset.chartMode;
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
  if (e.target.id === "provider-mode") {
    document.getElementById("provider-fields").innerHTML = providerFields(document.querySelector('#provider-form [name="account"]').value, e.target.value);
  }
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
  if (e.target.id === "provider-form") {
    e.preventDefault();
    const form = e.target, button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const input = Object.fromEntries(new FormData(form));
      const result = await request('/master/provider-settings.php', {method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':boot.csrf}, body:JSON.stringify(input)});
      state.social.connections = result.connections;
      form.reset();
      document.getElementById('data-dialog').close();
      render();
      if (result.mode === 'oauth') {
        const login = document.createElement('form');
        login.method = 'POST'; login.action = '/master/connect.php';
        for (const [name, value] of Object.entries({account: input.account, csrf: boot.csrf})) {
          const field = document.createElement('input'); field.type = 'hidden'; field.name = name; field.value = value; login.append(field);
        }
        document.body.append(login); login.submit();
      } else { toast('API YouTube vérifiée. Les compteurs publics sont synchronisés.'); refresh(); }
    } catch (error) { document.getElementById('provider-error').textContent = error.message; }
    finally { button.disabled = false; }
    return;
  }
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
  document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
  const [next = "home", network = "all"] = (location.hash.slice(1) || "home").split("/");
  state.view = labels[next] ? next : "home";
  const known = ["x-xavier", "instagram-xavier", "tiktok-ivt", "youtube-ivt", "twitch-xavier", "spotify-xavier"];
  state.network = state.view === "social" && known.includes(network) ? network : "all";
  state.owner = "all";
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
