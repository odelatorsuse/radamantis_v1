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
| Equipo / roles | **Aceptado, roadmap futuro (Agencia)** | Requiere autenticación real por usuario (no solo el `ADMIN_API_KEY` compartido de hoy) — diseño propio, no el flujo de invitación por link de Forja. |
| White-label | **Aceptado, roadmap futuro (Agencia)** | Ya anticipado como capa "AGENCY" en el diagrama de `05-arquitectura-radamantis.md` §3. Branding por agencia revendedora, no por Forja. |
| Marketplace | **DESCONOCIDO** | Solo idea, sin caso de uso ni diseño. No se planifica en detalle todavía. |
| CLI tipo `forjabot` por cliente | **Rechazado** | Contradice D1 (Radamantis es 1 Worker multi-tenant, nunca 1 deploy por cliente). El equivalente de Radamantis ya está en el roadmap: la API admin (D9) + el futuro Claude Skill (Etapa 10) que la consume. |
| Composio (integraciones genéricas) | **DESCONOCIDO** | Sin caso de uso confirmado para el piloto veterinario. No se planifica. |
| Selector multi-LLM (BYO-LLM) | **Diferido** | Decisión explícita de Oscar: seguimos con key compartida por ahora. Revisar cuando haya varios tenants pagando su propio consumo. |
| Plantillas de WhatsApp (HSM) | **Diferido** | Solo tiene sentido una vez exista el canal WhatsApp (ya en el roadmap grande, Fase 3 — Channels). |
| Paneles de analítica avanzados (Analista IA/Insights, sentiment) | **Ya cubierto (planeado)** | D7: "Vigilante con IA" — CORE (salud) + TOGGLE (sentimiento, plan Pro). No es parte de Etapa 8.5. |
| Prompt engineering avanzado (A/B testing, versionado, auditoría) | **Backlog, sin fecha** | El editor de prompt de Etapa 8.5 es la versión mínima. Versionado/A-B testing quedan como mejora futura opcional. |

## Roadmap de etapas actualizado

| Etapa | Objetivo | Estado |
|---|---|---|
| 0-7 | (sin cambios, ver `CLAUDE.md`) | Completas |
| 8 | Dashboard admin mínimo | Completa |
| **8.5** | **Panel de bot: detalle, métricas y config en caliente** | Completa — confirmada por Oscar en producción (métricas reales, cambio de tono/idioma/moneda, editor de prompt, rediseño sidebar+cards con paleta Slate/Indigo) |
| 9 | Pipeline de alta de cliente | Pendiente |
| 10 | Superpowers restantes + Claude Skill | Pendiente |
| Agencia (sin número fijo, post-10) | Equipo/roles, White-label | Backlog aceptado, sin diseño detallado todavía |
| — | Marketplace | Backlog, DESCONOCIDO |

No avanzar a Etapa 9 sin pasar la prueba de aceptación de Etapa 8.5 (panel de bot funcional en producción, confirmado por Oscar).
