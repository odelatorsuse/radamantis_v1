// Backlog de Agencia (padel, ronda de canchas + parejas). Póster público
// "TOP JUGADORES CON MÁS VICTORIAS" — Oscar pegó una referencia de estilo
// de un ranking real de Premier Padel (fondo antracita, acento verde lima
// #D2F800, banda azul #1E62D0, raqueta/trofeo/calendario como iconos).
// Confirmado explícitamente: es una vista NUEVA y separada de la tabla de
// posiciones por puntos de cada torneo (esa sigue en /pantalla/:tenantId/
// :tournamentId) — este ranking cuenta PARTIDOS GANADOS acumulados de
// TODA la historia del club (src/padelVictories.ts), no puntos de una
// sola convocatoria. El nombre/logo de la marca de referencia se
// reemplaza siempre por el del tenant real (White-label ya existente) —
// nunca se copia el nombre/logo de un tercero.
//
// Sin WebSockets, se refresca sola por polling (mismo criterio ya
// aceptado en el resto de las pantallas públicas de este vertical).
//
// DISCIPLINA OBLIGATORIA para este archivo (bug recurrente ya documentado
// en dashboardHtml.ts/consoleHtml.ts/padelScreenHtml.ts): cualquier
// comilla o backtick dentro de un string/comentario de JS debe sobrevivir
// la evaluación del template literal externo de TypeScript — nunca
// escapar con un solo backslash, y nunca dejar un backtick suelto en un
// comentario.
export const PADEL_VICTORIAS_HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ranking de victorias</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --lime: #D2F800;
    --lime-glow: rgba(210, 248, 0, 0.35);
    --blue: #1E62D0;
    --bg-0: #0A0A0A;
    --bg-1: #121212;
    --panel: #17171A;
    --panel-2: #1D1D21;
    --border: #2A2A2E;
    --text: #FFFFFF;
    --text-muted: #9A9A9F;
    --gold: #E8C25A;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    background:
      repeating-linear-gradient(135deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 2px, transparent 2px, transparent 26px),
      radial-gradient(ellipse at top, var(--bg-1), var(--bg-0) 70%);
    color: var(--text);
    font-family: "Inter", "Segoe UI", Roboto, Arial, sans-serif;
  }
  h1, h2, .headline { font-family: "Oswald", "Inter", sans-serif; }

  .header {
    position: relative;
    text-align: center;
    padding: 26px 20px 18px;
    border-bottom: 3px solid var(--lime);
    box-shadow: 0 2px 30px var(--lime-glow);
    overflow: hidden;
  }
  .header img { max-height: 64px; margin-bottom: 8px; }
  .header .brandName { font-size: 1.6rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }

  main { max-width: 900px; margin: 0 auto; padding: 30px 20px 20px; }

  .titleBlock { text-align: center; margin-bottom: 30px; }
  .titleBlock .kicker { font-family: "Oswald", sans-serif; font-size: 1.4rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
  .titleBlock .kicker .lime { color: var(--lime); text-shadow: 0 0 20px var(--lime-glow); }
  .titleBlock .subtitle { margin-top: 8px; font-family: "Oswald", sans-serif; font-size: 0.95rem; letter-spacing: 0.3em; color: var(--text-muted); text-transform: uppercase; }

  table.victories { width: 100%; border-collapse: separate; border-spacing: 0 8px; }
  table.victories td { padding: 12px 16px; background: var(--panel); }
  table.victories tr td:first-child { border-radius: 8px 0 0 8px; }
  table.victories tr td:last-child { border-radius: 0 8px 8px 0; text-align: right; }
  table.victories tr.top3 td { background: color-mix(in srgb, var(--gold) 14%, var(--panel)); }
  table.victories tr.rank1 td { background: color-mix(in srgb, var(--lime) 16%, var(--panel)); }

  .rankBadge {
    display: inline-flex; align-items: center; justify-content: center;
    width: 34px; height: 34px; border-radius: 6px;
    background: var(--panel-2); color: var(--text-muted);
    font-family: "Oswald", sans-serif; font-weight: 700; font-size: 1rem;
  }
  tr.top3 .rankBadge { background: var(--gold); color: var(--bg-0); }
  tr.rank1 .rankBadge { background: var(--lime); color: var(--bg-0); box-shadow: 0 0 14px var(--lime-glow); }

  .playerName { font-weight: 600; font-size: 1.05rem; }
  .playerName .racket { margin-right: 8px; }

  .winsCol { font-family: "Oswald", sans-serif; font-weight: 700; font-size: 1.3rem; color: var(--lime); white-space: nowrap; }
  table.victories thead th { text-align: left; padding: 0 16px 6px; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
  table.victories thead th:last-child { text-align: right; }

  .empty { text-align: center; color: var(--text-muted); font-size: 1.1rem; margin-top: 60px; }

  .footer {
    display: flex; justify-content: space-between; align-items: center;
    margin-top: 34px; padding: 16px 20px; border-top: 1px solid var(--border);
  }
  .footer .dateLine { color: var(--lime); font-family: "Oswald", sans-serif; font-weight: 600; letter-spacing: 0.06em; font-size: 0.9rem; }
  .footer .clubBand {
    background: var(--blue); color: #FFFFFF; padding: 8px 18px; border-radius: 999px;
    font-family: "Oswald", sans-serif; font-weight: 700; letter-spacing: 0.08em; font-size: 0.85rem; text-transform: uppercase;
  }

  @media (max-width: 560px) {
    .titleBlock .kicker { font-size: 1.1rem; }
    .footer { flex-direction: column; gap: 10px; }
  }
</style>
</head>
<body>
  <div class="header">
    <div id="headerLogoWrap"></div>
  </div>
  <main id="main">
    <p class="empty" id="loadingMsg">Cargando ranking…</p>
  </main>

  <script>
    var parts = window.location.pathname.split("/").filter(Boolean);
    var tenantId = parts[1];
    var built = false;

    function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }

    function todayLabel() {
      var meses = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
      var d = new Date();
      return d.getDate() + " DE " + meses[d.getMonth()] + " DE " + d.getFullYear();
    }

    function renderTable(leaderboard) {
      var wrap = document.createElement("div");
      var table = document.createElement("table");
      table.className = "victories";
      table.innerHTML = "<thead><tr><th>Rank</th><th>Jugador</th><th>Victorias</th></tr></thead>";
      var tbody = document.createElement("tbody");
      leaderboard.forEach(function (row, i) {
        var tr = document.createElement("tr");
        if (i === 0) tr.className = "rank1";
        else if (i < 3) tr.className = "top3";

        var tdRank = document.createElement("td");
        var badge = document.createElement("span");
        badge.className = "rankBadge";
        badge.textContent = String(i + 1);
        tdRank.appendChild(badge);

        var tdName = document.createElement("td");
        tdName.className = "playerName";
        tdName.innerHTML = "<span class=\\"racket\\">\\uD83C\\uDFBE</span>" + esc(row.playerName.toUpperCase());

        var tdWins = document.createElement("td");
        tdWins.className = "winsCol";
        tdWins.textContent = String(row.wins);

        tr.appendChild(tdRank);
        tr.appendChild(tdName);
        tr.appendChild(tdWins);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      return wrap;
    }

    function render(data) {
      if (!built) {
        built = true;
        var logoWrap = document.getElementById("headerLogoWrap");
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
          document.documentElement.style.setProperty("--lime", data.tenant.brandColor);
        }
      }

      var main = document.getElementById("main");
      main.innerHTML = "";

      var titleBlock = document.createElement("div");
      titleBlock.className = "titleBlock";
      var kicker = document.createElement("div");
      kicker.className = "kicker";
      kicker.innerHTML = "TOP JUGADORES CON MÁS <span class=\\"lime\\">VICTORIAS</span>";
      var subtitle = document.createElement("div");
      subtitle.className = "subtitle";
      subtitle.textContent = "RANKING OFICIAL";
      titleBlock.appendChild(kicker);
      titleBlock.appendChild(subtitle);
      main.appendChild(titleBlock);

      if (data.leaderboard.length === 0) {
        var empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "Todavía no hay partidos jugados con marcador para armar el ranking.";
        main.appendChild(empty);
      } else {
        main.appendChild(renderTable(data.leaderboard));
      }

      var footer = document.createElement("div");
      footer.className = "footer";
      var dateLine = document.createElement("div");
      dateLine.className = "dateLine";
      dateLine.textContent = "\\uD83D\\uDCC5 RETAS " + todayLabel();
      var clubBand = document.createElement("div");
      clubBand.className = "clubBand";
      clubBand.textContent = "EN " + data.tenant.name.toUpperCase();
      footer.appendChild(dateLine);
      footer.appendChild(clubBand);
      main.appendChild(footer);
    }

    function load() {
      fetch("/api/pantalla/" + tenantId + "/victorias")
        .then(function (res) {
          if (!res.ok) throw new Error("No se pudo cargar el ranking");
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
