// Etapa 10 (consola del cliente, D10): superficie separada del panel de
// super-admin — identidad visual propia (verde esmeralda + ámbar, tipografía
// Poppins/Open Sans), deliberadamente distinta de la paleta Slate/Indigo del
// panel de Oscar y de la paleta terracota del bot — nunca copiada de Forja.
// Consume exclusivamente /api/client/* (auth por sesión propia, no
// ADMIN_API_KEY). Cada cliente ve solo los datos de SU tenant_id.
export const CONSOLE_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Radamantis · Mi consola</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&family=Poppins:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #F7FAF9;
    --surface: #FFFFFF;
    --surface-alt: #F0F7F4;
    --border: #E3EDE8;
    --primary: #0E9F6E;
    --primary-dark: #0B7A56;
    --primary-soft: #E3F6EC;
    --accent: #F59E0B;
    --text: #10241D;
    --text-muted: #5B6B64;
    --danger: #DC2626;
    --danger-bg: #FEF2F2;
    --ok: #16A34A;
    --ok-bg: #ECFDF5;
    --warn-bg: #FFFBEB;
    --radius: 14px;
    --radius-sm: 10px;
    --shadow-sm: 0 1px 2px rgba(16,36,29,0.05);
    --shadow-md: 0 4px 16px rgba(16,36,29,0.08);
    --shadow-lg: 0 16px 40px rgba(16,36,29,0.14);
  }
  @media (prefers-reduced-motion: reduce) {
    * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font-family: "Open Sans", sans-serif; font-size: 15px; line-height: 1.6; -webkit-font-smoothing: antialiased; }
  h1, h2, h3 { font-family: "Poppins", sans-serif; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
  button { font-family: inherit; cursor: pointer; }
  input { font-family: inherit; }
  svg { display: block; }
  :focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

  #authGate { max-width: 420px; margin: 8vh auto; padding: 40px 20px; background: radial-gradient(circle at 25% 0%, color-mix(in srgb, var(--primary) 9%, transparent), transparent 60%); border-radius: 28px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 26px; box-shadow: var(--shadow-sm); }
  #authGate .card { box-shadow: var(--shadow-lg); padding: 32px 28px; }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; justify-content: center; }
  .brand .dot { width: 12px; height: 12px; border-radius: 50%; background: var(--primary); flex-shrink: 0; }
  #authGate .brand .dot { width: 42px; height: 42px; background: linear-gradient(135deg, var(--primary), var(--primary-dark)); box-shadow: var(--shadow-md); }
  .brand span { font-family: "Poppins", sans-serif; font-weight: 700; font-size: 1.3rem; }
  .brand img.brand-logo { width: 26px; height: 26px; border-radius: 7px; object-fit: cover; flex-shrink: 0; box-shadow: var(--shadow-sm); }
  label { display: block; font-size: 0.82rem; font-weight: 600; color: var(--text-muted); margin: 16px 0 6px; }
  input[type="email"], input[type="password"], input[type="text"], input[type="time"], textarea, select {
    width: 100%; padding: 10px 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.95rem; background: #fff; color: var(--text); transition: border-color 0.15s, box-shadow 0.15s;
  }
  input:focus, textarea:focus, select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent); }
  .btn-primary { background: var(--primary); color: #fff; border: none; border-radius: var(--radius-sm); padding: 11px 20px; font-weight: 600; font-size: 0.95rem; box-shadow: var(--shadow-sm); transition: background 0.15s, box-shadow 0.15s, transform 0.1s; }
  .btn-primary:hover { background: var(--primary-dark); box-shadow: var(--shadow-md); }
  .btn-primary:active { transform: scale(0.98); }
  .btn-secondary { background: #fff; color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 9px 15px; font-size: 0.9rem; transition: border-color 0.15s, background 0.15s; }
  .btn-secondary:hover { border-color: var(--primary); background: var(--surface-alt); }
  .btn-danger { background: var(--danger-bg); color: var(--danger); border: 1px solid #FCA5A5; border-radius: var(--radius-sm); padding: 8px 13px; font-size: 0.85rem; transition: background 0.15s; }
  .btn-danger:hover { background: #FEE2E2; }
  .error { color: var(--danger); font-size: 0.85rem; margin-top: 10px; min-height: 1.2em; }
  .success-msg { color: var(--ok); font-size: 0.85rem; margin-top: 10px; min-height: 1.2em; }

  .shell { display: none; grid-template-columns: 232px 1fr; min-height: 100vh; }
  .sidebar { background: var(--surface); border-right: 1px solid var(--border); padding: 22px 16px; display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
  .sidebar .brand { justify-content: flex-start; margin-bottom: 6px; padding-left: 4px; }
  .tenant-name { font-size: 0.83rem; color: var(--text-muted); padding: 0 4px 18px; border-bottom: 1px solid var(--border); margin-bottom: 14px; }
  .nav-section { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); opacity: 0.7; padding: 14px 12px 6px; }
  .nav-section:first-of-type { padding-top: 0; }
  .nav-item { display: flex; align-items: center; gap: 11px; padding: 10px 12px; border-radius: var(--radius-sm); border: none; background: none; color: var(--text-muted); font-size: 0.92rem; font-weight: 500; text-align: left; width: 100%; margin-bottom: 2px; transition: background 0.15s, color 0.15s, box-shadow 0.15s; }
  .nav-item:hover { background: var(--surface-alt); color: var(--text); }
  .nav-item.active { background: var(--primary-soft); color: var(--primary-dark); font-weight: 600; box-shadow: inset 3px 0 0 var(--primary); }
  .nav-item svg { width: 18px; height: 18px; flex-shrink: 0; }
  .sidebar-footer { margin-top: auto; padding-top: 16px; border-top: 1px solid var(--border); }

  .main { padding: 30px 34px; overflow-x: hidden; max-width: 1120px; }
  .tab-view { display: none; }
  .tab-view.active { display: block; animation: viewIn 0.25s ease; }
  @keyframes viewIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .page-title { font-size: 1.5rem; margin-bottom: 4px; }
  .page-sub { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 24px; }

  .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-bottom: 26px; }
  .metric { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; box-shadow: var(--shadow-sm); transition: box-shadow 0.15s, transform 0.15s; }
  .metric:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
  .metric .value { font-family: "Poppins", sans-serif; font-size: 1.9rem; font-weight: 700; }
  .metric .label { font-size: 0.8rem; color: var(--text-muted); margin-top: 4px; }

  .panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 22px; margin-bottom: 20px; box-shadow: var(--shadow-sm); }
  .panel h3 { font-size: 1.02rem; margin-bottom: 16px; }

  .chart { display: flex; align-items: flex-end; gap: 10px; height: 170px; padding-top: 10px; }
  .chart-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; height: 100%; justify-content: flex-end; }
  .chart-bars { display: flex; gap: 4px; align-items: flex-end; height: 136px; width: 100%; justify-content: center; }
  .chart-bar { width: 38%; border-radius: 5px 5px 2px 2px; min-height: 3px; transition: opacity 0.15s; }
  .chart-bar.in { background: linear-gradient(180deg, var(--primary), var(--primary-dark)); }
  .chart-bar.out { background: linear-gradient(180deg, var(--accent), #D97706); }
  .chart-col:hover .chart-bar { opacity: 0.85; }
  .chart-col .day-label { font-size: 0.72rem; color: var(--text-muted); font-weight: 600; text-transform: capitalize; }
  .chart-legend { display: flex; gap: 18px; font-size: 0.8rem; color: var(--text-muted); margin-top: 12px; }
  .chart-legend span { display: inline-flex; align-items: center; gap: 7px; }
  .legend-dot { width: 9px; height: 9px; border-radius: 50%; }

  table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  th { text-align: left; color: var(--text-muted); font-weight: 700; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.04em; padding: 8px 10px; border-bottom: 1px solid var(--border); }
  td { padding: 11px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tbody tr { transition: background 0.12s; }
  tbody tr:hover td { background: var(--surface-alt); }
  .mono { font-family: "Fira Code", monospace; font-size: 0.82rem; color: var(--text-muted); }
  .empty { color: var(--text-muted); font-size: 0.88rem; padding: 14px 0; text-align: center; }

  .status-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 8px; }
  .status-ok .status-dot { background: var(--ok); box-shadow: 0 0 0 3px var(--ok-bg); }
  .status-warn .status-dot { background: var(--accent); box-shadow: 0 0 0 3px var(--warn-bg); }
  .health-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border); }
  .health-row:last-child { border-bottom: none; }
  .health-label { font-weight: 500; }
  .health-value { font-size: 0.85rem; color: var(--text-muted); }

  .badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 999px; font-size: 0.72rem; font-weight: 700; }
  .badge::before { content: ""; width: 6px; height: 6px; border-radius: 50%; }
  .badge.paused { background: var(--danger-bg); color: var(--danger); }
  .badge.paused::before { background: var(--danger); }
  .badge.active { background: var(--ok-bg); color: var(--ok); }
  .badge.active::before { background: var(--ok); }
  .badge.muted { background: var(--surface-alt); color: var(--text-muted); }
  .badge.muted::before { background: var(--text-muted); }

  .conv-layout { display: grid; grid-template-columns: 320px 1fr; gap: 18px; align-items: start; }
  .conv-list { max-height: 640px; overflow-y: auto; }
  .conv-list-item { padding: 13px; border-radius: var(--radius-sm); border: 1px solid transparent; cursor: pointer; margin-bottom: 5px; transition: background 0.12s, border-color 0.12s; }
  .conv-list-item:hover { background: var(--surface-alt); }
  .conv-list-item.selected { border-color: var(--primary); background: var(--primary-soft); }
  .conv-list-item .top { display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 600; }
  .conv-list-item .preview { font-size: 0.8rem; color: var(--text-muted); margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .conv-detail { min-height: 300px; }
  .composer { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border); }
  .composer textarea { resize: vertical; }
  .conv-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .msg-list { max-height: 480px; overflow-y: auto; display: flex; flex-direction: column; gap: 11px; padding-right: 6px; }
  .msg { max-width: 75%; padding: 10px 14px; border-radius: 16px; font-size: 0.88rem; box-shadow: var(--shadow-sm); }
  .msg.user { align-self: flex-start; background: var(--surface-alt); border-bottom-left-radius: 4px; }
  .msg.assistant { align-self: flex-end; background: var(--primary); color: #fff; border-bottom-right-radius: 4px; }
  .msg .meta { font-size: 0.68rem; opacity: 0.75; margin-top: 4px; }

  @media (max-width: 800px) {
    .shell { grid-template-columns: 1fr; }
    .sidebar { flex-direction: row; align-items: center; overflow-x: auto; overflow-y: visible; height: auto; top: 0; z-index: 10; gap: 10px; padding: 12px 14px; border-right: none; border-bottom: 1px solid var(--border); }
    .sidebar .brand, .sidebar .tenant-name, .nav-section { display: none; }
    .nav-item { width: auto; white-space: nowrap; margin-bottom: 0; }
    .nav-item.active { box-shadow: inset 0 -3px 0 var(--primary); }
    .sidebar-footer { margin-top: 0; margin-left: auto; border-top: none; padding-top: 0; flex-shrink: 0; }
    .sidebar-footer button { width: auto; white-space: nowrap; }
    .conv-layout { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>

<div id="authGate">
  <div class="brand"><span class="dot"></span><span>Radamantis</span></div>
  <div class="card">
    <h2 style="margin-bottom:4px;">Mi consola</h2>
    <p class="page-sub" style="margin-bottom:0;">Entra con el correo y contraseña que te dio tu proveedor.</p>
    <form id="loginForm">
      <label>Correo</label>
      <input type="email" id="loginEmail" required />
      <label>Contraseña</label>
      <input type="password" id="loginPassword" required />
      <div style="margin-top:18px;"><button class="btn-primary" type="submit" style="width:100%;">Entrar</button></div>
      <div class="error" id="loginError"></div>
    </form>
  </div>
</div>

<div class="shell" id="shell">
  <aside class="sidebar">
    <div class="brand" id="sidebarBrand"><span class="dot"></span><span>Radamantis</span></div>
    <div class="tenant-name" id="tenantNameLabel"></div>
    <div class="nav-section">Actividad</div>
    <button class="nav-item active" data-tab="resumen">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="12" width="4" height="8" rx="1"/><rect x="10" y="7" width="4" height="13" rx="1"/><rect x="17" y="3" width="4" height="17" rx="1"/></svg>
      Resumen
    </button>
    <button class="nav-item" data-tab="citas">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
      Citas
    </button>
    <button class="nav-item" data-tab="clientes">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/></svg>
      Clientes
    </button>
    <button class="nav-item" data-tab="conversaciones">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v11H8l-4 4V5z"/></svg>
      Conversaciones
    </button>
    <div class="nav-section">Contenido</div>
    <button class="nav-item" data-tab="conocimiento">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
      Conocimiento
    </button>
    <button class="nav-item" data-tab="catalogo">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>
      Catálogo
    </button>
    <div class="nav-section">Configuración</div>
    <button class="nav-item" data-tab="salud">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12h4l2-7 4 14 2-7h4"/></svg>
      Salud
    </button>
    <button class="nav-item" data-tab="mejoras">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
      Mejoras
    </button>
    <button class="nav-item" data-tab="marca">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
      Mi marca
    </button>
    <div class="sidebar-footer">
      <button class="btn-secondary" id="logoutBtn" style="width:100%;">Cerrar sesión</button>
    </div>
  </aside>

  <main class="main">

    <section class="tab-view active" id="tab-resumen">
      <h1 class="page-title">Resumen de hoy</h1>
      <p class="page-sub">Actividad de tu bot en las últimas 24 horas.</p>
      <div class="metrics" id="todayMetrics"></div>
      <div class="panel">
        <h3>Actividad — últimos 7 días</h3>
        <div class="chart" id="weekChart"></div>
        <div class="chart-legend">
          <span><span class="legend-dot" style="background:var(--primary)"></span>Mensajes de clientes</span>
          <span><span class="legend-dot" style="background:var(--accent)"></span>Respuestas del bot</span>
        </div>
      </div>
    </section>

    <section class="tab-view" id="tab-citas">
      <h1 class="page-title">Citas</h1>
      <p class="page-sub">Próximas citas y las más recientes ya pasadas.</p>
      <div class="panel">
        <h3 id="currentMonthTitle">Este mes</h3>
        <table id="currentMonthTable"><thead><tr><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Contacto</th><th>Motivo</th><th>Con</th><th>Estado</th></tr></thead><tbody></tbody></table>
        <p class="empty" id="currentMonthEmpty" style="display:none;">Sin citas este mes.</p>
      </div>
      <div class="panel">
        <h3>Próximas</h3>
        <table id="upcomingTable"><thead><tr><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Contacto</th><th>Motivo</th><th>Con</th></tr></thead><tbody></tbody></table>
        <p class="empty" id="upcomingEmpty" style="display:none;">No hay citas próximas.</p>
      </div>
      <div class="panel">
        <h3>Recientes</h3>
        <table id="pastTable"><thead><tr><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Contacto</th><th>Motivo</th><th>Con</th></tr></thead><tbody></tbody></table>
        <p class="empty" id="pastEmpty" style="display:none;">Sin historial todavía.</p>
      </div>
    </section>

    <section class="tab-view" id="tab-clientes">
      <h1 class="page-title">Clientes</h1>
      <p class="page-sub">Cada hilo de conversación es un cliente potencial — su nombre solo aparece si ya agendó una cita.</p>
      <div class="panel">
        <table id="clientsTable"><thead><tr><th>Cliente</th><th>Canal</th><th>Contacto</th><th>Mensajes</th><th>Última actividad</th></tr></thead><tbody></tbody></table>
        <p class="empty" id="clientsEmpty" style="display:none;">Todavía no hay conversaciones.</p>
      </div>
    </section>

    <section class="tab-view" id="tab-conversaciones">
      <h1 class="page-title">Conversaciones</h1>
      <p class="page-sub">Pausa una conversación para que el bot deje de responder y puedas tomarla tú directamente.</p>
      <div class="conv-layout">
        <div class="panel conv-list" id="conversationList"></div>
        <div class="panel conv-detail" id="conversationDetail">
          <p class="empty">Selecciona una conversación de la izquierda.</p>
        </div>
      </div>
    </section>

    <section class="tab-view" id="tab-conocimiento">
      <div class="topbar" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <h1 class="page-title">Conocimiento</h1>
          <p class="page-sub">Lo que tu bot sabe de tu negocio. Cada documento se indexa al guardar y el bot lo usa de inmediato.</p>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;">
          <button class="btn-secondary" id="kbReindexBtn">Reindexar todo</button>
          <button class="btn-primary" id="kbNewBtn">+ Nuevo documento</button>
        </div>
      </div>
      <p class="error" id="kbReindexMsg"></p>

      <div class="panel" id="kbDocsPanel"></div>
      <p class="empty" id="kbDocsEmpty" style="display:none;">Todavía no tienes documentos. Agrega el primero con "Nuevo documento".</p>

      <div class="panel" id="kbFormPanel" style="display:none;">
        <h3 id="kbFormTitle">Nuevo documento</h3>
        <form id="kbForm">
          <input type="text" id="kbTitleInput" placeholder="Título (ej. Preguntas Frecuentes)" style="width:100%;" required />
          <textarea id="kbContentInput" placeholder="Contenido — lo que el bot debe saber sobre esto..." style="width:100%;min-height:160px;margin-top:10px;"></textarea>
          <div style="margin-top:10px;display:flex;gap:8px;">
            <button class="btn-primary" type="submit">Guardar</button>
            <button class="btn-secondary" type="button" id="kbFormCancel">Cancelar</button>
          </div>
          <div class="error" id="kbFormMsg"></div>
        </form>
      </div>
    </section>

    <section class="tab-view" id="tab-catalogo">
      <div class="topbar" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <h1 class="page-title">Catálogo</h1>
          <p class="page-sub">Productos, propiedades o platillos que tu bot puede buscar y mostrar con foto cuando un cliente pregunte. Solo aplica si tu negocio lo usa (ej. inmobiliaria, restaurante, panadería, tienda) — si no, puedes ignorar esta pestaña.</p>
        </div>
        <button class="btn-primary" id="catalogNewBtn" style="flex-shrink:0;">+ Nuevo item</button>
      </div>

      <div class="panel" id="catalogPanel"></div>
      <p class="empty" id="catalogEmpty" style="display:none;">Todavía no tienes items en tu catálogo. Agrega el primero con "Nuevo item".</p>

      <div class="panel" id="catalogFormPanel" style="display:none;">
        <h3 id="catalogFormTitle">Nuevo item</h3>
        <form id="catalogForm">
          <input type="text" id="catalogTitleInput" placeholder="Nombre (ej. Departamento en Polanco)" style="width:100%;" required />
          <textarea id="catalogDescriptionInput" placeholder="Descripción — lo que el bot debe decir sobre esto..." style="width:100%;min-height:100px;margin-top:10px;"></textarea>
          <input type="text" id="catalogPriceInput" placeholder="Precio (opcional, ej. $2,500,000 MXN)" style="width:100%;margin-top:10px;" />
          <input type="text" id="catalogPhotoUrlInput" placeholder="URL de una foto (opcional)" style="width:100%;margin-top:10px;" />
          <div style="margin-top:10px;display:flex;gap:8px;">
            <button class="btn-primary" type="submit">Guardar</button>
            <button class="btn-secondary" type="button" id="catalogFormCancel">Cancelar</button>
          </div>
          <div class="error" id="catalogFormMsg"></div>
        </form>
      </div>
    </section>

    <section class="tab-view" id="tab-salud">
      <h1 class="page-title">Salud</h1>
      <p class="page-sub">Estado de conexión de tu bot — no es un monitoreo en vivo, es lo último que sabemos.</p>
      <div class="panel" id="healthPanel"></div>

      <div class="panel">
        <h3>Alertas</h3>
        <p class="page-sub" style="margin-bottom:14px;">Recibe un aviso por Telegram cuando un cliente pida hablar con alguien o suene molesto.</p>
        <div id="alertSettingsPanel"></div>
      </div>

      <div class="panel">
        <h3>Reseñas</h3>
        <p class="page-sub" style="margin-bottom:14px;">Cuando un cliente califica su cita con 4 o 5, el bot le comparte este link para pedirle una reseña. Sin un link aquí, solo agradece.</p>
        <form id="reviewLinkForm">
          <input type="text" id="reviewLinkInput" placeholder="https://g.page/r/tu-negocio/review" style="width:100%;" />
          <div style="margin-top:10px;"><button class="btn-primary" type="submit">Guardar</button></div>
          <div class="error" id="reviewLinkMsg"></div>
        </form>
      </div>

      <div class="panel">
        <h3>Reenganche de leads fríos</h3>
        <p class="page-sub" style="margin-bottom:14px;">Si un cliente pregunta algo y no vuelve a escribir en unas horas, el bot le manda un mensaje de seguimiento (hasta 2 veces). Apagado por default.</p>
        <label style="display:flex;align-items:center;gap:10px;font-size:0.92rem;cursor:pointer;">
          <input type="checkbox" id="leadReengagementToggle" style="width:auto;" />
          Activar reenganche automático
        </label>
        <div class="error" id="leadReengagementMsg"></div>
      </div>

      <div class="panel">
        <h3>Reanudar el bot automáticamente</h3>
        <p class="page-sub" style="margin-bottom:14px;">Cuando pausas una conversación (o el bot la pausa porque el cliente pidió un humano), normalmente se queda así hasta que la reanudes tú. Si activas esto, el bot vuelve a responder solo después de 3 horas. Apagado por default — actívalo solo si prefieres que el bot retome la conversación en vez de quedarse pausada indefinidamente.</p>
        <label style="display:flex;align-items:center;gap:10px;font-size:0.92rem;cursor:pointer;">
          <input type="checkbox" id="autoResumeToggle" style="width:auto;" />
          Reanudar automáticamente después de 3 horas
        </label>
        <div class="error" id="autoResumeMsg"></div>
      </div>

      <div class="panel">
        <h3>Palabras que piden un humano</h3>
        <p class="page-sub" style="margin-bottom:14px;">Si el cliente escribe alguna de estas frases, el bot pausa la conversación y te avisa. Ya reconoce frases comunes ("hablar con una persona", "es una emergencia", etc.) — esto es SOLO para agregar frases propias de tu negocio, no reemplaza las de siempre. Sepáralas con comas.</p>
        <form id="handoffKeywordsForm">
          <textarea id="handoffKeywordsInput" placeholder="ej. quiero hablar con el doctor, cirugía urgente" style="width:100%;min-height:70px;"></textarea>
          <div style="margin-top:10px;"><button class="btn-primary" type="submit">Guardar</button></div>
          <div class="error" id="handoffKeywordsMsg"></div>
        </form>
      </div>

      <div class="panel">
        <h3>Personal</h3>
        <p class="page-sub" style="margin-bottom:14px;">Si tienes más de una persona atendiendo citas (estilistas, barberos, doctores), agrégalos aquí para que el bot pueda preguntar y agendar con quién específico. Déjalo vacío si no aplica — el bot sigue agendando normal, sin pedir con quién. Sepáralos con comas.</p>
        <form id="staffMembersForm">
          <textarea id="staffMembersInput" placeholder="ej. Ana, Carlos" style="width:100%;min-height:50px;"></textarea>
          <div style="margin-top:10px;"><button class="btn-primary" type="submit">Guardar</button></div>
          <div class="error" id="staffMembersMsg"></div>
        </form>
      </div>
    </section>

    <section class="tab-view" id="tab-mejoras">
      <h1 class="page-title">Mejoras</h1>
      <p class="page-sub">Preguntas que tu bot no pudo responder con confianza — agrégalas a tu base de conocimiento. Nunca se agregan solas.</p>
      <div class="panel">
        <table id="kbGapsTable"><thead><tr><th>Pregunta</th><th>Fecha</th><th></th></tr></thead><tbody></tbody></table>
        <p class="empty" id="kbGapsEmpty" style="display:none;">No hay preguntas sin responder registradas — buena señal.</p>
      </div>
    </section>

    <section class="tab-view" id="tab-marca">
      <h1 class="page-title">Mi marca</h1>
      <p class="page-sub">Personaliza cómo se ve esta consola — tu nombre, tu logo y tu color en vez de los de Radamantis. Ninguno es obligatorio: lo que dejes vacío usa el valor por default.</p>
      <div class="panel">
        <form id="brandingForm">
          <label>Nombre para mostrar</label>
          <input type="text" id="brandingName" placeholder="ej. Dr. Vet CH" />

          <label>URL de tu logo</label>
          <input type="text" id="brandingLogoUrl" placeholder="https://tusitio.com/logo.png" />
          <p class="page-sub" style="margin:4px 0 0;">Cuadrado, idealmente 128×128px o más. Si la imagen no carga, se muestra el punto de color de siempre.</p>

          <label>Color principal</label>
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="color" id="brandingColorPicker" style="width:44px;height:38px;padding:2px;" />
            <input type="text" id="brandingColor" placeholder="#0E9F6E" style="max-width:140px;" />
          </div>

          <div style="margin-top:18px;display:flex;gap:10px;">
            <button class="btn-primary" type="submit">Guardar</button>
            <button class="btn-secondary" type="button" id="resetBrandingBtn">Quitar mi marca</button>
          </div>
          <div class="error" id="brandingMsg"></div>
        </form>
      </div>
    </section>

  </main>
</div>

<script>
(function () {
  var STORAGE_KEY = "radamantisClientToken";
  var STORAGE_TENANT = "radamantisClientTenant";
  var currentConversation = null;

  function token() { return localStorage.getItem(STORAGE_KEY) || ""; }

  function api(path, options) {
    options = options || {};
    options.headers = Object.assign({}, options.headers, {
      "Authorization": "Bearer " + token(),
      "Content-Type": "application/json",
    });
    return fetch("/api/client" + path, options).then(function (res) {
      if (res.status === 401) { showAuthGate("Sesión expirada, entra de nuevo."); throw new Error("unauthorized"); }
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || "Error");
        return data;
      });
    });
  }

  function showAuthGate(err) {
    document.getElementById("shell").style.display = "none";
    document.getElementById("authGate").style.display = "block";
    document.getElementById("loginError").textContent = err || "";
  }

  function showApp() {
    document.getElementById("authGate").style.display = "none";
    document.getElementById("shell").style.display = "grid";
    document.getElementById("tenantNameLabel").textContent = localStorage.getItem(STORAGE_TENANT) || "";
    loadAll();
  }

  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }

  function formatDateTime(iso) {
    if (!iso) return "—";
    var d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
    return d.toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function metricTile(value, label) {
    var div = document.createElement("div");
    div.className = "metric";
    div.innerHTML = "<div class='value'>" + esc(value) + "</div><div class='label'>" + esc(label) + "</div>";
    return div;
  }

  document.querySelectorAll(".nav-item[data-tab]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".nav-item[data-tab]").forEach(function (b) { b.classList.remove("active"); });
      document.querySelectorAll(".tab-view").forEach(function (v) { v.classList.remove("active"); });
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  function loadToday() {
    api("/stats/today").then(function (data) {
      var el = document.getElementById("todayMetrics");
      el.innerHTML = "";
      el.appendChild(metricTile(data.stats.messagesIn, "Mensajes recibidos hoy"));
      el.appendChild(metricTile(data.stats.messagesOut, "Respuestas del bot hoy"));
      el.appendChild(metricTile(data.stats.uniqueClients, "Clientes distintos hoy"));
    });
  }

  function loadWeek() {
    api("/stats/week").then(function (data) {
      var max = 1;
      data.days.forEach(function (d) { max = Math.max(max, d.messagesIn, d.messagesOut); });
      var chart = document.getElementById("weekChart");
      chart.innerHTML = "";
      data.days.forEach(function (d) {
        var col = document.createElement("div");
        col.className = "chart-col";
        var bars = document.createElement("div");
        bars.className = "chart-bars";
        var inBar = document.createElement("div");
        inBar.className = "chart-bar in";
        inBar.style.height = Math.max(2, (d.messagesIn / max) * 130) + "px";
        var outBar = document.createElement("div");
        outBar.className = "chart-bar out";
        outBar.style.height = Math.max(2, (d.messagesOut / max) * 130) + "px";
        bars.appendChild(inBar);
        bars.appendChild(outBar);
        var label = document.createElement("div");
        label.className = "day-label";
        var dt = new Date(d.date + "T00:00:00Z");
        label.textContent = dt.toLocaleDateString("es-MX", { weekday: "short", timeZone: "UTC" });
        col.appendChild(bars);
        col.appendChild(label);
        chart.appendChild(col);
      });
    });
  }

  function appointmentRow(a) {
    var dt = new Date(a.startUtc);
    var tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + esc(dt.toLocaleDateString("es-MX", { day: "2-digit", month: "short" })) + "</td>" +
      "<td>" + esc(dt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })) + "</td>" +
      "<td>" + esc(a.attendeeName) + "</td>" +
      "<td class='mono'>" + esc(a.attendeeContact) + "</td>" +
      "<td>" + esc(a.summary) + "</td>" +
      "<td>" + esc(a.staffMember || "—") + "</td>";
    return tr;
  }

  function appointmentStatusBadge(attended) {
    if (attended === 1) return "<span class='badge active'>Asistió</span>";
    if (attended === 0) return "<span class='badge paused'>No asistió</span>";
    return "<span class='badge muted'>Pendiente</span>";
  }

  function appointmentRowWithStatus(a) {
    var tr = appointmentRow(a);
    var td = document.createElement("td");
    td.innerHTML = appointmentStatusBadge(a.attended);
    tr.appendChild(td);
    return tr;
  }

  function loadAppointments() {
    api("/appointments").then(function (data) {
      document.getElementById("currentMonthTitle").textContent =
        "Este mes — " + new Date().toLocaleDateString("es-MX", { month: "long", year: "numeric" });
      var monthBody = document.querySelector("#currentMonthTable tbody");
      monthBody.innerHTML = "";
      data.currentMonth.forEach(function (a) { monthBody.appendChild(appointmentRowWithStatus(a)); });
      document.getElementById("currentMonthEmpty").style.display = data.currentMonth.length ? "none" : "block";

      var upcomingBody = document.querySelector("#upcomingTable tbody");
      upcomingBody.innerHTML = "";
      data.upcoming.forEach(function (a) { upcomingBody.appendChild(appointmentRow(a)); });
      document.getElementById("upcomingEmpty").style.display = data.upcoming.length ? "none" : "block";

      var pastBody = document.querySelector("#pastTable tbody");
      pastBody.innerHTML = "";
      data.past.slice(0, 20).forEach(function (a) { pastBody.appendChild(appointmentRow(a)); });
      document.getElementById("pastEmpty").style.display = data.past.length ? "none" : "block";
    });
  }

  function loadClients() {
    api("/clients").then(function (data) {
      var body = document.querySelector("#clientsTable tbody");
      body.innerHTML = "";
      data.clients.forEach(function (cl) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" + esc(cl.attendeeName || ("Cliente #" + cl.chatId)) + "</td>" +
          "<td>" + esc(cl.channel) + "</td>" +
          "<td class='mono'>" + esc(cl.attendeeContact || "—") + "</td>" +
          "<td>" + esc(cl.messageCount) + "</td>" +
          "<td>" + esc(formatDateTime(cl.lastSeen)) + "</td>";
        body.appendChild(tr);
      });
      document.getElementById("clientsEmpty").style.display = data.clients.length ? "none" : "block";
    });
  }

  // Nombres solo para mostrar — hoy únicamente Telegram tiene un canal real
  // conectable; el resto se añaden aquí según se vayan construyendo
  // (src/channels/), sin que esta consola necesite ningún otro cambio.
  var CHANNEL_DISPLAY_NAMES = { telegram: "Telegram", whatsapp: "WhatsApp", messenger: "Facebook Messenger", instagram: "Instagram" };

  function loadHealth() {
    api("/health").then(function (data) {
      var h = data.health;
      var panel = document.getElementById("healthPanel");
      panel.innerHTML = "";

      if (h.channels.length === 0) {
        var noneRow = document.createElement("div");
        noneRow.className = "health-row";
        noneRow.innerHTML = "<span class='health-label status-warn'><span class='status-dot'></span>Canal de mensajería</span><span class='health-value'>Ninguno conectado</span>";
        panel.appendChild(noneRow);
      }
      h.channels.forEach(function (channel) {
        var row = document.createElement("div");
        row.className = "health-row";
        var label = CHANNEL_DISPLAY_NAMES[channel] || channel;
        row.innerHTML = "<span class='health-label status-ok'><span class='status-dot'></span>" + esc(label) + "</span><span class='health-value'>Conectado</span>";
        panel.appendChild(row);
      });

      var calRow = document.createElement("div");
      calRow.className = "health-row";
      calRow.innerHTML =
        "<span class='health-label " + (h.calendarConnected ? "status-ok" : "status-warn") + "'><span class='status-dot'></span>Google Calendar</span>" +
        "<span class='health-value'>" + (h.calendarConnected ? "Conectado" : "No conectado") + "</span>";
      panel.appendChild(calRow);

      var llmRow = document.createElement("div");
      llmRow.className = "health-row";
      llmRow.innerHTML =
        "<span class='health-label status-ok'><span class='status-dot'></span>Asistente (IA)</span>" +
        "<span class='health-value'>" + (h.lastActivityAt ? "Última actividad: " + esc(formatDateTime(h.lastActivityAt)) : "Sin actividad registrada") + "</span>";
      panel.appendChild(llmRow);
    });
  }

  function loadAlertSettings() {
    api("/alert-settings").then(function (data) {
      var panel = document.getElementById("alertSettingsPanel");
      panel.innerHTML = "";

      var statusRow = document.createElement("div");
      statusRow.className = "health-row";
      statusRow.innerHTML =
        "<span class='health-label " + (data.configured ? "status-ok" : "status-warn") + "'><span class='status-dot'></span>Alertas</span>" +
        "<span class='health-value'>" + (data.configured ? "Activadas" : "No activadas") + "</span>";
      panel.appendChild(statusRow);

      var instructions = document.createElement("div");
      instructions.style.marginTop = "14px";
      instructions.innerHTML =
        "<p style='font-size:0.88rem;margin-bottom:8px;'>" +
        (data.configured
          ? "Para mandar las alertas a otro chat, envía este mismo código de nuevo desde el chat que quieras usar:"
          : "Para activarlas, abre el chat de tu bot en Telegram y manda este código (tal cual, sin nada más):") +
        "</p>" +
        "<code style='display:inline-block;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 14px;font-size:1.1rem;letter-spacing:0.05em;font-family:\\"Fira Code\\",monospace;'>" +
        esc(data.activationCode) + "</code>";
      panel.appendChild(instructions);

      if (data.configured) {
        var disableBtn = document.createElement("button");
        disableBtn.className = "btn-secondary";
        disableBtn.style.marginTop = "14px";
        disableBtn.textContent = "Desactivar alertas";
        disableBtn.addEventListener("click", function () {
          api("/alert-settings", { method: "DELETE" }).then(loadAlertSettings);
        });
        panel.appendChild(disableBtn);
      }
    });
  }

  function loadKbGaps() {
    api("/kb-gaps").then(function (data) {
      var body = document.querySelector("#kbGapsTable tbody");
      body.innerHTML = "";
      data.gaps.forEach(function (g) {
        var tr = document.createElement("tr");
        var dismissBtn = document.createElement("button");
        dismissBtn.className = "btn-secondary";
        dismissBtn.textContent = "Descartar";
        dismissBtn.addEventListener("click", function () {
          api("/kb-gaps/" + g.id, { method: "DELETE" }).then(loadKbGaps);
        });
        var actionsTd = document.createElement("td");
        actionsTd.appendChild(dismissBtn);
        tr.innerHTML = "<td>" + esc(g.question) + "</td><td>" + esc(formatDateTime(g.createdAt)) + "</td>";
        tr.appendChild(actionsTd);
        body.appendChild(tr);
      });
      document.getElementById("kbGapsEmpty").style.display = data.gaps.length ? "none" : "block";
    });
  }

  var currentKbDocId = null; // null = creando uno nuevo; string = editando ese docId

  function renderKbDoc(doc) {
    var card = document.createElement("div");
    card.style.cssText = "border-bottom:1px solid var(--border);padding:14px 0;display:flex;justify-content:space-between;gap:14px;align-items:flex-start;";
    var info = document.createElement("div");
    info.style.minWidth = "0";
    var title = document.createElement("div");
    title.style.fontWeight = "600";
    title.textContent = doc.title;
    var preview = document.createElement("div");
    preview.style.cssText = "font-size:0.85rem;color:var(--text-muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:520px;";
    preview.textContent = doc.content;
    var meta = document.createElement("div");
    meta.style.cssText = "font-size:0.78rem;color:var(--text-muted);margin-top:4px;";
    meta.textContent = doc.charCount + " caracteres · actualizado " + formatDateTime(doc.updatedAt);
    info.appendChild(title);
    info.appendChild(preview);
    info.appendChild(meta);

    var actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px;flex-shrink:0;";
    var editBtn = document.createElement("button");
    editBtn.className = "btn-secondary";
    editBtn.textContent = "Editar";
    editBtn.addEventListener("click", function () { openKbForm(doc); });
    var delBtn = document.createElement("button");
    delBtn.className = "btn-secondary";
    delBtn.textContent = "Borrar";
    delBtn.addEventListener("click", function () {
      if (!confirm('¿Borrar "' + doc.title + '"? El bot dejará de saber esto de inmediato.')) return;
      api("/kb/" + doc.docId, { method: "DELETE" }).then(loadKbDocs);
    });
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    card.appendChild(info);
    card.appendChild(actions);
    return card;
  }

  function loadKbDocs() {
    api("/kb").then(function (data) {
      var panel = document.getElementById("kbDocsPanel");
      panel.innerHTML = "";
      data.documents.forEach(function (doc) { panel.appendChild(renderKbDoc(doc)); });
      document.getElementById("kbDocsEmpty").style.display = data.documents.length ? "none" : "block";
    });
  }

  function openKbForm(doc) {
    currentKbDocId = doc ? doc.docId : null;
    document.getElementById("kbFormTitle").textContent = doc ? "Editar documento" : "Nuevo documento";
    document.getElementById("kbTitleInput").value = doc ? doc.title : "";
    document.getElementById("kbContentInput").value = doc ? doc.content : "";
    document.getElementById("kbFormMsg").textContent = "";
    document.getElementById("kbFormPanel").style.display = "block";
  }

  function closeKbForm() {
    document.getElementById("kbFormPanel").style.display = "none";
    currentKbDocId = null;
  }

  document.getElementById("kbNewBtn").addEventListener("click", function () { openKbForm(null); });
  document.getElementById("kbFormCancel").addEventListener("click", closeKbForm);

  document.getElementById("kbForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var msgEl = document.getElementById("kbFormMsg");
    var body = { title: document.getElementById("kbTitleInput").value, content: document.getElementById("kbContentInput").value };
    var request = currentKbDocId
      ? api("/kb/" + currentKbDocId, { method: "PUT", body: JSON.stringify(body) })
      : api("/kb", { method: "POST", body: JSON.stringify(body) });
    request
      .then(function () { closeKbForm(); loadKbDocs(); })
      .catch(function (err) { msgEl.className = "error"; msgEl.textContent = err.message; });
  });

  document.getElementById("kbReindexBtn").addEventListener("click", function () {
    var msgEl = document.getElementById("kbReindexMsg");
    msgEl.className = "";
    msgEl.textContent = "Reindexando...";
    api("/kb/reindex", { method: "POST" })
      .then(function (data) {
        msgEl.className = "success-msg";
        msgEl.textContent = "Listo — " + data.count + " documento(s) reindexado(s).";
      })
      .catch(function (err) { msgEl.className = "error"; msgEl.textContent = err.message; });
  });

  // Agencia (Fase 2b: catálogo con fotos) — mismo patrón exacto que
  // Conocimiento (crear/editar/borrar), sin reindexar (no hay Vectorize).
  var currentCatalogItemId = null; // null = creando uno nuevo; string = editando ese itemId

  function renderCatalogItem(item) {
    var card = document.createElement("div");
    card.style.cssText = "border-bottom:1px solid var(--border);padding:14px 0;display:flex;justify-content:space-between;gap:14px;align-items:flex-start;";
    var info = document.createElement("div");
    info.style.minWidth = "0";
    var title = document.createElement("div");
    title.style.fontWeight = "600";
    title.textContent = item.title + (item.price ? " — " + item.price : "");
    var preview = document.createElement("div");
    preview.style.cssText = "font-size:0.85rem;color:var(--text-muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:520px;";
    preview.textContent = item.description;
    var meta = document.createElement("div");
    meta.style.cssText = "font-size:0.78rem;color:var(--text-muted);margin-top:4px;";
    meta.textContent = item.photoUrl ? "Con foto · actualizado " + formatDateTime(item.updatedAt) : "Sin foto · actualizado " + formatDateTime(item.updatedAt);
    info.appendChild(title);
    info.appendChild(preview);
    info.appendChild(meta);

    var actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px;flex-shrink:0;";
    var editBtn = document.createElement("button");
    editBtn.className = "btn-secondary";
    editBtn.textContent = "Editar";
    editBtn.addEventListener("click", function () { openCatalogForm(item); });
    var delBtn = document.createElement("button");
    delBtn.className = "btn-secondary";
    delBtn.textContent = "Borrar";
    delBtn.addEventListener("click", function () {
      if (!confirm('¿Borrar "' + item.title + '"? El bot dejará de mostrarlo de inmediato.')) return;
      api("/catalog/" + item.itemId, { method: "DELETE" }).then(loadCatalogItems);
    });
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    card.appendChild(info);
    card.appendChild(actions);
    return card;
  }

  function loadCatalogItems() {
    api("/catalog").then(function (data) {
      var panel = document.getElementById("catalogPanel");
      panel.innerHTML = "";
      data.items.forEach(function (item) { panel.appendChild(renderCatalogItem(item)); });
      document.getElementById("catalogEmpty").style.display = data.items.length ? "none" : "block";
    });
  }

  function openCatalogForm(item) {
    currentCatalogItemId = item ? item.itemId : null;
    document.getElementById("catalogFormTitle").textContent = item ? "Editar item" : "Nuevo item";
    document.getElementById("catalogTitleInput").value = item ? item.title : "";
    document.getElementById("catalogDescriptionInput").value = item ? item.description : "";
    document.getElementById("catalogPriceInput").value = item ? (item.price || "") : "";
    document.getElementById("catalogPhotoUrlInput").value = item ? (item.photoUrl || "") : "";
    document.getElementById("catalogFormMsg").textContent = "";
    document.getElementById("catalogFormPanel").style.display = "block";
  }

  function closeCatalogForm() {
    document.getElementById("catalogFormPanel").style.display = "none";
    currentCatalogItemId = null;
  }

  document.getElementById("catalogNewBtn").addEventListener("click", function () { openCatalogForm(null); });
  document.getElementById("catalogFormCancel").addEventListener("click", closeCatalogForm);

  document.getElementById("catalogForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var msgEl = document.getElementById("catalogFormMsg");
    var body = {
      title: document.getElementById("catalogTitleInput").value,
      description: document.getElementById("catalogDescriptionInput").value,
      price: document.getElementById("catalogPriceInput").value,
      photoUrl: document.getElementById("catalogPhotoUrlInput").value,
    };
    var request = currentCatalogItemId
      ? api("/catalog/" + currentCatalogItemId, { method: "PUT", body: JSON.stringify(body) })
      : api("/catalog", { method: "POST", body: JSON.stringify(body) });
    request
      .then(function () { closeCatalogForm(); loadCatalogItems(); })
      .catch(function (err) { msgEl.className = "error"; msgEl.textContent = err.message; });
  });

  function loadReviewLink() {
    api("/review-link").then(function (data) {
      document.getElementById("reviewLinkInput").value = data.reviewLink || "";
    });
  }

  document.getElementById("reviewLinkForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var msgEl = document.getElementById("reviewLinkMsg");
    var value = document.getElementById("reviewLinkInput").value;
    api("/review-link", { method: "PUT", body: JSON.stringify({ reviewLink: value }) })
      .then(function () { msgEl.className = "success-msg"; msgEl.textContent = "Guardado."; })
      .catch(function (err) { msgEl.className = "error"; msgEl.textContent = err.message; });
  });

  function loadLeadReengagement() {
    api("/lead-reengagement").then(function (data) {
      document.getElementById("leadReengagementToggle").checked = !!data.enabled;
    });
  }

  document.getElementById("leadReengagementToggle").addEventListener("change", function (e) {
    var msgEl = document.getElementById("leadReengagementMsg");
    api("/lead-reengagement", { method: "PUT", body: JSON.stringify({ enabled: e.target.checked }) })
      .then(function () { msgEl.className = "success-msg"; msgEl.textContent = "Guardado."; })
      .catch(function (err) {
        msgEl.className = "error";
        msgEl.textContent = err.message;
        e.target.checked = !e.target.checked;
      });
  });

  function loadAutoResume() {
    api("/auto-resume-handoff").then(function (data) {
      document.getElementById("autoResumeToggle").checked = !!data.enabled;
    });
  }

  document.getElementById("autoResumeToggle").addEventListener("change", function (e) {
    var msgEl = document.getElementById("autoResumeMsg");
    api("/auto-resume-handoff", { method: "PUT", body: JSON.stringify({ enabled: e.target.checked }) })
      .then(function () { msgEl.className = "success-msg"; msgEl.textContent = "Guardado."; })
      .catch(function (err) {
        msgEl.className = "error";
        msgEl.textContent = err.message;
        e.target.checked = !e.target.checked;
      });
  });

  function loadHandoffKeywords() {
    api("/handoff-keywords").then(function (data) {
      document.getElementById("handoffKeywordsInput").value = (data.keywords || []).join(", ");
    });
  }

  document.getElementById("handoffKeywordsForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var msgEl = document.getElementById("handoffKeywordsMsg");
    var keywords = document.getElementById("handoffKeywordsInput").value.split(",").map(function (k) { return k.trim(); }).filter(Boolean);
    api("/handoff-keywords", { method: "PUT", body: JSON.stringify({ keywords: keywords }) })
      .then(function () { msgEl.className = "success-msg"; msgEl.textContent = "Guardado."; })
      .catch(function (err) { msgEl.className = "error"; msgEl.textContent = err.message; });
  });

  // Agencia (Fase 2, agendar con persona específica): mismo patrón exacto
  // que las palabras de handoff — comma-separated, se guarda vacío si no
  // aplica.
  function loadStaffMembers() {
    api("/staff-members").then(function (data) {
      document.getElementById("staffMembersInput").value = (data.staffMembers || []).join(", ");
    });
  }

  document.getElementById("staffMembersForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var msgEl = document.getElementById("staffMembersMsg");
    var staffMembers = document.getElementById("staffMembersInput").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    api("/staff-members", { method: "PUT", body: JSON.stringify({ staffMembers: staffMembers }) })
      .then(function () { msgEl.className = "success-msg"; msgEl.textContent = "Guardado."; })
      .catch(function (err) { msgEl.className = "error"; msgEl.textContent = err.message; });
  });

  // Agencia (White-label, por tenant): reconstruye el bloque de marca del
  // sidebar cada vez (en vez de mutar el <img>/<span> existente) para que
  // llamarla de nuevo tras guardar sea seguro sin rastrear qué elemento
  // quedó en el DOM la vez anterior.
  function applyBranding(data) {
    var displayName = (data && data.brandName) || localStorage.getItem(STORAGE_TENANT) || "Radamantis";
    document.getElementById("tenantNameLabel").textContent = displayName;
    document.title = displayName + " · Mi consola";

    var brandEl = document.getElementById("sidebarBrand");
    brandEl.innerHTML = "";
    if (data && data.brandLogoUrl) {
      var img = document.createElement("img");
      img.className = "brand-logo";
      img.alt = displayName;
      img.onerror = function () {
        img.remove();
        var dot = document.createElement("span");
        dot.className = "dot";
        brandEl.prepend(dot);
      };
      img.src = data.brandLogoUrl;
      brandEl.appendChild(img);
    } else {
      var dot = document.createElement("span");
      dot.className = "dot";
      brandEl.appendChild(dot);
    }
    var nameSpan = document.createElement("span");
    nameSpan.textContent = displayName;
    brandEl.appendChild(nameSpan);

    var color = (data && data.brandColor) || "#0E9F6E";
    document.documentElement.style.setProperty("--primary", color);
  }

  function loadBranding() {
    return api("/branding").then(function (data) {
      applyBranding(data);
      document.getElementById("brandingName").value = data.brandName || "";
      document.getElementById("brandingLogoUrl").value = data.brandLogoUrl || "";
      document.getElementById("brandingColor").value = data.brandColor || "";
      document.getElementById("brandingColorPicker").value = data.brandColor || "#0e9f6e";
    });
  }

  document.getElementById("brandingColorPicker").addEventListener("input", function (e) {
    document.getElementById("brandingColor").value = e.target.value;
  });

  function saveBranding(patch) {
    var msgEl = document.getElementById("brandingMsg");
    return api("/branding", { method: "PUT", body: JSON.stringify(patch) })
      .then(function () {
        msgEl.className = "success-msg";
        msgEl.textContent = "Guardado.";
        return loadBranding();
      })
      .catch(function (err) { msgEl.className = "error"; msgEl.textContent = err.message; });
  }

  document.getElementById("brandingForm").addEventListener("submit", function (e) {
    e.preventDefault();
    saveBranding({
      brandName: document.getElementById("brandingName").value,
      brandLogoUrl: document.getElementById("brandingLogoUrl").value,
      brandColor: document.getElementById("brandingColor").value,
    });
  });

  document.getElementById("resetBrandingBtn").addEventListener("click", function () {
    document.getElementById("brandingName").value = "";
    document.getElementById("brandingLogoUrl").value = "";
    document.getElementById("brandingColor").value = "";
    saveBranding({ brandName: "", brandLogoUrl: "", brandColor: "" });
  });

  function renderConversationList(conversations) {
    var list = document.getElementById("conversationList");
    list.innerHTML = "";
    if (conversations.length === 0) {
      list.innerHTML = "<p class='empty'>Todavía no hay conversaciones.</p>";
      return;
    }
    conversations.forEach(function (c) {
      var item = document.createElement("div");
      item.className = "conv-list-item" + (currentConversation && currentConversation.channel === c.channel && currentConversation.chatId === c.chatId ? " selected" : "");
      item.innerHTML =
        "<div class='top'><span>" + esc(c.channel) + " · #" + esc(c.chatId) + "</span>" +
        (c.paused ? "<span class='badge paused'>Pausada</span>" : "") + "</div>" +
        "<div class='preview'>" + esc(c.lastMessage) + "</div>";
      item.addEventListener("click", function () { openConversation(c); });
      list.appendChild(item);
    });
  }

  function loadConversations() {
    return api("/conversations").then(function (data) {
      renderConversationList(data.conversations);
      return data.conversations;
    });
  }

  function openConversation(c) {
    currentConversation = c;
    loadConversations();
    var detail = document.getElementById("conversationDetail");
    detail.innerHTML = "<p class='empty'>Cargando…</p>";
    api("/conversations/" + c.channel + "/" + c.chatId + "/messages").then(function (data) {
      detail.innerHTML = "";
      var header = document.createElement("div");
      header.className = "conv-header";
      var title = document.createElement("h3");
      title.textContent = c.channel + " · #" + c.chatId;
      var btn = document.createElement("button");
      btn.className = c.paused ? "btn-primary" : "btn-danger";
      btn.textContent = c.paused ? "Reactivar bot" : "Pausar bot";
      btn.addEventListener("click", function () {
        var action = c.paused ? "resume" : "pause";
        api("/conversations/" + c.channel + "/" + c.chatId + "/" + action, { method: "POST" }).then(function () {
          c.paused = !c.paused;
          openConversation(c);
        });
      });
      header.appendChild(title);
      header.appendChild(btn);
      detail.appendChild(header);

      var msgList = document.createElement("div");
      msgList.className = "msg-list";
      data.messages.forEach(function (m) {
        var bubble = document.createElement("div");
        bubble.className = "msg " + m.role;
        bubble.textContent = m.content;
        if (m.role === "assistant") {
          var meta = document.createElement("div");
          meta.className = "meta";
          meta.textContent = m.sentBy === "human" ? "Tú" : "Bot";
          bubble.appendChild(meta);
        }
        msgList.appendChild(bubble);
      });
      detail.appendChild(msgList);

      var composer = document.createElement("form");
      composer.className = "composer";
      composer.innerHTML =
        "<textarea rows='2' placeholder='Responde como el negocio — se manda por " + esc(c.channel) + " directo…' required></textarea>" +
        "<div style='display:flex;justify-content:space-between;align-items:center;margin-top:8px;'>" +
        "<span class='page-sub' style='margin:0;font-size:0.78rem;'>Al enviar, el bot se pausa automáticamente si no lo estaba.</span>" +
        "<button class='btn-primary' type='submit'>Enviar</button></div>" +
        "<div class='error' id='composerError'></div>";
      composer.addEventListener("submit", function (e) {
        e.preventDefault();
        var textarea = composer.querySelector("textarea");
        var text = textarea.value.trim();
        if (!text) return;
        var errEl = composer.querySelector("#composerError");
        errEl.textContent = "";
        api("/conversations/" + c.channel + "/" + c.chatId + "/send", { method: "POST", body: JSON.stringify({ text: text }) })
          .then(function () {
            c.paused = true;
            openConversation(c);
          })
          .catch(function (err) { errEl.textContent = err.message; });
      });
      detail.appendChild(composer);
    });
  }

  function loadAll() {
    loadToday();
    loadWeek();
    loadAppointments();
    loadClients();
    loadHealth();
    loadAlertSettings();
    loadReviewLink();
    loadLeadReengagement();
    loadAutoResume();
    loadHandoffKeywords();
    loadStaffMembers();
    loadKbGaps();
    loadKbDocs();
    loadCatalogItems();
    loadConversations();
    loadBranding();
  }

  document.getElementById("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = document.getElementById("loginEmail").value;
    var password = document.getElementById("loginPassword").value;
    fetch("/api/client/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: password }),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || "Credenciales inválidas");
        return data;
      });
    }).then(function (data) {
      localStorage.setItem(STORAGE_KEY, data.token);
      localStorage.setItem(STORAGE_TENANT, data.tenantId);
      showApp();
    }).catch(function (err) {
      document.getElementById("loginError").textContent = err.message;
    });
  });

  document.getElementById("logoutBtn").addEventListener("click", function () {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_TENANT);
    showAuthGate();
  });

  if (token()) { showApp(); } else { showAuthGate(); }
})();
</script>
</body>
</html>
`;
