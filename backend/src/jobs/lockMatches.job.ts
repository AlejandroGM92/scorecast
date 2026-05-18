import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export function startPredictionLockJob() {
  cron.schedule('* * * * *', async () => {
    try {
      const deadlineMinutes = parseInt(process.env.PREDICTION_DEADLINE_MINUTES || '20');
      const lockTime = new Date(Date.now() + deadlineMinutes * 60 * 1000);

      const matchesToLock = await prisma.match.findMany({
        where: { status: 'SCHEDULED', dateTime: { lte: lockTime } },
        select: { id: true },
      });

      if (matchesToLock.length > 0) {
        await prisma.match.updateMany({
          where: { id: { in: matchesToLock.map((m) => m.id) } },
          data: { status: 'LOCKED' },
        });

        logger.info(`🔒 Locked ${matchesToLock.length} match(es)`);
      }
    } catch (error) {
      logger.error('❌ Prediction lock job failed:', error);
    }
  });

  logger.info('✅ Prediction lock job started (every minute)');
}
