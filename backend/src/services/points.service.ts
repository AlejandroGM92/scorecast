import { prisma } from '../config/database';
import { logger } from '../utils/logger';

interface PointsBreakdown {
  exact: number;
  result: number;
  goals: number;
  total: number;
}

class PointsService {
  async calculatePointsForFinishedMatches(): Promise<void> {
    logger.info('🎯 Starting automatic points calculation...');

    const finishedMatches = await prisma.match.findMany({
      where: {
        status: 'FINISHED',
        pointsCalculated: false,
        scoreHome: { not: null },
        scoreAway: { not: null },
      },
      include: {
        predictions: { include: { user: true } },
        teamHome: true,
        teamAway: true,
      },
    });

    if (finishedMatches.length === 0) {
      logger.info('ℹ️ No finished matches to process');
      return;
    }

    logger.info(`📊 Processing ${finishedMatches.length} finished match(es)`);

    for (const match of finishedMatches) {
      try {
        await this.processMatchPoints(match);
      } catch (error) {
        logger.error(`❌ Error processing match ${match.id}:`, error);
      }
    }

    logger.info('✅ Automatic points calculation completed');
  }

  private async processMatchPoints(match: any): Promise<void> {
    const { scoreHome, scoreAway, predictions } = match;

    logger.info(
      `🧮 Calculating: ${match.teamHome.name} ${scoreHome}-${scoreAway} ${match.teamAway.name}`
    );

    await prisma.$transaction(async (tx) => {
      for (const prediction of predictions) {
        const points = this.calculatePoints(
          prediction.predictedHome,
          prediction.predictedAway,
          scoreHome!,
          scoreAway!
        );

        await tx.prediction.update({
          where: { id: prediction.id },
          data: {
            pointsEarned: points.total,
            pointsExact: points.exact,
            pointsResult: points.result,
            pointsGoals: points.goals,
            isExactScore: points.exact > 0,
            isCorrectResult: points.result > 0,
            hasCorrectGoal: points.goals > 0,
          },
        });

        await tx.user.update({
          where: { id: prediction.userId },
          data: {
            totalPoints: { increment: points.total },
            exactScores: { increment: points.exact > 0 ? 1 : 0 },
            correctResults: { increment: points.result > 0 ? 1 : 0 },
            correctGoals: { increment: points.goals > 0 ? 1 : 0 },
          },
        });

        if (points.total > 0) {
          await tx.notification.create({
            data: {
              userId: prediction.userId,
              type: 'POINTS_EARNED',
              title: '¡Puntos ganados!',
              message: `Ganaste ${points.total} puntos en ${match.teamHome.name} vs ${match.teamAway.name}`,
              metadata: { matchId: match.id, points: points.total, breakdown: points as unknown as Record<string, number> },
            },
          });
        }

        logger.info(`  ✓ ${prediction.user.username}: ${points.total} pts`);
      }

      await tx.match.update({
        where: { id: match.id },
        data: { pointsCalculated: true },
      });
    });

    logger.info(`✅ Match processed: ${predictions.length} predictions updated`);
  }

  calculatePoints(
    predHome: number,
    predAway: number,
    realHome: number,
    realAway: number
  ): PointsBreakdown {
    // 3 pts: marcador exacto
    const exact = predHome === realHome && predAway === realAway ? 3 : 0;

    // 2 pts: resultado correcto (ganador o empate)
    const predResult = predHome > predAway ? 'H' : predHome < predAway ? 'A' : 'D';
    const realResult = realHome > realAway ? 'H' : realHome < realAway ? 'A' : 'D';
    const result = predResult === realResult ? 2 : 0;

    // 1 pt por goles local + 1 pt por goles visitante (máx 2 pts)
    const goals = (predHome === realHome ? 1 : 0) + (predAway === realAway ? 1 : 0);

    return { exact, result, goals, total: exact + result + goals };
  }

  async recalculateMatch(matchId: string): Promise<void> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        predictions: { include: { user: true } },
        teamHome: true,
        teamAway: true,
      },
    });

    if (!match) throw new Error('Partido no encontrado');
    if (match.status !== 'FINISHED') throw new Error('El partido no ha terminado');

    // Reset previous points for all affected users
    if (match.pointsCalculated) {
      for (const prediction of match.predictions) {
        await prisma.user.update({
          where: { id: prediction.userId },
          data: {
            totalPoints: { decrement: prediction.pointsEarned },
            exactScores: { decrement: prediction.isExactScore ? 1 : 0 },
            correctResults: { decrement: prediction.isCorrectResult ? 1 : 0 },
            correctGoals: { decrement: prediction.hasCorrectGoal ? 1 : 0 },
          },
        });
      }
    }

    await prisma.match.update({
      where: { id: matchId },
      data: { pointsCalculated: false },
    });

    await this.processMatchPoints(match);
  }

  async calculateChampionPoints(winnerCode: string): Promise<void> {
    logger.info(`🏆 Calculating champion bonus for ${winnerCode}`);

    const users = await prisma.user.findMany({
      where: { championPrediction: winnerCode, championOdds: { not: null } },
    });

    for (const user of users) {
      const bonusPoints = Math.round(user.championOdds! * 10);

      await prisma.user.update({
        where: { id: user.id },
        data: { totalPoints: { increment: bonusPoints } },
      });

      await prisma.notification.create({
        data: {
          userId: user.id,
          type: 'POINTS_EARNED',
          title: '¡Acertaste el campeón!',
          message: `Ganaste ${bonusPoints} puntos por predecir correctamente al campeón`,
          metadata: { champion: winnerCode, points: bonusPoints },
        },
      });

      logger.info(`  ✓ ${user.username}: +${bonusPoints} bonus pts`);
    }
  }
}

export default new PointsService();
