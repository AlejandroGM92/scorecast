import { prisma } from '../config/database';

interface LeaderboardEntry {
  id: string;
  username: string;
  totalPoints: number;
  exactScores: number;
  correctResults: number;
  correctGoals: number;
  rank: number;
  predictionsCount: number;
  championPrediction: string | null;
  isCurrentUser?: boolean;
}

// Compara dos entradas según todos los criterios de desempate.
// Retorna negativo si a > b (a va primero), positivo si b > a.
function comparePlayers(a: any, b: any): number {
  if (b.totalPoints !== a.totalPoints)       return b.totalPoints - a.totalPoints;       // 1° más puntos
  if (b.exactScores !== a.exactScores)       return b.exactScores - a.exactScores;       // 2° más exactos
  if (b.correctResults !== a.correctResults) return b.correctResults - a.correctResults; // 3° más resultados
  if (b.correctGoals !== a.correctGoals)     return b.correctGoals - a.correctGoals;     // 4° más goles
  // 5° campeón correcto (1 si acertó, 0 si no — se evalúa al tener ganador declarado)
  if (b.championCorrect !== a.championCorrect) return b.championCorrect - a.championCorrect;
  if (b.predictionsCount !== a.predictionsCount) return b.predictionsCount - a.predictionsCount; // 6° más partidos predichos
  return 0; // empate total → misma posición
}

class LeaderboardService {
  async getLeaderboard(currentUserId?: string): Promise<LeaderboardEntry[]> {
    // Obtener campeón declarado (si existe) para el criterio 5°
    const championConfig = await prisma.systemConfig.findUnique({ where: { key: 'champion_winner' } }).catch(() => null);
    const championWinner = championConfig?.value ?? null;

    const users = await prisma.user.findMany({
      where: { isActive: true, role: 'PLAYER' },
      select: {
        id: true,
        username: true,
        totalPoints: true,
        exactScores: true,
        correctResults: true,
        correctGoals: true,
        championPrediction: true,
        _count: { select: { predictions: true } },
      },
    });

    const enriched = users.map(u => ({
      ...u,
      predictionsCount: u._count.predictions,
      championCorrect: championWinner && u.championPrediction === championWinner ? 1 : 0,
    }));

    enriched.sort(comparePlayers);

    // Asignar rangos con empates compartidos
    const result: LeaderboardEntry[] = [];
    let rank = 1;
    for (let i = 0; i < enriched.length; i++) {
      if (i > 0 && comparePlayers(enriched[i], enriched[i - 1]) !== 0) {
        rank = i + 1;
      }
      result.push({
        id: enriched[i].id,
        username: enriched[i].username,
        totalPoints: enriched[i].totalPoints,
        exactScores: enriched[i].exactScores,
        correctResults: enriched[i].correctResults,
        correctGoals: enriched[i].correctGoals,
        rank,
        predictionsCount: enriched[i].predictionsCount,
        championPrediction: enriched[i].championPrediction,
        isCurrentUser: enriched[i].id === currentUserId,
      });
    }

    return result;
  }

  async getUserStats(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        totalPoints: true,
        exactScores: true,
        correctResults: true,
        correctGoals: true,
        championPrediction: true,
        championOdds: true,
        _count: { select: { predictions: true } },
      },
    });

    if (!user) throw new Error('Usuario no encontrado');

    // Calcular posición usando la misma lógica de desempate
    const leaderboard = await this.getLeaderboard(userId);
    const entry = leaderboard.find(e => e.id === userId);
    const rank = entry?.rank ?? leaderboard.length + 1;

    const recentPredictions = await prisma.prediction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        match: { include: { teamHome: true, teamAway: true } },
      },
    });

    return {
      ...user,
      rank,
      predictionsCount: user._count.predictions,
      recentPredictions,
    };
  }
}

export default new LeaderboardService();
