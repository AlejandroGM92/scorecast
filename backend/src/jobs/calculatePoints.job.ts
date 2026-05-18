import cron from 'node-cron';
import pointsService from '../services/points.service';
import { logger } from '../utils/logger';

export function startPointsCalculationJob() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await pointsService.calculatePointsForFinishedMatches();
    } catch (error) {
      logger.error('❌ Points calculation job failed:', error);
    }
  });

  logger.info('✅ Points calculation job started (every 5 min)');
}
