# Radamantis

Plataforma multi-tenant de asistentes virtuales con IA. Ver `CLAUDE.md` para contexto completo del proyecto (reglas, roadmap, decisiones de arquitectura).

## Estado
Etapa 0 — fundación. Sin lógica de negocio todavía.

## Requisitos
- Node.js 20+
- Cuenta de Cloudflare (Free plan alcanza hasta Etapa 4; Etapa 5 requiere Workers Paid, $5/mes, por Vectorize)
- API key de OpenAI con billing activo

## Setup
```bash
npm install
npx wrangler dev
```

## Documentación
- `docs/05-arquitectura-radamantis.md` — arquitectura completa (Fase 2)
- `docs/identidad-visual.md` — paletas de marca
