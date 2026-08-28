# RADAMANTIS — contexto del proyecto

## Qué es esto
Plataforma multi-tenant de asistentes virtuales con IA (Telegram/WhatsApp/Instagram), construida como alternativa propia a Forja (github.com/santmun/forja) — sin código propietario de Forja+.

## Estado
- Fase 1 (reverse engineering de Forja): completa.
- Fase 2 (arquitectura propia de Radamantis): completa y aprobada. Ver `docs/05-arquitectura-radamantis.md`.
- Fase 3 (implementación): en curso, Etapa 0.

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
- Cloudflare: Free plan cubre Etapas 0-4 (Workers, D1, Durable Objects, R2). Vectorize (Etapa 5) requiere Workers Paid ($5/mes).
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
