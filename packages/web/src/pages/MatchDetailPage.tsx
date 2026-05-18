import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { matchesApi, predictionsApi } from '@/services/api';
import { PredictionInput } from '@/components/matches/PredictionInput';
import type { Match } from '../../../shared/types';
import { PHASE_LABELS } from '../../../shared/constants/odds';
import { clsx } from 'clsx';

interface Goal {
  minute: string;
  scorer: string;
  assist: string | null;
  teamName: string | null;
  ownGoal: boolean;
  penalty: boolean;
}
interface Stat { label: string; unit: string; home: string | null; away: string | null; }

function StatBar({ label, unit, home, away }: Stat) {
  const h = parseFloat(home ?? '0') || 0;
  const a = parseFloat(away ?? '0') || 0;
  const total = h + a || 1;
  const homePct = Math.round((h / total) * 100);
  const awayPct = 100 - homePct;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-semibold">
        <span>{home ?? '—'}{unit}</span>
        <span className="text-text-muted text-[10px] uppercase tracking-wide">{label}</span>
        <span>{away ?? '—'}{unit}</span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-white/5">
        <div className="bg-primary-400 rounded-l-full transition-all" style={{ width: `${homePct}%` }} />
        <div className="bg-white/30 rounded-r-full transition-all" style={{ width: `${awayPct}%` }} />
      </div>
    </div>
  );
}

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: match, isLoading, isError } = useQuery<Match>({
    queryKey: ['match', id],
    queryFn: () => matchesApi.detail(id!).then((r) => r.data),
    refetchInterval: (query) => {
      const data = query.state.data as Match | undefined;
      return data?.status === 'LIVE' || data?.status === 'HALFTIME' ? 30_000 : false;
    },
  });

  const isLive     = match?.status === 'LIVE' || match?.status === 'HALFTIME';
  const isFinished = match?.status === 'FINISHED';
  const showSummary = isLive || isFinished;

  const { data: allPredictions } = useQuery({
    queryKey: ['predictions', 'match', id],
    queryFn: () => predictionsApi.forMatch(id!).then((r) => r.data),
    enabled: isFinished,
  });

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['match-summary', id],
    queryFn: () => matchesApi.summary(id!).then((r) => r.data),
    enabled: showSummary,
    refetchInterval: isLive ? 30_000 : false,
  });

  if (isLoading) {
    return (
      <div className="page-container space-y-4">
        <div className="glass-card h-48 animate-pulse" />
        <div className="glass-card h-32 animate-pulse" />
      </div>
    );
  }

  if (isError || !match) {
    return (
      <div className="page-container space-y-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-text-muted hover:text-white transition-colors text-sm"
        >
          <ArrowLeft size={16} />
          Volver
        </button>
        <div className="glass-card p-6 text-center space-y-3">
          <div className="text-4xl">⚽</div>
          <p className="text-text-muted text-sm">No se pudo cargar el partido.</p>
          <button onClick={() => navigate(-1)} className="btn-secondary">
            Volver a partidos
          </button>
        </div>
      </div>
    );
  }

  const matchDate = new Date(match.dateTime);

  return (
    <div className="page-container space-y-4">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-text-muted hover:text-white transition-colors text-sm"
      >
        <ArrowLeft size={16} />
        Volver
      </button>

      {/* Match header */}
      <div className={clsx('glass-card p-6', isLive && 'border-red-500/30')}>
        <div className="text-center text-xs text-text-muted mb-4">
          {PHASE_LABELS[match.phase] || match.phase}
          {match.venue && <span> · {match.venue}</span>}
        </div>

        <div className="flex items-center gap-4 justify-center">
          <div className="flex flex-col items-center gap-2 flex-1">
            <img src={match.teamHome.flag} alt={match.teamHome.name} className="w-16 h-16 object-cover rounded" />
            <span className="font-bold text-center">{match.teamHome.name}</span>
          </div>

          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-5xl font-black">{match.scoreHome ?? '-'}</span>
              <span className="text-3xl text-text-muted">:</span>
              <span className="text-5xl font-black">{match.scoreAway ?? '-'}</span>
            </div>
            {isLive ? (
              <span className="live-badge">
                <span className="w-1.5 h-1.5 bg-white rounded-full" />
                {match.status === 'HALFTIME' ? 'MEDIO TIEMPO' : `${match.minute}'`}
              </span>
            ) : (
              <span className="text-xs text-text-muted">
                {isFinished ? 'Final' : format(matchDate, "d MMM · HH:mm 'hs'", { locale: es })}
              </span>
            )}
            {match.scoreHomePen !== null && (
              <span className="text-xs text-text-muted">
                Penales: {match.scoreHomePen} - {match.scoreAwayPen}
              </span>
            )}
          </div>

          <div className="flex flex-col items-center gap-2 flex-1">
            <img src={match.teamAway.flag} alt={match.teamAway.name} className="w-16 h-16 object-cover rounded" />
            <span className="font-bold text-center">{match.teamAway.name}</span>
          </div>
        </div>
      </div>

      <PredictionInput
        match={match}
        initialHome={(match as any).predictions?.[0]?.predictedHome}
        initialAway={(match as any).predictions?.[0]?.predictedAway}
      />

      {/* ESPN Summary: goles + estadísticas (solo en partidos en curso o finalizados) */}
      {showSummary && (
        summaryLoading ? (
          <div className="glass-card h-24 animate-pulse" />
        ) : summary?.available ? (
          <>
            {/* Goalscorers */}
            {summary.goals.length > 0 && (
              <div className="glass-card overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5">
                  <h3 className="font-semibold text-sm">⚽ Goles</h3>
                </div>
                <div className="divide-y divide-white/5">
                  {(summary.goals as Goal[]).map((g, i) => {
                    const isHome = g.teamName === match.teamHome.name
                      || g.teamName?.toLowerCase().includes(match.teamHome.name.toLowerCase().split(' ')[0]);
                    return (
                      <div key={i} className={clsx('flex items-center gap-3 px-4 py-2.5', isHome ? 'flex-row' : 'flex-row-reverse')}>
                        <img
                          src={isHome ? match.teamHome.flag : match.teamAway.flag}
                          alt=""
                          className="w-6 h-6 object-cover rounded shrink-0"
                        />
                        <div className={clsx('flex-1', !isHome && 'text-right')}>
                          <span className="text-sm font-semibold">
                            {g.scorer}
                            {g.ownGoal && <span className="text-danger text-xs ml-1">(en propia)</span>}
                            {g.penalty && <span className="text-yellow-400 text-xs ml-1">(pen)</span>}
                          </span>
                          {g.assist && (
                            <p className={clsx('text-xs text-text-muted', !isHome && 'text-right')}>
                              Asistencia: {g.assist}
                            </p>
                          )}
                        </div>
                        <span className="text-xs font-bold text-text-muted shrink-0">{g.minute}'</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Team stats */}
            {summary.stats.length > 0 && (
              <div className="glass-card overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Estadísticas</h3>
                </div>
                <div className="flex justify-between px-4 pt-3 pb-1 text-xs font-semibold">
                  <div className="flex items-center gap-1.5">
                    <img src={match.teamHome.flag} alt="" className="w-5 h-5 object-cover rounded" />
                    <span className="text-primary-400 truncate max-w-[80px]">{match.teamHome.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-row-reverse">
                    <img src={match.teamAway.flag} alt="" className="w-5 h-5 object-cover rounded" />
                    <span className="text-white/60 truncate max-w-[80px] text-right">{match.teamAway.name}</span>
                  </div>
                </div>
                <div className="px-4 pb-4 pt-2 space-y-3">
                  {(summary.stats as Stat[]).map((s, i) => (
                    <StatBar key={i} {...s} />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null
      )}

      {isFinished && allPredictions && allPredictions.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="p-4 border-b border-white/5">
            <h3 className="font-semibold">Predicciones de todos</h3>
          </div>
          <div className="divide-y divide-white/5">
            {allPredictions.map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-text-muted">{p.user.username}</span>
                <span className="font-medium">{p.predictedHome} - {p.predictedAway}</span>
                <span className={clsx('font-bold', p.pointsEarned > 0 ? 'text-success' : 'text-text-muted')}>
                  +{p.pointsEarned} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
