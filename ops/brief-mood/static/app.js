"use strict";
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let state = null,
  edition = null,
  tab = "brief",
  busy = false,
  selected = new Set();
const icons = () => window.lucide?.createIcons();
const day = (s) =>
  new Date(s + "T12:00:00").toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
const status = {
  queued: "En attente",
  working: "Préparation",
  ready: "Disponible",
  failed: "À vérifier",
};
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("#toast").hidden = true), 6000);
}
async function api(url, body, method = "POST") {
  const response = await fetch("api/" + url, {
    method: body === undefined ? "GET" : method,
    headers:
      body === undefined
        ? {}
        : {
            "Content-Type": "application/json",
            "X-Brief-CSRF": state?.csrf || "",
          },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    let d;
    try {
      d = await response.json();
    } catch {}
    throw Error(
      typeof d?.detail === "string"
        ? d.detail
        : "Opération indisponible. Actualiser puis réessayer.",
    );
  }
  return response.json();
}
function delivery() {
  const rows = state.deliveries.filter((d) => d.day === state.today);
  $("#deliveries").innerHTML = rows.length
    ? rows
        .map(
          (d) =>
            `<p class="${esc(d.state)}"><b>${esc(d.recipient)}</b>${d.state === "accepted" ? (d.detail === "failure" ? "Alerte confiée au serveur mail" : "Brief confié au serveur mail") : "Envoi non confirmé"}</p>`,
        )
        .join("")
    : "<p>Prochain envoi à 04:00<br>Heure de Paris</p>";
}
function renderHistory() {
  $("#history").innerHTML =
    state.editions
      .map(
        (e) =>
          `<button class="edition ${edition?.id === e.id ? "active" : ""}" data-edition="${e.id}"><strong>${esc(day(e.day))}</strong><small>${esc(status[e.state])}${e.approved ? " · Relu" : ""}</small></button>`,
      )
      .join("") || "<p>Aucune édition pour le moment.</p>";
  document
    .querySelectorAll("[data-edition]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          load(b.dataset.edition).catch((e) => toast(e.message))),
    );
  delivery();
}
function render() {
  const ready = edition?.state === "ready";
  $("#edition-date").textContent = day(edition?.day || state.today);
  $("#stage").textContent = edition
    ? edition.stage +
      (edition.updated
        ? " · " +
          new Date(edition.updated).toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "")
    : "Aucune édition sélectionnée";
  $("#alert").hidden = !edition?.error;
  $("#alert").textContent = edition?.error || "";
  for (const id of ["copy", "download", "approve", "save-polarities"])
    $("#" + id).disabled = !ready || busy;
  $("#approve").innerHTML =
    `<i data-lucide="check"></i>${edition?.approved ? "Relu par Xavier" : "Marquer comme relu"}`;
  $("#generate").disabled =
    busy || state.editions.some((e) => ["queued", "working"].includes(e.state));
  $("#revise").disabled =
    busy ||
    !edition?.research ||
    edition.day !== state.today ||
    ["queued", "working"].includes(edition.state);
  $("#word-count").textContent = ready
    ? `${(edition.brief_text || "").trim().split(/\s+/).length} mots · ${edition.polarities.trim() ? "Polarités renseignées" : "Polarités à compléter"}`
    : "";
  $("#checks").innerHTML = edition?.audit?.passed
    ? "<li>✓ Dossier de sources contre-vérifié</li><li>✓ Dates et statuts des annonces contrôlés</li><li>✓ Forme et longueur contrôlées</li>"
    : `<li>${edition?.state === "failed" ? "Vérification non validée" : "Vérifications en attente"}</li>`;
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) =>
      b.setAttribute("aria-selected", String(b.dataset.tab === tab)),
    );
  if (tab === "sources" && edition?.research) {
    const r = edition.research;
    $("#document").innerHTML =
      `<p class="note">Dernière séance US : ${esc(r.previous_us_session)} · ${r.news.length} sujets</p>${r.news.map((n) => `<article class="source-item"><div class="category">${esc(n.section)} · ${esc(n.event_date)} · ${n.status === "scheduled" ? "À venir" : "Publié"}</div><label><input type="checkbox" data-news="${esc(n.id)}" ${selected.has(n.id) ? "checked" : ""}>${esc(n.title)}</label><p>${esc(n.facts)}</p><p><strong>Pourquoi ça compte.</strong> ${esc(n.why)}</p><details><summary>Sources et nouveauté</summary><p>${esc(n.novelty)}</p>${n.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a><small>${esc(s.published_at)}</small><p>${esc(s.evidence)}</p>`).join("")}</details></article>`).join("")}<article class="source-item"><h3>Mot de la fin</h3><p>${esc(r.closing.story)}</p><a target="_blank" rel="noopener noreferrer" href="${esc(r.closing.source.url)}">${esc(r.closing.source.title)} ↗</a></article>${r.gaps.length ? '<div class="note"><strong>Couverture incomplète</strong><br>' + r.gaps.map(esc).join("<br>") + "</div>" : ""}`;
    document
      .querySelectorAll("[data-news]")
      .forEach(
        (c) =>
          (c.onchange = () =>
            c.checked
              ? selected.add(c.dataset.news)
              : selected.delete(c.dataset.news)),
      );
  } else if (ready) {
    const d = edition.draft;
    $("#document").innerHTML =
      (tab === "podcast"
        ? `<div class="podcast-meta"><h3>${esc(d.podcast_title)}</h3><p>${esc(d.podcast_description)}</p></div>`
        : "") +
      `<pre>${esc(tab === "podcast" ? edition.podcast_text : edition.brief_text)}</pre>`;
  } else {
    const active = edition && ["queued", "working"].includes(edition.state);
    $("#document").innerHTML =
      `<div class="empty ${active ? "loading" : ""}"><i data-lucide="${active ? "loader-circle" : "notebook-pen"}"></i><h3>${active ? esc(edition.stage) : edition?.state === "failed" ? "Édition à vérifier" : "Le prochain Brief Mood commence ici"}</h3></div>`;
  }
  renderHistory();
  icons();
}
async function load(id, preserveInputs = false) {
  edition = await api("editions/" + encodeURIComponent(id));
  selected = new Set((edition.research?.news || []).map((n) => n.id));
  if (!preserveInputs) {
    $("#notes").value = edition.notes;
    $("#polarities").value = edition.polarities;
  }
  window.history.replaceState(null, "", "?edition=" + edition.id);
  render();
}
async function refresh() {
  state = await api("state");
  const id =
    edition?.id ||
    new URLSearchParams(location.search).get("edition") ||
    state.editions[0]?.id;
  if (id) await load(id, true);
  else render();
}
async function action(fn) {
  if (busy) return;
  busy = true;
  render();
  try {
    await fn();
  } catch (e) {
    toast(e.message);
  } finally {
    busy = false;
    await refresh().catch((e) => toast(e.message));
  }
}
$("#generate").onclick = () =>
  action(async () => {
    const r = await api("editions", {
      notes: $("#notes").value,
      polarities: $("#polarities").value,
    });
    await load(r.id);
    toast("Recherche lancée.");
  });
$("#revise").onclick = () =>
  action(async () => {
    const r = await api("editions/" + edition.id + "/revise", {
      notes: $("#notes").value,
      polarities: $("#polarities").value,
      selected: [...selected],
    });
    await load(r.id);
    toast("Nouvelle rédaction lancée.");
  });
$("#save-polarities").onclick = () =>
  action(async () => {
    await api(
      "editions/" + edition.id + "/polarities",
      { polarities: $("#polarities").value },
      "PUT",
    );
    toast("Polarités enregistrées.");
  });
$("#approve").onclick = () =>
  action(async () => {
    await api("editions/" + edition.id + "/approve", {});
    toast("Édition marquée comme relue.");
  });
$("#copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText(
      tab === "podcast"
        ? edition.draft.podcast_title +
            "\n\n" +
            edition.draft.podcast_description +
            "\n\n" +
            edition.podcast_text
        : edition.brief_text,
    );
    toast("Texte copié.");
  } catch {
    toast("Copie indisponible. Utiliser le téléchargement.");
  }
};
$("#download").onclick = () =>
  (location.href =
    "api/editions/" + edition.id + "/export?podcast=" + (tab === "podcast"));
$("#refresh").onclick = () => refresh().catch((e) => toast(e.message));
$("#new").onclick = () => {
  edition = null;
  selected.clear();
  $("#notes").value = "";
  $("#polarities").value = "";
  window.history.replaceState(null, "", location.pathname);
  tab = "brief";
  render();
  $("#notes").focus();
};
document.querySelectorAll("[data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      tab = b.dataset.tab;
      render();
    }),
);
refresh()
  .then(() => {
    if (edition) {
      $("#notes").value = edition.notes;
      $("#polarities").value = edition.polarities;
    }
  })
  .catch((e) => {
    $("#stage").textContent = "Connexion indisponible";
    toast(e.message);
  });
setInterval(() => {
  if (state?.editions.some((e) => ["queued", "working"].includes(e.state)))
    refresh().catch(() => {});
}, 6000);
