# Radamantis

Plataforma multi-tenant de asistentes virtuales con IA. Ver `CLAUDE.md` para contexto completo del proyecto (reglas, roadmap, decisiones de arquitectura).

## Estado
Etapa 10, Fase A y B completas — booking real: cada tenant conecta su propio Google Calendar desde `/admin` (OAuth) y el bot consulta disponibilidad y agenda citas por conversación (tool calling real del LLM), verificado con citas reales creadas/rechazadas en Telegram. Superpower "Recupera no-shows" también completo: cada cita agendada se le da seguimiento automático si su hora ya pasó sin confirmación. Consola del cliente en `/console`: cada tenant tiene su propio login (usuario/contraseña) y ve solo sus datos — stats, citas, clientes, salud, conversaciones con pausar/reactivar. Etapa 9 (alta de cliente self-service, sin CLI) y las etapas anteriores siguen completas — ver secciones abajo.

## Requisitos
- Node.js 20+
- Cuenta de Cloudflare (Free plan alcanza hasta Etapa 4; Etapa 5 requiere Workers Paid, $5/mes, por Vectorize)
- API key de OpenAI con billing activo (se usa desde Etapa 2)
- Bot de Telegram creado con [@BotFather](https://t.me/BotFather) (Etapa 1)

## Setup
```bash
npm install
npm run typecheck
npm test
```

## Etapa 1 — bot de eco en Telegram

1. Crea un bot con [@BotFather](https://t.me/BotFather) (`/newbot`) y guarda el token.
2. Define un secreto propio para validar los webhooks (cualquier string aleatorio largo).
3. Desarrollo local — crea `.dev.vars` (ya está en `.gitignore`, no lo commitees):
   ```
   TELEGRAM_BOT_TOKEN=<token de BotFather>
   TELEGRAM_WEBHOOK_SECRET=<tu string aleatorio>
   ```
   Luego `npx wrangler dev` y prueba con `curl` contra `/webhook/telegram` (ver `test/telegram.test.ts` para el shape del payload).
4. Producción — sube los secrets al Worker:
   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
   npx wrangler deploy
   ```
5. Registra el webhook en Telegram apuntando a tu Worker desplegado:
   ```bash
   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://<tu-worker>.workers.dev/webhook/telegram", "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"}'
   ```
6. Prueba de aceptación de Etapa 1: escríbele al bot en Telegram y confirma que responde exactamente lo mismo (eco).

## Etapa 2 — respuestas con GPT + usage_log

1. Crea la D1 (una sola vez): `npx wrangler d1 create radamantis` y copia el `database_id` resultante a `[[d1_databases]]` en `wrangler.toml`.
2. Aplica la migración:
   ```bash
   npx wrangler d1 execute radamantis --remote --file=migrations/0001_usage_log.sql
   ```
3. Sube el secret de OpenAI:
   ```bash
   npx wrangler secret put OPENAI_API_KEY
   ```
4. `npx wrangler deploy`.
5. Prueba de aceptación de Etapa 2: escríbele al bot en Telegram y confirma que responde con GPT (ya no es un eco literal). Verifica que quedó el registro de tokens:
   ```bash
   npx wrangler d1 execute radamantis --remote --command="SELECT * FROM usage_log ORDER BY id DESC LIMIT 5"
   ```

## Etapa 3 — memoria de conversación (Durable Object + D1)

Un `ConversationAgent` (Durable Object, uno por `tenantId:channel:chatId`) carga el historial de D1, arma `[system, ...historial, mensaje nuevo]`, llama al LLM y guarda ambos mensajes de vuelta en D1.

1. Aplica la migración de `messages`:
   ```bash
   npx wrangler d1 execute radamantis --remote --file=migrations/0002_messages.sql
   ```
2. `npx wrangler deploy` (el binding de Durable Objects y la migración `new_sqlite_classes` ya están en `wrangler.toml` — Workers Free requiere DO con storage SQLite).
3. Prueba de aceptación de Etapa 3: mándale al bot dos mensajes relacionados (ej. "me llamo X y tengo una mascota llamada Y" y luego "¿cómo se llama mi mascota?") y confirma que la segunda respuesta usa el dato del primer mensaje. Verifica el historial guardado:
   ```bash
   npx wrangler d1 execute radamantis --remote --command="SELECT * FROM messages ORDER BY id ASC"
   ```

## Etapa 4 — multi-tenant real (channel_bindings)

El token de cada bot de Telegram ya **no** es un secret de Worker: vive en la tabla `channel_bindings` (alta de canal = INSERT, sin `wrangler secret put` ni deploy, D8). El webhook es `/webhook/telegram/:botToken` — el mismo token de la URL sirve para resolver el tenant y para llamar a la API de Telegram.

1. Aplica la migración (crea `tenants` + `channel_bindings`, y siembra el tenant piloto + un segundo tenant de prueba):
   ```bash
   npx wrangler d1 execute radamantis --remote --file=migrations/0003_tenants.sql
   ```
2. Registra el canal de cada bot con un `INSERT` directo (nunca en un archivo versionado, para no filtrar el token):
   ```bash
   npx wrangler d1 execute radamantis --remote --command="INSERT INTO channel_bindings (channel, external_id, tenant_id) VALUES ('telegram', '<TOKEN_DEL_BOT>', '<TENANT_ID>')"
   ```
3. `npx wrangler deploy`, y re-registra el webhook de cada bot en Telegram con la nueva URL (incluye el token en el path):
   ```bash
   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://<tu-worker>.workers.dev/webhook/telegram/<TOKEN>", "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"}'
   ```
4. Prueba de aceptación de Etapa 4: `npm test` corre `test/isolation.test.ts`, un test dedicado (D3) que verifica que dos tenants con el mismo `channel`+`chat_id` nunca comparten historial. En producción, confirma que los mensajes nuevos llevan el `tenant_id` correcto:
   ```bash
   npx wrangler d1 execute radamantis --remote --command="SELECT id, tenant_id, chat_id, role FROM messages ORDER BY id DESC LIMIT 5"
   ```

## Etapa 5 — RAG básico (Vectorize)

Vectorize corre en el tier gratuito de Workers Free (30M dimensiones consultadas/mes, 5M almacenadas) — no requiere Workers Paid para un KB de este tamaño.

1. Crea el índice (una sola vez, dimensiones 1536 para `text-embedding-3-small`):
   ```bash
   npx wrangler vectorize create radamantis-kb --dimensions=1536 --metric=cosine
   ```
2. **Antes de cargar vectores**, crea el índice de metadata sobre `tenant_id` — sin esto, filtrar por tenant en las queries devuelve siempre 0 resultados, y Cloudflare **no reindexa retroactivamente** vectores ya insertados (hay que resembrarlos si el orden se invierte, como nos pasó):
   ```bash
   npx wrangler vectorize create-metadata-index radamantis-kb --property-name=tenant_id --type=string
   ```
3. Genera embeddings de la KB e insértalos (usa `upsert`, no `insert` — `insert` falla con error de auth en esta versión de wrangler contra el índice GA):
   ```bash
   OPENAI_API_KEY=<tu key> node scripts/seed-kb.mjs vet-ch kb/vet-ch.json /tmp/vectors.ndjson
   npx wrangler vectorize upsert radamantis-kb --file=/tmp/vectors.ndjson
   ```
4. `npx wrangler deploy`.
5. Prueba de aceptación de Etapa 5: pregúntale al bot algo que SÍ está en `kb/<tenant>.json` (ej. horario) y confirma que responde con el dato real; luego pregúntale algo que NO está (ej. si atienden una especie que no ofrecen) y confirma que dice que no tiene esa información en vez de inventar.

## Etapa 6 — superpowers CORE (anti-invento + handoff)

- **Blindaje anti-invento**: `CORE_ANTI_INVENTION_RULES` (`src/prompts.ts`) se incluye siempre en el prompt de sistema, no solo cuando hay contexto de KB — cubre disponibilidad de citas, diagnósticos y datos específicos de mascotas/clientes.
- **Handoff a humano**: `detectsHandoffRequest` (`src/handoff.ts`) detecta frases explícitas ("hablar con una persona", "operador", "es una emergencia", etc.). Al dispararse: se registra un `handoff` en D1, el bot responde una sola vez avisando que un humano va a contactar, y mientras el handoff siga sin resolver (`resolved_at IS NULL`) el bot **no vuelve a responder** en esa conversación — solo sigue guardando los mensajes.
- No hay migración nueva más allá de `0004_handoffs.sql`:
  ```bash
  npx wrangler d1 execute radamantis --remote --file=migrations/0004_handoffs.sql
  ```
- Para reactivar una conversación en handoff (manual hasta el dashboard de Etapa 8):
  ```bash
  npx wrangler d1 execute radamantis --remote --command="UPDATE handoffs SET resolved_at = datetime('now') WHERE tenant_id = '<TENANT>' AND channel = 'telegram' AND chat_id = '<CHAT_ID>' AND resolved_at IS NULL"
  ```
- Prueba de aceptación: (1) pregúntale al bot algo que requiera un sistema que no tiene (ej. disponibilidad de citas en tiempo real) y confirma que lo dice en vez de inventar; (2) escríbele una frase de handoff y confirma que responde una vez y luego se queda en silencio con el siguiente mensaje.

## Etapa 7 — Vertical Template declarativo

Cada tenant tiene un `vertical_id` (columna en `tenants`, ya existe desde Etapa 4). El router resuelve `{tenantId, verticalId}` en una sola query (`resolveTenant`) y se lo pasa al `ConversationAgent`, que carga el template correspondiente vía `getVerticalTemplate(verticalId)` (`src/verticals/registry.ts`).

Un `VerticalTemplate` (`src/verticals/types.ts`) define:
- `promptBase` — reemplaza el prompt fijo que hasta Etapa 6 vivía hardcodeado.
- `toolsEnabled` — hoy gatea dos capacidades reales: `searchKb` (si no está, no se llama a embeddings ni a Vectorize) y `handoffHuman` (si no está, `detectsHandoffRequest` ni se evalúa).
- `kbSchema` / `superpowersDefault` — documentación/config para cuando exista un editor de tenants (Etapa 8+); no se validan en runtime todavía.

**Agregar un giro nuevo = un archivo en `src/verticals/` + una línea en `registry.ts`.** No requiere tocar `agent.ts`, `index.ts` ni `prompts.ts` — es exactamente lo que prueba `test/verticals.test.ts` comparando el vertical `veterinaria` (con KB y handoff) contra `sandbox` (sin ninguno, ya asignado a `segundo-tenant-test` desde Etapa 4).

Prueba de aceptación: `npm test` (incluye `test/verticals.test.ts`), más una confirmación en vivo de que el bot piloto (`veterinaria`) sigue funcionando igual después del refactor (sin regresión).

## Etapa 8 / 8.5 — dashboard admin (D9)

Toda gestión de tenants vive primero como API (`/api/admin/*`, Hono sub-app en `src/admin/routes.ts`), protegida por `Authorization: Bearer <ADMIN_API_KEY>` (D10 — nunca Basic Auth). El dashboard en `/admin` (`src/admin/dashboardHtml.ts`) es solo un cliente de esa misma API.

1. Sube el secret de admin: `npx wrangler secret put ADMIN_API_KEY`.
2. Aplica las migraciones: `migrations/0005_admin_actions.sql` (auditoría) y `migrations/0006_tenant_settings.sql` (config en caliente).
3. `npx wrangler deploy`, abre `https://<tu-worker>.workers.dev/admin` y entra con la key.
4. Endpoints: `GET/POST /tenants`, `POST /tenants/:id/channels`, `GET /tenants/:id` (detalle + métricas), `PUT /tenants/:id/settings` (tono/idioma/moneda/override de prompt), `GET /verticals`, `GET/POST /handoffs`, `GET /usage`.
5. Prueba de aceptación: crear un tenant y vincular un canal desde el panel (sin `wrangler d1 execute` a mano); cambiar el tono de un tenant real y confirmar en el canal real que el registro de la respuesta cambia; abrir el detalle de un bot y ver métricas reales (mensajes in/out, conversaciones, handoffs abiertos).

Ver `docs/06-roadmap-agencia.md` para qué features del panel de Forja se aceptaron, se difirieron o se rechazaron, y por qué.

## Etapa 9 — pipeline de alta de cliente (D8)

Alta de cliente sin CLI, transaccional, en 3 llamadas (o 3 formularios del dashboard):

1. `POST /api/admin/tenants` — crea el tenant (id, name, verticalId).
2. `POST /api/admin/tenants/:id/channels` — vincula el canal; si es `telegram`, registra el webhook automáticamente contra la API de Telegram (con reintento si Telegram responde 429, `src/admin/telegramSetup.ts`) — ya no hace falta un `curl` manual como en Etapas 4-8.
3. `POST /api/admin/tenants/:id/kb` — recibe `{ docs: [{id, content}] }`, embebe cada doc (OpenAI) y hace `upsert` directo a Vectorize desde el Worker (`src/admin/kb.ts`) — ya no hace falta `scripts/seed-kb.mjs` ni `wrangler vectorize upsert` a mano.

Además, `PUT /api/admin/tenants/:id/channels/:channel` permite rotar el token de un canal ya vinculado (borra + re-inserta el `channel_binding` y re-registra el webhook) — se agregó tras un incidente real: Oscar revocó sin querer el token de un bot existente en BotFather al crear uno nuevo.

**Nota de calibración importante:** el umbral de relevancia del RAG (`MIN_RELEVANCE_SCORE` en `src/prompts.ts`) se bajó de 0.5 a 0.35 en esta etapa — con `text-embedding-3-small`, preguntas cortas reales en español pueden dar scores de 0.4-0.6 contra el documento correcto de la KB, y 0.5 estaba descartando respuestas legítimas.

Prueba de aceptación pasada: alta de un 3er cliente real (Sofía Estética, `@Asistente_sofiabot`, vertical `estetica`) — tenant + canal + KB en 36 segundos de llamadas a la API, confirmado con preguntas reales en Telegram.

## Etapa 10, Fase A — conexión OAuth (Google Calendar)

Cada tenant conecta **su propio** Google Calendar (no uno compartido) vía OAuth. Interfaz `CalendarProvider` (`src/calendar/provider.ts`) desacoplada del proveedor, D5-style — Google es el primer adaptador (`src/calendar/google.ts`), Outlook se agrega después sin tocar el core.

1. Crea un proyecto en [Google Cloud Console](https://console.cloud.google.com), habilita **Google Calendar API**, configura la pantalla de consentimiento OAuth (tipo External, agrega el scope `.../auth/calendar`, y mientras esté en modo prueba agrega como **test user** cada correo de Google que vaya a conectar un calendario), y crea credenciales **OAuth client ID** (tipo Web application) con este redirect URI exacto:
   ```
   https://<tu-worker>.workers.dev/oauth/google/callback
   ```
2. Sube los secrets: `npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_OAUTH_CLIENT_SECRET`.
3. Aplica la migración: `npx wrangler d1 execute radamantis --remote --file=migrations/0007_calendar_connections.sql`.
4. `npx wrangler deploy`, abre `/admin` → detalle de un tenant → sección "Calendario" → "Conectar Google Calendar".
5. Prueba de aceptación: confirmar que `calendar_connections` tiene la fila del tenant, y que una consulta real de `checkAvailability`/`freeBusy.query` con el token guardado devuelve datos reales del calendario (no simulados).

**Error común:** `Error 403: access_denied — no completó el proceso de verificación de Google`. Significa que el correo con el que intentaste conectar no está en la lista de **test users** de la pantalla de consentimiento (mientras la app no esté publicada/verificada por Google, solo esos correos pueden autorizarla).

`bookAppointment` revalida disponibilidad justo antes de crear el evento (blindaje anti-doble-cita) — nunca confía en lo que el LLM haya asumido antes de llamar a la tool.

## Etapa 10, Fase B — el bot agenda por conversación (tool calling real)

`LLMProvider`/`OpenAIProvider` soportan function calling real (`src/llm/provider.ts`, `src/llm/openai.ts`): el modelo puede pedir `checkAvailability`/`bookAppointment` (`src/calendar/tools.ts`), `agent.ts` las ejecuta contra `GoogleCalendarProvider` y hace una segunda llamada al LLM con los resultados para la respuesta final — solo el mensaje final se persiste en `messages`.

Dos piezas nuevas resuelven bugs reales encontrados probando en vivo con Telegram:

- **`src/calendar/timezone.ts`** — toda la conversión hora local ↔ UTC vive en código determinista; el modelo nunca hace esa aritmética (antes agendaba a una hora, o incluso un día, distinto al pedido).
- **`src/calendar/businessHours.ts`** — horario de atención modelado por día de la semana (`WeeklyBusinessHours`, migración `0010_weekly_business_hours.sql`), porque varía entre tenants/bots. `bookAppointment` valida contra la hora LOCAL derivada del valor recibido (nunca el string crudo, que a veces ya llega en UTC).

Configuración de horario y zona horaria: dashboard → detalle de tenant → sección de horario semanal (`timezone` + un `DaySchedule` por día, `null` = cerrado ese día).

Prueba de aceptación pasada: en el bot piloto (`vet-ch`), el bot rechazó agendar fuera de horario, rechazó un día cerrado, agendó correctamente respetando zona horaria y horario de sábado, y pidió/reutilizó los datos estándar del cliente (nombre, contacto, motivo) antes de confirmar — todo verificado contra el Google Calendar real, con log de auditoría de cada tool call visible vía `wrangler tail`.

### Herramienta de debug: reproducir conversaciones sin Telegram

`POST /api/admin/tenants/:id/test-message` (body `{chatId, text}`) habla directo con el `ConversationAgent` real de un tenant — mismo LLM, mismo `GoogleCalendarProvider`, mismas reglas de horario — sin pasar por Telegram, y devuelve `{replyText}` de inmediato. Usa `channel: "debug"` fijo, así que nunca se mezcla con historial real; reutiliza el mismo `chatId` para mantener memoria de conversación entre llamadas de una misma prueba. Estas conversaciones sí escriben en `messages`/`usage_log` reales (consumen tokens de OpenAI y llamadas reales a Google) — límpialas después con `DELETE FROM messages/usage_log WHERE tenant_id=? AND channel='debug'` para no inflar las métricas del dashboard del tenant.

Con esta herramienta se encontraron y corrigieron 4 bugs reales de booking (2026-08-29):

1. El modelo a veces decía "voy a agendar la cita" sin llamar a `bookAppointment` en ese mismo turno — la cita se creaba (o no) un turno después. Prompt reforzado: llamar la tool de inmediato en cuanto estén los 4 datos.
2. `checkAvailability` con un rango degenerado (`rangeStart == rangeEnd`) hacía que Google rechazara con 400 y esa excepción tumbaba toda la petición — en Telegram real, el bot se quedaba mudo. `src/calendar/tools.ts` ahora valida el rango y envuelve las llamadas al proveedor en try/catch.
3. Sin saber qué día de la semana es "hoy", el modelo calculaba mal fechas relativas. `weekdayNameEs()`/`upcomingWeekdaysEs()` (`src/calendar/timezone.ts`) le dan una tabla de los próximos 21 días ya resuelta.
4. Incluso con esa tabla, el modelo llegó a alucinar que una fecha real "no existe". `src/calendar/dateParser.ts` resuelve en código (no LLM) las fechas que el cliente menciona ("hoy", "mañana", "el próximo lunes", "31 de agosto") y se las entrega ya calculadas.

## Etapa 10 — superpower "Recupera no-shows"

Cada vez que `bookAppointment` agenda con éxito, se guarda un rastro local en D1 (`appointments`, migración `0011_appointments.sql`) — Google Calendar no nos devuelve el `chat_id`/canal necesario para volver a contactar al cliente.

`src/noShowSweep.ts` corre el barrido: toda cita cuya hora de fin ya pasó (con 30 min de margen, `GRACE_PERIOD_MS`) y no tiene seguimiento se trata como posible no-show — no existe ninguna señal real de si el cliente llegó o no, así que se contacta siempre, como touchpoint de recuperación/reagendado, no como acusación. El mensaje es una plantilla fija en código (`buildNoShowMessage`, no generada por el LLM) para que sea 100% predecible. Queda acotado automáticamente a los giros con agenda: `appointments` solo se llena para verticales que ya tienen `bookAppointment` habilitado, sin necesidad de un flag nuevo.

Dos formas de dispararlo:
- **Cron Trigger** (`wrangler.toml`, `*/30 * * * *`) — producción, automático.
- **`POST /api/admin/no-show-sweep`** — bajo demanda, para probar sin esperar al cron o para forzar una corrida si el cron falló. Responde `{processed, sent, errors}`.

Una cita ya atendida no se vuelve a contactar (`no_show_followup_sent_at` se marca solo tras un envío exitoso); si el envío falla (canal no soportado, token inválido), el error queda en la respuesta y la cita se reintenta en la siguiente corrida.

## Etapa 10 — consola del cliente

Superficie separada del panel de super-admin (`/admin`) — cada tenant tiene su propio login en `/console`, con acceso solo a sus propios datos.

**Auth (D10):** usuario/contraseña por tenant, tabla `tenant_users` (migración `0012_tenant_users.sql`). Contraseñas con PBKDF2 vía Web Crypto (`src/client/passwords.ts`, sin dependencia externa tipo bcrypt). Sesión: un token firmado HMAC-SHA256 (`src/client/session.ts`, 7 días de vigencia), no un JWT completo — evita la superficie de ataque de negociar el algoritmo de firma. **Toda ruta de `/api/client/*` obtiene el `tenant_id` del token verificado, nunca de un parámetro de la URL** — es la garantía de que un cliente jamás ve datos de otro tenant.

Crear el login de un cliente (lo hace Oscar, al dar de alta el tenant o después):
```
POST /api/admin/tenants/:id/users   { email, password }   (mín. 8 caracteres)
PUT  /api/admin/tenants/:id/users/password   { email, newPassword }
```

Qué ve el cliente en `/console`:
- **Resumen:** mensajes recibidos/respondidos hoy, clientes distintos hoy, gráfica de actividad de los últimos 7 días.
- **Citas:** próximas y recientes, desde la misma tabla `appointments` de "Recupera no-shows".
- **Clientes:** un renglón por hilo de conversación (`channel`+`chat_id`); el nombre/contacto solo aparece si ese hilo ya generó una cita — sin booking no hay identidad real que mostrar.
- **Salud:** estado de conexión simple (Telegram conectado, Google Calendar conectado, última actividad del asistente) — decisión explícita de Oscar: datos ya en D1, sin llamadas de red en vivo en cada carga de la consola.
- **Conversaciones:** lista con vista de mensajes, y **el cliente puede pausar/reactivar su propia conversación** (reutiliza `handoffs` de Etapa 6 vía la nueva `resolveHandoffByRef()` en `src/handoff.ts`, que resuelve por `channel`+`chat_id` en vez de por id de handoff).

Identidad visual propia (`src/client/consoleHtml.ts`): verde esmeralda + ámbar, tipografía Poppins/Open Sans — deliberadamente distinta tanto de la paleta Slate/Indigo del panel admin como de la terracota del bot (decisión explícita de Oscar, para que la consola se sienta "del cliente", no la del operador).

### Manejo de chats: responder desde la consola

Además de pausar/reactivar, el negocio puede **responder de verdad** a un cliente directo desde `/console`, sin salir a la app de Telegram:

```
POST /api/client/conversations/:channel/:chatId/send   { text }
```

El mensaje se manda por la API real de Telegram, se guarda en `messages` con `role="assistant"` (para que el cliente lo vea igual que una respuesta del bot, y para que el LLM lo tenga en contexto si la conversación se reactiva) pero con la nueva columna `sent_by='human'` (migración `0013_messages_sent_by.sql`) para que la consola lo distinga visualmente ("Tú" en vez de "Bot"). **El bot se pausa automáticamente** al mandar una respuesta manual si no lo estaba ya — evita que el LLM le conteste encima al cliente sobre algo que el humano ya resolvió; no crea un segundo handoff si la conversación ya estaba pausada.

Solo soporta Telegram por ahora — otros canales devuelven un error explícito hasta que existan.

### Preparado para multi-canal (D5-style)

El envío de mensajes (respuesta manual, recupera no-shows, y el registro de webhook al vincular un canal) pasa por una interfaz `ChannelProvider` (`src/channels/provider.ts`), mismo patrón ya usado para `LLMProvider` y `CalendarProvider`:

```ts
interface ChannelProvider {
  channel: string;
  displayName: string;
  sendMessage(externalId: string, chatId: string, text: string): Promise<void>;
  registerWebhook?(origin: string, externalId: string, webhookSecret: string): Promise<{ ok: boolean; error?: string }>;
}
```

Hoy solo existe `src/channels/telegram.ts`, registrado en `src/channels/registry.ts` (`getChannelProvider(channel)`). Agregar WhatsApp/Messenger/Instagram cuando haya credenciales reales de Meta es: un archivo nuevo en `src/channels/` implementando la interfaz + una línea en el registro — sin tocar `noShowSweep.ts`, `client/routes.ts` ni `admin/routes.ts`, que ya solo hablan con `ChannelProvider`, nunca comparan contra `"telegram"` directamente. `GET /api/admin/channels/supported` expone el catálogo real (hoy solo Telegram).

## Etapa 10 — superpower "Vigilante" (alertas proactivas)

Antes, cuando el bot detectaba que un cliente pedía un humano, se pausaba **en silencio** — nadie se enteraba hasta revisar `/admin` o `/console`. Ahora se le avisa al dueño del negocio en tiempo real por Telegram (`src/vigilante.ts`, `notifyBusinessOwner`, best-effort — si la alerta falla, el handoff ya se creó de todas formas, eso es lo que importa).

Dos disparadores, ambos crean un handoff (el bot se pausa) y mandan la alerta:
1. **Petición explícita de humano** — ya existía (`detectsHandoffRequest`, Etapa 6).
2. **Cliente molesto/frustrado** — nueva `detectsUrgentSentiment` en `src/handoff.ts`, misma detección determinista y curada por palabras clave (no un scoring de sentimiento con IA — eso queda como mejora futura, ver `docs/05-arquitectura-radamantis.md` §7).

**Cómo el dueño activa sus alertas (autoservicio desde `/console`, decisión de Oscar — sin que Oscar tenga que configurarlo por él):** Telegram no expone el `chat_id` de nadie en ningún lado de su interfaz, así que en vez de pedirle al dueño que lo busque:

1. La consola (pestaña Salud) genera un código único por tenant (`GET /api/client/alert-settings`, guardado en `tenant_settings.alert_activation_code`).
2. El dueño le manda ese código, tal cual, a su propio bot por Telegram — una sola vez.
3. El webhook (`src/index.ts`) lo detecta **antes** de entrar al flujo normal del agente, guarda su `chat_id` (`alert_chat_id`) y le contesta confirmando.
4. `DELETE /api/client/alert-settings` desactiva las alertas (borra `alert_chat_id`, conserva el código por si las quiere reactivar después mandándolo de nuevo).

Refactor de paso: `upsertTenantSettings` se movió de `admin/repository.ts` a `tenants.ts` (junto a `getTenantSettings`/`TenantSettings`, su lugar natural) porque ahora lo escriben tanto `/admin` (tono/idioma/etc.) como `/console` (alertas) — ninguno de los dos debe depender del otro. `PUT /tenants/:id/settings` preserva `alertChatId`/`alertActivationCode` explícitamente para que guardar la config del negocio nunca los borre por accidente.

## Etapa 10 — superpower "Reporte diario"

Cada mañana, si el dueño ya activó alertas (sección anterior), también recibe un resumen del día anterior por Telegram — mismo `alert_chat_id`, mismo `ChannelProvider`, sin configuración adicional.

`src/dailyReport.ts` (`runDailyReportSweep`) corre en el mismo Cron Trigger que "Recupera no-shows" (`*/30 * * * *`) y también vía `POST /api/admin/daily-report-sweep` para probar bajo demanda. Dispara a las **8am hora local del tenant** (usa `utcToLocalDateTimeString` para no mandarle el reporte de madrugada a un negocio en otro huso horario), pero el **rango de datos** que resume ("ayer") usa el día calendario UTC — misma simplificación ya aceptada en las estadísticas de la consola (`getTodayStats`/`getWeeklyActivity`), no vale la pena la complejidad de fronteras exactas por zona horaria solo para este resumen.

Contenido: mensajes recibidos/respondidos ayer, clientes distintos, citas agendadas, y conversaciones esperando atención ahora mismo. `tenant_settings.last_daily_report_date` (migración `0015_daily_report.sql`) evita mandarlo dos veces el mismo día — vive fuera de `TenantSettings`/`upsertTenantSettings` a propósito: es estado interno del barrido, nunca algo que `/admin` o `/console` deban poder pisar.

## Documentación
- `docs/05-arquitectura-radamantis.md` — arquitectura completa (Fase 2)
- `docs/06-roadmap-agencia.md` — ampliación de roadmap hacia modelo de agencia (Etapa 8.5)
- `docs/identidad-visual.md` — paletas de marca
