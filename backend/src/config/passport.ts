import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from './database';
import { logger } from '../utils/logger';

// Microsoft OAuth can be added later by installing passport-microsoft manually

export function configurePassport() {
  // Google OAuth
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: process.env.GOOGLE_CALLBACK_URL!,
        passReqToCallback: true,
      },
      async (req: any, _accessToken, _refreshToken, profile, done) => {
        try {
          const state = req.query.state as string;
          const isLoginOnly = state === 'login';
          const tokenCode = state?.startsWith('register:') ? state.replace('register:', '') : null;

          const email = profile.emails?.[0]?.value;
          if (!email) return done(new Error('No se pudo obtener el email de Google'));

          const avatarUrl = profile.photos?.[0]?.value ?? null;

          // Check if user already exists
          const existingUser = await prisma.user.findFirst({
            where: { OR: [{ googleId: profile.id }, { email }] },
          });

          if (existingUser) {
            const updated = await prisma.user.update({
              where: { id: existingUser.id },
              data: { lastLoginAt: new Date(), ...(avatarUrl ? { avatarUrl } : {}) },
            });
            return done(null, updated);
          }

          // Login-only flow: user doesn't exist → error
          if (isLoginOnly) {
            return done(new Error('No tienes cuenta. Usa el link de invitación para registrarte.'));
          }

          // Registration flow: validate invitation token
          if (!tokenCode) {
            return done(new Error('Se requiere token de invitación para registrarse'));
          }

          const token = await prisma.invitationToken.findUnique({
            where: { code: tokenCode },
          });

          if (!token || !token.isActive) return done(new Error('Token de invitación inválido'));
          if (token.expiresAt && token.expiresAt < new Date()) return done(new Error('Token expirado'));
          if (token.maxUses !== -1 && token.currentUses >= token.maxUses) return done(new Error('Token agotado'));

          const username = (profile.displayName || email.split('@')[0])
            .replace(/[^a-zA-Z0-9_]/g, '_')
            .substring(0, 30);

          const user = await prisma.user.create({
            data: {
              username,
              email,
              googleId: profile.id,
              oauthProvider: 'google',
              invitationTokenId: token.id,
              lastLoginAt: new Date(),
              avatarUrl,
            },
          });

          await prisma.invitationToken.update({
            where: { id: token.id },
            data: { currentUses: { increment: 1 } },
          });

          logger.info(`✅ New user via Google: ${user.username}`);
          return done(null, user);
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { id } });
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  logger.info('✅ Passport configured');
}
