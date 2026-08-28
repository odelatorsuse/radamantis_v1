# Radamantis

Plataforma multi-tenant de asistentes virtuales con IA. Ver `CLAUDE.md` para contexto completo del proyecto (reglas, roadmap, decisiones de arquitectura).

## Estado
Etapa 6 completa — superpowers CORE: blindaje anti-invento aplicado siempre (no solo con contexto de KB) y handoff a humano (detecta la solicitud, dispara una vez, y el bot se calla mientras la conversación esté en handoff). Vertical Template piloto (veterinaria) llega en Etapa 7.

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

## Documentación
- `docs/05-arquitectura-radamantis.md` — arquitectura completa (Fase 2)
- `docs/identidad-visual.md` — paletas de marca
