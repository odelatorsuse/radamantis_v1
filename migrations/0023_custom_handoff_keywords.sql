-- Agencia ("palabras de handoff editables por tenant", criterios
-- confirmados con Oscar 2026-08-30): SE SUMAN a HANDOFF_KEYWORDS
-- (src/handoff.ts), nunca la reemplazan — así un tenant mal configurado
-- (o que deja esto vacío) nunca pierde el blindaje base de handoff.
-- JSON array en TEXT, mismo patrón que tenant_settings.business_hours.
ALTER TABLE tenant_settings ADD COLUMN custom_handoff_keywords TEXT NOT NULL DEFAULT '[]';
