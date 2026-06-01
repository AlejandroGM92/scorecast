import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuthStore } from '@/store/auth.store';
import { leaderboardApi, authApi, teamsApi } from '@/services/api';

// ─── Change Password ──────────────────────────────────────────────────────────
function ChangePasswordSection() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const { mutate, isPending } = useMutation({
    mutationFn: () => authApi.changePassword(current, next),
    onSuccess: () => {
      toast.success('Contraseña actualizada');
      setOpen(false);
      setCurrent(''); setNext(''); setConfirm('');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error al cambiar contraseña'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) { toast.error('Las contraseñas no coinciden'); return; }
    if (next.length < 6) { toast.error('Mínimo 6 caracteres'); return; }
    mutate();
  };

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between text-sm hover:bg-white/5 transition-colors"
      >
        <span className="font-semibold">🔑 Cambiar contraseña</span>
        <span className="text-text-muted text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <form onSubmit={handleSubmit} className="px-4 pb-4 pt-1 space-y-3 border-t border-white/5">
          <input
            type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
            className="input-field w-full" placeholder="Contraseña actual" required
          />
          <input
            type="password" value={next} onChange={(e) => setNext(e.target.value)}
            className="input-field w-full" placeholder="Nueva contraseña (mín. 6 caracteres)" required
          />
          <input
            type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            className="input-field w-full" placeholder="Confirmar nueva contraseña" required
          />
          <button type="submit" disabled={isPending} className="btn-primary w-full">
            {isPending ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
        </form>
      )}
    </div>
  );
}

// ─── Edit Profile (email / username) ─────────────────────────────────────────
function EditProfileSection({ currentEmail, currentUsername, currentWhatsapp }: { currentEmail: string; currentUsername: string; currentWhatsapp?: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(currentEmail);
  const [username, setUsername] = useState(currentUsername);
  const [whatsapp, setWhatsapp] = useState(currentWhatsapp || '');
  const { setAuth, token, user } = useAuthStore();

  const { mutate, isPending } = useMutation({
    mutationFn: () => authApi.updateProfile({ email, username, whatsappNumber: whatsapp || null }),
    onSuccess: ({ data }) => {
      toast.success('Perfil actualizado');
      // Update local store
      if (user && token) setAuth({ ...user, email: data.email, username: data.username }, token);
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error al actualizar'),
  });

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between text-sm hover:bg-white/5 transition-colors"
      >
        <span className="font-semibold">✏️ Editar perfil</span>
        <span className="text-text-muted text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-white/5">
          <div>
            <label className="block text-xs text-text-muted mb-1">Nombre de usuario</label>
            <input
              type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              className="input-field w-full" placeholder="Username"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="input-field w-full" placeholder="Email"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">
              WhatsApp <span className="text-text-muted/50">(con código de país, ej: 573001234567)</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-lg">📱</span>
              <input
                type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ''))}
                className="input-field flex-1" placeholder="573001234567"
                maxLength={15}
              />
              {whatsapp && (
                <button onClick={() => setWhatsapp('')} className="text-text-muted hover:text-danger text-xs px-2">✕</button>
              )}
            </div>
            <p className="text-[10px] text-text-muted mt-1">Recibirás recordatorios de partidos por WhatsApp</p>
          </div>
          <button onClick={() => mutate()} disabled={isPending} className="btn-primary w-full">
            {isPending ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 2FA Section ──────────────────────────────────────────────────────────────
function TwoFactorSection({ enabled }: { enabled: boolean }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<'idle' | 'setup' | 'disable'>('idle');
  const [code, setCode] = useState('');
  const [qrData, setQrData] = useState<{ qrDataUrl: string; secret: string } | null>(null);

  const setupMutation = useMutation({
    mutationFn: () => authApi.setup2FA(),
    onSuccess: ({ data }) => { setQrData(data); setStep('setup'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error'),
  });

  const enableMutation = useMutation({
    mutationFn: () => authApi.enable2FA(code),
    onSuccess: () => {
      toast.success('2FA activado correctamente');
      qc.invalidateQueries({ queryKey: ['profile'] });
      setStep('idle'); setCode(''); setQrData(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Código incorrecto'),
  });

  const disableMutation = useMutation({
    mutationFn: () => authApi.disable2FA(code),
    onSuccess: () => {
      toast.success('2FA desactivado');
      qc.invalidateQueries({ queryKey: ['profile'] });
      setStep('idle'); setCode('');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Código incorrecto'),
  });

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">🔐 Autenticación en dos pasos (2FA)</p>
          <p className="text-xs text-text-muted mt-0.5">
            {enabled ? 'Activo — tu cuenta está protegida con Google Authenticator' : 'Inactivo'}
          </p>
        </div>
        <span className={clsx('text-xs font-bold px-2 py-1 rounded-full', enabled ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-text-muted')}>
          {enabled ? 'ON' : 'OFF'}
        </span>
      </div>

      {/* Idle state */}
      {step === 'idle' && (
        <button
          onClick={() => enabled ? setStep('disable') : setupMutation.mutate()}
          disabled={setupMutation.isPending}
          className={clsx('w-full py-2 rounded-lg text-sm font-semibold transition-colors', enabled ? 'bg-danger/20 text-danger hover:bg-danger/30' : 'btn-secondary')}
        >
          {setupMutation.isPending ? 'Generando QR...' : enabled ? 'Desactivar 2FA' : 'Activar 2FA'}
        </button>
      )}

      {/* Setup: show QR */}
      {step === 'setup' && qrData && (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            1. Abre <strong className="text-white">Google Authenticator</strong> (o similar)<br />
            2. Escanea el QR<br />
            3. Ingresa el código de 6 dígitos para confirmar
          </p>
          <div className="flex justify-center">
            <img src={qrData.qrDataUrl} alt="QR 2FA" className="w-48 h-48 rounded-lg bg-white p-2" />
          </div>
          <p className="text-xs text-center text-text-muted">
            Clave manual: <span className="font-mono text-white">{qrData.secret}</span>
          </p>
          <input
            type="text" inputMode="numeric" maxLength={6}
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="input-field w-full text-center text-2xl tracking-widest font-mono"
            placeholder="000000"
          />
          <div className="flex gap-2">
            <button onClick={() => { setStep('idle'); setCode(''); setQrData(null); }} className="btn-secondary flex-1 text-sm">
              Cancelar
            </button>
            <button
              onClick={() => enableMutation.mutate()}
              disabled={code.length !== 6 || enableMutation.isPending}
              className="btn-primary flex-1 text-sm"
            >
              {enableMutation.isPending ? 'Verificando...' : 'Activar'}
            </button>
          </div>
        </div>
      )}

      {/* Disable: enter code */}
      {step === 'disable' && (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">Ingresa el código de Google Authenticator para desactivar:</p>
          <input
            type="text" inputMode="numeric" maxLength={6}
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="input-field w-full text-center text-2xl tracking-widest font-mono"
            placeholder="000000"
          />
          <div className="flex gap-2">
            <button onClick={() => { setStep('idle'); setCode(''); }} className="btn-secondary flex-1 text-sm">
              Cancelar
            </button>
            <button
              onClick={() => disableMutation.mutate()}
              disabled={code.length !== 6 || disableMutation.isPending}
              className="bg-danger hover:bg-danger/80 text-white flex-1 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {disableMutation.isPending ? 'Desactivando...' : 'Desactivar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Champion Selector ────────────────────────────────────────────────────────
function ChampionSection() {
  const { user, setAuth, token } = useAuthStore();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const { data: teams } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsApi.list().then((r) => r.data),
  });

  const { mutate: saveChampion, isPending } = useMutation({
    mutationFn: (code: string) => authApi.updateChampion(code),
    onSuccess: ({ data }) => {
      toast.success('¡Campeón guardado!');
      qc.invalidateQueries({ queryKey: ['profile'] });
      if (user && token) setAuth({ ...user, championPrediction: data.championPrediction, championOdds: data.championOdds }, token);
      setSelected(null);
      setConfirming(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error'),
  });

  const alreadyPicked = !!user?.championPrediction;
  const pickedTeam = teams?.find((t: any) => t.code === user?.championPrediction);
  const selectedTeam = teams?.find((t: any) => t.code === selected);
  const sorted = teams ? [...teams].filter((t: any) => t.group).sort((a: any, b: any) => a.championOdds - b.championOdds) : [];

  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-sm text-text-muted uppercase tracking-wide">Predicción del Campeón</h2>

      {alreadyPicked ? (
        /* ── Already picked: stat box ── */
        <div className="glass-card p-4 flex items-center gap-4">
          <img src={pickedTeam?.flag} alt={pickedTeam?.name} className="w-14 h-14 object-cover rounded-xl border border-white/10" />
          <div className="flex-1">
            <p className="text-xs text-text-muted uppercase tracking-wide mb-0.5">Tu campeón elegido</p>
            <p className="text-xl font-black">{pickedTeam?.name ?? user?.championPrediction}</p>
            <p className="text-xs text-primary-400 font-semibold mt-0.5">
              Bonus si ganan: +{Math.round(user?.championOdds ?? 0)} pts
            </p>
          </div>
          <div className="text-4xl">🏆</div>
        </div>
      ) : (
        /* ── Selector: two columns ── */
        <div className="glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <p className="text-sm font-semibold">Elige tu campeón del Mundial 2026</p>
            <p className="text-xs text-text-muted mt-0.5">Solo puedes elegir una vez — es irreversible</p>
          </div>

          <div className="grid grid-cols-[1fr_auto] divide-x divide-white/5">
            {/* Left: team grid */}
            <div className="p-3 max-h-72 overflow-y-auto">
              <div className="grid grid-cols-1 gap-1.5">
                {sorted.map((team: any) => (
                  <button
                    key={team.code}
                    onClick={() => { setSelected(team.code === selected ? null : team.code); setConfirming(false); }}
                    className={clsx(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all',
                      selected === team.code
                        ? 'bg-primary-500/20 ring-1 ring-primary-400'
                        : 'hover:bg-white/5'
                    )}
                  >
                    <img src={team.flag} alt={team.name} className="w-8 h-8 object-cover rounded shrink-0" />
                    <span className="text-sm font-medium truncate flex-1">{team.name}</span>
                    <span className="text-xs text-primary-400 font-bold shrink-0">+{Math.round(team.championOdds)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: odds table */}
            <div className="w-28 flex flex-col">
              <div className="px-2 py-2 border-b border-white/5 text-[10px] text-text-muted font-semibold text-center uppercase">Cuotas</div>
              <div className="overflow-y-auto max-h-72 divide-y divide-white/5">
                {sorted.map((team: any, i: number) => (
                  <div key={team.code} className="flex items-center gap-1.5 px-2 py-1.5">
                    <span className="text-[10px] text-text-muted w-4 shrink-0">#{i + 1}</span>
                    <img src={team.flag} alt={team.code} className="w-5 h-5 object-cover rounded shrink-0" />
                    <span className="text-[10px] font-bold text-primary-400 ml-auto">+{Math.round(team.championOdds)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Confirm banner */}
          {selected && !confirming && (
            <div className="px-4 py-3 border-t border-white/10 bg-primary-500/5 flex items-center gap-3">
              <img src={selectedTeam?.flag} alt="" className="w-8 h-8 rounded object-cover" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{selectedTeam?.name}</p>
                <p className="text-xs text-text-muted">¿Confirmas? No podrás cambiar después.</p>
              </div>
              <button onClick={() => setConfirming(true)} className="btn-primary text-xs px-3 py-1.5 shrink-0">
                Confirmar
              </button>
            </div>
          )}
          {selected && confirming && (
            <div className="px-4 py-3 border-t border-white/10 bg-yellow-500/5 flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <p className="flex-1 text-xs text-yellow-300">Esta acción es <strong>irreversible</strong>. ¿Seguro?</p>
              <button onClick={() => setConfirming(false)} className="btn-secondary text-xs px-3 py-1.5">Cancelar</button>
              <button onClick={() => saveChampion(selected)} disabled={isPending} className="btn-primary text-xs px-3 py-1.5">
                {isPending ? '...' : '¡Sí!'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main ProfilePage ─────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { user, setAuth, token } = useAuthStore();

  const { data: stats, dataUpdatedAt: statsUpdatedAt } = useQuery({
    queryKey: ['leaderboard', 'me'],
    queryFn: () => leaderboardApi.me().then((r) => r.data),
    refetchInterval: 30_000,
  });

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => authApi.me().then((r) => r.data),
    refetchInterval: 30_000,
  });

  // Keep Zustand store in sync with fresh profile data so navbar/other pages reflect current points
  useEffect(() => {
    if (profile && user && token) {
      setAuth({
        ...user,
        totalPoints: profile.totalPoints,
        exactScores: profile.exactScores,
        correctResults: profile.correctResults,
        correctGoals: profile.correctGoals,
      }, token);
    }
  }, [profile]);

  const hasPasswordAuth = !user?.oauthProvider || user.oauthProvider === 'local';
  const isAdmin = user?.role === 'ADMIN';

  // Use profile (server truth) with user store as fallback while loading
  const totalPoints   = profile?.totalPoints   ?? user?.totalPoints   ?? 0;
  const exactScores   = profile?.exactScores   ?? user?.exactScores   ?? 0;
  const correctResults = profile?.correctResults ?? user?.correctResults ?? 0;
  const rank          = stats?.rank;

  const lastUpdated = statsUpdatedAt ? new Date(statsUpdatedAt) : null;

  return (
    <div className="page-container space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Perfil</h1>
        {lastUpdated && (
          <span className="text-[11px] text-text-muted flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
            En vivo · 30s
          </span>
        )}
      </div>

      {/* User info */}
      <div className="glass-card p-4 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary-700 flex items-center justify-center text-2xl font-bold shrink-0">
          {user?.username?.[0]?.toUpperCase()}
        </div>
        <div>
          <div className="font-bold text-lg">{user?.username}</div>
          <div className="text-text-muted text-sm">{user?.email}</div>
          {user?.oauthProvider && (
            <span className="text-xs text-text-muted capitalize">via {user.oauthProvider}</span>
          )}
        </div>
      </div>

      {/* Stats grid: 2x2 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card p-4 text-center">
          <div className="text-3xl font-black text-success">{totalPoints}</div>
          <div className="text-xs text-text-muted mt-1">Puntos totales</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-3xl font-black text-primary-400">#{rank ?? '-'}</div>
          <div className="text-xs text-text-muted mt-1">Posición</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-yellow-400">{exactScores}</div>
          <div className="text-xs text-text-muted mt-1">Marcadores exactos</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-warning">{correctResults}</div>
          <div className="text-xs text-text-muted mt-1">Resultados correctos</div>
        </div>
      </div>

      {/* Champion prediction */}
      <ChampionSection />

      {/* ── Account settings (password-based accounts) ── */}
      {hasPasswordAuth && (
        <div className="space-y-3">
          <h2 className="font-semibold text-sm text-text-muted uppercase tracking-wide">Seguridad de la cuenta</h2>
          <EditProfileSection
            currentEmail={user?.email || ''}
            currentUsername={user?.username || ''}
            currentWhatsapp={(profile as any)?.whatsappNumber || ''}
          />
          <ChangePasswordSection />
          {isAdmin && <TwoFactorSection enabled={!!profile?.twoFactorEnabled} />}
        </div>
      )}

      {/* Recent predictions */}
      {stats?.recentPredictions && stats.recentPredictions.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="p-4 border-b border-white/5">
            <h3 className="font-semibold">Últimas predicciones</h3>
          </div>
          <div className="divide-y divide-white/5">
            {stats.recentPredictions.map((pred: any) => (
              <div key={pred.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <div className="font-medium">
                    {pred.match.teamHome.name} vs {pred.match.teamAway.name}
                  </div>
                  <div className="text-xs text-text-muted">
                    {format(new Date(pred.match.dateTime), 'd MMM', { locale: es })}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{pred.predictedHome} - {pred.predictedAway}</div>
                  {pred.pointsEarned > 0 && (
                    <div className="text-xs text-success">+{pred.pointsEarned} pts</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Telegram notifications */}
      <div className="glass-card p-4 space-y-3">
        <h2 className="font-semibold text-sm text-text-muted uppercase tracking-wide">Notificaciones Telegram</h2>
        {(profile as any)?.telegramChatId ? (
          <div className="flex items-center gap-3 py-2">
            <span className="text-2xl">✅</span>
            <div>
              <p className="text-sm font-semibold">Telegram conectado</p>
              <p className="text-xs text-text-muted">Recibirás alertas 1 hora antes de cada partido</p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-text-muted">
              Recibe una alerta en Telegram 1 hora antes de cada partido para no olvidar tu predicción.
            </p>
            <div className="bg-white/5 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-white">Cómo conectar:</p>
              <ol className="text-xs text-text-muted space-y-1 list-decimal list-inside">
                <li>Abre Telegram y busca <span className="text-primary-400 font-mono">@ScorecastBot</span></li>
                <li>Envía el mensaje: <span className="text-primary-400 font-mono">/link {user?.username}</span></li>
                <li>Listo, recibirás un mensaje de confirmación</li>
              </ol>
            </div>
          </>
        )}
      </div>

      {/* Help section */}
      <div className="glass-card p-4 space-y-2">
        <h2 className="font-semibold text-sm text-text-muted uppercase tracking-wide">Ayuda</h2>
        <p className="text-sm text-text-muted">
          Para reportar cualquier inconsistencia o problema con la app, comunícate con nosotros por WhatsApp.
        </p>
        <a
          href="https://wa.me/573162322729?text=Hola%2C%20necesito%20ayuda%20con%20la%20app%20SCORECAST%20%F0%9F%8F%86"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 w-full py-2.5 px-4 rounded-lg bg-green-600 hover:bg-green-500 transition-colors text-white font-semibold text-sm justify-center"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          Escribir al WhatsApp
        </a>
      </div>
    </div>
  );
}
