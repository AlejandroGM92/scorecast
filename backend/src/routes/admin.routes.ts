import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { adminAuth, AuthRequest } from '../middleware/auth';
import pointsService from '../services/points.service';
import syncService from '../services/sync.service';
import apiFootballService from '../services/apiFootball.service';
import { syncWorldCupScores, syncWorldCupLive } from '../services/wcSync.service';
import { sendMatchReminderEmail } from '../services/email.service';
import { logger } from '../utils/logger';

const router = Router();

// Cache for getRemainingRequests — avoids burning API quota on every tab open
let remainingCache: { value: number; cachedAt: number } | null = null;
const REMAINING_CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours

// GET /api/admin/tokens - list all invitation tokens
router.get('/tokens', adminAuth, async (_req, res, next) => {
  try {
    const tokens = await prisma.invitationToken.findMany({
      include: {
        createdBy: { select: { username: true } },
        _count: { select: { usedBy: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(tokens);
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/tokens - create invitation token
router.post('/tokens', adminAuth, async (req: AuthRequest, res, next) => {
  try {
    const schema = z.object({
      code: z.string().min(4).max(12).optional(),
      maxUses: z.number().int().min(-1).default(1),
      expiresAt: z.string().datetime().optional().nullable(),
      description: z.string().max(100).optional(),
    });

    const data = schema.parse(req.body);

    const code =
      data.code ||
      `SC26-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const token = await prisma.invitationToken.create({
      data: {
        code,
        maxUses: data.maxUses,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        description: data.description,
        createdById: req.user!.id,
      },
    });

    res.status(201).json(token);
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/tokens/:id - update token
router.put('/tokens/:id', adminAuth, async (_req, res, next) => {
  try {
    const schema = z.object({
      isActive: z.boolean().optional(),
      maxUses: z.number().int().min(-1).optional(),
      expiresAt: z.string().datetime().optional().nullable(),
    });

    const data = schema.parse(_req.body);

    const token = await prisma.invitationToken.update({
      where: { id: _req.params.id },
      data: {
        ...data,
        expiresAt: data.expiresAt !== undefined ? (data.expiresAt ? new Date(data.expiresAt) : null) : undefined,
      },
    });

    res.json(token);
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/calculate-points/:matchId - manual points recalculation
router.post('/calculate-points/:matchId', adminAuth, async (req, res, next) => {
  try {
    await pointsService.recalculateMatch(req.params.matchId);
    res.json({ success: true, message: 'Puntos recalculados correctamente' });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/reset-all-scores - full reset: matches → SCHEDULED, predictions → 0, users → 0 pts
router.post('/reset-all-scores', adminAuth, async (_req, res, next) => {
  try {
    const [matches, predictions, users] = await prisma.$transaction([
      prisma.match.updateMany({
        data: { status: 'SCHEDULED', scoreHome: null, scoreAway: null, pointsCalculated: false, minute: null },
      }),
      prisma.prediction.updateMany({
        data: { pointsEarned: 0, pointsExact: 0, pointsResult: 0, pointsGoals: 0, isExactScore: false, isCorrectResult: false, hasCorrectGoal: false },
      }),
      prisma.user.updateMany({
        data: { totalPoints: 0, exactScores: 0, correctResults: 0, correctGoals: 0, championPrediction: null, championOdds: null },
      }),
    ]);

    logger.info(`🔄 Full reset: ${matches.count} matches, ${predictions.count} predictions, ${users.count} users`);
    res.json({ success: true, matches: matches.count, predictions: predictions.count, users: users.count });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/calculate-all-points - calculate pending points for all finished matches
router.post('/calculate-all-points', adminAuth, async (_req, res, next) => {
  try {
    await pointsService.calculatePointsForFinishedMatches();
    res.json({ success: true, message: 'Puntos calculados para todos los partidos finalizados' });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/sync-scores - manual sync trigger
router.post('/sync-scores', adminAuth, async (_req, res, next) => {
  try {
    await syncService.updateLiveScores();
    res.json({ success: true, message: 'Sincronización completada' });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/api-usage - API Football usage stats
router.get('/api-usage', adminAuth, async (_req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const usageLogs = await prisma.apiUsageLog.findMany({
      where: { date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      orderBy: { date: 'desc' },
    });

    const now = Date.now();
    if (!remainingCache || now - remainingCache.cachedAt > REMAINING_CACHE_MS) {
      remainingCache = { value: await apiFootballService.getRemainingRequests(), cachedAt: now };
    }

    res.json({ usageLogs, remaining: remainingCache.value, dailyLimit: 100 });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/matches/bulk-status - set all matches to a given status
router.post('/matches/bulk-status', adminAuth, async (req, res, next) => {
  try {
    const { status } = z.object({
      status: z.enum(['SCHEDULED', 'LOCKED', 'LIVE', 'HALFTIME', 'FINISHED']),
    }).parse(req.body);

    const result = await prisma.match.updateMany({
      data: {
        status,
        ...(status === 'SCHEDULED' ? { scoreHome: null, scoreAway: null, pointsCalculated: false } : {}),
      },
    });

    res.json({ success: true, updated: result.count, status });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/matches - list all matches for admin
router.get('/matches', adminAuth, async (_req, res, next) => {
  try {
    const matches = await prisma.match.findMany({
      where: { competition: 'WORLD_CUP' },
      include: {
        teamHome: { select: { name: true, code: true, flag: true } },
        teamAway: { select: { name: true, code: true, flag: true } },
        _count: { select: { predictions: true } },
      },
      orderBy: { dateTime: 'asc' },
    });
    res.json(matches);
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/match/:id/score - manually set match score
router.put('/match/:id/score', adminAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      scoreHome: z.number().int().min(0).optional(),
      scoreAway: z.number().int().min(0).optional(),
      status: z.enum(['SCHEDULED', 'LOCKED', 'LIVE', 'HALFTIME', 'FINISHED']).optional(),
    });

    const data = schema.parse(req.body);

    const match = await prisma.match.update({
      where: { id: req.params.id },
      data: {
        ...data,
        scoreHome: data.status === 'SCHEDULED' ? null : data.scoreHome,
        scoreAway: data.status === 'SCHEDULED' ? null : data.scoreAway,
        pointsCalculated: data.status === 'SCHEDULED' ? false : data.status === 'FINISHED' ? false : undefined,
      },
    });

    res.json(match);
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/users - list all users
router.get('/users', adminAuth, async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        totalPoints: true,
        oauthProvider: true,
        createdAt: true,
        lastLoginAt: true,
        _count: { select: { predictions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/users/:id - update user
router.put('/users/:id', adminAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      isActive: z.boolean().optional(),
      role: z.enum(['ADMIN', 'PLAYER']).optional(),
      email: z.string().email().optional(),
      username: z.string().min(3).max(30).optional(),
    });

    const data = schema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, username: true, role: true, isActive: true },
    });

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/users/:id - delete user
router.delete('/users/:id', adminAuth, async (req: AuthRequest, res, next) => {
  try {
    if (req.params.id === req.user!.id) {
      return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
    }
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/config - system configuration
router.get('/config', adminAuth, async (_req, res, next) => {
  try {
    const configs = await prisma.systemConfig.findMany();
    res.json(configs);
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/config/:key - update config value
router.put('/config/:key', adminAuth, async (req, res, next) => {
  try {
    const { value } = z.object({ value: z.string() }).parse(req.body);
    const config = await prisma.systemConfig.update({
      where: { key: req.params.key },
      data: { value },
    });
    res.json(config);
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/test-email - send a test email to the admin
router.post('/test-email', adminAuth, async (req: AuthRequest, res, next) => {
  try {
    const admin = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { email: true, username: true },
    });

    if (!admin?.email) {
      return res.status(400).json({ error: 'Admin no tiene email configurado' });
    }

    const sent = await sendMatchReminderEmail({
      to: admin.email,
      username: admin.username,
      homeTeam: 'España',
      awayTeam: 'Argentina',
      matchTime: new Date(Date.now() + 60 * 60 * 1000),
      hasPrediction: false,
    });

    if (sent) {
      res.json({ success: true, message: `Email de prueba enviado a ${admin.email}` });
    } else {
      res.status(500).json({ error: 'No se pudo enviar el email. Revisa la configuración SMTP en .env' });
    }
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/email-toggle — get current email notifications status
router.get('/email-toggle', adminAuth, async (_req, res, next) => {
  try {
    const config = await prisma.systemConfig.findUnique({ where: { key: 'email_notifications_enabled' } });
    res.json({ enabled: config?.value === 'true' });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/email-toggle — toggle automatic email notifications
router.post('/email-toggle', adminAuth, async (_req, res, next) => {
  try {
    const current = await prisma.systemConfig.findUnique({ where: { key: 'email_notifications_enabled' } });
    const newValue = current?.value === 'true' ? 'false' : 'true';
    await prisma.systemConfig.upsert({
      where: { key: 'email_notifications_enabled' },
      update: { value: newValue },
      create: { key: 'email_notifications_enabled', value: newValue, description: 'Send email reminders 1h before matches' },
    });
    res.json({ enabled: newValue === 'true' });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/wc-sync — full sync Mundial 2026 scores from ESPN
router.post('/wc-sync', adminAuth, async (_req, res, next) => {
  try {
    const result = await syncWorldCupScores();
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/wc-sync-live — live scores only (Mundial)
router.post('/wc-sync-live', adminAuth, async (_req, res, next) => {
  try {
    await syncWorldCupLive();
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});


export default router;
