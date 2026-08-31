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

  /* --- Conectores (Agencia: canales disponibles con íconos reales) --- */
  .connector-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 12px; margin-bottom: 6px; }
  .connector-card {
    background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 14px 12px; display: flex; flex-direction: column; align-items: center; gap: 8px;
    cursor: pointer; transition: border-color 150ms ease, transform 150ms ease; text-align: center;
  }
  .connector-card:hover { border-color: var(--primary); transform: translateY(-2px); }
  .connector-card.selected { border-color: var(--primary); background: rgba(91, 141, 239, 0.1); }
  .connector-card.disabled { cursor: default; opacity: 0.45; }
  .connector-card.disabled:hover { border-color: var(--border); transform: none; }
  .connector-icon { width: 36px; height: 36px; flex-shrink: 0; }
  .connector-icon svg { width: 100%; height: 100%; }
  .connector-name { font-size: 0.82rem; font-weight: 600; }
  .connector-status { font-size: 0.68rem; color: var(--text-muted); }
  .channel-row-icon { width: 20px; height: 20px; flex-shrink: 0; display: inline-flex; }
  .channel-row-icon svg { width: 100%; height: 100%; }
  .channel-field-group { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 200px; }
  .channel-field-group label { font-size: 0.72rem; color: var(--text-muted); }

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
  .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .status-dot.ok { background: var(--accent); box-shadow: 0 0 6px var(--accent); animation: pulse-led 1.8s ease-in-out infinite; }
  .status-dot.necesita_atencion { background: var(--warning); box-shadow: 0 0 6px var(--warning); }
  .status-dot.error { background: var(--danger); box-shadow: 0 0 6px var(--danger); animation: pulse-led-danger 1.4s ease-in-out infinite; }
  .status-dot.idle { background: var(--accent); box-shadow: 0 0 4px var(--accent); }
  @keyframes pulse-led {
    0%, 100% { opacity: 1; box-shadow: 0 0 4px var(--accent); }
    50% { opacity: 0.45; box-shadow: 0 0 10px var(--accent); }
  }
  @keyframes pulse-led-danger {
    0%, 100% { opacity: 1; box-shadow: 0 0 4px var(--danger); }
    50% { opacity: 0.45; box-shadow: 0 0 10px var(--danger); }
  }

  .flow-canvas { position: relative; padding: 30px 10px 50px; min-width: max-content; }
  .flow-connectors { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; overflow: visible; }
  .flow-line { fill: none; stroke: #3A4A6B; stroke-width: 2; }
  .flow-line-solid { stroke-dasharray: 6 5; animation: flow-march 0.9s linear infinite; }
  .flow-line-dashed { stroke-dasharray: 3 6; opacity: 0.8; animation: flow-march 1.4s linear infinite; }
  @keyframes flow-march { to { stroke-dashoffset: -22; } }
  @media (prefers-reduced-motion: reduce) {
    .flow-line-solid, .flow-line-dashed { animation: none; }
  }
  .flow-main-row { display: flex; gap: 70px; align-items: center; position: relative; z-index: 2; }
  .flow-resource-row { display: flex; gap: 22px; flex-wrap: nowrap; margin-top: 90px; position: relative; z-index: 2; }
  .flow-node { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; min-width: 168px; flex-shrink: 0; }
  .flow-node.flow-node-main { border-color: var(--primary); }
  .flow-node-title { font-weight: 600; font-size: 0.88rem; display: flex; align-items: center; gap: 7px; }
  .flow-node-icon { width: 17px; height: 17px; flex-shrink: 0; color: var(--primary); }
  .flow-node-title .status-dot { margin-left: auto; }
  .flow-node-detail { font-size: 0.76rem; color: var(--text-muted); margin-top: 4px; line-height: 1.45; }
  .flow-node.flow-node-off { opacity: 0.4; }
  .flow-legend { display: flex; gap: 22px; font-size: 0.75rem; color: var(--text-muted); margin-top: 6px; align-items: center; flex-wrap: wrap; }
  .flow-legend-line { display: inline-block; width: 22px; height: 0; border-top: 2px solid var(--text-muted); vertical-align: middle; margin-right: 6px; }
  .flow-legend-line.dashed { border-top-style: dashed; }

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

  <p class="empty">Inicia sesión con tu usuario y contraseña.</p>
  <div class="panel">
    <form id="loginForm" style="margin:0">
      <input id="loginEmail" type="email" placeholder="Email" style="flex:1" required />
      <input id="loginPassword" type="password" placeholder="Contraseña" style="flex:1" required />
      <button type="submit">Entrar</button>
    </form>
  </div>
  <p class="error" id="loginError"></p>

  <p class="empty" style="margin-top:20px">— o, si eres Oscar y tienes la llave maestra —</p>
  <div class="panel">
    <form id="authForm" style="margin:0">
      <input id="adminKeyInput" type="password" placeholder="Admin API key" style="flex:1" />
      <button type="submit">Entrar con API key</button>
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
    <button class="nav-item" data-tab="usage" id="navUsage">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10"/><path d="M12 20V4"/><path d="M20 20v-7"/></svg>
      Uso
    </button>
    <button class="nav-item" data-tab="team" id="navTeam">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      Equipo
    </button>
    <button class="nav-item" data-tab="platform" id="navPlatform">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><circle cx="7" cy="6.5" r="0.6" fill="currentColor" stroke="none"/><circle cx="10" cy="6.5" r="0.6" fill="currentColor" stroke="none"/></svg>
      Plataforma
    </button>
  </nav>
  <button class="secondary" id="logoutBtn" style="margin-top:auto">Cerrar sesión</button>
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

      <h2 class="section-title">Flujo</h2>
      <p style="font-size:0.85rem;color:var(--text-muted);margin-top:0">Así está armado este bot ahora mismo — datos reales, no una maqueta.</p>
      <div class="panel" id="flowDiagram" style="overflow-x:auto">
        <div class="flow-canvas" id="flowCanvas">
          <svg class="flow-connectors" id="flowConnectors"></svg>
          <div class="flow-main-row" id="flowMainRow"></div>
          <div class="flow-resource-row" id="flowResourceRow"></div>
        </div>
        <div class="flow-legend">
          <span><span class="flow-legend-line solid"></span>flujo de mensajes</span>
          <span><span class="flow-legend-line dashed"></span>recursos del agente</span>
          <span><span class="status-dot ok" style="display:inline-block"></span>actividad en los últimos 5 min</span>
        </div>
      </div>

      <h2 class="section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.5"/><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L12.5 19.5"/></svg>
        Conectores
      </h2>
      <div class="panel">
        <p style="font-size:0.85rem;color:var(--text-muted);margin-top:0">Elige un canal y vincúlalo a este tenant.</p>
        <div class="connector-grid" id="connectorGrid"></div>
        <form id="channelForm" style="margin-top:16px;flex-wrap:wrap">
          <div id="channelFieldsContainer" style="display:flex;gap:8px;flex:1;flex-wrap:wrap"></div>
          <button type="submit">Vincular canal</button>
        </form>
        <p class="error" id="channelError"></p>
      </div>

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

      <div id="tenantCreateSection">
        <h2 class="section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
          Onboarding de cliente nuevo
        </h2>
        <div class="panel">
          <p style="font-size:0.85rem;color:var(--text-muted);margin-top:0">Elige el giro del negocio — define el tono del bot, qué puede hacer (agenda de citas o solo preguntas) y qué documentos de KB conviene subir después.</p>
          <div class="connector-grid" id="verticalGrid"></div>

          <form id="tenantForm" style="margin-top:16px">
            <input id="tenantId" placeholder="id (ej. vet-norte)" required />
            <input id="tenantName" placeholder="Nombre del negocio" required />
            <button type="submit">Crear cliente</button>
          </form>
          <div id="verticalKbHint" style="font-size:0.8rem;color:var(--text-muted);margin-top:8px"></div>
          <p class="error" id="tenantError"></p>
        </div>
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
        <h1 class="page-title">Uso y costos</h1>
      </div>
    </div>

    <h2 class="section-title">OpenAI</h2>
    <p style="font-size:0.85rem;color:var(--text-muted);margin-top:0">Costo ESTIMADO calculado sobre uso real (tokens, minutos de audio) con las tarifas públicas de OpenAI — no es el número exacto de tu factura, pero se calcula sobre datos reales, nunca inventados.</p>
    <div class="metrics" id="usageCostMetrics"></div>

    <div class="panel">
      <table id="usageTable">
        <thead><tr><th>Tenant</th><th>Requests</th><th>Prompt tokens</th><th>Completion tokens</th><th>Costo estimado (total)</th><th>Detalle</th></tr></thead>
        <tbody></tbody>
      </table>
      <p class="empty" id="usageEmpty" style="display:none">Sin uso registrado todavía.</p>
    </div>

    <h2 class="section-title">Cloudflare</h2>
    <p style="font-size:0.85rem;color:var(--text-muted);margin-top:0">Costo ESTIMADO de infraestructura (Workers, D1, Durable Objects, Vectorize) solo del mes en curso — Cloudflare no expone histórico completo por esta vía. El almacenamiento de Durable Objects es a nivel de TODA la cuenta (la API de Cloudflare no permite aislarlo por Worker).</p>
    <div class="metrics" id="cloudflareCostMetrics"></div>
    <div class="panel" id="cloudflareUsagePanel">
      <table id="cloudflareUsageTable">
        <thead><tr><th>Métrica</th><th>Uso</th><th>Costo estimado</th></tr></thead>
        <tbody></tbody>
      </table>
      <p class="empty" id="cloudflareUsageEmpty" style="display:none">Todavía no está conectado. Pídele a Claude Code que lo configure — necesita un API Token de tu cuenta de Cloudflare con permiso de Analytics.</p>
    </div>
  </section>

  <!-- Tab: Equipo (solo rol admin) -->
  <section class="tab-view" id="tab-team">
    <div class="topbar">
      <div>
        <div class="breadcrumb">Panel / Equipo</div>
        <h1 class="page-title">Equipo</h1>
      </div>
    </div>
    <p style="font-size:0.85rem;color:var(--text-muted)">Admin = acceso total. Operador = ve todo pero no puede crear tenants, rotar tokens de canal ni ver Uso.</p>
    <div class="panel">
      <table id="teamTable">
        <thead><tr><th>Email</th><th>Rol</th><th>Desde</th><th></th></tr></thead>
        <tbody></tbody>
      </table>
      <p class="empty" id="teamEmpty" style="display:none">Sin miembros del equipo todavía (aparte de la API key).</p>
    </div>

    <h2 class="section-title">Agregar miembro</h2>
    <div class="panel">
      <form id="teamForm">
        <input id="teamEmail" type="email" placeholder="Email" required style="flex:1" />
        <input id="teamPassword" type="password" placeholder="Contraseña (mín. 8 caracteres)" required style="flex:1" />
        <select id="teamRole">
          <option value="operador">Operador</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit">Crear</button>
      </form>
      <p class="error" id="teamError"></p>
    </div>
  </section>

  <!-- Tab: Plataforma (solo rol admin) -->
  <section class="tab-view" id="tab-platform">
    <div class="topbar">
      <div>
        <div class="breadcrumb">Panel / Plataforma</div>
        <h1 class="page-title">Plataforma</h1>
      </div>
    </div>
    <p style="font-size:0.85rem;color:var(--text-muted)">Credenciales compartidas por TODOS los tenants — se configuran una sola vez aquí, nunca por cliente. Los conectores de cada cliente (incluida la conexión real con su Facebook/Instagram) se hacen desde el detalle de cada tenant, en "Conectores".</p>

    <h2 class="section-title">
      <span style="width:16px;height:16px;display:inline-flex;vertical-align:-3px;margin-right:2px"><svg viewBox="0 0 24 24" fill="#1877F2" xmlns="http://www.w3.org/2000/svg"><path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/></svg></span>
      Meta (Facebook e Instagram)
    </h2>
    <div class="panel">
      <p style="font-size:0.85rem;color:var(--text-muted);margin-top:0">Pasos en <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener" style="color:var(--primary)">developers.facebook.com/apps</a>:</p>
      <ol style="font-size:0.85rem;color:var(--text-muted);padding-left:18px;margin-top:0">
        <li>Crear app → tipo "Negocio" → agregar el producto <strong>Messenger</strong>.</li>
        <li>En Messenger → Webhooks, pega la URL y el Verify Token de abajo, suscribe el campo <code>messages</code>.</li>
        <li>Vincula tu Instagram profesional a la misma Página (Configuración de la Página → Cuentas vinculadas).</li>
        <li>Copia el App ID y el App Secret (Configuración → Básica) y pégalos abajo.</li>
      </ol>

      <label style="font-size:0.8rem;color:var(--text-muted)">Webhook URL (pégala en Meta)</label>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <input id="platformWebhookUrl" readonly style="flex:1;font-family:'Fira Code',monospace;font-size:0.78rem" />
        <button type="button" class="secondary" id="copyWebhookUrlBtn">Copiar</button>
      </div>

      <form id="platformSettingsForm">
        <div class="channel-field-group">
          <label>Verify Token (pégalo en Meta, no lo cambies si ya lo pegaste)</label>
          <div style="display:flex;gap:8px">
            <input id="platformVerifyToken" style="flex:1;font-family:'Fira Code',monospace;font-size:0.8rem" />
            <button type="button" class="secondary" id="generateVerifyTokenBtn">Generar nuevo</button>
          </div>
        </div>
        <div class="channel-field-group">
          <label>App ID</label>
          <input id="platformMetaAppId" placeholder="id numérico de tu App de Meta" />
        </div>
        <div class="channel-field-group">
          <label>App Secret</label>
          <input id="platformMetaAppSecret" placeholder="app secret (Configuración → Básica)" />
        </div>
        <button type="submit">Guardar</button>
      </form>
      <p id="platformSettingsMsg"></p>
    </div>
  </section>

</main>

<script>
(function () {
  var STORAGE_KEY = "radamantisAdminKey";
  var STORAGE_ROLE_KEY = "radamantisAdminRole";
  var BOT_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 8V4"/><circle cx="12" cy="3" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="13.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="13.5" r="1.2" fill="currentColor" stroke="none"/><path d="M4 13H2M22 13h-2"/></svg>';
  var ARROW_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';

  function adminKey() { return localStorage.getItem(STORAGE_KEY) || ""; }
  // Rol "admin" implícito para quien entra con la API key maestra (acceso
  // total, siempre) — el rol real (admin/operador) solo distingue entre
  // personas que entraron con usuario/contraseña.
  function currentRole() { return localStorage.getItem(STORAGE_ROLE_KEY) || "admin"; }
  function isAdmin() { return currentRole() === "admin"; }

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
    applyRoleUI();
    loadAll();
  }

  // Etapa Agencia (Equipo/roles): esto es SOLO cosmético — la restricción
  // real está en el servidor (requireAdmin en admin/routes.ts). Ocultar
  // aquí evita que un operador vea controles que de todos modos rebotarían
  // con 403, no reemplaza la validación server-side.
  function applyRoleUI() {
    var admin = isAdmin();
    document.getElementById("navUsage").style.display = admin ? "" : "none";
    document.getElementById("navTeam").style.display = admin ? "" : "none";
    document.getElementById("navPlatform").style.display = admin ? "" : "none";
    document.getElementById("tenantCreateSection").style.display = admin ? "" : "none";
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
    });
  }

  // Agencia (onboarding de clientes, 12 giros): íconos genéricos propios
  // (no marcas — a diferencia de Conectores, aquí no hay un "producto real"
  // que representar) por tipo de negocio, mismo criterio de "SVG real, no
  // emoji" del resto del panel.
  var VERTICAL_ICONS = {
    veterinaria: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="10" r="1.8"/><circle cx="16" cy="10" r="1.8"/><circle cx="10.5" cy="5.5" r="1.4"/><circle cx="13.5" cy="5.5" r="1.4"/><path d="M12 13c-3 0-5 1.8-5 4 0 2 1.8 3 5 3s5-1 5-3c0-2.2-2-4-5-4z"/></svg>',
    estetica: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/></svg>',
    dentista: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3C9.5 3 7.5 4.8 7.5 7.2c0 1 .3 1.7.6 2.9.4 1.5.9 3.5.9 6.4 0 1 .4 1.5.9 1.5s.8-.5.9-1.4c.2-1 .6-1.5 1.2-1.5s1 .5 1.2 1.5c.1.9.5 1.4.9 1.4s.9-.5.9-1.5c0-2.9.5-4.9.9-6.4.3-1.2.6-1.9.6-2.9C16.5 4.8 14.5 3 12 3z"/></svg>',
    gimnasio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="10" width="3.5" height="4" rx="1"/><rect x="18.5" y="10" width="3.5" height="4" rx="1"/><rect x="7.5" y="8" width="2" height="8" rx="1"/><rect x="14.5" y="8" width="2" height="8" rx="1"/><path d="M9.5 12h5"/></svg>',
    restaurante: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2v7a2 2 0 0 0 4 0V2M9 2v20"/><path d="M17 2c-1.4 0-2.5 1.8-2.5 4.5S15.6 11 17 11v11"/></svg>',
    barberia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8.5 8.5L19 19M8.5 15.5L19 5"/></svg>',
    clinica: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
    cafeteria_panaderia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8z"/><path d="M17 9h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 2c0 1-1 1-1 2s1 1 1 2M12 2c0 1-1 1-1 2s1 1 1 2"/></svg>',
    tienda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    spa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c4 3.2 7 7.5 7 11.2A7 7 0 0 1 5 13.2C5 9.5 8 5.2 12 2z"/></svg>',
    inmobiliaria: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
    coach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg>',
    sandbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>'
  };

  var VERTICAL_BLURBS = {
    veterinaria: "Citas y consultas para mascotas.",
    estetica: "Estética y salón de belleza — citas de servicio.",
    dentista: "Citas dentales, tratamientos y seguros.",
    gimnasio: "Membresías, clases y horarios.",
    restaurante: "Reservación de mesa y menú.",
    barberia: "Citas de corte y barba.",
    clinica: "Citas médicas, especialidades y doctores.",
    cafeteria_panaderia: "Menú y pedidos — sin agenda.",
    tienda: "Productos, precios y políticas — sin agenda.",
    spa: "Tratamientos, paquetes y citas.",
    inmobiliaria: "Zonas, tipos de propiedad y visitas.",
    coach: "Sesiones, metodología y precios.",
    sandbox: "Genérico, sin KB ni handoff (pruebas)."
  };

  var selectedVerticalId = null;
  var VERTICAL_KB_SCHEMAS = {};

  function updateVerticalKbHint() {
    var hint = document.getElementById("verticalKbHint");
    var kb = VERTICAL_KB_SCHEMAS[selectedVerticalId] || [];
    hint.textContent = kb.length ? ("Documentos de KB sugeridos para subir después: " + kb.join(", ") + ".") : "";
  }

  function renderVerticalGrid(verticals) {
    var grid = document.getElementById("verticalGrid");
    grid.innerHTML = "";
    verticals.forEach(function (v) {
      if (v.verticalId === "sandbox") return; // interno, no es un giro real para onboarding
      VERTICAL_KB_SCHEMAS[v.verticalId] = v.kbSchema || [];
      var card = document.createElement("div");
      card.className = "connector-card" + (v.verticalId === selectedVerticalId ? " selected" : "");
      var icon = document.createElement("div");
      icon.className = "connector-icon";
      icon.innerHTML = VERTICAL_ICONS[v.verticalId] || VERTICAL_ICONS.sandbox;
      var name = document.createElement("div");
      name.className = "connector-name";
      name.textContent = v.displayName;
      var blurb = document.createElement("div");
      blurb.className = "connector-status";
      blurb.textContent = VERTICAL_BLURBS[v.verticalId] || "";
      card.appendChild(icon);
      card.appendChild(name);
      card.appendChild(blurb);
      card.addEventListener("click", function () {
        selectedVerticalId = v.verticalId;
        renderVerticalGrid(verticals);
        updateVerticalKbHint();
      });
      grid.appendChild(card);
    });
  }

  function loadVerticals() {
    return api("/verticals").then(function (data) {
      if (!selectedVerticalId && data.verticals.some(function (v) { return v.verticalId !== "sandbox"; })) {
        selectedVerticalId = data.verticals.filter(function (v) { return v.verticalId !== "sandbox"; })[0].verticalId;
      }
      renderVerticalGrid(data.verticals);
      updateVerticalKbHint();
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

  function formatUsd(n) {
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }

  // Agencia ("widgets de costo real en /admin"): todo lo que se muestra
  // aquí sale de GET /usage, que a su vez calcula sobre uso real
  // (usage_log) — nunca un número decorativo. "Estimado" en el copy es a
  // propósito: no es el número exacto de la factura de OpenAI.
  function loadUsage() {
    return api("/usage").then(function (data) {
      var metricsEl = document.getElementById("usageCostMetrics");
      metricsEl.innerHTML = "";
      metricsEl.appendChild(metricTile(formatUsd(data.totalEstimatedCostUsdThisMonth), "Estimado este mes"));
      metricsEl.appendChild(metricTile(formatUsd(data.totalEstimatedCostUsd), "Estimado total (histórico)"));

      var tbody = document.querySelector("#usageTable tbody");
      tbody.innerHTML = "";
      document.getElementById("usageEmpty").style.display = data.usage.length ? "none" : "block";
      data.usage.forEach(function (u) {
        var tr = document.createElement("tr");
        var detail = u.breakdown.map(function (b) {
          var extra = b.audioSeconds ? Math.round(b.audioSeconds) + "s audio" : b.promptTokens + "/" + b.completionTokens + " tok";
          return b.model + " (" + b.requests + "x, " + extra + ", " + formatUsd(b.estimatedCostUsd) + ")";
        }).join("; ");
        tr.innerHTML = "<td>" + u.tenant_id + "</td><td>" + u.requests + "</td><td>" +
          u.prompt_tokens + "</td><td>" + u.completion_tokens + "</td><td>" + formatUsd(u.estimatedCostUsd) + "</td>" +
          "<td class='mono' style='font-size:0.72rem;color:var(--text-muted)'>" + detail + "</td>";
        tbody.appendChild(tr);
      });
    });
  }

  // Agencia ("widgets de costo real en /admin", parte Cloudflare): igual
  // que loadUsage(), pero sobre GET /cloudflare-usage — si el token de
  // Cloudflare no está configurado o falla la consulta, se muestra el
  // mensaje de "no disponible" en vez de un número inventado.
  function loadCloudflareUsage() {
    return api("/cloudflare-usage").then(function (data) {
      var metricsEl = document.getElementById("cloudflareCostMetrics");
      metricsEl.innerHTML = "";
      metricsEl.appendChild(metricTile(formatUsd(data.totalEstimatedCostUsd), "Estimado este mes"));

      var tbody = document.querySelector("#cloudflareUsageTable tbody");
      tbody.innerHTML = "";
      document.getElementById("cloudflareUsageEmpty").style.display = "none";
      data.lines.forEach(function (l) {
        var tr = document.createElement("tr");
        tr.innerHTML = "<td>" + l.label + "</td><td>" + l.usage.toLocaleString("en-US") + " " + l.unit + "</td><td>" + formatUsd(l.estimatedCostUsd) + "</td>";
        tbody.appendChild(tr);
      });
    }).catch(function () {
      document.getElementById("cloudflareCostMetrics").innerHTML = "";
      document.querySelector("#cloudflareUsageTable tbody").innerHTML = "";
      document.getElementById("cloudflareUsageEmpty").style.display = "block";
    });
  }

  function loadAll() {
    loadVerticals().then(loadTenants).catch(function () {});
    loadHandoffs().catch(function () {});
    if (isAdmin()) {
      loadUsage().catch(function () {});
      loadCloudflareUsage();
      loadTeam().catch(function () {});
      loadPlatformSettings().catch(function () {});
    }
  }

  // Agencia (conectores, autoservicio real): App ID/Secret/Verify Token de
  // Meta se editan aquí — Oscar pidió explícitamente no depender de que
  // Claude los configure vía wrangler cada vez que arranca un canal nuevo.
  function loadPlatformSettings() {
    document.getElementById("platformWebhookUrl").value = window.location.origin + "/webhook/meta";
    return api("/platform-settings").then(function (data) {
      document.getElementById("platformVerifyToken").value = data.metaVerifyToken || "";
      document.getElementById("platformMetaAppId").value = data.metaAppId || "";
      document.getElementById("platformMetaAppSecret").value = data.metaAppSecret || "";
    });
  }

  document.getElementById("copyWebhookUrlBtn").addEventListener("click", function () {
    var input = document.getElementById("platformWebhookUrl");
    navigator.clipboard.writeText(input.value).then(function () {
      var btn = document.getElementById("copyWebhookUrlBtn");
      btn.textContent = "¡Copiado!";
      setTimeout(function () { btn.textContent = "Copiar"; }, 1500);
    });
  });

  document.getElementById("generateVerifyTokenBtn").addEventListener("click", function () {
    // Solo lo llena en el input — no se guarda hasta que se aprieta
    // "Guardar", para no invalidar por accidente el que ya está pegado
    // en el Webhook de Meta si el operador solo quería ver cómo se ve.
    var token = "rad-" + Array.from(crypto.getRandomValues(new Uint8Array(18))).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    document.getElementById("platformVerifyToken").value = token;
  });

  document.getElementById("platformSettingsForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var body = {
      metaVerifyToken: document.getElementById("platformVerifyToken").value,
      metaAppId: document.getElementById("platformMetaAppId").value,
      metaAppSecret: document.getElementById("platformMetaAppSecret").value,
    };
    var msgEl = document.getElementById("platformSettingsMsg");
    api("/platform-settings", { method: "PUT", body: JSON.stringify(body) })
      .then(function () { msgEl.className = "success-msg"; msgEl.textContent = "Guardado."; })
      .catch(function (err) { msgEl.className = "error"; msgEl.textContent = err.message; });
  });

  function loadTeam() {
    return api("/admin-users").then(function (data) {
      var tbody = document.querySelector("#teamTable tbody");
      tbody.innerHTML = "";
      document.getElementById("teamEmpty").style.display = data.users.length ? "none" : "block";
      data.users.forEach(function (u) {
        var tr = document.createElement("tr");
        var tdEmail = document.createElement("td");
        tdEmail.textContent = u.email;
        var tdRole = document.createElement("td");
        tdRole.textContent = u.role;
        var tdCreated = document.createElement("td");
        tdCreated.textContent = u.createdAt;
        var tdDelete = document.createElement("td");
        var delBtn = document.createElement("button");
        delBtn.className = "secondary";
        delBtn.textContent = "Quitar acceso";
        delBtn.onclick = function () {
          if (!confirm("¿Quitar el acceso de " + u.email + "?")) return;
          api("/admin-users/" + u.id, { method: "DELETE" }).then(loadTeam);
        };
        tdDelete.appendChild(delBtn);
        tr.appendChild(tdEmail);
        tr.appendChild(tdRole);
        tr.appendChild(tdCreated);
        tr.appendChild(tdDelete);
        tbody.appendChild(tr);
      });
    });
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
    return api("/tenants/" + tenantId).then(function (data) {
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
        var icon = document.createElement("span");
        icon.className = "channel-row-icon";
        icon.innerHTML = CHANNEL_ICONS[ch.channel] || "";
        var label = document.createElement("span");
        label.className = "bot-badge";
        label.textContent = (CHANNEL_CONFIG[ch.channel] || {}).name || ch.channel;
        // Facebook/Instagram necesitan mostrar también el routeKey (Page ID
        // / Instagram Business Account ID) — sirve para resolver el tenant
        // en el webhook COMPARTIDO de Meta, no es el token en sí.
        var routeKeyInput = null;
        // Facebook/Instagram se conectan por OAuth ahora (CHANNEL_CONFIG ya
        // no lista routeKey como campo manual), pero su route_key real
        // (Page ID / Instagram Business Account ID) sigue viviendo en la
        // fila — mostrarlo aquí sirve para inspeccionar/corregir a mano.
        var hasRouteKey = ch.channel === "facebook" || ch.channel === "instagram";
        if (hasRouteKey) {
          routeKeyInput = document.createElement("input");
          routeKeyInput.type = "text";
          routeKeyInput.value = ch.route_key || "";
          routeKeyInput.placeholder = "Page ID / IG Business Account ID";
          routeKeyInput.style.flex = "1";
          routeKeyInput.disabled = !isAdmin();
        }
        var tokenInput = document.createElement("input");
        tokenInput.type = "text";
        tokenInput.value = ch.external_id;
        tokenInput.style.flex = "1";
        // Rotar el token es solo-admin en el servidor (requireAdmin) — para
        // un operador el input queda de solo lectura, sin botón, en vez de
        // dejarlo enviar y recibir un 403.
        tokenInput.disabled = !isAdmin();
        row.appendChild(icon);
        row.appendChild(label);
        if (routeKeyInput) row.appendChild(routeKeyInput);
        row.appendChild(tokenInput);
        if (!isAdmin()) { channelsList.appendChild(row); return; }
        var updateBtn = document.createElement("button");
        updateBtn.type = "submit";
        updateBtn.className = "secondary";
        updateBtn.textContent = "Actualizar token";
        row.appendChild(updateBtn);
        row.addEventListener("submit", function (e) {
          e.preventDefault();
          var msgEl = document.getElementById("channelUpdateError");
          var putBody = { externalId: tokenInput.value };
          if (routeKeyInput) putBody.routeKey = routeKeyInput.value;
          api("/tenants/" + tenantId + "/channels/" + ch.channel, {
            method: "PUT",
            body: JSON.stringify(putBody),
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
        if (ch.channel === "web") {
          var snippetBtn = document.createElement("button");
          snippetBtn.type = "button";
          snippetBtn.className = "secondary";
          snippetBtn.textContent = "Copiar snippet";
          snippetBtn.onclick = function () {
            var snippet = '<script src="' + window.location.origin + '/widget.js" data-tenant="' + tenantId + '"><\\/script>';
            navigator.clipboard.writeText(snippet).then(function () {
              snippetBtn.textContent = "¡Copiado!";
              setTimeout(function () { snippetBtn.textContent = "Copiar snippet"; }, 1500);
            });
          };
          row.appendChild(snippetBtn);
        }
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
      loadFlow(tenantId);
      selectedChannel = "telegram";
      renderConnectorGrid();
      renderChannelFields();
      document.getElementById("channelError").textContent = "";
    });
  }

  var TOOL_LABELS = {
    searchKb: "searchKb",
    handoffHuman: "handoffHuman",
    checkAvailability: "checkAvailability",
    bookAppointment: "bookAppointment",
    recordAppointmentFeedback: "recordAppointmentFeedback",
  };

  // Un ícono por tipo de nodo (mismo estilo de línea que el resto del
  // panel: stroke, sin relleno) — nunca los íconos/logos de Forja, son
  // glifos genéricos (avión de papel, chip, base de datos, libro, lupa,
  // persona, calendario, estrella) para cada concepto real de Radamantis.
  var FLOW_ICONS = {
    canal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>',
    agente: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 8V4"/><circle cx="12" cy="3" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="13.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="13.5" r="1.2" fill="currentColor" stroke="none"/></svg>',
    respuesta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H8l-4 4V5z"/></svg>',
    modelo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M6 10H3M6 14H3M18 10h3M18 14h3M10 6V3M14 6V3M10 18v3M14 18v3"/></svg>',
    memoria: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3"/></svg>',
    conocimiento: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    searchKb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>',
    handoffHuman: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/></svg>',
    checkAvailability: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    bookAppointment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 14v4M10 16h4"/></svg>',
    recordAppointmentFeedback: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>',
  };

  // status: "ok" (verde, pulsa) | "necesita_atencion" (ámbar) | "error"
  // (rojo, pulsa) | null (sin LED — no hay una condición real que medir
  // para ese nodo, ej. Modelo/Memoria son configuración fija).
  function flowNode(iconKey, title, detailLines, opts) {
    opts = opts || {};
    var node = document.createElement("div");
    node.className = "flow-node" + (opts.main ? " flow-node-main" : "") + (opts.off ? " flow-node-off" : "");
    var titleEl = document.createElement("div");
    titleEl.className = "flow-node-title";
    var iconWrap = document.createElement("span");
    iconWrap.className = "flow-node-icon";
    iconWrap.innerHTML = FLOW_ICONS[iconKey] || "";
    titleEl.appendChild(iconWrap);
    var titleText = document.createElement("span");
    titleText.textContent = title;
    titleEl.appendChild(titleText);
    if (opts.status) {
      var dot = document.createElement("span");
      dot.className = "status-dot " + opts.status;
      titleEl.appendChild(dot);
    }
    node.appendChild(titleEl);
    detailLines.forEach(function (line) {
      var d = document.createElement("div");
      d.className = "flow-node-detail";
      d.textContent = line;
      node.appendChild(d);
    });
    return node;
  }

  // Dibuja las líneas del canvas (estilo n8n, animadas) DESPUÉS de que los
  // nodos ya están en el DOM — mide posiciones reales con
  // getBoundingClientRect en vez de coordenadas fijas, así se acomoda
  // solo sin importar cuántas tools tenga habilitadas cada tenant.
  function drawFlowConnectors(canvasEl, svgEl, connections) {
    var canvasRect = canvasEl.getBoundingClientRect();
    svgEl.setAttribute("width", canvasEl.scrollWidth);
    svgEl.setAttribute("height", canvasEl.scrollHeight);
    svgEl.innerHTML = "";
    connections.forEach(function (conn) {
      var fromRect = conn.from.getBoundingClientRect();
      var toRect = conn.to.getBoundingClientRect();
      var x1, y1, x2, y2, d;
      if (conn.direction === "horizontal") {
        x1 = fromRect.right - canvasRect.left;
        y1 = fromRect.top - canvasRect.top + fromRect.height / 2;
        x2 = toRect.left - canvasRect.left;
        y2 = toRect.top - canvasRect.top + toRect.height / 2;
        d = "M " + x1 + " " + y1 + " L " + x2 + " " + y2;
      } else {
        x1 = fromRect.left - canvasRect.left + fromRect.width / 2;
        y1 = fromRect.bottom - canvasRect.top;
        x2 = toRect.left - canvasRect.left + toRect.width / 2;
        y2 = toRect.top - canvasRect.top;
        var midY = (y1 + y2) / 2;
        d = "M " + x1 + " " + y1 + " C " + x1 + " " + midY + ", " + x2 + " " + midY + ", " + x2 + " " + y2;
      }
      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("class", "flow-line " + (conn.style === "dashed" ? "flow-line-dashed" : "flow-line-solid"));
      svgEl.appendChild(path);
    });
  }

  // Agencia ("Flujo"): canvas tipo n8n con los nodos REALES de Radamantis
  // (nunca los de Forja) — cada dato viene de GET /tenants/:id/flow, nada
  // decorativo ni inventado. 0 llamadas significa "no se ha usado todavía",
  // no "no existe". El LED de cada nodo refleja una condición real
  // verificable (canal conectado, KB con documentos, calendario
  // conectado) — nunca un estado inventado o siempre-verde.
  function loadFlow(tenantId) {
    var canvas = document.getElementById("flowCanvas");
    var svg = document.getElementById("flowConnectors");
    var mainRow = document.getElementById("flowMainRow");
    var resourceRow = document.getElementById("flowResourceRow");
    mainRow.innerHTML = "";
    resourceRow.innerHTML = "";
    svg.innerHTML = "";

    api("/tenants/" + tenantId + "/flow").then(function (f) {
      var channelLabel = f.channels.length ? f.channels.map(function (c) { return c.channel; }).join(", ") : "sin canal";
      var canalNode = flowNode("canal", "Canal", [channelLabel, f.conversationCount + " conversaciones"], {
        off: f.channels.length === 0,
        status: f.channels.length === 0 ? "error" : f.recentActivity ? "ok" : "idle",
      });
      var agenteNode = flowNode("agente", "Agente", ["Durable Object", "1 por conversación"], { main: true, status: f.agentStatus === "necesita_atencion" ? "necesita_atencion" : "ok" });
      var respuestaNode = flowNode("respuesta", "Respuesta", ["se envía por el canal de origen"], { status: "ok" });
      mainRow.appendChild(canalNode);
      mainRow.appendChild(agenteNode);
      mainRow.appendChild(respuestaNode);

      var resourceNodes = [];
      resourceNodes.push(flowNode("modelo", "Modelo", [f.model.provider, f.model.name], { status: "ok" }));
      resourceNodes.push(flowNode("memoria", "Memoria", [f.memory.store, "últimos " + f.memory.windowMessages + " mensajes"], { status: "ok" }));

      if (f.rag.enabled) {
        var ragOff = f.rag.documentCount === 0;
        resourceNodes.push(flowNode("conocimiento", "RAG / Conocimiento", [
          "umbral de relevancia " + f.rag.minRelevanceScore,
          f.rag.documentCount + " documento(s) indexado(s)",
          (f.toolCallCounts30d.searchKb || 0) + " llamadas/30d",
        ], { off: ragOff, status: ragOff ? "error" : "ok" }));
      }

      f.toolsEnabled.forEach(function (toolName) {
        if (toolName === "searchKb") return; // ya mostrado arriba como RAG/Conocimiento
        var isCalendarTool = toolName === "checkAvailability" || toolName === "bookAppointment" || toolName === "recordAppointmentFeedback";
        var off = isCalendarTool && !f.calendarConnected;
        var detail = [(f.toolCallCounts30d[toolName] || 0) + " llamadas/30d"];
        if (off) detail.push("calendario no conectado");
        resourceNodes.push(flowNode(toolName, TOOL_LABELS[toolName] || toolName, detail, { off: off, status: off ? "error" : "ok" }));
      });

      resourceNodes.forEach(function (n) { resourceRow.appendChild(n); });

      // Layout ya resuelto por flexbox — ahora sí se puede medir para trazar
      // las líneas reales entre los nodos.
      var connections = [
        { from: canalNode, to: agenteNode, direction: "horizontal", style: "solid" },
        { from: agenteNode, to: respuestaNode, direction: "horizontal", style: "solid" },
      ];
      resourceNodes.forEach(function (n) { connections.push({ from: agenteNode, to: n, direction: "vertical", style: "dashed" }); });
      drawFlowConnectors(canvas, svg, connections);
    }).catch(function (err) {
      mainRow.innerHTML = "";
      var errEl = document.createElement("p");
      errEl.className = "error";
      errEl.textContent = err.message;
      mainRow.appendChild(errEl);
    });
  }

  window.addEventListener("resize", function () {
    if (currentDetailTenantId && document.getElementById("tenantDetail").style.display !== "none") {
      loadFlow(currentDetailTenantId);
    }
  });

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
    localStorage.setItem(STORAGE_ROLE_KEY, "admin");
    api("/tenants").then(showApp).catch(function () { showAuthGate("Key inválida."); });
  });

  document.getElementById("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var errEl = document.getElementById("loginError");
    errEl.textContent = "";
    fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: document.getElementById("loginEmail").value,
        password: document.getElementById("loginPassword").value,
      }),
    })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (result) {
        if (!result.ok) { errEl.textContent = result.data.error || "Credenciales inválidas."; return; }
        localStorage.setItem(STORAGE_KEY, result.data.token);
        localStorage.setItem(STORAGE_ROLE_KEY, result.data.role);
        showApp();
      })
      .catch(function () { errEl.textContent = "No se pudo conectar."; });
  });

  document.getElementById("logoutBtn").addEventListener("click", function () {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_ROLE_KEY);
    showAuthGate();
  });

  document.getElementById("teamForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var msgEl = document.getElementById("teamError");
    var body = {
      email: document.getElementById("teamEmail").value,
      password: document.getElementById("teamPassword").value,
      role: document.getElementById("teamRole").value,
    };
    api("/admin-users", { method: "POST", body: JSON.stringify(body) })
      .then(function () {
        msgEl.className = "success-msg";
        msgEl.textContent = "Miembro agregado.";
        document.getElementById("teamForm").reset();
        loadTeam();
      })
      .catch(function (err) { msgEl.className = "error"; msgEl.textContent = err.message; });
  });

  document.getElementById("tenantForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var errEl = document.getElementById("tenantError");
    if (!selectedVerticalId) { errEl.textContent = "Elige un giro primero."; return; }
    var newTenantId = document.getElementById("tenantId").value;
    var body = {
      id: newTenantId,
      name: document.getElementById("tenantName").value,
      verticalId: selectedVerticalId,
    };
    var kbSuggestion = (VERTICAL_KB_SCHEMAS[selectedVerticalId] || []).join(", ");
    api("/tenants", { method: "POST", body: JSON.stringify(body) })
      .then(function () {
        document.getElementById("tenantForm").reset();
        errEl.textContent = "";
        loadTenants();
        // Onboarding: aterriza directo en el detalle del cliente nuevo —
        // los siguientes pasos (Conectores, KB) viven ahí, no en esta vista.
        openTenantDetail(newTenantId).then(function () {
          var channelMsg = document.getElementById("channelError");
          if (channelMsg) {
            channelMsg.className = "success-msg";
            channelMsg.textContent = "Cliente creado. Siguiente: vincula un canal aquí abajo" +
              (kbSuggestion ? " y sube su KB (sugerido: " + kbSuggestion + ")." : ".");
          }
        });
      })
      .catch(function (err) { errEl.textContent = err.message; });
  });

  // Agencia (conectores Facebook/Instagram): íconos REALES de cada
  // producto (Simple Icons, no logos de Forja) — Oscar pidió explícitamente
  // que se pudieran identificar de un vistazo. CHANNEL_CONFIG define los
  // campos que pide cada canal: Telegram/Sitio web necesitan uno solo,
  // Facebook/Instagram necesitan dos (el Page Access Token que se le pasa
  // a ChannelProvider.sendMessage, y un routeKey — Page ID o Instagram
  // Business Account ID — que solo sirve para resolver el tenant cuando
  // llega un evento al webhook COMPARTIDO de Meta, ver src/index.ts).
  var CHANNEL_ICONS = {
    telegram: '<svg viewBox="0 0 24 24" fill="#26A5E4" xmlns="http://www.w3.org/2000/svg"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>',
    web: '<svg viewBox="0 0 24 24" fill="none" stroke="#5B8DEF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="#1877F2" xmlns="http://www.w3.org/2000/svg"><path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="radIgGrad" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#FFDC80"/><stop offset="25%" stop-color="#FCAF45"/><stop offset="50%" stop-color="#E1306C"/><stop offset="75%" stop-color="#C13584"/><stop offset="100%" stop-color="#5851DB"/></linearGradient></defs><path fill="url(#radIgGrad)" d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="#25D366" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>'
  };

  var CHANNEL_CONFIG = {
    telegram: {
      name: "Telegram",
      fields: [{ key: "externalId", label: "Bot token", placeholder: "token del bot", hint: "El bot token que te da @BotFather en Telegram." }],
    },
    web: {
      name: "Sitio web",
      fields: [{ key: "externalId", label: "Dominio permitido", placeholder: "https://minegocio.com", hint: "El dominio exacto donde vas a poner el widget — es lo único que autoriza las peticiones, debe coincidir exacto." }],
    },
    facebook: {
      name: "Facebook Messenger",
      oauth: true,
      oauthNote: "Selecciona el tenant y conecta con Facebook — detecta tu Página automáticamente (y tu Instagram, si está vinculado a la misma Página).",
      fields: [],
    },
    instagram: {
      name: "Instagram",
      oauth: true,
      oauthNote: "Instagram se conecta con el mismo botón de Facebook — tu cuenta debe estar vinculada a una Página. Si ya conectaste Facebook para este tenant y tu Instagram estaba vinculado, ya quedó conectado también.",
      fields: [],
    },
    whatsapp: { name: "WhatsApp", comingSoon: true, fields: [] },
  };

  var CHANNEL_ORDER = ["telegram", "web", "facebook", "instagram", "whatsapp"];
  var selectedChannel = "telegram";

  function renderConnectorGrid() {
    var grid = document.getElementById("connectorGrid");
    grid.innerHTML = "";
    CHANNEL_ORDER.forEach(function (channel) {
      var cfg = CHANNEL_CONFIG[channel];
      var card = document.createElement("div");
      card.className = "connector-card" + (channel === selectedChannel ? " selected" : "") + (cfg.comingSoon ? " disabled" : "");
      var icon = document.createElement("div");
      icon.className = "connector-icon";
      icon.innerHTML = CHANNEL_ICONS[channel];
      var name = document.createElement("div");
      name.className = "connector-name";
      name.textContent = cfg.name;
      card.appendChild(icon);
      card.appendChild(name);
      if (cfg.comingSoon) {
        var status = document.createElement("div");
        status.className = "connector-status";
        status.textContent = "Próximamente";
        card.appendChild(status);
      } else {
        card.addEventListener("click", function () {
          selectedChannel = channel;
          renderConnectorGrid();
          renderChannelFields();
        });
      }
      grid.appendChild(card);
    });
  }

  function renderChannelFields() {
    var container = document.getElementById("channelFieldsContainer");
    container.innerHTML = "";
    var cfg = CHANNEL_CONFIG[selectedChannel];
    var submitBtn = document.querySelector("#channelForm button[type=submit]");

    // Agencia (conectores Facebook/Instagram, autoservicio real): en vez de
    // pedir Page ID/token a mano, un botón abre el login real de Facebook
    // — el callback (index.ts) detecta la Página y el Instagram vinculado
    // solo. Nada que pegar, nada que buscar en el Graph API Explorer.
    if (cfg.oauth) {
      submitBtn.style.display = "none";
      var note = document.createElement("p");
      note.style.cssText = "font-size:0.8rem;color:var(--text-muted);margin:2px 0 8px;flex-basis:100%";
      note.textContent = cfg.oauthNote;
      var connectBtn = document.createElement("button");
      connectBtn.type = "button";
      connectBtn.textContent = "Conectar con Facebook";
      connectBtn.onclick = function () {
        var msgEl = document.getElementById("channelError");
        if (!currentDetailTenantId) { msgEl.className = "error"; msgEl.textContent = "Abre un tenant primero."; return; }
        msgEl.textContent = "";
        api("/tenants/" + currentDetailTenantId + "/channels/meta/connect-url").then(function (data) {
          window.open(data.url, "_blank");
        }).catch(function (err) { msgEl.className = "error"; msgEl.textContent = err.message; });
      };
      container.appendChild(note);
      container.appendChild(connectBtn);
      return;
    }

    submitBtn.style.display = "";
    cfg.fields.forEach(function (field) {
      var group = document.createElement("div");
      group.className = "channel-field-group";
      var label = document.createElement("label");
      label.textContent = field.label;
      var input = document.createElement("input");
      input.dataset.fieldKey = field.key;
      input.placeholder = field.placeholder;
      input.title = field.hint;
      input.required = true;
      group.appendChild(label);
      group.appendChild(input);
      container.appendChild(group);
    });
  }

  renderConnectorGrid();
  renderChannelFields();

  document.getElementById("channelForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (CHANNEL_CONFIG[selectedChannel].oauth) return;
    var msgEl = document.getElementById("channelError");
    if (!currentDetailTenantId) { msgEl.className = "error"; msgEl.textContent = "Abre un tenant primero."; return; }
    var tenantId = currentDetailTenantId;
    var body = { channel: selectedChannel };
    document.querySelectorAll("#channelFieldsContainer input").forEach(function (input) {
      body[input.dataset.fieldKey] = input.value;
    });
    api("/tenants/" + tenantId + "/channels", { method: "POST", body: JSON.stringify(body) })
      .then(function (data) {
        var channelType = selectedChannel;
        document.getElementById("channelForm").reset();
        if (channelType === "web") {
          var snippet = '<script src="' + window.location.origin + '/widget.js" data-tenant="' + tenantId + '"><\\/script>';
          msgEl.className = "success-msg";
          msgEl.innerHTML = "Canal vinculado. Pega esto antes de <code>&lt;/body&gt;</code> en el sitio del negocio:<br><code style='display:block;margin-top:6px;word-break:break-all;'></code>";
          msgEl.querySelector("code:last-child").textContent = snippet;
        } else if (data.webhookRegistered) {
          msgEl.className = "success-msg";
          msgEl.textContent = "Canal vinculado y webhook registrado.";
        } else if (data.webhookError) {
          msgEl.className = "error";
          msgEl.textContent = "Canal vinculado, pero el webhook falló: " + data.webhookError;
        } else {
          msgEl.className = "success-msg";
          msgEl.textContent = "Canal vinculado.";
        }
        openTenantDetail(tenantId);
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
