import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable';

export default function LeaderboardPage() {
  return (
    <div className="page-container space-y-4">
      <h1 className="text-2xl font-bold">Clasificación</h1>
      <div className="glass-card p-3 text-xs text-text-muted grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-success font-bold text-base">3 pts</div>
          <div>Marcador exacto</div>
        </div>
        <div>
          <div className="text-warning font-bold text-base">2 pts</div>
          <div>Resultado correcto</div>
        </div>
        <div>
          <div className="text-primary-400 font-bold text-base">1 pt</div>
          <div>Goles de un equipo</div>
        </div>
      </div>
      <LeaderboardTable />
    </div>
  );
}
