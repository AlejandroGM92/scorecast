import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { authApi, teamsApi } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';

interface Team {
  id: string;
  code: string;
  name: string;
  flag: string;
  group: string | null;
  championOdds: number;
}

const POINTS_ROWS = [
  {
    icon: '🎯',
    label: 'Marcador exacto',
    desc: 'Predices el resultado exacto (ej: 2-1)',
    pts: 3,
    color: 'text-yellow-400',
  },
  {
    icon: '✅',
    label: 'Resultado correcto',
    desc: 'Aciertas quién gana o que hay empate',
    pts: 2,
    color: 'text-green-400',
  },
  {
    icon: '⚽',
    label: 'Goles del local',
    desc: 'Aciertas los goles del equipo local',
    pts: 1,
    color: 'text-blue-400',
  },
  {
    icon: '⚽',
    label: 'Goles del visitante',
    desc: 'Aciertas los goles del equipo visitante',
    pts: 1,
    color: 'text-cyan-400',
  },
];

export default function RulesPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => authApi.me().then((r) => r.data),
  });

  const { data: teams, isLoading: teamsLoading } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: () => teamsApi.list().then((r) => r.data),
  });

  const { mutate: saveChampion, isPending } = useMutation({
    mutationFn: (teamCode: string) => authApi.updateChampion(teamCode),
    onSuccess: ({ data }) => {
      toast.success('¡Predicción del campeón guardada!');
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setConfirmed(false);
      setSelected(null);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Error al guardar');
      setConfirmed(false);
    },
  });

  const alreadyPredicted = !!profile?.championPrediction;
  const championLocked = false; // TODO: fetch from /api/config/public when available
  const isLocked = alreadyPredicted || championLocked;

  const selectedTeam = teams?.find((t) => t.code === selected);
  const predictedTeam = teams?.find((t) => t.code === profile?.championPrediction);

  return (
    <div className="page-container space-y-6">
      <h1 className="text-2xl font-bold">Reglas y Campeón</h1>

      {/* ── Points system ── */}
      <section className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h2 className="font-bold text-lg">Sistema de puntos</h2>
          <p className="text-text-muted text-sm mt-0.5">Por cada partido que predices puedes ganar:</p>
        </div>

        <div className="divide-y divide-white/5">
          {POINTS_ROWS.map((row) => (
            <div key={row.label} className="flex items-center gap-4 px-5 py-4">
              <span className="text-2xl w-8 text-center">{row.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{row.label}</p>
                <p className="text-text-muted text-xs">{row.desc}</p>
              </div>
              <span className={clsx('text-2xl font-black', row.color)}>
                {row.pts}
                <span className="text-xs font-normal text-text-muted ml-1">pts</span>
              </span>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 bg-white/2 border-t border-white/5">
          <p className="text-xs text-text-muted">
            💡 Los puntos son acumulativos — puedes ganar hasta <strong className="text-white">7 pts</strong> por partido si aciertas el marcador exacto (3 + 2 + 1 + 1).
          </p>
        </div>
      </section>

      {/* ── Example ── */}
      <section className="glass-card p-5 space-y-4">
        <h3 className="font-semibold text-sm text-text-muted uppercase tracking-wide">Ejemplos</h3>

        {/* Example 1: exact score */}
        <div className="space-y-2">
          <p className="text-xs text-text-muted font-semibold uppercase tracking-wide">Ejemplo 1 — Marcador exacto</p>
          <div className="flex items-start justify-between text-sm gap-4">
            <div>
              <p className="font-semibold">Real: <span className="text-white">España 2 – 1 Argentina</span></p>
              <p className="text-text-muted mt-0.5">Tu predicción: <span className="text-white">España 2 – 1 Argentina</span></p>
            </div>
            <div className="text-right space-y-0.5 shrink-0">
              <p className="text-yellow-400 font-semibold">+3 pts marcador ✓</p>
              <p className="text-green-400 font-semibold">+2 pts ganador ✓</p>
              <p className="text-blue-400 font-semibold">+1 pt goles local ✓</p>
              <p className="text-cyan-400 font-semibold">+1 pt goles visitante ✓</p>
              <p className="font-bold text-white border-t border-white/10 pt-1 mt-1">Total: 7 pts</p>
            </div>
          </div>
        </div>

        <div className="border-t border-white/5" />

        {/* Example 2: correct winner only */}
        <div className="space-y-2">
          <p className="text-xs text-text-muted font-semibold uppercase tracking-wide">Ejemplo 2 — Solo aciertas el ganador</p>
          <div className="flex items-start justify-between text-sm gap-4">
            <div>
              <p className="font-semibold">Real: <span className="text-white">España 2 – 1 Argentina</span></p>
              <p className="text-text-muted mt-0.5">Tu predicción: <span className="text-white">España 3 – 0 Argentina</span></p>
            </div>
            <div className="text-right space-y-0.5 shrink-0">
              <p className="text-text-muted font-semibold">+0 pts marcador ✗</p>
              <p className="text-green-400 font-semibold">+2 pts ganador ✓</p>
              <p className="text-text-muted font-semibold">+0 pt goles local ✗</p>
              <p className="text-text-muted font-semibold">+0 pt goles visitante ✗</p>
              <p className="font-bold text-white border-t border-white/10 pt-1 mt-1">Total: 2 pts</p>
            </div>
          </div>
        </div>

        <div className="border-t border-white/5" />

        {/* Example 3: winner + local goals */}
        <div className="space-y-2">
          <p className="text-xs text-text-muted font-semibold uppercase tracking-wide">Ejemplo 3 — Aciertas el ganador y los goles del local</p>
          <div className="flex items-start justify-between text-sm gap-4">
            <div>
              <p className="font-semibold">Real: <span className="text-white">Brasil 2 – 0 Colombia</span></p>
              <p className="text-text-muted mt-0.5">Tu predicción: <span className="text-white">Brasil 2 – 1 Colombia</span></p>
            </div>
            <div className="text-right space-y-0.5 shrink-0">
              <p className="text-text-muted font-semibold">+0 pts marcador ✗</p>
              <p className="text-green-400 font-semibold">+2 pts ganador ✓</p>
              <p className="text-blue-400 font-semibold">+1 pt goles local ✓</p>
              <p className="text-text-muted font-semibold">+0 pt goles visitante ✗</p>
              <p className="font-bold text-white border-t border-white/10 pt-1 mt-1">Total: 3 pts</p>
            </div>
          </div>
        </div>

        <div className="border-t border-white/5" />

        {/* Example 4: only one team goals */}
        <div className="space-y-2">
          <p className="text-xs text-text-muted font-semibold uppercase tracking-wide">Ejemplo 4 — Solo aciertas los goles de un equipo</p>
          <div className="flex items-start justify-between text-sm gap-4">
            <div>
              <p className="font-semibold">Real: <span className="text-white">Francia 2 – 1 México</span></p>
              <p className="text-text-muted mt-0.5">Tu predicción: <span className="text-white">Francia 2 – 2 México</span></p>
              <p className="text-xs text-text-muted mt-1">Predijiste empate pero ganó Francia.<br/>Acertaste los goles del local (2).</p>
            </div>
            <div className="text-right space-y-0.5 shrink-0">
              <p className="text-text-muted font-semibold">+0 pts marcador ✗</p>
              <p className="text-text-muted font-semibold">+0 pts ganador ✗</p>
              <p className="text-blue-400 font-semibold">+1 pt goles local ✓</p>
              <p className="text-text-muted font-semibold">+0 pt goles visitante ✗</p>
              <p className="font-bold text-white border-t border-white/10 pt-1 mt-1">Total: 1 pt</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Tiebreaker ── */}
      <section className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h2 className="font-bold text-lg">Desempate</h2>
          <p className="text-text-muted text-sm mt-0.5">
            Si dos o más jugadores terminan con los mismos puntos, se aplican estos criterios en orden:
          </p>
        </div>

        <div className="divide-y divide-white/5">
          {[
            {
              pos: '1°',
              icon: '🎯',
              label: 'Más marcadores exactos',
              desc: 'Quien haya acertado más veces el resultado exacto (ej: 2-1)',
              color: 'text-yellow-400',
            },
            {
              pos: '2°',
              icon: '✅',
              label: 'Más resultados correctos',
              desc: 'Quien haya acertado más veces el ganador o empate',
              color: 'text-green-400',
            },
            {
              pos: '3°',
              icon: '⚽',
              label: 'Más goles acertados',
              desc: 'Suma de goles individuales acertados (local + visitante)',
              color: 'text-blue-400',
            },
            {
              pos: '4°',
              icon: '🏆',
              label: 'Campeón correcto',
              desc: 'Quien haya predicho correctamente al campeón del Mundial',
              color: 'text-orange-400',
            },
            {
              pos: '5°',
              icon: '📋',
              label: 'Más partidos predichos',
              desc: 'Quien haya participado en más partidos en total',
              color: 'text-purple-400',
            },
          ].map((row) => (
            <div key={row.pos} className="flex items-center gap-4 px-5 py-3.5">
              <span className="text-xs font-bold text-text-muted/60 w-5 shrink-0">{row.pos}</span>
              <span className="text-xl w-7 text-center shrink-0">{row.icon}</span>
              <div className="flex-1 min-w-0">
                <p className={clsx('font-semibold text-sm', row.color)}>{row.label}</p>
                <p className="text-text-muted text-xs">{row.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 bg-white/2 border-t border-white/5">
          <p className="text-xs text-text-muted">
            💡 Si persiste el empate después de todos los criterios, los jugadores comparten la misma posición.
          </p>
        </div>
      </section>

      {/* ── Champion prediction ── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-bold">Predicción del Campeón</h2>
          <p className="text-text-muted text-sm mt-1">
            Elige el campeón del Mundial 2026. Solo puedes hacerlo <strong className="text-white">una vez</strong> y
            se bloquea cuando empiece el torneo.
          </p>
        </div>

        {/* Already predicted */}
        {alreadyPredicted && predictedTeam && (
          <div className="glass-card p-5 flex items-center gap-4">
            <img src={predictedTeam.flag} alt={predictedTeam.name} className="w-14 h-14 object-cover rounded-lg" />
            <div className="flex-1">
              <p className="text-xs text-text-muted uppercase tracking-wide mb-1">Tu campeón</p>
              <p className="text-xl font-bold">{predictedTeam.name}</p>
              <p className="text-xs text-text-muted mt-1">
                Bonus si ganan: <span className="text-primary-400 font-semibold">+{Math.round(profile.championOdds ?? 0)}</span> pts
              </p>
            </div>
            <div className="text-3xl">🏆</div>
          </div>
        )}

        {/* Locked by tournament start */}
        {!alreadyPredicted && championLocked && (
          <div className="glass-card p-5 text-center space-y-2">
            <div className="text-3xl">🔒</div>
            <p className="font-semibold">Predicción cerrada</p>
            <p className="text-text-muted text-sm">El Mundial ya comenzó. Las predicciones del campeón están cerradas.</p>
          </div>
        )}

        {/* Team selection grid */}
        {!isLocked && (
          <>
            {teamsLoading || profileLoading ? (
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="glass-card h-20 animate-pulse" />
                ))}
              </div>
            ) : (
              <>
                {/* Group by group */}
                {[...new Set(teams?.map((t) => t.group).filter(Boolean))].sort().map((group) => {
                  const groupTeams = teams?.filter((t) => t.group === group) ?? [];
                  if (groupTeams.length === 0) return null;
                  return (
                    <div key={group}>
                      <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                        Grupo {group}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {groupTeams.map((team) => (
                          <button
                            key={team.code}
                            onClick={() => {
                              setSelected(team.code === selected ? null : team.code);
                              setConfirmed(false);
                            }}
                            className={clsx(
                              'glass-card p-3 flex items-center gap-3 text-left transition-all duration-150',
                              selected === team.code
                                ? 'ring-2 ring-primary-400 bg-primary-500/10'
                                : 'hover:bg-white/5'
                            )}
                          >
                            <img src={team.flag} alt={team.name} className="w-10 h-10 object-cover rounded" />
                            <div className="min-w-0">
                              <p className="font-semibold text-sm truncate">{team.name}</p>
                              <p className="text-xs text-primary-400 font-semibold">+{Math.round(team.championOdds)} pts</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Confirm step */}
                {selected && !confirmed && (
                  <div className="glass-card p-4 flex items-center gap-4 border border-primary-500/30">
                    <img src={selectedTeam?.flag} alt={selectedTeam?.name} className="w-12 h-12 object-cover rounded" />
                    <div className="flex-1">
                      <p className="font-semibold">{selectedTeam?.name}</p>
                      <p className="text-xs text-text-muted">¿Confirmas esta predicción? No podrás cambiarla.</p>
                    </div>
                    <button
                      onClick={() => setConfirmed(true)}
                      className="btn-primary text-sm px-4 py-2 shrink-0"
                    >
                      Confirmar
                    </button>
                  </div>
                )}

                {selected && confirmed && (
                  <button
                    onClick={() => saveChampion(selected)}
                    disabled={isPending}
                    className="btn-primary w-full py-3 text-base font-bold"
                  >
                    {isPending ? 'Guardando...' : `🏆 ¡${selectedTeam?.name} campeón del mundo!`}
                  </button>
                )}
              </>
            )}
          </>
        )}

        {/* Odds table */}
        {teams && teams.length > 0 && (
          <div className="glass-card overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5">
              <h3 className="font-semibold text-sm">Tabla de bonus por campeón</h3>
              <p className="text-xs text-text-muted">Puntos que se suman a tu total si aciertas al campeón</p>
            </div>
            <div className="divide-y divide-white/5 max-h-64 overflow-y-auto">
              {[...teams].filter(t => t.group).sort((a, b) => a.championOdds - b.championOdds).map((team) => (
                <div key={team.code} className="flex items-center gap-3 px-4 py-2.5">
                  <img src={team.flag} alt={team.name} className="w-7 h-7 object-cover rounded" />
                  <span className="flex-1 text-sm font-medium">{team.name}</span>
                  <span className="text-sm font-bold text-primary-400">+{Math.round(team.championOdds)}</span>
                  <span className="text-xs text-text-muted w-8 text-right">pts</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
