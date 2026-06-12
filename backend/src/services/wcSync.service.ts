type MatchStatus = 'SCHEDULED' | 'LOCKED' | 'LIVE' | 'HALFTIME' | 'FINISHED' | 'CANCELLED';
import { prisma } from '../config/database';
import espnService, { EspnFixture } from './espnFootball.service';
import pointsService from './points.service';
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

  for (const f of fixtures) {
    const home = f.competitors.find(c => c.homeAway === 'home');
    const away = f.competitors.find(c => c.homeAway === 'away');
    if (!home || !away) continue;

    const homeNameEn = resolveTeamName(home.team.displayName);
    const awayNameEn = resolveTeamName(away.team.displayName);

    const homeId = teamMap.get(normalize(homeNameEn));
    const awayId = teamMap.get(normalize(awayNameEn));

    if (!homeId || !awayId) {
      logger.warn(`  ⚠ Team not in DB: ${homeNameEn} | ${awayNameEn}`);
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

    let match = await prisma.match.findFirst({
      where: { OR: [{ apiFootballId: espnId }, { teamHomeId: homeId, teamAwayId: awayId, dateTime: { gte: dayStart, lte: dayEnd } }] },
    });

    if (!match) {
      logger.warn(`  ⚠ Match not found in DB: ${homeNameEn} vs ${awayNameEn} on ${fixtureDate.toISOString().slice(0, 10)}`);
      matchesNotFound++;
      continue;
    }

    const status = mapStatus(f.status.type.name);
    const isActive = status === 'LIVE' || status === 'HALFTIME' || status === 'FINISHED';
    const wasFinished = match.pointsCalculated || match.status === 'FINISHED';

    const scoreHome = isActive ? parseInt(home.score, 10) : null;
    const scoreAway = isActive ? parseInt(away.score, 10) : null;

    await prisma.match.update({
      where: { id: match.id },
      data: {
        apiFootballId: espnId,          // store ESPN ID for fast future lookups
        status,
        scoreHome: isActive ? scoreHome : undefined,
        scoreAway: isActive ? scoreAway : undefined,
        minute: status === 'LIVE' ? Math.round(f.status.clock / 60) || null : null,
        lastSyncAt: new Date(),
        ...(status === 'FINISHED' && !wasFinished ? { pointsCalculated: false } : {}),
      },
    });

    if (status === 'FINISHED' && !wasFinished) newlyFinished.push(match.id);
    matchesUpdated++;
  }

  // Always run points calculation — not just when newlyFinished has items.
  // A match may already be FINISHED in DB (from a prior sync) but still have
  // pointsCalculated=false if a previous calculation attempt failed or was skipped.
  await pointsService.calculatePointsForFinishedMatches();
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
