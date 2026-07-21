import { useQuery } from '@tanstack/react-query';
import { Trophy, Medal } from 'lucide-react';
import { clsx } from 'clsx';
import { leaderboardApi } from '@/services/api';
import type { LeaderboardEntry } from '../../../../shared/types';

export function LeaderboardTable() {
  const { data: leaderboard, isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard'],
    queryFn: () => leaderboardApi.list().then((r) => r.data),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="glass-card h-16 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      <div className="p-4 border-b border-white/5 flex items-center gap-2">
        <Trophy className="text-warning" size={20} />
        <h2 className="text-lg font-bold">Tabla de Posiciones</h2>
      </div>

      {/* Header */}
      <div className="grid grid-cols-[40px_1fr_60px_50px_50px] gap-2 px-4 py-2 text-xs text-text-muted font-medium border-b border-white/5">
        <span>#</span>
        <span>Jugador</span>
        <span className="text-center">Pts</span>
        <span className="text-center hidden sm:block">Exactos</span>
        <span className="text-center hidden sm:block">Result.</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-white/5">
        {leaderboard?.map((entry, index) => (
          <div
            key={entry.id}
            className={clsx(
              'grid grid-cols-[40px_1fr_60px_50px_50px] gap-2 px-4 py-3 items-center transition-colors',
              entry.isCurrentUser ? 'bg-primary-900/30' : 'hover:bg-white/5'
            )}
          >
            {/* Rank */}
            <div className="flex items-center">
              {index === 0 ? (
                <Trophy size={16} className="text-yellow-400" />
              ) : index === 1 ? (
                <Medal size={16} className="text-gray-400" />
              ) : index === 2 ? (
                <Medal size={16} className="text-amber-600" />
              ) : (
                <span className="text-text-muted text-sm">{index + 1}</span>
              )}
            </div>

            {/* Username */}
            <div className="min-w-0">
              <span className={clsx('font-medium text-sm truncate block', entry.isCurrentUser && 'text-primary-400')}>
                {entry.username}
                {entry.isCurrentUser && ' (tú)'}
              </span>
              {entry.championPrediction && (
                <span className="text-xs text-text-muted">🏆 {entry.championPrediction}</span>
              )}
            </div>

            {/* Points */}
            <div className="flex flex-col items-center">
              <span className="font-bold text-success text-lg tabular-nums leading-tight">
                {entry.totalPoints}
              </span>
              {(entry as any).isChampionCorrect && (
                <span className="text-[10px] font-semibold text-yellow-400 leading-tight">+5 🏆</span>
              )}
            </div>

            {/* Exact */}
            <span className="text-center text-sm text-text-muted hidden sm:block tabular-nums">
              {entry.exactScores}
            </span>

            {/* Results */}
            <span className="text-center text-sm text-text-muted hidden sm:block tabular-nums">
              {entry.correctResults}
            </span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="px-4 py-3 border-t border-white/5 text-xs text-text-muted flex gap-4">
        <span>Pts = Puntos totales</span>
        <span className="hidden sm:block">Exactos = Marcador exacto (3pts)</span>
        <span className="hidden sm:block">Result. = Resultado (2pts)</span>
      </div>
    </div>
  );
}
