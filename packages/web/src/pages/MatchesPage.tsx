import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { matchesApi, teamsApi } from '@/services/api';
import { MatchCard } from '@/components/matches/MatchCard';
import type { Match, MatchPhase, Team } from '../../../shared/types';
import { PHASE_LABELS } from '../../../shared/constants/odds';

const PHASES: { value: string; label: string }[] = [
  { value: 'ROUND_OF_16', label: 'Octavos' },
  { value: 'QUARTER_FINALS', label: 'Cuartos' },
  { value: 'SEMI_FINALS', label: 'Semis' },
  { value: 'FINAL', label: 'Final' },
  { value: 'ROUND_OF_32', label: 'Dieciseisavos' },
  { value: '', label: 'Todos' },
  { value: 'GROUP_STAGE', label: 'Grupos' },
];

// 8 best third-place teams that qualified for Round of 32
const THIRD_PLACE_QUALIFIED = new Set(['ECU', 'BIH', 'PAR', 'SWE', 'SEN', 'ALG', 'GHA', 'COD']);

function GroupStandingsView() {
  const { data: teams, isLoading } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: () => teamsApi.list().then((r) => r.data),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass-card h-48 animate-pulse" />
        ))}
      </div>
    );
  }

  const wcTeams = (teams ?? []).filter((t) => t.group);
  const groups = [...new Set(wcTeams.map((t) => t.group as string))].sort();

  return (
    <div className="space-y-5">
      {groups.map((group) => {
        const groupTeams = wcTeams
          .filter((t) => t.group === group)
          .sort((a, b) =>
            b.points !== a.points ? b.points - a.points :
            b.goalDifference !== a.goalDifference ? b.goalDifference - a.goalDifference :
            b.goalsFor - a.goalsFor
          );

        return (
          <div key={group} className="glass-card overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5">
              <h2 className="font-bold text-base">Grupo {group}</h2>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[1fr_repeat(8,_auto)] items-center px-3 py-1.5 border-b border-white/5">
              <span className="text-[10px] text-text-muted uppercase tracking-wide">Equipo</span>
              {['PJ','G','E','P','GF','GC','DG','Pts'].map((col) => (
                <span
                  key={col}
                  className={`text-[10px] text-text-muted text-center w-7 ${col === 'Pts' ? 'font-bold text-white' : ''}`}
                >
                  {col}
                </span>
              ))}
            </div>

            {/* Team rows */}
            <div className="divide-y divide-white/5">
              {groupTeams.map((team, idx) => {
                const direct = idx < 2;
                const thirdQualified = idx === 2 && THIRD_PLACE_QUALIFIED.has(team.code);
                const qualified = direct || thirdQualified;
                return (
                  <div
                    key={team.id}
                    className={`grid grid-cols-[1fr_repeat(8,_auto)] items-center px-3 py-2.5 ${qualified ? '' : 'opacity-60'}`}
                  >
                    {/* Team name with position and flag */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-0.5 h-6 rounded-full shrink-0 ${direct ? 'bg-primary-400' : thirdQualified ? 'bg-orange-400' : 'bg-white/10'}`} />
                      <span className="text-xs text-text-muted w-4 shrink-0">{idx + 1}</span>
                      <img src={team.flag} alt={team.name} className="w-6 h-6 object-cover rounded shrink-0" />
                      <span className="text-sm font-medium truncate">{team.name}</span>
                      {thirdQualified && <span className="text-[9px] text-orange-400 font-semibold shrink-0">3°</span>}
                    </div>
                    {[team.played, team.won, team.drawn, team.lost, team.goalsFor, team.goalsAgainst, team.goalDifference].map((val, i) => (
                      <span key={i} className="text-xs text-center w-7 text-text-muted">
                        {val}
                      </span>
                    ))}
                    <span className="text-xs font-bold text-center w-7 text-white">{team.points}</span>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="px-4 py-2 border-t border-white/5 flex flex-wrap items-center gap-x-4 gap-y-1">
              <div className="flex items-center gap-1.5">
                <div className="w-0.5 h-3 rounded-full bg-primary-400" />
                <span className="text-[10px] text-text-muted">Clasificado directo</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-0.5 h-3 rounded-full bg-orange-400" />
                <span className="text-[10px] text-text-muted">Mejor 3° clasificado</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MatchesPage() {
  const [phase, setPhase] = useState('ROUND_OF_16');

  const { data: matches, isLoading } = useQuery<Match[]>({
    queryKey: ['matches', phase],
    queryFn: () => {
      if (phase === '') return matchesApi.list({ all: 'true' }).then((r) => r.data);
      return matchesApi.list(phase ? { phase } : undefined).then((r) => r.data);
    },
    refetchInterval: 30_000,
  });

  const { data: liveMatches } = useQuery<Match[]>({
    queryKey: ['matches', 'live'],
    queryFn: () => matchesApi.live().then((r) => r.data),
    refetchInterval: 60_000,
  });

  const hasLive = (liveMatches?.length || 0) > 0;

  return (
    <div className="page-container space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Partidos</h1>
        {hasLive && (
          <span className="live-badge text-xs">
            <span className="w-1.5 h-1.5 bg-white rounded-full" />
            {liveMatches!.length} en vivo
          </span>
        )}
      </div>

      {/* Phase filter */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {PHASES.map((p) => (
          <button
            key={p.value}
            onClick={() => setPhase(p.value)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              phase === p.value
                ? 'bg-primary-600 text-white'
                : 'bg-white/5 text-text-muted hover:bg-white/10'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Live matches banner */}
      {hasLive && !phase && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm font-semibold text-red-400">En Vivo</span>
          </div>
          {liveMatches!.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
          <div className="border-t border-white/10 pt-2" />
        </div>
      )}

      {/* Group standings or match list */}
      {phase === 'GROUP_STAGE' ? (
        <GroupStandingsView />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass-card h-24 animate-pulse" />
          ))}
        </div>
      ) : matches?.length === 0 ? (
        <div className="text-center text-text-muted py-12 space-y-2">
          <div className="text-4xl">
            {phase && phase !== 'GROUP_STAGE' ? '🔒' : '⚽'}
          </div>
          <p className="font-semibold text-sm">
            {phase === 'ROUND_OF_32' && 'Los 32 clasificados se definen al terminar la Fase de Grupos'}
            {phase === 'ROUND_OF_16' && 'Los equipos se definen en los Dieciseisavos'}
            {phase === 'QUARTER_FINALS' && 'Los equipos se definen en los Octavos'}
            {phase === 'SEMI_FINALS' && 'Los equipos se definen en los Cuartos de Final'}
            {phase === 'FINAL' && 'Los finalistas se definen en las Semifinales'}
            {(!phase || phase === 'GROUP_STAGE') && 'No hay partidos en esta fase todavía'}
          </p>
          {phase && phase !== 'GROUP_STAGE' && (
            <p className="text-xs text-text-muted/60">Los partidos aparecerán aquí cuando los equipos clasifiquen</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {matches?.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      )}
    </div>
  );
}
