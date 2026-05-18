# SCORECAST - World Cup 2026 Prediction Platform

## Skill Overview

This skill guides the development of **SCORECAST**, a professional web application for FIFA World Cup 2026 predictions with real-time score updates, automatic points calculation, and OAuth-based registration with invitation tokens.

### Key Features
- 🎫 Invitation-token gated registration (Google/Microsoft OAuth)
- ⚽ Real-time match scores via API-Football
- 🏆 Automatic points calculation when matches finish
- 📊 Live leaderboard with tie-breaking system
- 📱 Mobile-first responsive design (React Native ready)
- 👥 Supports 100 concurrent users
- 🎨 Modern glassmorphism UI

---

## Table of Contents

1. [Project Architecture](#project-architecture)
2. [Database Schema](#database-schema)
3. [Backend Services](#backend-services)
4. [Authentication System](#authentication-system)
5. [Points Calculation Engine](#points-calculation-engine)
6. [API Routes](#api-routes)
7. [Frontend Components](#frontend-components)
8. [Cron Jobs](#cron-jobs)
9. [Deployment Guide](#deployment-guide)
10. [Code Examples](#code-examples)

---

## Project Architecture

### Tech Stack

**Frontend:**
```
- React 18 + TypeScript
- Vite (build tool)
- React Router v6
- Tailwind CSS + shadcn/ui
- Zustand (state management)
- TanStack Query v5 (data fetching)
- React Hook Form + Zod
- Recharts (charts)
- date-fns (dates)
```

**Backend:**
```
- Node.js 20 + TypeScript
- Express.js
- Prisma ORM
- PostgreSQL 15+
- Passport.js (OAuth)
- JWT + bcrypt
- node-cron (scheduled jobs)
- axios (API-Football client)
- winston (logging)
```

**External API:**
```
- API-Football (https://www.api-football.com/)
- Free tier: 100 requests/day
- Endpoints: fixtures, teams, live scores, statistics
```

### Folder Structure

```
scorecast/
├── packages/
│   ├── shared/                    # Shared code (web + mobile future)
│   │   ├── types/
│   │   │   └── index.ts          # TypeScript interfaces
│   │   ├── constants/
│   │   │   ├── theme.ts          # Design tokens
│   │   │   └── odds.ts           # Champion odds
│   │   └── utils/
│   │       └── validators.ts     # Zod schemas
│   │
│   └── web/                       # React web app
│       ├── src/
│       │   ├── components/
│       │   │   ├── ui/           # shadcn components
│       │   │   ├── layout/
│       │   │   ├── auth/
│       │   │   ├── matches/
│       │   │   ├── leaderboard/
│       │   │   └── admin/
│       │   ├── pages/
│       │   ├── hooks/
│       │   ├── services/
│       │   ├── store/
│       │   └── utils/
│       └── package.json
│
└── backend/
    ├── src/
    │   ├── config/
    │   │   ├── database.ts       # Prisma client
    │   │   ├── passport.ts       # OAuth strategies
    │   │   └── apiFootball.ts    # API client
    │   ├── middleware/
    │   │   ├── auth.ts
    │   │   ├── rateLimiter.ts
    │   │   └── errorHandler.ts
    │   ├── services/
    │   │   ├── apiFootball.service.ts
    │   │   ├── sync.service.ts
    │   │   ├── auth.service.ts
    │   │   ├── points.service.ts      # 🔥 AUTO POINTS
    │   │   └── leaderboard.service.ts
    │   ├── routes/
    │   ├── jobs/
    │   │   ├── syncLiveScores.job.ts
    │   │   ├── calculatePoints.job.ts  # 🔥 AUTO CALC
    │   │   └── lockMatches.job.ts
    │   └── utils/
    ├── prisma/
    │   ├── schema.prisma
    │   └── seed.ts
    └── package.json
```

---

## Database Schema

### Complete Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================
// USERS & AUTHENTICATION
// ============================================

model User {
  id              String    @id @default(cuid())
  username        String    @unique @db.VarChar(30)
  email           String    @unique @db.VarChar(100)
  passwordHash    String    @default("") // Empty for OAuth users
  role            UserRole  @default(PLAYER)
  isActive        Boolean   @default(true)
  
  // OAuth
  googleId        String?   @unique
  microsoftId     String?   @unique
  oauthProvider   String?   // "google" | "microsoft"
  
  // Invitation token
  invitationTokenId String?
  invitationToken   InvitationToken? @relation("TokenUser", fields: [invitationTokenId], references: [id])
  
  // Champion prediction
  championPrediction  String?   // Team code: "BRA", "ARG"
  championPredictedAt DateTime?
  championOdds        Float?
  
  // Cached stats (for performance)
  totalPoints     Int       @default(0)
  exactScores     Int       @default(0)  // Tiebreaker 1
  correctResults  Int       @default(0)  // Tiebreaker 2
  correctGoals    Int       @default(0)  // Tiebreaker 3
  
  // Relations
  predictions     Prediction[]
  createdTokens   InvitationToken[] @relation("TokenCreator")
  
  // Metadata
  lastLoginAt     DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@index([totalPoints(sort: Desc)])
  @@index([username])
}

enum UserRole {
  ADMIN
  PLAYER
}

// ============================================
// INVITATION TOKENS
// ============================================

model InvitationToken {
  id          String    @id @default(cuid())
  code        String    @unique @db.VarChar(12) // "SC26-A7K9"
  
  // Configuration
  maxUses     Int       @default(1)  // -1 = unlimited
  currentUses Int       @default(0)
  expiresAt   DateTime?
  isActive    Boolean   @default(true)
  
  // Relations
  createdById String
  createdBy   User      @relation("TokenCreator", fields: [createdById], references: [id])
  usedBy      User[]    @relation("TokenUser")
  
  description String?   @db.VarChar(100)
  
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  @@index([code])
  @@index([isActive])
}

// ============================================
// TEAMS
// ============================================

model Team {
  id              String    @id @default(cuid())
  apiFootballId   Int       @unique
  
  name            String    @db.VarChar(100)
  nameEn          String    @db.VarChar(100)
  code            String    @unique @db.VarChar(3) // ISO 3166-1 alpha-3
  flag            String    // URL
  group           String?   @db.VarChar(1) // A-P (16 groups)
  
  // Champion odds (from betting data)
  championOdds    Float
  
  // Group stage stats (auto-calculated)
  played          Int       @default(0)
  won             Int       @default(0)
  drawn           Int       @default(0)
  lost            Int       @default(0)
  goalsFor        Int       @default(0)
  goalsAgainst    Int       @default(0)
  goalDifference  Int       @default(0)
  points          Int       @default(0)
  
  homeMatches     Match[]   @relation("HomeTeam")
  awayMatches     Match[]   @relation("AwayTeam")
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@index([group])
  @@index([points(sort: Desc)])
}

// ============================================
// MATCHES
// ============================================

model Match {
  id              String       @id @default(cuid())
  apiFootballId   Int          @unique
  
  // Identification
  phase           MatchPhase
  matchNumber     Int
  round           String?      @db.VarChar(50)
  
  // Teams
  teamHomeId      String
  teamAwayId      String
  teamHome        Team         @relation("HomeTeam", fields: [teamHomeId], references: [id])
  teamAway        Team         @relation("AwayTeam", fields: [teamAwayId], references: [id])
  
  // Schedule
  dateTime        DateTime
  venue           String?      @db.VarChar(100)
  city            String?      @db.VarChar(50)
  timezone        String       @default("America/Mexico_City")
  
  // Scores
  scoreHome       Int?
  scoreAway       Int?
  scoreHomeET     Int?         // Extra time
  scoreAwayET     Int?
  scoreHomePen    Int?         // Penalties (for classification only)
  scoreAwayPen    Int?
  
  // Status
  status          MatchStatus  @default(SCHEDULED)
  minute          Int?
  
  // Sync control
  lastSyncAt      DateTime?
  syncErrorCount  Int          @default(0)
  pointsCalculated Boolean     @default(false) // 🔥 NEW: Flag to prevent duplicate calculations
  
  predictions     Prediction[]
  
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  
  @@index([dateTime])
  @@index([status])
  @@index([phase, matchNumber])
  @@index([pointsCalculated]) // 🔥 NEW: For efficient queries
}

enum MatchPhase {
  GROUP_STAGE
  ROUND_OF_16
  QUARTER_FINALS
  SEMI_FINALS
  THIRD_PLACE
  FINAL
}

enum MatchStatus {
  SCHEDULED
  LOCKED          // 20 minutes before start
  LIVE
  HALFTIME
  FINISHED
  POSTPONED
  CANCELLED
}

// ============================================
// PREDICTIONS
// ============================================

model Prediction {
  id              String    @id @default(cuid())
  
  userId          String
  matchId         String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  match           Match     @relation(fields: [matchId], references: [id], onDelete: Cascade)
  
  // User's prediction
  predictedHome   Int       @db.SmallInt
  predictedAway   Int       @db.SmallInt
  
  // Points (calculated automatically when match finishes)
  pointsEarned    Int       @default(0)
  pointsExact     Int       @default(0)  // 3 points
  pointsResult    Int       @default(0)  // 2 points
  pointsGoals     Int       @default(0)  // 1 point
  
  // Flags for tiebreakers
  isExactScore    Boolean   @default(false)
  isCorrectResult Boolean   @default(false)
  hasCorrectGoal  Boolean   @default(false)
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@unique([userId, matchId])
  @@index([userId])
  @@index([matchId])
  @@index([pointsEarned(sort: Desc)])
}

// ============================================
// API USAGE TRACKING
// ============================================

model ApiUsageLog {
  id              String    @id @default(cuid())
  
  endpoint        String    @db.VarChar(100)
  method          String    @db.VarChar(10)
  statusCode      Int?
  responseTime    Int?      // milliseconds
  
  date            DateTime  @default(now()) @db.Date
  requestCount    Int       @default(1)
  
  errorMessage    String?   @db.Text
  
  createdAt       DateTime  @default(now())
  
  @@unique([endpoint, date])
  @@index([date])
}

// ============================================
// SYSTEM CONFIGURATION
// ============================================

model SystemConfig {
  id          String    @id @default(cuid())
  key         String    @unique @db.VarChar(50)
  value       String    @db.Text
  description String?   @db.Text
  updatedAt   DateTime  @updatedAt
}

// ============================================
// NOTIFICATIONS (Optional)
// ============================================

model Notification {
  id        String           @id @default(cuid())
  userId    String
  type      NotificationType
  title     String           @db.VarChar(200)
  message   String           @db.Text
  isRead    Boolean          @default(false)
  readAt    DateTime?
  metadata  Json?
  createdAt DateTime         @default(now())
  
  @@index([userId, isRead])
  @@index([createdAt(sort: Desc)])
}

enum NotificationType {
  MATCH_STARTING
  MATCH_LOCKED
  MATCH_FINISHED
  POINTS_EARNED
  LEADERBOARD_UP
  PHASE_UNLOCKED
}
```

---

## Backend Services

### 1. Points Calculation Service (🔥 AUTO-UPDATE)

```typescript
// src/services/points.service.ts

import { prisma } from '../config/database';
import { logger } from '../utils/logger';

interface PointsBreakdown {
  exact: number;    // 3 points
  result: number;   // 2 points
  goals: number;    // 1 point
  total: number;
}

class PointsService {
  
  /**
   * 🔥 AUTOMATIC POINTS CALCULATION
   * Called by cron job when matches finish
   */
  async calculatePointsForFinishedMatches(): Promise<void> {
    logger.info('🔄 Starting automatic points calculation...');

    // Find recently finished matches that haven't had points calculated yet
    const finishedMatches = await prisma.match.findMany({
      where: {
        status: 'FINISHED',
        pointsCalculated: false, // 🔥 Only unprocessed matches
        scoreHome: { not: null },
        scoreAway: { not: null }
      },
      include: {
        predictions: {
          include: {
            user: true
          }
        },
        teamHome: true,
        teamAway: true
      }
    });

    if (finishedMatches.length === 0) {
      logger.info('ℹ️ No finished matches to process');
      return;
    }

    logger.info(`📊 Processing ${finishedMatches.length} finished match(es)`);

    for (const match of finishedMatches) {
      try {
        await this.processMatchPoints(match);
      } catch (error) {
        logger.error(`❌ Error processing match ${match.id}:`, error);
        // Continue with next match
      }
    }

    logger.info('✅ Automatic points calculation completed');
  }

  /**
   * Process points for a single match
   */
  private async processMatchPoints(match: any): Promise<void> {
    const { scoreHome, scoreAway, predictions } = match;

    logger.info(`🧮 Calculating points for: ${match.teamHome.name} ${scoreHome}-${scoreAway} ${match.teamAway.name}`);

    // Use transaction for consistency
    await prisma.$transaction(async (tx) => {
      
      for (const prediction of predictions) {
        const points = this.calculatePoints(
          prediction.predictedHome,
          prediction.predictedAway,
          scoreHome!,
          scoreAway!
        );

        // Update prediction with points
        await tx.prediction.update({
          where: { id: prediction.id },
          data: {
            pointsEarned: points.total,
            pointsExact: points.exact,
            pointsResult: points.result,
            pointsGoals: points.goals,
            isExactScore: points.exact > 0,
            isCorrectResult: points.result > 0,
            hasCorrectGoal: points.goals > 0
          }
        });

        // Update user's cached stats
        await tx.user.update({
          where: { id: prediction.userId },
          data: {
            totalPoints: { increment: points.total },
            exactScores: { increment: points.exact > 0 ? 1 : 0 },
            correctResults: { increment: points.result > 0 ? 1 : 0 },
            correctGoals: { increment: points.goals > 0 ? 1 : 0 }
          }
        });

        // Create notification (optional)
        if (points.total > 0) {
          await tx.notification.create({
            data: {
              userId: prediction.userId,
              type: 'POINTS_EARNED',
              title: '¡Puntos ganados!',
              message: `Ganaste ${points.total} puntos en ${match.teamHome.name} vs ${match.teamAway.name}`,
              metadata: {
                matchId: match.id,
                points: points.total,
                breakdown: points
              }
            }
          });
        }

        logger.info(`  ✓ User ${prediction.user.username}: ${points.total} points`);
      }

      // Mark match as processed
      await tx.match.update({
        where: { id: match.id },
        data: { pointsCalculated: true }
      });
      
    });

    logger.info(`✅ Match ${match.id} processed: ${predictions.length} predictions updated`);
  }

  /**
   * Core points calculation logic
   */
  private calculatePoints(
    predHome: number,
    predAway: number,
    realHome: number,
    realAway: number
  ): PointsBreakdown {
    
    let exact = 0;
    let result = 0;
    let goals = 0;

    // 1. Exact score (3 points)
    if (predHome === realHome && predAway === realAway) {
      exact = 3;
    }

    // 2. Correct result (2 points)
    const predResult = predHome > predAway ? 'H' : predHome < predAway ? 'A' : 'D';
    const realResult = realHome > realAway ? 'H' : realHome < realAway ? 'A' : 'D';
    
    if (predResult === realResult) {
      result = 2;
    }

    // 3. Correct goals for one team (1 point)
    if (predHome === realHome || predAway === realAway) {
      goals = 1;
    }

    return {
      exact,
      result,
      goals,
      total: exact + result + goals
    };
  }

  /**
   * Manual recalculation (admin only)
   */
  async recalculateMatch(matchId: string): Promise<void> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        predictions: { include: { user: true } },
        teamHome: true,
        teamAway: true
      }
    });

    if (!match) {
      throw new Error('Match not found');
    }

    if (match.status !== 'FINISHED') {
      throw new Error('Match is not finished');
    }

    // Reset points calculated flag
    await prisma.match.update({
      where: { id: matchId },
      data: { pointsCalculated: false }
    });

    // Recalculate
    await this.processMatchPoints(match);
  }

  /**
   * Calculate champion prediction points (called at tournament end)
   */
  async calculateChampionPoints(winnerCode: string): Promise<void> {
    logger.info(`🏆 Calculating champion prediction points for ${winnerCode}`);

    const users = await prisma.user.findMany({
      where: {
        championPrediction: winnerCode,
        championOdds: { not: null }
      }
    });

    for (const user of users) {
      const bonusPoints = Math.round(user.championOdds! * 10); // Multiply odds by 10

      await prisma.user.update({
        where: { id: user.id },
        data: {
          totalPoints: { increment: bonusPoints }
        }
      });

      await prisma.notification.create({
        data: {
          userId: user.id,
          type: 'POINTS_EARNED',
          title: '¡Acertaste el campeón!',
          message: `Ganaste ${bonusPoints} puntos por predecir correctamente al campeón del mundial`,
          metadata: { champion: winnerCode, points: bonusPoints }
        }
      });

      logger.info(`  ✓ User ${user.username}: +${bonusPoints} bonus points`);
    }
  }
}

export default new PointsService();
```

### 2. API Football Service

```typescript
// src/services/apiFootball.service.ts

import axios, { AxiosInstance } from 'axios';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

interface ApiFootballResponse<T> {
  get: string;
  parameters: Record<string, any>;
  errors: any[];
  results: number;
  paging: { current: number; total: number };
  response: T[];
}

class ApiFootballService {
  private client: AxiosInstance;
  private dailyLimit = 100;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.API_FOOTBALL_BASE_URL,
      headers: {
        'x-apisports-key': process.env.API_FOOTBALL_KEY!,
        'x-apisports-host': 'v3.football.api-sports.io'
      },
      timeout: 10000
    });
  }

  async checkDailyLimit(): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0];
    const usage = await prisma.apiUsageLog.findUnique({
      where: {
        endpoint_date: {
          endpoint: 'DAILY_TOTAL',
          date: new Date(today)
        }
      }
    });

    return (usage?.requestCount || 0) < this.dailyLimit;
  }

  async logApiUsage(endpoint: string, statusCode: number, responseTime: number) {
    const today = new Date().toISOString().split('T')[0];

    await prisma.apiUsageLog.upsert({
      where: {
        endpoint_date: { endpoint, date: new Date(today) }
      },
      update: {
        requestCount: { increment: 1 },
        statusCode,
        responseTime
      },
      create: {
        endpoint,
        date: new Date(today),
        requestCount: 1,
        statusCode,
        responseTime
      }
    });

    // Update daily total
    await prisma.apiUsageLog.upsert({
      where: {
        endpoint_date: { endpoint: 'DAILY_TOTAL', date: new Date(today) }
      },
      update: { requestCount: { increment: 1 } },
      create: {
        endpoint: 'DAILY_TOTAL',
        date: new Date(today),
        requestCount: 1,
        statusCode: 200
      }
    });
  }

  async getLiveMatches(): Promise<any[]> {
    if (!(await this.checkDailyLimit())) {
      logger.warn('⚠️ API daily limit reached');
      return [];
    }

    const startTime = Date.now();

    try {
      const response = await this.client.get<ApiFootballResponse<any>>('/fixtures', {
        params: {
          league: process.env.WORLD_CUP_LEAGUE_ID,
          season: process.env.WORLD_CUP_SEASON,
          live: 'all'
        }
      });

      await this.logApiUsage('/fixtures/live', response.status, Date.now() - startTime);
      return response.data.response;
    } catch (error: any) {
      await this.logApiUsage('/fixtures/live', error.response?.status || 500, Date.now() - startTime);
      logger.error('❌ Error fetching live matches', error);
      return [];
    }
  }

  async getMatchStatistics(fixtureId: number): Promise<any> {
    if (!(await this.checkDailyLimit())) {
      throw new Error('API daily limit exceeded');
    }

    const startTime = Date.now();

    try {
      const response = await this.client.get<ApiFootballResponse<any>>('/fixtures/statistics', {
        params: { fixture: fixtureId }
      });

      await this.logApiUsage('/fixtures/statistics', response.status, Date.now() - startTime);
      return response.data.response[0];
    } catch (error: any) {
      await this.logApiUsage('/fixtures/statistics', error.response?.status || 500, Date.now() - startTime);
      throw error;
    }
  }
}

export default new ApiFootballService();
```

### 3. Sync Service

```typescript
// src/services/sync.service.ts

import { prisma } from '../config/database';
import apiFootballService from './apiFootball.service';
import pointsService from './points.service';
import { logger } from '../utils/logger';
import { MatchStatus } from '@prisma/client';

class SyncService {
  
  /**
   * Update live scores (called by cron every 5 minutes)
   */
  async updateLiveScores(): Promise<void> {
    logger.info('🔴 Updating live scores...');

    const liveMatches = await apiFootballService.getLiveMatches();

    if (liveMatches.length === 0) {
      logger.info('ℹ️ No live matches');
      return;
    }

    for (const match of liveMatches) {
      const statusShort = match.fixture.status.short;
      const newStatus = this.mapStatus(statusShort);

      await prisma.match.update({
        where: { apiFootballId: match.fixture.id },
        data: {
          scoreHome: match.goals.home,
          scoreAway: match.goals.away,
          minute: match.fixture.status.elapsed,
          status: newStatus,
          lastSyncAt: new Date()
        }
      });

      logger.info(`  ✓ ${match.teams.home.name} ${match.goals.home}-${match.goals.away} ${match.teams.away.name} (${match.fixture.status.elapsed}')`);
    }

    // 🔥 AUTOMATIC: Calculate points for newly finished matches
    await pointsService.calculatePointsForFinishedMatches();
  }

  private mapStatus(apiStatus: string): MatchStatus {
    const map: Record<string, MatchStatus> = {
      'TBD': 'SCHEDULED',
      'NS': 'SCHEDULED',
      '1H': 'LIVE',
      'HT': 'HALFTIME',
      '2H': 'LIVE',
      'ET': 'LIVE',
      'P': 'LIVE',
      'FT': 'FINISHED',
      'AET': 'FINISHED',
      'PEN': 'FINISHED',
      'PST': 'POSTPONED',
      'CANC': 'CANCELLED'
    };

    return map[apiStatus] || 'SCHEDULED';
  }
}

export default new SyncService();
```

---

## Authentication System

### OAuth Service

```typescript
// src/services/auth.service.ts

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

class AuthService {
  
  configureOAuth() {
    // Google OAuth
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
      passReqToCallback: true
    }, async (req: any, accessToken, refreshToken, profile, done) => {
      try {
        const tokenId = req.query.state; // Token ID passed in state
        
        const user = await this.findOrCreateOAuthUser({
          provider: 'google',
          providerId: profile.id,
          email: profile.emails?.[0]?.value!,
          username: profile.displayName,
          invitationTokenId: tokenId
        });
        
        done(null, user);
      } catch (error) {
        done(error);
      }
    }));

    // Microsoft OAuth
    passport.use(new MicrosoftStrategy({
      clientID: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      callbackURL: process.env.MICROSOFT_CALLBACK_URL!,
      scope: ['user.read'],
      passReqToCallback: true
    }, async (req: any, accessToken, refreshToken, profile, done) => {
      try {
        const tokenId = req.query.state;
        
        const user = await this.findOrCreateOAuthUser({
          provider: 'microsoft',
          providerId: profile.id,
          email: profile.emails?.[0]?.value!,
          username: profile.displayName,
          invitationTokenId: tokenId
        });
        
        done(null, user);
      } catch (error) {
        done(error);
      }
    }));
  }

  private async findOrCreateOAuthUser(data: {
    provider: 'google' | 'microsoft';
    providerId: string;
    email: string;
    username: string;
    invitationTokenId: string;
  }) {
    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { googleId: data.provider === 'google' ? data.providerId : undefined },
          { microsoftId: data.provider === 'microsoft' ? data.providerId : undefined },
          { email: data.email }
        ]
      }
    });

    if (existingUser) {
      return existingUser;
    }

    // Validate invitation token
    const token = await prisma.invitationToken.findUnique({
      where: { id: data.invitationTokenId }
    });

    if (!token || !token.isActive) {
      throw new Error('Invalid invitation token');
    }

    if (token.expiresAt && token.expiresAt < new Date()) {
      throw new Error('Invitation token expired');
    }

    if (token.maxUses !== -1 && token.currentUses >= token.maxUses) {
      throw new Error('Invitation token exhausted');
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        googleId: data.provider === 'google' ? data.providerId : null,
        microsoftId: data.provider === 'microsoft' ? data.providerId : null,
        oauthProvider: data.provider,
        invitationTokenId: data.invitationTokenId,
        role: 'PLAYER'
      }
    });

    // Increment token usage
    await prisma.invitationToken.update({
      where: { id: data.invitationTokenId },
      data: { currentUses: { increment: 1 } }
    });

    logger.info(`✅ New user created: ${user.username} (${user.email})`);

    return user;
  }

  generateJWT(user: any) {
    return jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );
  }

  async validateInvitationToken(code: string) {
    const token = await prisma.invitationToken.findUnique({
      where: { code }
    });

    if (!token) {
      return { valid: false, message: 'Token no encontrado' };
    }

    if (!token.isActive) {
      return { valid: false, message: 'Token desactivado' };
    }

    if (token.expiresAt && token.expiresAt < new Date()) {
      return { valid: false, message: 'Token expirado' };
    }

    if (token.maxUses !== -1 && token.currentUses >= token.maxUses) {
      return { valid: false, message: 'Token agotado' };
    }

    return {
      valid: true,
      token: {
        id: token.id,
        usesRemaining: token.maxUses === -1 ? 'Ilimitado' : token.maxUses - token.currentUses,
        expiresAt: token.expiresAt
      }
    };
  }
}

export default new AuthService();
```

---

## Cron Jobs

### Automatic Points Calculation Job

```typescript
// src/jobs/calculatePoints.job.ts

import cron from 'node-cron';
import pointsService from '../services/points.service';
import { logger } from '../utils/logger';

/**
 * 🔥 AUTOMATIC POINTS CALCULATION
 * Runs every 5 minutes
 * Calculates points for matches that just finished
 */
export const startPointsCalculationJob = () => {
  cron.schedule('*/5 * * * *', async () => {
    try {
      logger.info('⏰ Running automatic points calculation job...');
      await pointsService.calculatePointsForFinishedMatches();
    } catch (error) {
      logger.error('❌ Points calculation job failed:', error);
    }
  });

  logger.info('✅ Automatic points calculation job started (every 5 minutes)');
};
```

### Live Score Update Job

```typescript
// src/jobs/syncLiveScores.job.ts

import cron from 'node-cron';
import syncService from '../services/sync.service';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Update live scores every 5 minutes
 * Only runs if there are live matches
 */
export const startLiveScoreUpdates = () => {
  cron.schedule('*/5 * * * *', async () => {
    try {
      // Check if there are live matches
      const liveCount = await prisma.match.count({
        where: {
          status: { in: ['LIVE', 'HALFTIME'] }
        }
      });

      if (liveCount > 0) {
        logger.info('🔄 Running live score update job...');
        await syncService.updateLiveScores();
      }
    } catch (error) {
      logger.error('❌ Live score update job failed:', error);
    }
  });

  logger.info('✅ Live score update job started (every 5 minutes)');
};
```

### Lock Predictions Job

```typescript
// src/jobs/lockMatches.job.ts

import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Lock predictions 20 minutes before match start
 * Runs every minute
 */
export const startPredictionLockJob = () => {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const lockTime = new Date(now.getTime() + 20 * 60 * 1000);

      const matchesToLock = await prisma.match.findMany({
        where: {
          status: 'SCHEDULED',
          dateTime: { lte: lockTime }
        }
      });

      for (const match of matchesToLock) {
        await prisma.match.update({
          where: { id: match.id },
          data: { status: 'LOCKED' }
        });

        logger.info(`🔒 Match locked: ${match.id}`);
      }
    } catch (error) {
      logger.error('❌ Prediction lock job failed:', error);
    }
  });

  logger.info('✅ Prediction lock job started (every minute)');
};
```

### Initialize All Jobs

```typescript
// src/jobs/index.ts

import { startLiveScoreUpdates } from './syncLiveScores.job';
import { startPointsCalculationJob } from './calculatePoints.job';
import { startPredictionLockJob } from './lockMatches.job';
import { logger } from '../utils/logger';

export const startAllJobs = () => {
  if (process.env.SYNC_ENABLED !== 'true') {
    logger.warn('⚠️ Cron jobs are DISABLED');
    return;
  }

  startLiveScoreUpdates();
  startPointsCalculationJob();  // 🔥 AUTO POINTS
  startPredictionLockJob();

  logger.info('🚀 All cron jobs initialized');
};
```

---

## API Routes

### Complete Routes Example

```typescript
// src/routes/predictions.routes.ts

import express from 'express';
import { auth } from '../middleware/auth';
import { prisma } from '../config/database';
import { z } from 'zod';

const router = express.Router();

// Validation schema
const createPredictionSchema = z.object({
  matchId: z.string(),
  predictedHome: z.number().int().min(0).max(20),
  predictedAway: z.number().int().min(0).max(20)
});

/**
 * POST /api/predictions
 * Create or update prediction
 */
router.post('/', auth, async (req, res) => {
  try {
    const { matchId, predictedHome, predictedAway } = createPredictionSchema.parse(req.body);
    const userId = req.user!.id;

    // Check if match exists and is not locked
    const match = await prisma.match.findUnique({
      where: { id: matchId }
    });

    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    if (match.status === 'LOCKED' || match.status === 'LIVE' || match.status === 'FINISHED') {
      return res.status(400).json({ error: 'Predictions are closed for this match' });
    }

    // Create or update prediction
    const prediction = await prisma.prediction.upsert({
      where: {
        userId_matchId: { userId, matchId }
      },
      update: {
        predictedHome,
        predictedAway
      },
      create: {
        userId,
        matchId,
        predictedHome,
        predictedAway
      },
      include: {
        match: {
          include: {
            teamHome: true,
            teamAway: true
          }
        }
      }
    });

    res.json(prediction);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/predictions/my
 * Get current user's predictions
 */
router.get('/my', auth, async (req, res) => {
  try {
    const predictions = await prisma.prediction.findMany({
      where: { userId: req.user!.id },
      include: {
        match: {
          include: {
            teamHome: true,
            teamAway: true
          }
        }
      },
      orderBy: {
        match: { dateTime: 'asc' }
      }
    });

    res.json(predictions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

---

## Frontend Components

### MatchCard Component (Responsive)

```typescript
// src/components/matches/MatchCard.tsx

import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface MatchCardProps {
  match: {
    id: string;
    teamHome: { name: string; flag: string; code: string };
    teamAway: { name: string; flag: string; code: string };
    scoreHome: number | null;
    scoreAway: number | null;
    status: string;
    dateTime: string;
    minute: number | null;
  };
}

export function MatchCard({ match }: MatchCardProps) {
  const navigate = useNavigate();

  const getStatusBadge = () => {
    if (match.status === 'LIVE') {
      return (
        <span className="bg-red-500 text-white px-2 py-1 rounded-full text-xs font-bold animate-pulse flex items-center gap-1">
          <span className="w-2 h-2 bg-white rounded-full" />
          EN VIVO {match.minute}'
        </span>
      );
    }

    if (match.status === 'FINISHED') {
      return <span className="text-text-muted text-xs">Finalizado</span>;
    }

    return (
      <span className="text-text-muted text-xs">
        {formatDistanceToNow(new Date(match.dateTime), { addSuffix: true, locale: es })}
      </span>
    );
  };

  return (
    <div
      onClick={() => navigate(`/matches/${match.id}`)}
      className="
        bg-background-card rounded-lg p-4
        cursor-pointer hover:bg-primary-900
        transition-all duration-200
        hover:scale-[1.02]
        
        flex flex-col gap-3
        md:flex-row md:items-center md:justify-between
        md:p-6
      "
    >
      {/* Teams and Score */}
      <div className="flex items-center gap-3 md:gap-6 flex-1">
        {/* Home Team */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <img
            src={match.teamHome.flag}
            alt={match.teamHome.name}
            className="w-8 h-8 md:w-10 md:h-10 object-cover rounded flex-shrink-0"
          />
          <span className="text-sm md:text-base font-medium truncate">
            {match.teamHome.name}
          </span>
        </div>

        {/* Score */}
        <div className="flex items-center gap-2 text-2xl md:text-3xl font-bold min-w-[80px] justify-center">
          <span className={match.scoreHome !== null && match.scoreHome > (match.scoreAway || 0) ? 'text-success' : ''}>
            {match.scoreHome ?? '-'}
          </span>
          <span className="text-text-muted">:</span>
          <span className={match.scoreAway !== null && match.scoreAway > (match.scoreHome || 0) ? 'text-success' : ''}>
            {match.scoreAway ?? '-'}
          </span>
        </div>

        {/* Away Team */}
        <div className="flex items-center gap-2 flex-1 flex-row-reverse md:flex-row min-w-0">
          <img
            src={match.teamAway.flag}
            alt={match.teamAway.name}
            className="w-8 h-8 md:w-10 md:h-10 object-cover rounded flex-shrink-0"
          />
          <span className="text-sm md:text-base font-medium truncate text-right md:text-left">
            {match.teamAway.name}
          </span>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center justify-between md:justify-end md:min-w-[120px]">
        {getStatusBadge()}
      </div>
    </div>
  );
}
```

### Leaderboard Component

```typescript
// src/components/leaderboard/LeaderboardTable.tsx

import { useQuery } from '@tanstack/react-query';
import { Trophy, TrendingUp, TrendingDown } from 'lucide-react';

export function LeaderboardTable() {
  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => fetch('/api/leaderboard').then(r => r.json()),
    refetchInterval: 60000 // Refresh every minute
  });

  if (isLoading) {
    return <LeaderboardSkeleton />;
  }

  return (
    <div className="bg-background-card rounded-xl overflow-hidden">
      <div className="p-6 border-b border-primary-900">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Trophy className="text-warning" />
          Tabla de Posiciones
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-primary-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase">Pos</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase">Usuario</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-text-muted uppercase">Puntos</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-text-muted uppercase">Exactos</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-text-muted uppercase">Resultados</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-text-muted uppercase hidden md:table-cell">Goles</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-primary-900">
            {leaderboard?.map((user: any, index: number) => (
              <tr
                key={user.id}
                className={`
                  hover:bg-primary-900 transition-colors
                  ${user.isCurrentUser ? 'bg-primary-800' : ''}
                `}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className={`
                      font-bold
                      ${index === 0 ? 'text-yellow-400 text-xl' : ''}
                      ${index === 1 ? 'text-gray-400 text-lg' : ''}
                      ${index === 2 ? 'text-orange-600 text-lg' : ''}
                    `}>
                      {index + 1}
                    </span>
                    {index === 0 && <Trophy className="w-5 h-5 text-yellow-400" />}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="font-medium">{user.username}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <span className="text-lg font-bold text-success">{user.totalPoints}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  {user.exactScores}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  {user.correctResults}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center hidden md:table-cell">
                  {user.correctGoals}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

---

## Environment Variables

### Backend `.env`

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/scorecast"
DATABASE_POOL_SIZE=10

# JWT
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="7d"

# API-Football
API_FOOTBALL_KEY="your-api-football-key"
API_FOOTBALL_BASE_URL="https://v3.football.api-sports.io"
WORLD_CUP_LEAGUE_ID="1"
WORLD_CUP_SEASON="2026"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_CALLBACK_URL="http://localhost:3000/api/auth/google/callback"

# Microsoft OAuth
MICROSOFT_CLIENT_ID="your-microsoft-client-id"
MICROSOFT_CLIENT_SECRET="your-microsoft-client-secret"
MICROSOFT_CALLBACK_URL="http://localhost:3000/api/auth/microsoft/callback"

# Session
SESSION_SECRET="your-session-secret"

# CORS
FRONTEND_URL="http://localhost:5173"

# Cron Jobs
SYNC_ENABLED="true"

# Prediction deadline (minutes before match)
PREDICTION_DEADLINE_MINUTES=20

# Points
POINTS_EXACT_SCORE=3
POINTS_CORRECT_RESULT=2
POINTS_CORRECT_GOAL=1

# Logging
LOG_LEVEL="info"

# Redis (Optional)
REDIS_URL="redis://localhost:6379"
```

### Frontend `.env`

```env
VITE_API_URL="http://localhost:3000"
```

---

## Deployment Guide

### 1. Railway (Backend + PostgreSQL)

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Add PostgreSQL service
railway add postgresql

# Deploy
railway up

# Set environment variables in Railway dashboard

# Run migrations
railway run npx prisma migrate deploy

# Run seed (once)
railway run npm run seed

# Initial sync (once)
railway run npm run sync:initial
```

### 2. Vercel (Frontend)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from web directory
cd packages/web
vercel

# Set environment variable in Vercel dashboard:
# VITE_API_URL=https://your-backend.railway.app
```

### 3. OAuth Setup

**Google Cloud Console:**
1. Create project
2. Enable Google+ API
3. Create OAuth credentials
4. Add authorized redirect URI: `https://your-backend.railway.app/api/auth/google/callback`
5. Copy Client ID and Secret

**Microsoft Azure:**
1. Register application
2. Add redirect URI: `https://your-backend.railway.app/api/auth/microsoft/callback`
3. Generate client secret
4. Copy Application ID and Secret

---

## Seed Data Example

```typescript
// prisma/seed.ts

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Champion odds from betting data
const championOdds: Record<string, number> = {
  'ESP': 5.40,
  'FRA': 6.00,
  'ENG': 7.00,
  'ARG': 9.00,
  'BRA': 9.00,
  'GER': 13.00,
  'POR': 13.00,
  'NED': 19.00,
  'NOR': 26.00,
  'BEL': 34.00,
  'COL': 41.00,
  'USA': 51.00,
  'MAR': 51.00,
  'JPN': 67.00,
  'SUI': 67.00,
  'CRO': 81.00,
  'MEX': 81.00,
  'URU': 81.00,
  'ECU': 101.0,
  'SEN': 101.0,
  'SWE': 101.0,
  'TUR': 101.0,
  'AUT': 101.0,
  'CAN': 101.0,
  'PAR': 151.0,
  'BIH': 151.0,
  'SCO': 151.0,
  'CIV': 251.0,
  'EGY': 251.0,
  'CZE': 301.0,
  'ALG': 301.0,
  'GHA': 301.0,
  'AUS': 401.0,
  'KOR': 401.0,
  'IRN': 501.0,
  'TUN': 501.0,
  'COD': 501.0,
  'KSA': 501.0,
  'QAT': 751.0,
  'RSA': 1001,
  'IRQ': 1001,
  'NZL': 1001,
  'PAN': 1501,
  'CPV': 1501,
  'CUW': 1501,
  'UZB': 2001,
  'JOR': 2001,
  'HAI': 2501,
  'Default': 3001
};

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create admin user
  const adminToken = await prisma.invitationToken.create({
    data: {
      code: 'SC26-ADMIN',
      maxUses: 1,
      description: 'Admin token',
      createdBy: {
        create: {
          username: 'admin',
          email: 'admin@scorecast.app',
          passwordHash: await bcrypt.hash('admin123', 10),
          role: 'ADMIN'
        }
      }
    }
  });

  console.log('✅ Admin user created');

  // 2. Create sample invitation tokens
  const sampleTokens = await prisma.invitationToken.createMany({
    data: [
      {
        code: 'SC26-DEMO1',
        maxUses: 10,
        description: 'Demo token 1',
        createdById: adminToken.createdById
      },
      {
        code: 'SC26-DEMO2',
        maxUses: 5,
        expiresAt: new Date('2026-06-01'),
        description: 'Demo token 2 (expires June 1)',
        createdById: adminToken.createdById
      },
      {
        code: 'SC26-UNLIMITED',
        maxUses: -1,
        description: 'Unlimited token',
        createdById: adminToken.createdById
      }
    ]
  });

  console.log(`✅ ${sampleTokens.count} invitation tokens created`);

  // 3. System configuration
  await prisma.systemConfig.createMany({
    data: [
      { key: 'tournament_started', value: 'false', description: 'Has the tournament started?' },
      { key: 'current_phase', value: 'GROUP_STAGE', description: 'Current tournament phase' },
      { key: 'auto_sync_enabled', value: 'true', description: 'Auto-sync with API enabled' },
      { key: 'prediction_deadline_minutes', value: '20', description: 'Minutes before match to close predictions' }
    ]
  });

  console.log('✅ System configuration created');

  console.log('🎉 Seeding completed!');
  console.log('\n📝 Login credentials:');
  console.log('   Email: admin@scorecast.app');
  console.log('   Password: admin123');
  console.log('\n🎫 Sample tokens:');
  console.log('   SC26-DEMO1 (10 uses)');
  console.log('   SC26-DEMO2 (5 uses, expires June 1)');
  console.log('   SC26-UNLIMITED (unlimited)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

---

## Testing the Auto-Points System

### Manual Test Script

```typescript
// scripts/testAutoPoints.ts

import { PrismaClient } from '@prisma/client';
import pointsService from '../src/services/points.service';

const prisma = new PrismaClient();

async function testAutoPoints() {
  console.log('🧪 Testing automatic points calculation...\n');

  // 1. Create test match
  const match = await prisma.match.create({
    data: {
      apiFootballId: 999999,
      phase: 'GROUP_STAGE',
      matchNumber: 1,
      teamHomeId: 'team-1-id', // Replace with real team ID
      teamAwayId: 'team-2-id',
      dateTime: new Date(),
      status: 'FINISHED',
      scoreHome: 3,
      scoreAway: 1,
      pointsCalculated: false
    }
  });

  console.log('✅ Test match created: 3-1');

  // 2. Create test predictions
  const predictions = await prisma.prediction.createMany({
    data: [
      {
        userId: 'user-1-id', // Replace with real user ID
        matchId: match.id,
        predictedHome: 3,
        predictedAway: 1 // Exact score: 7 points
      },
      {
        userId: 'user-2-id',
        matchId: match.id,
        predictedHome: 2,
        predictedAway: 0 // Correct result: 2 points
      },
      {
        userId: 'user-3-id',
        matchId: match.id,
        predictedHome: 1,
        predictedAway: 1 // Wrong: 0 points
      }
    ]
  });

  console.log(`✅ ${predictions.count} test predictions created\n`);

  // 3. Run auto-calculation
  console.log('🔄 Running automatic points calculation...\n');
  await pointsService.calculatePointsForFinishedMatches();

  // 4. Verify results
  const updatedPredictions = await prisma.prediction.findMany({
    where: { matchId: match.id },
    include: { user: true }
  });

  console.log('📊 Results:\n');
  updatedPredictions.forEach(p => {
    console.log(`   ${p.user.username}: ${p.predictedHome}-${p.predictedAway} → ${p.pointsEarned} points`);
    console.log(`      Exact: ${p.pointsExact}, Result: ${p.pointsResult}, Goals: ${p.pointsGoals}\n`);
  });

  // 5. Cleanup
  await prisma.prediction.deleteMany({ where: { matchId: match.id } });
  await prisma.match.delete({ where: { id: match.id } });

  console.log('✅ Test completed and cleaned up');
}

testAutoPoints()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

Run with:
```bash
npx ts-node scripts/testAutoPoints.ts
```

---

## Key Features Summary

### ✅ Automatic Points Calculation
- **When**: Every 5 minutes via cron job
- **What**: Detects finished matches and calculates points
- **How**: Updates predictions, user stats, and sends notifications
- **Flag**: `pointsCalculated` prevents duplicates

### ✅ Real-time Updates
- Live scores sync every 5 minutes (only during matches)
- Leaderboard auto-refreshes every minute
- Match details poll every 30 seconds when live

### ✅ Invitation Token System
- Required for registration
- OAuth-only (Google/Microsoft)
- Configurable limits and expiration
- Admin management dashboard

### ✅ Responsive Design
- Mobile-first approach
- Shared design tokens for future React Native migration
- Bottom navigation on mobile
- Touch-friendly interactions

### ✅ Scalable Architecture
- Connection pooling (100 users)
- Rate limiting
- Optional Redis caching
- Efficient database queries with indexes

---

## 🎯 Success Criteria Checklist

- ✅ OAuth registration with invitation tokens
- ✅ API-Football integration (100 requests/day managed)
- ✅ Automatic points calculation when matches finish
- ✅ Real-time score updates
- ✅ Predictions lock 20 minutes before matches
- ✅ Leaderboard with tie-breaking system
- ✅ Match detail page with statistics
- ✅ Responsive mobile/tablet/desktop
- ✅ Admin token management
- ✅ Supports 100 concurrent users
- ✅ Prepared for React Native migration

---

## 📚 Additional Resources

### Useful Commands

```bash
# Backend
npm run dev              # Start dev server
npm run build            # Build for production
npm run start            # Start production server
npx prisma studio        # Open database GUI
npx prisma migrate dev   # Create migration
npm run seed             # Seed database

# Frontend
npm run dev              # Start Vite dev server
npm run build            # Build for production
npm run preview          # Preview production build

# Testing
npm run test             # Run tests
npm run test:points      # Test auto-points calculation
```

### Debug Auto-Points

Add this endpoint for manual testing:

```typescript
// src/routes/admin.routes.ts

router.post('/calculate-points/:matchId', adminAuth, async (req, res) => {
  try {
    await pointsService.recalculateMatch(req.params.matchId);
    res.json({ success: true, message: 'Points recalculated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

---

**End of SCORECAST Skill**

This skill provides a complete foundation for building SCORECAST with automatic points calculation, real-time updates, and scalability for 100 users. Follow the structure, adapt as needed, and build an amazing World Cup prediction platform! ⚽🏆
