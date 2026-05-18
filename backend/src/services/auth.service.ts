import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

class AuthService {
  generateJWT(user: { id: string; username: string; email: string; role: string }) {
    return jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
  }

  async validateInvitationToken(code: string) {
    const token = await prisma.invitationToken.findUnique({ where: { code } });

    if (!token) return { valid: false, message: 'Token no encontrado' };
    if (!token.isActive) return { valid: false, message: 'Token desactivado' };
    if (token.expiresAt && token.expiresAt < new Date())
      return { valid: false, message: 'Token expirado' };
    if (token.maxUses !== -1 && token.currentUses >= token.maxUses)
      return { valid: false, message: 'Token agotado' };

    return {
      valid: true,
      token: {
        id: token.id,
        code: token.code,
        usesRemaining: token.maxUses === -1 ? 'Ilimitado' : token.maxUses - token.currentUses,
        expiresAt: token.expiresAt,
      },
    };
  }

  async loginWithCredentials(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true, username: true, email: true, role: true,
        isActive: true, passwordHash: true,
        totalPoints: true, exactScores: true, correctResults: true,
        correctGoals: true, championPrediction: true, championOdds: true,
        oauthProvider: true, lastLoginAt: true, createdAt: true,
      },
    });

    if (!user || !user.isActive) {
      throw new Error('Credenciales inválidas');
    }

    if (!user.passwordHash) {
      throw new Error('Esta cuenta usa OAuth. Usa Google para iniciar sesión.');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new Error('Credenciales inválidas');

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = this.generateJWT(user);
    logger.info(`✅ User logged in: ${user.username}`);

    return { token, user: this.sanitizeUser(user) };
  }

  sanitizeUser(user: any) {
    const { passwordHash, googleId, microsoftId, ...safe } = user;
    return safe;
  }
}

export default new AuthService();
