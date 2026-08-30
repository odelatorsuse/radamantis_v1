---
título: Radamantis — Ampliación de roadmap hacia modelo de agencia
proyecto: Radamantis
fecha: 2026-08-28
contexto: adenda a docs/05-arquitectura-radamantis.md, escrita durante la implementación de Etapa 8 (Fase 3)
estado: APROBADA por Oscar (decisiones de ambición/prioridad/LLM confirmadas explícitamente)
---

# Por qué existe este documento

Al probar el dashboard mínimo de Etapa 8, Oscar compartió una descripción muy completa del panel de administración de **Forja** (la referencia original del proyecto): sidebar de navegación completo, vista de detalle por bot con métricas, config en caliente, múltiples canales, un CLI (`forjabot`) con decenas de comandos, integraciones tipo Composio, plantillas de WhatsApp, selector multi-LLM, paneles de analítica, 14 giros, Equipo/roles, White-label y Marketplace.

Esto obliga a dos aclaraciones antes de seguir construyendo:

## Principio de seguridad de IP

**Replicar funcionalidad observada en Forja está permitido** — es lo que ya hicimos con el patrón Router + Durable Object, y con las decisiones D1-D10 de `05-arquitectura-radamantis.md`. **Copiar su texto, su copy comercial, sus nombres de comandos/skills o las taglines exactas de sus 14 giros no está permitido** — el charter del proyecto es explícito: *"alternativa propia a Forja — sin código propietario de Forja+"*. Cualquier feature equivalente que construyamos usa nuestra propia redacción, nombres y flujo de UX.

## Decisiones de Oscar (2026-08-28)

| Pregunta | Respuesta |
|---|---|
| ¿Ambición del proyecto? | Sí quiere terminar revendiendo a más clientes/agencias — Equipo/roles, White-label y Marketplace **sí entran al roadmap**, como trabajo futuro (no ahora). |
| ¿Prioridad de panel a corto plazo? | Detalle de bot con estado+métricas, config en caliente (tono/idioma/moneda), editor de prompt por tenant, UI para más canales — las 4. |
| ¿Multi-LLM? | Se mantiene una sola key compartida nuestra (OpenAI, con Anthropic enchufable vía D5, interfaz `LLMProvider`). Sin BYO-LLM por ahora. |

## Clasificación de lo que Oscar pegó de Forja

| Feature de Forja | Veredicto | Nota |
|---|---|---|
| Multi-bot / multi-cliente | Ya cubierto | Etapa 4 (multi-tenant real, `channel_bindings`). |
| 14 giros | Ya cubierto (mecanismo) | Etapa 7 (Vertical Template declarativo). Contenido de más giros es trabajo futuro, uno a la vez, sin copiar las taglines de Forja. |
| Alta de cliente self-service | Ya cubierto (planeado) | Etapa 9 del roadmap original. |
| Blindaje anti-invento / Handoff | Ya cubierto | Etapa 6 (superpowers CORE), confirmado en producción. |
| Encuestas, no-shows, reseñas, cobros WhatsApp | Ya cubierto (planeado) | Etapa 10 — regla existente: sin evidencia de código en Forja, se construyen desde cero. |
| Vista de bot: estado + métricas | **Aceptado, corto plazo** | Etapa 8.5 (este documento). |
| Config en caliente (tono/idioma/moneda) | **Aceptado, corto plazo** | Etapa 8.5. |
| Editor de prompt por tenant | **Aceptado, corto plazo** | Etapa 8.5 (versión mínima: un solo override de texto, sin A/B testing ni versionado todavía). |
| Más canales (UI de conexión) | **Aceptado, corto plazo (parcial)** | Etapa 8.5 deja la UI preparada (selector con "próximamente"); la integración real de WhatsApp/Instagram es trabajo aparte que requiere que Oscar consiga credenciales de Meta/Twilio primero. |
| Equipo / roles | **Completa (2026-08-29)** | Login propio por persona (admin_users, roles admin/operador), `ADMIN_API_KEY` sigue como llave maestra. Ver `CLAUDE.md`. |
| White-label | **Aceptado, roadmap futuro (Agencia)** | Ya anticipado como capa "AGENCY" en el diagrama de `05-arquitectura-radamantis.md` §3. Branding por agencia revendedora, no por Forja. |
| Marketplace | **DESCONOCIDO** | Solo idea, sin caso de uso ni diseño. No se planifica en detalle todavía. |
| CLI tipo `forjabot` por cliente | **Rechazado** | Contradice D1 (Radamantis es 1 Worker multi-tenant, nunca 1 deploy por cliente). El equivalente de Radamantis ya está en el roadmap: la API admin (D9) + el futuro Claude Skill (Etapa 10) que la consume. |
| Composio (integraciones genéricas) | **DESCONOCIDO** | Sin caso de uso confirmado para el piloto veterinario. No se planifica. |
| Selector multi-LLM (BYO-LLM) | **Diferido** | Decisión explícita de Oscar: seguimos con key compartida por ahora. Revisar cuando haya varios tenants pagando su propio consumo. |
| Plantillas de WhatsApp (HSM) | **Diferido** | Solo tiene sentido una vez exista el canal WhatsApp (ya en el roadmap grande, Fase 3 — Channels). |
| Paneles de analítica avanzados (Analista IA/Insights, sentiment) | **Ya cubierto (planeado)** | D7: "Vigilante con IA" — CORE (salud) + TOGGLE (sentimiento, plan Pro). No es parte de Etapa 8.5. |
| Prompt engineering avanzado (A/B testing, versionado, auditoría) | **Backlog, sin fecha** | El editor de prompt de Etapa 8.5 es la versión mínima. Versionado/A-B testing quedan como mejora futura opcional. |

## Segunda ronda: consola del cliente + clasificación de los 12 superpowers de Forja+ (2026-08-29)

Oscar pidió una consola separada por tenant (para el dueño del negocio, no para él como operador) y pegó el copy de marketing completo de Forja+ ("Los 12 superpowers de Forja+" + panel de análisis). Mismo principio de IP que arriba: se clasifica qué ya está cubierto, qué es nuevo, y nada se construye con los nombres/taglines de Forja — ver `docs/05-arquitectura-radamantis.md` §7 para la tabla original de los 12 superpowers (numerados 1-12 ahí, con nombres propios de Radamantis, no los de Forja).

| # (§7) | Estado a 2026-08-29 |
|---|---|
| 1, 2, 3, 4, 6, 7, 8, 9, 10, 11 | **Ya cubiertos** (anti-invento, alertas proactivas al dueño ["Vigilante", parcial — detección determinista, no scoring de sentimiento con IA], handoff, reenganche de leads fríos, tono configurable, reporte diario automático, idioma configurable, no-shows, encuesta de satisfacción, pide reseñas — estos tres últimos unificados en un solo seguimiento post-cita, ver `CLAUDE.md`). |
| Mejoras (detecta huecos de conocimiento) | **Ya cubierto** (2026-08-29) — registra preguntas sin match relevante en el RAG; el dueño decide qué agregar, el bot nunca edita su propia KB. |
| 5 (voz/imágenes) | **Ya cubierto** (2026-08-29) — "Oído y vista": voz e imágenes se transcriben/describen a texto antes de entrar al agente, reutilizando todo el pipeline existente. Ver `CLAUDE.md`. |
| 12 (cobros por WhatsApp) | No construido — además bloqueado hasta que exista el canal WhatsApp. |
| Campañas (difusión segmentada) | No construido — bloqueado hasta que exista WhatsApp. |

**Consola del cliente — aceptada, construida esta misma ronda (Etapa 10):** portal en `/console`, login propio por tenant (usuario/contraseña — decisión de Oscar, más familiar para un dueño de negocio no técnico que una API key), identidad visual propia (verde esmeralda + ámbar, ni la paleta admin ni la del bot). Contenido: stats de hoy, gráfica de 7 días, citas, clientes únicos, salud simple de conexión, conversaciones con pausar/reactivar (el cliente sí puede, no solo Oscar). Ver `CLAUDE.md` para el detalle técnico.

**Ampliaciones sobre la consola, misma ronda:**
- **Manejo de chats (responder desde el panel):** disparado por otro pantallazo real de Oscar (el panel en vivo de Forja+ con un compositor "Responde como humano") — confirma que la función es real ahí, construida con diseño propio, sin las categorías de sentimiento (Molestos/Contentos), el botón "Sugerir" (borrador con IA) ni el costo por mensaje que aparecen en esa misma captura — quedan como features aparte, no pedidas todavía.
- **Preparación multi-canal:** abstracción `ChannelProvider` (D5-style) para que agregar WhatsApp/Messenger/Instagram no requiera tocar el manejo de chats, no-shows ni alta de canal — sin construir ningún adaptador real todavía (sin credenciales de Meta).
- **Superpower #2 "Vigilante" (alertas proactivas):** ver arriba en la tabla — completado en esta misma ronda tras la consola.

## Roadmap de etapas actualizado

| Etapa | Objetivo | Estado |
|---|---|---|
| 0-7 | (sin cambios, ver `CLAUDE.md`) | Completas |
| 8 | Dashboard admin mínimo | Completa |
| **8.5** | **Panel de bot: detalle, métricas y config en caliente** | Completa — confirmada por Oscar en producción (métricas reales, cambio de tono/idioma/moneda, editor de prompt, rediseño sidebar+cards con paleta Slate/Indigo) |
| 9 | Pipeline de alta de cliente | Completa |
| 10 | Superpowers restantes + Claude Skill | Completa (2026-08-29) |
| Agencia (sin número fijo, post-10) | Equipo/roles | **Completa (2026-08-29)** — login propio + roles admin/operador, ver `CLAUDE.md`. |
| Agencia | White-label | Backlog aceptado, sin diseño detallado todavía — sin caso de uso real confirmado. |
| — | Marketplace | Backlog, DESCONOCIDO |

No avanzar a Etapa 9 sin pasar la prueba de aceptación de Etapa 8.5 (panel de bot funcional en producción, confirmado por Oscar).

## Tercera ronda: exploración del starter de Forja (2026-08-30)

Oscar desplegó el starter real de Forja ("HorizontesAgentOS") bajo su propia cuenta de Cloudflare para explorarlo de primera mano, y compartió capturas de 5 páginas completas de su panel (Flujo, Conocimiento, Conexiones, Configuración). Mismo principio de siempre: **replicar la funcionalidad observada está permitido, copiar su copy/nombres de página/arquitectura interna exacta no está permitido** (charter del proyecto, `CLAUDE.md`). Oscar confirmó explícitamente: *"No quiero que copies lo que tiene en su arquitectura"* — cualquier ítem de esta lista se construye con el diseño y los nodos reales de Radamantis, nunca los de Forja (ej. su capa de "Buffer" de 15s, sus nombres de tools `snoozeUser`/`pauseSuspectedBot`, etc. son arquitectura *de ellos*, no una referencia a copiar).

Clasificación de lo visto en las 5 páginas:

| Ítem visto en Forja | Veredicto | Nota |
|---|---|---|
| Conocimiento (KB por documento, listar/editar/reindexar) | **Aceptado — en construcción, 2026-08-30** | Radamantis ya tenía la función (subir KB), pero sin tracking de documentos individuales — requiere nueva tabla D1 `kb_documents` (Vectorize no soporta "listar todo"). **Decisión de Oscar: va en `/console` (autoservicio del dueño del negocio), no en `/admin`** — cambio de alcance real, hoy nadie fuera de Oscar toca el KB. Un vector por documento (sin fragmentar), decisión explícita de Oscar por ahora. |
| Flujo (diagrama en vivo del pipeline, "canvas") | **Completa (2026-08-30)** | Vive en `/admin` por tenant, con conteos reales de uso de 30 días (nueva tabla `tool_calls`) — ver `CLAUDE.md`. |
| Conexiones → Sitio web (widget de chat embebible) | **Nuevo, roadmap — no construido, sin caso de uso confirmado todavía** | Canal que Radamantis no tenía contemplado: burbuja de chat para incrustar en la propia página del negocio del cliente. A diferencia de WhatsApp/Meta, no depende de aprobación de una plataforma externa — sería una implementación propia (widget JS + endpoint). Sin fecha, no bloqueante. |
| Conexiones → WhatsApp (Twilio/Meta), Instagram+Messenger, ManyChat | Ya clasificado, sin cambios | Bloqueado hasta que Oscar consiga credenciales reales de Meta/Twilio. ManyChat: sin caso de uso confirmado, mismo criterio que Composio (`docs/06-roadmap-agencia.md`, primera ronda). |
| Configuración → tono/idioma/moneda | Ya cubierto | Sin cambios, ya existe en `/admin`. |
| Configuración → multi-LLM / BYO API key / selector de modelo | **Sigue diferido** | Decisión explícita de Oscar ya tomada (primera ronda): key compartida por ahora. No se re-abre a menos que Oscar lo pida explícitamente. |
| Configuración → velocidad de respuesta (agrupar mensajes seguidos antes de responder) | **Nuevo, roadmap — no construido** | Cambio de arquitectura real: hoy cada mensaje entrante dispara al agente de inmediato, sin agrupar mensajes seguidos del mismo cliente. Valorar si vale la pena antes de construir (¿ha sido un problema real para algún tenant?). |
| Configuración → auto-reanudar el bot tras N horas de pausa | **Nuevo, roadmap — no construido** | Hoy la pausa por handoff es indefinida hasta reanudar a mano. |
| Configuración → palabras que activan handoff, editables por tenant | **Nuevo, roadmap — no construido** | Hoy `detectsHandoffRequest` es una lista fija en código (`src/handoff.ts`), igual para todos los tenants. |

No se prioriza nada de esta lista más allá de "Conocimiento" (ya en construcción) sin que Oscar lo pida explícitamente — quedan aquí registrados para no perderlos, siguiendo el mismo criterio de "confirmar necesidad real antes de construir" ya aplicado en Equipo/roles.
