type MatchStatus = 'SCHEDULED' | 'LOCKED' | 'LIVE' | 'HALFTIME' | 'FINISHED' | 'CANCELLED';
import { prisma } from '../config/database';
import espnService, { EspnFixture } from './espnFootball.service';
import pointsService from './points.service';
import { recalculateGroupStandings } from './standings.service';
import { logger } from '../utils/logger';

// ESPN displayName → our team.nameEn for names that differ
const ESPN_NAME_ALIAS: Record<string, string> = {
  'Türkiye': 'Turkey',
  'Czech Republic': 'Czechia',
  'Korea Republic': 'South Korea',
  'IR Iran': 'Iran',
  'USA': 'United States',
};

// Strip accents and lowercase for fuzzy matching (Mexico ↔ México, etc.)
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function mapStatus(espnStatus: string): MatchStatus {
  switch (espnStatus) {
    case 'STATUS_IN_PROGRESS': return 'LIVE';
    case 'STATUS_HALFTIME':    return 'HALFTIME';
    case 'STATUS_FINAL':
    case 'STATUS_FULL_TIME':
    case 'STATUS_EXTRA_TIME':
    case 'STATUS_PENALTY':     return 'FINISHED';
    case 'STATUS_POSTPONED':   return 'SCHEDULED';
    case 'STATUS_CANCELED':
    case 'STATUS_CANCELLED':   return 'CANCELLED';
    default:                   return 'SCHEDULED';
  }
}

function resolveTeamName(espnName: string): string {
  return ESPN_NAME_ALIAS[espnName] ?? espnName;
}

export interface WcSyncResult {
  matchesUpdated: number;
  matchesNotFound: number;
  pointsCalculated: number;
}

async function buildTeamNameMap(): Promise<Map<string, string>> {
  const teams = await prisma.team.findMany({ select: { id: true, name: true, nameEn: true, code: true } });
  const map = new Map<string, string>();
  for (const t of teams) {
    // Normalize both Spanish and English names to catch accent mismatches (México → mexico)
    if (t.nameEn) map.set(normalize(t.nameEn), t.id);
    map.set(normalize(t.name), t.id);
    map.set(t.code.toLowerCase(), t.id);
  }
  return map;
}

async function processFixtures(fixtures: EspnFixture[], teamMap: Map<string, string>): Promise<WcSyncResult> {
  let matchesUpdated = 0;
  let matchesNotFound = 0;
  const newlyFinished: string[] = [];

  // Log every fixture ESPN returned so we can diagnose missing matches
  logger.info(`📋 ESPN fixtures recibidos (${fixtures.length}):`);
  for (const f of fixtures) {
    const h = f.competitors.find(c => c.homeAway === 'home');
    const a = f.competitors.find(c => c.homeAway === 'away');
    logger.info(`  → [${f.id}] ${h?.team.displayName ?? '?'} ${h?.score ?? '-'} : ${a?.score ?? '-'} ${a?.team.displayName ?? '?'} | ${f.status.type.name} | ${f.date.slice(0, 10)}`);
  }

  for (const f of fixtures) {
    const home = f.competitors.find(c => c.homeAway === 'home');
    const away = f.competitors.find(c => c.homeAway === 'away');
    if (!home || !away) continue;

    const homeNameEn = resolveTeamName(home.team.displayName);
    const awayNameEn = resolveTeamName(away.team.displayName);

    const homeId = teamMap.get(normalize(homeNameEn));
    const awayId = teamMap.get(normalize(awayNameEn));

    if (!homeId || !awayId) {
      logger.warn(`  ⚠ Equipo no encontrado en DB: "${homeNameEn}" (${homeId ? '✓' : '✗'}) | "${awayNameEn}" (${awayId ? '✓' : '✗'})`);
      matchesNotFound++;
      continue;
    }

    // Match by ESPN ID (stored in apiFootballId after first sync) OR by date+teams
    const fixtureDate = new Date(f.date);
    const dayStart = new Date(fixtureDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(fixtureDate);
    dayEnd.setUTCHours(23, 59, 59, 999);

    const espnId = parseInt(f.id, 10);

    // Try both home/away orderings — ESPN may list teams in different order than our seed
    let match = await prisma.match.findFirst({
      where: {
        OR: [
          { apiFootballId: espnId },
          { teamHomeId: homeId, teamAwayId: awayId, dateTime: { gte: dayStart, lte: dayEnd } },
          { teamHomeId: awayId, teamAwayId: homeId, dateTime: { gte: dayStart, lte: dayEnd } },
        ],
      },
    });

    if (!match) {
      logger.warn(`  ⚠ Partido no encontrado en DB: ${homeNameEn} vs ${awayNameEn} el ${fixtureDate.toISOString().slice(0, 10)} (espnId=${espnId})`);
      matchesNotFound++;
      continue;
    }

    // Don't let sync override a match admin already finished and calculated points for
    if (match.pointsCalculated) {
      logger.info(`  ⏭ Saltando ${homeNameEn} vs ${awayNameEn} — puntos ya calculados`);
      await prisma.match.update({ where: { id: match.id }, data: { apiFootballId: espnId, lastSyncAt: new Date() } });
      matchesUpdated++;
      continue;
    }

    const status = mapStatus(f.status.type.name);
    const isActive = status === 'LIVE' || status === 'HALFTIME' || status === 'FINISHED';
    const wasFinished = match.status === 'FINISHED';

    // If admin manually set FINISHED, don't let ESPN revert to a lesser status
    const finalStatus = (match.status === 'FINISHED' && status !== 'FINISHED') ? 'FINISHED' : status;

    const scoreHome = isActive ? parseInt(home.score, 10) : null;
    const scoreAway = isActive ? parseInt(away.score, 10) : null;

    await prisma.match.update({
      where: { id: match.id },
      data: {
        apiFootballId: espnId,
        status: finalStatus,
        scoreHome: isActive ? scoreHome : undefined,
        scoreAway: isActive ? scoreAway : undefined,
        minute: finalStatus === 'LIVE' ? Math.round(f.status.clock / 60) || null : null,
        lastSyncAt: new Date(),
        ...(finalStatus === 'FINISHED' && !wasFinished ? { pointsCalculated: false } : {}),
      },
    });

    logger.info(`  ✓ ${homeNameEn} ${scoreHome ?? '-'}-${scoreAway ?? '-'} ${awayNameEn} → ${status}`);

    if (status === 'FINISHED' && !wasFinished) newlyFinished.push(match.id);
    matchesUpdated++;
  }

  // Always run points calculation and standings update after every sync.
  await pointsService.calculatePointsForFinishedMatches();
  await recalculateGroupStandings();
  const pointsCalculated = newlyFinished.length;

  return { matchesUpdated, matchesNotFound, pointsCalculated };
}

export async function syncWorldCupScores(): Promise<WcSyncResult> {
  logger.info('🌍 Sincronizando partidos del Mundial 2026 (ESPN)...');
  const teamMap = await buildTeamNameMap();
  const fixtures = await espnService.getAllWorldCupFixtures();
  logger.info(`  📦 ${fixtures.length} partidos obtenidos de ESPN`);
  const result = await processFixtures(fixtures, teamMap);
  logger.info(`🌍 Sync completo: ${result.matchesUpdated} actualizados, ${result.matchesNotFound} no encontrados`);
  return result;
}

export async function syncWorldCupLive(): Promise<void> {
  const now = new Date();

  // Find dates of matches that need syncing: LIVE/HALFTIME or LOCKED past start time
  const pendingMatches = await prisma.match.findMany({
    where: {
      OR: [
        { status: { in: ['LIVE', 'HALFTIME'] } },
        { status: 'LOCKED', dateTime: { lte: now } },
      ],
    },
    select: { dateTime: true },
  });

  // Collect unique dates to fetch from ESPN
  const datesToFetch = new Set<string>();

  // Always include today and yesterday — catches matches that finished overnight
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  datesToFetch.add(fmt(now));
  datesToFetch.add(fmt(new Date(now.getTime() - 24 * 60 * 60 * 1000)));

  // Add the actual match dates
  for (const m of pendingMatches) {
    datesToFetch.add(fmt(m.dateTime));
  }

  const allFixtures = await Promise.all(
    [...datesToFetch].map(date => espnService.getFixturesByDateRange(date, date))
  );
  const fixtures = allFixtures.flat();
  if (fixtures.length === 0) return;

  logger.info(`🔴 WC live sync: ${fixtures.length} partidos en fechas ${[...datesToFetch].join(', ')}`);
  const teamMap = await buildTeamNameMap();
  await processFixtures(fixtures, teamMap);
}
