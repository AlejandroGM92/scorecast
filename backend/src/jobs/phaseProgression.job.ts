import cron from 'node-cron';
import { logger } from '../utils/logger';
import { autoProgressPhase } from '../services/phaseProgression.service';

export function startPhaseProgressionJob() {
  // Runs every 30 min — checks if a knockout phase is complete and creates the next one
  cron.schedule('*/30 * * * *', async () => {
    try {
      const result = await autoProgressPhase();
      if (result.phaseCompleted) {
        logger.info(`[phaseProgression] ${result.phaseCompleted} → ${result.nextPhase}: creados=${result.matchesCreated} actualizados=${result.matchesUpdated} saltados=${result.skipped}`);
        for (const d of result.details) logger.info(`  ${d}`);
      }
    } catch (error) {
      logger.error('[phaseProgression] Job failed:', error);
    }
  });

  logger.info('✅ Phase progression job started (cada 30 min)');
}
