import { startLiveScoreUpdates } from './syncLiveScores.job';
import { startPointsCalculationJob } from './calculatePoints.job';
import { startPredictionLockJob } from './lockMatches.job';
import { startEmailNotificationsJob } from './emailNotifications.job';
import { logger } from '../utils/logger';

export function startAllJobs() {
  if (process.env.SYNC_ENABLED !== 'true') {
    logger.warn('⚠️ Cron jobs are DISABLED (SYNC_ENABLED != true)');
    return;
  }

  startLiveScoreUpdates();
  startPointsCalculationJob();
  startPredictionLockJob();
  startEmailNotificationsJob();

  logger.info('🚀 All cron jobs initialized');
}
