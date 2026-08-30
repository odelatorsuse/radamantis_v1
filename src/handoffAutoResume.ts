// Agencia ("auto-reanudar tras pausa por handoff", criterios confirmados
// con Oscar 2026-08-30): opt-in (a diferencia de no-shows/reporte diario,
// que son default-on) — si el negocio sigue atendiendo al cliente por su
// cuenta (teléfono, WhatsApp personal), el bot no debe "despertar" solo a
// menos que el dueño decida explícitamente que quiere ese comportamiento.
// Duración fija de 3h por ahora, no configurable por tenant todavía.
// Silencioso a propósito — reanudar no manda ningún mensaje al cliente ni
// al negocio, el bot simplemente vuelve a responder en el próximo mensaje.
export interface AutoResumeSweepResult {
  resumed: number;
}

const AUTO_RESUME_HOURS = 3;

export async function runAutoResumeSweep(db: D1Database): Promise<AutoResumeSweepResult> {
  const { results } = await db
    .prepare(
      `SELECT h.id FROM handoffs h
       JOIN tenant_settings ts ON ts.tenant_id = h.tenant_id
       WHERE h.resolved_at IS NULL
         AND ts.auto_resume_handoff_enabled = 1
         AND h.created_at <= datetime('now', ?)`,
    )
    .bind(`-${AUTO_RESUME_HOURS} hours`)
    .all<{ id: number }>();

  if (results.length === 0) return { resumed: 0 };

  await db.batch(results.map((r) => db.prepare("UPDATE handoffs SET resolved_at = datetime('now') WHERE id = ?").bind(r.id)));
  return { resumed: results.length };
}
