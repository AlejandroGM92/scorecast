import { Router } from 'express';
import { optionalAuth, auth, AuthRequest } from '../middleware/auth';
import leaderboardService from '../services/leaderboard.service';

const router = Router();

// GET /api/leaderboard
router.get('/', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const leaderboard = await leaderboardService.getLeaderboard(req.user?.id);
    res.json(leaderboard);
  } catch (error) {
    next(error);
  }
});

// GET /api/leaderboard/me
router.get('/me', auth, async (req: AuthRequest, res, next) => {
  try {
    const stats = await leaderboardService.getUserStats(req.user!.id);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// GET /api/leaderboard/:userId
router.get('/:userId', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const stats = await leaderboardService.getUserStats(req.params.userId);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

export default router;
