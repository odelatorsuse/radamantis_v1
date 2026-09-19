// Etapa 10 (consola del cliente, D10): superficie separada del panel de
// super-admin — identidad visual propia. Segunda ronda de rediseño
// (2026-08-31, a pedido explícito de Oscar): dark mode profundo (#0a0a0f) con
// acentos neón cian/violeta (#22D3EE/#A855F7), glassmorphism (backdrop-filter
// blur en sidebar/tarjetas), glow en hovers y estados activos, canvas de
// partículas (vanilla, sin librerías) de fondo, y scroll-reveal en tarjetas.
// --primary-deep/--accent-deep (versiones oscurecidas de --primary/--accent
// vía color-mix) existen SOLO para que texto blanco siga siendo legible sobre
// los degradados de botones/burbujas — los tonos neón "brillantes" se
// reservan para texto, bordes y glow, nunca como fondo sólido con texto
// encima. --primary-2/--primary-soft siguen derivándose de --primary (no
// fijos) para que el mecanismo de White-label ("Mi marca") mantenga
// degradados coherentes con CUALQUIER color que un tenant elija, no solo con
// el cian por default. Respeta prefers-reduced-motion en todo (partículas,
// transiciones, reveal). Deliberadamente distinta de la paleta Slate/Indigo
// del panel de Oscar y de la paleta terracota del bot — nunca copiada de
// Forja. Consume exclusivamente /api/client/* (auth por sesión propia, no
// ADMIN_API_KEY). Cada cliente ve solo los datos de SU tenant_id.
export const CONSOLE_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Radamantis · Mi consola</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0a0a0f;
    --glass: rgba(255,255,255,0.045);
    --surface-alt: rgba(255,255,255,0.065);
    --border: rgba(255,255,255,0.12);
    --primary: #22D3EE;
    --primary-2: color-mix(in srgb, var(--primary) 55%, white);
    --primary-deep: color-mix(in srgb, var(--primary) 42%, black);
    --primary-soft: color-mix(in srgb, var(--primary) 18%, transparent);
    --accent: #A855F7;
    --accent-deep: color-mix(in srgb, var(--accent) 42%, black);
    --text: #F1F5FF;
    --text-muted: #9098C2;
    --danger: #FF3B6B;
    --danger-bg: rgba(255,59,107,0.15);
    --ok: #2CFCB4;
    --ok-bg: rgba(44,252,180,0.15);
    --gold: #E8C25A;
    --warn-bg: rgba(255,176,32,0.15);
    --radius: 20px;
    --radius-sm: 14px;
    --shadow-sm: 0 2px 10px rgba(0,0,0,0.35);
    --shadow-md: 0 10px 32px rgba(0,0,0,0.5);
    --shadow-lg: 0 28px 70px rgba(0,0,0,0.6);
  }
  @media (prefers-reduced-motion: reduce) {
    * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }
  }
  * { box-sizing: border-box; }
  html { background: var(--bg); }
  body { margin: 0; background: var(--bg); color: var(--text); font-family: "Inter", sans-serif; font-size: 15px; line-height: 1.6; -webkit-font-smoothing: antialiased; min-height: 100vh; }
  h1, h2, h3 { font-family: "Space Grotesk", sans-serif; font-weight: 700; margin: 0; letter-spacing: -0.01em; }
  button { font-family: inherit; cursor: pointer; }
  input { font-family: inherit; }
  svg { display: block; }
  ::placeholder { color: var(--text-muted); opacity: 0.65; }
  :focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; box-shadow: 0 0 0 5px rgba(34,211,238,0.16); border-radius: 4px; }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--surface-alt); border-radius: 8px; }
  ::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--primary) 35%, transparent); }

  #bgCanvas { position: fixed; inset: 0; z-index: 0; pointer-events: none; }
  #authGate, .shell { position: relative; z-index: 1; }

  .reveal { opacity: 0; transform: translateY(18px); transition: opacity 0.6s ease, transform 0.6s ease; }
  .reveal.revealed { opacity: 1; transform: none; }

  #authGate { max-width: 420px; margin: 8vh auto; padding: 40px 20px; border-radius: 28px; animation: authIn 0.7s cubic-bezier(.2,.8,.2,1); }
  @keyframes authIn { from { opacity: 0; transform: translateY(24px) scale(0.98); } to { opacity: 1; transform: none; } }
  .card { background: var(--glass); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid var(--border); border-radius: var(--radius); padding: 26px; box-shadow: var(--shadow-sm); }
  #authGate .card { box-shadow: var(--shadow-lg), 0 0 60px rgba(34,211,238,0.10), 0 0 90px rgba(168,85,247,0.06); padding: 32px 28px; }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; justify-content: center; }
  .brand .dot { width: 12px; height: 12px; border-radius: 50%; background: var(--primary); flex-shrink: 0; box-shadow: 0 0 10px var(--primary); }
  #authGate .brand .dot { width: 46px; height: 46px; border-radius: 14px; background: linear-gradient(135deg, var(--primary), var(--accent)); box-shadow: 0 0 30px rgba(34,211,238,0.45), 0 0 50px rgba(168,85,247,0.25); animation: pulseGlow 3.2s ease-in-out infinite; }
  @keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 30px rgba(34,211,238,0.45), 0 0 50px rgba(168,85,247,0.25); } 50% { box-shadow: 0 0 42px rgba(34,211,238,0.65), 0 0 70px rgba(168,85,247,0.4); } }
  .brand span { font-family: "Space Grotesk", sans-serif; font-weight: 800; font-size: 1.3rem; letter-spacing: 0.01em; text-shadow: 0 0 22px rgba(34,211,238,0.35); }
  .brand img.brand-logo { width: 26px; height: 26px; border-radius: 7px; object-fit: cover; flex-shrink: 0; box-shadow: var(--shadow-sm); }
  label { display: block; font-size: 0.82rem; font-weight: 600; color: var(--text-muted); margin: 16px 0 6px; }
  input[type="email"], input[type="password"], input[type="text"], input[type="time"], textarea, select {
    width: 100%; padding: 10px 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.95rem; background: var(--glass); color: var(--text); transition: border-color 0.15s, box-shadow 0.15s;
  }
  input:focus, textarea:focus, select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent); }
  .btn-primary { position: relative; background: linear-gradient(135deg, var(--primary-deep), var(--accent-deep)); color: #fff; border: none; border-radius: var(--radius-sm); padding: 11px 20px; font-weight: 700; font-size: 0.95rem; box-shadow: 0 0 0 1px rgba(34,211,238,0.35) inset, 0 4px 20px rgba(34,211,238,0.22); transition: box-shadow 0.2s, transform 0.1s, filter 0.2s; }
  .btn-primary:hover { filter: brightness(1.12); box-shadow: 0 0 0 1px rgba(34,211,238,0.55) inset, 0 6px 30px rgba(34,211,238,0.4), 0 6px 30px rgba(168,85,247,0.25); }
  .btn-primary:active { transform: scale(0.98); }
  .btn-secondary { background: var(--glass); backdrop-filter: blur(10px); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 9px 15px; font-size: 0.9rem; transition: border-color 0.15s, background 0.15s, box-shadow 0.2s; }
  .btn-secondary:hover { border-color: var(--primary); background: var(--surface-alt); box-shadow: 0 0 18px rgba(34,211,238,0.16); }
  .btn-danger { background: var(--danger-bg); color: var(--danger); border: 1px solid rgba(255,59,107,0.4); border-radius: var(--radius-sm); padding: 8px 13px; font-size: 0.85rem; transition: background 0.15s; }
  .btn-danger:hover { background: rgba(255,59,107,0.24); }
  .error { color: var(--danger); font-size: 0.85rem; margin-top: 10px; min-height: 1.2em; }
  .success-msg { color: var(--ok); font-size: 0.85rem; margin-top: 10px; min-height: 1.2em; }

  .shell { display: none; grid-template-columns: 232px 1fr; min-height: 100vh; }
  .sidebar { background: rgba(8,8,14,0.55); backdrop-filter: blur(22px); -webkit-backdrop-filter: blur(22px); border-right: 1px solid var(--border); padding: 22px 16px; display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
  .sidebar .brand { justify-content: flex-start; margin-bottom: 6px; padding-left: 4px; }
  .tenant-name { font-size: 0.83rem; color: var(--text-muted); padding: 0 4px 18px; border-bottom: 1px solid var(--border); margin-bottom: 14px; }
  .nav-section { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); opacity: 0.7; padding: 14px 12px 6px; }
  .nav-section:first-of-type { padding-top: 0; }
  .nav-item { display: flex; align-items: center; gap: 11px; padding: 10px 12px; border-radius: var(--radius-sm); border: none; background: none; color: var(--text-muted); font-size: 0.92rem; font-weight: 500; text-align: left; width: 100%; margin-bottom: 2px; transition: background 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s; }
  .nav-item:hover { background: var(--surface-alt); color: var(--text); transform: translateX(2px); }
  .nav-item.active { background: linear-gradient(135deg, var(--primary-deep), var(--accent-deep)); color: #fff; font-weight: 700; box-shadow: 0 0 0 1px rgba(34,211,238,0.3) inset, 0 4px 18px rgba(34,211,238,0.25); }
  .nav-item svg { width: 18px; height: 18px; flex-shrink: 0; }
  .sidebar-footer { margin-top: auto; padding-top: 16px; border-top: 1px solid var(--border); }

  .main { padding: 30px 34px; overflow-x: hidden; max-width: 1120px; }
  .tab-view { display: none; }
  .tab-view.active { display: block; animation: viewIn 0.45s cubic-bezier(.2,.8,.2,1); }
  @keyframes viewIn { from { opacity: 0; transform: translateY(14px); filter: blur(4px); } to { opacity: 1; transform: none; filter: blur(0); } }
  .page-title { font-size: 1.5rem; margin-bottom: 4px; }
  .page-sub { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 24px; }

  .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-bottom: 26px; }
  .metric { position: relative; overflow: hidden; background: var(--glass); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid var(--border); border-radius: var(--radius); padding: 22px 20px 18px; box-shadow: var(--shadow-sm); transition: box-shadow 0.2s, transform 0.2s; }
  .metric::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, var(--primary), var(--primary-2)); box-shadow: 0 0 12px rgba(34,211,238,0.6); }
  .metric:nth-child(2)::before { background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 55%, white)); box-shadow: 0 0 12px rgba(168,85,247,0.6); }
  .metric:nth-child(3)::before { background: linear-gradient(90deg, var(--primary-2), var(--accent)); box-shadow: 0 0 12px rgba(34,211,238,0.4); }
  .metric:hover { box-shadow: var(--shadow-md), 0 0 26px rgba(34,211,238,0.14); transform: translateY(-3px); }
  .metric .value { font-family: "Space Grotesk", sans-serif; font-size: 1.9rem; font-weight: 800; text-shadow: 0 0 24px rgba(34,211,238,0.28); }
  .metric .label { font-size: 0.8rem; color: var(--text-muted); margin-top: 4px; }

  .panel { background: var(--glass); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid var(--border); border-radius: var(--radius); padding: 22px; margin-bottom: 20px; box-shadow: var(--shadow-sm); }
  .panel h3 { font-size: 1.02rem; margin-bottom: 16px; font-family: "Space Grotesk", sans-serif; }

  .chart { display: flex; align-items: flex-end; gap: 10px; height: 170px; padding-top: 10px; }
  .chart-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; height: 100%; justify-content: flex-end; }
  .chart-bars { display: flex; gap: 4px; align-items: flex-end; height: 136px; width: 100%; justify-content: center; }
  .chart-bar { width: 38%; border-radius: 5px 5px 2px 2px; min-height: 3px; transition: opacity 0.15s; }
  .chart-bar.in { background: linear-gradient(180deg, var(--primary-2), var(--primary)); box-shadow: 0 0 10px rgba(34,211,238,0.5); }
  .chart-bar.out { background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 55%, white), var(--accent)); box-shadow: 0 0 10px rgba(168,85,247,0.5); }
  .chart-col:hover .chart-bar { opacity: 0.85; }
  .chart-col .day-label { font-size: 0.72rem; color: var(--text-muted); font-weight: 600; text-transform: capitalize; }
  .chart-legend { display: flex; gap: 18px; font-size: 0.8rem; color: var(--text-muted); margin-top: 12px; }
  .chart-legend span { display: inline-flex; align-items: center; gap: 7px; }
  .legend-dot { width: 9px; height: 9px; border-radius: 50%; }

  table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  th { text-align: left; color: var(--text-muted); font-weight: 700; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.04em; padding: 8px 10px; border-bottom: 1px solid var(--border); }
  td { padding: 11px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tbody tr { transition: background 0.12s; }
  tbody tr:hover td { background: var(--surface-alt); }
  .mono { font-family: "Fira Code", monospace; font-size: 0.82rem; color: var(--text-muted); }
  .empty { color: var(--text-muted); font-size: 0.88rem; padding: 14px 0; text-align: center; }

  .status-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 8px; }
  .status-ok .status-dot { background: var(--ok); box-shadow: 0 0 0 3px var(--ok-bg), 0 0 8px var(--ok); }
  .status-warn .status-dot { background: var(--accent); box-shadow: 0 0 0 3px var(--warn-bg), 0 0 8px var(--accent); }
  .health-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border); }
  .health-row:last-child { border-bottom: none; }
  .health-label { font-weight: 500; }
  .health-value { font-size: 0.85rem; color: var(--text-muted); }

  /* Backlog de Agencia (padel): "llaves" de verdad para cada partido (no
     texto plano) — la pareja ganadora se marca en color en cuanto hay
     marcador, y la tabla de posiciones tiene una vista "gamer" (rachas en
     llamas, líder con corona, barra de puntos) — pedido explícito de
     Oscar tras ver la primera versión de este panel. */
  .padelMatch { background: var(--glass); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px 14px; margin-bottom: 10px; }
  .padelMatch.final { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset, 0 0 24px rgba(168,85,247,0.18); }
  .padelCourt { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 8px; font-weight: 700; }
  .padelTeam { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--radius-sm); margin-bottom: 6px; transition: background 0.15s, box-shadow 0.15s; }
  .padelTeam:last-of-type { margin-bottom: 10px; }
  .padelTeam.winner { background: var(--ok-bg); box-shadow: 0 0 0 1px var(--ok) inset; }
  .padelNames { font-weight: 600; font-size: 0.92rem; }
  .padelTeam.winner .padelNames { color: var(--ok); }
  .padelTeam.winner .padelNames::before { content: "🏆 "; }
  .padelScoreInput { width: 58px; text-align: center; padding: 6px 4px; flex-shrink: 0; }
  .padelSaveBtn { margin-top: 2px; }
  .standingsGamer { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
  .standingsRow { position: relative; overflow: hidden; display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: var(--radius-sm); background: var(--glass); border: 1px solid var(--border); }
  /* Oscar: "los 8 que pasan a semifinales, en un color diferente, y los 3
     primeros lugares también en otro color diferente" — 2 tiers reales,
     no decorativos: top8 = quien clasificaría a semifinal hoy mismo. */
  .standingsRow.top8 { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 10%, var(--glass)); }
  .standingsRow.top3 { border-color: var(--gold); background: color-mix(in srgb, var(--gold) 14%, var(--glass)); }
  .standingsRow.leader { box-shadow: 0 0 0 1px var(--accent) inset, 0 0 20px rgba(168,85,247,0.25); }
  .standingsBar { position: absolute; inset: 0; right: auto; background: linear-gradient(90deg, var(--primary-deep), transparent); opacity: 0.3; z-index: 0; }
  .standingsRow.top3 .standingsBar { background: linear-gradient(90deg, var(--gold), transparent); opacity: 0.35; }
  .standingsRow > * { position: relative; z-index: 1; }
  .standingsPos { font-family: "Space Grotesk", sans-serif; font-weight: 800; width: 24px; text-align: center; color: var(--text-muted); flex-shrink: 0; }
  .standingsRow.top3 .standingsPos { color: var(--gold); }
  .standingsRow.leader .standingsPos { color: var(--accent); }
  .standingsIcon { font-size: 1rem; flex-shrink: 0; }
  .standingsName { flex: 1; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .standingsStreak { font-size: 0.82rem; flex-shrink: 0; }
  .standingsPoints { font-family: "Space Grotesk", sans-serif; font-weight: 800; font-size: 1.05rem; min-width: 42px; text-align: right; flex-shrink: 0; }

  /* Backlog de Agencia (padel): NO árbol de eliminación (Oscar fue
     explícito) — pestañas por ronda/fase, cada una con un grid de
     tarjetas, estilo Reta Americana real (todos juegan todas las rondas,
     nadie "avanza" a un centro de cuadro). */
  .padelTabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0 14px; }
  .padelTab { background: var(--glass); border: 1px solid var(--border); color: var(--text-muted); border-radius: 999px; padding: 7px 16px; font-size: 0.85rem; font-weight: 600; transition: background 0.15s, color 0.15s, border-color 0.15s; }
  .padelTab:hover { color: var(--text); border-color: var(--primary); }
  .padelTab.active { background: linear-gradient(135deg, var(--primary-deep), var(--accent-deep)); color: #fff; border-color: transparent; box-shadow: 0 0 0 1px rgba(34,211,238,0.3) inset; }
  .padelMatchGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }

  /* Backlog de Agencia (padel): "Limpiar / Iniciar nuevo torneo" — Oscar
     confirmó que borra de verdad inscripciones/marcadores (destructivo
     real), así que usa el mismo patrón de doble confirmación que "Zona de
     peligro" al borrar un tenant: escribir el nombre exacto para habilitar. */
  .padelDangerZone { border: 1px solid rgba(255,59,107,0.35); border-radius: var(--radius-sm); padding: 14px 16px; margin-top: 16px; }
  .padelDangerZone h4 { margin: 0 0 6px; color: var(--danger); font-size: 0.9rem; }

  .badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 999px; font-size: 0.72rem; font-weight: 700; }
  .badge::before { content: ""; width: 6px; height: 6px; border-radius: 50%; }
  .badge.paused { background: var(--danger-bg); color: var(--danger); }
  .badge.paused::before { background: var(--danger); }
  .badge.active { background: var(--ok-bg); color: var(--ok); }
  .badge.active::before { background: var(--ok); }
  .badge.muted { background: var(--surface-alt); color: var(--text-muted); }
  .badge.muted::before { background: var(--text-muted); }

  .conv-layout { display: grid; grid-template-columns: 320px 1fr; gap: 18px; align-items: start; }
  .conv-list { max-height: 640px; overflow-y: auto; }
  .conv-list-item { padding: 13px; border-radius: var(--radius-sm); border: 1px solid transparent; cursor: pointer; margin-bottom: 5px; transition: background 0.12s, border-color 0.12s; }
  .conv-list-item:hover { background: var(--surface-alt); }
  .conv-list-item.selected { border-color: var(--primary); background: var(--primary-soft); box-shadow: 0 0 16px rgba(34,211,238,0.14); }
  .conv-list-item .top { display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 600; }
  .conv-list-item .preview { font-size: 0.8rem; color: var(--text-muted); margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .conv-detail { min-height: 300px; }
  .composer { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border); }
  .composer textarea { resize: vertical; }
  .conv-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .msg-list { max-height: 480px; overflow-y: auto; display: flex; flex-direction: column; gap: 11px; padding-right: 6px; }
  .msg { max-width: 75%; padding: 10px 14px; border-radius: 16px; font-size: 0.88rem; box-shadow: var(--shadow-sm); }
  .msg.user { align-self: flex-start; background: var(--surface-alt); border-bottom-left-radius: 4px; }
  .msg.assistant { align-self: flex-end; background: linear-gradient(135deg, var(--primary-deep), var(--accent-deep)); color: #fff; border-bottom-right-radius: 4px; box-shadow: 0 0 16px rgba(34,211,238,0.18); }
  .msg .meta { font-size: 0.68rem; opacity: 0.75; margin-top: 4px; }

  @media (max-width: 800px) {
    .shell { grid-template-columns: 1fr; }
    .sidebar { flex-direction: row; align-items: center; overflow-x: auto; overflow-y: visible; height: auto; top: 0; z-index: 10; gap: 10px; padding: 12px 14px; border-right: none; border-bottom: 1px solid var(--border); }
    .sidebar .brand, .sidebar .tenant-name, .nav-section { display: none; }
    .nav-item { width: auto; white-space: nowrap; margin-bottom: 0; }
    .sidebar-footer { margin-top: 0; margin-left: auto; border-top: none; padding-top: 0; flex-shrink: 0; }
    .sidebar-footer button { width: auto; white-space: nowrap; }
    .conv-layout { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>

<canvas id="bgCanvas" aria-hidden="true"></canvas>

<div id="authGate">
  <div class="brand"><span class="dot"></span><span>Radamantis</span></div>
  <div class="card">
    <h2 style="margin-bottom:4px;">Mi consola</h2>
    <p class="page-sub" style="margin-bottom:0;">Entra con el correo y contraseña que te dio tu proveedor.</p>
    <form id="loginForm">
      <label>Correo</label>
      <input type="email" id="loginEmail" required />
      <label>Contraseña</label>
      <input type="password" id="loginPassword" required />
      <div style="margin-top:18px;"><button class="btn-primary" type="submit" style="width:100%;">Entrar</button></div>
      <div class="error" id="loginError"></div>
    </form>
  </div>
</div>

<div class="shell" id="shell">
  <aside class="sidebar">
    <div class="brand" id="sidebarBrand"><span class="dot"></span><span>Radamantis</span></div>
    <div class="tenant-name" id="tenantNameLabel"></div>
    <div class="nav-section">Actividad</div>
    <button class="nav-item active" data-tab="resumen">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="12" width="4" height="8" rx="1"/><rect x="10" y="7" width="4" height="13" rx="1"/><rect x="17" y="3" width="4" height="17" rx="1"/></svg>
      Resumen
    </button>
    <button class="nav-item" data-tab="citas">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
      Citas
    </button>
    <button class="nav-item" data-tab="clientes">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/></svg>
      Clientes
    </button>
    <button class="nav-item" data-tab="conversaciones">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v11H8l-4 4V5z"/></svg>
      Conversaciones
    </button>
    <div class="nav-section">Contenido</div>
    <button class="nav-item" data-tab="conocimiento">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
      Conocimiento
    </button>
    <button class="nav-item" data-tab="catalogo">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>
      Catálogo
    </button>
    <button class="nav-item" data-tab="torneos">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="2" width="10" height="13" rx="5"/><path d="M11 15v3M8 21h6"/><circle cx="19" cy="19" r="2.2"/></svg>
      Torneos
    </button>
    <div class="nav-section">Configuración</div>
    <button class="nav-item" data-tab="salud">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12h4l2-7 4 14 2-7h4"/></svg>
      Salud
    </button>
    <button class="nav-item" data-tab="mejoras">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
      Mejoras
    </button>
    <button class="nav-item" data-tab="marca">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
      Mi marca
    </button>
    <div class="sidebar-footer">
      <button class="btn-secondary" id="logoutBtn" style="width:100%;">Cerrar sesión</button>
    </div>
  </aside>

  <main class="main">

    <section class="tab-view active" id="tab-resumen">
      <h1 class="page-title">Resumen de hoy</h1>
      <p class="page-sub">Actividad de tu bot en las últimas 24 horas.</p>
      <div class="metrics" id="todayMetrics"></div>
      <div class="panel">
        <h3>Actividad — últimos 7 días</h3>
        <div class="chart" id="weekChart"></div>
        <div class="chart-legend">
          <span><span class="legend-dot" style="background:var(--primary)"></span>Mensajes de clientes</span>
          <span><span class="legend-dot" style="background:var(--accent)"></span>Respuestas del bot</span>
        </div>
      </div>
    </section>

    <section class="tab-view" id="tab-citas">
      <h1 class="page-title">Citas</h1>
      <p class="page-sub">Próximas citas y las más recientes ya pasadas.</p>
      <div class="panel">
        <h3 id="currentMonthTitle">Este mes</h3>
        <table id="currentMonthTable"><thead><tr><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Contacto</th><th>Motivo</th><th>Con</th><th>Estado</th></tr></thead><tbody></tbody></table>
        <p class="empty" id="currentMonthEmpty" style="display:none;">Sin citas este mes.</p>
      </div>
      <div class="panel">
        <h3>Próximas</h3>
        <table id="upcomingTable"><thead><tr><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Contacto</th><th>Motivo</th><th>Con</th></tr></thead><tbody></tbody></table>
        <p class="empty" id="upcomingEmpty" style="display:none;">No hay citas próximas.</p>
      </div>
      <div class="panel">
        <h3>Recientes</h3>
        <table id="pastTable"><thead><tr><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Contacto</th><th>Motivo</th><th>Con</th></tr></thead><tbody></tbody></table>
        <p class="empty" id="pastEmpty" style="display:none;">Sin historial todavía.</p>
      </div>
    </section>

    <section class="tab-view" id="tab-clientes">
      <h1 class="page-title">Clientes</h1>
      <p class="page-sub">Cada hilo de conversación es un cliente potencial — su nombre solo aparece si ya agendó una cita.</p>
      <div class="panel">
        <table id="clientsTable"><thead><tr><th>Cliente</th><th>Canal</th><th>Contacto</th><th>Mensajes</th><th>Última actividad</th></tr></thead><tbody></tbody></table>
        <p class="empty" id="clientsEmpty" style="display:none;">Todavía no hay conversaciones.</p>
      </div>
    </section>

    <section class="tab-view" id="tab-conversaciones">
      <h1 class="page-title">Conversaciones</h1>
      <p class="page-sub">Pausa una conversación para que el bot deje de responder y puedas tomarla tú directamente.</p>
      <div class="conv-layout">
        <div class="panel conv-list" id="conversationList"></div>
        <div class="panel conv-detail" id="conversationDetail">
          <p class="empty">Selecciona una conversación de la izquierda.</p>
        </div>
      </div>
    </section>

    <section class="tab-view" id="tab-conocimiento">
      <div class="topbar" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <h1 class="page-title">Conocimiento</h1>
          <p class="page-sub">Lo que tu bot sabe de tu negocio. Cada documento se indexa al guardar y el bot lo usa de inmediato.</p>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;">
          <button class="btn-secondary" id="kbReindexBtn">Reindexar todo</button>
          <button class="btn-primary" id="kbNewBtn">+ Nuevo documento</button>
        </div>
      </div>
      <p class="error" id="kbReindexMsg"></p>

      <div class="panel" id="kbDocsPanel"></div>
      <p class="empty" id="kbDocsEmpty" style="display:none;">Todavía no tienes documentos. Agrega el primero con "Nuevo documento".</p>

      <div class="panel" id="kbFormPanel" style="display:none;">
        <h3 id="kbFormTitle">Nuevo documento</h3>
        <form id="kbForm">
          <input type="text" id="kbTitleInput" placeholder="Título (ej. Preguntas Frecuentes)" style="width:100%;" required />
          <textarea id="kbContentInput" placeholder="Contenido — lo que el bot debe saber sobre esto..." style="width:100%;min-height:160px;margin-top:10px;"></textarea>
          <div style="margin-top:10px;display:flex;gap:8px;">
            <button class="btn-primary" type="submit">Guardar</button>
            <button class="btn-secondary" type="button" id="kbFormCancel">Cancelar</button>
          </div>
          <div class="error" id="kbFormMsg"></div>
        </form>
      </div>
    </section>

    <section class="tab-view" id="tab-catalogo">
      <div class="topbar" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <h1 class="page-title">Catálogo</h1>
          <p class="page-sub">Productos, propiedades o platillos que tu bot puede buscar y mostrar con foto cuando un cliente pregunte. Solo aplica si tu negocio lo usa (ej. inmobiliaria, restaurante, panadería, tienda) — si no, puedes ignorar esta pestaña.</p>
        </div>
        <button class="btn-primary" id="catalogNewBtn" style="flex-shrink:0;">+ Nuevo item</button>
      </div>

      <div class="panel" id="catalogPanel"></div>
      <p class="empty" id="catalogEmpty" style="display:none;">Todavía no tienes items en tu catálogo. Agrega el primero con "Nuevo item".</p>

      <div class="panel" id="catalogFormPanel" style="display:none;">
        <h3 id="catalogFormTitle">Nuevo item</h3>
        <form id="catalogForm">
          <input type="text" id="catalogTitleInput" placeholder="Nombre (ej. Departamento en Polanco)" style="width:100%;" required />
          <textarea id="catalogDescriptionInput" placeholder="Descripción — lo que el bot debe decir sobre esto..." style="width:100%;min-height:100px;margin-top:10px;"></textarea>
          <input type="text" id="catalogPriceInput" placeholder="Precio (opcional, ej. $2,500,000 MXN)" style="width:100%;margin-top:10px;" />
          <input type="text" id="catalogPhotoUrlInput" placeholder="URL de una foto (opcional)" style="width:100%;margin-top:10px;" />
          <div style="margin-top:10px;display:flex;gap:8px;">
            <button class="btn-primary" type="submit">Guardar</button>
            <button class="btn-secondary" type="button" id="catalogFormCancel">Cancelar</button>
          </div>
          <div class="error" id="catalogFormMsg"></div>
        </form>
      </div>
    </section>

    <section class="tab-view" id="tab-torneos">
      <div class="topbar">
        <div>
          <h1 class="page-title">Torneos</h1>
          <p class="page-sub">Convocatorias de Retas Americanas y torneos de pareja fija — cupo, lista de espera y quién se ha inscrito.</p>
        </div>
      </div>

      <div class="padelTabs" style="margin-bottom:16px;">
        <button type="button" class="padelTab active" id="padelSectionConfigBtn">Configuración</button>
        <button type="button" class="padelTab" id="padelSectionLiveBtn">En vivo</button>
      </div>

      <!-- Backlog de Agencia (ronda de reestructura): "2 secciones
           seleccionables" — Configuración (categorías, reglas por
           defecto, alta de convocatorias) vs. En vivo (una pestaña por
           cada reta/torneo que sigue activo). Antes todo vivía apilado
           en una sola vista larga. -->
      <div id="padelSectionConfig">
        <div class="panel">
          <h3>Pantalla del club</h3>
          <p class="page-sub" style="margin-bottom:10px;">Una sola pantalla con las 6 categorías a la vez (llaves, marcadores, campeones) — pensada para una TV o monitor del club.</p>
          <button class="btn-secondary" id="posterScreenBtn">Abrir pantalla del club</button>
        </div>

        <div class="panel">
          <h3>Categorías</h3>
          <p class="page-sub" style="margin-bottom:10px;">Cada categoría tiene su propio grupo de Telegram y normalmente un día fijo de la semana (ej. 6ta los martes, 5ta los jueves) — configúralo aquí, es editable cuando quieras.</p>
          <table id="categoriesTable"><thead><tr><th>Categoría</th><th>Día habitual</th><th>Chat de Telegram (grupo)</th><th></th></tr></thead><tbody></tbody></table>
        </div>

        <div class="panel">
          <h3>Reglas (valores por defecto)</h3>
          <p class="page-sub" style="margin-bottom:10px;">Solo precargan el formulario de "Nueva convocatoria" — cada convocatoria pregunta y guarda sus propios valores, así que un club puede usar distinto número de canchas o rondas según la categoría o el día.</p>
          <form id="padelSettingsForm">
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <div style="flex:1;min-width:140px;">
                <label style="font-size:0.8rem;color:var(--text-muted);">Rondas por defecto</label>
                <input type="number" id="padelRoundsInput" min="1" style="width:100%;" />
              </div>
              <div style="flex:1;min-width:140px;">
                <label style="font-size:0.8rem;color:var(--text-muted);">Canchas por defecto</label>
                <input type="number" id="padelCourtCountInput" min="1" style="width:100%;" />
              </div>
              <div style="flex:2;min-width:220px;">
                <label style="font-size:0.8rem;color:var(--text-muted);">Modalidad por defecto</label>
                <select id="padelDefaultModeInput" style="width:100%;">
                  <option value="individual">Reta americana (pareja rotativa)</option>
                  <option value="pareja">Torneo de parejas (pareja fija)</option>
                </select>
              </div>
            </div>
            <div style="margin-top:12px;">
              <button class="btn-primary" type="submit">Guardar</button>
            </div>
            <div class="error" id="padelSettingsMsg"></div>
          </form>
        </div>

        <div class="panel">
          <h3>Nueva convocatoria</h3>
          <button class="btn-primary" id="tournamentNewBtn">+ Nueva convocatoria</button>
          <div id="tournamentFormPanel" style="display:none;margin-top:16px;">
            <form id="tournamentForm">
              <h4 style="margin:0 0 8px;color:var(--text-muted);font-size:0.85rem;text-transform:uppercase;letter-spacing:0.06em;">Retas y torneos</h4>
              <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <div style="flex:1;min-width:160px;">
                  <label style="font-size:0.8rem;color:var(--text-muted);">Categoría</label>
                  <select id="tournamentCategoryInput" style="width:100%;">
                    <option value="">Sin categoría</option>
                    <option value="6ta">6ta</option>
                    <option value="5ta">5ta</option>
                    <option value="4ta">4ta</option>
                    <option value="3ra">3ra</option>
                    <option value="2da">2da</option>
                    <option value="1ra">1ra</option>
                  </select>
                </div>
                <div style="flex:1;min-width:200px;">
                  <label style="font-size:0.8rem;color:var(--text-muted);">Modalidad</label>
                  <select id="tournamentModeInput" style="width:100%;">
                    <option value="individual">Reta americana (pareja rotativa)</option>
                    <option value="pareja">Torneo de parejas (pareja fija)</option>
                  </select>
                </div>
                <div style="width:130px;">
                  <label style="font-size:0.8rem;color:var(--text-muted);">Cupo (<span id="tournamentCapacityUnitLabel">jugadores</span>)</label>
                  <input type="number" id="tournamentCapacityInput" value="20" min="1" style="width:100%;" />
                </div>
                <div style="width:110px;">
                  <label style="font-size:0.8rem;color:var(--text-muted);">Rondas</label>
                  <input type="number" id="tournamentRoundsInput" min="1" style="width:100%;" />
                </div>
                <div style="width:110px;">
                  <label style="font-size:0.8rem;color:var(--text-muted);">Canchas</label>
                  <input type="number" id="tournamentCourtCountInput" min="1" style="width:100%;" />
                </div>
              </div>

              <h4 style="margin:16px 0 8px;color:var(--text-muted);font-size:0.85rem;text-transform:uppercase;letter-spacing:0.06em;">Detalles</h4>
              <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <div style="flex:2;min-width:200px;">
                  <label style="font-size:0.8rem;color:var(--text-muted);">Nombre</label>
                  <input type="text" id="tournamentLabelInput" placeholder="Ej. Reta 6ta - Martes" style="width:100%;" required />
                </div>
                <div style="flex:1;min-width:200px;">
                  <label style="font-size:0.8rem;color:var(--text-muted);">Fecha y hora de la jornada</label>
                  <input type="datetime-local" id="tournamentScheduledInput" style="width:100%;" required />
                </div>
                <div style="flex:1;min-width:200px;">
                  <label style="font-size:0.8rem;color:var(--text-muted);">Hora límite de inscripción</label>
                  <input type="datetime-local" id="tournamentDeadlineInput" style="width:100%;" required />
                </div>
              </div>

              <div style="margin-top:14px;display:flex;gap:8px;">
                <button class="btn-primary" type="submit">Abrir convocatoria</button>
                <button class="btn-secondary" type="button" id="tournamentFormCancel">Cancelar</button>
              </div>
              <div class="error" id="tournamentFormMsg"></div>
            </form>
          </div>
        </div>
      </div>

      <!-- Sección "En vivo": una pestaña por cada reta/torneo que sigue
           activo — desaparece sola cuando la convocatoria se finaliza. -->
      <div id="padelSectionLive" style="display:none;">
        <div class="padelTabs" id="tournamentsTabStrip"></div>
        <div id="tournamentsPanel"></div>
        <p class="empty" id="tournamentsEmpty" style="display:none;">No hay convocatorias activas todavía. Abre la primera desde "Configuración".</p>
      </div>
    </section>

    <section class="tab-view" id="tab-salud">
      <h1 class="page-title">Salud</h1>
      <p class="page-sub">Estado de conexión de tu bot — no es un monitoreo en vivo, es lo último que sabemos.</p>
      <div class="panel" id="healthPanel"></div>

      <div class="panel">
        <h3>Alertas</h3>
        <p class="page-sub" style="margin-bottom:14px;">Recibe un aviso por Telegram cuando un cliente pida hablar con alguien o suene molesto.</p>
        <div id="alertSettingsPanel"></div>
      </div>

      <div class="panel">
        <h3>Reseñas</h3>
        <p class="page-sub" style="margin-bottom:14px;">Cuando un cliente califica su cita con 4 o 5, el bot le comparte este link para pedirle una reseña. Sin un link aquí, solo agradece.</p>
        <form id="reviewLinkForm">
          <input type="text" id="reviewLinkInput" placeholder="https://g.page/r/tu-negocio/review" style="width:100%;" />
          <div style="margin-top:10px;"><button class="btn-primary" type="submit">Guardar</button></div>
          <div class="error" id="reviewLinkMsg"></div>
        </form>
      </div>

      <div class="panel">
        <h3>Reenganche de leads fríos</h3>
        <p class="page-sub" style="margin-bottom:14px;">Si un cliente pregunta algo y no vuelve a escribir en unas horas, el bot le manda un mensaje de seguimiento (hasta 2 veces). Apagado por default.</p>
        <label style="display:flex;align-items:center;gap:10px;font-size:0.92rem;cursor:pointer;">
          <input type="checkbox" id="leadReengagementToggle" style="width:auto;" />
          Activar reenganche automático
        </label>
        <div class="error" id="leadReengagementMsg"></div>
      </div>

      <div class="panel">
        <h3>Reanudar el bot automáticamente</h3>
        <p class="page-sub" style="margin-bottom:14px;">Cuando pausas una conversación (o el bot la pausa porque el cliente pidió un humano), normalmente se queda así hasta que la reanudes tú. Si activas esto, el bot vuelve a responder solo después de 3 horas. Apagado por default — actívalo solo si prefieres que el bot retome la conversación en vez de quedarse pausada indefinidamente.</p>
        <label style="display:flex;align-items:center;gap:10px;font-size:0.92rem;cursor:pointer;">
          <input type="checkbox" id="autoResumeToggle" style="width:auto;" />
          Reanudar automáticamente después de 3 horas
        </label>
        <div class="error" id="autoResumeMsg"></div>
      </div>

      <div class="panel">
        <h3>Palabras que piden un humano</h3>
        <p class="page-sub" style="margin-bottom:14px;">Si el cliente escribe alguna de estas frases, el bot pausa la conversación y te avisa. Ya reconoce frases comunes ("hablar con una persona", "es una emergencia", etc.) — esto es SOLO para agregar frases propias de tu negocio, no reemplaza las de siempre. Sepáralas con comas.</p>
        <form id="handoffKeywordsForm">
          <textarea id="handoffKeywordsInput" placeholder="ej. quiero hablar con el doctor, cirugía urgente" style="width:100%;min-height:70px;"></textarea>
          <div style="margin-top:10px;"><button class="btn-primary" type="submit">Guardar</button></div>
          <div class="error" id="handoffKeywordsMsg"></div>
        </form>
      </div>

      <div class="panel" id="staffPanel" style="display:none;">
        <h3>Personal</h3>
        <p class="page-sub" style="margin-bottom:14px;">Si tienes más de una persona, cancha o clase con la que se puede agendar (estilistas, barberos, doctores, Cancha 1/Cancha 2, Clase de iniciación...), agrégalos aquí para que el bot pueda preguntar y agendar con cuál específico. Déjalo vacío si no aplica — el bot sigue agendando normal, sin pedir con cuál. Sepáralos con comas.</p>
        <form id="staffMembersForm">
          <textarea id="staffMembersInput" placeholder="ej. Ana, Carlos" style="width:100%;min-height:50px;"></textarea>
          <div style="margin-top:10px;"><button class="btn-primary" type="submit">Guardar</button></div>
          <div class="error" id="staffMembersMsg"></div>
        </form>
      </div>
    </section>

    <section class="tab-view" id="tab-mejoras">
      <h1 class="page-title">Mejoras</h1>
      <p class="page-sub">Preguntas que tu bot no pudo responder con confianza — agrégalas a tu base de conocimiento. Nunca se agregan solas.</p>
      <div class="panel">
        <table id="kbGapsTable"><thead><tr><th>Pregunta</th><th>Fecha</th><th></th></tr></thead><tbody></tbody></table>
        <p class="empty" id="kbGapsEmpty" style="display:none;">No hay preguntas sin responder registradas — buena señal.</p>
      </div>
    </section>

    <section class="tab-view" id="tab-marca">
      <h1 class="page-title">Mi marca</h1>
      <p class="page-sub">Personaliza cómo se ve esta consola — tu nombre, tu logo y tu color en vez de los de Radamantis. Ninguno es obligatorio: lo que dejes vacío usa el valor por default.</p>
      <div class="panel">
        <form id="brandingForm">
          <label>Nombre para mostrar</label>
          <input type="text" id="brandingName" placeholder="ej. Dr. Vet CH" />

          <label>URL de tu logo</label>
          <input type="text" id="brandingLogoUrl" placeholder="https://tusitio.com/logo.png" />
          <p class="page-sub" style="margin:4px 0 0;">Cuadrado, idealmente 128×128px o más. Si la imagen no carga, se muestra el punto de color de siempre.</p>

          <label style="margin-top:10px;">O sube una imagen o foto de tu negocio</label>
          <input type="file" id="brandingLogoFile" accept="image/png,image/jpeg,image/webp,image/gif" />
          <p class="page-sub" style="margin:4px 0 0;">Se ajusta sola al subirla — puedes usar una foto tomada con el celular, no hace falta editarla antes.</p>

          <label>Color principal</label>
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="color" id="brandingColorPicker" style="width:44px;height:38px;padding:2px;" />
            <input type="text" id="brandingColor" placeholder="#22D3EE" style="max-width:140px;" />
          </div>

          <div style="margin-top:18px;display:flex;gap:10px;">
            <button class="btn-primary" type="submit">Guardar</button>
            <button class="btn-secondary" type="button" id="resetBrandingBtn">Quitar mi marca</button>
          </div>
          <div class="error" id="brandingMsg"></div>
        </form>
      </div>
    </section>

  </main>
</div>

<script>
(function initParticleField() {
  var canvas = document.getElementById("bgCanvas");
  if (!canvas || !canvas.getContext) return;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ctx = canvas.getContext("2d");
  var w, h, particles, rafId;
  var COLORS = ["34,211,238", "168,85,247"];

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    var count = w < 640 ? 22 : 48;
    particles = [];
    for (var i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.5 + 0.6,
        c: COLORS[i % COLORS.length],
      });
    }
  }

  function frame() {
    ctx.clearRect(0, 0, w, h);
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + p.c + ",0.75)";
      ctx.fill();
    }
    for (var i = 0; i < particles.length; i++) {
      for (var j = i + 1; j < particles.length; j++) {
        var a = particles[i], b = particles[j];
        var dx = a.x - b.x, dy = a.y - b.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 130) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = "rgba(150,160,230," + (0.14 * (1 - dist / 130)) + ")";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }

  function loop() { frame(); rafId = requestAnimationFrame(loop); }
  function start() { if (!rafId && !reduceMotion) loop(); }
  function stop() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else start();
  });

  resize();
  if (reduceMotion) { frame(); } else { start(); }
})();

(function () {
  var STORAGE_KEY = "radamantisClientToken";
  var STORAGE_TENANT = "radamantisClientTenant";
  var currentConversation = null;

  // Scroll-reveal: fade+rise cards into view as the operator scrolls a tab.
  // Force-reveals after a timeout so nothing stays invisible if
  // IntersectionObserver misbehaves — this is a working tool, not a demo.
  var revealObserver = ("IntersectionObserver" in window)
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1 })
    : null;

  function observeReveal(el) {
    el.classList.add("reveal");
    if (revealObserver) {
      revealObserver.observe(el);
      setTimeout(function () { el.classList.add("revealed"); }, 2500);
    } else {
      el.classList.add("revealed");
    }
  }

  function token() { return localStorage.getItem(STORAGE_KEY) || ""; }

  function api(path, options) {
    options = options || {};
    options.headers = Object.assign({}, options.headers, {
      "Authorization": "Bearer " + token(),
      "Content-Type": "application/json",
    });
    return fetch("/api/client" + path, options).then(function (res) {
      if (res.status === 401) { showAuthGate("Sesión expirada, entra de nuevo."); throw new Error("unauthorized"); }
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || "Error");
        return data;
      });
    });
  }

  function showAuthGate(err) {
    document.getElementById("shell").style.display = "none";
    document.getElementById("authGate").style.display = "block";
    document.getElementById("loginError").textContent = err || "";
  }

  function showApp() {
    document.getElementById("authGate").style.display = "none";
    document.getElementById("shell").style.display = "grid";
    document.getElementById("tenantNameLabel").textContent = localStorage.getItem(STORAGE_TENANT) || "";
    loadAll();
  }

  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }

  function formatDateTime(iso) {
    if (!iso) return "—";
    var d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
    return d.toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function metricTile(value, label) {
    var div = document.createElement("div");
    div.className = "metric";
    div.innerHTML = "<div class='value'>" + esc(value) + "</div><div class='label'>" + esc(label) + "</div>";
    observeReveal(div);
    return div;
  }

  document.querySelectorAll(".panel").forEach(observeReveal);

  document.querySelectorAll(".nav-item[data-tab]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".nav-item[data-tab]").forEach(function (b) { b.classList.remove("active"); });
      document.querySelectorAll(".tab-view").forEach(function (v) { v.classList.remove("active"); });
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  function loadToday() {
    api("/stats/today").then(function (data) {
      var el = document.getElementById("todayMetrics");
      el.innerHTML = "";
      el.appendChild(metricTile(data.stats.messagesIn, "Mensajes recibidos hoy"));
      el.appendChild(metricTile(data.stats.messagesOut, "Respuestas del bot hoy"));
      el.appendChild(metricTile(data.stats.uniqueClients, "Clientes distintos hoy"));
    });
  }

  function loadWeek() {
    api("/stats/week").then(function (data) {
      var max = 1;
      data.days.forEach(function (d) { max = Math.max(max, d.messagesIn, d.messagesOut); });
      var chart = document.getElementById("weekChart");
      chart.innerHTML = "";
      data.days.forEach(function (d) {
        var col = document.createElement("div");
        col.className = "chart-col";
        var bars = document.createElement("div");
        bars.className = "chart-bars";
        var inBar = document.createElement("div");
        inBar.className = "chart-bar in";
        inBar.style.height = Math.max(2, (d.messagesIn / max) * 130) + "px";
        var outBar = document.createElement("div");
        outBar.className = "chart-bar out";
        outBar.style.height = Math.max(2, (d.messagesOut / max) * 130) + "px";
        bars.appendChild(inBar);
        bars.appendChild(outBar);
        var label = document.createElement("div");
        label.className = "day-label";
        var dt = new Date(d.date + "T00:00:00Z");
        label.textContent = dt.toLocaleDateString("es-MX", { weekday: "short", timeZone: "UTC" });
        col.appendChild(bars);
        col.appendChild(label);
        chart.appendChild(col);
      });
    });
  }

  function appointmentRow(a) {
    var dt = new Date(a.startUtc);
    var tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + esc(dt.toLocaleDateString("es-MX", { day: "2-digit", month: "short" })) + "</td>" +
      "<td>" + esc(dt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })) + "</td>" +
      "<td>" + esc(a.attendeeName) + "</td>" +
      "<td class='mono'>" + esc(a.attendeeContact) + "</td>" +
      "<td>" + esc(a.summary) + "</td>" +
      "<td>" + esc(a.staffMember || "—") + "</td>";
    return tr;
  }

  function appointmentStatusBadge(attended) {
    if (attended === 1) return "<span class='badge active'>Asistió</span>";
    if (attended === 0) return "<span class='badge paused'>No asistió</span>";
    return "<span class='badge muted'>Pendiente</span>";
  }

  function appointmentRowWithStatus(a) {
    var tr = appointmentRow(a);
    var td = document.createElement("td");
    td.innerHTML = appointmentStatusBadge(a.attended);
    tr.appendChild(td);
    return tr;
  }

  function loadAppointments() {
    api("/appointments").then(function (data) {
      document.getElementById("currentMonthTitle").textContent =
        "Este mes — " + new Date().toLocaleDateString("es-MX", { month: "long", year: "numeric" });
      var monthBody = document.querySelector("#currentMonthTable tbody");
      monthBody.innerHTML = "";
      data.currentMonth.forEach(function (a) { monthBody.appendChild(appointmentRowWithStatus(a)); });
      document.getElementById("currentMonthEmpty").style.display = data.currentMonth.length ? "none" : "block";

      var upcomingBody = document.querySelector("#upcomingTable tbody");
      upcomingBody.innerHTML = "";
      data.upcoming.forEach(function (a) { upcomingBody.appendChild(appointmentRow(a)); });
      document.getElementById("upcomingEmpty").style.display = data.upcoming.length ? "none" : "block";

      var pastBody = document.querySelector("#pastTable tbody");
      pastBody.innerHTML = "";
      data.past.slice(0, 20).forEach(function (a) { pastBody.appendChild(appointmentRow(a)); });
      document.getElementById("pastEmpty").style.display = data.past.length ? "none" : "block";
    });
  }

  function loadClients() {
    api("/clients").then(function (data) {
      var body = document.querySelector("#clientsTable tbody");
      body.innerHTML = "";
      data.clients.forEach(function (cl) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" + esc(cl.attendeeName || ("Cliente #" + cl.chatId)) + "</td>" +
          "<td>" + esc(cl.channel) + "</td>" +
          "<td class='mono'>" + esc(cl.attendeeContact || "—") + "</td>" +
          "<td>" + esc(cl.messageCount) + "</td>" +
          "<td>" + esc(formatDateTime(cl.lastSeen)) + "</td>";
        body.appendChild(tr);
      });
      document.getElementById("clientsEmpty").style.display = data.clients.length ? "none" : "block";
    });
  }

  // Nombres solo para mostrar — hoy únicamente Telegram tiene un canal real
  // conectable; el resto se añaden aquí según se vayan construyendo
  // (src/channels/), sin que esta consola necesite ningún otro cambio.
  var CHANNEL_DISPLAY_NAMES = { telegram: "Telegram", whatsapp: "WhatsApp", messenger: "Facebook Messenger", instagram: "Instagram" };

  function loadHealth() {
    api("/health").then(function (data) {
      var h = data.health;
      var panel = document.getElementById("healthPanel");
      panel.innerHTML = "";

      if (h.channels.length === 0) {
        var noneRow = document.createElement("div");
        noneRow.className = "health-row";
        noneRow.innerHTML = "<span class='health-label status-warn'><span class='status-dot'></span>Canal de mensajería</span><span class='health-value'>Ninguno conectado</span>";
        panel.appendChild(noneRow);
      }
      h.channels.forEach(function (channel) {
        var row = document.createElement("div");
        row.className = "health-row";
        var label = CHANNEL_DISPLAY_NAMES[channel] || channel;
        row.innerHTML = "<span class='health-label status-ok'><span class='status-dot'></span>" + esc(label) + "</span><span class='health-value'>Conectado</span>";
        panel.appendChild(row);
      });

      var calRow = document.createElement("div");
      calRow.className = "health-row";
      calRow.innerHTML =
        "<span class='health-label " + (h.calendarConnected ? "status-ok" : "status-warn") + "'><span class='status-dot'></span>Google Calendar</span>" +
        "<span class='health-value'>" + (h.calendarConnected ? "Conectado" : "No conectado") + "</span>";
      panel.appendChild(calRow);

      var llmRow = document.createElement("div");
      llmRow.className = "health-row";
      llmRow.innerHTML =
        "<span class='health-label status-ok'><span class='status-dot'></span>Asistente (IA)</span>" +
        "<span class='health-value'>" + (h.lastActivityAt ? "Última actividad: " + esc(formatDateTime(h.lastActivityAt)) : "Sin actividad registrada") + "</span>";
      panel.appendChild(llmRow);
    });
  }

  function loadAlertSettings() {
    api("/alert-settings").then(function (data) {
      var panel = document.getElementById("alertSettingsPanel");
      panel.innerHTML = "";

      var statusRow = document.createElement("div");
      statusRow.className = "health-row";
      statusRow.innerHTML =
        "<span class='health-label " + (data.configured ? "status-ok" : "status-warn") + "'><span class='status-dot'></span>Alertas</span>" +
        "<span class='health-value'>" + (data.configured ? "Activadas" : "No activadas") + "</span>";
      panel.appendChild(statusRow);

      var instructions = document.createElement("div");
      instructions.style.marginTop = "14px";
      instructions.innerHTML =
        "<p style='font-size:0.88rem;margin-bottom:8px;'>" +
        (data.configured
          ? "Para mandar las alertas a otro chat, envía este mismo código de nuevo desde el chat que quieras usar:"
          : "Para activarlas, abre el chat de tu bot en Telegram y manda este código (tal cual, sin nada más):") +
        "</p>" +
        "<code style='display:inline-block;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 14px;font-size:1.1rem;letter-spacing:0.05em;font-family:\\"Fira Code\\",monospace;'>" +
        esc(data.activationCode) + "</code>";
      panel.appendChild(instructions);

      if (data.configured) {
        var disableBtn = document.createElement("button");
        disableBtn.className = "btn-secondary";
        disableBtn.style.marginTop = "14px";
        disableBtn.textContent = "Desactivar alertas";
        disableBtn.addEventListener("click", function () {
          api("/alert-settings", { method: "DELETE" }).then(loadAlertSettings);
        });
        panel.appendChild(disableBtn);
      }
    });
  }

  function loadKbGaps() {
    api("/kb-gaps").then(function (data) {
      var body = document.querySelector("#kbGapsTable tbody");
      body.innerHTML = "";
      data.gaps.forEach(function (g) {
        var tr = document.createElement("tr");
        var dismissBtn = document.createElement("button");
        dismissBtn.className = "btn-secondary";
        dismissBtn.textContent = "Descartar";
        dismissBtn.addEventListener("click", function () {
          api("/kb-gaps/" + g.id, { method: "DELETE" }).then(loadKbGaps);
        });
        var actionsTd = document.createElement("td");
        actionsTd.appendChild(dismissBtn);
        tr.innerHTML = "<td>" + esc(g.question) + "</td><td>" + esc(formatDateTime(g.createdAt)) + "</td>";
        tr.appendChild(actionsTd);
        body.appendChild(tr);
      });
      document.getElementById("kbGapsEmpty").style.display = data.gaps.length ? "none" : "block";
    });
  }

  var currentKbDocId = null; // null = creando uno nuevo; string = editando ese docId

  function renderKbDoc(doc) {
    var card = document.createElement("div");
    card.style.cssText = "border-bottom:1px solid var(--border);padding:14px 0;display:flex;justify-content:space-between;gap:14px;align-items:flex-start;";
    var info = document.createElement("div");
    info.style.minWidth = "0";
    var title = document.createElement("div");
    title.style.fontWeight = "600";
    title.textContent = doc.title;
    var preview = document.createElement("div");
    preview.style.cssText = "font-size:0.85rem;color:var(--text-muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:520px;";
    preview.textContent = doc.content;
    var meta = document.createElement("div");
    meta.style.cssText = "font-size:0.78rem;color:var(--text-muted);margin-top:4px;";
    meta.textContent = doc.charCount + " caracteres · actualizado " + formatDateTime(doc.updatedAt);
    info.appendChild(title);
    info.appendChild(preview);
    info.appendChild(meta);

    var actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px;flex-shrink:0;";
    var editBtn = document.createElement("button");
    editBtn.className = "btn-secondary";
    editBtn.textContent = "Editar";
    editBtn.addEventListener("click", function () { openKbForm(doc); });
    var delBtn = document.createElement("button");
    delBtn.className = "btn-secondary";
    delBtn.textContent = "Borrar";
    delBtn.addEventListener("click", function () {
      if (!confirm('¿Borrar "' + doc.title + '"? El bot dejará de saber esto de inmediato.')) return;
      api("/kb/" + doc.docId, { method: "DELETE" }).then(loadKbDocs);
    });
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    card.appendChild(info);
    card.appendChild(actions);
    return card;
  }

  function loadKbDocs() {
    api("/kb").then(function (data) {
      var panel = document.getElementById("kbDocsPanel");
      panel.innerHTML = "";
      data.documents.forEach(function (doc) { panel.appendChild(renderKbDoc(doc)); });
      document.getElementById("kbDocsEmpty").style.display = data.documents.length ? "none" : "block";
    });
  }

  function openKbForm(doc) {
    currentKbDocId = doc ? doc.docId : null;
    document.getElementById("kbFormTitle").textContent = doc ? "Editar documento" : "Nuevo documento";
    document.getElementById("kbTitleInput").value = doc ? doc.title : "";
    document.getElementById("kbContentInput").value = doc ? doc.content : "";
    document.getElementById("kbFormMsg").textContent = "";
    document.getElementById("kbFormPanel").style.display = "block";
  }

  function closeKbForm() {
    document.getElementById("kbFormPanel").style.display = "none";
    currentKbDocId = null;
  }

  document.getElementById("kbNewBtn").addEventListener("click", function () { openKbForm(null); });
  document.getElementById("kbFormCancel").addEventListener("click", closeKbForm);

  document.getElementById("kbForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var msgEl = document.getElementById("kbFormMsg");
    var body = { title: document.getElementById("kbTitleInput").value, content: document.getElementById("kbContentInput").value };
    var request = currentKbDocId
      ? api("/kb/" + currentKbDocId, { method: "PUT", body: JSON.stringify(body) })
      : api("/kb", { method: "POST", body: JSON.stringify(body) });
    request
      .then(function () { closeKbForm(); loadKbDocs(); })
      .catch(function (err) { msgEl.className = "error"; msgEl.textContent = err.message; });
  });

  document.getElementById("kbReindexBtn").addEventListener("click", function () {
    var msgEl = document.getElementById("kbReindexMsg");
    msgEl.className = "";
    msgEl.textContent = "Reindexando...";
    api("/kb/reindex", { method: "POST" })
      .then(function (data) {
        msgEl.className = "success-msg";
        msgEl.textContent = "Listo — " + data.count + " documento(s) reindexado(s).";
      })
      .catch(function (err) { msgEl.className = "error"; msgEl.textContent = err.message; });
  });

  // Agencia (Fase 2b: catálogo con fotos) — mismo patrón exacto que
  // Conocimiento (crear/editar/borrar), sin reindexar (no hay Vectorize).
  var currentCatalogItemId = null; // null = creando uno nuevo; string = editando ese itemId

  function renderCatalogItem(item) {
    var card = document.createElement("div");
    card.style.cssText = "border-bottom:1px solid var(--border);padding:14px 0;display:flex;justify-content:space-between;gap:14px;align-items:flex-start;";
    var info = document.createElement("div");
    info.style.minWidth = "0";
    var title = document.createElement("div");
    title.style.fontWeight = "600";
    title.textContent = item.title + (item.price ? " — " + item.price : "");
    var preview = document.createElement("div");
    preview.style.cssText = "font-size:0.85rem;color:var(--text-muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:520px;";
    preview.textContent = item.description;
    var meta = document.createElement("div");
    meta.style.cssText = "font-size:0.78rem;color:var(--text-muted);margin-top:4px;";
    meta.textContent = item.photoUrl ? "Con foto · actualizado " + formatDateTime(item.updatedAt) : "Sin foto · actualizado " + formatDateTime(item.updatedAt);
    info.appendChild(title);
    info.appendChild(preview);
    info.appendChild(meta);

    var actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px;flex-shrink:0;";
    var editBtn = document.createElement("button");
    editBtn.className = "btn-secondary";
    editBtn.textContent = "Editar";
    editBtn.addEventListener("click", function () { openCatalogForm(item); });
    var delBtn = document.createElement("button");
    delBtn.className = "btn-secondary";
    delBtn.textContent = "Borrar";
    delBtn.addEventListener("click", function () {
      if (!confirm('¿Borrar "' + item.title + '"? El bot dejará de mostrarlo de inmediato.')) return;
      api("/catalog/" + item.itemId, { method: "DELETE" }).then(loadCatalogItems);
    });
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    card.appendChild(info);
    card.appendChild(actions);
    return card;
  }

  function loadCatalogItems() {
    api("/catalog").then(function (data) {
      var panel = document.getElementById("catalogPanel");
      panel.innerHTML = "";
      data.items.forEach(function (item) { panel.appendChild(renderCatalogItem(item)); });
      document.getElementById("catalogEmpty").style.display = data.items.length ? "none" : "block";
    });
  }

  function openCatalogForm(item) {
    currentCatalogItemId = item ? item.itemId : null;
    document.getElementById("catalogFormTitle").textContent = item ? "Editar item" : "Nuevo item";
    document.getElementById("catalogTitleInput").value = item ? item.title : "";
    document.getElementById("catalogDescriptionInput").value = item ? item.description : "";
    document.getElementById("catalogPriceInput").value = item ? (item.price || "") : "";
    document.getElementById("catalogPhotoUrlInput").value = item ? (item.photoUrl || "") : "";
    document.getElementById("catalogFormMsg").textContent = "";
    document.getElementById("catalogFormPanel").style.display = "block";
  }

  function closeCatalogForm() {
    document.getElementById("catalogFormPanel").style.display = "none";
    currentCatalogItemId = null;
  }

  document.getElementById("catalogNewBtn").addEventListener("click", function () { openCatalogForm(null); });
  document.getElementById("catalogFormCancel").addEventListener("click", closeCatalogForm);

  document.getElementById("catalogForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var msgEl = document.getElementById("catalogFormMsg");
    var body = {
      title: document.getElementById("catalogTitleInput").value,
      description: document.getElementById("catalogDescriptionInput").value,
      price: document.getElementById("catalogPriceInput").value,
      photoUrl: document.getElementById("catalogPhotoUrlInput").value,
    };
    var request = currentCatalogItemId
      ? api("/catalog/" + currentCatalogItemId, { method: "PUT", body: JSON.stringify(body) })
      : api("/catalog", { method: "POST", body: JSON.stringify(body) });
    request
      .then(function () { closeCatalogForm(); loadCatalogItems(); })
      .catch(function (err) { msgEl.className = "error"; msgEl.textContent = err.message; });
  });

  // Backlog de Agencia (padel, Fase 1) — un club puede tener varias
  // convocatorias abiertas a la vez, cada una con su propio cupo/lista de
  // espera; se renderiza una tarjeta por convocatoria con su roster.
  function formatLocalDateTime(s) {
    if (!s) return "—";
    var parts = s.split("T");
    return parts[0] + " " + (parts[1] || "").slice(0, 5);
  }

  var STATUS_LABELS = { inscrito: "Inscrito", lista_espera: "Lista de espera", cancelado: "Cancelado" };

  // Backlog de Agencia (padel, Fase 2: "Reception Bot" — check-in en el
  // club, 100% desde /console, sin conversación con el bot: más práctico
  // para confirmar ~20 personas rápido en el mostrador que un chat).
  function renderTournament(t) {
    var card = document.createElement("div");
    card.className = "panel";
    card.style.marginBottom = "16px";

    var header = document.createElement("div");
    header.style.cssText = "display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;";
    var info = document.createElement("div");
    var title = document.createElement("h3");
    title.textContent = t.label;
    var sub = document.createElement("div");
    sub.style.cssText = "font-size:0.85rem;color:var(--text-muted);margin-top:2px;";
    var inscritos = t.registrations.filter(function (r) { return r.status === "inscrito"; }).length;
    var listaEspera = t.registrations.filter(function (r) { return r.status === "lista_espera"; }).length;
    var presentes = t.registrations.filter(function (r) { return r.status === "inscrito" && r.attended === true; }).length;
    var TOURNAMENT_STATUS_LABELS = { abierta: "Abierta", cerrada: "Cerrada", en_curso: "En curso", finalizado: "Finalizada" };
    sub.textContent = "[" + (TOURNAMENT_STATUS_LABELS[t.status] || t.status) + "] " +
      formatLocalDateTime(t.scheduledAtLocal) + " · Inscripción hasta " + formatLocalDateTime(t.registrationDeadlineLocal) +
      " · " + inscritos + "/" + t.capacity + " inscritos" + (listaEspera ? " · " + listaEspera + " en espera" : "") +
      " · " + presentes + " presentes confirmados";
    info.appendChild(title);
    info.appendChild(sub);

    header.appendChild(info);
    var headerActions = document.createElement("div");
    headerActions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";
    // Backlog de Agencia (padel, Fase 5: "Broadcast Visual") — abre
    // directo la pantalla pública de este torneo en otra pestaña (Oscar:
    // "no que copie el link, sino que directamente lo abra").
    var screenBtn = document.createElement("button");
    screenBtn.className = "btn-secondary";
    screenBtn.textContent = "Abrir pantalla";
    screenBtn.addEventListener("click", function () {
      var tenantId = localStorage.getItem(STORAGE_TENANT) || "";
      window.open(window.location.origin + "/pantalla/" + tenantId + "/" + t.id, "_blank");
    });
    headerActions.appendChild(screenBtn);
    if (t.matches.length === 0) {
      var closeBtn = document.createElement("button");
      closeBtn.className = "btn-secondary";
      closeBtn.textContent = "Cerrar convocatoria";
      closeBtn.addEventListener("click", function () {
        if (!confirm('¿Cerrar "' + t.label + '"? Ya no se podrán inscribir más jugadores.')) return;
        api("/torneos/" + t.id + "/close", { method: "POST" }).then(loadTournaments);
      });
      headerActions.appendChild(closeBtn);
    }
    header.appendChild(headerActions);
    card.appendChild(header);

    var table = document.createElement("table");
    table.style.marginTop = "10px";
    table.innerHTML = "<thead><tr><th>Jugador</th><th>Teléfono</th><th>Estado</th><th>Pagó</th><th>Asistió</th><th>Confirmó</th><th></th></tr></thead>";
    var tbody = document.createElement("tbody");
    // En torneos de PAREJA fija, las 2 filas de una misma pareja
    // (compartiendo pair_id) se muestran como UNA sola fila visual — el
    // servidor ya cascada pagó/asistió/cancelar a ambas (setRegistrationCheckin/
    // cancelRegistration), así que basta con disparar la acción sobre la
    // primera fila de cada pareja.
    var seenPairIds = {};
    var rowsToRender = [];
    t.registrations.forEach(function (r) {
      if (r.pairId) {
        if (seenPairIds[r.pairId]) return; // ya se renderizó esta pareja
        seenPairIds[r.pairId] = true;
        var partner = t.registrations.filter(function (x) { return x.pairId === r.pairId && x.id !== r.id; })[0];
        rowsToRender.push({ r: r, displayName: partner ? r.playerName + " / " + partner.playerName : r.playerName });
      } else {
        rowsToRender.push({ r: r, displayName: r.playerName });
      }
    });
    rowsToRender.forEach(function (entry) {
      var r = entry.r;
      var tr = document.createElement("tr");
      var tdName = document.createElement("td"); tdName.textContent = entry.displayName;
      var tdPhone = document.createElement("td"); tdPhone.textContent = r.phone || "—";
      var tdStatus = document.createElement("td"); tdStatus.textContent = STATUS_LABELS[r.status] || r.status;

      var tdPaid = document.createElement("td");
      if (r.status !== "cancelado") {
        var paidBtn = document.createElement("button");
        paidBtn.className = r.paid ? "btn-primary" : "btn-secondary";
        paidBtn.textContent = r.paid ? "✓ Pagó" : "Marcar pagado";
        paidBtn.addEventListener("click", function () {
          api("/torneos/registrations/" + r.id + "/checkin", { method: "PUT", body: JSON.stringify({ paid: !r.paid }) }).then(loadTournaments);
        });
        tdPaid.appendChild(paidBtn);
      }

      var tdAttended = document.createElement("td");
      if (r.status !== "cancelado") {
        var attendedLabel = document.createElement("div");
        attendedLabel.style.cssText = "font-size:0.78rem;color:var(--text-muted);margin-bottom:4px;";
        attendedLabel.textContent = r.attended === true ? "✓ Presente" : r.attended === false ? "✗ No llegó" : "Sin confirmar";
        var presentBtn = document.createElement("button");
        presentBtn.className = "btn-secondary";
        presentBtn.textContent = "Presente";
        presentBtn.addEventListener("click", function () {
          api("/torneos/registrations/" + r.id + "/checkin", { method: "PUT", body: JSON.stringify({ attended: true }) }).then(loadTournaments);
        });
        var noShowBtn = document.createElement("button");
        noShowBtn.className = "btn-secondary";
        noShowBtn.textContent = "No llegó";
        noShowBtn.addEventListener("click", function () {
          api("/torneos/registrations/" + r.id + "/checkin", { method: "PUT", body: JSON.stringify({ attended: false }) }).then(loadTournaments);
        });
        tdAttended.appendChild(attendedLabel);
        tdAttended.appendChild(presentBtn);
        tdAttended.appendChild(noShowBtn);
      }

      // Backlog de Agencia (ronda de reestructura): "posterior a la hora
      // límite de inscripción, buscar que confirmen" — el bot ya pregunta
      // solo al cerrar inscripciones (src/padelDeadlineSweep.ts); estos
      // botones son el respaldo manual si alguien confirma por otro medio
      // (llamada, WhatsApp personal, etc.) en vez de contestarle al bot.
      var tdConfirmed = document.createElement("td");
      if (r.status !== "cancelado") {
        var confirmedLabel = document.createElement("div");
        confirmedLabel.style.cssText = "font-size:0.78rem;color:var(--text-muted);margin-bottom:4px;";
        confirmedLabel.textContent = r.confirmed === true ? "✓ Confirmó" : r.confirmed === false ? "✗ No va" : "Sin confirmar";
        var confirmYesBtn = document.createElement("button");
        confirmYesBtn.className = "btn-secondary";
        confirmYesBtn.textContent = "Confirmó";
        confirmYesBtn.addEventListener("click", function () {
          api("/torneos/registrations/" + r.id + "/checkin", { method: "PUT", body: JSON.stringify({ confirmed: true }) }).then(loadTournaments);
        });
        var confirmNoBtn = document.createElement("button");
        confirmNoBtn.className = "btn-secondary";
        confirmNoBtn.textContent = "No va";
        confirmNoBtn.addEventListener("click", function () {
          api("/torneos/registrations/" + r.id + "/checkin", { method: "PUT", body: JSON.stringify({ confirmed: false }) }).then(loadTournaments);
        });
        tdConfirmed.appendChild(confirmedLabel);
        tdConfirmed.appendChild(confirmYesBtn);
        tdConfirmed.appendChild(confirmNoBtn);
      }

      var tdActions = document.createElement("td");
      if (r.status !== "cancelado") {
        var cancelBtn = document.createElement("button");
        cancelBtn.className = "btn-secondary";
        cancelBtn.textContent = "Cancelar";
        cancelBtn.addEventListener("click", function () {
          if (!confirm('¿Cancelar la inscripción de "' + entry.displayName + '"?')) return;
          api("/torneos/registrations/" + r.id, { method: "DELETE" }).then(loadTournaments);
        });
        tdActions.appendChild(cancelBtn);
      }
      tr.appendChild(tdName); tr.appendChild(tdPhone); tr.appendChild(tdStatus); tr.appendChild(tdPaid); tr.appendChild(tdAttended); tr.appendChild(tdConfirmed); tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    card.appendChild(table);
    if (t.registrations.length === 0) {
      var empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "Todavía nadie se ha inscrito.";
      card.appendChild(empty);
    }

    // Jugador "espontáneo" — llegó al club sin haberse inscrito antes por
    // el grupo de Telegram. Siempre visible (no un botón que abre/cierra),
    // así sobrevive a que la tarjeta se vuelva a dibujar en cada recarga.
    var walkinForm = document.createElement("form");
    walkinForm.style.cssText = "margin-top:14px;padding-top:14px;border-top:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;";
    var walkinNameWrap = document.createElement("div");
    var walkinNameLabel = document.createElement("label");
    walkinNameLabel.style.cssText = "font-size:0.8rem;color:var(--text-muted);";
    walkinNameLabel.textContent = "Nombre del jugador espontáneo";
    var walkinNameInput = document.createElement("input");
    walkinNameInput.type = "text";
    walkinNameInput.required = true;
    walkinNameInput.style.width = "220px";
    walkinNameWrap.appendChild(walkinNameLabel);
    walkinNameWrap.appendChild(document.createElement("br"));
    walkinNameWrap.appendChild(walkinNameInput);
    walkinForm.appendChild(walkinNameWrap);

    // En torneos de PAREJA fija, un espontáneo también llega en pareja —
    // se pide el segundo nombre a la vez (una pareja = una inscripción).
    var walkinPartnerInput = null;
    if (t.registrationMode === "pareja") {
      var walkinPartnerWrap = document.createElement("div");
      var walkinPartnerLabel = document.createElement("label");
      walkinPartnerLabel.style.cssText = "font-size:0.8rem;color:var(--text-muted);";
      walkinPartnerLabel.textContent = "Nombre del compañero(a)";
      walkinPartnerInput = document.createElement("input");
      walkinPartnerInput.type = "text";
      walkinPartnerInput.required = true;
      walkinPartnerInput.style.width = "220px";
      walkinPartnerWrap.appendChild(walkinPartnerLabel);
      walkinPartnerWrap.appendChild(document.createElement("br"));
      walkinPartnerWrap.appendChild(walkinPartnerInput);
      walkinForm.appendChild(walkinPartnerWrap);
    }

    var walkinPhoneInput = document.createElement("input");
    walkinPhoneInput.type = "text";
    walkinPhoneInput.placeholder = "Teléfono (opcional)";
    walkinPhoneInput.style.width = "160px";
    var walkinSubmit = document.createElement("button");
    walkinSubmit.className = "btn-secondary";
    walkinSubmit.type = "submit";
    walkinSubmit.textContent = t.registrationMode === "pareja" ? "+ Agregar pareja espontánea" : "+ Agregar jugador espontáneo";
    var walkinMsg = document.createElement("span");
    walkinMsg.className = "error";
    walkinForm.appendChild(walkinPhoneInput);
    walkinForm.appendChild(walkinSubmit);
    walkinForm.appendChild(walkinMsg);
    walkinForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var body = { playerName: walkinNameInput.value, phone: walkinPhoneInput.value };
      if (walkinPartnerInput) body.player2Name = walkinPartnerInput.value;
      api("/torneos/" + t.id + "/registrations", { method: "POST", body: JSON.stringify(body) })
        .then(loadTournaments)
        .catch(function (err) { walkinMsg.textContent = err.message; });
    });
    card.appendChild(walkinForm);

    appendScoreEngine(card, t);

    return card;
  }

  // Backlog de Agencia (padel, Fase 3-4: "Score Engine") — fixture de 5
  // rondas, marcadores por cancha, tabla de posiciones y playoffs. 100%
  // desde /console (staff del club captura marcadores), sin tool de LLM
  // nueva, mismo criterio ya usado en Fase 2.
  function playerNameLookup(t) {
    var byId = {};
    t.registrations.forEach(function (r) { byId[r.id] = r.playerName; });
    return function (id) { return byId[id] || ("#" + id); };
  }

  // Backlog de Agencia (padel): una "fila de equipo" es nombre + marcador
  // editable en la MISMA línea — así cada partido se lee como una llave de
  // verdad (dos filas apiladas), no como texto con dos inputs sueltos al
  // lado. isWinner se decide con el marcador YA guardado (no el valor que
  // se está escribiendo) — se resalta solo después de "Guardar".
  function padelTeamRow(names, scoreValue, isWinner) {
    var row = document.createElement("div");
    row.className = "padelTeam" + (isWinner ? " winner" : "");
    var namesEl = document.createElement("div");
    namesEl.className = "padelNames";
    namesEl.textContent = names;
    var scoreInput = document.createElement("input");
    scoreInput.type = "number";
    scoreInput.className = "padelScoreInput";
    scoreInput.value = scoreValue === null ? "" : scoreValue;
    row.appendChild(namesEl);
    row.appendChild(scoreInput);
    return { row: row, input: scoreInput };
  }

  function renderMatchRow(match, name, courtLabel, isFinal) {
    var card = document.createElement("div");
    card.className = "padelMatch" + (isFinal ? " final" : "");
    if (courtLabel) {
      var court = document.createElement("div");
      court.className = "padelCourt";
      court.textContent = courtLabel;
      card.appendChild(court);
    }

    var hasDecision = match.scoreA !== null && match.scoreB !== null && match.scoreA !== match.scoreB;
    var teamA = padelTeamRow(name(match.teamAPlayer1Id) + " / " + name(match.teamAPlayer2Id), match.scoreA, hasDecision && match.scoreA > match.scoreB);
    var teamB = padelTeamRow(name(match.teamBPlayer1Id) + " / " + name(match.teamBPlayer2Id), match.scoreB, hasDecision && match.scoreB > match.scoreA);
    card.appendChild(teamA.row);
    card.appendChild(teamB.row);

    var saveBtn = document.createElement("button");
    saveBtn.className = "btn-secondary padelSaveBtn";
    saveBtn.type = "button";
    saveBtn.textContent = "Guardar marcador";
    var msg = document.createElement("div");
    msg.className = "error";
    saveBtn.addEventListener("click", function () {
      var body = { scoreA: Number(teamA.input.value), scoreB: Number(teamB.input.value) };
      api("/torneos/matches/" + match.id + "/score", { method: "PUT", body: JSON.stringify(body) })
        .then(loadTournaments)
        .catch(function (err) { msg.textContent = err.message; });
    });
    card.appendChild(saveBtn);
    card.appendChild(msg);
    return card;
  }

  // Backlog de Agencia (padel): "racha" real — cuenta victorias
  // consecutivas de ESE jugador en sus rondas jugadas, empezando por la
  // más reciente hacia atrás, hasta la primera derrota. Se calcula del
  // lado del cliente a partir de los marcadores reales (t.matches), nunca
  // inventado — si no hay racha (0 o 1 victoria seguida), no se muestra
  // ninguna llama.
  function computeStreak(matches, registrationId) {
    var jugados = matches
      .filter(function (m) { return m.phase === "ronda" && m.scoreA !== null && m.scoreB !== null; })
      .filter(function (m) {
        return m.teamAPlayer1Id === registrationId || m.teamAPlayer2Id === registrationId ||
          m.teamBPlayer1Id === registrationId || m.teamBPlayer2Id === registrationId;
      })
      .sort(function (a, b) { return a.roundNumber - b.roundNumber; });
    var streak = 0;
    for (var i = jugados.length - 1; i >= 0; i--) {
      var m = jugados[i];
      var enEquipoA = m.teamAPlayer1Id === registrationId || m.teamAPlayer2Id === registrationId;
      var gano = enEquipoA ? m.scoreA > m.scoreB : m.scoreB > m.scoreA;
      if (gano) streak++; else break;
    }
    return streak;
  }

  // Tabla de posiciones "gamer": corona para el líder, paleta para el
  // resto, llamas según racha real de victorias, y una barra de fondo
  // proporcional a los puntos (relativa al líder) — todo derivado de datos
  // reales, nunca decorado con algo inventado.
  function renderStandingsGamer(t) {
    var wrap = document.createElement("div");
    wrap.className = "standingsGamer";
    var maxPoints = t.standings.length ? t.standings[0].points : 0;
    t.standings.forEach(function (s, i) {
      var isTop3 = i < 3 && s.points > 0;
      var isTop8 = i < 8 && s.points > 0;
      var row = document.createElement("div");
      row.className = "standingsRow" + (isTop8 ? " top8" : "") + (isTop3 ? " top3" : "") + (i === 0 && s.points > 0 ? " leader" : "");

      var bar = document.createElement("div");
      bar.className = "standingsBar";
      bar.style.width = (maxPoints > 0 ? Math.max(3, Math.round((s.points / maxPoints) * 100)) : 0) + "%";
      row.appendChild(bar);

      var pos = document.createElement("div");
      pos.className = "standingsPos";
      pos.textContent = String(i + 1);
      row.appendChild(pos);

      var icon = document.createElement("div");
      icon.className = "standingsIcon";
      icon.textContent = !s.points ? "🎾" : i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🎾";
      row.appendChild(icon);

      var name = document.createElement("div");
      name.className = "standingsName";
      name.textContent = s.playerName;
      row.appendChild(name);

      var streak = computeStreak(t.matches, s.registrationId);
      if (streak >= 2) {
        var flames = document.createElement("div");
        flames.className = "standingsStreak";
        flames.textContent = "🔥".repeat(Math.min(streak, 3));
        flames.title = streak + " victorias seguidas";
        row.appendChild(flames);
      }

      var points = document.createElement("div");
      points.className = "standingsPoints";
      points.textContent = String(s.points);
      row.appendChild(points);

      wrap.appendChild(row);
    });
    return wrap;
  }

  // Backlog de Agencia (ronda de reestructura, ronda 2): "quiero que el
  // ranking [de victorias] esté dentro de Tabla de posiciones. Se tiene
  // que ver iguales" — misma lista .standingsGamer/.standingsRow que la
  // tabla de puntos, pero ordenada por partidos GANADOS acumulados de
  // TODO el club (src/padelVictories.ts), no por puntos de este torneo.
  function renderVictoriesGamer(leaderboard) {
    var wrap = document.createElement("div");
    wrap.className = "standingsGamer";
    var maxWins = leaderboard.length ? leaderboard[0].wins : 0;
    leaderboard.forEach(function (row, i) {
      var isTop3 = i < 3 && row.wins > 0;
      var tr = document.createElement("div");
      tr.className = "standingsRow" + (isTop3 ? " top3" : "") + (i === 0 && row.wins > 0 ? " leader" : "");

      var bar = document.createElement("div");
      bar.className = "standingsBar";
      bar.style.width = (maxWins > 0 ? Math.max(3, Math.round((row.wins / maxWins) * 100)) : 0) + "%";
      tr.appendChild(bar);

      var pos = document.createElement("div");
      pos.className = "standingsPos";
      pos.textContent = String(i + 1);
      tr.appendChild(pos);

      var icon = document.createElement("div");
      icon.className = "standingsIcon";
      icon.textContent = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🎾";
      tr.appendChild(icon);

      var name = document.createElement("div");
      name.className = "standingsName";
      name.textContent = row.playerName;
      tr.appendChild(name);

      var wins = document.createElement("div");
      wins.className = "standingsPoints";
      wins.textContent = String(row.wins);
      tr.appendChild(wins);

      wrap.appendChild(tr);
    });
    return wrap;
  }

  // Backlog de Agencia (padel): qué pestaña (ronda/fase) está viendo cada
  // convocatoria — persiste entre recargas de loadTournaments() porque
  // vive fuera de la función de render (no se resetea con cada redibujado).
  var activePadelTab = {};

  // Oscar fue explícito: NADA de árbol de eliminación — en una Reta
  // Americana todos juegan todas las rondas, nadie "avanza" ni queda
  // fuera. Cada ronda (y semifinal/final) es una PESTAÑA con su propio
  // grid de tarjetas, nunca líneas conectando partidos.
  function appendScoreEngine(card, t) {
    var name = playerNameLookup(t);

    if (t.matches.length === 0) {
      if (t.status === "abierta" || t.status === "cerrada") {
        var fixtureBtn = document.createElement("button");
        fixtureBtn.className = "btn-primary";
        fixtureBtn.style.marginTop = "14px";
        fixtureBtn.textContent = "Generar fixture";
        fixtureBtn.addEventListener("click", function () {
          api("/torneos/" + t.id + "/fixture", { method: "POST" }).then(loadTournaments).catch(function (err) { alert(err.message); });
        });
        card.appendChild(fixtureBtn);
      }
      appendDangerZone(card, t);
      return;
    }

    var wrap = document.createElement("div");
    wrap.style.cssText = "margin-top:16px;padding-top:16px;border-top:2px solid var(--border);";
    var wrapTitle = document.createElement("h3");
    wrapTitle.textContent = "Partidos";
    wrap.appendChild(wrapTitle);

    var rondaMatches = t.matches.filter(function (m) { return m.phase === "ronda"; });
    // Rondas reales presentes (no un rango fijo 1-5 — el # de rondas es
    // configurable por el club, ver panel de "Reglas").
    var roundNumbers = [];
    rondaMatches.forEach(function (m) { if (roundNumbers.indexOf(m.roundNumber) === -1) roundNumbers.push(m.roundNumber); });
    roundNumbers.sort(function (a, b) { return a - b; });

    var semis = t.matches.filter(function (m) { return m.phase === "semifinal"; });
    var final = t.matches.filter(function (m) { return m.phase === "final"; })[0] || null;

    var tabs = roundNumbers.map(function (round) {
      return { key: "ronda-" + round, label: "Ronda " + round, matches: rondaMatches.filter(function (m) { return m.roundNumber === round; }) };
    });
    if (semis.length > 0) tabs.push({ key: "semifinal", label: "Semifinal", matches: semis });
    if (final) tabs.push({ key: "final", label: "Final", matches: [final] });

    var stillValid = tabs.some(function (tb) { return tb.key === activePadelTab[t.id]; });
    if (!activePadelTab[t.id] || !stillValid) activePadelTab[t.id] = tabs[0].key;

    var tabStrip = document.createElement("div");
    tabStrip.className = "padelTabs";
    tabs.forEach(function (tab) {
      var tabBtn = document.createElement("button");
      tabBtn.type = "button";
      tabBtn.className = "padelTab" + (activePadelTab[t.id] === tab.key ? " active" : "");
      tabBtn.textContent = tab.label;
      tabBtn.addEventListener("click", function () {
        activePadelTab[t.id] = tab.key;
        loadTournaments();
      });
      tabStrip.appendChild(tabBtn);
    });
    wrap.appendChild(tabStrip);

    var activeTab = tabs.filter(function (tb) { return tb.key === activePadelTab[t.id]; })[0];
    var grid = document.createElement("div");
    grid.className = "padelMatchGrid";
    activeTab.matches.forEach(function (m, i) {
      var label = activeTab.key === "semifinal" ? "Semifinal " + (i + 1) : activeTab.key === "final" ? "Gran Final" : "Cancha " + m.courtNumber;
      grid.appendChild(renderMatchRow(m, name, label, activeTab.key === "final"));
    });
    wrap.appendChild(grid);

    var standingsTitle = document.createElement("h3");
    standingsTitle.style.marginTop = "16px";
    standingsTitle.textContent = "Tabla de posiciones";
    wrap.appendChild(standingsTitle);
    wrap.appendChild(renderStandingsGamer(t));

    // Backlog de Agencia (ronda de reestructura, ronda 2): el ranking de
    // victorias (histórico de TODO el club) vive dentro de esta misma
    // sección, con el mismo look que la tabla de puntos de arriba.
    var victoriesHeader = document.createElement("div");
    victoriesHeader.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-top:16px;gap:10px;flex-wrap:wrap;";
    var victoriesTitle = document.createElement("h3");
    victoriesTitle.style.margin = "0";
    victoriesTitle.textContent = "Ranking de victorias (histórico del club)";
    var victoriesOpenBtn = document.createElement("button");
    victoriesOpenBtn.className = "btn-secondary";
    victoriesOpenBtn.textContent = "Abrir pantalla completa";
    victoriesOpenBtn.addEventListener("click", function () {
      var tenantId = localStorage.getItem(STORAGE_TENANT) || "";
      window.open(window.location.origin + "/pantalla/" + tenantId + "/victorias", "_blank");
    });
    victoriesHeader.appendChild(victoriesTitle);
    victoriesHeader.appendChild(victoriesOpenBtn);
    wrap.appendChild(victoriesHeader);
    if (latestVictoriesLeaderboard.length === 0) {
      var victoriesEmpty = document.createElement("p");
      victoriesEmpty.className = "page-sub";
      victoriesEmpty.textContent = "Todavía no hay partidos jugados con marcador para armar este ranking.";
      wrap.appendChild(victoriesEmpty);
    } else {
      wrap.appendChild(renderVictoriesGamer(latestVictoriesLeaderboard));
    }

    var pendingRondaScores = rondaMatches.some(function (m) { return m.scoreA === null || m.scoreB === null; });
    if (semis.length === 0) {
      var playoffsBtn = document.createElement("button");
      playoffsBtn.className = "btn-primary";
      playoffsBtn.style.marginTop = "14px";
      playoffsBtn.textContent = "Generar playoffs (top 8)";
      playoffsBtn.disabled = pendingRondaScores;
      playoffsBtn.title = pendingRondaScores ? "Faltan marcadores de ronda por capturar" : "";
      playoffsBtn.addEventListener("click", function () {
        api("/torneos/" + t.id + "/playoffs", { method: "POST" }).then(loadTournaments).catch(function (err) { alert(err.message); });
      });
      wrap.appendChild(playoffsBtn);
    } else {
      var pendingSemis = semis.some(function (m) { return m.scoreA === null || m.scoreB === null || m.scoreA === m.scoreB; });
      if (!final) {
        var finalBtn = document.createElement("button");
        finalBtn.className = "btn-primary";
        finalBtn.style.marginTop = "14px";
        finalBtn.textContent = "Generar la final";
        finalBtn.disabled = pendingSemis;
        finalBtn.title = pendingSemis ? "Faltan marcadores de semifinal (o hay un empate)" : "";
        finalBtn.addEventListener("click", function () {
          api("/torneos/" + t.id + "/final", { method: "POST" }).then(loadTournaments).catch(function (err) { alert(err.message); });
        });
        wrap.appendChild(finalBtn);
      } else if (t.status === "finalizado" && final.scoreA !== null && final.scoreB !== null) {
        var championNames = final.scoreA > final.scoreB
          ? [name(final.teamAPlayer1Id), name(final.teamAPlayer2Id)]
          : [name(final.teamBPlayer1Id), name(final.teamBPlayer2Id)];
        var championBanner = document.createElement("div");
        championBanner.style.cssText = "margin-top:14px;padding:14px;border-radius:8px;background:var(--accent);color:#fff;font-weight:600;text-align:center;";
        championBanner.textContent = "🏆 Campeones: " + championNames.join(" / ");
        wrap.appendChild(championBanner);
      }
    }

    card.appendChild(wrap);
    appendDangerZone(card, t);
  }

  // Backlog de Agencia (padel): "Limpiar / Iniciar nuevo torneo" — Oscar
  // confirmó (pregunta directa) que borra de verdad inscripciones y
  // marcadores de ESA convocatoria para reusarla la próxima semana, así
  // que exige escribir el nombre EXACTO para habilitar el botón, mismo
  // criterio que "Zona de peligro" al borrar un tenant completo.
  // Backlog de Agencia (ronda de reestructura): Oscar reportó que la
  // confirmación anterior no lo dejaba borrar y pidió simplificarla —
  // "escribir el nombre exacto es más que suficiente". Se quitaron: el
  // popup extra de confirm() del navegador, y los campos de fecha
  // obligatorios (con 'required', el navegador bloqueaba el submit en
  // silencio si se dejaban vacíos). Las fechas ahora son opcionales — si
  // se dejan vacías, la convocatoria se reabre con las mismas fechas que
  // ya tenía (ver resetTournament en src/padel.ts).
  function appendDangerZone(card, t) {
    var zone = document.createElement("div");
    zone.className = "padelDangerZone";
    var heading = document.createElement("h4");
    heading.textContent = "Zona de peligro";
    zone.appendChild(heading);
    var desc = document.createElement("p");
    desc.className = "page-sub";
    desc.style.marginBottom = "10px";
    desc.textContent = "Borra las inscripciones y marcadores de esta convocatoria para reusarla la próxima semana con otros participantes. No se puede deshacer.";
    zone.appendChild(desc);

    var toggleBtn = document.createElement("button");
    toggleBtn.className = "btn-danger";
    toggleBtn.type = "button";
    toggleBtn.textContent = "Limpiar / Iniciar nuevo torneo";

    var form = document.createElement("form");
    form.style.cssText = "display:none;margin-top:12px;";

    var confirmLabelEl = document.createElement("label");
    confirmLabelEl.style.cssText = "font-size:0.8rem;color:var(--text-muted);";
    confirmLabelEl.textContent = "Escribe \\"" + t.label + "\\" para confirmar";
    var confirmInput = document.createElement("input");
    confirmInput.type = "text";
    confirmInput.style.width = "100%";

    var dateRow = document.createElement("div");
    dateRow.style.cssText = "display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;";
    var scheduledWrap = document.createElement("div");
    scheduledWrap.style.cssText = "flex:1;min-width:180px;";
    var scheduledLabel = document.createElement("label");
    scheduledLabel.style.cssText = "font-size:0.8rem;color:var(--text-muted);";
    scheduledLabel.textContent = "Nueva fecha y hora (opcional)";
    var scheduledInput = document.createElement("input");
    scheduledInput.type = "datetime-local";
    scheduledInput.style.width = "100%";
    scheduledWrap.appendChild(scheduledLabel);
    scheduledWrap.appendChild(scheduledInput);

    var deadlineWrap = document.createElement("div");
    deadlineWrap.style.cssText = "flex:1;min-width:180px;";
    var deadlineLabel = document.createElement("label");
    deadlineLabel.style.cssText = "font-size:0.8rem;color:var(--text-muted);";
    deadlineLabel.textContent = "Nueva hora límite (opcional)";
    var deadlineInput = document.createElement("input");
    deadlineInput.type = "datetime-local";
    deadlineInput.style.width = "100%";
    deadlineWrap.appendChild(deadlineLabel);
    deadlineWrap.appendChild(deadlineInput);

    dateRow.appendChild(scheduledWrap);
    dateRow.appendChild(deadlineWrap);

    var confirmBtn = document.createElement("button");
    confirmBtn.className = "btn-danger";
    confirmBtn.type = "submit";
    confirmBtn.textContent = "Borrar y reiniciar";
    confirmBtn.style.marginTop = "10px";
    confirmBtn.disabled = true;

    var msg = document.createElement("div");
    msg.className = "error";

    confirmInput.addEventListener("input", function () {
      confirmBtn.disabled = confirmInput.value !== t.label;
    });

    toggleBtn.addEventListener("click", function () {
      form.style.display = form.style.display === "none" ? "block" : "none";
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var body = { confirmLabel: confirmInput.value, scheduledAt: scheduledInput.value || null, registrationDeadline: deadlineInput.value || null };
      api("/torneos/" + t.id + "/reset", { method: "POST", body: JSON.stringify(body) })
        .then(function () { delete activePadelTab[t.id]; loadTournaments(); })
        .catch(function (err) { msg.textContent = err.message; });
    });

    form.appendChild(confirmLabelEl);
    form.appendChild(confirmInput);
    form.appendChild(dateRow);
    form.appendChild(confirmBtn);
    form.appendChild(msg);

    zone.appendChild(toggleBtn);
    zone.appendChild(form);
    card.appendChild(zone);
  }

  // Backlog de Agencia: Oscar pidió que las convocatorias se vean por
  // pestañas, "no que venga uno abajo de otra" — un club puede tener
  // varias a la vez (categorías/fechas distintas) y antes se apilaban
  // todas en una sola lista larga.
  var activeTournamentId = null;

  // Backlog de Agencia (ronda de reestructura, ronda 2): Oscar pidió que
  // el ranking de victorias (acumulado de TODO el club, no de un solo
  // torneo) viva DENTRO de "Tabla de posiciones" y se vea igual — se
  // cachea aquí porque es la misma info para cualquier convocatoria activa
  // que se esté viendo, no hace falta pedirla de nuevo por cada tab.
  var latestVictoriesLeaderboard = [];

  function loadVictoriesLeaderboard() {
    var tenantId = localStorage.getItem(STORAGE_TENANT) || "";
    // Endpoint público (mismo que usa la pantalla de TV) — no necesita el
    // token de sesión de /console.
    return fetch("/api/pantalla/" + tenantId + "/victorias")
      .then(function (res) { return res.ok ? res.json() : { leaderboard: [] }; })
      .then(function (data) { latestVictoriesLeaderboard = data.leaderboard || []; })
      .catch(function () { latestVictoriesLeaderboard = []; });
  }

  // Backlog de Agencia (ronda de reestructura): la sección "En vivo" solo
  // muestra convocatorias que "siguen vivas" — 'finalizado' desaparece
  // sola de la lista de pestañas (los datos siguen en D1, solo ya no
  // ocupan espacio de trabajo activo).
  function loadTournaments() {
    Promise.all([api("/torneos"), loadVictoriesLeaderboard()]).then(function (results) {
      var data = results[0];
      var tabStrip = document.getElementById("tournamentsTabStrip");
      var panel = document.getElementById("tournamentsPanel");
      tabStrip.innerHTML = "";
      panel.innerHTML = "";
      var live = data.tournaments.filter(function (t) { return t.status !== "finalizado"; });
      document.getElementById("tournamentsEmpty").style.display = live.length ? "none" : "block";
      if (live.length === 0) return;

      var stillValid = live.some(function (t) { return t.id === activeTournamentId; });
      if (!activeTournamentId || !stillValid) activeTournamentId = live[live.length - 1].id;

      live.forEach(function (t) {
        var tab = document.createElement("button");
        tab.type = "button";
        tab.className = "padelTab" + (t.id === activeTournamentId ? " active" : "");
        tab.textContent = t.label + (t.category ? " (" + t.category + ")" : "");
        tab.addEventListener("click", function () {
          activeTournamentId = t.id;
          loadTournaments();
        });
        tabStrip.appendChild(tab);
      });

      var active = live.filter(function (t) { return t.id === activeTournamentId; })[0];
      panel.appendChild(renderTournament(active));
    });
  }

  // Backlog de Agencia (ronda de reestructura): "2 secciones
  // seleccionables" al entrar a Torneos — Configuración (categorías,
  // reglas por defecto, alta de convocatorias) vs. En vivo (pestañas de
  // las retas/torneos activos).
  document.getElementById("padelSectionConfigBtn").addEventListener("click", function () {
    document.getElementById("padelSectionConfigBtn").classList.add("active");
    document.getElementById("padelSectionLiveBtn").classList.remove("active");
    document.getElementById("padelSectionConfig").style.display = "block";
    document.getElementById("padelSectionLive").style.display = "none";
  });
  document.getElementById("padelSectionLiveBtn").addEventListener("click", function () {
    document.getElementById("padelSectionLiveBtn").classList.add("active");
    document.getElementById("padelSectionConfigBtn").classList.remove("active");
    document.getElementById("padelSectionLive").style.display = "block";
    document.getElementById("padelSectionConfig").style.display = "none";
    loadTournaments();
  });

  document.getElementById("tournamentNewBtn").addEventListener("click", function () {
    document.getElementById("tournamentFormPanel").style.display = "block";
  });
  document.getElementById("tournamentFormCancel").addEventListener("click", function () {
    document.getElementById("tournamentFormPanel").style.display = "none";
  });

  // Backlog de Agencia (ronda de canchas + parejas): la modalidad
  // (individual/pareja) se elige CADA VEZ que se abre una convocatoria
  // nueva (Oscar, pregunta directa) — precargada con la modalidad por
  // defecto del panel de Reglas, pero siempre editable aquí.
  document.getElementById("tournamentModeInput").addEventListener("change", function () {
    var isPareja = document.getElementById("tournamentModeInput").value === "pareja";
    document.getElementById("tournamentCapacityUnitLabel").textContent = isPareja ? "parejas" : "jugadores";
  });

  document.getElementById("tournamentForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var msgEl = document.getElementById("tournamentFormMsg");
    var body = {
      label: document.getElementById("tournamentLabelInput").value,
      category: document.getElementById("tournamentCategoryInput").value || null,
      registrationMode: document.getElementById("tournamentModeInput").value,
      scheduledAt: document.getElementById("tournamentScheduledInput").value,
      registrationDeadline: document.getElementById("tournamentDeadlineInput").value,
      capacity: Number(document.getElementById("tournamentCapacityInput").value) || 20,
      rounds: Number(document.getElementById("tournamentRoundsInput").value) || undefined,
      courtCount: Number(document.getElementById("tournamentCourtCountInput").value) || undefined,
    };
    api("/torneos", { method: "POST", body: JSON.stringify(body) })
      .then(function () {
        document.getElementById("tournamentForm").reset();
        document.getElementById("tournamentCapacityInput").value = "20";
        document.getElementById("tournamentCapacityUnitLabel").textContent = "jugadores";
        document.getElementById("tournamentFormPanel").style.display = "none";
        loadPadelSettings();
        loadTournaments();
      })
      .catch(function (err) { msgEl.className = "error"; msgEl.textContent = err.message; });
  });

  // Backlog de Agencia (padel, ronda de categorías) — cada categoría tiene
  // su propio grupo de Telegram y normalmente un día fijo de la semana,
  // editable (Oscar: "esto debe de ser configurable").
  var WEEKDAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  function loadCategories() {
    api("/padel-categorias").then(function (data) {
      var tbody = document.querySelector("#categoriesTable tbody");
      tbody.innerHTML = "";
      data.categories.forEach(function (cat) {
        var tr = document.createElement("tr");
        var tdName = document.createElement("td");
        tdName.textContent = cat.category;
        tdName.style.fontWeight = "600";

        var tdWeekday = document.createElement("td");
        var weekdaySelect = document.createElement("select");
        var noneOpt = document.createElement("option");
        noneOpt.value = "";
        noneOpt.textContent = "Sin definir";
        weekdaySelect.appendChild(noneOpt);
        WEEKDAY_NAMES.forEach(function (name, idx) {
          var opt = document.createElement("option");
          opt.value = String(idx);
          opt.textContent = name;
          if (cat.weekday === idx) opt.selected = true;
          weekdaySelect.appendChild(opt);
        });
        tdWeekday.appendChild(weekdaySelect);

        var tdChat = document.createElement("td");
        var chatInput = document.createElement("input");
        chatInput.type = "text";
        chatInput.placeholder = "Ej. -1001234567890";
        chatInput.value = cat.chatId || "";
        chatInput.style.width = "180px";
        tdChat.appendChild(chatInput);

        var tdSave = document.createElement("td");
        var saveBtn = document.createElement("button");
        saveBtn.className = "btn-secondary";
        saveBtn.textContent = "Guardar";
        saveBtn.addEventListener("click", function () {
          var body = {
            weekday: weekdaySelect.value === "" ? null : Number(weekdaySelect.value),
            chatId: chatInput.value.trim() || null,
          };
          api("/padel-categorias/" + cat.category, { method: "PUT", body: JSON.stringify(body) })
            .then(function () {
              saveBtn.textContent = "¡Guardado!";
              setTimeout(function () { saveBtn.textContent = "Guardar"; }, 1500);
            });
        });
        tdSave.appendChild(saveBtn);

        tr.appendChild(tdName); tr.appendChild(tdWeekday); tr.appendChild(tdChat); tr.appendChild(tdSave);
        tbody.appendChild(tr);
      });
    });
  }

  function loadPadelSettings() {
    api("/padel-settings").then(function (data) {
      document.getElementById("padelRoundsInput").value = data.rounds;
      document.getElementById("padelCourtCountInput").value = data.courtCount;
      document.getElementById("padelDefaultModeInput").value = data.defaultRegistrationMode;
      document.getElementById("tournamentModeInput").value = data.defaultRegistrationMode;
      document.getElementById("tournamentModeInput").dispatchEvent(new Event("change"));
      // Backlog de Agencia (ronda de reestructura): rondas/canchas ahora
      // se preguntan por convocatoria — esto solo precarga el formulario
      // con los defaults del tenant, siempre editable antes de abrir.
      document.getElementById("tournamentRoundsInput").value = data.rounds;
      document.getElementById("tournamentCourtCountInput").value = data.courtCount;
    });
  }

  document.getElementById("padelSettingsForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var msgEl = document.getElementById("padelSettingsMsg");
    var body = {
      rounds: Number(document.getElementById("padelRoundsInput").value),
      courtCount: Number(document.getElementById("padelCourtCountInput").value),
      defaultRegistrationMode: document.getElementById("padelDefaultModeInput").value,
    };
    api("/padel-settings", { method: "PUT", body: JSON.stringify(body) })
      .then(function () { msgEl.className = ""; msgEl.textContent = ""; })
      .catch(function (err) { msgEl.className = "error"; msgEl.textContent = err.message; });
  });

  // Backlog de Agencia (ronda de reestructura, ronda 2): Oscar pidió que
  // estos links dejen de ser "copiar" y abran directo en otra pestaña.
  document.getElementById("posterScreenBtn").addEventListener("click", function () {
    var tenantId = localStorage.getItem(STORAGE_TENANT) || "";
    window.open(window.location.origin + "/pantalla/" + tenantId, "_blank");
  });

  function loadReviewLink() {
    api("/review-link").then(function (data) {
      document.getElementById("reviewLinkInput").value = data.reviewLink || "";
    });
  }

  document.getElementById("reviewLinkForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var msgEl = document.getElementById("reviewLinkMsg");
    var value = document.getElementById("reviewLinkInput").value;
    api("/review-link", { method: "PUT", body: JSON.stringify({ reviewLink: value }) })
      .then(function () { msgEl.className = "success-msg"; msgEl.textContent = "Guardado."; })
      .catch(function (err) { msgEl.className = "error"; msgEl.textContent = err.message; });
  });

  function loadLeadReengagement() {
    api("/lead-reengagement").then(function (data) {
      document.getElementById("leadReengagementToggle").checked = !!data.enabled;
    });
  }

  document.getElementById("leadReengagementToggle").addEventListener("change", function (e) {
    var msgEl = document.getElementById("leadReengagementMsg");
    api("/lead-reengagement", { method: "PUT", body: JSON.stringify({ enabled: e.target.checked }) })
      .then(function () { msgEl.className = "success-msg"; msgEl.textContent = "Guardado."; })
      .catch(function (err) {
        msgEl.className = "error";
        msgEl.textContent = err.message;
        e.target.checked = !e.target.checked;
      });
  });

  function loadAutoResume() {
    api("/auto-resume-handoff").then(function (data) {
      document.getElementById("autoResumeToggle").checked = !!data.enabled;
    });
  }

  document.getElementById("autoResumeToggle").addEventListener("change", function (e) {
    var msgEl = document.getElementById("autoResumeMsg");
    api("/auto-resume-handoff", { method: "PUT", body: JSON.stringify({ enabled: e.target.checked }) })
      .then(function () { msgEl.className = "success-msg"; msgEl.textContent = "Guardado."; })
      .catch(function (err) {
        msgEl.className = "error";
        msgEl.textContent = err.message;
        e.target.checked = !e.target.checked;
      });
  });

  function loadHandoffKeywords() {
    api("/handoff-keywords").then(function (data) {
      document.getElementById("handoffKeywordsInput").value = (data.keywords || []).join(", ");
    });
  }

  document.getElementById("handoffKeywordsForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var msgEl = document.getElementById("handoffKeywordsMsg");
    var keywords = document.getElementById("handoffKeywordsInput").value.split(",").map(function (k) { return k.trim(); }).filter(Boolean);
    api("/handoff-keywords", { method: "PUT", body: JSON.stringify({ keywords: keywords }) })
      .then(function () { msgEl.className = "success-msg"; msgEl.textContent = "Guardado."; })
      .catch(function (err) { msgEl.className = "error"; msgEl.textContent = err.message; });
  });

  // Agencia (Fase 2, agendar con persona específica): mismo patrón exacto
  // que las palabras de handoff — comma-separated, se guarda vacío si no
  // aplica.
  function loadStaffMembers() {
    api("/staff-members").then(function (data) {
      document.getElementById("staffMembersInput").value = (data.staffMembers || []).join(", ");
    });
  }

  document.getElementById("staffMembersForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var msgEl = document.getElementById("staffMembersMsg");
    var staffMembers = document.getElementById("staffMembersInput").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    api("/staff-members", { method: "PUT", body: JSON.stringify({ staffMembers: staffMembers }) })
      .then(function () { msgEl.className = "success-msg"; msgEl.textContent = "Guardado."; })
      .catch(function (err) { msgEl.className = "error"; msgEl.textContent = err.message; });
  });

  // Agencia (White-label, por tenant): reconstruye el bloque de marca del
  // sidebar cada vez (en vez de mutar el <img>/<span> existente) para que
  // llamarla de nuevo tras guardar sea seguro sin rastrear qué elemento
  // quedó en el DOM la vez anterior.
  function applyBranding(data) {
    var displayName = (data && data.brandName) || localStorage.getItem(STORAGE_TENANT) || "Radamantis";
    document.getElementById("tenantNameLabel").textContent = displayName;
    document.title = displayName + " · Mi consola";

    var brandEl = document.getElementById("sidebarBrand");
    brandEl.innerHTML = "";
    if (data && data.brandLogoUrl) {
      var img = document.createElement("img");
      img.className = "brand-logo";
      img.alt = displayName;
      img.onerror = function () {
        img.remove();
        var dot = document.createElement("span");
        dot.className = "dot";
        brandEl.prepend(dot);
      };
      img.src = data.brandLogoUrl;
      brandEl.appendChild(img);
    } else {
      var dot = document.createElement("span");
      dot.className = "dot";
      brandEl.appendChild(dot);
    }
    var nameSpan = document.createElement("span");
    nameSpan.textContent = displayName;
    brandEl.appendChild(nameSpan);

    var color = (data && data.brandColor) || "#22D3EE";
    document.documentElement.style.setProperty("--primary", color);
  }

  function loadBranding() {
    return api("/branding").then(function (data) {
      applyBranding(data);
      document.getElementById("brandingName").value = data.brandName || "";
      document.getElementById("brandingLogoUrl").value = data.brandLogoUrl || "";
      document.getElementById("brandingColor").value = data.brandColor || "";
      document.getElementById("brandingColorPicker").value = data.brandColor || "#22d3ee";
    });
  }

  document.getElementById("brandingColorPicker").addEventListener("input", function (e) {
    document.getElementById("brandingColor").value = e.target.value;
  });

  function saveBranding(patch) {
    var msgEl = document.getElementById("brandingMsg");
    return api("/branding", { method: "PUT", body: JSON.stringify(patch) })
      .then(function () {
        msgEl.className = "success-msg";
        msgEl.textContent = "Guardado.";
        return loadBranding();
      })
      .catch(function (err) { msgEl.className = "error"; msgEl.textContent = err.message; });
  }

  document.getElementById("brandingForm").addEventListener("submit", function (e) {
    e.preventDefault();
    saveBranding({
      brandName: document.getElementById("brandingName").value,
      brandLogoUrl: document.getElementById("brandingLogoUrl").value,
      brandColor: document.getElementById("brandingColor").value,
    });
  });

  // Backlog de Agencia (White-label, subida real de imagen): el negocio
  // puede subir una foto tomada con el celular, así que se redimensiona
  // sola en el navegador (canvas, máx 512px de lado, JPEG) antes de
  // mandarla — evita depender de que el cliente la edite/comprima a mano
  // y mantiene el payload chico sin importar el tamaño real de la foto.
  document.getElementById("brandingLogoFile").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var msgEl = document.getElementById("brandingMsg");
    msgEl.className = "";
    msgEl.textContent = "Subiendo…";

    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var maxDim = 512;
        var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
          if (!blob) {
            msgEl.className = "error";
            msgEl.textContent = "No se pudo procesar la imagen.";
            return;
          }
          fetch("/api/client/branding/logo", {
            method: "POST",
            headers: { "Authorization": "Bearer " + token(), "Content-Type": blob.type },
            body: blob,
          }).then(function (res) {
            return res.json().then(function (data) {
              if (!res.ok) throw new Error(data.error || "Error");
              return data;
            });
          }).then(function (data) {
            document.getElementById("brandingLogoUrl").value = data.brandLogoUrl;
            msgEl.className = "success-msg";
            msgEl.textContent = "Logo subido y guardado.";
            loadBranding();
          }).catch(function (err) {
            msgEl.className = "error";
            msgEl.textContent = err.message;
          });
        }, "image/jpeg", 0.85);
      };
      img.onerror = function () {
        msgEl.className = "error";
        msgEl.textContent = "No se pudo leer esa imagen.";
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById("resetBrandingBtn").addEventListener("click", function () {
    document.getElementById("brandingName").value = "";
    document.getElementById("brandingLogoUrl").value = "";
    document.getElementById("brandingColor").value = "";
    saveBranding({ brandName: "", brandLogoUrl: "", brandColor: "" });
  });

  function renderConversationList(conversations) {
    var list = document.getElementById("conversationList");
    list.innerHTML = "";
    if (conversations.length === 0) {
      list.innerHTML = "<p class='empty'>Todavía no hay conversaciones.</p>";
      return;
    }
    conversations.forEach(function (c) {
      var item = document.createElement("div");
      item.className = "conv-list-item" + (currentConversation && currentConversation.channel === c.channel && currentConversation.chatId === c.chatId ? " selected" : "");
      item.innerHTML =
        "<div class='top'><span>" + esc(c.channel) + " · #" + esc(c.chatId) + "</span>" +
        (c.paused ? "<span class='badge paused'>Pausada</span>" : "") + "</div>" +
        "<div class='preview'>" + esc(c.lastMessage) + "</div>";
      item.addEventListener("click", function () { openConversation(c); });
      list.appendChild(item);
    });
  }

  function loadConversations() {
    return api("/conversations").then(function (data) {
      renderConversationList(data.conversations);
      return data.conversations;
    });
  }

  function openConversation(c) {
    currentConversation = c;
    loadConversations();
    var detail = document.getElementById("conversationDetail");
    detail.innerHTML = "<p class='empty'>Cargando…</p>";
    api("/conversations/" + c.channel + "/" + c.chatId + "/messages").then(function (data) {
      detail.innerHTML = "";
      var header = document.createElement("div");
      header.className = "conv-header";
      var title = document.createElement("h3");
      title.textContent = c.channel + " · #" + c.chatId;
      var btn = document.createElement("button");
      btn.className = c.paused ? "btn-primary" : "btn-danger";
      btn.textContent = c.paused ? "Reactivar bot" : "Pausar bot";
      btn.addEventListener("click", function () {
        var action = c.paused ? "resume" : "pause";
        api("/conversations/" + c.channel + "/" + c.chatId + "/" + action, { method: "POST" }).then(function () {
          c.paused = !c.paused;
          openConversation(c);
        });
      });
      header.appendChild(title);
      header.appendChild(btn);
      detail.appendChild(header);

      var msgList = document.createElement("div");
      msgList.className = "msg-list";
      data.messages.forEach(function (m) {
        var bubble = document.createElement("div");
        bubble.className = "msg " + m.role;
        bubble.textContent = m.content;
        if (m.role === "assistant") {
          var meta = document.createElement("div");
          meta.className = "meta";
          meta.textContent = m.sentBy === "human" ? "Tú" : "Bot";
          bubble.appendChild(meta);
        }
        msgList.appendChild(bubble);
      });
      detail.appendChild(msgList);

      var composer = document.createElement("form");
      composer.className = "composer";
      composer.innerHTML =
        "<textarea rows='2' placeholder='Responde como el negocio — se manda por " + esc(c.channel) + " directo…' required></textarea>" +
        "<div style='display:flex;justify-content:space-between;align-items:center;margin-top:8px;'>" +
        "<span class='page-sub' style='margin:0;font-size:0.78rem;'>Al enviar, el bot se pausa automáticamente si no lo estaba.</span>" +
        "<button class='btn-primary' type='submit'>Enviar</button></div>" +
        "<div class='error' id='composerError'></div>";
      composer.addEventListener("submit", function (e) {
        e.preventDefault();
        var textarea = composer.querySelector("textarea");
        var text = textarea.value.trim();
        if (!text) return;
        var errEl = composer.querySelector("#composerError");
        errEl.textContent = "";
        api("/conversations/" + c.channel + "/" + c.chatId + "/send", { method: "POST", body: JSON.stringify({ text: text }) })
          .then(function () {
            c.paused = true;
            openConversation(c);
          })
          .catch(function (err) { errEl.textContent = err.message; });
      });
      detail.appendChild(composer);
    });
  }

  // Backlog de Agencia: Oscar detectó que /console mostraba las mismas
  // pestañas a TODOS los tenants sin importar su giro — un dentista veía
  // "Torneos", un CRM/tienda sin agenda veía "Citas", etc. La plantilla de
  // cada giro (D6) YA declara qué tools tiene habilitadas; /console solo
  // necesitaba preguntárselo al servidor (GET /vertical) y usar eso para
  // decidir qué pestañas mostrar, en vez de mostrarlas todas siempre.
  var tenantToolsEnabled = [];
  function hasTool(name) { return tenantToolsEnabled.indexOf(name) !== -1; }

  function setTabVisible(tabName, visible) {
    var navBtn = document.querySelector('.nav-item[data-tab="' + tabName + '"]');
    if (navBtn) navBtn.style.display = visible ? "" : "none";
  }

  function loadVerticalCapabilities() {
    return api("/vertical")
      .then(function (data) { tenantToolsEnabled = data.toolsEnabled || []; })
      .catch(function () { tenantToolsEnabled = []; })
      .then(function () {
        var bookingEnabled = hasTool("checkAvailability") || hasTool("bookAppointment");
        var catalogEnabled = hasTool("searchCatalog");
        var tournamentsEnabled = hasTool("registerForTournament");
        setTabVisible("citas", bookingEnabled);
        setTabVisible("catalogo", catalogEnabled);
        setTabVisible("torneos", tournamentsEnabled);
        document.getElementById("staffPanel").style.display = bookingEnabled ? "block" : "none";
        return { bookingEnabled: bookingEnabled, catalogEnabled: catalogEnabled, tournamentsEnabled: tournamentsEnabled };
      });
  }

  function loadAll() {
    loadVerticalCapabilities().then(function (caps) {
      loadToday();
      loadWeek();
      if (caps.bookingEnabled) { loadAppointments(); loadStaffMembers(); }
      loadClients();
      loadHealth();
      loadAlertSettings();
      loadReviewLink();
      loadLeadReengagement();
      loadAutoResume();
      loadHandoffKeywords();
      loadKbGaps();
      loadKbDocs();
      if (caps.catalogEnabled) loadCatalogItems();
      if (caps.tournamentsEnabled) {
        loadCategories();
        loadPadelSettings();
        loadTournaments();
      }
      loadConversations();
      loadBranding();
    });
  }

  document.getElementById("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = document.getElementById("loginEmail").value;
    var password = document.getElementById("loginPassword").value;
    fetch("/api/client/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: password }),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || "Credenciales inválidas");
        return data;
      });
    }).then(function (data) {
      localStorage.setItem(STORAGE_KEY, data.token);
      localStorage.setItem(STORAGE_TENANT, data.tenantId);
      showApp();
    }).catch(function (err) {
      document.getElementById("loginError").textContent = err.message;
    });
  });

  document.getElementById("logoutBtn").addEventListener("click", function () {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_TENANT);
    showAuthGate();
  });

  if (token()) { showApp(); } else { showAuthGate(); }
})();
</script>
</body>
</html>
`;
