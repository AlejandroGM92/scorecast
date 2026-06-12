import { prisma } from '../config/database';
import { logger } from '../utils/logger';

interface TeamStats {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export async function recalculateGroupStandings(): Promise<void> {
  logger.info('📊 Recalculando tabla de grupos...');

  const finishedMatches = await prisma.match.findMany({
    where: { status: 'FINISHED', scoreHome: { not: null }, scoreAway: { not: null } },
    select: { teamHomeId: true, teamAwayId: true, scoreHome: true, scoreAway: true },
  });

  // Aggregate stats per team
  const stats = new Map<string, TeamStats>();

  const get = (id: string): TeamStats => {
    if (!stats.has(id)) {
      stats.set(id, { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 });
    }
    return stats.get(id)!;
  };

  for (const m of finishedMatches) {
    const gh = m.scoreHome!;
    const ga = m.scoreAway!;
    const home = get(m.teamHomeId);
    const away = get(m.teamAwayId);

    home.played++;
    away.played++;
    home.goalsFor += gh;
    home.goalsAgainst += ga;
    away.goalsFor += ga;
    away.goalsAgainst += gh;

    if (gh > ga) {
      home.won++;  home.points += 3;
      away.lost++;
    } else if (gh < ga) {
      away.won++;  away.points += 3;
      home.lost++;
    } else {
      home.drawn++; home.points++;
      away.drawn++; away.points++;
    }

    home.goalDifference = home.goalsFor - home.goalsAgainst;
    away.goalDifference = away.goalsFor - away.goalsAgainst;
  }

  // Update all teams in parallel
  await Promise.all(
    [...stats.entries()].map(([teamId, s]) =>
      prisma.team.update({ where: { id: teamId }, data: s })
    )
  );

  logger.info(`📊 Standings actualizados para ${stats.size} equipo(s)`);
}
