import { Router } from 'express';
import { z } from 'zod';
import axios from 'axios';
import { prisma } from '../config/database';
import { adminAuth, AuthRequest } from '../middleware/auth';
import { adminLimiter } from '../middleware/rateLimiter';
import pointsService from '../services/points.service';
import syncService from '../services/sync.service';
import apiFootballService from '../services/apiFootball.service';
import { syncWorldCupScores, syncWorldCupLive } from '../services/wcSync.service';
import { sendMatchReminderEmail, verifySmtp } from '../services/email.service';
import { recalculateGroupStandings } from '../services/standings.service';
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

// DELETE /api/admin/tokens/:id - delete token
router.delete('/tokens/:id', adminAuth, async (req, res, next) => {
  try {
    await prisma.invitationToken.delete({ where: { id: req.params.id } });
    res.json({ success: true });
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

// GET /api/admin/debug-match/:matchId — diagnose why points may not be calculated
router.get('/debug-match/:matchId', adminAuth, async (req, res, next) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.matchId },
      include: {
        teamHome: { select: { name: true } },
        teamAway: { select: { name: true } },
        _count: { select: { predictions: true } },
      },
    });
    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });

    const predictions = await prisma.prediction.findMany({
      where: { matchId: match.id },
      select: { id: true, predictedHome: true, predictedAway: true, pointsEarned: true, user: { select: { username: true } } },
    });

    res.json({
      match: {
        id: match.id,
        name: `${match.teamHome.name} vs ${match.teamAway.name}`,
        status: match.status,
        scoreHome: match.scoreHome,
        scoreAway: match.scoreAway,
        pointsCalculated: match.pointsCalculated,
        lastSyncAt: match.lastSyncAt,
      },
      predictions: predictions.map(p => ({
        user: p.user.username,
        predicted: `${p.predictedHome}-${p.predictedAway}`,
        pointsEarned: p.pointsEarned,
      })),
      totalPredictions: predictions.length,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/force-recalculate/:matchId — force recalculate ignoring pointsCalculated flag
router.post('/force-recalculate/:matchId', adminAuth, async (req, res, next) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.matchId },
      include: { predictions: true, teamHome: true, teamAway: true },
    });
    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });
    if (match.status !== 'FINISHED') return res.status(400).json({ error: `Estado actual: ${match.status}. Debe ser FINISHED.` });
    if (match.scoreHome == null) return res.status(400).json({ error: 'El partido no tiene marcador asignado' });

    // Decrement previous points if already calculated
    if (match.pointsCalculated) {
      for (const pred of match.predictions) {
        await prisma.user.update({
          where: { id: pred.userId },
          data: {
            totalPoints: { decrement: pred.pointsEarned },
            exactScores: { decrement: pred.isExactScore ? 1 : 0 },
            correctResults: { decrement: pred.isCorrectResult ? 1 : 0 },
            correctGoals: { decrement: pred.hasCorrectGoal ? 1 : 0 },
          },
        });
      }
    }

    // Reset match and prediction stats
    await prisma.match.update({ where: { id: match.id }, data: { pointsCalculated: false } });
    await prisma.prediction.updateMany({
      where: { matchId: match.id },
      data: { pointsEarned: 0, pointsExact: 0, pointsResult: 0, pointsGoals: 0, isExactScore: false, isCorrectResult: false, hasCorrectGoal: false },
    });

    // Now calculate
    await pointsService.calculatePointsForFinishedMatches();

    const updated = await prisma.prediction.findMany({
      where: { matchId: match.id },
      select: { pointsEarned: true, user: { select: { username: true } } },
    });
    res.json({ success: true, predictions: updated.map(p => ({ user: p.user.username, points: p.pointsEarned })) });
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

// DELETE /api/admin/predictions - delete all predictions and reset user points/stats
router.delete('/predictions', adminAuth, async (_req, res, next) => {
  try {
    const [deleted, users] = await prisma.$transaction([
      prisma.prediction.deleteMany({}),
      prisma.user.updateMany({
        data: { totalPoints: 0, exactScores: 0, correctResults: 0, correctGoals: 0 },
      }),
    ]);
    await prisma.match.updateMany({ data: { pointsCalculated: false } });
    logger.info(`🗑 Predictions cleared: ${deleted.count} deleted, ${users.count} users reset`);
    res.json({ success: true, deleted: deleted.count, usersReset: users.count });
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

// POST /api/admin/reset-and-recalculate — reset ALL user/prediction points then recalculate
// Safe: does NOT delete predictions or erase scores. Fixes stuck pointsCalculated=true states.
router.post('/reset-and-recalculate', adminAuth, async (_req, res, next) => {
  try {
    const now = new Date();

    // 1. Promote LOCKED/LIVE/HALFTIME matches that have a score AND are past their start time → FINISHED
    // (handles cases where sync set the score but status didn't update)
    // DIAGNOSTIC: find ALL matches that have a score, regardless of status
    const matchesWithScore = await prisma.match.findMany({
      where: { scoreHome: { not: null } },
      select: {
        id: true, status: true, scoreHome: true, scoreAway: true,
        pointsCalculated: true, dateTime: true,
        teamHome: { select: { name: true } },
        teamAway: { select: { name: true } },
        _count: { select: { predictions: true } },
      },
    });
    logger.info(`🔍 Matches with score: ${JSON.stringify(matchesWithScore.map(m => ({
      match: `${m.teamHome.name} vs ${m.teamAway.name}`,
      status: m.status, score: `${m.scoreHome}-${m.scoreAway}`,
      pointsCalculated: m.pointsCalculated, predictions: m._count.predictions,
    })))}`);

    // 1. Promote ANY past match with a score that isn't FINISHED yet
    const promoted = await prisma.match.updateMany({
      where: {
        status: { notIn: ['FINISHED', 'CANCELLED'] },
        dateTime: { lte: now },
        scoreHome: { not: null },
        scoreAway: { not: null },
      },
      data: { status: 'FINISHED', pointsCalculated: false },
    });
    if (promoted.count > 0) logger.info(`🔧 Promoted ${promoted.count} match(es) to FINISHED`);

    // 2. Reset user point stats to 0
    await prisma.user.updateMany({
      data: { totalPoints: 0, exactScores: 0, correctResults: 0, correctGoals: 0 },
    });

    // 3. Reset all prediction point fields to 0
    await prisma.prediction.updateMany({
      data: { pointsEarned: 0, pointsExact: 0, pointsResult: 0, pointsGoals: 0, isExactScore: false, isCorrectResult: false, hasCorrectGoal: false },
    });

    // 4. Mark all FINISHED matches with a score as pending recalculation
    await prisma.match.updateMany({
      where: { status: 'FINISHED', scoreHome: { not: null }, scoreAway: { not: null } },
      data: { pointsCalculated: false },
    });

    // 5. Inline calculation with full diagnostic — bypass service layer entirely
    const toProcess = await prisma.match.findMany({
      where: { status: 'FINISHED', pointsCalculated: false, scoreHome: { not: null }, scoreAway: { not: null } },
      include: { predictions: { include: { user: true } }, teamHome: true, teamAway: true },
    });
    logger.info(`🎯 Matches to process: ${toProcess.length}`);

    const processResults: any[] = [];
    for (const match of toProcess) {
      const scoreHome = match.scoreHome!;
      const scoreAway = match.scoreAway!;
      const predResults: any[] = [];

      for (const pred of match.predictions) {
        const ph = pred.predictedHome;
        const pa = pred.predictedAway;
        const exact  = ph === scoreHome && pa === scoreAway ? 3 : 0;
        const predR  = ph > pa ? 'H' : ph < pa ? 'A' : 'D';
        const realR  = scoreHome > scoreAway ? 'H' : scoreHome < scoreAway ? 'A' : 'D';
        const result = predR === realR ? 2 : 0;
        const goals  = (ph === scoreHome ? 1 : 0) + (pa === scoreAway ? 1 : 0);
        const total  = exact + result + goals;

        predResults.push({ user: pred.user.username, ph, pa, scoreHome, scoreAway, exact, result, goals, total });

        // Apply points directly
        await prisma.prediction.update({
          where: { id: pred.id },
          data: { pointsEarned: total, pointsExact: exact, pointsResult: result, pointsGoals: goals,
                  isExactScore: exact > 0, isCorrectResult: result > 0, hasCorrectGoal: goals > 0 },
        });
        await prisma.user.update({
          where: { id: pred.userId },
          data: { totalPoints: { increment: total }, exactScores: { increment: exact > 0 ? 1 : 0 },
                  correctResults: { increment: result > 0 ? 1 : 0 }, correctGoals: { increment: goals > 0 ? 1 : 0 } },
        });
      }

      await prisma.match.update({ where: { id: match.id }, data: { pointsCalculated: true } });
      logger.info(`✅ ${match.teamHome.name} vs ${match.teamAway.name}: ${predResults.length} preds processed`);
      processResults.push({
        match: `${match.teamHome.name} vs ${match.teamAway.name}`,
        scoreHome, scoreAway,
        predictions: predResults.length,
        sample: predResults.slice(0, 5),
        status: 'ok',
      });
    }

    // 6. Return summary
    const users = await prisma.user.findMany({
      where: { totalPoints: { gt: 0 } },
      select: { username: true, totalPoints: true },
      orderBy: { totalPoints: 'desc' },
      take: 10,
    });

    res.json({
      success: true,
      diagnostic: {
        matchesWithScore: matchesWithScore.map(m => ({
          match: `${m.teamHome.name} vs ${m.teamAway.name}`,
          status: m.status, score: `${m.scoreHome}-${m.scoreAway}`,
          pointsCalculated: m.pointsCalculated, predictions: m._count.predictions,
        })),
        promoted: promoted.count,
        processResults,
      },
      topScorers: users,
    });
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

// GET /api/admin/users/export — download CSV with all registered users
router.get('/users/export', adminAuth, async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        username: true,
        email: true,
        role: true,
        isActive: true,
        oauthProvider: true,
        googleId: true,
        whatsappNumber: true,
        telegramChatId: true,
        totalPoints: true,
        exactScores: true,
        correctResults: true,
        correctGoals: true,
        championPrediction: true,
        createdAt: true,
        lastLoginAt: true,
        _count: { select: { predictions: true } },
      },
    });

    const escape = (v: unknown) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const header = ['Usuario', 'Email', 'Rol', 'Activo', 'Auth', 'WhatsApp', 'Telegram', 'Puntos', 'Exactos', 'Resultados', 'Goles', 'Campeón', 'Predicciones', 'Registro', 'Último login'];
    const rows = users.map((u) => [
      u.username,
      u.email,
      u.role,
      u.isActive ? 'Si' : 'No',
      u.oauthProvider ? `Google (${u.googleId?.slice(0, 8)}...)` : 'Email',
      u.whatsappNumber || '',
      u.telegramChatId ? 'Conectado' : '',
      u.totalPoints,
      u.exactScores,
      u.correctResults,
      u.correctGoals,
      u.championPrediction || '',
      u._count.predictions,
      u.createdAt.toISOString().slice(0, 10),
      u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 10) : '',
    ].map(escape).join(','));

    const bom = '﻿';
    const csv = bom + [header.join(','), ...rows].join('\r\n');
    const filename = `scorecast_usuarios_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
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

    // Verify SMTP connection first — returns the exact error from nodemailer
    const verify = await verifySmtp();
    if (!verify.ok) {
      return res.status(500).json({ error: `Error SMTP: ${verify.error}` });
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
      res.status(500).json({ error: 'Resend conectó pero falló al enviar. Revisa los logs de Render para ver el error exacto.' });
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

// POST /api/admin/sync-odds — apply correct champion odds to all 48 WC teams
router.post('/sync-odds', adminAuth, async (_req, res, next) => {
  try {
    const ODDS: Record<string, number> = {
      ESP: 5,   FRA: 6,   ENG: 7,   ARG: 9,   BRA: 9,
      GER: 13,  POR: 13,  NED: 19,  NOR: 26,  BEL: 34,
      COL: 41,  USA: 51,  MAR: 51,  JPN: 67,  SUI: 67,
      CRO: 81,  MEX: 81,  URU: 81,
      ECU: 101, SEN: 101, SWE: 101, TUR: 101, AUT: 101, CAN: 101,
      PAR: 151, BIH: 151, SCO: 151,
      CIV: 251, EGY: 251,
      CZE: 301, ALG: 301, GHA: 301,
      AUS: 401, KOR: 401,
      IRN: 501, TUN: 501, COD: 501, KSA: 501,
      QAT: 751,
      RSA: 1001, IRQ: 1001, NZL: 1001,
      PAN: 1501, CPV: 1501, CUW: 1501,
      UZB: 2001, JOR: 2001,
      HAI: 2501,
    };

    let updated = 0;
    for (const [code, odds] of Object.entries(ODDS)) {
      const result = await prisma.team.updateMany({ where: { code }, data: { championOdds: odds } });
      updated += result.count;
    }

    logger.info(`✅ Odds sincronizadas: ${updated} equipos actualizados`);
    res.json({ success: true, updated });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/recalculate-standings — recompute group table stats from FINISHED matches
router.post('/recalculate-standings', adminAuth, async (_req, res, next) => {
  try {
    await recalculateGroupStandings();
    res.json({ success: true, message: 'Tabla de grupos actualizada' });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/sync-groups — apply official FIFA 2026 group assignments
router.post('/sync-groups', adminAuth, async (_req, res, next) => {
  try {
    const GROUP_ASSIGNMENTS: Record<string, string> = {
      // Group A
      MEX: 'A', RSA: 'A', KOR: 'A', CZE: 'A',
      // Group B
      CAN: 'B', SUI: 'B', QAT: 'B', BIH: 'B',
      // Group C
      BRA: 'C', MAR: 'C', HAI: 'C', SCO: 'C',
      // Group D
      USA: 'D', PAR: 'D', AUS: 'D', TUR: 'D',
      // Group E
      GER: 'E', CUW: 'E', CIV: 'E', ECU: 'E',
      // Group F
      NED: 'F', JPN: 'F', TUN: 'F', SWE: 'F',
      // Group G
      BEL: 'G', EGY: 'G', IRN: 'G', NZL: 'G',
      // Group H
      ESP: 'H', CPV: 'H', KSA: 'H', URU: 'H',
      // Group I
      FRA: 'I', SEN: 'I', NOR: 'I', IRQ: 'I',
      // Group J
      ARG: 'J', ALG: 'J', AUT: 'J', JOR: 'J',
      // Group K
      POR: 'K', UZB: 'K', COL: 'K', COD: 'K',
      // Group L
      ENG: 'L', CRO: 'L', GHA: 'L', PAN: 'L',
    };

    let updated = 0;
    for (const [code, group] of Object.entries(GROUP_ASSIGNMENTS)) {
      const result = await prisma.team.updateMany({ where: { code }, data: { group } });
      updated += result.count;
    }

    // Clear groups for teams not in any WC group (e.g. liga teams)
    await prisma.team.updateMany({
      where: { code: { notIn: Object.keys(GROUP_ASSIGNMENTS) } },
      data: { group: null },
    });

    logger.info(`✅ Grupos sincronizados: ${updated} equipos actualizados`);
    res.json({ success: true, updated });
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


// POST /api/admin/simulate-matches — apply simulated results to existing matches using real user predictions
router.post('/simulate-matches', adminAuth, async (_req, res, next) => {
  // Team name patterns → simulated result (using real existing matches in DB)
  const plan = [
    { h: 'México',         a: 'South Africa',      sh: 2, sa: 1 },
    { h: 'Corea del Sur',  a: 'Czechia',            sh: 1, sa: 1 },
    { h: 'Canadá',         a: 'Bosnia',             sh: 0, sa: 2 },
    { h: 'Estados Unidos', a: 'Paraguay',           sh: 3, sa: 0 },
    { h: 'Qatar',          a: 'Suiza',              sh: 1, sa: 3 },
  ];

  try {
    const results: any[] = [];
    const simulatedIds: string[] = [];

    for (const p of plan) {
      // Find existing match with these teams
      const match = await prisma.match.findFirst({
        where: {
          teamHome: { name: { contains: p.h, mode: 'insensitive' } },
          teamAway: { name: { contains: p.a, mode: 'insensitive' } },
        },
        include: { teamHome: true, teamAway: true },
      });

      if (!match) {
        results.push({ match: `${p.h} vs ${p.a}`, error: 'Partido no encontrado en la BD' });
        continue;
      }

      // Save original state in SystemConfig so cleanup can revert
      await prisma.systemConfig.upsert({
        where: { key: `sim_orig_${match.id}` },
        update: { value: JSON.stringify({ status: match.status, scoreHome: match.scoreHome, scoreAway: match.scoreAway, pointsCalculated: match.pointsCalculated }) },
        create: { key: `sim_orig_${match.id}`, value: JSON.stringify({ status: match.status, scoreHome: match.scoreHome, scoreAway: match.scoreAway, pointsCalculated: match.pointsCalculated }) },
      });

      // Apply simulated result
      await prisma.match.update({
        where: { id: match.id },
        data: { status: 'FINISHED', scoreHome: p.sh, scoreAway: p.sa, pointsCalculated: false },
      });

      // Calculate points using existing user predictions
      await pointsService.recalculateMatch(match.id);

      simulatedIds.push(match.id);
      const preds = await prisma.prediction.count({ where: { matchId: match.id } });
      results.push({ match: `${match.teamHome.name} vs ${match.teamAway.name}`, score: `${p.sh}-${p.sa}`, predictions: preds });
    }

    // Store list of simulated match IDs for cleanup
    await prisma.systemConfig.upsert({
      where: { key: 'simulated_match_ids' },
      update: { value: simulatedIds.join(',') },
      create: { key: 'simulated_match_ids', value: simulatedIds.join(',') },
    });

    res.json({ success: true, results });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/simulate-matches — revert simulated results back to original state
router.delete('/simulate-matches', adminAuth, async (_req, res, next) => {
  try {
    const config = await prisma.systemConfig.findUnique({ where: { key: 'simulated_match_ids' } });
    if (!config?.value) return res.json({ success: true, reverted: 0 });

    const ids = config.value.split(',').filter(Boolean);
    let reverted = 0;

    for (const matchId of ids) {
      const origConfig = await prisma.systemConfig.findUnique({ where: { key: `sim_orig_${matchId}` } });
      if (!origConfig) continue;

      const orig = JSON.parse(origConfig.value);

      // Reverse points from predictions
      const predictions = await prisma.prediction.findMany({
        where: { matchId },
        select: { id: true, userId: true, pointsEarned: true, isExactScore: true, isCorrectResult: true, hasCorrectGoal: true },
      });

      for (const pred of predictions) {
        if (pred.pointsEarned > 0) {
          await prisma.user.update({
            where: { id: pred.userId },
            data: {
              totalPoints:    { decrement: pred.pointsEarned },
              exactScores:    { decrement: pred.isExactScore ? 1 : 0 },
              correctResults: { decrement: pred.isCorrectResult ? 1 : 0 },
              correctGoals:   { decrement: pred.hasCorrectGoal ? 1 : 0 },
            },
          });
        }
        await prisma.prediction.update({
          where: { id: pred.id },
          data: { pointsEarned: 0, pointsExact: 0, pointsResult: 0, pointsGoals: 0, isExactScore: false, isCorrectResult: false, hasCorrectGoal: false },
        });
      }

      // Restore original match state
      await prisma.match.update({
        where: { id: matchId },
        data: { status: orig.status, scoreHome: orig.scoreHome, scoreAway: orig.scoreAway, pointsCalculated: orig.pointsCalculated },
      });

      // Clean up SystemConfig keys
      await prisma.systemConfig.delete({ where: { key: `sim_orig_${matchId}` } });
      reverted++;
    }

    await prisma.systemConfig.delete({ where: { key: 'simulated_match_ids' } });
    res.json({ success: true, reverted });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/test-notify-all — send test notification to all active users (email + Telegram)
router.post('/test-notify-all', adminAuth, async (req: AuthRequest, res, next) => {
  try {
    const { homeTeam = 'México', awayTeam = 'España', hasPrediction = false } = req.body;
    const matchTime = new Date(Date.now() + 60 * 60 * 1000);
    const appUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, email: true, username: true, telegramChatId: true },
    });

    let emailsSent = 0;
    let telegramSent = 0;

    for (const user of users) {
      if (user.email) {
        const sent = await sendMatchReminderEmail({
          to: user.email,
          username: user.username,
          homeTeam,
          awayTeam,
          matchTime,
          hasPrediction,
        });
        if (sent) emailsSent++;
      }

      if (user.telegramChatId) {
        const webhookUrl = process.env.N8N_TELEGRAM_WEBHOOK_URL;
        if (webhookUrl) {
          try {
            await axios.post(webhookUrl, { chatId: user.telegramChatId, username: user.username, homeTeam, awayTeam, matchTime, hasPrediction, appUrl }, { timeout: 5000 });
            telegramSent++;
          } catch (err: any) {
            logger.warn(`⚠️ Telegram test failed for ${user.username}: ${err.message}`);
          }
        }
      }
    }

    logger.info(`🧪 Test notify: ${emailsSent} emails, ${telegramSent} Telegram msgs to ${users.length} users`);
    res.json({ success: true, users: users.length, emailsSent, telegramSent });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/seed-missing-matches — add group-stage matches missing from initial sync
router.post('/seed-missing-matches', adminAuth, async (_req, res, next) => {
  try {
    const missing = [
      {
        apiFootballId: 760484,
        matchNumber: 760484,
        homeTeamName: 'Algeria',
        awayTeamName: 'Austria',
        dateTime: new Date('2026-06-28T02:00:00Z'),
        venue: 'GEHA Field at Arrowhead Stadium',
        city: 'Kansas City',
      },
      {
        apiFootballId: 760483,
        matchNumber: 760483,
        homeTeamName: 'Jordan',
        awayTeamName: 'Argentina',
        dateTime: new Date('2026-06-28T02:00:00Z'),
        venue: 'AT&T Stadium',
        city: 'Arlington',
      },
    ];

    const results = [];
    for (const m of missing) {
      const existing = await prisma.match.findUnique({ where: { apiFootballId: m.apiFootballId } });
      if (existing) { results.push({ match: `${m.homeTeamName} vs ${m.awayTeamName}`, status: 'already exists' }); continue; }

      const home = await prisma.team.findFirst({ where: { name: m.homeTeamName } });
      const away = await prisma.team.findFirst({ where: { name: m.awayTeamName } });
      if (!home || !away) { results.push({ match: `${m.homeTeamName} vs ${m.awayTeamName}`, status: `team not found: ${!home ? m.homeTeamName : m.awayTeamName}` }); continue; }

      await prisma.match.create({
        data: {
          apiFootballId: m.apiFootballId,
          matchNumber: m.matchNumber,
          phase: 'GROUP_STAGE',
          teamHomeId: home.id,
          teamAwayId: away.id,
          dateTime: m.dateTime,
          venue: m.venue,
          city: m.city,
          status: 'SCHEDULED',
        },
      });
      results.push({ match: `${m.homeTeamName} vs ${m.awayTeamName}`, status: 'created' });
    }

    res.json({ success: true, results });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/predictions?matchId=xxx — all predictions (optionally filtered by match)
router.get('/predictions', adminAuth, async (req, res, next) => {
  try {
    const { matchId } = req.query;
    const predictions = await prisma.prediction.findMany({
      where: matchId ? { matchId: String(matchId) } : undefined,
      include: {
        user: { select: { id: true, username: true, email: true } },
        match: {
          include: {
            teamHome: { select: { name: true, code: true, flag: true } },
            teamAway: { select: { name: true, code: true, flag: true } },
          },
        },
      },
      orderBy: [{ match: { dateTime: 'asc' } }, { pointsEarned: 'desc' }],
    });

    // Mark predictions modified after match start time
    const enriched = predictions.map(p => ({
      ...p,
      modifiedAfterStart: p.updatedAt > p.match.dateTime,
    }));

    res.json(enriched);
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/suspicious-predictions — predictions edited after match started
// Two methods combined:
//   1. lastEditedAt (precise): set only when user changes scores, never by points calc
//   2. updatedAt time-window (historical): updatedAt falls within match duration window
//      (points calculation happens after the window, so false positives are excluded)
router.get('/suspicious-predictions', adminAuth, async (_req, res, next) => {
  try {
    const allPredictions = await prisma.prediction.findMany({
      include: {
        user: { select: { id: true, username: true, email: true } },
        match: {
          include: {
            teamHome: { select: { name: true, code: true } },
            teamAway: { select: { name: true, code: true } },
          },
        },
      },
      orderBy: { match: { dateTime: 'desc' } },
    });

    const MATCH_DURATION_MS = 3 * 60 * 60 * 1000; // 3h window covers 90min + extra time + buffer

    const suspicious = allPredictions.filter(p => {
      const matchStart = p.match.dateTime;
      const matchEnd   = new Date(matchStart.getTime() + MATCH_DURATION_MS);

      // Method 1 (precise, future matches): lastEditedAt set after match started
      if (p.lastEditedAt && p.lastEditedAt > matchStart) return true;

      // Method 2 (historical, past matches): updatedAt inside match window
      // Requires the prediction to have existed before match start (createdAt < matchStart)
      // Points calculation runs after matchEnd, so updatedAt inside window = user edit
      if (
        p.createdAt < matchStart &&
        p.updatedAt > matchStart &&
        p.updatedAt < matchEnd
      ) return true;

      return false;
    });

    // Add detection method label for display
    const result = suspicious.map(p => {
      const matchStart = p.match.dateTime;
      const matchEnd   = new Date(matchStart.getTime() + MATCH_DURATION_MS);
      return {
        ...p,
        detectionMethod: p.lastEditedAt && p.lastEditedAt > matchStart
          ? 'exacto'
          : 'ventana-tiempo',
        editedAt: p.lastEditedAt ?? p.updatedAt,
      };
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/predictions/:id — nullify a single prediction (reset to 0-0, no points)
router.delete('/predictions/:id', adminAuth, async (req, res, next) => {
  try {
    const prediction = await prisma.prediction.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });
    if (!prediction) return res.status(404).json({ error: 'Predicción no encontrada' });

    // Reverse any points already earned
    if (prediction.pointsEarned > 0) {
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

    await prisma.prediction.delete({ where: { id: req.params.id } });
    logger.info(`🚫 Predicción anulada: ${prediction.user.username} (matchId=${prediction.matchId})`);
    res.json({ success: true, message: `Predicción de ${prediction.user.username} anulada` });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/predictions/export — CSV of all predictions
router.get('/predictions/export', adminAuth, async (_req, res, next) => {
  try {
    const predictions = await prisma.prediction.findMany({
      include: {
        user: { select: { username: true, email: true } },
        match: {
          include: {
            teamHome: { select: { name: true } },
            teamAway: { select: { name: true } },
          },
        },
      },
      orderBy: [{ match: { dateTime: 'asc' } }, { pointsEarned: 'desc' }],
    });

    const header = ['Partido','Fecha','Jugador','Email','Pred_Local','Pred_Visitante','Goles_Real_Local','Goles_Real_Visitante','Puntos','Exacto','Resultado','Goles'];
    const rows = predictions.map(p => [
      `${p.match.teamHome.name} vs ${p.match.teamAway.name}`,
      new Date(p.match.dateTime).toISOString().slice(0, 10),
      p.user.username,
      p.user.email,
      p.predictedHome,
      p.predictedAway,
      p.match.scoreHome ?? '',
      p.match.scoreAway ?? '',
      p.pointsEarned,
      p.pointsExact,
      p.pointsResult,
      p.pointsGoals,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    const bom = '﻿';
    const csv = bom + [header.join(','), ...rows].join('\r\n');
    const filename = `predicciones_scorecast_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

export default router;
