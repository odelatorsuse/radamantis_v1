// Etapa 8.5: dashboard admin — sidebar + breadcrumb + grid de tarjetas por
// bot, estilo "developer portal" oscuro. Paleta Slate/Indigo de
// docs/identidad-visual.md (revisada en Etapa 8.5 — más "dark" que la
// opción C original) — nunca la paleta de Forja. Consume exclusivamente
// /api/admin/* (D9).
export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Radamantis · Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Fira+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0B1120;
    --bg-sidebar: #080C16;
    --primary: #5B8DEF;
    --accent: #22C55E;
    --text: #E7ECF3;
    --text-muted: #8B96AE;
    --panel: #131B2E;
    --border: #1F2A44;
    --warning: #F5A623;
    --danger: #F87171;
    --radius: 12px;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    display: grid;
    grid-template-columns: 240px 1fr;
    min-height: 100vh;
    font-family: "Fira Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
    background: var(--bg);
    color: var(--text);
  }
  code, .mono { font-family: "Fira Code", "SF Mono", monospace; }
  a { color: inherit; }
  h1, h2, h3 { margin: 0; }
  svg { display: block; }

  /* --- Sidebar --- */
  .sidebar {
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border);
    padding: 20px 14px;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }
  .sidebar-logo { padding: 0 8px; }
  .sidebar-logo .name { font-weight: 700; font-size: 1.05rem; }
  .sidebar-logo .plan { font-family: "Fira Code", monospace; font-size: 0.65rem; letter-spacing: 0.08em; color: var(--text-muted); text-transform: uppercase; }
  .sidebar-nav { display: flex; flex-direction: column; gap: 2px; }
  .nav-item {
    all: unset; cursor: pointer; display: flex; align-items: center; gap: 10px;
    padding: 9px 10px; border-radius: 8px; font-size: 0.88rem; color: var(--text-muted);
    border-left: 2px solid transparent;
  }
  .nav-item svg { width: 18px; height: 18px; flex-shrink: 0; }
  .nav-item.active { background: rgba(91, 141, 239, 0.14); color: var(--text); border-left-color: var(--primary); }
  .nav-item:hover:not(.active) { color: var(--text); background: rgba(255, 255, 255, 0.04); }

  /* --- Main --- */
  .main { padding: 28px 32px; overflow-x: hidden; }
  .topbar { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 22px; flex-wrap: wrap; gap: 12px; }
  .breadcrumb { font-family: "Fira Code", monospace; font-size: 0.7rem; letter-spacing: 0.08em; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; }
  .page-title { font-size: 1.5rem; font-weight: 700; }
  .count-badge { border: 1px solid var(--border); border-radius: 999px; padding: 5px 12px; font-size: 0.75rem; font-family: "Fira Code", monospace; color: var(--text-muted); }
  .tab-view { display: none; }
  .tab-view.active { display: block; }

  h2.section-title { font-size: 1rem; color: var(--accent); margin: 28px 0 12px; display: flex; align-items: center; gap: 8px; }
  .panel { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; margin-bottom: 16px; }

  /* --- Bot cards --- */
  .bot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; margin-bottom: 8px; }
  .bot-card {
    background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 18px; display: flex; flex-direction: column; gap: 12px;
    transition: transform 150ms ease, border-color 150ms ease;
  }
  .bot-card:hover { border-color: var(--primary); transform: translateY(-2px); }
  .bot-card-header { display: flex; justify-content: space-between; align-items: flex-start; }
  .bot-icon { width: 40px; height: 40px; border-radius: 10px; background: rgba(91, 141, 239, 0.16); display: flex; align-items: center; justify-content: center; color: var(--primary); }
  .bot-icon svg { width: 22px; height: 22px; }
  .bot-badge { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--border); color: var(--text-muted); white-space: nowrap; }
  .bot-name { font-weight: 600; font-size: 1rem; }
  .bot-endpoint { font-family: "Fira Code", monospace; font-size: 0.72rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bot-card-footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 10px; font-size: 0.78rem; }
  .status-line { display: flex; align-items: center; gap: 6px; color: var(--text-muted); }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; }
  .status-dot.ok { background: var(--accent); box-shadow: 0 0 6px var(--accent); animation: pulse-led 1.8s ease-in-out infinite; }
  .status-dot.necesita_atencion { background: var(--warning); box-shadow: 0 0 6px var(--warning); }
  @keyframes pulse-led {
    0%, 100% { opacity: 1; box-shadow: 0 0 4px var(--accent); }
    50% { opacity: 0.45; box-shadow: 0 0 10px var(--accent); }
  }
  @media (prefers-reduced-motion: reduce) {
    .status-dot.ok { animation: none; }
  }
  .bot-card-link {
    color: var(--primary); font-weight: 600; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 4px;
    cursor: pointer; background: none; border: none; padding: 0; font-family: inherit;
  }
  .bot-card-link svg { width: 14px; height: 14px; }

  table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--border); }
  th { color: var(--accent); font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; }

  input, select, button, textarea { font-family: inherit; font-size: 0.9rem; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-sidebar); color: var(--text); }
  textarea { width: 100%; min-height: 90px; }
  button { cursor: pointer; transition: filter 150ms ease; }
  button:hover { filter: brightness(1.08); }
  button:not(.secondary):not(.link-btn) { background: var(--primary); border-color: var(--primary); color: var(--bg); font-weight: 600; }
  button.secondary { background: transparent; color: var(--accent); border-color: var(--accent); display: inline-flex; align-items: center; gap: 6px; }
  button.secondary svg { width: 14px; height: 14px; }
  form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; }
  .error { color: var(--danger); font-size: 0.85rem; margin-top: 8px; }
  .success-msg { color: var(--accent); font-size: 0.85rem; margin-top: 8px; }
  .empty { opacity: 0.6; font-size: 0.85rem; }
  option:disabled { color: #4A5568; }

  .metrics { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 16px; }
  .metric { min-width: 110px; }
  .metric .value { font-size: 1.4rem; font-weight: 700; }
  .metric .label { font-size: 0.75rem; color: var(--text-muted); }
  .status-ok { color: var(--accent); }
  .status-necesita_atencion { color: var(--warning); }
  #tenantDetail { display: none; }

  #authGate { grid-column: 1 / -1; max-width: 420px; margin: 100px auto; text-align: center; }
  #authGate .panel { text-align: left; }

  @media (max-width: 768px) {
    body { grid-template-columns: 1fr; }
    .sidebar { flex-direction: row; align-items: center; overflow-x: auto; gap: 16px; padding: 12px 16px; }
    .sidebar-nav { flex-direction: row; }
    .main { padding: 20px; }
  }
</style>
</head>
<body>

<div id="authGate" style="display:none">
  <h1 class="page-title">Radamantis · Admin</h1>
  <p class="empty">Ingresa la API key de super-admin.</p>
  <div class="panel">
    <form id="authForm" style="margin:0">
      <input id="adminKeyInput" type="password" placeholder="Admin API key" style="flex:1" />
      <button type="submit">Entrar</button>
    </form>
  </div>
  <p class="error" id="authError"></p>
</div>

<aside class="sidebar" id="sidebar" style="display:none">
  <div class="sidebar-logo">
    <div class="name">RADAMANTIS</div>
    <div class="plan">Admin · Super-admin</div>
  </div>
  <nav class="sidebar-nav">
    <button class="nav-item active" data-tab="bots">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 8V4"/><circle cx="12" cy="3" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="13.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="13.5" r="1.2" fill="currentColor" stroke="none"/><path d="M4 13H2M22 13h-2"/></svg>
      Bots
    </button>
    <button class="nav-item" data-tab="handoffs">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      Handoffs
    </button>
    <button class="nav-item" data-tab="usage">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10"/><path d="M12 20V4"/><path d="M20 20v-7"/></svg>
      Uso
    </button>
  </nav>
  <button class="secondary" id="logoutBtn" style="margin-top:auto">Cambiar key</button>
</aside>

<main class="main" id="app" style="display:none">

  <!-- Tab: Bots -->
  <section class="tab-view active" id="tab-bots">
    <div class="topbar">
      <div>
        <div class="breadcrumb">Panel / Bots</div>
        <h1 class="page-title">Bots</h1>
      </div>
      <span class="count-badge" id="botsCountBadge">0 bots</span>
    </div>

    <div id="tenantDetail" class="panel">
      <button class="secondary" id="closeDetailBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/></svg>
        Volver a bots
      </button>
      <h3 style="margin:14px 0" id="detailTitle">Detalle</h3>
      <div class="metrics" id="detailMetrics"></div>

      <h2 class="section-title">Canales</h2>
      <div class="panel" id="channelsList" style="background:transparent;border:none;padding:0"></div>
      <p id="channelUpdateError"></p>

      <h2 class="section-title">Config en caliente</h2>
      <form id="settingsForm">
        <select id="settingsTone">
          <option value="calido">Cálido</option>
          <option value="formal">Formal</option>
          <option value="divertido">Divertido</option>
        </select>
        <select id="settingsLanguage">
          <option value="es">Español</option>
          <option value="en">Inglés</option>
          <option value="pt">Portugués</option>
        </select>
        <input id="settingsCurrency" placeholder="Moneda (ej. MXN)" style="width:100px" />
        <input id="settingsTimezone" placeholder="Zona horaria (ej. America/Mexico_City)" style="width:220px" />
        <button type="submit">Guardar</button>
      </form>
      <label for="settingsPromptOverride" style="font-size:0.85rem;color:var(--text-muted)">Override de prompt (vacío = usa el del vertical)</label>
      <textarea id="settingsPromptOverride" placeholder="Instrucciones a medida para este tenant..."></textarea>

      <label style="font-size:0.85rem;color:var(--text-muted)">Horario de atención por día (varía por negocio)</label>
      <table id="businessHoursTable" style="margin-bottom:10px">
        <thead><tr><th>Día</th><th>Abierto</th><th>Desde</th><th>Hasta</th></tr></thead>
        <tbody></tbody>
      </table>
      <p id="settingsError"></p>

      <h2 class="section-title">Base de conocimiento (KB)</h2>
      <p style="font-size:0.85rem;color:var(--text-muted);margin-top:0">Pega un array JSON de <code>{"id": "...", "content": "..."}</code> — se embebe y se sube a Vectorize directo, sin CLI.</p>
      <form id="kbForm">
        <textarea id="kbDocsInput" placeholder='[{"id":"horario","content":"Lunes a viernes 9 a 18"}]' style="min-height:120px"></textarea>
        <button type="submit">Cargar KB</button>
      </form>
      <p id="kbError"></p>

      <h2 class="section-title">Calendario</h2>
      <div id="calendarStatus" style="font-size:0.9rem"></div>
      <p id="calendarError"></p>
    </div>

    <div id="botsListView">
      <div class="bot-grid" id="botGrid"></div>
      <p class="empty" id="tenantsEmpty" style="display:none">Sin tenants todavía.</p>

      <h2 class="section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
        Alta de tenant
      </h2>
      <div class="panel">
        <form id="tenantForm">
          <input id="tenantId" placeholder="id (ej. vet-norte)" required />
          <input id="tenantName" placeholder="Nombre" required />
          <select id="tenantVertical"></select>
          <button type="submit">Crear tenant</button>
        </form>
        <p class="error" id="tenantError"></p>
      </div>

      <h2 class="section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.5"/><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L12.5 19.5"/></svg>
        Alta de canal
      </h2>
      <div class="panel">
        <form id="channelForm">
          <select id="channelTenant"></select>
          <select id="channelType">
            <option value="telegram">Telegram</option>
            <option value="whatsapp" disabled>WhatsApp (próximamente)</option>
            <option value="instagram" disabled>Instagram (próximamente)</option>
            <option value="messenger" disabled>Messenger (próximamente)</option>
          </select>
          <input id="channelExternalId" placeholder="token del bot / id externo" required style="flex:1" />
          <button type="submit">Vincular canal</button>
        </form>
        <p class="error" id="channelError"></p>
      </div>
    </div>
  </section>

  <!-- Tab: Handoffs -->
  <section class="tab-view" id="tab-handoffs">
    <div class="topbar">
      <div>
        <div class="breadcrumb">Panel / Handoffs</div>
        <h1 class="page-title">Handoffs abiertos</h1>
      </div>
    </div>
    <div class="panel">
      <table id="handoffsTable">
        <thead><tr><th>Tenant</th><th>Canal</th><th>Chat</th><th>Motivo</th><th>Desde</th><th></th></tr></thead>
        <tbody></tbody>
      </table>
      <p class="empty" id="handoffsEmpty" style="display:none">No hay handoffs abiertos.</p>
    </div>
  </section>

  <!-- Tab: Uso -->
  <section class="tab-view" id="tab-usage">
    <div class="topbar">
      <div>
        <div class="breadcrumb">Panel / Uso</div>
        <h1 class="page-title">Uso (tokens por tenant)</h1>
      </div>
    </div>
    <div class="panel">
      <table id="usageTable">
        <thead><tr><th>Tenant</th><th>Requests</th><th>Prompt tokens</th><th>Completion tokens</th></tr></thead>
        <tbody></tbody>
      </table>
      <p class="empty" id="usageEmpty" style="display:none">Sin uso registrado todavía.</p>
    </div>
  </section>

</main>

<script>
(function () {
  var STORAGE_KEY = "radamantisAdminKey";
  var BOT_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 8V4"/><circle cx="12" cy="3" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="13.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="13.5" r="1.2" fill="currentColor" stroke="none"/><path d="M4 13H2M22 13h-2"/></svg>';
  var ARROW_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';

  function adminKey() { return localStorage.getItem(STORAGE_KEY) || ""; }

  function api(path, options) {
    options = options || {};
    options.headers = Object.assign({}, options.headers, {
      "Authorization": "Bearer " + adminKey(),
      "Content-Type": "application/json",
    });
    return fetch("/api/admin" + path, options).then(function (res) {
      if (res.status === 401) { showAuthGate("Key inválida o expirada."); throw new Error("unauthorized"); }
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || "Error");
        return data;
      });
    });
  }

  function showAuthGate(err) {
    document.getElementById("sidebar").style.display = "none";
    document.getElementById("app").style.display = "none";
    document.getElementById("authGate").style.display = "block";
    document.getElementById("authError").textContent = err || "";
  }

  function showApp() {
    document.getElementById("authGate").style.display = "none";
    document.getElementById("sidebar").style.display = "flex";
    document.getElementById("app").style.display = "block";
    loadAll();
  }

  function fillSelect(select, options, valueKey, labelKey) {
    select.innerHTML = "";
    options.forEach(function (opt) {
      var el = document.createElement("option");
      el.value = opt[valueKey];
      el.textContent = opt[labelKey];
      select.appendChild(el);
    });
  }

  document.querySelectorAll(".nav-item").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".nav-item").forEach(function (b) { b.classList.remove("active"); });
      document.querySelectorAll(".tab-view").forEach(function (v) { v.classList.remove("active"); });
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  var STATUS_LABELS = { ok: "EN LÍNEA", necesita_atencion: "Necesita atención" };

  function loadTenants() {
    return api("/tenants").then(function (data) {
      var grid = document.getElementById("botGrid");
      grid.innerHTML = "";
      document.getElementById("tenantsEmpty").style.display = data.tenants.length ? "none" : "block";
      document.getElementById("botsCountBadge").textContent = data.tenants.length + (data.tenants.length === 1 ? " bot" : " bots");

      data.tenants.forEach(function (t) {
        var statusKey = t.open_handoffs > 0 ? "necesita_atencion" : "ok";
        var card = document.createElement("div");
        card.className = "bot-card";
        card.innerHTML =
          "<div class='bot-card-header'>" +
            "<div class='bot-icon'>" + BOT_ICON_SVG + "</div>" +
            "<span class='bot-badge'>" + t.vertical_id + "</span>" +
          "</div>" +
          "<div>" +
            "<div class='bot-name'>" + t.name + "</div>" +
            "<div class='bot-endpoint mono'>" + t.id + "</div>" +
          "</div>" +
          "<div class='bot-card-footer'>" +
            "<span class='status-line'><span class='status-dot " + statusKey + "'></span>" + STATUS_LABELS[statusKey] + "</span>" +
            "<button class='bot-card-link'>Ver detalle " + ARROW_SVG + "</button>" +
          "</div>";
        card.querySelector(".bot-card-link").addEventListener("click", function () { openTenantDetail(t.id); });
        grid.appendChild(card);
      });

      fillSelect(document.getElementById("channelTenant"), data.tenants, "id", "id");
    });
  }

  function loadVerticals() {
    return api("/verticals").then(function (data) {
      fillSelect(document.getElementById("tenantVertical"), data.verticals, "verticalId", "displayName");
    });
  }

  function loadHandoffs() {
    return api("/handoffs?open=true").then(function (data) {
      var tbody = document.querySelector("#handoffsTable tbody");
      tbody.innerHTML = "";
      document.getElementById("handoffsEmpty").style.display = data.handoffs.length ? "none" : "block";
      data.handoffs.forEach(function (h) {
        var tr = document.createElement("tr");
        var td = document.createElement("td");
        var btn = document.createElement("button");
        btn.className = "secondary";
        btn.textContent = "Resolver";
        btn.onclick = function () {
          api("/handoffs/" + h.id + "/resolve", { method: "POST" }).then(loadHandoffs);
        };
        tr.innerHTML = "<td>" + h.tenant_id + "</td><td>" + h.channel + "</td><td>" + h.chat_id + "</td><td>" +
          h.reason + "</td><td>" + h.created_at + "</td>";
        td.appendChild(btn);
        tr.appendChild(td);
        tbody.appendChild(tr);
      });
    });
  }

  function loadUsage() {
    return api("/usage").then(function (data) {
      var tbody = document.querySelector("#usageTable tbody");
      tbody.innerHTML = "";
      document.getElementById("usageEmpty").style.display = data.usage.length ? "none" : "block";
      data.usage.forEach(function (u) {
        var tr = document.createElement("tr");
        tr.innerHTML = "<td>" + u.tenant_id + "</td><td>" + u.requests + "</td><td>" +
          u.prompt_tokens + "</td><td>" + u.completion_tokens + "</td>";
        tbody.appendChild(tr);
      });
    });
  }

  function loadAll() {
    loadVerticals().then(loadTenants).catch(function () {});
    loadHandoffs().catch(function () {});
    loadUsage().catch(function () {});
  }

  var currentDetailTenantId = null;
  var DETAIL_STATUS_LABELS = { ok: "OK", necesita_atencion: "Necesita atención" };
  var DAY_ROWS = [["mon", "Lunes"], ["tue", "Martes"], ["wed", "Miércoles"], ["thu", "Jueves"], ["fri", "Viernes"], ["sat", "Sábado"], ["sun", "Domingo"]];

  function renderBusinessHours(businessHours) {
    var tbody = document.querySelector("#businessHoursTable tbody");
    tbody.innerHTML = "";
    DAY_ROWS.forEach(function (row) {
      var key = row[0];
      var label = row[1];
      var day = businessHours[key];
      var tr = document.createElement("tr");
      var openCheckbox = document.createElement("input");
      openCheckbox.type = "checkbox";
      openCheckbox.checked = !!day;
      openCheckbox.dataset.day = key;
      openCheckbox.className = "bh-open";
      var startInput = document.createElement("input");
      startInput.type = "time";
      startInput.value = day ? day.start : "09:00";
      startInput.dataset.day = key;
      startInput.className = "bh-start";
      var endInput = document.createElement("input");
      endInput.type = "time";
      endInput.value = day ? day.end : "18:00";
      endInput.dataset.day = key;
      endInput.className = "bh-end";

      var tdDay = document.createElement("td");
      tdDay.textContent = label;
      var tdOpen = document.createElement("td");
      tdOpen.appendChild(openCheckbox);
      var tdStart = document.createElement("td");
      tdStart.appendChild(startInput);
      var tdEnd = document.createElement("td");
      tdEnd.appendChild(endInput);
      tr.appendChild(tdDay);
      tr.appendChild(tdOpen);
      tr.appendChild(tdStart);
      tr.appendChild(tdEnd);
      tbody.appendChild(tr);
    });
  }

  function readBusinessHoursFromForm() {
    var result = {};
    DAY_ROWS.forEach(function (row) {
      var key = row[0];
      var openBox = document.querySelector(".bh-open[data-day='" + key + "']");
      var startInput = document.querySelector(".bh-start[data-day='" + key + "']");
      var endInput = document.querySelector(".bh-end[data-day='" + key + "']");
      result[key] = openBox.checked ? { start: startInput.value, end: endInput.value } : null;
    });
    return result;
  }

  function metricTile(value, label) {
    var div = document.createElement("div");
    div.className = "metric";
    div.innerHTML = "<div class='value'>" + value + "</div><div class='label'>" + label + "</div>";
    return div;
  }

  function openTenantDetail(tenantId) {
    currentDetailTenantId = tenantId;
    api("/tenants/" + tenantId).then(function (data) {
      var t = data.tenant;
      document.getElementById("detailTitle").textContent = t.name + " · " + t.id;

      var metricsEl = document.getElementById("detailMetrics");
      metricsEl.innerHTML = "";
      var statusValue = document.createElement("div");
      statusValue.className = "value status-" + t.metrics.status;
      statusValue.textContent = DETAIL_STATUS_LABELS[t.metrics.status] || t.metrics.status;
      var statusTile = document.createElement("div");
      statusTile.className = "metric";
      statusTile.appendChild(statusValue);
      var statusLabel = document.createElement("div");
      statusLabel.className = "label";
      statusLabel.textContent = "Estado";
      statusTile.appendChild(statusLabel);
      metricsEl.appendChild(statusTile);
      metricsEl.appendChild(metricTile(t.metrics.messagesIn, "Mensajes entrantes"));
      metricsEl.appendChild(metricTile(t.metrics.messagesOut, "Mensajes salientes"));
      metricsEl.appendChild(metricTile(t.metrics.conversations, "Conversaciones"));
      metricsEl.appendChild(metricTile(t.channels.length, "Canales conectados"));

      var channelsList = document.getElementById("channelsList");
      channelsList.innerHTML = "";
      document.getElementById("channelUpdateError").textContent = "";
      if (t.channels.length === 0) {
        channelsList.innerHTML = "<p class='empty'>Sin canales vinculados.</p>";
      }
      t.channels.forEach(function (ch) {
        var row = document.createElement("form");
        row.style.marginBottom = "6px";
        var label = document.createElement("span");
        label.className = "bot-badge";
        label.textContent = ch.channel;
        var tokenInput = document.createElement("input");
        tokenInput.type = "text";
        tokenInput.value = ch.external_id;
        tokenInput.style.flex = "1";
        var updateBtn = document.createElement("button");
        updateBtn.type = "submit";
        updateBtn.className = "secondary";
        updateBtn.textContent = "Actualizar token";
        row.appendChild(label);
        row.appendChild(tokenInput);
        row.appendChild(updateBtn);
        row.addEventListener("submit", function (e) {
          e.preventDefault();
          var msgEl = document.getElementById("channelUpdateError");
          api("/tenants/" + tenantId + "/channels/" + ch.channel, {
            method: "PUT",
            body: JSON.stringify({ externalId: tokenInput.value }),
          })
            .then(function (data) {
              if (data.webhookRegistered) {
                msgEl.className = "success-msg";
                msgEl.textContent = "Token actualizado y webhook re-registrado.";
              } else if (data.webhookError) {
                msgEl.className = "error";
                msgEl.textContent = "Token guardado, pero el webhook falló: " + data.webhookError;
              } else {
                msgEl.className = "success-msg";
                msgEl.textContent = "Token actualizado.";
              }
            })
            .catch(function (err) { msgEl.className = "error"; msgEl.textContent = err.message; });
        });
        channelsList.appendChild(row);
      });

      document.getElementById("settingsTone").value = t.settings.tone;
      document.getElementById("settingsLanguage").value = t.settings.language;
      document.getElementById("settingsCurrency").value = t.settings.currency;
      document.getElementById("settingsTimezone").value = t.settings.timezone;
      renderBusinessHours(t.settings.businessHours);
      document.getElementById("settingsPromptOverride").value = t.settings.promptOverride || "";
      document.getElementById("settingsError").textContent = "";
      document.getElementById("settingsError").className = "";

      document.getElementById("botsListView").style.display = "none";
      document.getElementById("tenantDetail").style.display = "block";
      window.scrollTo(0, 0);
      loadCalendarStatus(tenantId);
    });
  }

  function loadCalendarStatus(tenantId) {
    var statusEl = document.getElementById("calendarStatus");
    var errEl = document.getElementById("calendarError");
    errEl.textContent = "";
    statusEl.textContent = "Cargando...";
    api("/tenants/" + tenantId + "/calendar").then(function (data) {
      if (!data.connected) {
        statusEl.innerHTML = "";
        var connectBtn = document.createElement("button");
        connectBtn.textContent = "Conectar Google Calendar";
        connectBtn.onclick = function () {
          api("/tenants/" + tenantId + "/calendar/connect-url").then(function (urlData) {
            window.open(urlData.url, "_blank");
          });
        };
        statusEl.appendChild(connectBtn);
        return;
      }
      statusEl.innerHTML =
        "<span class='status-line'><span class='status-dot ok'></span>Conectado (" + data.provider +
        ", calendario: " + data.calendarId + ", desde " + data.connectedAt + ")</span>";
      var disconnectBtn = document.createElement("button");
      disconnectBtn.className = "secondary";
      disconnectBtn.style.marginLeft = "10px";
      disconnectBtn.textContent = "Desconectar";
      disconnectBtn.onclick = function () {
        api("/tenants/" + tenantId + "/calendar", { method: "DELETE" }).then(function () {
          loadCalendarStatus(tenantId);
        });
      };
      statusEl.appendChild(disconnectBtn);
    }).catch(function (err) { errEl.className = "error"; errEl.textContent = err.message; });
  }

  document.getElementById("closeDetailBtn").addEventListener("click", function () {
    document.getElementById("tenantDetail").style.display = "none";
    document.getElementById("botsListView").style.display = "block";
    currentDetailTenantId = null;
  });

  document.getElementById("settingsForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!currentDetailTenantId) return;
    var body = {
      tone: document.getElementById("settingsTone").value,
      language: document.getElementById("settingsLanguage").value,
      currency: document.getElementById("settingsCurrency").value,
      timezone: document.getElementById("settingsTimezone").value,
      businessHours: readBusinessHoursFromForm(),
      promptOverride: document.getElementById("settingsPromptOverride").value,
    };
    var msgEl = document.getElementById("settingsError");
    api("/tenants/" + currentDetailTenantId + "/settings", { method: "PUT", body: JSON.stringify(body) })
      .then(function () { msgEl.className = "success-msg"; msgEl.textContent = "Guardado."; })
      .catch(function (err) { msgEl.className = "error"; msgEl.textContent = err.message; });
  });

  document.getElementById("kbForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!currentDetailTenantId) return;
    var msgEl = document.getElementById("kbError");
    var docs;
    try {
      docs = JSON.parse(document.getElementById("kbDocsInput").value);
    } catch (parseErr) {
      msgEl.className = "error";
      msgEl.textContent = "JSON inválido: " + parseErr.message;
      return;
    }
    msgEl.className = "";
    msgEl.textContent = "Cargando...";
    api("/tenants/" + currentDetailTenantId + "/kb", { method: "POST", body: JSON.stringify({ docs: docs }) })
      .then(function (data) {
        msgEl.className = "success-msg";
        msgEl.textContent = "Cargados " + data.count + " documentos.";
        document.getElementById("kbDocsInput").value = "";
      })
      .catch(function (err) { msgEl.className = "error"; msgEl.textContent = err.message; });
  });

  document.getElementById("authForm").addEventListener("submit", function (e) {
    e.preventDefault();
    localStorage.setItem(STORAGE_KEY, document.getElementById("adminKeyInput").value);
    api("/tenants").then(showApp).catch(function () { showAuthGate("Key inválida."); });
  });

  document.getElementById("logoutBtn").addEventListener("click", function () {
    localStorage.removeItem(STORAGE_KEY);
    showAuthGate();
  });

  document.getElementById("tenantForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var body = {
      id: document.getElementById("tenantId").value,
      name: document.getElementById("tenantName").value,
      verticalId: document.getElementById("tenantVertical").value,
    };
    api("/tenants", { method: "POST", body: JSON.stringify(body) })
      .then(function () {
        document.getElementById("tenantForm").reset();
        document.getElementById("tenantError").textContent = "";
        loadTenants();
      })
      .catch(function (err) { document.getElementById("tenantError").textContent = err.message; });
  });

  document.getElementById("channelForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var tenantId = document.getElementById("channelTenant").value;
    var body = {
      channel: document.getElementById("channelType").value,
      externalId: document.getElementById("channelExternalId").value,
    };
    var msgEl = document.getElementById("channelError");
    api("/tenants/" + tenantId + "/channels", { method: "POST", body: JSON.stringify(body) })
      .then(function (data) {
        document.getElementById("channelForm").reset();
        document.getElementById("channelType").value = "telegram";
        if (data.webhookRegistered) {
          msgEl.className = "success-msg";
          msgEl.textContent = "Canal vinculado y webhook registrado en Telegram.";
        } else if (data.webhookError) {
          msgEl.className = "error";
          msgEl.textContent = "Canal vinculado, pero el webhook falló: " + data.webhookError;
        } else {
          msgEl.className = "success-msg";
          msgEl.textContent = "Canal vinculado.";
        }
        loadTenants();
      })
      .catch(function (err) { msgEl.className = "error"; msgEl.textContent = err.message; });
  });

  if (adminKey()) { api("/tenants").then(showApp).catch(function () { showAuthGate(); }); }
  else { showAuthGate(); }
})();
</script>
</body>
</html>`;
