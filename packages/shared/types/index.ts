export type UserRole = 'ADMIN' | 'PLAYER';
export type MatchPhase = 'GROUP_STAGE' | 'ROUND_OF_32' | 'ROUND_OF_16' | 'QUARTER_FINALS' | 'SEMI_FINALS' | 'THIRD_PLACE' | 'FINAL';
export type MatchStatus = 'SCHEDULED' | 'LOCKED' | 'LIVE' | 'HALFTIME' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';
export type NotificationType = 'MATCH_STARTING' | 'MATCH_LOCKED' | 'MATCH_FINISHED' | 'POINTS_EARNED' | 'LEADERBOARD_UP' | 'PHASE_UNLOCKED';

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  totalPoints: number;
  exactScores: number;
  correctResults: number;
  correctGoals: number;
  championPrediction: string | null;
  championOdds: number | null;
  oauthProvider: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Team {
  id: string;
  apiFootballId: number;
  name: string;
  nameEn: string;
  code: string;
  flag: string;
  group: string | null;
  championOdds: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface Match {
  id: string;
  phase: MatchPhase;
  matchNumber: number;
  round: string | null;
  teamHome: Pick<Team, 'id' | 'name' | 'code' | 'flag' | 'group'>;
  teamAway: Pick<Team, 'id' | 'name' | 'code' | 'flag' | 'group'>;
  dateTime: string;
  venue: string | null;
  city: string | null;
  scoreHome: number | null;
  scoreAway: number | null;
  scoreHomeET: number | null;
  scoreAwayET: number | null;
  scoreHomePen: number | null;
  scoreAwayPen: number | null;
  status: MatchStatus;
  minute: number | null;
  pointsCalculated: boolean;
  userPrediction?: UserPrediction | null;
}

export interface UserPrediction {
  matchId: string;
  predictedHome: number;
  predictedAway: number;
  pointsEarned: number;
  isExactScore?: boolean;
  isCorrectResult?: boolean;
}

export interface Prediction {
  id: string;
  userId: string;
  matchId: string;
  predictedHome: number;
  predictedAway: number;
  pointsEarned: number;
  pointsExact: number;
  pointsResult: number;
  pointsGoals: number;
  isExactScore: boolean;
  isCorrectResult: boolean;
  hasCorrectGoal: boolean;
  match: Match;
  createdAt: string;
  updatedAt: string;
}

export interface LeaderboardEntry {
  id: string;
  username: string;
  totalPoints: number;
  exactScores: number;
  correctResults: number;
  correctGoals: number;
  rank: number;
  predictionsCount: number;
  championPrediction: string | null;
  isCurrentUser?: boolean;
}

export interface InvitationToken {
  id: string;
  code: string;
  maxUses: number;
  currentUses: number;
  expiresAt: string | null;
  isActive: boolean;
  description: string | null;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  readAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  details?: { field: string; message: string }[];
}

export interface TokenValidation {
  valid: boolean;
  message?: string;
  token?: {
    id: string;
    code: string;
    usesRemaining: number | string;
    expiresAt: string | null;
  };
}
