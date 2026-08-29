# RADAMANTIS — contexto del proyecto

## Qué es esto
Plataforma multi-tenant de asistentes virtuales con IA (Telegram/WhatsApp/Instagram), construida como alternativa propia a Forja (github.com/santmun/forja) — sin código propietario de Forja+.

## Estado
- Fase 1 (reverse engineering de Forja): completa.
- Fase 2 (arquitectura propia de Radamantis): completa y aprobada. Ver `docs/05-arquitectura-radamantis.md`.
- Fase 3 (implementación): en curso, Etapa 10. Etapas 0-9 completas. Bot de Telegram piloto "Dr. Vet CH" (@Dr_Vet_CH_bot) desplegado en `radamantis.latinosworkflowmxag.workers.dev`: GPT-4o-mini (OpenAI), memoria de conversación (Durable Object + D1), multi-tenant real con aislamiento probado (D3), RAG con Vectorize (D4), superpowers CORE (D7: anti-invento + handoff), Vertical Template declarativo (D6, ya con 2 giros reales: veterinaria + estetica), y dashboard admin (D9: API `/api/admin/*` + UI en `/admin`, auth por `ADMIN_API_KEY`) con vista de bots (sidebar + cards), detalle por tenant (métricas reales, config en caliente, override de prompt, edición de token de canal) — paleta Slate/Indigo, ver `docs/identidad-visual.md`.
- Etapa 9 (pipeline de alta de cliente, D8): alta de tenant + canal (con auto-registro de webhook de Telegram, con reintento ante 429) + carga de KB (embeddings + upsert a Vectorize) todo vía API/dashboard, sin CLI. Probado con un 3er cliente real (Sofía Estética, @Asistente_sofiabot) en 36s de llamadas. En el camino se calibró el umbral de relevancia del RAG (0.5 → 0.35; scores reales de text-embedding-3-small para preguntas cortas en español caen en 0.4-0.6 incluso siendo el match correcto) y se agregó rotación de token de canal (Oscar revocó por accidente el token de vet-ch en BotFather mientras creaba el bot nuevo).
- Roadmap ampliado tras revisar el panel de Forja con Oscar: ver `docs/06-roadmap-agencia.md` (principio de no copiar copy/IP de Forja, clasificación de features aceptadas/diferidas/rechazadas, Equipo/roles y White-label aceptados como backlog de Agencia, CLI tipo `forjabot` rechazado explícitamente).
- Etapa 10 (Fase A + Fase B, booking real — COMPLETA): conexión OAuth de Google Calendar por tenant (`src/calendar/`, `CalendarProvider` desacoplado D5-style, tokens en D1 `calendar_connections`), rutas admin de conectar/desconectar, UI en el dashboard (Fase A). Tool calling real en `LLMProvider`/`OpenAIProvider` + orquestación en `agent.ts`: el bot consulta disponibilidad y agenda citas por conversación contra `GoogleCalendarProvider` (Fase B). Conversión hora local↔UTC 100% determinista en código (`src/calendar/timezone.ts`, nunca la hace el LLM) y horario de atención modelado por día de la semana (`WeeklyBusinessHours`, `src/calendar/businessHours.ts`, migración 0010) porque varía entre tenants/bots. Verificado con citas reales creadas/rechazadas en el Google Calendar de `vet-ch` (zona horaria, horario entre semana vs. sábado, día cerrado, datos estándar del cliente antes de agendar). Requisito de negocio original: las citas deben poder registrarse en Google Calendar y/o Outlook primero; la app web propia es solo el último recurso. Ver memoria `project-etapa7-booking-requirements`.
- Etapa 10, ronda 2 de bugs de booking (2026-08-29): se agregó `POST /api/admin/tenants/:id/test-message`, herramienta de debug que habla directo con el `ConversationAgent` real (sin Telegram) para reproducir conversaciones bajo demanda. Con eso se encontraron y corrigieron 4 bugs reales: el modelo a veces no llamaba a `bookAppointment` en el mismo turno en que ya tenía los 4 datos; un rango degenerado en `checkAvailability` (rangeStart==rangeEnd) tumbaba toda la petición (bot mudo en Telegram — probable causa raíz de "sigue fallando"); el modelo calculaba mal días de la semana relativos sin una tabla de referencia; e incluso con esa tabla, seguía alucinando que fechas reales "no existen" cerca de fin de mes. Este último se resolvió con `src/calendar/dateParser.ts`, un parser determinista de fechas en español (no LLM) que resuelve la fecha mencionada por el cliente en código y se la entrega ya calculada al modelo.
- Etapa 10, superpower "Recupera no-shows" (2026-08-29, COMPLETA): toda cita agendada con éxito se registra en D1 (`appointments`, migración 0011) porque Google Calendar no devuelve el chat_id/canal necesario para recontactar al cliente. `src/noShowSweep.ts` corre cada 30 min (Cron Trigger, `wrangler.toml`) o bajo demanda (`POST /api/admin/no-show-sweep`): toda cita cuya hora ya pasó (30 min de margen) sin seguimiento se trata como posible no-show — no hay señal real de asistencia, así que se contacta siempre, como touchpoint de recuperación/reagendado (decisión de producto confirmada con Oscar), con una plantilla fija (no generada por el LLM). Queda automáticamente acotado a verticales con agenda (la tabla solo se llena cuando `bookAppointment` está habilitado), sin flag nuevo. Verificado en producción con una cita de prueba real recibida en Telegram.
- Etapa 10, consola del cliente (2026-08-29, D10, COMPLETA): nueva superficie en `/console` (`src/client/`), separada del panel de super-admin — cada tenant tiene su propio login (usuario/contraseña, tabla `tenant_users`, migración 0012), con sesión firmada HMAC (`CLIENT_SESSION_SECRET`) y hashing PBKDF2 vía Web Crypto (sin dependencias externas). Todas las rutas de `/api/client/*` derivan el `tenant_id` del token de sesión, nunca de la URL — aislamiento garantizado. El cliente ve: mensajes/clientes únicos de hoy, gráfica de actividad de 7 días, citas próximas/recientes, clientes únicos (con nombre solo si ya agendaron), salud simple de conexión (Telegram/Calendar/última actividad, sin llamadas de red en vivo), y puede pausar/reactivar sus propias conversaciones (reutiliza `handoffs` de Etapa 6, nueva `resolveHandoffByRef`). Identidad visual propia (verde esmeralda + ámbar, Poppins/Open Sans) — decisión explícita de Oscar de que fuera distinta tanto de su panel admin como del bot, tras pegar el copy de marketing de Forja+ (clasificado, no copiado — ver `docs/06-roadmap-agencia.md`). Oscar crea el login de cada cliente vía `POST /api/admin/tenants/:id/users`. Verificado visualmente por Oscar en el navegador.
- Etapa 10, consola del cliente — manejo de chats (2026-08-29, COMPLETA): el negocio puede responder de verdad por Telegram directo desde `/console` (`POST /api/client/conversations/:channel/:chatId/send`), sin salir a la app. Se guarda en `messages` con `role="assistant"` + nueva columna `sent_by='human'` (migración 0013) para distinguirlo de una respuesta del bot en la UI. Pausa el bot automáticamente si no lo estaba (nunca crea un segundo handoff si ya estaba pausado). Disparado por un pantallazo real que Oscar compartió del panel en vivo de Forja+ (confirma que la función existe ahí — pero se construyó con nombres/diseño propios, sin las categorías de sentimiento ni el botón "Sugerir" que aparecen en Forja, que son features aparte no pedidas). Verificado end-to-end: mensaje real recibido en Telegram, confirmado por Oscar visualmente en la consola.
- Etapa 10, preparación multi-canal (2026-08-29, COMPLETA): abstracción `ChannelProvider` (`src/channels/`, mismo patrón D5 que `LLMProvider`/`CalendarProvider`) — hoy solo Telegram tiene adaptador real (`src/channels/telegram.ts`, movido desde `admin/telegramSetup.ts`), pero cada tenant va a elegir su propio canal (WhatsApp, Messenger, Instagram) según su negocio. Se quitaron los `if (channel === "telegram")` sueltos en alta/rotación de canal, recupera no-shows y respuesta manual desde la consola — los tres pasan por `getChannelProvider()` ahora, así que agregar un canal nuevo no toca ese código. Nuevo `GET /api/admin/channels/supported` (API-first). No se construyó ningún adaptador de WhatsApp/Messenger/Instagram — no hay credenciales/specs reales todavía, sería especulativo.

## Reglas permanentes
- Multi-tenant desde el diseño: todo dato lleva `tenant_id`; nunca 1 deploy = 1 cliente.
- Alta de cliente = configuración (fila en DB), nunca código nuevo por cliente.
- Nuevo giro = nuevo Vertical Template declarativo, cero cambios al core.
- Capa LLM desacoplada vía interfaz `LLMProvider`: OpenAI es el proveedor por default; Anthropic debe poder añadirse sin reescribir el sistema.
- API-first: toda gestión de tenants/verticales existe como endpoint HTTP desde el día 1 — el futuro Skill de Claude solo consumirá esa API, nunca reimplementará lógica.
- No hacer commits/deploys destructivos sin confirmación explícita del dueño (Oscar).
- Al documentar decisiones nuevas, distinguir siempre: CONFIRMADO / INFERIDO / DESCONOCIDO.
- No implementar los superpowers 9-12 (encuestas, no-shows, reseñas, cobros WhatsApp) hasta Etapa 10 — no tienen evidencia de código en Forja, son desarrollo nuevo, no portar nada.
- No usar Basic Auth para admin — JWT/API-key por tenant + Cloudflare Access para super-admin (decisión D10 en el doc de arquitectura).
- No mezclar lógica de vertical/tenant dentro del core.

## Etapas (desarrollo incremental — detalle completo en docs/05-arquitectura-radamantis.md §8)

| Etapa | Objetivo | Prueba de aceptación |
|---|---|---|
| 0 | Identidad + fundación | Repo clona y CI corre en verde sin lógica de negocio |
| 1 | Core skeleton | Mensaje de Telegram sandbox → responde eco |
| 2 | LLM real | Bot responde con GPT usando prompt de sistema simple |
| 3 | Persistencia con tenant_id | Bot recuerda contexto entre mensajes de una conversación |
| 4 | Segundo tenant + aislamiento | 2 tenants; test explícito de que uno no ve datos del otro |
| 5 | RAG básico | Bot responde con datos reales de KB y rechaza inventar (requiere Cloudflare Workers Paid, $5/mes, por Vectorize) |
| 6 | Superpowers CORE | Blindaje anti-invento + Handoff a humano |
| 7 | Vertical Template piloto | Veterinaria como template declarativo, sin tocar core |
| 8 | Dashboard admin mínimo | UI de solo lectura + alta manual |
| 9 | Pipeline de alta de cliente | Alta de un 3er cliente real en <5 min sin tocar código |
| 10 | Superpowers restantes + Claude Skill | Los 4 superpowers sin evidencia en Forja + Skill como cliente de la API admin |

No avanzar de etapa sin pasar la prueba de aceptación de la etapa actual.

## Piloto real
- Giro: veterinaria (gestión de citas + historial médico de mascotas).
- Canal: Telegram primero, WhatsApp después.
- Un solo consultorio para probar, pero modelado multi-tenant desde el schema (no un atajo de single-tenant).

## Infraestructura confirmada
- Cloudflare: Free plan cubre Etapas 0-4 (Workers, D1, Durable Objects, R2). Vectorize (Etapa 5) también tiene tier gratuito en Workers Free (30M dimensiones de vector consultadas/mes, 5M almacenadas) — no requiere Workers Paid para prototipar; verificado en developers.cloudflare.com/vectorize/platform/pricing el 2026-08-28 (corrige una suposición anterior de este documento).
- OpenAI: API key con billing activo ya disponible (no es la suscripción ChatGPT Plus/Pro — son cuentas distintas).
- LLM principal: OpenAI. Anthropic debe quedar enchufable sin reescribir el core (ver D5 en el doc de arquitectura).
- Costos: sin límite fijo aún; instrumentar tabla `usage_log` (tokens OpenAI, requests Cloudflare) desde Etapa 2 para proyectar antes de escalar a ~10 clientes.

## Identidad visual
- Nombre interno del proyecto: Radamantis (nombre comercial se define después, no unificar todavía).
- Paleta cliente (Telegram, futuras landing/booking): opción A — calidez terracota. Primario `#D85A30`, fondo `#FAECE7`, acento `#639922`, texto `#712B13`.
- Paleta consola admin: opción C — azul + teal. Fondo `#04342C`, primario `#378ADD`, acento `#1D9E75`, texto sobre fondo oscuro `#E1F5EE`.
- Detalle completo (todas las opciones evaluadas) en `docs/identidad-visual.md`.

## Documentos de referencia
- `docs/05-arquitectura-radamantis.md` — arquitectura completa: 10 decisiones (D1-D10), diagrama, esquema de Vertical Template, matriz Forja→Radamantis, roadmap, riesgos abiertos.
- `docs/identidad-visual.md` — paletas evaluadas y decisión final.
