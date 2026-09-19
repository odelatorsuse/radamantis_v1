-- Backlog de Agencia (padel, ronda de reestructura): Oscar pidió que
-- "rondas" y "canchas" se pregunten AL CREAR cada convocatoria, no solo
-- como default global en "Reglas" — un club puede usar distinto número de
-- canchas o rondas para categorías/días distintos. Nullable: las
-- convocatorias creadas ANTES de esta migración no tienen estos valores
-- (generateFixture cae de vuelta a los defaults de padel_settings cuando
-- son NULL — ver src/padelMatches.ts).
ALTER TABLE padel_tournaments ADD COLUMN rounds INTEGER;
ALTER TABLE padel_tournaments ADD COLUMN court_count INTEGER;

-- Backlog de Agencia: "posterior a la hora límite de inscripción, buscar
-- que confirmen que van a participar" (Oscar, confirmado: el bot manda el
-- mensaje) — null = no ha respondido, nunca se asume.
ALTER TABLE padel_registrations ADD COLUMN confirmed INTEGER;

-- Backlog de Agencia: aviso automático al club 30 min antes de la
-- jornada si hay inscritos sin pagar (Oscar, confirmado). Se guarda
-- cuándo se mandó para no repetirlo en cada barrido de 30 min.
ALTER TABLE padel_tournaments ADD COLUMN payment_reminder_sent_at TEXT;
