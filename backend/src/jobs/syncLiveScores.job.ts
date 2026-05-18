import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { syncWorldCupLive } from '../services/wcSync.service';

export function startLiveScoreUpdates() {
  // Every 2 min — ESPN has no API quota, so no budget guard needed
  cron.schedule('*/2 * * * *', async () => {
    try {
      const liveCount = await prisma.match.count({
        where: { status: { in: ['LIVE', 'HALFTIME'] } },
      });
      if (liveCount === 0) return;

      logger.info(`🔴 Live sync: ${liveCount} partidos en curso`);
      await syncWorldCupLive();
    } catch (error) {
      logger.error('❌ Live score update job failed:', error);
    }
  });

  logger.info('✅ Live score update job started (cada 2 min, ESPN — sin límite de cuota)');
}
