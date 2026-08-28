# Radamantis

Plataforma multi-tenant de asistentes virtuales con IA. Ver `CLAUDE.md` para contexto completo del proyecto (reglas, roadmap, decisiones de arquitectura).

## Estado
Etapa 1 — core skeleton: webhook de Telegram que responde eco. Sin LLM, sin persistencia ni multi-tenant todavía (llegan en Etapas 2-4).

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

## Documentación
- `docs/05-arquitectura-radamantis.md` — arquitectura completa (Fase 2)
- `docs/identidad-visual.md` — paletas de marca
