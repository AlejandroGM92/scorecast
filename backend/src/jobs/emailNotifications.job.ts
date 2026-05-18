import cron from 'node-cron';
import { prisma } from '../config/database';
import { sendMatchReminderEmail } from '../services/email.service';
import { logger } from '../utils/logger';

export function startEmailNotificationsJob() {
  // Run every 30 minutes — detects matches starting between 55 and 75 minutes from now
  cron.schedule('0,30 * * * *', async () => {
    try {
      // Check toggle in DB before sending any email
      const config = await prisma.systemConfig.findUnique({ where: { key: 'email_notifications_enabled' } });
      const emailsEnabled = config?.value === 'true';

      const now = new Date();
      const windowStart = new Date(now.getTime() + 55 * 60 * 1000);
      const windowEnd   = new Date(now.getTime() + 75 * 60 * 1000);

      const upcomingMatches = await prisma.match.findMany({
        where: { status: 'SCHEDULED', dateTime: { gte: windowStart, lte: windowEnd } },
        include: {
          teamHome: { select: { name: true } },
          teamAway: { select: { name: true } },
        },
      });

      if (upcomingMatches.length === 0) return;

      // Find notifications already sent in the last 2 hours to avoid duplicates
      const recentNotifications = await prisma.notification.findMany({
        where: {
          type: 'MATCH_STARTING',
          createdAt: { gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
        },
        select: { metadata: true },
      });

      const alreadyNotifiedMatchIds = new Set<string>(
        recentNotifications
          .filter((n) => n.metadata && (n.metadata as any).matchId)
          .map((n) => (n.metadata as any).matchId as string)
      );

      const matchesToNotify = upcomingMatches.filter((m) => !alreadyNotifiedMatchIds.has(m.id));
      if (matchesToNotify.length === 0) return;

      // Get all active users with their emails
      const users = await prisma.user.findMany({
        where: { isActive: true },
        select: {
          id: true,
          email: true,
          username: true,
          predictions: {
            where: { matchId: { in: matchesToNotify.map((m) => m.id) } },
            select: { matchId: true },
          },
        },
      });

      let emailsSent = 0;

      for (const match of matchesToNotify) {
        for (const user of users) {
          const hasPrediction = user.predictions.some((p) => p.matchId === match.id);

          await prisma.notification.create({
            data: {
              userId: user.id,
              type: 'MATCH_STARTING',
              title: `${match.teamHome.name} vs ${match.teamAway.name}`,
              message: hasPrediction
                ? '¡El partido comienza en 1 hora!'
                : '¡Tienes menos de 1 hora para hacer tu predicción!',
              metadata: { matchId: match.id },
            },
          });

          if (emailsEnabled && user.email) {
            const sent = await sendMatchReminderEmail({
              to: user.email,
              username: user.username,
              homeTeam: match.teamHome.name,
              awayTeam: match.teamAway.name,
              matchTime: match.dateTime,
              hasPrediction,
            });
            if (sent) emailsSent++;
          }
        }

        logger.info(
          `📣 Notified ${users.length} users — ${match.teamHome.name} vs ${match.teamAway.name}`
        );
      }

      if (emailsSent > 0) {
        logger.info(`📧 Sent ${emailsSent} reminder emails`);
      }
    } catch (error) {
      logger.error('❌ Email notifications job failed:', error);
    }
  });

  logger.info('✅ Email notifications job started (every 30 min)');
}
