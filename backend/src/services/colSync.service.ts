import { Competition, MatchPhase, MatchStatus } from '@prisma/client';
import { prisma } from '../config/database';
import apiFootballService from './apiFootball.service';
import pointsService from './points.service';
import { logger } from '../utils/logger';

const COL_LEAGUE = 239;
const COL_SEASON = 2024; // Free API plan covers 2022–2024; switch to 2026 when on paid plan

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatus(short: string): MatchStatus {
  const map: Record<string, MatchStatus> = {
    NS: 'SCHEDULED', TBD: 'SCHEDULED',
    '1H': 'LIVE', '2H': 'LIVE', ET: 'LIVE', P: 'LIVE', BT: 'LIVE',
    HT: 'HALFTIME',
    FT: 'FINISHED', AET: 'FINISHED', PEN: 'FINISHED',
    AWD: 'FINISHED', WO: 'FINISHED',
    PST: 'SCHEDULED', SUSP: 'SCHEDULED',
    CANC: 'CANCELLED',
  };
  return map[short] ?? 'SCHEDULED';
}

function mapPhase(round: string): MatchPhase {
  const r = round.toLowerCase();
  if (r.includes('cuarto') || r.includes('quarter-final') || r.includes('quarterfinal')) return 'QUARTER_FINALS';
  if (r.includes('semi'))       return 'SEMI_FINALS';
  if (r.includes('tercer') || r.includes('third place')) return 'THIRD_PLACE';
  if (r.includes('dieciseis') || r.includes('round of 16')) return 'ROUND_OF_16';
  // "Final" but not "cuartos de final" / "semi-final" / "regular"
  if (r.includes('final') && !r.includes('cuarto') && !r.includes('semi') && !r.includes('regular')) return 'FINAL';
  return 'GROUP_STAGE';
}

function generateCode(name: string, usedCodes: Set<string>): string {
  const norm = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase();
  const skip = new Set(['DE', 'DEL', 'EL', 'LA', 'LOS', 'LAS', 'FC', 'CF', 'CD', 'SC', 'SD', 'UD', 'AC']);
  const words = norm.split(/\s+/).filter(w => w && !skip.has(w));

  let base =
    words.length === 0 ? norm.substring(0, 3) :
    words.length === 1 ? words[0].substring(0, 3) :
    words.length === 2 ? words[0][0] + words[1].substring(0, 2) :
    words.slice(0, 3).map(w => w[0]).join('');

  base = base.replace(/[^A-Z0-9]/g, 'X').substring(0, 3).padEnd(3, 'X');

  if (!usedCodes.has(base)) { usedCodes.add(base); return base; }
  for (let i = 1; i < 10; i++) {
    const c = base.substring(0, 2) + i;
    if (!usedCodes.has(c)) { usedCodes.add(c); return c; }
  }
  // Last resort: use last 3 chars of API ID as string
  return base;
}

// ── Main sync ─────────────────────────────────────────────────────────────────

export interface SyncResult {
  teamsUpserted: number;
  matchesCreated: number;
  matchesUpdated: number;
  pointsCalculated: number;
}

export async function syncColombiaFixtures(): Promise<SyncResult> {
  logger.info('🇨🇴 Syncing Liga BetPlay Colombia...');

  // 1. Fetch full season (free plan doesn't support last/next params)
  const all = await apiFootballService.getFixtures({ league: COL_LEAGUE, season: COL_SEASON });

  // Filter: past 20 finished + next 30 upcoming sorted by date
  const now = Date.now();
  const finished = all
    .filter(f => new Date(f.fixture.date).getTime() < now && mapStatus(f.fixture.status.short) === 'FINISHED')
    .sort((a, b) => new Date(b.fixture.date).getTime() - new Date(a.fixture.date).getTime())
    .slice(0, 20);
  const upcoming = all
    .filter(f => new Date(f.fixture.date).getTime() >= now)
    .sort((a, b) => new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime())
    .slice(0, 30);
  // Include live/halftime matches too
  const live = all.filter(f => ['LIVE', 'HALFTIME'].includes(mapStatus(f.fixture.status.short)));

  const seen = new Set<number>();
  const allFixtures = [...finished, ...upcoming, ...live].filter(f => {
    if (seen.has(f.fixture.id)) return false;
    seen.add(f.fixture.id);
    return true;
  });

  logger.info(`  📦 ${finished.length} past + ${upcoming.length} upcoming + ${live.length} live = ${allFixtures.length} fixtures`);

  // 2. Extract unique teams from fixtures
  const apiTeams = new Map<number, { id: number; name: string; logo: string }>();
  for (const f of allFixtures) {
    apiTeams.set(f.teams.home.id, { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo });
    apiTeams.set(f.teams.away.id, { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo });
  }

  // 3. Load all existing codes to avoid collisions
  const allExistingCodes = new Set(
    (await prisma.team.findMany({ select: { code: true } })).map(t => t.code)
  );

  // 4. Upsert teams
  const apiIdToDbId = new Map<number, string>();
  let teamsUpserted = 0;

  for (const [apiId, team] of apiTeams) {
    const existing = await prisma.team.findUnique({ where: { apiFootballId: apiId } });

    if (existing) {
      await prisma.team.update({ where: { id: existing.id }, data: { flag: team.logo } });
      apiIdToDbId.set(apiId, existing.id);
    } else {
      const code = generateCode(team.name, allExistingCodes);
      const created = await prisma.team.create({
        data: {
          apiFootballId: apiId,
          code,
          name: team.name,
          nameEn: team.name,
          flag: team.logo,
          championOdds: 0,
        },
      });
      allExistingCodes.add(code);
      apiIdToDbId.set(apiId, created.id);
      logger.info(`  ✓ Team created: ${team.name} [${code}]`);
    }
    teamsUpserted++;
  }

  // 5. Upsert matches
  let matchesCreated = 0;
  let matchesUpdated = 0;
  const newlyFinished: string[] = [];

  for (const f of allFixtures) {
    const homeDbId = apiIdToDbId.get(f.teams.home.id);
    const awayDbId = apiIdToDbId.get(f.teams.away.id);
    if (!homeDbId || !awayDbId) continue;

    const status  = mapStatus(f.fixture.status.short);
    const phase   = mapPhase(f.league.round);
    const round   = f.league.round.substring(0, 50);
    const isActive = status === 'LIVE' || status === 'HALFTIME' || status === 'FINISHED';

    const existing = await prisma.match.findUnique({ where: { apiFootballId: f.fixture.id } });

    if (existing) {
      const wasFinished = existing.pointsCalculated || existing.status === 'FINISHED';
      await prisma.match.update({
        where: { id: existing.id },
        data: {
          status,
          scoreHome: isActive ? (f.goals.home ?? null) : undefined,
          scoreAway: isActive ? (f.goals.away ?? null) : undefined,
          minute:    status === 'LIVE' ? (f.fixture.status.elapsed ?? null) : null,
          round,
          lastSyncAt: new Date(),
          // Reset pointsCalculated if newly finished (scores just came in)
          ...(status === 'FINISHED' && !wasFinished ? { pointsCalculated: false } : {}),
        },
      });
      if (status === 'FINISHED' && !wasFinished) newlyFinished.push(existing.id);
      matchesUpdated++;
    } else {
      const created = await prisma.match.create({
        data: {
          apiFootballId: f.fixture.id,
          phase,
          matchNumber: f.fixture.id,
          round,
          teamHomeId: homeDbId,
          teamAwayId: awayDbId,
          dateTime:   new Date(f.fixture.date),
          venue:      (f.fixture.venue?.name ?? '').substring(0, 100) || null,
          city:       (f.fixture.venue?.city ?? '').substring(0, 50)  || null,
          timezone:   'America/Bogota',
          competition: Competition.COL_LIGA,
          status,
          scoreHome:  isActive ? (f.goals.home ?? null) : null,
          scoreAway:  isActive ? (f.goals.away ?? null) : null,
          lastSyncAt: new Date(),
        },
      });
      if (status === 'FINISHED') newlyFinished.push(created.id);
      matchesCreated++;
      logger.info(`  ✓ Match: ${f.teams.home.name} vs ${f.teams.away.name} [${status}]`);
    }
  }

  // 6. Calculate points for matches that just became FINISHED
  let pointsCalculated = 0;
  if (newlyFinished.length > 0) {
    logger.info(`  🧮 Calculating points for ${newlyFinished.length} finished match(es)...`);
    await pointsService.calculatePointsForFinishedMatches();
    pointsCalculated = newlyFinished.length;
  }

  logger.info(`🇨🇴 Sync complete: ${teamsUpserted} teams, ${matchesCreated} created, ${matchesUpdated} updated`);
  return { teamsUpserted, matchesCreated, matchesUpdated, pointsCalculated };
}

// Live-only sync (for the cron job)
export async function syncColombiaLive(): Promise<void> {
  const liveRes = await apiFootballService.getFixtures({ league: COL_LEAGUE, season: COL_SEASON, live: 'all' } as any);
  if (liveRes.length === 0) return;

  logger.info(`🔴 Colombia live sync: ${liveRes.length} matches`);
  for (const f of liveRes) {
    const status = mapStatus(f.fixture.status.short);
    await prisma.match.updateMany({
      where: { apiFootballId: f.fixture.id },
      data: {
        status,
        scoreHome: f.goals.home ?? undefined,
        scoreAway: f.goals.away ?? undefined,
        minute: f.fixture.status.elapsed ?? null,
        lastSyncAt: new Date(),
      },
    });
  }
  await pointsService.calculatePointsForFinishedMatches();
}
