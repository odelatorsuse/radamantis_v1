import { Hono } from "hono";
import { getChannelExternalId, getVerticalIdForTenant } from "./tenants";

interface Env {
  DB: D1Database;
  AGENT: DurableObjectNamespace;
}

// Etapa Agencia (widget de sitio web, v1 — decisión de alcance confirmada
// con Oscar: sin tiempo real. Si el negocio toma el control desde
// /console, su respuesta queda guardada y el visitante la recibe cuando
// vuelva a escribir, igual que si hubiera cerrado el chat y regresado).
//
// Público a propósito (sin ADMIN_API_KEY ni sesión) — lo llama la página
// del NEGOCIO, no la nuestra. La única protección real es que el origen
// (Origin) tiene que coincidir con el dominio que el dueño configuró al
// vincular el canal ("Alta de canal" en /admin, external_id = dominio
// permitido en vez de un token) — CORS por sí solo no protege nada
// (cualquier cliente HTTP lo ignora), así que el chequeo real pasa
// siempre por el servidor, nunca solo por los headers.
export const widgetApp = new Hono<{ Bindings: Env }>();

async function resolveAllowedOrigin(db: D1Database, tenantId: string): Promise<string | null> {
  return getChannelExternalId(db, tenantId, "web");
}

widgetApp.options("/:tenantId/message", async (c) => {
  const allowedOrigin = await resolveAllowedOrigin(c.env.DB, c.req.param("tenantId"));
  if (allowedOrigin) {
    c.header("Access-Control-Allow-Origin", allowedOrigin);
    c.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type");
    c.header("Vary", "Origin");
  }
  return c.body(null, 204);
});

widgetApp.post("/:tenantId/message", async (c) => {
  const tenantId = c.req.param("tenantId");
  const allowedOrigin = await resolveAllowedOrigin(c.env.DB, tenantId);
  if (!allowedOrigin) {
    return c.json({ error: "Este tenant no tiene el canal de sitio web conectado" }, 404);
  }

  const requestOrigin = c.req.header("Origin");
  if (requestOrigin !== allowedOrigin) {
    return c.json({ error: "Origen no autorizado" }, 403);
  }
  c.header("Access-Control-Allow-Origin", allowedOrigin);
  c.header("Vary", "Origin");

  const verticalId = await getVerticalIdForTenant(c.env.DB, tenantId);
  if (!verticalId) return c.json({ error: "Tenant no encontrado" }, 404);

  const body = await c.req.json<{ visitorId?: string; text?: string }>();
  if (!body.visitorId || !body.text?.trim()) {
    return c.json({ error: "visitorId y text son requeridos" }, 400);
  }

  const chatId = body.visitorId;
  const conversationKey = `${tenantId}:web:${chatId}`;
  const stub = c.env.AGENT.get(c.env.AGENT.idFromName(conversationKey));
  const agentRes = await stub.fetch("https://agent/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, channel: "web", chatId, userText: body.text, verticalId }),
  });
  const { replyText } = await agentRes.json<{ replyText: string | null }>();
  return c.json({ replyText });
});

// Script público servido en GET /widget.js — se embebe con:
//   <script src=".../widget.js" data-tenant="vet-ch"></script>
// data-tenant es público a propósito (identifica el tenant, no autoriza
// nada por sí solo — la autorización real es el chequeo de Origin de
// arriba). data-tema (claro/oscuro), data-color y data-posicion
// (derecha/izquierda) son opcionales, para que el widget combine con
// el sitio del negocio sin tocar su HTML.
export const WIDGET_JS = `(function () {
  var script = document.currentScript;
  var tenantId = script.getAttribute("data-tenant");
  if (!tenantId) { console.error("[Radamantis widget] falta data-tenant en el <script>"); return; }
  var tema = script.getAttribute("data-tema") || "claro";
  var color = script.getAttribute("data-color") || "#5B8DEF";
  var posicion = script.getAttribute("data-posicion") === "izquierda" ? "left" : "right";
  var apiBase = new URL(script.src).origin;

  var STORAGE_KEY = "radamantisWidgetVisitorId:" + tenantId;
  function visitorId() {
    var id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = "v-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  }

  var dark = tema === "oscuro";
  var bg = dark ? "#151B2B" : "#FFFFFF";
  var text = dark ? "#E7ECF3" : "#1A2233";
  var textMuted = dark ? "#8B96AE" : "#6B7488";
  var border = dark ? "#2A3552" : "#E4E8F0";
  var bubbleUser = dark ? "#26314A" : "#F1F4F9";

  var style = document.createElement("style");
  style.textContent =
    "#rad-widget-btn{position:fixed;bottom:20px;" + posicion + ":20px;width:56px;height:56px;border-radius:50%;" +
    "background:" + color + ";box-shadow:0 4px 14px rgba(0,0,0,.25);border:none;cursor:pointer;z-index:999999;" +
    "display:flex;align-items:center;justify-content:center;transition:transform .15s;}" +
    "#rad-widget-btn:hover{transform:scale(1.06);}" +
    "#rad-widget-panel{position:fixed;bottom:86px;" + posicion + ":20px;width:340px;max-width:calc(100vw - 40px);" +
    "height:460px;max-height:calc(100vh - 140px);background:" + bg + ";color:" + text + ";border-radius:14px;" +
    "box-shadow:0 10px 40px rgba(0,0,0,.3);display:none;flex-direction:column;overflow:hidden;z-index:999999;" +
    "font-family:system-ui,-apple-system,sans-serif;}" +
    "#rad-widget-panel.open{display:flex;}" +
    "#rad-widget-header{background:" + color + ";color:#fff;padding:14px 16px;font-weight:600;font-size:0.95rem;}" +
    "#rad-widget-messages{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;}" +
    ".rad-msg{max-width:80%;padding:8px 12px;border-radius:12px;font-size:0.88rem;line-height:1.4;}" +
    ".rad-msg.user{align-self:flex-end;background:" + color + ";color:#fff;}" +
    ".rad-msg.assistant{align-self:flex-start;background:" + bubbleUser + ";color:" + text + ";}" +
    ".rad-msg.pending{opacity:0.6;}" +
    "#rad-widget-form{display:flex;border-top:1px solid " + border + ";padding:10px;gap:8px;}" +
    "#rad-widget-input{flex:1;border:1px solid " + border + ";border-radius:8px;padding:8px 10px;font-size:0.88rem;" +
    "background:" + bg + ";color:" + text + ";}" +
    "#rad-widget-send{background:" + color + ";color:#fff;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;font-size:0.88rem;}" +
    "#rad-widget-empty{color:" + textMuted + ";font-size:0.85rem;text-align:center;margin-top:20px;}";
  document.head.appendChild(style);

  var btn = document.createElement("button");
  btn.id = "rad-widget-btn";
  btn.setAttribute("aria-label", "Abrir chat");
  btn.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  document.body.appendChild(btn);

  var panel = document.createElement("div");
  panel.id = "rad-widget-panel";
  panel.innerHTML =
    '<div id="rad-widget-header">Escríbenos</div>' +
    '<div id="rad-widget-messages"><div id="rad-widget-empty">¿En qué te podemos ayudar?</div></div>' +
    '<form id="rad-widget-form"><input id="rad-widget-input" type="text" placeholder="Escribe tu mensaje..." autocomplete="off" /><button id="rad-widget-send" type="submit">Enviar</button></form>';
  document.body.appendChild(panel);

  var open = false;
  btn.addEventListener("click", function () {
    open = !open;
    panel.classList.toggle("open", open);
  });

  var messagesEl = document.getElementById("rad-widget-messages");
  function addMessage(role, content) {
    var empty = document.getElementById("rad-widget-empty");
    if (empty) empty.remove();
    var div = document.createElement("div");
    div.className = "rad-msg " + role;
    div.textContent = content;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  var form = document.getElementById("rad-widget-form");
  var input = document.getElementById("rad-widget-input");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    input.value = "";
    addMessage("user", text);
    var pending = addMessage("assistant", "...");
    pending.classList.add("pending");

    fetch(apiBase + "/api/widget/" + tenantId + "/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId: visitorId(), text: text }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        pending.classList.remove("pending");
        pending.textContent = data.replyText || "Gracias por tu mensaje, en un momento te atendemos.";
      })
      .catch(function () {
        pending.classList.remove("pending");
        pending.textContent = "No pudimos enviar tu mensaje. Intenta de nuevo en un momento.";
      });
  });
})();
`;
