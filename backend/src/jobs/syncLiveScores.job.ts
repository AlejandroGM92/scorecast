import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { syncWorldCupLive } from '../services/wcSync.service';

export function startLiveScoreUpdates() {
  // Every 2 min — ESPN has no API quota, so no budget guard needed
  cron.schedule('*/2 * * * *', async () => {
    try {
      // Sync if there are LIVE/HALFTIME matches OR LOCKED matches whose start time has already passed
      const now = new Date();
      const activeCount = await prisma.match.count({
        where: {
          OR: [
            { status: { in: ['LIVE', 'HALFTIME'] } },
            { status: 'LOCKED', dateTime: { lte: now } },
          ],
        },
      });
      if (activeCount === 0) return;

      logger.info(`🔴 Live sync: ${activeCount} partidos activos o por cerrar`);
      await syncWorldCupLive();
    } catch (error) {
      logger.error('❌ Live score update job failed:', error);
    }
  });

  logger.info('✅ Live score update job started (cada 2 min, ESPN — sin límite de cuota)');
}
