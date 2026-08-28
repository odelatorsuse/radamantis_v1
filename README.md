# Radamantis

Plataforma multi-tenant de asistentes virtuales con IA. Ver `CLAUDE.md` para contexto completo del proyecto (reglas, roadmap, decisiones de arquitectura).

## Estado
Etapa 4 completa — multi-tenant real: el router resuelve el tenant dinámicamente vía `channel_bindings` (D1) a partir del token de Telegram en la URL, ya no hay ningún tenant hardcodeado. Aislamiento cross-tenant probado con un test dedicado. Sin RAG todavía (llega en Etapa 5).

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

## Documentación
- `docs/05-arquitectura-radamantis.md` — arquitectura completa (Fase 2)
- `docs/identidad-visual.md` — paletas de marca
