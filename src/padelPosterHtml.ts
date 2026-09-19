// Backlog de Agencia (padel, ronda de categorías: "Broadcast Visual" —
// vista de club completo). Oscar, tras ver la pantalla por-torneo: "las
// llaves deben aplicar para todo el torneo o retas... dame una sección
// por cada categoría 6ta, 5ta, 4ta, 3ra, 2da y 1ra." Esta pantalla muestra
// las 6 categorías reales a la vez, cada una con su propia sección — el
// club corre varias retas en paralelo (una por categoría, cada una su
// propio día) y este es el "póster" que las junta todas, como el cuadro
// de un torneo real completo.
//
// Reusa el mismo lenguaje visual que src/padelScreenHtml.ts (la pantalla
// de una sola convocatoria) — Oswald/Inter, tema oscuro. Tercera vuelta de
// diseño (2026-09-02): Oscar pidió explícitamente NO construir un árbol de
// eliminación (bracket tree) — Reta Americana no elimina a nadie, todos
// juegan todas las rondas. Cada categoría muestra pestañas por ronda (y
// semifinal/final como pestañas más) con un grid de tarjetas dentro, mismo
// patrón que src/padelScreenHtml.ts, cada tarjeta de categoría con su
// propio estado de pestaña activa (varias categorías visibles a la vez).
//
// DISCIPLINA OBLIGATORIA para este archivo (bug recurrente ya documentado
// en dashboardHtml.ts/consoleHtml.ts/padelScreenHtml.ts): cualquier
// comilla dentro de un string de JS debe sobrevivir la evaluación del
// template literal externo de TypeScript — nunca escapar con un solo
// backslash.
export const PADEL_POSTER_HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Categorías del club — Pádel</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --accent: #1D9E75;
    --accent-glow: rgba(29, 158, 117, 0.45);
    --bg-0: #05080A;
    --bg-1: #0D1518;
    --panel: #121C20;
    --panel-2: #16232A;
    --border: #26363D;
    --text: #F4F7F6;
    --text-muted: #8FA6A1;
    --gold: #E8C25A;
    /* Mismo verde lima que /pantalla/:tenantId/victorias (src/padelVictoriesHtml.ts)
       — Oscar: "la tabla de posiciones se tiene que ver exactamente como el
       portal de victorias". */
    --lime: #D2F800;
    --lime-glow: rgba(210, 248, 0, 0.35);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    background:
      repeating-linear-gradient(135deg, rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 2px, transparent 2px, transparent 26px),
      radial-gradient(ellipse at top, var(--bg-1), var(--bg-0) 70%);
    color: var(--text);
    font-family: "Inter", "Segoe UI", Roboto, Arial, sans-serif;
  }
  h1, h2, h3, h4, .headline { font-family: "Oswald", "Inter", sans-serif; }

  .header {
    position: relative;
    text-align: center;
    padding: 30px 20px 26px;
    border-bottom: 3px solid var(--accent);
    box-shadow: 0 2px 30px var(--accent-glow);
    background: linear-gradient(180deg, rgba(255,255,255,0.05), transparent);
    overflow: hidden;
  }
  .header::before, .header::after {
    content: "";
    position: absolute;
    top: 0; bottom: 0;
    width: 34%;
    background: repeating-linear-gradient(-45deg, var(--accent) 0, var(--accent) 10px, transparent 10px, transparent 20px);
    opacity: 0.14;
  }
  .header::before { left: 0; }
  .header::after { right: 0; }
  .header img { max-height: 76px; margin-bottom: 10px; position: relative; z-index: 1; }
  .header .brandName { font-size: 2rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; position: relative; z-index: 1; }
  .header .subtitle { margin-top: 8px; font-size: 1.05rem; color: var(--accent); font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; position: relative; z-index: 1; }

  main { max-width: 1500px; margin: 0 auto; padding: 30px 18px 70px; }
  .categoriesGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 22px; }
  .categoryCard { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 20px 22px; box-shadow: 0 10px 28px rgba(0,0,0,0.35); }
  .categoryCard .categoryHeader { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 14px; }
  .categoryCard .categoryName { font-size: 1.3rem; font-weight: 700; letter-spacing: 0.04em; }
  .categoryCard .categoryName .badge { display: inline-block; background: var(--accent); color: var(--bg-0); font-size: 0.7rem; padding: 2px 9px; border-radius: 4px; margin-left: 8px; text-transform: uppercase; letter-spacing: 0.06em; vertical-align: middle; }
  .categoryCard .tournamentLabel { font-size: 0.85rem; color: var(--text-muted); text-align: right; }
  .categoryCard .empty { text-align: center; color: var(--text-muted); padding: 30px 0; font-size: 1rem; }

  h4.sectionTitle { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; color: var(--text-muted); margin: 16px 0 8px; }

  .tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0 4px; }
  .tab {
    background: var(--panel-2); border: 1px solid var(--border); color: var(--text-muted);
    border-radius: 999px; padding: 6px 14px; font-family: "Oswald", sans-serif; font-size: 0.72rem;
    font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .tab:hover { color: var(--text); border-color: var(--accent); }
  .tab.active { background: var(--accent); color: var(--bg-0); border-color: var(--accent); }

  .roundsGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
  .matchCard { background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
  .matchCard.final { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }
  .matchCard .court { font-size: 0.65rem; color: var(--accent); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; font-weight: 600; }
  .matchCard.final .court { color: var(--gold); }
  .matchTeam { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 0.88rem; border-top: 1px solid rgba(255,255,255,0.05); }
  .matchTeam:first-of-type { border-top: none; }
  .matchTeam .names { font-weight: 500; }
  .matchTeam .score { font-family: "Oswald", sans-serif; font-weight: 700; font-size: 1.05rem; min-width: 24px; text-align: right; color: var(--text-muted); }
  .matchTeam.winner .names { color: var(--accent); font-weight: 700; }
  .matchTeam.winner .score { color: var(--accent); }

  /* Mismo componente que /pantalla/:tenantId/victorias, a escala compacta
     para caber dentro de una tarjeta de categoría. */
  table.rankTable { width: 100%; border-collapse: separate; border-spacing: 0 5px; margin-top: 6px; font-size: 0.85rem; }
  table.rankTable td { padding: 6px 9px; background: var(--panel-2); }
  table.rankTable tr td:first-child { border-radius: 6px 0 0 6px; }
  table.rankTable tr td:last-child { border-radius: 0 6px 6px 0; text-align: right; }
  table.rankTable tr.top8 td { background: color-mix(in srgb, var(--accent) 12%, var(--panel-2)); }
  table.rankTable tr.top3 td { background: color-mix(in srgb, var(--gold) 16%, var(--panel-2)); }
  table.rankTable tr.rank1 td { background: color-mix(in srgb, var(--lime) 18%, var(--panel-2)); }
  .rankBadge {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: 5px;
    background: var(--panel); color: var(--text-muted);
    font-family: "Oswald", sans-serif; font-weight: 700; font-size: 0.72rem;
  }
  table.rankTable tr.top8 .rankBadge { background: var(--accent); color: var(--bg-0); }
  table.rankTable tr.top3 .rankBadge { background: var(--gold); color: var(--bg-0); }
  table.rankTable tr.rank1 .rankBadge { background: var(--lime); color: var(--bg-0); box-shadow: 0 0 10px var(--lime-glow); }
  .rankName { font-weight: 600; }
  .rankName .racket { margin-right: 5px; }
  .rankValue { font-family: "Oswald", sans-serif; font-weight: 700; color: var(--lime); white-space: nowrap; }

  .championBanner { text-align: center; padding: 22px 0; }
  .championBanner .trophy { font-size: 2.6rem; filter: drop-shadow(0 0 16px var(--accent-glow)); }
  .championBanner .title { font-family: "Oswald", sans-serif; font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.14em; margin-top: 6px; }
  .championBanner .names { font-family: "Oswald", sans-serif; font-size: 1.5rem; font-weight: 700; margin-top: 8px; color: var(--gold); }
</style>
</head>
<body>
  <div class="header">
    <div id="headerLogoWrap"></div>
    <div class="subtitle">Categorías del club</div>
  </div>
  <main id="main">
    <p class="categoryCard empty" id="loadingMsg">Cargando categorías…</p>
  </main>

  <script>
    var parts = window.location.pathname.split("/").filter(Boolean);
    var tenantId = parts[1];
    var CATEGORY_LABELS = { "6ta": "6ta", "5ta": "5ta", "4ta": "4ta", "3ra": "3ra", "2da": "2da", "1ra": "1ra" };
    var STATUS_LABELS = { abierta: "Convocatoria abierta", cerrada: "Convocatoria cerrada", en_curso: "En juego", finalizado: "Finalizada" };

    // Pestaña activa por categoría — vive fuera de render() para
    // sobrevivir al redibujado completo que hace cada poll de 6s.
    var activeCategoryTab = {};

    function renderMatchTeam(names, score, otherScore) {
      var row = document.createElement("div");
      var isWinner = score !== null && otherScore !== null && score > otherScore;
      row.className = "matchTeam" + (isWinner ? " winner" : "");
      var label = document.createElement("span");
      label.className = "names";
      label.textContent = names[0] + " / " + names[1];
      var scoreEl = document.createElement("span");
      scoreEl.className = "score";
      scoreEl.textContent = score === null ? "—" : String(score);
      row.appendChild(label);
      row.appendChild(scoreEl);
      return row;
    }

    function renderMatchCard(m, court, isFinal) {
      var card = document.createElement("div");
      card.className = "matchCard" + (isFinal ? " final" : "");
      var courtEl = document.createElement("div");
      courtEl.className = "court";
      courtEl.textContent = court;
      card.appendChild(courtEl);
      card.appendChild(renderMatchTeam(m.teamA, m.scoreA, m.scoreB));
      card.appendChild(renderMatchTeam(m.teamB, m.scoreB, m.scoreA));
      return card;
    }

    // Mismo componente que /pantalla/:tenantId/victorias (badge de
    // posición + nombre con 🎾 + valor en verde lima) — Oscar: "la tabla
    // de posiciones se tiene que ver exactamente como el portal de
    // victorias". "top8" (pasan a semifinales) se conserva como tercer
    // nivel real que el ranking de victorias no necesita.
    function renderStandingsTable(standings) {
      var wrap = document.createElement("div");
      var title = document.createElement("h4");
      title.className = "sectionTitle";
      title.textContent = "Tabla de posiciones";
      wrap.appendChild(title);
      var table = document.createElement("table");
      table.className = "rankTable";
      var tbody = document.createElement("tbody");
      standings.forEach(function (s, i) {
        var isTop8 = i < 8 && s.points > 0;
        var isTop3 = i < 3 && s.points > 0;
        var isRank1 = i === 0 && s.points > 0;
        var tr = document.createElement("tr");
        tr.className = (isTop8 ? "top8 " : "") + (isTop3 ? "top3 " : "") + (isRank1 ? "rank1" : "");

        var tdRank = document.createElement("td");
        var badge = document.createElement("span");
        badge.className = "rankBadge";
        badge.textContent = String(i + 1);
        tdRank.appendChild(badge);

        var tdName = document.createElement("td");
        tdName.className = "rankName";
        var racket = document.createElement("span");
        racket.className = "racket";
        racket.textContent = "🎾";
        tdName.appendChild(racket);
        tdName.appendChild(document.createTextNode(s.playerName));

        var tdPoints = document.createElement("td");
        tdPoints.className = "rankValue";
        tdPoints.textContent = String(s.points);

        tr.appendChild(tdRank); tr.appendChild(tdName); tr.appendChild(tdPoints);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      return wrap;
    }

    // Reta Americana: sin eliminación, todos juegan todas las rondas.
    // Pestañas por ronda (y semifinal/final si ya existen) con un grid de
    // tarjetas dentro de cada una — mismo patrón que padelScreenHtml.ts,
    // con estado de pestaña activa por categoría (categoryKey).
    function renderTabsAndStandings(container, data, categoryKey) {
      var rondaMatches = data.matches.filter(function (m) { return m.phase === "ronda"; });
      var semis = data.matches.filter(function (m) { return m.phase === "semifinal"; });
      var final = data.matches.filter(function (m) { return m.phase === "final"; })[0] || null;

      var roundNumbers = [];
      rondaMatches.forEach(function (m) { if (roundNumbers.indexOf(m.roundNumber) === -1) roundNumbers.push(m.roundNumber); });
      roundNumbers.sort(function (a, b) { return a - b; });

      var tabs = roundNumbers.map(function (r) {
        return { key: "ronda-" + r, label: "R" + r, matches: rondaMatches.filter(function (m) { return m.roundNumber === r; }) };
      });
      if (semis.length > 0) tabs.push({ key: "semifinal", label: "Semifinal", matches: semis });
      if (final) tabs.push({ key: "final", label: "Final", matches: [final] });
      if (tabs.length === 0) return;

      if (!activeCategoryTab[categoryKey] || !tabs.some(function (t) { return t.key === activeCategoryTab[categoryKey]; })) {
        activeCategoryTab[categoryKey] = tabs[0].key;
      }

      var tabStrip = document.createElement("div");
      tabStrip.className = "tabs";
      tabs.forEach(function (t) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tab" + (activeCategoryTab[categoryKey] === t.key ? " active" : "");
        btn.textContent = t.label;
        btn.addEventListener("click", function () {
          activeCategoryTab[categoryKey] = t.key;
          render(lastData);
        });
        tabStrip.appendChild(btn);
      });
      container.appendChild(tabStrip);

      var activeTab = tabs.filter(function (t) { return t.key === activeCategoryTab[categoryKey]; })[0];
      var grid = document.createElement("div");
      grid.className = "roundsGrid";
      activeTab.matches.forEach(function (m, i) {
        var court = activeTab.key === "semifinal" ? "Semifinal " + (i + 1) : activeTab.key === "final" ? "Final" : "Cancha " + m.courtNumber;
        grid.appendChild(renderMatchCard(m, court, activeTab.key === "final"));
      });
      container.appendChild(grid);

      if (data.standings.length > 0) container.appendChild(renderStandingsTable(data.standings));
    }

    function renderChampion(container, data) {
      var banner = document.createElement("div");
      banner.className = "championBanner";
      var trophy = document.createElement("div");
      trophy.className = "trophy";
      trophy.textContent = "🏆";
      var title = document.createElement("div");
      title.className = "title";
      title.textContent = "Campeones";
      var names = document.createElement("div");
      names.className = "names";
      names.textContent = data.champion.join(" / ");
      banner.appendChild(trophy);
      banner.appendChild(title);
      banner.appendChild(names);
      container.appendChild(banner);
      if (data.standings.length > 0) container.appendChild(renderStandingsTable(data.standings));
    }

    function renderCategoryCard(entry) {
      var card = document.createElement("div");
      card.className = "categoryCard";

      var header = document.createElement("div");
      header.className = "categoryHeader";
      var name = document.createElement("div");
      name.className = "categoryName";
      name.textContent = "Categoría " + (CATEGORY_LABELS[entry.category] || entry.category);
      if (entry.tournament) {
        var badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = STATUS_LABELS[entry.tournament.status] || entry.tournament.status;
        name.appendChild(badge);
      }
      header.appendChild(name);
      if (entry.tournament) {
        var label = document.createElement("div");
        label.className = "tournamentLabel";
        label.textContent = entry.tournament.label;
        header.appendChild(label);
      }
      card.appendChild(header);

      if (!entry.tournament) {
        var empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "Sin convocatoria activa todavía.";
        card.appendChild(empty);
        return card;
      }

      if (entry.champion) {
        renderChampion(card, entry);
      } else if (entry.matches.length > 0) {
        renderTabsAndStandings(card, entry, entry.category);
      } else {
        var waiting = document.createElement("p");
        waiting.className = "empty";
        waiting.textContent = "Convocatoria abierta — todavía sin fixture.";
        card.appendChild(waiting);
      }

      return card;
    }

    var lastData = null;

    function render(data) {
      lastData = data;
      var logoWrap = document.getElementById("headerLogoWrap");
      if (!logoWrap.dataset.built) {
        logoWrap.dataset.built = "1";
        if (data.tenant.brandLogoUrl) {
          var img = document.createElement("img");
          img.src = data.tenant.brandLogoUrl;
          img.alt = data.tenant.name;
          img.onerror = function () {
            logoWrap.innerHTML = "";
            var fallback = document.createElement("div");
            fallback.className = "brandName";
            fallback.textContent = data.tenant.name;
            logoWrap.appendChild(fallback);
          };
          logoWrap.appendChild(img);
        } else {
          var brandName = document.createElement("div");
          brandName.className = "brandName";
          brandName.textContent = data.tenant.name;
          logoWrap.appendChild(brandName);
        }
        if (data.tenant.brandColor) {
          document.documentElement.style.setProperty("--accent", data.tenant.brandColor);
          document.documentElement.style.setProperty("--lime", data.tenant.brandColor);
        }
      }

      var main = document.getElementById("main");
      main.innerHTML = "";
      var grid = document.createElement("div");
      grid.className = "categoriesGrid";
      data.categories.forEach(function (entry) { grid.appendChild(renderCategoryCard(entry)); });
      main.appendChild(grid);
    }

    function load() {
      fetch("/api/pantalla/" + tenantId)
        .then(function (res) {
          if (!res.ok) throw new Error("No se pudo cargar el club");
          return res.json();
        })
        .then(render)
        .catch(function (err) {
          var main = document.getElementById("main");
          main.innerHTML = "";
          var p = document.createElement("p");
          p.className = "categoryCard empty";
          p.textContent = err.message;
          main.appendChild(p);
        });
    }

    load();
    setInterval(load, 6000);
  </script>
</body>
</html>
`;
