import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { clsx } from 'clsx';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { predictionsApi } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';
import type { Match } from '../../../../shared/types';

const DEADLINE_MINUTES = 20;

function useMatchTimer(targetDate: Date) {
  const calc = () => {
    const diffMs = targetDate.getTime() - Date.now();
    const totalMin = diffMs / 60_000;
    const totalMinFloor = Math.floor(totalMin);
    const days = Math.floor(totalMinFloor / 1440);
    const hours = Math.floor((totalMinFloor % 1440) / 60);
    const mins = totalMinFloor % 60;

    let label: string | null = null;
    if (diffMs > 0) {
      if (days > 0) label = `${days}d ${hours}h`;
      else if (hours > 0) label = `${hours}h ${mins}m`;
      else label = `${mins}m`;
    }

    return { label, minutesLeft: totalMin, pastDeadline: totalMin <= DEADLINE_MINUTES };
  };

  const [state, setState] = useState(calc);

  useEffect(() => {
    const id = setInterval(() => setState(calc()), 30_000);
    return () => clearInterval(id);
  }, [targetDate]);

  return state;
}

interface MatchCardProps { match: Match }

export function MatchCard({ match }: MatchCardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');

  const isLive     = match.status === 'LIVE' || match.status === 'HALFTIME';
  const isFinished = match.status === 'FINISHED';
  const isLocked   = match.status === 'LOCKED';
  const isScheduled = match.status === 'SCHEDULED';

  const matchDate = useMemo(() => new Date(match.dateTime), [match.dateTime]);
  const { label: countdown, pastDeadline: deadlineReached } = useMatchTimer(matchDate);

  // Admins bypass time deadline — backend enforces the real rule (blocks only if pointsCalculated)
  const pastDeadline = isAdmin ? false : deadlineReached;
  const adminCanPredict = isAdmin && !match.pointsCalculated;

  const hasPrediction = !!match.userPrediction;
  const [editing, setEditing] = useState(false);

  const [home, setHome] = useState<number>(match.userPrediction?.predictedHome ?? 0);
  const [away, setAway] = useState<number>(match.userPrediction?.predictedAway ?? 0);

  // Reset local values when prediction changes (after invalidation)
  useEffect(() => {
    if (!editing) {
      setHome(match.userPrediction?.predictedHome ?? 0);
      setAway(match.userPrediction?.predictedAway ?? 0);
    }
  }, [match.userPrediction, editing]);

  const { mutate, isPending } = useMutation({
    mutationFn: () => predictionsApi.create(match.id, home, away),
    onSuccess: () => {
      toast.success(hasPrediction ? '¡Predicción actualizada!' : '¡Predicción guardada!');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al guardar'),
  });

  const homeWon    = isFinished && match.scoreHome !== null && match.scoreAway !== null && match.scoreHome > match.scoreAway;
  const awayWon    = isFinished && match.scoreHome !== null && match.scoreAway !== null && match.scoreAway > match.scoreHome;
  const homeWonPen = isFinished && !homeWon && !awayWon && match.scoreHomePen !== null && match.scoreAwayPen !== null && match.scoreHomePen > match.scoreAwayPen;
  const awayWonPen = isFinished && !homeWon && !awayWon && match.scoreHomePen !== null && match.scoreAwayPen !== null && match.scoreAwayPen > match.scoreHomePen;

  // What to show in the prediction zone
  const canEdit  = (isScheduled && !pastDeadline) || (adminCanPredict && !isFinished);
  const showControls = (canEdit && (!hasPrediction || editing)) || (adminCanPredict && isFinished && editing);
  const showSaved    = hasPrediction && !editing;
  const showLocked   = !adminCanPredict && isScheduled && pastDeadline;

  return (
    <div
      onClick={() => navigate(`/matches/${match.id}`)}
      className={clsx(
        'glass-card p-4 cursor-pointer transition-all duration-200 hover:bg-background-elevated hover:scale-[1.01] active:scale-[0.99]',
        isLive && 'border-red-500/30 shadow-lg shadow-red-500/10'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 text-xs text-text-muted">
        <span>
          {match.phase === 'GROUP_STAGE' && match.teamHome.group
            ? `Grupo ${match.teamHome.group}`
            : match.round || match.phase}
        </span>
        <div className="flex items-center gap-2">
          {isLive ? (
            <span className="live-badge">
              <span className="w-1.5 h-1.5 bg-white rounded-full" />
              EN VIVO {match.minute ? `${match.minute}'` : ''}
            </span>
          ) : isLocked ? (
            <span className="text-warning text-xs font-semibold">🔒 Cerrado</span>
          ) : isFinished ? (
            <span>Finalizado</span>
          ) : (
            <span>{format(matchDate, "d MMM · HH:mm", { locale: es })}</span>
          )}
        </div>
      </div>

      {/* Teams + Score */}
      <div className="flex items-center gap-3">
        <div className={clsx('flex items-center gap-2 flex-1 min-w-0', (awayWon || awayWonPen) && 'opacity-50')}>
          <img src={match.teamHome.flag} alt={match.teamHome.name} className="w-8 h-8 object-cover rounded shrink-0" />
          <span className={clsx('font-semibold text-sm truncate', (homeWon || homeWonPen) && 'text-success')}>
            {match.teamHome.name}
          </span>
        </div>

        <div className="flex flex-col items-center shrink-0 min-w-[72px]">
          <div className="flex items-center gap-1.5 justify-center">
            <span className={clsx('score-display', (homeWon || homeWonPen) ? 'text-success' : 'text-text-primary')}>
              {match.scoreHome ?? '-'}
            </span>
            <span className="text-text-muted font-light">:</span>
            <span className={clsx('score-display', (awayWon || awayWonPen) ? 'text-success' : 'text-text-primary')}>
              {match.scoreAway ?? '-'}
            </span>
          </div>
          {(homeWonPen || awayWonPen) && (
            <span className="text-[10px] text-text-muted mt-0.5">
              P: {match.scoreHomePen}-{match.scoreAwayPen}
            </span>
          )}
        </div>

        <div className={clsx('flex items-center gap-2 flex-1 flex-row-reverse min-w-0', (homeWon || homeWonPen) && 'opacity-50')}>
          <img src={match.teamAway.flag} alt={match.teamAway.name} className="w-8 h-8 object-cover rounded shrink-0" />
          <span className={clsx('font-semibold text-sm truncate text-right', (awayWon || awayWonPen) && 'text-success')}>
            {match.teamAway.name}
          </span>
        </div>
      </div>

      {/* Prediction zone — stops card navigation */}
      <div onClick={(e) => e.stopPropagation()}>

        {/* ── Controls: +/- + Guardar ── */}
        {showControls && (
          <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
            {countdown && (
              <p className={clsx('text-center text-xs', pastDeadline ? 'text-danger' : 'text-text-muted')}>
                ⏱ Cierra en <span className="font-semibold text-white">{countdown}</span>
              </p>
            )}
            <div className="flex items-center justify-center gap-2">
              {/* Home */}
              <div className="flex items-center gap-1">
                <button onClick={() => setHome((v) => Math.max(0, v - 1))}
                  className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 text-base font-bold transition-colors flex items-center justify-center">−</button>
                <span className="w-6 text-center font-bold">{home}</span>
                <button onClick={() => setHome((v) => Math.min(20, v + 1))}
                  className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 text-base font-bold transition-colors flex items-center justify-center">+</button>
              </div>

              <span className="text-text-muted font-light text-lg px-0.5">:</span>

              {/* Away */}
              <div className="flex items-center gap-1">
                <button onClick={() => setAway((v) => Math.max(0, v - 1))}
                  className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 text-base font-bold transition-colors flex items-center justify-center">−</button>
                <span className="w-6 text-center font-bold">{away}</span>
                <button onClick={() => setAway((v) => Math.min(20, v + 1))}
                  className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 text-base font-bold transition-colors flex items-center justify-center">+</button>
              </div>

              <div className="flex gap-1 ml-1">
                {editing && (
                  <button onClick={() => { setEditing(false); setHome(match.userPrediction?.predictedHome ?? 0); setAway(match.userPrediction?.predictedAway ?? 0); }}
                    className="px-2 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg transition-colors">
                    ✕
                  </button>
                )}
                <button onClick={() => mutate()} disabled={isPending}
                  className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
                  {isPending ? '...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Saved prediction (not editing) ── */}
        {showSaved && !showControls && (
          <div className="mt-3 pt-3 border-t border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-text-muted">Tu predicción:</span>
                <span className="font-bold text-white">
                  {match.userPrediction!.predictedHome} – {match.userPrediction!.predictedAway}
                </span>
                {isFinished && match.userPrediction!.pointsEarned > 0 && (
                  <span className="text-success font-semibold">+{match.userPrediction!.pointsEarned} pts</span>
                )}
              </div>

              {/* Editar / Cerrado */}
              {canEdit ? (
                <button onClick={() => setEditing(true)}
                  className="text-xs px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors">
                  Editar
                </button>
              ) : isScheduled && showLocked ? (
                <span className="text-xs px-2.5 py-1 rounded-lg bg-white/5 text-text-muted cursor-not-allowed select-none">
                  🔒 Cerrado
                </span>
              ) : null}
            </div>

            {/* Countdown warning near deadline */}
            {isScheduled && !pastDeadline && countdown && (
              <p className="text-xs text-text-muted mt-1.5">
                ⏱ Puedes editar hasta en <span className="font-semibold text-white">{countdown}</span>
              </p>
            )}
          </div>
        )}

        {/* ── No prediction + deadline passed ── */}
        {isScheduled && showLocked && !hasPrediction && (
          <div className="mt-3 pt-3 border-t border-white/5">
            <p className="text-xs text-center text-text-muted/50 select-none">
              🔒 Predicciones cerradas para este partido
            </p>
          </div>
        )}

        {/* ── No prediction, no deadline yet, but locked/finished ── */}
        {(isLocked || isFinished) && !hasPrediction && (
          <div className="mt-3 pt-3 border-t border-white/5">
            <p className="text-xs text-center text-text-muted/40 select-none">Sin predicción</p>
          </div>
        )}
      </div>
    </div>
  );
}
