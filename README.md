# Radamantis

Plataforma multi-tenant de asistentes virtuales con IA. Ver `CLAUDE.md` para contexto completo del proyecto (reglas, roadmap, decisiones de arquitectura).

## Estado
Etapa 2 completa — el bot responde con GPT (OpenAI) usando un prompt de sistema fijo de sandbox, e instrumenta tokens en D1 (`usage_log`). Sin persistencia de conversación ni multi-tenant todavía (llegan en Etapas 3-4).

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

## Documentación
- `docs/05-arquitectura-radamantis.md` — arquitectura completa (Fase 2)
- `docs/identidad-visual.md` — paletas de marca
