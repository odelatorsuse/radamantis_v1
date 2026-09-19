-- Backlog de Agencia (padel, Fase 2: "Reception Bot" — check-in en el club).
-- Decisión de alcance confirmada con Oscar antes de Fase 1: el cobro
-- ($200 MXN) se hace en efectivo/terminal en el club — aquí NO hay pasarela
-- de pago, solo se necesita "marcar que ya pagó". Igual que en Fase 1, se
-- decidió que esto vive 100% en /console (checklist para el staff en
-- recepción), no como una conversación con el bot — más práctico para
-- confirmar ~20 personas rápido que un chat.
--
-- `paid`: booleano simple, default sin pagar.
-- `attended`: NULL hasta que el staff lo confirme en el mostrador (no se
-- asume nada por default); 1 = se presentó, 0 = marcado explícitamente como
-- no-show. Mismo patrón que `appointments.attended` (Etapa 10, no-shows).
ALTER TABLE padel_registrations ADD COLUMN paid INTEGER NOT NULL DEFAULT 0;
ALTER TABLE padel_registrations ADD COLUMN attended INTEGER;
