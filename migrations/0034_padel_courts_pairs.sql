-- Backlog de Agencia (padel, ronda de canchas + parejas). Oscar mandó una
-- foto de una tabla de posiciones real y, junto con eso, pidió tres cosas:
--
-- 1. El fixture debe considerar el NÚMERO DE CANCHAS real del club, no
--    solo el número de jugadores — sin esto, `buildFixturePlan` podía
--    "perder" rondas completas para números chicos de jugadores (ej. 4
--    jugadores/1 cancha generaban solo 1 partido en vez de 1 por ronda).
--    `court_count` vive en `padel_settings` (mismo panel de "Reglas" que
--    `rounds`) — default 5 para no romper el comportamiento previo (que
--    implícitamente asumía hasta 5 canchas con el ejemplo original de
--    cupo 20).
-- 2. Un club puede operar "reta americana" (pareja rotativa cada ronda,
--    modo ya existente) o "torneo de parejas" (pareja FIJA todo el
--    evento) — Oscar confirmó que es la MISMA mecánica de rondas +
--    posiciones + playoffs, solo cambia si la pareja rota o no. Se elige
--    por CONVOCATORIA (cada vez que el club abre una nueva), no una vez
--    por cliente — `registration_mode` vive en `padel_tournaments`.
--    `default_registration_mode` en `padel_settings` es solo el valor que
--    precargar en el formulario de "Nueva convocatoria", nunca fuerza
--    nada.
-- 3. En modo "pareja", Oscar confirmó que una pareja se inscribe JUNTA
--    como una sola unidad. Para no romper el resto del sistema (cada fila
--    de `padel_registrations` sigue siendo UN jugador — así
--    `playerNameLookup`/standings/check-in/cancelación individual siguen
--    funcionando sin cambios), una pareja son DOS filas normales unidas
--    por el mismo `pair_id` (UUID compartido) — nunca se separan al
--    armar equipos ni al cancelar/promover de la lista de espera.
ALTER TABLE padel_settings ADD COLUMN court_count INTEGER NOT NULL DEFAULT 5;
ALTER TABLE padel_settings ADD COLUMN default_registration_mode TEXT NOT NULL DEFAULT 'individual';

ALTER TABLE padel_tournaments ADD COLUMN registration_mode TEXT NOT NULL DEFAULT 'individual';

ALTER TABLE padel_registrations ADD COLUMN pair_id TEXT;
