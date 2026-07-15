import { Router } from 'express';
import axios from 'axios';
import { prisma } from '../config/database';
import { auth, optionalAuth, AuthRequest } from '../middleware/auth';
import apiFootballService from '../services/apiFootball.service';

const router = Router();

const matchSelect = {
  id: true,
  phase: true,
  matchNumber: true,
  round: true,
  dateTime: true,
  venue: true,
  city: true,
  scoreHome: true,
  scoreAway: true,
  scoreHomeET: true,
  scoreAwayET: true,
  scoreHomePen: true,
  scoreAwayPen: true,
  status: true,
  minute: true,
  pointsCalculated: true,
  teamHome: { select: { id: true, name: true, code: true, flag: true, group: true } },
  teamAway: { select: { id: true, name: true, code: true, flag: true, group: true } },
};

const PHASE_ORDER = ['FINAL', 'THIRD_PLACE', 'SEMI_FINALS', 'QUARTER_FINALS', 'ROUND_OF_16', 'ROUND_OF_32', 'GROUP_STAGE'];

async function detectCurrentPhase(): Promise<string> {
  // 1. Any live match?
  const live = await prisma.match.findFirst({
    where: { competition: 'WORLD_CUP', status: { in: ['LIVE', 'HALFTIME'] } },
    select: { phase: true },
  });
  if (live) return live.phase;

  // 2. Earliest future match (ignores stale SCHEDULED matches from past phases)
  const upcoming = await prisma.match.findFirst({
    where: {
      competition: 'WORLD_CUP',
      status: { notIn: ['FINISHED', 'CANCELLED'] },
      dateTime: { gte: new Date() },
    },
    orderBy: { dateTime: 'asc' },
    select: { phase: true },
  });
  if (upcoming) return upcoming.phase;

  // 3. All done — return most advanced finished phase
  for (const phase of PHASE_ORDER) {
    const finished = await prisma.match.findFirst({
      where: { competition: 'WORLD_CUP', phase: phase as any, status: 'FINISHED' },
      select: { phase: true },
    });
    if (finished) return finished.phase;
  }

  return 'GROUP_STAGE';
}

// GET /api/matches/current-phase
router.get('/current-phase', async (_req, res, next) => {
  try {
    res.json({ phase: await detectCurrentPhase() });
  } catch (error) {
    next(error);
  }
});

// GET /api/matches - list with optional filters
router.get('/', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const { phase, status, date, all } = req.query;

    const where: any = { competition: 'WORLD_CUP' };
    if (phase) {
      where.phase = phase;
    } else if (!status && !date && all !== 'true') {
      where.phase = await detectCurrentPhase();
    }
    if (status) where.status = status;
    if (date) {
      const d = new Date(date as string);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      where.dateTime = { gte: d, lt: next };
    }

    const matches = await prisma.match.findMany({
      where,
      select: matchSelect,
      orderBy: { dateTime: 'asc' },
    });

    // Attach user predictions if authenticated
    if (req.user) {
      const matchIds = matches.map((m) => m.id);
      const predictions = await prisma.prediction.findMany({
        where: { userId: req.user.id, matchId: { in: matchIds } },
        select: { matchId: true, predictedHome: true, predictedAway: true, pointsEarned: true },
      });

      const predMap = Object.fromEntries(predictions.map((p) => [p.matchId, p]));
      return res.json(matches.map((m) => ({ ...m, userPrediction: predMap[m.id] || null })));
    }

    res.json(matches);
  } catch (error) {
    next(error);
  }
});

// GET /api/matches/live
router.get('/live', async (_req, res, next) => {
  try {
    const matches = await prisma.match.findMany({
      where: { competition: 'WORLD_CUP', status: { in: ['LIVE', 'HALFTIME'] } },
      select: matchSelect,
      orderBy: { dateTime: 'asc' },
    });
    res.json(matches);
  } catch (error) {
    next(error);
  }
});

// GET /api/matches/:id
router.get('/:id', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        teamHome: true,
        teamAway: true,
        predictions: req.user
          ? {
              where: { userId: req.user.id },
              select: {
                predictedHome: true,
                predictedAway: true,
                pointsEarned: true,
                isExactScore: true,
                isCorrectResult: true,
              },
            }
          : false,
      },
    });

    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });

    res.json(match);
  } catch (error) {
    next(error);
  }
});

const MOCK_SUMMARY = {
  available: true,
  goals: [
    { minute: '23', scorer: 'Lionel Messi', assist: 'Julián Álvarez', teamName: 'Argentina', ownGoal: false, penalty: false },
    { minute: '36', scorer: 'Kylian Mbappé', assist: null, teamName: 'Francia', ownGoal: false, penalty: true },
    { minute: '57', scorer: 'Julián Álvarez', assist: 'Di María', teamName: 'Argentina', ownGoal: false, penalty: false },
    { minute: '79', scorer: 'Kylian Mbappé', assist: null, teamName: 'Francia', ownGoal: false, penalty: false },
    { minute: '90+8', scorer: 'Kylian Mbappé', assist: null, teamName: 'Francia', ownGoal: false, penalty: true },
    { minute: '108', scorer: 'Lionel Messi', assist: null, teamName: 'Argentina', ownGoal: false, penalty: false },
    { minute: '118', scorer: 'Randal Kolo Muani', assist: 'Tchouaméni', teamName: 'Francia', ownGoal: false, penalty: false },
  ],
  stats: [
    { label: 'Posesión', unit: '%', home: '43', away: '57' },
    { label: 'Tiros',    unit: '',  home: '12', away: '9'  },
    { label: 'Al arco',  unit: '',  home: '5',  away: '5'  },
    { label: 'Atajadas', unit: '',  home: '4',  away: '4'  },
    { label: 'Faltas',   unit: '',  home: '10', away: '13' },
    { label: 'Córners',  unit: '',  home: '4',  away: '2'  },
    { label: 'Amarillas',unit: '',  home: '2',  away: '2'  },
    { label: 'Rojas',    unit: '',  home: '0',  away: '0'  },
  ],
};

// GET /api/matches/:id/summary - goalscorers + stats from ESPN
router.get('/:id/summary', async (req, res, next) => {
  try {
    // Preview mode: return realistic mock data (Argentina vs Francia final 2022)
    if (req.query.preview === '1') {
      return res.json(MOCK_SUMMARY);
    }

    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      select: { apiFootballId: true, status: true, teamHomeId: true, teamAwayId: true },
    });

    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });
    if (match.status === 'SCHEDULED' || match.status === 'LOCKED') {
      return res.json({ goals: [], stats: [], available: false });
    }
    if (!match.apiFootballId) {
      return res.json({ goals: [], stats: [], available: false });
    }

    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${match.apiFootballId}`;
    const { data } = await axios.get(url, { timeout: 8_000 });

    // ── Parse goals ──────────────────────────────────────────────────────────
    const goals: any[] = [];
    const plays: any[] = data.keyPlays ?? data.plays ?? [];
    for (const play of plays) {
      if (!play.scoringPlay && play.type?.text?.toLowerCase() !== 'goal') continue;
      const scorer = play.participants?.find((p: any) =>
        p.type?.text?.toLowerCase() === 'scorer' || p.type?.id === '1'
      );
      const assist = play.participants?.find((p: any) =>
        p.type?.text?.toLowerCase() === 'assist' || p.type?.id === '2'
      );
      goals.push({
        minute: play.clock?.displayValue ?? '?',
        scorer: scorer?.athlete?.displayName ?? play.text ?? '?',
        assist: assist?.athlete?.displayName ?? null,
        teamId: play.team?.id ?? null,
        teamName: play.team?.displayName ?? null,
        ownGoal: play.type?.text?.toLowerCase().includes('own') ?? false,
        penalty: play.type?.text?.toLowerCase().includes('penalty') ?? false,
      });
    }

    // ── Parse team stats ─────────────────────────────────────────────────────
    const STAT_KEYS = [
      { key: 'possessionPct', label: 'Posesión', unit: '%' },
      { key: 'totalShots',    label: 'Tiros',    unit: '' },
      { key: 'shotsOnTarget', label: 'Al arco',  unit: '' },
      { key: 'saves',         label: 'Atajadas', unit: '' },
      { key: 'fouls',         label: 'Faltas',   unit: '' },
      { key: 'corners',       label: 'Córners',  unit: '' },
      { key: 'yellowCards',   label: 'Amarillas',unit: '' },
      { key: 'redCards',      label: 'Rojas',    unit: '' },
      { key: 'offsides',      label: 'Fuera de lugar', unit: '' },
    ];

    const rawTeams: any[] = data.boxscore?.teams ?? [];
    const statsMap: Record<string, Record<string, string>> = {};
    for (const t of rawTeams) {
      const tid = t.team?.id ?? t.homeAway ?? String(rawTeams.indexOf(t));
      statsMap[tid] = {};
      for (const s of (t.statistics ?? [])) {
        statsMap[tid][s.name] = s.displayValue;
      }
    }

    const teamIds = Object.keys(statsMap);
    const stats = STAT_KEYS.map(({ key, label, unit }) => ({
      label,
      unit,
      home: statsMap[teamIds[0]]?.[key] ?? null,
      away: statsMap[teamIds[1]]?.[key] ?? null,
    })).filter(s => s.home !== null || s.away !== null);

    const homeEspnId = rawTeams.find((t: any) => t.homeAway === 'home')?.team?.id ?? teamIds[0];

    res.json({ goals, stats, homeEspnId, available: true });
  } catch (error) {
    next(error);
  }
});

// GET /api/matches/:id/statistics - from API Football
router.get('/:id/statistics', auth, async (req: AuthRequest, res, next) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      select: { apiFootballId: true, status: true },
    });

    if (!match) return res.status(404).json({ error: 'Partido no encontrado' });

    if (match.status === 'SCHEDULED' || match.status === 'LOCKED') {
      return res.status(400).json({ error: 'El partido no ha comenzado' });
    }

    const stats = await apiFootballService.getMatchStatistics(match.apiFootballId);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

export default router;
