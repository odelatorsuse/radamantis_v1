// Fake D1 mínimo con semántica real de SQL para las tablas de padel
// (padel_tournaments/padel_registrations) — mismo espíritu que
// test/fakeD1.ts (messages), pero aquí hace falta más porque la lógica bajo
// prueba (cupo/lista de espera vía INSERT...SELECT atómico, promoción de
// lista de espera) no se puede verificar de verdad con un mock por-llamada.
// Compartido por test/padel.test.ts y test/padelTool.test.ts.
interface FakeTournament {
  id: number;
  tenant_id: string;
  label: string;
  category: string | null;
  scheduled_at_utc: string;
  registration_deadline_utc: string;
  capacity: number;
  registration_mode: string;
  rounds: number | null;
  court_count: number | null;
  status: string;
  payment_reminder_sent_at: string | null;
  created_at: string;
}
interface FakeRegistration {
  id: number;
  tournament_id: number;
  tenant_id: string;
  player_name: string;
  phone: string | null;
  channel: string;
  chat_id: string;
  player_id: string;
  status: string;
  registered_at: string;
  paid: number;
  attended: number | null;
  pair_id: string | null;
  confirmed: number | null;
}
interface FakeMatch {
  id: number;
  tournament_id: number;
  tenant_id: string;
  phase: string;
  round_number: number | null;
  court_number: number;
  team_a_player1_id: number;
  team_a_player2_id: number;
  team_b_player1_id: number;
  team_b_player2_id: number;
  score_a: number | null;
  score_b: number | null;
  created_at: string;
}

interface FakeCategory {
  tenant_id: string;
  category: string;
  weekday: number | null;
  chat_id: string | null;
}
interface FakeSettings {
  tenant_id: string;
  rounds: number;
  court_count: number;
  default_registration_mode: string;
}

export function createFakePadelD1() {
  const tournaments: FakeTournament[] = [];
  const registrations: FakeRegistration[] = [];
  const matches: FakeMatch[] = [];
  const categories: FakeCategory[] = [];
  const settings: FakeSettings[] = [];
  let nextTournamentId = 1;
  let nextRegistrationId = 1;
  let nextMatchId = 1;
  let clock = 0;

  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async run() {
              if (/INSERT INTO padel_tournaments/i.test(sql)) {
                const [tenant_id, label, category, scheduled_at_utc, registration_deadline_utc, capacity, registration_mode, rounds, court_count] = params as [
                  string, string, string | null, string, string, number, string, number | null, number | null,
                ];
                const row: FakeTournament = {
                  id: nextTournamentId++, tenant_id, label, category, scheduled_at_utc, registration_deadline_utc, capacity,
                  registration_mode: registration_mode ?? "individual", rounds: rounds ?? null, court_count: court_count ?? null,
                  status: "abierta", payment_reminder_sent_at: null, created_at: "now",
                };
                tournaments.push(row);
                return { success: true, meta: { last_row_id: row.id } };
              }
              if (/UPDATE padel_tournaments SET status = 'cerrada'/i.test(sql)) {
                const [id, tenant_id] = params as [number, string];
                const t = tournaments.find((x) => x.id === id && x.tenant_id === tenant_id);
                if (t) t.status = "cerrada";
                return { success: true };
              }
              if (/INSERT INTO padel_registrations/i.test(sql) && /UNION ALL/i.test(sql)) {
                // registerPair: inserta las 2 filas de una pareja en una sola
                // sentencia (UNION ALL de los 2 nombres) — ambas leen el
                // MISMO conteo de parejas ya inscritas, decidiendo el MISMO
                // status para las 2.
                const [tournament_id, tenant_id, phone, channel, chat_id, player_id, pair_id, , capacityPairs, name1, name2] = params as [
                  number, string, string | null, string, string, string, string, number, number, string, string,
                ];
                const inscritoPairs = new Set(
                  registrations.filter((r) => r.tournament_id === tournament_id && r.status === "inscrito" && r.pair_id).map((r) => r.pair_id),
                ).size;
                const status = inscritoPairs < capacityPairs ? "inscrito" : "lista_espera";
                for (const player_name of [name1, name2]) {
                  registrations.push({
                    id: nextRegistrationId++, tournament_id, tenant_id, player_name, phone, channel, chat_id, player_id,
                    status, registered_at: `t${clock++}`, paid: 0, attended: null, pair_id, confirmed: null,
                  });
                }
                return { success: true };
              }
              if (/INSERT INTO padel_registrations/i.test(sql)) {
                const [tournament_id, tenant_id, player_name, phone, channel, chat_id, player_id, , capacity] = params as [
                  number, string, string, string | null, string, string, string, number, number,
                ];
                const inscritos = registrations.filter((r) => r.tournament_id === tournament_id && r.status === "inscrito").length;
                const status = inscritos < capacity ? "inscrito" : "lista_espera";
                registrations.push({
                  id: nextRegistrationId++,
                  tournament_id,
                  tenant_id,
                  player_name,
                  phone,
                  channel,
                  chat_id,
                  player_id,
                  status,
                  registered_at: `t${clock++}`,
                  paid: 0,
                  attended: null,
                  pair_id: null,
                  confirmed: null,
                });
                return { success: true };
              }
              if (/UPDATE padel_registrations SET confirmed = \? WHERE pair_id = \? AND tenant_id = \?/i.test(sql)) {
                const [confirmedValue, pair_id, tenant_id] = params as [number, string, string];
                for (const r of registrations.filter((x) => x.pair_id === pair_id && x.tenant_id === tenant_id)) r.confirmed = confirmedValue;
                return { success: true };
              }
              if (/UPDATE padel_registrations SET confirmed = \? WHERE id = \? AND tenant_id = \?/i.test(sql)) {
                const [confirmedValue, id, tenant_id] = params as [number, number, string];
                const r = registrations.find((x) => x.id === id && x.tenant_id === tenant_id);
                if (r) r.confirmed = confirmedValue;
                return { success: true };
              }
              if (/UPDATE padel_registrations SET status = 'cancelado'/i.test(sql)) {
                const [id, tenant_id] = params as [number, string];
                const r = registrations.find((x) => x.id === id && x.tenant_id === tenant_id);
                if (r) r.status = "cancelado";
                return { success: true };
              }
              if (/UPDATE padel_registrations SET status = 'inscrito' WHERE id = \?/i.test(sql)) {
                const [id] = params as [number];
                const r = registrations.find((x) => x.id === id);
                if (r) r.status = "inscrito";
                return { success: true };
              }
              if (/UPDATE padel_registrations SET attended = 1 WHERE id = \?/i.test(sql)) {
                const [id] = params as [number];
                const r = registrations.find((x) => x.id === id);
                if (r) r.attended = 1;
                return { success: true };
              }
              {
                // setRegistrationCheckin arma el SET dinámicamente (paid
                // siempre, attended/confirmed solo si vinieron) — un solo
                // handler genérico en vez de 4 casos fijos, para que
                // aguante cualquier combinación sin tener que listarlas.
                const checkinMatch = sql.match(
                  /UPDATE padel_registrations SET paid = COALESCE\(\?, paid\)(, attended = \?)?(, confirmed = \?)?\s*WHERE (pair_id|id) = \? AND tenant_id = \?/i,
                );
                if (checkinMatch) {
                  const hasAttended = Boolean(checkinMatch[1]);
                  const hasConfirmed = Boolean(checkinMatch[2]);
                  const whereField = checkinMatch[3];
                  let idx = 0;
                  const paidValue = params[idx++] as number | null;
                  const attendedValue = hasAttended ? (params[idx++] as number | null) : undefined;
                  const confirmedValue = hasConfirmed ? (params[idx++] as number | null) : undefined;
                  const whereValue = params[idx++] as string | number;
                  const tenant_id = params[idx++] as string;
                  const matches = (r: FakeRegistration) =>
                    r.tenant_id === tenant_id && (whereField === "pair_id" ? r.pair_id === whereValue : r.id === whereValue);
                  for (const r of registrations.filter(matches)) {
                    if (paidValue !== null) r.paid = paidValue;
                    if (attendedValue !== undefined) r.attended = attendedValue;
                    if (confirmedValue !== undefined) r.confirmed = confirmedValue;
                  }
                  return { success: true };
                }
              }
              if (/UPDATE padel_registrations SET attended = 1 WHERE tournament_id = \? AND channel = 'console' AND player_id = \?/i.test(sql)) {
                const [tournament_id, player_id] = params as [number, string];
                for (const r of registrations.filter((x) => x.tournament_id === tournament_id && x.channel === "console" && x.player_id === player_id)) {
                  r.attended = 1;
                }
                return { success: true };
              }
              if (/UPDATE padel_tournaments SET status = \? WHERE id = \? AND tenant_id = \?/i.test(sql)) {
                const [status, id, tenant_id] = params as [string, number, string];
                const t = tournaments.find((x) => x.id === id && x.tenant_id === tenant_id);
                if (t) t.status = status;
                return { success: true };
              }
              if (/UPDATE padel_tournaments SET status = 'abierta', scheduled_at_utc = COALESCE/i.test(sql)) {
                const [scheduled_at_utc, registration_deadline_utc, id, tenant_id] = params as [string | null, string | null, number, string];
                const t = tournaments.find((x) => x.id === id && x.tenant_id === tenant_id);
                if (t) {
                  t.status = "abierta";
                  if (scheduled_at_utc !== null) t.scheduled_at_utc = scheduled_at_utc;
                  if (registration_deadline_utc !== null) t.registration_deadline_utc = registration_deadline_utc;
                }
                return { success: true };
              }
              if (/DELETE FROM padel_matches WHERE tournament_id = \? AND tenant_id = \?/i.test(sql)) {
                const [tournament_id, tenant_id] = params as [number, string];
                for (let i = matches.length - 1; i >= 0; i--) {
                  if (matches[i].tournament_id === tournament_id && matches[i].tenant_id === tenant_id) matches.splice(i, 1);
                }
                return { success: true };
              }
              if (/DELETE FROM padel_registrations WHERE tournament_id = \? AND tenant_id = \?/i.test(sql)) {
                const [tournament_id, tenant_id] = params as [number, string];
                for (let i = registrations.length - 1; i >= 0; i--) {
                  if (registrations[i].tournament_id === tournament_id && registrations[i].tenant_id === tenant_id) registrations.splice(i, 1);
                }
                return { success: true };
              }
              if (/INSERT INTO padel_matches .*phase, round_number, court_number/is.test(sql)) {
                const [tournament_id, tenant_id, round_number, court_number, a1, a2, b1, b2] = params as [
                  number, string, number, number, number, number, number, number,
                ];
                matches.push({
                  id: nextMatchId++, tournament_id, tenant_id, phase: "ronda", round_number, court_number,
                  team_a_player1_id: a1, team_a_player2_id: a2, team_b_player1_id: b1, team_b_player2_id: b2,
                  score_a: null, score_b: null, created_at: "now",
                });
                return { success: true, meta: { last_row_id: matches[matches.length - 1].id } };
              }
              if (/INSERT INTO padel_matches [\s\S]*'semifinal'/i.test(sql)) {
                const [tournament_id, tenant_id, a1, a2, b1, b2] = params as [number, string, number, number, number, number];
                const court_number = /VALUES \(\?, \?, 'semifinal', 1,/.test(sql) ? 1 : 2;
                matches.push({
                  id: nextMatchId++, tournament_id, tenant_id, phase: "semifinal", round_number: null, court_number,
                  team_a_player1_id: a1, team_a_player2_id: a2, team_b_player1_id: b1, team_b_player2_id: b2,
                  score_a: null, score_b: null, created_at: "now",
                });
                return { success: true, meta: { last_row_id: matches[matches.length - 1].id } };
              }
              if (/INSERT INTO padel_matches [\s\S]*'final'/i.test(sql)) {
                const [tournament_id, tenant_id, a1, a2, b1, b2] = params as [number, string, number, number, number, number];
                matches.push({
                  id: nextMatchId++, tournament_id, tenant_id, phase: "final", round_number: null, court_number: 1,
                  team_a_player1_id: a1, team_a_player2_id: a2, team_b_player1_id: b1, team_b_player2_id: b2,
                  score_a: null, score_b: null, created_at: "now",
                });
                return { success: true, meta: { last_row_id: matches[matches.length - 1].id } };
              }
              if (/UPDATE padel_matches SET score_a = \?, score_b = \? WHERE id = \? AND tenant_id = \?/i.test(sql)) {
                const [scoreA, scoreB, id, tenant_id] = params as [number, number, number, string];
                const m = matches.find((x) => x.id === id && x.tenant_id === tenant_id);
                if (m) { m.score_a = scoreA; m.score_b = scoreB; }
                return { success: true };
              }
              if (/INSERT INTO padel_categories/i.test(sql)) {
                const [tenant_id, category, weekday, chat_id] = params as [string, string, number | null, string | null];
                const existing = categories.find((c) => c.tenant_id === tenant_id && c.category === category);
                if (existing) { existing.weekday = weekday; existing.chat_id = chat_id; }
                else categories.push({ tenant_id, category, weekday, chat_id });
                return { success: true };
              }
              if (/INSERT INTO padel_settings/i.test(sql)) {
                const [tenant_id, rounds, court_count, default_registration_mode] = params as [string, number, number, string];
                const existing = settings.find((s) => s.tenant_id === tenant_id);
                if (existing) { existing.rounds = rounds; existing.court_count = court_count; existing.default_registration_mode = default_registration_mode; }
                else settings.push({ tenant_id, rounds, court_count, default_registration_mode });
                return { success: true };
              }
              return { success: true };
            },
            async first<T>() {
              if (/FROM padel_tournaments WHERE tenant_id = \? AND status = 'abierta' AND label/i.test(sql)) {
                const [tenant_id, label] = params as [string, string];
                const rows = tournaments.filter((t) => t.tenant_id === tenant_id && t.status === "abierta" && t.label === label);
                return (rows[rows.length - 1] ?? null) as unknown as T;
              }
              if (/FROM padel_tournaments WHERE id = \? AND tenant_id = \?/i.test(sql)) {
                const [id, tenant_id] = params as [number, string];
                return (tournaments.find((t) => t.id === id && t.tenant_id === tenant_id) ?? null) as unknown as T;
              }
              if (/FROM padel_registrations WHERE tournament_id = \? AND channel = 'console' AND player_id = \?/i.test(sql)) {
                const [tournament_id, player_id] = params as [number, string];
                const rows = registrations
                  .filter((r) => r.tournament_id === tournament_id && r.channel === "console" && r.player_id === player_id)
                  .sort((a, b) => b.id - a.id);
                return (rows[0] ?? null) as unknown as T;
              }
              if (/FROM padel_registrations WHERE tournament_id = \? AND channel = \? AND player_id = \?/i.test(sql)) {
                const [tournament_id, channel, player_id] = params as [number, string, string];
                const rows = registrations
                  .filter((r) => r.tournament_id === tournament_id && r.channel === channel && r.player_id === player_id)
                  .sort((a, b) => b.id - a.id);
                return (rows[0] ?? null) as unknown as T;
              }
              if (/COUNT\(\*\) AS cnt FROM padel_registrations WHERE tournament_id = \? AND status = \? AND id <= \?/i.test(sql)) {
                const [tournament_id, status, id] = params as [number, string, number];
                const cnt = registrations.filter((r) => r.tournament_id === tournament_id && r.status === status && r.id <= id).length;
                return { cnt } as unknown as T;
              }
              if (/FROM padel_registrations WHERE tournament_id = \? AND status = 'lista_espera' AND pair_id IS NULL ORDER BY id ASC LIMIT 1/i.test(sql)) {
                const [tournament_id] = params as [number];
                const rows = registrations.filter((r) => r.tournament_id === tournament_id && r.status === "lista_espera" && !r.pair_id).sort((a, b) => a.id - b.id);
                return (rows[0] ?? null) as unknown as T;
              }
              if (/FROM padel_registrations WHERE tournament_id = \? AND pair_id = \? ORDER BY id DESC LIMIT 1/i.test(sql)) {
                const [tournament_id, pair_id] = params as [number, string];
                const rows = registrations.filter((r) => r.tournament_id === tournament_id && r.pair_id === pair_id).sort((a, b) => b.id - a.id);
                return (rows[0] ?? null) as unknown as T;
              }
              if (/JOIN padel_tournaments pt ON pt\.id = pr\.tournament_id/i.test(sql)) {
                const [tenant_id, channel, player_id] = params as [string, string, string];
                const candidateRegs = registrations
                  .filter((r) => r.tenant_id === tenant_id && r.channel === channel && r.player_id === player_id && r.status !== "cancelado")
                  .sort((a, b) => b.id - a.id);
                for (const r of candidateRegs) {
                  const t = tournaments.find((x) => x.id === r.tournament_id && x.status === "cerrada");
                  if (t) return { tournament_id: t.id, label: t.label } as unknown as T;
                }
                return null as unknown as T;
              }
              if (/COUNT\(\*\) AS cnt FROM \(\s*SELECT pair_id, MIN\(id\) AS first_id/i.test(sql)) {
                const [tournament_id, status, tournament_id2, pair_id] = params as [number, string, number, string];
                const byPair = new Map<string, number>();
                for (const r of registrations) {
                  if (r.tournament_id !== tournament_id || r.status !== status || !r.pair_id) continue;
                  const cur = byPair.get(r.pair_id);
                  if (cur === undefined || r.id < cur) byPair.set(r.pair_id, r.id);
                }
                const targetFirstId = Math.min(
                  ...registrations.filter((r) => r.tournament_id === tournament_id2 && r.pair_id === pair_id).map((r) => r.id),
                );
                const cnt = [...byPair.values()].filter((firstId) => firstId <= targetFirstId).length;
                return { cnt } as unknown as T;
              }
              if (/FROM padel_registrations WHERE id = \? AND tenant_id = \?/i.test(sql)) {
                const [id, tenant_id] = params as [number, string];
                return (registrations.find((r) => r.id === id && r.tenant_id === tenant_id) ?? null) as unknown as T;
              }
              if (/FROM padel_matches WHERE id = \? AND tenant_id = \?/i.test(sql)) {
                const [id, tenant_id] = params as [number, string];
                return (matches.find((m) => m.id === id && m.tenant_id === tenant_id) ?? null) as unknown as T;
              }
              if (/FROM padel_categories WHERE tenant_id = \? AND chat_id = \?/i.test(sql)) {
                const [tenant_id, chat_id] = params as [string, string];
                const row = categories.find((c) => c.tenant_id === tenant_id && c.chat_id === chat_id);
                return (row ? { category: row.category } : null) as unknown as T;
              }
              if (/FROM padel_tournaments WHERE tenant_id = \? AND category = \? AND status = 'abierta'/i.test(sql)) {
                const [tenant_id, category] = params as [string, string];
                const rows = tournaments.filter((t) => t.tenant_id === tenant_id && t.category === category && t.status === "abierta").sort((a, b) => b.id - a.id);
                return (rows[0] ?? null) as unknown as T;
              }
              if (/FROM padel_tournaments WHERE tenant_id = \? AND category = \? AND status = 'en_curso'/i.test(sql)) {
                const [tenant_id, category] = params as [string, string];
                const rows = tournaments.filter((t) => t.tenant_id === tenant_id && t.category === category && t.status === "en_curso").sort((a, b) => b.id - a.id);
                return (rows[0] ?? null) as unknown as T;
              }
              if (/FROM padel_tournaments WHERE tenant_id = \? AND category = \? AND status IN \('abierta', 'cerrada'\)/i.test(sql)) {
                const [tenant_id, category] = params as [string, string];
                const rows = tournaments
                  .filter((t) => t.tenant_id === tenant_id && t.category === category && (t.status === "abierta" || t.status === "cerrada"))
                  .sort((a, b) => b.id - a.id);
                return (rows[0] ?? null) as unknown as T;
              }
              if (/FROM padel_tournaments WHERE tenant_id = \? AND category = \? AND status = 'finalizado'/i.test(sql)) {
                const [tenant_id, category] = params as [string, string];
                const rows = tournaments.filter((t) => t.tenant_id === tenant_id && t.category === category && t.status === "finalizado").sort((a, b) => b.id - a.id);
                return (rows[0] ?? null) as unknown as T;
              }
              if (/FROM padel_settings WHERE tenant_id = \?/i.test(sql)) {
                const [tenant_id] = params as [string];
                const row = settings.find((s) => s.tenant_id === tenant_id);
                return (row ? { rounds: row.rounds, court_count: row.court_count, default_registration_mode: row.default_registration_mode } : null) as unknown as T;
              }
              return null as unknown as T;
            },
            async all<T>() {
              if (/FROM padel_tournaments WHERE tenant_id = \? AND status = 'abierta' ORDER BY id ASC/i.test(sql)) {
                const [tenant_id] = params as [string];
                return { results: tournaments.filter((t) => t.tenant_id === tenant_id && t.status === "abierta").sort((a, b) => a.id - b.id) as unknown as T[] };
              }
              if (/FROM padel_registrations WHERE tournament_id = \? ORDER BY registered_at ASC, id ASC/i.test(sql)) {
                const [tournament_id] = params as [number];
                return { results: registrations.filter((r) => r.tournament_id === tournament_id).sort((a, b) => a.id - b.id) as unknown as T[] };
              }
              if (/FROM padel_matches WHERE tournament_id = \? AND phase = \?/i.test(sql)) {
                const [tournament_id, phase] = params as [number, string];
                return {
                  results: matches
                    .filter((m) => m.tournament_id === tournament_id && m.phase === phase)
                    .sort((a, b) => (a.round_number ?? 0) - (b.round_number ?? 0) || a.court_number - b.court_number) as unknown as T[],
                };
              }
              if (/FROM padel_matches WHERE tournament_id = \? ORDER BY/i.test(sql)) {
                const [tournament_id] = params as [number];
                return {
                  results: matches
                    .filter((m) => m.tournament_id === tournament_id)
                    .sort((a, b) => (a.round_number ?? 0) - (b.round_number ?? 0) || a.court_number - b.court_number) as unknown as T[],
                };
              }
              if (/FROM padel_tournaments WHERE tenant_id = \? ORDER BY id ASC/i.test(sql)) {
                const [tenant_id] = params as [string];
                return { results: tournaments.filter((t) => t.tenant_id === tenant_id).sort((a, b) => a.id - b.id) as unknown as T[] };
              }
              if (/FROM padel_categories WHERE tenant_id = \?/i.test(sql)) {
                const [tenant_id] = params as [string];
                return {
                  results: categories
                    .filter((c) => c.tenant_id === tenant_id)
                    .map((c) => ({ category: c.category, weekday: c.weekday, chat_id: c.chat_id })) as unknown as T[],
                };
              }
              if (/FROM padel_matches\s+WHERE tenant_id = \? AND score_a IS NOT NULL AND score_b IS NOT NULL/i.test(sql)) {
                const [tenant_id] = params as [string];
                return { results: matches.filter((m) => m.tenant_id === tenant_id && m.score_a !== null && m.score_b !== null) as unknown as T[] };
              }
              if (/SELECT id, player_id, player_name FROM padel_registrations WHERE id IN/i.test(sql)) {
                const ids = params as number[];
                return { results: registrations.filter((r) => ids.includes(r.id)) as unknown as T[] };
              }
              return { results: [] as T[] };
            },
          };
        },
      };
    },
    async batch<T>(statements: { run: () => Promise<T> }[]) {
      const out: T[] = [];
      for (const s of statements) out.push(await s.run());
      return out;
    },
  };
  return db as unknown as D1Database;
}
