import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n🔄 Resetting all match scores and points...\n');

  const [matchResult, predResult, userResult] = await prisma.$transaction([
    // 1. Reset all matches to SCHEDULED
    prisma.match.updateMany({
      data: {
        status: 'SCHEDULED',
        scoreHome: null,
        scoreAway: null,
        pointsCalculated: false,
        minute: null,
      },
    }),

    // 2. Reset all prediction points
    prisma.prediction.updateMany({
      data: {
        pointsEarned: 0,
        pointsExact: 0,
        pointsResult: 0,
        pointsGoals: 0,
        isExactScore: false,
        isCorrectResult: false,
        hasCorrectGoal: false,
      },
    }),

    // 3. Reset all user stats and champion prediction
    prisma.user.updateMany({
      data: {
        totalPoints: 0,
        exactScores: 0,
        correctResults: 0,
        correctGoals: 0,
        championPrediction: null,
        championOdds: null,
      },
    }),
  ]);

  console.log(`  ✓ ${matchResult.count} partidos → SCHEDULED (sin marcador)`);
  console.log(`  ✓ ${predResult.count} predicciones → 0 pts`);
  console.log(`  ✓ ${userResult.count} usuarios → 0 pts`);
  console.log('\n✅ Reset completo. Todo listo para el Mundial real.\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
