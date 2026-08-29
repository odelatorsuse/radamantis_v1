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
    --border: #E3EDE8;
    --primary: #0E9F6E;
    --primary-dark: #0B7A56;
    --accent: #F59E0B;
    --text: #10241D;
    --text-muted: #5B6B64;
    --danger: #DC2626;
    --danger-bg: #FEF2F2;
    --ok: #16A34A;
    --radius: 12px;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font-family: "Open Sans", sans-serif; font-size: 15px; line-height: 1.5; }
  h1, h2, h3 { font-family: "Poppins", sans-serif; font-weight: 600; margin: 0; }
  button { font-family: inherit; cursor: pointer; }
  input { font-family: inherit; }
  svg { display: block; }

  #authGate { max-width: 400px; margin: 90px auto; padding: 0 20px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; justify-content: center; }
  .brand .dot { width: 12px; height: 12px; border-radius: 50%; background: var(--primary); }
  .brand span { font-family: "Poppins", sans-serif; font-weight: 700; font-size: 1.3rem; }
  label { display: block; font-size: 0.85rem; color: var(--text-muted); margin: 14px 0 4px; }
  input[type="email"], input[type="password"], input[type="text"], input[type="time"], textarea, select {
    width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 0.95rem; background: #fff; color: var(--text);
  }
  input:focus, textarea:focus, select:focus { outline: 2px solid var(--primary); outline-offset: 1px; border-color: var(--primary); }
  .btn-primary { background: var(--primary); color: #fff; border: none; border-radius: 8px; padding: 11px 18px; font-weight: 600; font-size: 0.95rem; transition: background 0.15s; }
  .btn-primary:hover { background: var(--primary-dark); }
  .btn-secondary { background: #fff; color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 9px 14px; font-size: 0.9rem; transition: border-color 0.15s; }
  .btn-secondary:hover { border-color: var(--primary); }
  .btn-danger { background: var(--danger-bg); color: var(--danger); border: 1px solid #FCA5A5; border-radius: 8px; padding: 8px 12px; font-size: 0.85rem; }
  .error { color: var(--danger); font-size: 0.85rem; margin-top: 10px; min-height: 1.2em; }
  .success-msg { color: var(--ok); font-size: 0.85rem; margin-top: 10px; min-height: 1.2em; }

  .shell { display: none; grid-template-columns: 220px 1fr; min-height: 100vh; }
  .sidebar { background: var(--surface); border-right: 1px solid var(--border); padding: 20px 14px; display: flex; flex-direction: column; }
  .sidebar .brand { justify-content: flex-start; margin-bottom: 28px; padding-left: 4px; }
  .nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; border: none; background: none; color: var(--text-muted); font-size: 0.92rem; font-weight: 500; text-align: left; width: 100%; margin-bottom: 2px; transition: background 0.15s, color 0.15s; }
  .nav-item:hover { background: #F0F7F4; color: var(--text); }
  .nav-item.active { background: var(--primary); color: #fff; }
  .nav-item svg { width: 18px; height: 18px; flex-shrink: 0; }
  .sidebar-footer { margin-top: auto; padding-top: 14px; border-top: 1px solid var(--border); }
  .tenant-name { font-size: 0.85rem; color: var(--text-muted); padding: 0 4px 8px; }

  .main { padding: 28px 32px; overflow-x: hidden; max-width: 1100px; }
  .tab-view { display: none; }
  .tab-view.active { display: block; }
  .page-title { font-size: 1.4rem; margin-bottom: 4px; }
  .page-sub { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 22px; }

  .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .metric { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; }
  .metric .value { font-family: "Poppins", sans-serif; font-size: 1.7rem; font-weight: 700; }
  .metric .label { font-size: 0.8rem; color: var(--text-muted); margin-top: 2px; }

  .panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; margin-bottom: 20px; }
  .panel h3 { font-size: 1rem; margin-bottom: 14px; }

  .chart { display: flex; align-items: flex-end; gap: 10px; height: 160px; padding-top: 10px; }
  .chart-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; justify-content: flex-end; }
  .chart-bars { display: flex; gap: 3px; align-items: flex-end; height: 130px; width: 100%; justify-content: center; }
  .chart-bar { width: 40%; border-radius: 3px 3px 0 0; min-height: 2px; }
  .chart-bar.in { background: var(--primary); }
  .chart-bar.out { background: var(--accent); }
  .chart-col .day-label { font-size: 0.72rem; color: var(--text-muted); }
  .chart-legend { display: flex; gap: 16px; font-size: 0.8rem; color: var(--text-muted); margin-top: 10px; }
  .chart-legend span { display: inline-flex; align-items: center; gap: 6px; }
  .legend-dot { width: 9px; height: 9px; border-radius: 50%; }

  table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  th { text-align: left; color: var(--text-muted); font-weight: 600; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; padding: 6px 10px; border-bottom: 1px solid var(--border); }
  td { padding: 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .mono { font-family: "Fira Code", monospace; font-size: 0.82rem; color: var(--text-muted); }
  .empty { color: var(--text-muted); font-size: 0.88rem; padding: 12px 0; }

  .status-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 7px; }
  .status-ok .status-dot { background: var(--ok); }
  .status-warn .status-dot { background: var(--accent); }
  .health-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .health-row:last-child { border-bottom: none; }
  .health-label { font-weight: 500; }
  .health-value { font-size: 0.85rem; color: var(--text-muted); }

  .badge { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 0.72rem; font-weight: 600; }
  .badge.paused { background: var(--danger-bg); color: var(--danger); }
  .badge.active { background: #ECFDF5; color: var(--ok); }

  .conv-layout { display: grid; grid-template-columns: 320px 1fr; gap: 18px; align-items: start; }
  .conv-list { max-height: 640px; overflow-y: auto; }
  .conv-list-item { padding: 12px; border-radius: 10px; border: 1px solid transparent; cursor: pointer; margin-bottom: 4px; }
  .conv-list-item:hover { background: #F0F7F4; }
  .conv-list-item.selected { border-color: var(--primary); background: #ECFDF5; }
  .conv-list-item .top { display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 600; }
  .conv-list-item .preview { font-size: 0.8rem; color: var(--text-muted); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .conv-detail { min-height: 300px; }
  .composer { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border); }
  .composer textarea { resize: vertical; }
  .conv-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .msg-list { max-height: 480px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding-right: 6px; }
  .msg { max-width: 75%; padding: 9px 13px; border-radius: 12px; font-size: 0.88rem; }
  .msg.user { align-self: flex-start; background: #F0F7F4; }
  .msg.assistant { align-self: flex-end; background: var(--primary); color: #fff; }
  .msg .meta { font-size: 0.68rem; opacity: 0.7; margin-top: 3px; }

  @media (max-width: 800px) {
    .shell { grid-template-columns: 1fr; }
    .sidebar { display: none; }
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
    <div class="brand"><span class="dot"></span><span>Radamantis</span></div>
    <div class="tenant-name" id="tenantNameLabel"></div>
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
    <button class="nav-item" data-tab="salud">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12h4l2-7 4 14 2-7h4"/></svg>
      Salud
    </button>
    <button class="nav-item" data-tab="mejoras">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
      Mejoras
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
        <h3>Próximas</h3>
        <table id="upcomingTable"><thead><tr><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Contacto</th><th>Motivo</th></tr></thead><tbody></tbody></table>
        <p class="empty" id="upcomingEmpty" style="display:none;">No hay citas próximas.</p>
      </div>
      <div class="panel">
        <h3>Recientes</h3>
        <table id="pastTable"><thead><tr><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Contacto</th><th>Motivo</th></tr></thead><tbody></tbody></table>
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
    </section>

    <section class="tab-view" id="tab-mejoras">
      <h1 class="page-title">Mejoras</h1>
      <p class="page-sub">Preguntas que tu bot no pudo responder con confianza — agrégalas a tu base de conocimiento. Nunca se agregan solas.</p>
      <div class="panel">
        <table id="kbGapsTable"><thead><tr><th>Pregunta</th><th>Fecha</th><th></th></tr></thead><tbody></tbody></table>
        <p class="empty" id="kbGapsEmpty" style="display:none;">No hay preguntas sin responder registradas — buena señal.</p>
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
      "<td>" + esc(a.summary) + "</td>";
    return tr;
  }

  function loadAppointments() {
    api("/appointments").then(function (data) {
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
        "<code style='display:inline-block;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 14px;font-size:1.1rem;letter-spacing:0.05em;font-family:\"Fira Code\",monospace;'>" +
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
    loadKbGaps();
    loadConversations();
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
