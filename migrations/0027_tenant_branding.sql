-- Agencia (White-label para clientes finales, alcance confirmado con
-- Oscar: por tenant en /console, no multi-agencia): el dueño del negocio
-- puede poner su propio nombre/logo/color en SU consola en vez de ver la
-- identidad visual de Radamantis. Los tres campos son opcionales — NULL
-- significa "usa lo de Radamantis por default", nunca un valor inventado.
ALTER TABLE tenant_settings ADD COLUMN brand_name TEXT;
ALTER TABLE tenant_settings ADD COLUMN brand_logo_url TEXT;
ALTER TABLE tenant_settings ADD COLUMN brand_color TEXT;
