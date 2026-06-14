import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { auth, AuthRequest } from '../middleware/auth';
import { predictionLimiter } from '../middleware/rateLimiter';

const router = Router();

const predictionSchema = z.object({
  matchId: z.string(),
  predictedHome: z.number().int().min(0).max(20),
  predictedAway: z.number().int().min(0).max(20),
});

// POST /api/predictions - create or update
router.post('/', auth, predictionLimiter, async (req: AuthRequest, res, next) => {
  try {
    const { matchId, predictedHome, predictedAway } = predictionSchema.parse(req.body);
    const userId = req.user!.id;

    const match = await prisma.match.findUnique({ where: { id: matchId } });

    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });

    if (['LOCKED', 'LIVE', 'HALFTIME', 'FINISHED'].includes(match.status)) {
      return res.status(400).json({ error: 'Las predicciones están cerradas para este partido' });
    }

    const deadlineMinutes = parseInt(process.env.PREDICTION_DEADLINE_MINUTES || '20');
    const minutesUntilMatch = (match.dateTime.getTime() - Date.now()) / 60_000;
    if (minutesUntilMatch <= deadlineMinutes) {
      return res.status(400).json({ error: 'Las predicciones están cerradas para este partido' });
    }

    const prediction = await prisma.prediction.upsert({
      where: { userId_matchId: { userId, matchId } },
      update: { predictedHome, predictedAway },
      create: { userId, matchId, predictedHome, predictedAway },
      include: {
        match: {
          select: {
            id: true,
            teamHome: { select: { name: true, flag: true } },
            teamAway: { select: { name: true, flag: true } },
            dateTime: true,
          },
        },
      },
    });

    res.json(prediction);
  } catch (error) {
    next(error);
  }
});

// GET /api/predictions/my - current user's predictions
router.get('/my', auth, async (req: AuthRequest, res, next) => {
  try {
    const predictions = await prisma.prediction.findMany({
      where: { userId: req.user!.id },
      include: {
        match: {
          include: {
            teamHome: { select: { id: true, name: true, code: true, flag: true } },
            teamAway: { select: { id: true, name: true, code: true, flag: true } },
          },
        },
      },
      orderBy: { match: { dateTime: 'asc' } },
    });

    res.json(predictions);
  } catch (error) {
    next(error);
  }
});

// GET /api/predictions/match/:matchId - all predictions for a match (after it finishes)
router.get('/match/:matchId', auth, async (req: AuthRequest, res, next) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.matchId },
      select: { status: true, pointsCalculated: true },
    });

    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });

    if (match.status !== 'FINISHED') {
      return res.status(400).json({ error: 'Solo visible después de que termine el partido' });
    }

    const predictions = await prisma.prediction.findMany({
      where: { matchId: req.params.matchId },
      select: {
        predictedHome: true,
        predictedAway: true,
        pointsEarned: true,
        isExactScore: true,
        isCorrectResult: true,
        user: { select: { username: true } },
      },
      orderBy: { pointsEarned: 'desc' },
    });

    res.json(predictions);
  } catch (error) {
    next(error);
  }
});

export default router;
