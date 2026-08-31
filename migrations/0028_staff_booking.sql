-- Agencia (Fase 2, agendar con persona específica): un salón/barbería
-- comparte UN solo Google Calendar (nunca uno por empleado — sería pedirle
-- a cada estilista/barbero que conecte su propia cuenta, poco realista para
-- un negocio chico), así que el staff se modela como una ETIQUETA sobre
-- eventos del mismo calendario (extendedProperties.private en Google), no
-- como calendarios separados. staff_members vive en tenant_settings porque
-- lo mantiene el propio negocio desde /console (quién trabaja ahí cambia
-- con el tiempo) — JSON array en TEXT, mismo patrón que
-- custom_handoff_keywords. Vacío = la tool de agenda funciona exactamente
-- como antes (sin campo de staff), cero cambio de comportamiento para
-- tenants que no lo configuran.
ALTER TABLE tenant_settings ADD COLUMN staff_members TEXT NOT NULL DEFAULT '[]';

-- Rastro local de con quién fue cada cita — Google Calendar sí lo sabe (va
-- en extendedProperties del evento), pero admin/console necesitan mostrarlo
-- sin ir a consultar la API de Google cada vez.
ALTER TABLE appointments ADD COLUMN staff_member TEXT;
