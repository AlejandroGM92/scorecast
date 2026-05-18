import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import passport from 'passport';
import morgan from 'morgan';

import { connectDatabase, disconnectDatabase } from './config/database';
import { configurePassport } from './config/passport';
import { generalLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import { startAllJobs } from './jobs';
import { logger } from './utils/logger';

import authRoutes from './routes/auth.routes';
import matchesRoutes from './routes/matches.routes';
import predictionsRoutes from './routes/predictions.routes';
import leaderboardRoutes from './routes/leaderboard.routes';
import adminRoutes from './routes/admin.routes';
import teamsRoutes from './routes/teams.routes';

const app = express();
const PORT = process.env.PORT || 3002;

// Security
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session (required for OAuth)
app.use(
  session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

// Passport
configurePassport();
app.use(passport.initialize());
app.use(passport.session());

// Rate limiting
app.use(generalLimiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/predictions', predictionsRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/teams', teamsRoutes);

// Error handler (must be last)
app.use(errorHandler);

async function bootstrap() {
  await connectDatabase();
  startAllJobs();

  app.listen(PORT, () => {
    logger.info(`🚀 SCORECAST backend running on http://localhost:${PORT}`);
    logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

bootstrap();

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');
  await disconnectDatabase();
  process.exit(0);
});
