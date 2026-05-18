import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function randGoals(): number {
  const weights = [20, 30, 25, 15, 7, 3]; // 0,1,2,3,4,5 goals
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return 0;
}

function calcPoints(predHome: number, predAway: number, realHome: number, realAway: number) {
  const exact = predHome === realHome && predAway === realAway ? 3 : 0;
  const predResult = predHome > predAway ? 'H' : predHome < predAway ? 'A' : 'D';
  const realResult = realHome > realAway ? 'H' : realHome < realAway ? 'A' : 'D';
  const result = predResult === realResult ? 2 : 0;
  const goals = (predHome === realHome ? 1 : 0) + (predAway === realAway ? 1 : 0);
  return { exact, result, goals, total: exact + result + goals };
}

async function main() {
  const matches = await prisma.match.findMany({
    include: { predictions: { include: { user: true } }, teamHome: true, teamAway: true },
  });

  console.log(`\n🎲 Setting random scores for ${matches.length} matches...\n`);

  for (const match of matches) {
    const scoreHome = randGoals();
    const scoreAway = randGoals();

    await prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: match.id },
        data: { scoreHome, scoreAway, status: 'FINISHED', pointsCalculated: false },
      });

      for (const prediction of match.predictions) {
        const pts = calcPoints(prediction.predictedHome, prediction.predictedAway, scoreHome, scoreAway);

        await tx.prediction.update({
          where: { id: prediction.id },
          data: {
            pointsEarned: pts.total,
            pointsExact: pts.exact,
            pointsResult: pts.result,
            pointsGoals: pts.goals,
            isExactScore: pts.exact > 0,
            isCorrectResult: pts.result > 0,
            hasCorrectGoal: pts.goals > 0,
          },
        });

        await tx.user.update({
          where: { id: prediction.userId },
          data: {
            totalPoints: { increment: pts.total },
            exactScores: { increment: pts.exact > 0 ? 1 : 0 },
            correctResults: { increment: pts.result > 0 ? 1 : 0 },
            correctGoals: { increment: pts.goals > 0 ? 1 : 0 },
          },
        });
      }

      await tx.match.update({
        where: { id: match.id },
        data: { pointsCalculated: true },
      });
    });

    console.log(`  ✓ ${match.teamHome.name} ${scoreHome}-${scoreAway} ${match.teamAway.name} (${match.predictions.length} predictions)`);
  }

  const users = await prisma.user.findMany({ select: { username: true, totalPoints: true }, orderBy: { totalPoints: 'desc' } });
  console.log('\n🏆 Leaderboard after scoring:');
  users.forEach((u, i) => console.log(`  ${i + 1}. ${u.username}: ${u.totalPoints} pts`));
  console.log('\n✅ Done!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
