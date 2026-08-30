// Agencia ("Flujo"): registro liviano de cada vez que el agente ejecuta
// una capacidad real (searchKb, handoffHuman, checkAvailability,
// bookAppointment, recordAppointmentFeedback) — best-effort, nunca debe
// tumbar la respuesta al cliente si falla (mismo criterio que logUsage).
export async function logToolCall(db: D1Database, tenantId: string, toolName: string): Promise<void> {
  await db.prepare("INSERT INTO tool_calls (tenant_id, tool_name) VALUES (?, ?)").bind(tenantId, toolName).run();
}

export type ToolCallCounts = Record<string, number>;

export async function getToolCallCounts30d(db: D1Database, tenantId: string): Promise<ToolCallCounts> {
  const { results } = await db
    .prepare(
      `SELECT tool_name, COUNT(*) as count FROM tool_calls
       WHERE tenant_id = ? AND created_at >= datetime('now', '-30 days')
       GROUP BY tool_name`,
    )
    .bind(tenantId)
    .all<{ tool_name: string; count: number }>();
  const counts: ToolCallCounts = {};
  for (const r of results) counts[r.tool_name] = r.count;
  return counts;
}
