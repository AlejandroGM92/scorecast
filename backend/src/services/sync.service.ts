type MatchStatus = 'SCHEDULED' | 'LOCKED' | 'LIVE' | 'HALFTIME' | 'FINISHED' | 'CANCELLED';
import { prisma } from '../config/database';
import apiFootballService from './apiFootball.service';
import pointsService from './points.service';
import { logger } from '../utils/logger';

class SyncService {
  async updateLiveScores(): Promise<void> {
    logger.info('🔴 Updating live scores...');

    const liveMatches = await apiFootballService.getLiveMatches();

    if (liveMatches.length === 0) {
      logger.info('ℹ️ No live matches');
      return;
    }

    for (const match of liveMatches) {
      const statusShort = match.fixture.status.short;
      const newStatus = this.mapStatus(statusShort);

      try {
        await prisma.match.update({
          where: { apiFootballId: match.fixture.id },
          data: {
            scoreHome: match.goals.home,
            scoreAway: match.goals.away,
            minute: match.fixture.status.elapsed,
            status: newStatus,
            lastSyncAt: new Date(),
          },
        });

        logger.info(
          `  ✓ ${match.teams.home.name} ${match.goals.home ?? '-'}-${match.goals.away ?? '-'} ${match.teams.away.name} (${match.fixture.status.elapsed}')`
        );
      } catch (error) {
        logger.warn(`Match ${match.fixture.id} not found in DB, skipping`);
      }
    }

    // Calculate points for newly finished matches
    await pointsService.calculatePointsForFinishedMatches();
  }

  async syncInitialFixtures(): Promise<void> {
    logger.info('🔄 Syncing initial fixtures from API...');

    try {
      const fixtures = await apiFootballService.getFixtures({});

      for (const fixture of fixtures) {
        logger.info(`  Syncing fixture ${fixture.fixture.id}...`);
        // This would need team data to be seeded first
        // In production, call a full sync that creates teams + matches
      }

      logger.info(`✅ Synced ${fixtures.length} fixtures`);
    } catch (error) {
      logger.error('❌ Error syncing fixtures', error);
      throw error;
    }
  }

  mapStatus(apiStatus: string): MatchStatus {
    const map: Record<string, MatchStatus> = {
      TBD: 'SCHEDULED',
      NS: 'SCHEDULED',
      '1H': 'LIVE',
      HT: 'HALFTIME',
      '2H': 'LIVE',
      ET: 'LIVE',
      P: 'LIVE',
      FT: 'FINISHED',
      AET: 'FINISHED',
      PEN: 'FINISHED',
      PST: 'POSTPONED',
      CANC: 'CANCELLED',
    };

    return map[apiStatus] || 'SCHEDULED';
  }
}

export default new SyncService();
