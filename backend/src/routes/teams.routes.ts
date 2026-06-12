import { Router } from 'express';
import { prisma } from '../config/database';

const router = Router();

// GET /api/teams — public list of teams with champion odds
router.get('/', async (_req, res, next) => {
  try {
    const teams = await prisma.team.findMany({
      select: { id: true, code: true, name: true, flag: true, group: true, championOdds: true, played: true, won: true, drawn: true, lost: true, goalsFor: true, goalsAgainst: true, goalDifference: true, points: true },
      orderBy: [{ group: 'asc' }, { championOdds: 'asc' }],
    });
    res.json(teams);
  } catch (error) {
    next(error);
  }
});

export default router;
