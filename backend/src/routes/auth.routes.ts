import { Router } from 'express';
import passport from 'passport';
import { z } from 'zod';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import authService from '../services/auth.service';
import { auth, AuthRequest } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';
import { prisma } from '../config/database';
import bcrypt from 'bcryptjs';

const router = Router();

// ─── Link Telegram (called by n8n, not the browser) ──────────────────────────
router.post('/link-telegram', async (req, res, next) => {
  try {
    const { username, chatId, secret } = req.body;
    if (!secret || secret !== process.env.N8N_SECRET) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const user = await prisma.user.findFirst({ where: { username } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado en SCORECAST' });
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: String(chatId) } });
    res.json({ success: true, message: `✅ ¡Listo! Telegram conectado para ${username}` });
  } catch (error) {
    next(error);
  }
});

// ─── Token validation ────────────────────────────────────────────────────────
router.get('/validate-token/:code', authLimiter, async (req, res, next) => {
  try {
    const result = await authService.validateInvitationToken(req.params.code);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ─── Login with email/password (admin) ───────────────────────────────────────
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(1),
      totpCode: z.string().optional(),
    });
    const { email, password, totpCode } = schema.parse(req.body);
    const result = await authService.loginWithCredentials(email, password);

    // Check 2FA
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: result.user.id },
        select: { twoFactorEnabled: true, twoFactorSecret: true },
      });
      if (dbUser?.twoFactorEnabled && dbUser.twoFactorSecret) {
        if (!totpCode) return res.status(200).json({ requires2FA: true });
        const valid = authenticator.verify({ token: totpCode, secret: dbUser.twoFactorSecret });
        if (!valid) return res.status(401).json({ error: 'Código 2FA incorrecto' });
      }
    } catch {
      // Si el cliente Prisma no tiene los campos 2FA, continuar sin verificar
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ─── Google OAuth — registro con token ───────────────────────────────────────
router.get('/google', authLimiter, (req, res, next) => {
  const { token } = req.query;
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: `register:${token as string}`,
  })(req, res, next);
});

// ─── Google OAuth — login existentes ─────────────────────────────────────────
router.get('/google/login', authLimiter, (req, res, next) => {
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: 'login',
  })(req, res, next);
});

// ─── Google OAuth — callback ──────────────────────────────────────────────────
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/auth/failed' }),
  async (req: any, res) => {
    const user = req.user;
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { sessionVersion: { increment: 1 } },
      select: { sessionVersion: true },
    });
    const jwtToken = authService.generateJWT({ ...user, sessionVersion: updated.sessionVersion });
    const sanitized = authService.sanitizeUser(user);
    const params = new URLSearchParams({ token: jwtToken, user: JSON.stringify(sanitized) });
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?${params}`);
  }
);

router.get('/failed', (_req, res) => {
  res.redirect(`${process.env.FRONTEND_URL}/auth/error`);
});

// ─── Get current user ─────────────────────────────────────────────────────────
router.get('/me', auth, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        totalPoints: true,
        exactScores: true,
        correctResults: true,
        correctGoals: true,
        championPrediction: true,
        championOdds: true,
        twoFactorEnabled: true,
        oauthProvider: true,
        whatsappNumber: true,
        telegramChatId: true,
        createdAt: true,
      },
    });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

// ─── Update profile (email / username) ───────────────────────────────────────
router.put('/update-profile', auth, async (req: AuthRequest, res, next) => {
  try {
    const schema = z.object({
      username: z.string().min(3).max(30).optional(),
      email: z.string().email().optional(),
      whatsappNumber: z.string().max(20).optional().nullable(),
    });
    const data = schema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data,
      select: { id: true, username: true, email: true, role: true },
    });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

// ─── Change password ──────────────────────────────────────────────────────────
router.put('/change-password', auth, async (req: AuthRequest, res, next) => {
  try {
    const schema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(100),
    });
    const { currentPassword, newPassword } = schema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { passwordHash: true },
    });

    if (!user?.passwordHash) {
      return res.status(400).json({ error: 'Tu cuenta no tiene contraseña (usa Google para iniciar sesión)' });
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: req.user!.id }, data: { passwordHash: hash } });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ─── 2FA: generate setup QR ───────────────────────────────────────────────────
router.get('/2fa/setup', auth, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { email: true, twoFactorEnabled: true },
    });

    if (user?.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA ya está activado' });
    }

    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user!.email, 'SCORECAST', secret);
    const qrDataUrl = await QRCode.toDataURL(otpauth);

    // Store secret temporarily (not enabled yet until user verifies)
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { twoFactorSecret: secret },
    });

    res.json({ secret, qrDataUrl });
  } catch (error) {
    next(error);
  }
});

// ─── 2FA: enable (verify first code) ─────────────────────────────────────────
router.post('/2fa/enable', auth, async (req: AuthRequest, res, next) => {
  try {
    const { code } = z.object({ code: z.string().length(6) }).parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });

    if (!user?.twoFactorSecret) {
      return res.status(400).json({ error: 'Primero genera el QR de configuración' });
    }
    if (user.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA ya está activado' });
    }

    const valid = authenticator.verify({ token: code, secret: user.twoFactorSecret });
    if (!valid) {
      return res.status(401).json({ error: 'Código incorrecto. Verifica que tu app esté sincronizada.' });
    }

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { twoFactorEnabled: true },
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ─── 2FA: disable ────────────────────────────────────────────────────────────
router.post('/2fa/disable', auth, async (req: AuthRequest, res, next) => {
  try {
    const { code } = z.object({ code: z.string().length(6) }).parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });

    if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({ error: '2FA no está activado' });
    }

    const valid = authenticator.verify({ token: code, secret: user.twoFactorSecret });
    if (!valid) {
      return res.status(401).json({ error: 'Código incorrecto' });
    }

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ─── Champion prediction (one-time) ──────────────────────────────────────────
router.put('/champion', auth, async (req: AuthRequest, res, next) => {
  try {
    const { teamCode } = z.object({ teamCode: z.string().length(3) }).parse(req.body);

    const config = await prisma.systemConfig.findUnique({ where: { key: 'champion_locked' } });
    if (config?.value === 'true') {
      return res.status(400).json({ error: 'La predicción del campeón está cerrada' });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { championPredictedAt: true },
    });
    if (currentUser?.championPredictedAt) {
      return res.status(400).json({ error: 'Ya realizaste tu predicción del campeón. No puede modificarse.' });
    }

    const team = await prisma.team.findUnique({ where: { code: teamCode } });
    if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { championPrediction: teamCode, championPredictedAt: new Date(), championOdds: team.championOdds },
      select: { championPrediction: true, championOdds: true, championPredictedAt: true },
    });

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// ─── Notifications ────────────────────────────────────────────────────────────
router.get('/notifications', auth, async (req: AuthRequest, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json(notifications);
  } catch (error) {
    next(error);
  }
});

router.put('/notifications/read', auth, async (req: AuthRequest, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/notifications', auth, async (req: AuthRequest, res, next) => {
  try {
    const { count } = await prisma.notification.deleteMany({
      where: { userId: req.user!.id },
    });
    res.json({ success: true, deleted: count });
  } catch (error) {
    next(error);
  }
});

export default router;
