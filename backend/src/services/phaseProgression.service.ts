import axios from 'axios';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

type KnockoutPhase = 'ROUND_OF_16' | 'QUARTER_FINALS' | 'SEMI_FINALS';

const NEXT_PHASE: Record<KnockoutPhase, string> = {
  ROUND_OF_16:   'QUARTER_FINALS',
  QUARTER_FINALS: 'SEMI_FINALS',
  SEMI_FINALS:   'FINAL',
};

// ESPN date ranges for each next phase
const ESPN_DATES: Record<string, string> = {
  QUARTER_FINALS: '20260709-20260712',
  SEMI_FINALS:    '20260714-20260717',
  FINAL:          '20260718-20260722',
};

const ROUND_LABEL: Record<string, string> = {
  QUARTER_FINALS: 'Cuartos de Final',
  SEMI_FINALS:    'Semifinal',
  THIRD_PLACE:    'Tercer Puesto',
  FINAL:          'Final',
};

export interface ProgressionResult {
  phaseCompleted: string | null;
  nextPhase: string | null;
  matchesCreated: number;
  matchesUpdated: number;
  skipped: number;
  details: string[];
}

function getWinnerCode(m: {
  teamHome: { code: string }; teamAway: { code: string };
  scoreHome: number | null; scoreAway: number | null;
  scoreHomePen: number | null; scoreAwayPen: number | null;
}): string | null {
  if (m.scoreHome === null || m.scoreAway === null) return null;
  if (m.scoreHome > m.scoreAway) return m.teamHome.code;
  if (m.scoreAway > m.scoreHome) return m.teamAway.code;
  if (m.scoreHomePen !== null && m.scoreAwayPen !== null) {
    return m.scoreHomePen > m.scoreAwayPen ? m.teamHome.code : m.teamAway.code;
  }
  return null;
}

async function fetchEspnFixtures(dates: string): Promise<any[]> {
  const resp = await axios.get(
    'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard',
    { params: { limit: 20, dates }, timeout: 10000 }
  );
  return resp.data?.events ?? [];
}

// Second source: ESPN bracket / tournament overview
async function fetchEspnBracketTeams(nextPhase: string): Promise<Set<string>> {
  try {
    const resp = await axios.get(
      'https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/bracket',
      { timeout: 8000 }
    );
    const rounds: any[] = resp.data?.bracket?.rounds ?? [];
    const phaseMap: Record<string, string[]> = {
      QUARTER_FINALS: ['Quarterfinal'],
      SEMI_FINALS:    ['Semifinal'],
      FINAL:          ['Final', 'Third Place'],
    };
    const targetLabels = phaseMap[nextPhase] ?? [];
    const codes = new Set<string>();
    for (const round of rounds) {
      if (!targetLabels.some(l => round.displayName?.includes(l))) continue;
      for (const comp of round.competitions ?? []) {
        for (const c of comp.competitors ?? []) {
          if (c.team?.abbreviation) codes.add(c.team.abbreviation);
        }
      }
    }
    return codes;
  } catch {
    return new Set(); // second source optional — don't fail if unavailable
  }
}

export async function autoProgressPhase(): Promise<ProgressionResult> {
  const details: string[] = [];
  let matchesCreated = 0;
  let matchesUpdated = 0;
  let skipped = 0;

  // 1. Find a completed knockout phase that hasn't been progressed yet
  const phases: KnockoutPhase[] = ['ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS'];
  let completedPhase: KnockoutPhase | null = null;

  for (const phase of phases) {
    const all = await prisma.match.findMany({
      where: { phase, competition: 'WORLD_CUP' },
      select: { status: true },
    });
    if (all.length === 0) continue;

    const allFinished = all.every(m => m.status === 'FINISHED');
    if (!allFinished) {
      details.push(`${phase}: ${all.filter(m => m.status !== 'FINISHED').length} partido(s) sin terminar — esperando`);
      break;
    }

    const nextPhaseExists = await prisma.match.findFirst({
      where: { phase: NEXT_PHASE[phase] as any, competition: 'WORLD_CUP' },
    });
    if (nextPhaseExists) {
      details.push(`${phase}: completa y ${NEXT_PHASE[phase]} ya existe — saltando`);
      continue;
    }

    completedPhase = phase;
    break;
  }

  if (!completedPhase) {
    return { phaseCompleted: null, nextPhase: null, matchesCreated: 0, matchesUpdated: 0, skipped: 0, details };
  }

  const nextPhase = NEXT_PHASE[completedPhase];
  details.push(`✅ ${completedPhase} completa → generando ${nextPhase}`);

  // 2. Build winner set from DB (primary validation source)
  const finishedMatches = await prisma.match.findMany({
    where: { phase: completedPhase, status: 'FINISHED', competition: 'WORLD_CUP' },
    select: {
      teamHome: { select: { id: true, code: true, name: true } },
      teamAway: { select: { id: true, code: true, name: true } },
      scoreHome: true, scoreAway: true,
      scoreHomePen: true, scoreAwayPen: true,
    },
  });

  const dbWinnerCodes = new Set<string>();
  for (const m of finishedMatches) {
    const code = getWinnerCode(m);
    if (code) dbWinnerCodes.add(code);
  }
  details.push(`Ganadores en BD: ${[...dbWinnerCodes].join(', ')}`);

  // 3. Fetch next phase from ESPN (primary source)
  const espnDates = ESPN_DATES[nextPhase];
  const espnEvents = await fetchEspnFixtures(espnDates);
  details.push(`ESPN devolvió ${espnEvents.length} evento(s) para ${nextPhase}`);

  // 4. Fetch ESPN bracket as second source for cross-validation
  const bracketCodes = await fetchEspnBracketTeams(nextPhase);
  if (bracketCodes.size > 0) {
    details.push(`ESPN bracket (2ª fuente): ${[...bracketCodes].join(', ')}`);
  } else {
    details.push('ESPN bracket: no disponible — usando solo BD como 2ª fuente');
  }

  const allTeams = await prisma.team.findMany({ select: { id: true, code: true, name: true } });
  const teamByCode = new Map(allTeams.map(t => [t.code, t]));

  // For FINAL phase we expect 2 events: THIRD_PLACE + FINAL
  for (const e of espnEvents) {
    const comp = e.competitions?.[0];
    const competitors: any[] = comp?.competitors ?? [];
    const homeComp = competitors.find((c: any) => c.homeAway === 'home');
    const awayComp = competitors.find((c: any) => c.homeAway === 'away');

    const homeCode: string = homeComp?.team?.abbreviation ?? '';
    const awayCode: string = awayComp?.team?.abbreviation ?? '';

    if (!homeCode || !awayCode || homeCode === 'TBD' || awayCode === 'TBD') {
      details.push(`ESPN ${e.id}: equipos TBD — saltando`);
      skipped++;
      continue;
    }

    // Validate against DB winners (1st source)
    const homeInDb = dbWinnerCodes.has(homeCode);
    const awayInDb = dbWinnerCodes.has(awayCode);

    // Validate against ESPN bracket (2nd source) — optional
    const homeInBracket = bracketCodes.size === 0 || bracketCodes.has(homeCode);
    const awayInBracket = bracketCodes.size === 0 || bracketCodes.has(awayCode);

    if (!homeInDb || !awayInDb) {
      details.push(`ESPN ${e.id}: ${homeCode} vs ${awayCode} — no son ganadores conocidos en BD → saltando`);
      skipped++;
      continue;
    }

    if (!homeInBracket || !awayInBracket) {
      details.push(`ESPN ${e.id}: ${homeCode} vs ${awayCode} — discrepancia con ESPN bracket (2ª fuente) → igualmente creando`);
    }

    const homeTeam = teamByCode.get(homeCode);
    const awayTeam = teamByCode.get(awayCode);

    if (!homeTeam || !awayTeam) {
      details.push(`ESPN ${e.id}: equipo no encontrado en BD (${!homeTeam ? homeCode : awayCode}) → saltando`);
      skipped++;
      continue;
    }

    const espnId = parseInt(e.id, 10);
    const dateStr: string = comp?.date ?? e.date ?? '';
    const venue: string = comp?.venue?.fullName ?? '';
    const city: string = comp?.venue?.address?.city ?? '';

    // Detect THIRD_PLACE vs FINAL (both fall under the 'FINAL' ESPN date range)
    const eventName: string = (e.name ?? e.shortName ?? '').toLowerCase();
    const isThirdPlace = nextPhase === 'FINAL' && (eventName.includes('third') || eventName.includes('tercer') || eventName.includes('3rd'));
    const matchPhase = isThirdPlace ? 'THIRD_PLACE' : nextPhase;
    const roundLabel = ROUND_LABEL[matchPhase] ?? matchPhase;

    const existing = await prisma.match.findFirst({
      where: {
        OR: [
          { apiFootballId: espnId },
          { phase: matchPhase as any, teamHomeId: homeTeam.id, teamAwayId: awayTeam.id },
          { phase: matchPhase as any, teamHomeId: awayTeam.id, teamAwayId: homeTeam.id },
        ],
      },
    });

    const data = {
      teamHomeId: homeTeam.id,
      teamAwayId: awayTeam.id,
      dateTime: dateStr ? new Date(dateStr) : new Date(),
      status: 'SCHEDULED',
      phase: matchPhase,
      round: roundLabel,
      venue,
      city,
      apiFootballId: espnId,
      competition: 'WORLD_CUP',
    };

    if (existing) {
      await prisma.match.update({ where: { id: existing.id }, data: data as any });
      details.push(`Actualizado: ${homeTeam.name} vs ${awayTeam.name} (${matchPhase})`);
      matchesUpdated++;
    } else {
      const maxNum = await prisma.match.findFirst({ orderBy: { matchNumber: 'desc' }, select: { matchNumber: true } });
      await prisma.match.create({ data: { ...data, matchNumber: (maxNum?.matchNumber ?? 0) + 1 } as any });
      details.push(`Creado: ${homeTeam.name} vs ${awayTeam.name} (${matchPhase})`);
      matchesCreated++;
    }
  }

  logger.info('[phaseProgression] Resultado:', { completedPhase, nextPhase, matchesCreated, matchesUpdated, skipped });

  return { phaseCompleted: completedPhase, nextPhase, matchesCreated, matchesUpdated, skipped, details };
}
