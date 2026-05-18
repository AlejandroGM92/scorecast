import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { predictionsApi } from '@/services/api';
import type { Match } from '../../../../shared/types';

interface PredictionInputProps {
  match: Match;
  initialHome?: number;
  initialAway?: number;
}

export function PredictionInput({ match, initialHome, initialAway }: PredictionInputProps) {
  const [home, setHome] = useState(initialHome ?? 0);
  const [away, setAway] = useState(initialAway ?? 0);
  const queryClient = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: () => predictionsApi.create(match.id, home, away),
    onSuccess: () => {
      toast.success('¡Predicción guardada!');
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['predictions', 'my'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Error al guardar');
    },
  });

  const locked = ['LOCKED', 'LIVE', 'HALFTIME', 'FINISHED'].includes(match.status);

  if (locked) {
    return (
      <div className="glass-card p-4 text-center text-text-muted text-sm">
        {match.status === 'FINISHED' ? '🏁 Partido finalizado' : '🔒 Predicciones cerradas'}
      </div>
    );
  }

  return (
    <div className="glass-card p-4">
      <h3 className="text-sm font-semibold text-text-muted mb-4 text-center">Tu predicción</h3>

      <div className="flex items-center justify-center gap-4">
        {/* Home score */}
        <div className="flex flex-col items-center gap-1">
          <img src={match.teamHome.flag} alt={match.teamHome.name} className="w-10 h-10 object-cover rounded" />
          <span className="text-xs text-text-muted">{match.teamHome.code}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setHome(Math.max(0, home - 1))}
              className="w-8 h-8 rounded bg-white/10 hover:bg-white/20 font-bold transition-colors"
            >
              −
            </button>
            <span className="w-8 text-center text-2xl font-bold">{home}</span>
            <button
              onClick={() => setHome(Math.min(20, home + 1))}
              className="w-8 h-8 rounded bg-white/10 hover:bg-white/20 font-bold transition-colors"
            >
              +
            </button>
          </div>
        </div>

        <span className="text-2xl font-light text-text-muted pb-6">:</span>

        {/* Away score */}
        <div className="flex flex-col items-center gap-1">
          <img src={match.teamAway.flag} alt={match.teamAway.name} className="w-10 h-10 object-cover rounded" />
          <span className="text-xs text-text-muted">{match.teamAway.code}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setAway(Math.max(0, away - 1))}
              className="w-8 h-8 rounded bg-white/10 hover:bg-white/20 font-bold transition-colors"
            >
              −
            </button>
            <span className="w-8 text-center text-2xl font-bold">{away}</span>
            <button
              onClick={() => setAway(Math.min(20, away + 1))}
              className="w-8 h-8 rounded bg-white/10 hover:bg-white/20 font-bold transition-colors"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={() => mutate()}
        disabled={isPending}
        className="btn-primary w-full mt-4"
      >
        {isPending ? 'Guardando...' : 'Guardar predicción'}
      </button>
    </div>
  );
}
