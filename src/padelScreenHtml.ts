// Backlog de Agencia (padel, Fase 5: "Broadcast Visual"). Pantalla pública
// de un torneo, pensada para una TV/monitor en el club (URL explícita con
// tenantId+tournamentId, mismo criterio que el snippet del widget de sitio
// web — nadie tiene que "adivinar" cuál torneo mostrar). Se refresca sola
// por polling (sin WebSockets — mismo criterio ya aceptado para el widget
// v1, no hay necesidad confirmada de tiempo real de verdad todavía).
//
// Tercera vuelta de diseño (2026-09-02): Oscar aclaró que la foto de
// Premier Padel era referencia ÚNICAMENTE de estilo visual (tarjetas
// dobles, bordes limpios), NUNCA de lógica de eliminación — en una Reta
// Americana nadie queda fuera ni "avanza" a un cuadro, todos juegan todas
// las rondas. Pidió explícitamente NO construir un árbol de eliminación
// (bracket tree): en su lugar, pestañas por ronda (y semifinal/final como
// pestañas más, sin conexión visual especial entre ellas) con un grid de
// tarjetas de partido estilo Premier Padel dentro de cada una. Se quitó
// todo el SVG de conectores de bracket de la ronda de diseño anterior.
//
// Usa el logo/color del negocio ya guardado en White-label
// (tenant_settings.brand_logo_url/brand_color, Agencia) — no se construyó
// un mecanismo de logo nuevo, se reusa el que ya existe.
//
// DISCIPLINA OBLIGATORIA para este archivo (bug recurrente ya documentado
// en dashboardHtml.ts/consoleHtml.ts): cualquier comilla dentro de un
// string de JS debe sobrevivir la evaluación del template literal externo
// de TypeScript — nunca escapar con un solo backslash.
export const PADEL_SCREEN_HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Torneo de pádel</title>
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
  h1, h2, h3, .headline { font-family: "Oswald", "Inter", sans-serif; }

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
  .header .tournamentLabel { margin-top: 8px; font-size: 1.3rem; color: var(--accent); font-weight: 600; letter-spacing: 0.03em; position: relative; z-index: 1; }
  .header .statusLine { margin-top: 6px; font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.14em; position: relative; z-index: 1; }
  .header .statusLine .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); margin-right: 6px; box-shadow: 0 0 8px var(--accent-glow); animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

  main { max-width: 1180px; margin: 0 auto; padding: 30px 20px 70px; }
  .empty { text-align: center; color: var(--text-muted); font-size: 1.25rem; margin-top: 70px; }

  h2.sectionTitle {
    font-size: 1.15rem; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 600;
    color: var(--text); margin-top: 42px; margin-bottom: 4px; display: flex; align-items: center; gap: 10px;
  }
  h2.sectionTitle::after { content: ""; flex: 1; height: 2px; background: linear-gradient(90deg, var(--accent), transparent); }

  .tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
  .tab {
    background: var(--panel); border: 1px solid var(--border); color: var(--text-muted);
    border-radius: 999px; padding: 9px 20px; font-family: "Oswald", sans-serif; font-size: 0.9rem;
    font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .tab:hover { color: var(--text); border-color: var(--accent); }
  .tab.active { background: var(--accent); color: var(--bg-0); border-color: var(--accent); box-shadow: 0 0 16px var(--accent-glow); }

  .roundsGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 14px; margin-top: 16px; }
  .matchCard {
    background: linear-gradient(160deg, var(--panel-2), var(--panel));
    border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px;
    box-shadow: 0 6px 16px rgba(0,0,0,0.35);
  }
  .matchCard.final { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold), 0 10px 30px rgba(0,0,0,0.55); }
  .matchCard .court { font-size: 0.7rem; color: var(--accent); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; font-weight: 600; }
  .matchCard.final .court { color: var(--gold); }
  .matchTeam { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: 1rem; border-top: 1px solid rgba(255,255,255,0.05); }
  .matchTeam:first-of-type { border-top: none; }
  .matchTeam .names { font-weight: 500; }
  .matchTeam .score { font-family: "Oswald", sans-serif; font-weight: 700; font-size: 1.3rem; min-width: 30px; text-align: right; color: var(--text-muted); }
  .matchTeam.winner .names { color: var(--accent); font-weight: 700; }
  .matchTeam.winner .score { color: var(--accent); }

  /* Mismo componente visual que la tabla del ranking de victorias
     (src/padelVictoriesHtml.ts: .victories/.rankBadge/.winsCol) — filas
     tipo tarjeta con badge de posición, en vez de un <table> plano.
     "top8" (pasan a semifinales) se conserva como tercer nivel real que
     el ranking de victorias no necesita, pero usa la MISMA forma de
     tarjeta/badge que los otros dos niveles. */
  table.rankTable { width: 100%; border-collapse: separate; border-spacing: 0 8px; margin-top: 16px; }
  table.rankTable td { padding: 12px 16px; background: var(--panel-2); }
  table.rankTable tr td:first-child { border-radius: 8px 0 0 8px; }
  table.rankTable tr td:last-child { border-radius: 0 8px 8px 0; text-align: right; }
  table.rankTable tr.top8 td { background: color-mix(in srgb, var(--accent) 12%, var(--panel-2)); }
  table.rankTable tr.top3 td { background: color-mix(in srgb, var(--gold) 16%, var(--panel-2)); }
  table.rankTable tr.rank1 td { background: color-mix(in srgb, var(--lime) 18%, var(--panel-2)); }
  .rankBadge {
    display: inline-flex; align-items: center; justify-content: center;
    width: 34px; height: 34px; border-radius: 6px;
    background: var(--panel); color: var(--text-muted);
    font-family: "Oswald", sans-serif; font-weight: 700; font-size: 1rem;
  }
  table.rankTable tr.top8 .rankBadge { background: var(--accent); color: var(--bg-0); }
  table.rankTable tr.top3 .rankBadge { background: var(--gold); color: var(--bg-0); }
  table.rankTable tr.rank1 .rankBadge { background: var(--lime); color: var(--bg-0); box-shadow: 0 0 14px var(--lime-glow); }
  .rankName { font-weight: 600; font-size: 1.05rem; }
  .rankName .racket { margin-right: 8px; }
  .rankValue { font-family: "Oswald", sans-serif; font-weight: 700; font-size: 1.3rem; color: var(--lime); white-space: nowrap; }

  .championScreen { text-align: center; margin-top: 60px; }
  .championScreen .trophy { font-size: 4.5rem; filter: drop-shadow(0 0 24px var(--accent-glow)); }
  .championScreen .title { font-family: "Oswald", sans-serif; font-size: 1.4rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.18em; margin-top: 12px; }
  .championScreen .names { font-family: "Oswald", sans-serif; font-size: 3rem; font-weight: 700; margin-top: 16px; color: var(--gold); text-shadow: 0 0 30px rgba(232, 194, 90, 0.5); }
  .confetti { position: fixed; top: -20px; width: 10px; height: 16px; opacity: 0.9; animation: fall linear infinite; z-index: 5; }
  @keyframes fall { to { transform: translateY(110vh) rotate(360deg); } }

  @media (max-width: 640px) {
    .tabs { gap: 6px; }
    .tab { padding: 7px 14px; font-size: 0.8rem; }
  }
</style>
</head>
<body>
  <div class="header">
    <div id="headerLogoWrap"></div>
    <div class="tournamentLabel" id="tournamentLabel">Cargando…</div>
    <div class="statusLine" id="statusLine"></div>
  </div>
  <main id="main">
    <p class="empty" id="loadingMsg">Cargando torneo…</p>
  </main>

  <script>
    var parts = window.location.pathname.split("/").filter(Boolean);
    var tenantId = parts[1];
    var tournamentId = parts[2];
    var STATUS_LABELS = { abierta: "Convocatoria abierta", cerrada: "Convocatoria cerrada", en_curso: "En juego", finalizado: "Torneo finalizado" };
    var confettiStarted = false;

    function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }

    function launchConfetti() {
      if (confettiStarted) return;
      confettiStarted = true;
      var colors = ["#1D9E75", "#E8C25A", "#EB5757", "#2D9CDB", "#F4F7F6"];
      for (var i = 0; i < 140; i++) {
        var piece = document.createElement("div");
        piece.className = "confetti";
        piece.style.left = (Math.random() * 100) + "vw";
        piece.style.background = colors[i % colors.length];
        piece.style.animationDuration = (3 + Math.random() * 3) + "s";
        piece.style.animationDelay = (Math.random() * 2) + "s";
        document.body.appendChild(piece);
      }
    }

    var activeTabKey = null;

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

    function renderStandingsTable(standings) {
      var wrap = document.createElement("div");
      var title = document.createElement("h2");
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
        tdName.innerHTML = "<span class=\\"racket\\">\\uD83C\\uDFBE</span>" + esc(s.playerName);

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

    // Reta Americana: no hay eliminación — todos juegan todas las rondas,
    // nadie "avanza" a un cuadro. Cada ronda (y semifinal/final, si ya se
    // generaron) es una PESTAÑA con su propio grid de tarjetas, nunca un
    // árbol de eliminación con líneas conectando partidos.
    function renderTabsAndStandings(data) {
      var main = document.getElementById("main");
      main.innerHTML = "";

      var rondaMatches = data.matches.filter(function (m) { return m.phase === "ronda"; });
      var semis = data.matches.filter(function (m) { return m.phase === "semifinal"; });
      var final = data.matches.filter(function (m) { return m.phase === "final"; })[0] || null;

      var roundNumbers = [];
      rondaMatches.forEach(function (m) { if (roundNumbers.indexOf(m.roundNumber) === -1) roundNumbers.push(m.roundNumber); });
      roundNumbers.sort(function (a, b) { return a - b; });

      var tabs = roundNumbers.map(function (r) {
        return { key: "ronda-" + r, label: "Ronda " + r, matches: rondaMatches.filter(function (m) { return m.roundNumber === r; }) };
      });
      if (semis.length > 0) tabs.push({ key: "semifinal", label: "Semifinal", matches: semis });
      if (final) tabs.push({ key: "final", label: "Final", matches: [final] });

      if (tabs.length === 0) return;
      if (!activeTabKey || !tabs.some(function (t) { return t.key === activeTabKey; })) activeTabKey = tabs[0].key;

      var title = document.createElement("h2");
      title.className = "sectionTitle";
      title.textContent = "Partidos";
      main.appendChild(title);

      var tabStrip = document.createElement("div");
      tabStrip.className = "tabs";
      tabs.forEach(function (t) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tab" + (activeTabKey === t.key ? " active" : "");
        btn.textContent = t.label;
        btn.addEventListener("click", function () {
          activeTabKey = t.key;
          renderTabsAndStandings(data);
        });
        tabStrip.appendChild(btn);
      });
      main.appendChild(tabStrip);

      var activeTab = tabs.filter(function (t) { return t.key === activeTabKey; })[0];
      var grid = document.createElement("div");
      grid.className = "roundsGrid";
      activeTab.matches.forEach(function (m, i) {
        var court = activeTab.key === "semifinal" ? "Semifinal " + (i + 1) : activeTab.key === "final" ? "Gran Final" : "Cancha " + m.courtNumber;
        grid.appendChild(renderMatchCard(m, court, activeTab.key === "final"));
      });
      main.appendChild(grid);

      if (data.standings.length > 0) main.appendChild(renderStandingsTable(data.standings));
    }

    function renderChampion(data) {
      var main = document.getElementById("main");
      main.innerHTML = "";
      var screen = document.createElement("div");
      screen.className = "championScreen";
      var trophy = document.createElement("div");
      trophy.className = "trophy";
      trophy.textContent = "🏆";
      var title = document.createElement("div");
      title.className = "title";
      title.textContent = "Campeones";
      var names = document.createElement("div");
      names.className = "names";
      names.textContent = data.champion.join(" / ");
      screen.appendChild(trophy);
      screen.appendChild(title);
      screen.appendChild(names);
      main.appendChild(screen);
      launchConfetti();
    }

    function render(data) {
      document.getElementById("tournamentLabel").textContent = data.tournament.label;
      var statusLine = document.getElementById("statusLine");
      statusLine.innerHTML = "";
      if (data.tournament.status === "en_curso") {
        var dot = document.createElement("span");
        dot.className = "dot";
        statusLine.appendChild(dot);
      }
      statusLine.appendChild(document.createTextNode(STATUS_LABELS[data.tournament.status] || data.tournament.status));

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

      if (data.champion) {
        renderChampion(data);
      } else if (data.matches.length > 0) {
        renderTabsAndStandings(data);
      } else {
        document.getElementById("main").innerHTML = "";
        var empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "El torneo todavía no ha comenzado.";
        document.getElementById("main").appendChild(empty);
      }
    }

    function load() {
      fetch("/api/pantalla/" + tenantId + "/" + tournamentId)
        .then(function (res) {
          if (!res.ok) throw new Error("No se pudo cargar el torneo");
          return res.json();
        })
        .then(render)
        .catch(function (err) {
          document.getElementById("main").innerHTML = "";
          var p = document.createElement("p");
          p.className = "empty";
          p.textContent = esc(err.message);
          document.getElementById("main").appendChild(p);
        });
    }

    load();
    setInterval(load, 6000);
  </script>
</body>
</html>
`;
