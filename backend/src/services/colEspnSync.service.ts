import axios from 'axios';
import { MatchStatus } from '@prisma/client';
import { prisma } from '../config/database';
import pointsService from './points.service';
import { logger } from '../utils/logger';

const ESPN_COL_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/col.1/scoreboard';

// ESPN Colombian team names → our DB nameEn
const ESPN_COL_ALIAS: Record<string, string> = {
  'Independiente Santa Fe': 'Santa Fe',
  'Atlético Junior':        'Junior',
  'Atlético Nacional':      'Atletico Nacional',
  'Deportes Tolima':        'Deportes Tolima',
  'América de Cali':        'America de Cali',
  'Millonarios FC':         'Millonarios',
  'Deportivo Pasto':        'Deportivo Pasto',
  'Once Caldas':            'Once Caldas',
};

function mapStatus(espnName: string): MatchStatus {
  switch (espnName) {
    case 'STATUS_IN_PROGRESS': return 'LIVE';
    case 'STATUS_HALFTIME':    return 'HALFTIME';
    case 'STATUS_FULL_TIME':
    case 'STATUS_FINAL':       return 'FINISHED';
    case 'STATUS_POSTPONED':   return 'SCHEDULED';
    case 'STATUS_CANCELED':    return 'CANCELLED';
    default:                   return 'SCHEDULED';
  }
}

function resolveTeamName(espnName: string): string {
  return ESPN_COL_ALIAS[espnName] ?? espnName;
}

async function fetchColFixtures(dateStr?: string): Promise<any[]> {
  const params = dateStr ? `?dates=${dateStr}` : '';
  const res = await axios.get(ESPN_COL_URL + params, { timeout: 10_000 });
  return res.data.events ?? [];
}

async function buildTeamMap(): Promise<Map<string, string>> {
  const teams = await prisma.team.findMany({
    select: { id: true, name: true, nameEn: true },
  });
  const map = new Map<string, string>();
  for (const t of teams) {
    map.set(t.name.toLowerCase(), t.id);
    map.set(t.nameEn.toLowerCase(), t.id);
  }
  return map;
}

async function syncEvents(events: any[]): Promise<{ updated: number; notFound: number; pointsCalculated: number }> {
  const teamMap = await buildTeamMap();
  let updated = 0;
  let notFound = 0;
  const newlyFinished: string[] = [];

  for (const e of events) {
    const comp = e.competitions?.[0];
    const homeComp = comp?.competitors?.find((c: any) => c.homeAway === 'home');
    const awayComp = comp?.competitors?.find((c: any) => c.homeAway === 'away');
    if (!homeComp || !awayComp) continue;

    const homeNameEn = resolveTeamName(homeComp.team.displayName);
    const awayNameEn = resolveTeamName(awayComp.team.displayName);

    const homeId = teamMap.get(homeNameEn.toLowerCase());
    const awayId = teamMap.get(awayNameEn.toLowerCase());

    if (!homeId || !awayId) {
      logger.warn(`  ⚠ COL equipo no encontrado: ${homeNameEn} | ${awayNameEn}`);
      notFound++;
      continue;
    }

    // Buscar en DB por equipos (competition COL_LIGA)
    const match = await prisma.match.findFirst({
      where: { competition: 'COL_LIGA', teamHomeId: homeId, teamAwayId: awayId },
    });

    if (!match) {
      logger.warn(`  ⚠ Partido COL no en DB: ${homeNameEn} vs ${awayNameEn}`);
      notFound++;
      continue;
    }

    const status = mapStatus(e.status?.type?.name ?? '');
    const isActive = status === 'LIVE' || status === 'HALFTIME' || status === 'FINISHED';
    const wasFinished = match.pointsCalculated || match.status === 'FINISHED';

    const scoreHome = isActive ? parseInt(homeComp.score ?? '0', 10) : null;
    const scoreAway = isActive ? parseInt(awayComp.score ?? '0', 10) : null;
    const minute = status === 'LIVE'
      ? (Math.round((e.status?.clock ?? 0) / 60) || null)
      : null;

    await prisma.match.update({
      where: { id: match.id },
      data: {
        status,
        scoreHome: isActive ? scoreHome : undefined,
        scoreAway: isActive ? scoreAway : undefined,
        minute,
        lastSyncAt: new Date(),
        ...(status === 'FINISHED' && !wasFinished ? { pointsCalculated: false } : {}),
      },
    });

    if (status === 'FINISHED' && !wasFinished) newlyFinished.push(match.id);
    updated++;
    logger.info(`  ✓ COL: ${homeNameEn} ${scoreHome}-${scoreAway} ${awayNameEn} [${status}]`);
  }

  let pointsCalculated = 0;
  if (newlyFinished.length > 0) {
    logger.info(`  🧮 Calculando puntos para ${newlyFinished.length} partido(s) COL terminados...`);
    await pointsService.calculatePointsForFinishedMatches();
    pointsCalculated = newlyFinished.length;
  }

  return { updated, notFound, pointsCalculated };
}

export async function syncColombiaLiveEspn(): Promise<void> {
  const events = await fetchColFixtures();
  const live = events.filter(e =>
    ['STATUS_IN_PROGRESS', 'STATUS_HALFTIME'].includes(e.status?.type?.name ?? '')
  );
  if (live.length === 0) return;

  logger.info(`🔴 COL live sync (ESPN): ${live.length} partidos en vivo`);
  await syncEvents(live);
}

export async function syncColombiaAllEspn(dateStr?: string): Promise<{ updated: number; notFound: number; pointsCalculated: number }> {
  logger.info('🇨🇴 COL sync completo (ESPN)...');
  const events = await fetchColFixtures(dateStr);
  logger.info(`  📦 ${events.length} partidos obtenidos de ESPN`);
  const result = await syncEvents(events);
  logger.info(`🇨🇴 COL sync: ${result.updated} actualizados, ${result.notFound} no encontrados`);
  return result;
}
