---
name: radamantis-admin
description: Administra tenants (bots) de Radamantis vía la API admin — alta de cliente, canales, base de conocimiento, configuración, calendario, handoffs, uso, logins de consola. Úsalo cuando el usuario pida dar de alta un cliente nuevo, revisar el estado/métricas de un bot, cambiar su configuración, o gestionar su canal/KB/calendario/usuarios de consola.
---

# Radamantis — administración vía API

Este Skill es el cliente oficial de la API admin de Radamantis (D9 en
`docs/05-arquitectura-radamantis.md`: *"el futuro Skill de Claude solo
consume la API, nunca reimplementa lógica"*). Nunca leas ni escribas D1
directamente, no regeneres embeddings tú mismo, no llames a la API de
Telegram/Google directo — todo pasa por estos endpoints, que ya
encapsulan esa lógica (multi-tenant, aislamiento, reintentos, etc.).

## Antes de empezar

Necesitas dos datos que el usuario debe darte (nunca los adivines ni
los fabriques):
- `RADAMANTIS_BASE_URL` — la URL del Worker desplegado (ej.
  `https://radamantis.latinosworkflowmxag.workers.dev`).
- `RADAMANTIS_ADMIN_API_KEY` — el secreto de super-admin (llave
  maestra, acceso total siempre). **No es recuperable** (Cloudflare
  Workers Secrets es de solo escritura): si el usuario no la tiene a
  la mano, dile que puede rotarla con `wrangler secret put
  ADMIN_API_KEY` y volver a intentarlo, en vez de intentar leerla de
  algún lado.

Toda llamada lleva:
```
Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY
Content-Type: application/json
```

**Nunca imprimas el valor de `RADAMANTIS_ADMIN_API_KEY` en tu respuesta al
usuario** — pásalo directo del entorno al header.

**Alternativa (Etapa Agencia — Equipo/roles):** en vez de la llave
maestra, una persona puede tener su propio login (`POST
/api/admin/login` con `email`/`password`, devuelve un `token` que se
usa igual como `Authorization: Bearer $token`). Ese token trae un rol
(`admin` u `operador`) — un `operador` recibe 403 en las acciones
marcadas como "solo admin" abajo. Ver la sección "Equipo" al final.

Antes de una acción que crea o cambia algo en producción (alta de
tenant, cambio de configuración, rotación de canal, borrar conexión de
calendario), confirma con el usuario qué vas a hacer si no fue
explícito ya en su pedido — es el mismo criterio de cualquier acción
con efectos en un sistema compartido.

## Tenants

**Listar todos:**
```bash
curl -s "$RADAMANTIS_BASE_URL/api/admin/tenants" -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY"
```
Devuelve `{tenants: [{id, name, vertical_id, created_at, channel_count, open_handoffs}]}`.

**Detalle de uno (config completa + métricas + canales):**
```bash
curl -s "$RADAMANTIS_BASE_URL/api/admin/tenants/<id>" -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY"
```
Devuelve `{tenant: {id, name, vertical_id, created_at, settings, channels: [{channel, external_id}], metrics: {messagesIn, messagesOut, conversations, openHandoffs, status: "ok"|"necesita_atencion"}}}`.
404 si no existe.

**Ver qué giros (verticales) existen antes de dar de alta:**
```bash
curl -s "$RADAMANTIS_BASE_URL/api/admin/verticals" -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY"
```
Devuelve `{verticals: [{verticalId, displayName, toolsEnabled, kbSchema}]}` —
`verticalId` es lo que necesitas para el alta; `toolsEnabled` te dice
qué preguntar además (ver abajo); `kbSchema` son los documentos de KB
sugeridos para ese giro (menciónalos, no los inventes de más).

**Preguntas mínimas de alta (Agencia, antes de crear el tenant) —
mismo criterio que el wizard de `/admin`, misma fuente de datos
(`/verticals`), para que preguntar por chat o por el dashboard termine
en el mismo resultado:**

1. **Siempre**, sin importar el giro:
   - Nombre del negocio y un `id` slug único (o propón uno a partir del nombre).
   - Giro (`verticalId`, de la lista de arriba).
   - Zona horaria del negocio (ej. `America/Bogota`) — es la única forma
     de que las citas se calculen bien; NO asumas `America/Mexico_City`
     solo porque es el default del sistema, pregúntalo siempre.
   - Canal inicial: Telegram (pide el token del bot de BotFather),
     Sitio web (pide el dominio permitido), o "decidir después" — si el
     usuario no lo tiene a la mano en este momento, es una respuesta
     válida, no insistas.
2. **Solo si `toolsEnabled` del giro incluye `"bookAppointment"`**:
   pregunta si el negocio agenda con más de una persona por separado
   (ej. varios estilistas/doctores) — si sí, pide los nombres para
   `staff-members` (ver abajo). Si el negocio agenda "con el negocio en
   general", no hace falta nada aquí, déjalo vacío.
3. **Solo si `toolsEnabled` del giro incluye `"searchCatalog"`**: avisa
   que ese giro usa catálogo con fotos y que se carga después desde
   `/console` (pestaña Catálogo) — es un aviso, no una pregunta; el
   catálogo lo llena el dueño del negocio, no tú.

No preguntes nada de esto si el usuario ya te lo dio todo en su mensaje
original — el objetivo es no dejar pasar algo importante, no interrogar
por interrogar.

**Alta de tenant nuevo (solo rol admin):**
```bash
curl -s -X POST "$RADAMANTIS_BASE_URL/api/admin/tenants" \
  -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"id":"<slug-unico>","name":"<Nombre del negocio>","verticalId":"<de /verticals>"}'
```
`id` es el identificador único elegido a mano (slug legible, ej.
`vet-ch`), no un UUID autogenerado. Esto SOLO crea la fila del tenant
con sus defaults — nada de lo que preguntaste arriba se guarda solo,
tienes que aplicarlo con las llamadas de las secciones de abajo
(`settings` para zona horaria, `channels` para el canal, y
`staff-members` más abajo si aplica) antes de dar el alta por
concluida.

**Guardar el staff (solo si preguntaste por él arriba):**
```bash
curl -s -X PUT "$RADAMANTIS_BASE_URL/api/admin/tenants/<id>/staff-members" \
  -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"staffMembers":["Ana","Carlos"]}'
```
Es el mismo campo que el dueño del negocio puede editar después desde
`/console` (Salud → Personal) — esto solo lo siembra al momento del
alta si ya sabes los nombres.

## Canales

**Ver qué canales tienen adaptador real hoy:**
```bash
curl -s "$RADAMANTIS_BASE_URL/api/admin/channels/supported" -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY"
```
Hoy solo devuelve Telegram — WhatsApp/Messenger/Instagram no están
construidos todavía (bloqueados por falta de credenciales Meta, ver
`docs/06-roadmap-agencia.md`). No prometas un canal que no aparezca
aquí.

**Vincular un canal (registra el webhook automáticamente):**
```bash
curl -s -X POST "$RADAMANTIS_BASE_URL/api/admin/tenants/<id>/channels" \
  -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"channel":"telegram","externalId":"<bot_token_de_botfather>"}'
```
Responde `{ok, webhookRegistered, webhookError?}` — si `webhookRegistered`
es `false`, revisa `webhookError` antes de dar el alta por concluida
(el registro de webhook reintenta ante 429 de Telegram, pero puede
fallar por otras razones, ej. token inválido).

**Rotar el token de un canal ya vinculado (solo rol admin)** — ej. el
usuario revocó el token por accidente en BotFather:
```bash
curl -s -X PUT "$RADAMANTIS_BASE_URL/api/admin/tenants/<id>/channels/telegram" \
  -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"externalId":"<nuevo_bot_token>"}'
```

## Base de conocimiento (RAG)

```bash
curl -s -X POST "$RADAMANTIS_BASE_URL/api/admin/tenants/<id>/kb" \
  -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"docs":[{"id":"doc-1","content":"texto plano del documento..."}, ...]}'
```
Cada doc necesita `id` (único dentro del tenant) y `content` (texto
plano — el endpoint genera el embedding y hace el upsert a Vectorize,
tú nunca llamas a OpenAI embeddings ni a Vectorize directo). Devuelve
`{ok, count}`. Correr esto de nuevo con el mismo `id` sobrescribe ese
documento (es un upsert).

## Configuración (tono, idioma, moneda, prompt, horario)

```bash
curl -s -X PUT "$RADAMANTIS_BASE_URL/api/admin/tenants/<id>/settings" \
  -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "tone": "calido",
    "language": "es",
    "currency": "MXN",
    "promptOverride": null,
    "timezone": "America/Mexico_City",
    "businessHours": {
      "mon": {"start":"09:00","end":"18:00"}, "tue": {"start":"09:00","end":"18:00"},
      "wed": {"start":"09:00","end":"18:00"}, "thu": {"start":"09:00","end":"18:00"},
      "fri": {"start":"09:00","end":"18:00"}, "sat": {"start":"09:00","end":"13:00"},
      "sun": null
    }
  }'
```
`businessHours`: un objeto por día (`mon`..`sun`), cada uno
`{start,end}` en `"HH:MM"` hora LOCAL del tenant, o `null` si ese día
está cerrado. Omitir un campo del body usa su default (ver el código
para los defaults exactos), pero **siempre manda el objeto completo si
vas a tocar cualquier campo** — este endpoint hace un upsert completo
de los campos que sí controla, aunque preserva automáticamente
`alertChatId`/`alertActivationCode`/`reviewLink`/`leadReengagementEnabled`
(esos se gestionan solo desde `/console`, nunca desde aquí).

## Calendario (Google)

```bash
# Estado
curl -s "$RADAMANTIS_BASE_URL/api/admin/tenants/<id>/calendar" -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY"
# {connected: false} o {connected: true, provider, calendarId, connectedAt}

# URL de consentimiento (el usuario debe abrirla en su navegador y autorizar — no lo puedes hacer tú)
curl -s "$RADAMANTIS_BASE_URL/api/admin/tenants/<id>/calendar/connect-url" -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY"
# {url: "https://accounts.google.com/..."}

# Desconectar
curl -s -X DELETE "$RADAMANTIS_BASE_URL/api/admin/tenants/<id>/calendar" -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY"
```
No hay manera de conectar un calendario sin la interacción del dueño
del negocio en su navegador (OAuth) — dale la URL, no intentes
simularlo.

## Consola del cliente (`/console`) — login del dueño del negocio

```bash
# Crear login (el dueño del negocio usará esto en /console)
curl -s -X POST "$RADAMANTIS_BASE_URL/api/admin/tenants/<id>/users" \
  -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"email":"dueno@negocio.com","password":"al-menos-8-caracteres"}'

# Resetear contraseña
curl -s -X PUT "$RADAMANTIS_BASE_URL/api/admin/tenants/<id>/users/password" \
  -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"email":"dueno@negocio.com","newPassword":"nueva-clave-de-al-menos-8"}'
```
La contraseña no es recuperable después de creada — solo reseteable.
Nunca generes tú una contraseña "fácil de adivinar"; si el usuario no
te da una, genera una aleatoria razonable y comunícasela una sola vez.

## Handoffs (conversaciones pausadas esperando a un humano)

```bash
curl -s "$RADAMANTIS_BASE_URL/api/admin/handoffs" -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY"          # solo abiertos
curl -s "$RADAMANTIS_BASE_URL/api/admin/handoffs?open=false" -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY" # todos

curl -s -X POST "$RADAMANTIS_BASE_URL/api/admin/handoffs/<id>/resolve" -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY"
```

## Uso (costos de OpenAI) — solo rol admin

```bash
curl -s "$RADAMANTIS_BASE_URL/api/admin/usage" -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY"
```
Devuelve `{usage: [{tenant_id, requests, prompt_tokens, completion_tokens}]}` — útil para proyectar costos antes de escalar a más clientes (ver regla permanente en `CLAUDE.md`).

## Equipo (Etapa Agencia — Equipo/roles, solo rol admin)

Gestión de PERSONAS que usan el panel admin (distinto de
`/tenants/:id/users`, que son logins de `/console` para el DUEÑO DEL
NEGOCIO). Roles: `admin` (acceso total) u `operador` (todo excepto
crear tenants, rotar token de canal, y ver `/usage`).

```bash
# Crear un miembro del equipo
curl -s -X POST "$RADAMANTIS_BASE_URL/api/admin/admin-users" \
  -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"email":"socio@radamantis.dev","password":"al-menos-8-caracteres","role":"operador"}'

# Listar el equipo
curl -s "$RADAMANTIS_BASE_URL/api/admin/admin-users" -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY"

# Resetear la contraseña de un miembro (por id, de la lista de arriba)
curl -s -X PUT "$RADAMANTIS_BASE_URL/api/admin/admin-users/<id>/password" \
  -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"newPassword":"nueva-clave-de-al-menos-8"}'

# Quitar el acceso de un miembro
curl -s -X DELETE "$RADAMANTIS_BASE_URL/api/admin/admin-users/<id>" -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY"
```

## Barridos bajo demanda (no esperar al cron de 30 min)

```bash
curl -s -X POST "$RADAMANTIS_BASE_URL/api/admin/no-show-sweep"    -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY"
curl -s -X POST "$RADAMANTIS_BASE_URL/api/admin/daily-report-sweep" -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY"
curl -s -X POST "$RADAMANTIS_BASE_URL/api/admin/cold-lead-sweep"  -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY"
```
Cada uno corre exactamente lo mismo que el Cron Trigger, de inmediato,
y devuelve un resumen de qué hizo — úsalos para verificar una
superpower sin esperar el tiempo real (ej. no re-envían dos veces el
mismo día/cita, así que correrlos de más no duplica nada).

## Depurar una conversación sin usar Telegram real

```bash
curl -s -X POST "$RADAMANTIS_BASE_URL/api/admin/tenants/<id>/test-message" \
  -H "Authorization: Bearer $RADAMANTIS_ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"chatId":"debug-1","text":"¿tienen citas mañana?"}'
```
Habla directo con el `ConversationAgent` real del tenant (mismo LLM,
mismo calendario conectado, misma KB) sin pasar por Telegram —
`channel` queda fijo en `"debug"` así que nunca se mezcla con
conversaciones reales. Reutiliza el mismo `chatId` entre llamadas para
mantener memoria de conversación dentro de una misma sesión de
prueba; usa uno distinto para empezar una conversación nueva. **No
sirve para voz/imágenes** (el endpoint es texto plano) — esas dos
requieren un mensaje real de Telegram para probarse.

## Lo que este Skill NO hace (a propósito)

- No gestiona canales sin adaptador real (WhatsApp/Messenger/Instagram)
  — no existen todavía, ver `/channels/supported`.
- No expone ni gestiona `/api/client/*` (eso es autoservicio del dueño
  del negocio desde `/console`, con su propio login — este Skill es
  para el super-admin).
- No reimplementa nada de lo que la API ya hace (generar embeddings,
  registrar webhooks, hashear contraseñas) — si una tarea no tiene
  endpoint, es una señal de que falta un endpoint, no de que haya que
  rodearlo con lógica propia.
