import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { adminApi, authApi } from '@/services/api';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Pencil, Trash2, RefreshCw } from 'lucide-react';

type Tab = 'tokens' | 'users' | 'matches' | 'predicciones' | 'api' | 'cuenta';

// ─── Edit User Modal ────────────────────────────────────────────────────────
function EditUserModal({
  user,
  onClose,
}: {
  user: any;
  onClose: () => void;
}) {
  const [role, setRole] = useState<'ADMIN' | 'PLAYER'>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [email, setEmail] = useState(user.email);
  const [username, setUsername] = useState(user.username);
  const qc = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: () => adminApi.users.update(user.id, { role, isActive, email, username }),
    onSuccess: () => {
      toast.success('Usuario actualizado');
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass-card w-full max-w-sm p-6 space-y-4 animate-slide-up">
        <h3 className="font-bold text-lg">Editar usuario</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">Nombre de usuario</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-field w-full"
            />
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field w-full"
            />
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1">Rol</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'ADMIN' | 'PLAYER')}
              className="input-field w-full bg-[#0f1729] text-white"
            >
              <option value="PLAYER" className="bg-[#0f1729] text-white">Player</option>
              <option value="ADMIN"  className="bg-[#0f1729] text-white">Admin</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Estado</span>
            <button
              onClick={() => setIsActive(!isActive)}
              className={clsx(
                'px-3 py-1 rounded-full text-xs font-semibold transition-colors',
                isActive ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
              )}
            >
              {isActive ? 'Activo' : 'Inactivo'}
            </button>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={() => mutate()} disabled={isPending} className="btn-primary flex-1">
            {isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Score Modal ─────────────────────────────────────────────────────────────
function ScoreModal({ match, onClose }: { match: any; onClose: () => void }) {
  const [home, setHome] = useState(match.scoreHome ?? 0);
  const [away, setAway] = useState(match.scoreAway ?? 0);
  const [penHome, setPenHome] = useState<number>(match.scoreHomePen ?? 0);
  const [penAway, setPenAway] = useState<number>(match.scoreAwayPen ?? 0);
  const [hasPenalty, setHasPenalty] = useState(!!(match.scoreHomePen !== null && match.scoreHomePen !== undefined));
  const defaultStatus = ['LOCKED', 'LIVE', 'HALFTIME'].includes(match.status) ? 'FINISHED' : match.status;
  const [status, setStatus] = useState(defaultStatus);
  const qc = useQueryClient();

  const isDraw = home === away;

  const { mutate: setScore, isPending: settingScore } = useMutation({
    mutationFn: () => adminApi.matches.setScore(match.id, status === 'SCHEDULED' ? { status } : {
      scoreHome: home, scoreAway: away, status,
      ...(status === 'FINISHED' && isDraw && hasPenalty ? { scoreHomePen: penHome, scoreAwayPen: penAway } : { scoreHomePen: null, scoreAwayPen: null }),
    }),
    onSuccess: () => {
      toast.success('Marcador actualizado');
      qc.invalidateQueries({ queryKey: ['admin', 'matches'] });
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error'),
  });

  const { mutate: calcPoints, isPending: calcPending } = useMutation({
    mutationFn: () => adminApi.forceRecalculate(match.id),
    onSuccess: (res: any) => {
      const preds = res.data?.predictions ?? [];
      const total = preds.reduce((s: number, p: any) => s + p.points, 0);
      toast.success(`Puntos calculados: ${preds.length} predicciones, ${total} pts totales`);
      qc.invalidateQueries({ queryKey: ['admin', 'matches'] });
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error al calcular puntos'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass-card w-full max-w-sm p-6 space-y-4 animate-slide-up">
        <h3 className="font-bold text-lg">Gestionar partido</h3>
        <div className="text-center text-text-muted text-sm">
          {match.teamHome.name} vs {match.teamAway.name}
        </div>

        {/* Score inputs */}
        <div className="flex items-center justify-center gap-4">
          <div className="flex flex-col items-center gap-1">
            <img src={match.teamHome.flag} className="w-10 h-10 rounded object-cover" />
            <span className="text-xs text-text-muted">{match.teamHome.code}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setHome(Math.max(0, home - 1))} className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 font-bold">−</button>
              <span className="w-8 text-center text-xl font-bold">{home}</span>
              <button onClick={() => setHome(home + 1)} className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 font-bold">+</button>
            </div>
          </div>
          <span className="text-xl text-text-muted pb-5">:</span>
          <div className="flex flex-col items-center gap-1">
            <img src={match.teamAway.flag} className="w-10 h-10 rounded object-cover" />
            <span className="text-xs text-text-muted">{match.teamAway.code}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setAway(Math.max(0, away - 1))} className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 font-bold">−</button>
              <span className="w-8 text-center text-xl font-bold">{away}</span>
              <button onClick={() => setAway(away + 1)} className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 font-bold">+</button>
            </div>
          </div>
        </div>

        {/* Penalty section — only when tied and FINISHED */}
        {isDraw && status === 'FINISHED' && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={hasPenalty} onChange={(e) => setHasPenalty(e.target.checked)} className="accent-primary-500" />
              <span className="text-sm text-text-muted">Hubo penaltis</span>
            </label>
            {hasPenalty && (
              <div className="flex items-center justify-center gap-4 bg-white/5 rounded-lg p-3">
                <div className="flex flex-col items-center gap-1">
                  <img src={match.teamHome.flag} className="w-7 h-7 rounded object-cover" />
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPenHome(Math.max(0, penHome - 1))} className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 font-bold text-sm">−</button>
                    <span className="w-6 text-center font-bold">{penHome}</span>
                    <button onClick={() => setPenHome(penHome + 1)} className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 font-bold text-sm">+</button>
                  </div>
                </div>
                <span className="text-text-muted text-sm pb-4">pen</span>
                <div className="flex flex-col items-center gap-1">
                  <img src={match.teamAway.flag} className="w-7 h-7 rounded object-cover" />
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPenAway(Math.max(0, penAway - 1))} className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 font-bold text-sm">−</button>
                    <span className="w-6 text-center font-bold">{penAway}</span>
                    <button onClick={() => setPenAway(penAway + 1)} className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 font-bold text-sm">+</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Status */}
        <div>
          <label className="block text-sm text-text-muted mb-1">Estado</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-field w-full bg-[#0f1729] text-white">
            <option value="SCHEDULED" className="bg-[#0f1729] text-white">Programado</option>
            <option value="LIVE"      className="bg-[#0f1729] text-white">En Vivo</option>
            <option value="HALFTIME"  className="bg-[#0f1729] text-white">Medio Tiempo</option>
            <option value="FINISHED"  className="bg-[#0f1729] text-white">Finalizado</option>
            <option value="LOCKED"    className="bg-[#0f1729] text-white">Cerrado</option>
          </select>
        </div>

        <div className="space-y-2 pt-1">
          <button onClick={() => setScore()} disabled={settingScore} className="btn-primary w-full">
            {settingScore ? 'Guardando...' : 'Guardar marcador'}
          </button>
          {status === 'FINISHED' && (
            <button onClick={() => calcPoints()} disabled={calcPending} className="btn-secondary w-full flex items-center justify-center gap-2">
              <RefreshCw size={14} />
              {calcPending ? 'Calculando...' : match.pointsCalculated ? 'Recalcular puntos' : 'Calcular puntos'}
            </button>
          )}
          <button onClick={onClose} className="btn-secondary w-full">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Change Password (Admin) ──────────────────────────────────────────────────
function ChangePasswordAdmin() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const { mutate, isPending } = useMutation({
    mutationFn: () => authApi.changePassword(current, next),
    onSuccess: () => {
      toast.success('Contraseña actualizada');
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
    <div className="glass-card p-4 space-y-4">
      <div>
        <p className="font-semibold">🔑 Cambiar contraseña</p>
        <p className="text-xs text-text-muted mt-0.5">Cambia la contraseña de tu cuenta admin</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
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
    </div>
  );
}

// ─── 2FA Admin ────────────────────────────────────────────────────────────────
function TwoFactorAdmin() {
  const qc = useQueryClient();
  const [step, setStep] = useState<'idle' | 'setup' | 'disable'>('idle');
  const [code, setCode] = useState('');
  const [qrData, setQrData] = useState<{ qrDataUrl: string; secret: string } | null>(null);

  const { data: profile } = useQuery({
    queryKey: ['admin', 'profile'],
    queryFn: () => authApi.me().then((r) => r.data),
  });

  const enabled = !!profile?.twoFactorEnabled;

  const setupMutation = useMutation({
    mutationFn: () => authApi.setup2FA(),
    onSuccess: ({ data }) => { setQrData(data); setStep('setup'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error'),
  });

  const enableMutation = useMutation({
    mutationFn: () => authApi.enable2FA(code),
    onSuccess: () => {
      toast.success('2FA activado correctamente');
      qc.invalidateQueries({ queryKey: ['admin', 'profile'] });
      setStep('idle'); setCode(''); setQrData(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Código incorrecto'),
  });

  const disableMutation = useMutation({
    mutationFn: () => authApi.disable2FA(code),
    onSuccess: () => {
      toast.success('2FA desactivado');
      qc.invalidateQueries({ queryKey: ['admin', 'profile'] });
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
            {enabled ? 'Activo — protegido con Google Authenticator' : 'Inactivo'}
          </p>
        </div>
        <span className={clsx('text-xs font-bold px-2 py-1 rounded-full', enabled ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-text-muted')}>
          {enabled ? 'ON' : 'OFF'}
        </span>
      </div>

      {step === 'idle' && (
        <button
          onClick={() => enabled ? setStep('disable') : setupMutation.mutate()}
          disabled={setupMutation.isPending}
          className={clsx('w-full py-2 rounded-lg text-sm font-semibold transition-colors', enabled ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'btn-secondary')}
        >
          {setupMutation.isPending ? 'Generando QR...' : enabled ? 'Desactivar 2FA' : 'Activar 2FA'}
        </button>
      )}

      {step === 'setup' && qrData && (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            1. Abre <strong className="text-white">Google Authenticator</strong><br />
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
            <button onClick={() => { setStep('idle'); setCode(''); setQrData(null); }} className="btn-secondary flex-1 text-sm">Cancelar</button>
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
            <button onClick={() => { setStep('idle'); setCode(''); }} className="btn-secondary flex-1 text-sm">Cancelar</button>
            <button
              onClick={() => disableMutation.mutate()}
              disabled={code.length !== 6 || disableMutation.isPending}
              className="bg-red-500 hover:bg-red-600 text-white flex-1 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {disableMutation.isPending ? 'Desactivando...' : 'Desactivar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Email Toggle ────────────────────────────────────────────────────────────
function EmailToggleCard() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'email-toggle'],
    queryFn: () => adminApi.emailToggle.get().then((r) => r.data as { enabled: boolean }),
  });

  const { mutate, isPending } = useMutation({
    mutationFn: () => adminApi.emailToggle.toggle(),
    onSuccess: ({ data: res }) => {
      qc.setQueryData(['admin', 'email-toggle'], res);
      toast.success(res.enabled ? 'Emails automáticos activados' : 'Emails automáticos desactivados');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error'),
  });

  const enabled = data?.enabled ?? false;

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm">Emails automáticos</p>
          <p className="text-xs text-text-muted mt-0.5">
            Avisa a los usuarios 1 hora antes de cada partido
          </p>
        </div>
        <button
          onClick={() => mutate()}
          disabled={isPending || isLoading}
          className={clsx(
            'relative w-12 h-6 rounded-full transition-colors duration-200 disabled:opacity-50 shrink-0',
            enabled ? 'bg-primary-500' : 'bg-white/20'
          )}
        >
          <span
            className={clsx(
              'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200',
              enabled ? 'translate-x-6' : 'translate-x-0'
            )}
          />
        </button>
      </div>
      <p className={clsx('text-xs font-semibold', enabled ? 'text-green-400' : 'text-text-muted/50')}>
        {enabled ? '● Activo — se enviarán emails cuando empiece el Mundial' : '○ Inactivo'}
      </p>
    </div>
  );
}

// ─── Champion Lock Toggle ─────────────────────────────────────────────────────
function ChampionLockCard() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'champion-lock'],
    queryFn: () => adminApi.championLock.get().then((r) => r.data as { locked: boolean }),
  });

  const { mutate, isPending } = useMutation({
    mutationFn: () => adminApi.championLock.toggle(),
    onSuccess: ({ data: res }) => {
      qc.setQueryData(['admin', 'champion-lock'], res);
      qc.invalidateQueries({ queryKey: ['champion-status'] });
      toast.success(res.locked ? 'Predicción del campeón bloqueada' : 'Predicción del campeón abierta');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error'),
  });

  const locked = data?.locked ?? false;

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm">Predicción del campeón</p>
          <p className="text-xs text-text-muted mt-0.5">
            Bloquea que cualquier usuario (nuevo o existente) escoja campeón
          </p>
        </div>
        <button
          onClick={() => mutate()}
          disabled={isPending || isLoading}
          className={clsx(
            'relative w-12 h-6 rounded-full transition-colors duration-200 disabled:opacity-50 shrink-0',
            locked ? 'bg-red-500' : 'bg-primary-500'
          )}
        >
          <span
            className={clsx(
              'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200',
              locked ? 'translate-x-6' : 'translate-x-0'
            )}
          />
        </button>
      </div>
      <p className={clsx('text-xs font-semibold', locked ? 'text-red-400' : 'text-green-400')}>
        {locked ? '🔒 Bloqueada — nadie puede escoger campeón' : '🔓 Abierta — los usuarios pueden escoger campeón'}
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
// ─── Test Notify All Button ──────────────────────────────────────────────────
function TestNotifyAllButton() {
  const [homeTeam, setHomeTeam] = useState('México');
  const [awayTeam, setAwayTeam] = useState('España');

  const { mutate, isPending } = useMutation({
    mutationFn: () => adminApi.testNotifyAll(homeTeam, awayTeam),
    onSuccess: ({ data }) => toast.success(
      `✅ Enviado: ${data.emailsSent} emails, ${data.telegramSent} Telegram a ${data.users} usuarios`
    ),
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error al enviar'),
  });

  return (
    <div className="glass-card p-4 space-y-3">
      <p className="text-sm font-semibold">🧪 Prueba de notificaciones (todos los usuarios)</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={homeTeam}
          onChange={(e) => setHomeTeam(e.target.value)}
          className="input-field flex-1 text-sm"
          placeholder="Equipo local"
        />
        <input
          type="text"
          value={awayTeam}
          onChange={(e) => setAwayTeam(e.target.value)}
          className="input-field flex-1 text-sm"
          placeholder="Equipo visitante"
        />
      </div>
      <button
        onClick={() => mutate()}
        disabled={isPending}
        className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
      >
        {isPending ? (
          <>
            <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
            Enviando...
          </>
        ) : (
          '📲 Enviar a todos (Email + Telegram)'
        )}
      </button>
    </div>
  );
}

// ─── Test Email Button ───────────────────────────────────────────────────────
function TestEmailButton() {
  const { mutate, isPending } = useMutation({
    mutationFn: () => adminApi.testEmail(),
    onSuccess: ({ data }) => toast.success(data.message || 'Email enviado'),
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error al enviar email'),
  });

  return (
    <div className="glass-card p-4 space-y-3">
      <div>
        <p className="font-semibold text-sm">Prueba de email</p>
        <p className="text-xs text-text-muted mt-0.5">
          Envía un email de ejemplo al admin para verificar la configuración SMTP.
        </p>
      </div>
      <button
        onClick={() => mutate()}
        disabled={isPending}
        className="btn-secondary flex items-center gap-2 text-sm"
      >
        {isPending ? (
          <>
            <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
            Enviando...
          </>
        ) : (
          '📧 Enviar email de prueba'
        )}
      </button>
    </div>
  );
}


export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('users');
  const [newToken, setNewToken] = useState({ code: '', maxUses: 10, description: '' });
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editingMatch, setEditingMatch] = useState<any | null>(null);
  const qc = useQueryClient();

  const { data: tokens, isLoading: loadingTokens } = useQuery({
    queryKey: ['admin', 'tokens'],
    queryFn: () => adminApi.tokens.list().then((r) => r.data),
    enabled: tab === 'tokens',
  });

  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => adminApi.users.list().then((r) => r.data),
    enabled: tab === 'users' || tab === 'predicciones',
  });

  const { data: matches, isLoading: loadingMatches } = useQuery({
    queryKey: ['admin', 'matches'],
    queryFn: () => adminApi.matches.list().then((r) => r.data),
    enabled: tab === 'matches' || tab === 'predicciones',
  });

  const { data: apiUsage } = useQuery({
    queryKey: ['admin', 'api-usage'],
    queryFn: () => adminApi.apiUsage().then((r) => r.data),
    enabled: tab === 'api',
  });

  const [predMatchId, setPredMatchId] = useState('');
  const { data: allPredictions, isLoading: loadingPreds } = useQuery({
    queryKey: ['admin', 'predictions', predMatchId],
    queryFn: () => adminApi.predictions(predMatchId || undefined).then((r) => r.data),
    enabled: tab === 'predicciones',
  });

  const deletePrediction = useMutation({
    mutationFn: (id: string) => adminApi.deletePrediction(id),
    onSuccess: (res: any) => {
      toast.success(res.data?.message || 'Predicción anulada');
      qc.invalidateQueries({ queryKey: ['admin', 'predictions'] });
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error'),
  });

  const [proxyUserId, setProxyUserId] = useState('');
  const [proxyMatchId, setProxyMatchId] = useState('');
  const [proxyHome, setProxyHome] = useState('');
  const [proxyAway, setProxyAway] = useState('');

  const predictForUser = useMutation({
    mutationFn: () => adminApi.predictForUser(proxyUserId, proxyMatchId, parseInt(proxyHome), parseInt(proxyAway)),
    onSuccess: (res: any) => {
      toast.success(res.data.message);
      setProxyHome('');
      setProxyAway('');
      qc.invalidateQueries({ queryKey: ['admin', 'predictions'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error al guardar predicción'),
  });

  const simulateMatches = useMutation({
    mutationFn: () => adminApi.simulateMatches(),
    onSuccess: ({ data }: any) => {
      toast.success(`Simulación completada: ${data.results?.length} partidos`);
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error en simulación'),
  });

  const cleanupSimulation = useMutation({
    mutationFn: () => adminApi.cleanupSimulation(),
    onSuccess: ({ data }: any) => toast.success(`Limpieza completada: ${data.deleted} partidos eliminados`),
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error en limpieza'),
  });

  const syncGroups = useMutation({
    mutationFn: () => adminApi.syncGroups(),
    onSuccess: ({ data }: any) => {
      toast.success(`Grupos actualizados: ${data.updated} equipos`);
      qc.invalidateQueries({ queryKey: ['teams'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error'),
  });

  const syncOdds = useMutation({
    mutationFn: () => adminApi.syncOdds(),
    onSuccess: ({ data }: any) => {
      toast.success(`Cuotas actualizadas: ${data.updated} equipos`);
      qc.invalidateQueries({ queryKey: ['teams'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error'),
  });

  const wcSync = useMutation({
    mutationFn: () => adminApi.wcSync(),
    onSuccess: ({ data }: any) => {
      const created = data.matchesCreated ? `, ${data.matchesCreated} creados` : '';
      toast.success(`Mundial sync: ${data.matchesUpdated} actualizados${created}, ${data.matchesNotFound} no encontrados`);
      qc.invalidateQueries({ queryKey: ['admin', 'matches'] });
      qc.invalidateQueries({ queryKey: ['matches'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error'),
  });

  const wcSyncLive = useMutation({
    mutationFn: () => adminApi.wcSyncLive(),
    onSuccess: () => {
      toast.success('Marcadores en vivo del Mundial actualizados');
      qc.invalidateQueries({ queryKey: ['admin', 'matches'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error'),
  });


  const createToken = useMutation({
    mutationFn: () => adminApi.tokens.create(newToken),
    onSuccess: () => {
      toast.success('Token creado');
      qc.invalidateQueries({ queryKey: ['admin', 'tokens'] });
      setNewToken({ code: '', maxUses: 10, description: '' });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error'),
  });

  const toggleToken = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminApi.tokens.update(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'tokens'] }),
  });

  const deleteToken = useMutation({
    mutationFn: (id: string) => adminApi.tokens.delete(id),
    onSuccess: () => {
      toast.success('Token eliminado');
      qc.invalidateQueries({ queryKey: ['admin', 'tokens'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error al eliminar'),
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => adminApi.users.delete(id),
    onSuccess: () => {
      toast.success('Usuario eliminado');
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se puede eliminar'),
  });

  const [bulkStatus, setBulkStatus] = useState('SCHEDULED');

  const syncScores = useMutation({
    mutationFn: () => adminApi.syncScores(),
    onSuccess: () => toast.success('Sincronización completada'),
    onError: () => toast.error('Error al sincronizar'),
  });

  const bulkStatusMutation = useMutation({
    mutationFn: () => adminApi.matches.bulkStatus(bulkStatus),
    onSuccess: ({ data }: any) => {
      toast.success(`${data.updated} partidos marcados como ${bulkStatus}`);
      qc.invalidateQueries({ queryKey: ['admin', 'matches'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error'),
  });

  const resetAllScores = useMutation({
    mutationFn: () => adminApi.resetAllScores(),
    onSuccess: ({ data }: any) => {
      toast.success(`Reset completo: ${data.users} usuarios y ${data.matches} partidos limpiados`);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'matches'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error'),
  });

  const clearPredictions = useMutation({
    mutationFn: () => adminApi.clearPredictions(),
    onSuccess: ({ data }: any) => {
      toast.success(`${data.deleted} predicciones eliminadas, ${data.usersReset} usuarios reseteados`);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'matches'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error'),
  });

  const calculateAllPoints = useMutation({
    mutationFn: () => adminApi.calculateAllPoints(),
    onSuccess: () => {
      toast.success('Puntos calculados para todos los partidos finalizados');
      qc.invalidateQueries({ queryKey: ['admin', 'matches'] });
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error'),
  });

  const resetAndRecalculate = useMutation({
    mutationFn: () => adminApi.resetAndRecalculate(),
    onSuccess: ({ data }: any) => {
      const top = (data.topScorers ?? []).map((u: any) => `${u.username}: ${u.totalPoints}pts`).join(' · ');
      toast.success(`✅ Recalculado. Top: ${top || 'sin puntos aún'}`);
      qc.invalidateQueries({ queryKey: ['admin', 'matches'] });
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
      qc.invalidateQueries({ queryKey: ['admin', 'predictions'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error'),
  });

  const recalculateStandings = useMutation({
    mutationFn: () => adminApi.recalculateStandings(),
    onSuccess: () => {
      toast.success('✅ Tabla de grupos actualizada');
      qc.invalidateQueries({ queryKey: ['teams'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Error'),
  });

  const TABS: { key: Tab; label: string }[] = [
    { key: 'users',        label: 'Usuarios' },
    { key: 'matches',      label: 'Partidos' },
    { key: 'predicciones', label: 'Predicciones' },
    { key: 'tokens',       label: 'Tokens' },
    { key: 'api',          label: 'API' },
    { key: 'cuenta',       label: 'Mi Cuenta' },
  ];

  return (
    <div className="page-container space-y-4">
      {editingUser && <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} />}
      {editingMatch && <ScoreModal match={editingMatch} onClose={() => setEditingMatch(null)} />}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Panel Admin</h1>
        <button onClick={() => syncScores.mutate()} disabled={syncScores.isPending} className="btn-secondary text-sm flex items-center gap-1">
          <RefreshCw size={14} className={syncScores.isPending ? 'animate-spin' : ''} />
          Sync
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
              tab === t.key ? 'border-primary-400 text-white' : 'border-transparent text-text-muted hover:text-white'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── USERS TAB ── */}
      {tab === 'users' && (
        <div className="space-y-3">
        {/* Export button */}
        <div className="flex justify-end">
          <button
            onClick={async () => {
              try {
                const res = await adminApi.exportUsers();
                const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
                const a = document.createElement('a');
                a.href = url;
                a.download = `scorecast_usuarios_${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              } catch {
                toast.error('Error al exportar usuarios');
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-text-muted hover:text-white transition-colors"
          >
            ⬇️ Descargar CSV
          </button>
        </div>
        <div className="glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5 text-xs text-text-muted grid grid-cols-[1fr_80px_60px_70px_70px] gap-2 font-medium">
            <span>Usuario</span>
            <span className="text-center">Puntos</span>
            <span className="text-center">Rol</span>
            <span className="text-center">Estado</span>
            <span className="text-center">Acciones</span>
          </div>
          <div className="divide-y divide-white/5">
            {loadingUsers ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse bg-white/5 m-2 rounded" />
              ))
            ) : users?.length === 0 ? (
              <div className="p-6 text-center text-text-muted text-sm">No hay usuarios registrados aún</div>
            ) : (
              users?.map((user: any) => (
                <div key={user.id} className="grid grid-cols-[1fr_80px_60px_70px_70px] gap-2 px-4 py-3 items-center text-sm hover:bg-white/5">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{user.username}</div>
                    <div className="text-xs text-text-muted truncate">{user.email}</div>
                  </div>
                  <div className="text-center font-bold text-success">{user.totalPoints}</div>
                  <div className="text-center">
                    <span className={clsx(
                      'px-1.5 py-0.5 rounded text-xs',
                      user.role === 'ADMIN' ? 'bg-primary-600/30 text-primary-400' : 'bg-white/5 text-text-muted'
                    )}>
                      {user.role}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className={clsx(
                      'px-1.5 py-0.5 rounded text-xs',
                      user.isActive ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
                    )}>
                      {user.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setEditingUser(user)}
                      className="text-text-muted hover:text-primary-400 transition-colors"
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`¿Eliminar a ${user.username}?`)) deleteUser.mutate(user.id);
                      }}
                      className="text-text-muted hover:text-danger transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Danger zone */}
        <div className="glass-card border border-red-500/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-red-500/10 flex items-center gap-2">
            <span className="text-red-400 text-xs font-bold uppercase tracking-wide">Zona peligrosa</span>
          </div>
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Limpiar puntos de todos</p>
              <p className="text-xs text-text-muted mt-0.5">
                Resetea marcadores, puntos, predicción del campeón y estadísticas de todos los usuarios. Irreversible.
              </p>
            </div>
            <button
              onClick={() => {
                if (!window.confirm('¿Seguro? Esto borrará TODOS los puntos, marcadores y predicciones del campeón de todos los usuarios. Esta acción no se puede deshacer.')) return;
                resetAllScores.mutate();
              }}
              disabled={resetAllScores.isPending}
              className="shrink-0 px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {resetAllScores.isPending ? 'Limpiando...' : 'Limpiar todo'}
            </button>
          </div>
          <div className="px-4 py-3 flex items-center justify-between gap-4 border-t border-white/5">
            <div>
              <p className="text-sm font-semibold">Eliminar predicciones</p>
              <p className="text-xs text-text-muted mt-0.5">
                Borra todas las predicciones y resetea puntos. Los partidos quedan intactos. Irreversible.
              </p>
            </div>
            <button
              onClick={() => {
                if (!window.confirm('¿Eliminar TODAS las predicciones y resetear puntos? Esta acción no se puede deshacer.')) return;
                clearPredictions.mutate();
              }}
              disabled={clearPredictions.isPending}
              className="shrink-0 px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {clearPredictions.isPending ? 'Eliminando...' : 'Eliminar predicciones'}
            </button>
          </div>
        </div>
        </div>
      )}

      {/* ── MATCHES TAB ── */}
      {tab === 'matches' && (
        <div className="space-y-3">
        {/* Agregar partidos faltantes */}
        <div className="glass-card px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold">⚠️ Partidos faltantes detectados</p>
            <p className="text-xs text-text-muted mt-0.5">Algeria vs Austria · Jordan vs Argentina (28 jun, 02:00 UTC)</p>
          </div>
          <button
            onClick={async () => {
              try {
                const res = await adminApi.seedMissingMatches();
                toast.success(res.data.results.map((r: any) => `${r.match}: ${r.status}`).join(' | '));
              } catch {
                toast.error('Error al agregar partidos');
              }
            }}
            className="btn-primary text-xs px-3 py-2 shrink-0"
          >
            Agregar
          </button>
        </div>

        {/* Sembrar octavos de final */}
        <div className="glass-card px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold">Octavos de Final — Desde ganadores de Dieciseisavos</p>
            <p className="text-xs text-text-muted mt-0.5">Crea los 8 partidos de octavos con los equipos ya clasificados</p>
          </div>
          <button
            onClick={async () => {
              try {
                const res = await adminApi.seedRoundOf16();
                const created = res.data.results.filter((r: any) => r.status === 'creado').length;
                const existing = res.data.results.filter((r: any) => r.status === 'ya existe').length;
                const pending = res.data.results.filter((r: any) => r.status.startsWith('pendiente')).length;
                toast.success(`Octavos: ${created} creados, ${existing} ya existían, ${pending} pendientes`);
              } catch {
                toast.error('Error al sembrar octavos');
              }
            }}
            className="btn-primary text-xs px-3 py-2 shrink-0"
          >
            Sembrar Octavos
          </button>
        </div>

        {/* Sembrar dieciseisavos */}
        <div className="glass-card px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold">Dieciseisavos de Final — Mundial 2026</p>
            <p className="text-xs text-text-muted mt-0.5">Carga los 16 partidos de dieciseisavos (28 jun – 4 jul)</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={async () => {
                try {
                  const res = await adminApi.seedRoundOf32();
                  const created = res.data.results.filter((r: any) => r.status === 'creado').length;
                  const existing = res.data.results.filter((r: any) => r.status === 'ya existe').length;
                  toast.success(`${created} partidos creados, ${existing} ya existían`);
                } catch {
                  toast.error('Error al cargar los partidos');
                }
              }}
              className="btn-primary text-xs px-3 py-2"
            >
              Cargar
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await adminApi.fixRoundOf32Times();
                  const fixed = res.data.results.filter((r: any) => r.status.startsWith('corregido')).length;
                  toast.success(`${fixed} horarios corregidos`);
                } catch {
                  toast.error('Error al corregir horarios');
                }
              }}
              className="btn-secondary text-xs px-3 py-2"
            >
              Corregir horarios
            </button>
          </div>
        </div>

        {/* Mundial 2026 sync — ESPN (sin límite de API) */}
        <div className="glass-card px-4 py-3 flex items-center gap-2">
          <span className="text-xs text-text-muted shrink-0">🌍 Mundial 2026:</span>
          <button
            onClick={() => wcSync.mutate()}
            disabled={wcSync.isPending}
            className="btn-primary text-xs flex items-center gap-1.5 flex-1 justify-center py-2"
          >
            <RefreshCw size={12} className={wcSync.isPending ? 'animate-spin' : ''} />
            {wcSync.isPending ? 'Sincronizando...' : 'Sync marcadores (ESPN)'}
          </button>
          <button
            onClick={() => wcSyncLive.mutate()}
            disabled={wcSyncLive.isPending}
            className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-2 shrink-0"
          >
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            {wcSyncLive.isPending ? '...' : 'En vivo'}
          </button>
        </div>

        {/* Calcular / resetear puntos */}
        <div className="glass-card px-4 py-3 space-y-2">
          <p className="text-xs font-semibold">🎯 Puntos</p>
          <div className="flex gap-2">
            <button
              onClick={() => { if (!window.confirm('¿Calcular puntos para todos los partidos terminados sin procesar?')) return; calculateAllPoints.mutate(); }}
              disabled={calculateAllPoints.isPending}
              className="btn-secondary text-xs flex-1 py-2 flex items-center justify-center gap-1.5"
            >
              <RefreshCw size={12} className={calculateAllPoints.isPending ? 'animate-spin' : ''} />
              {calculateAllPoints.isPending ? 'Calculando...' : 'Calcular pendientes'}
            </button>
            <button
              onClick={() => { if (!window.confirm('⚠️ Esto resetea TODOS los puntos de usuarios y predicciones, y los recalcula desde cero. ¿Continuar?')) return; resetAndRecalculate.mutate(); }}
              disabled={resetAndRecalculate.isPending}
              className="text-xs flex-1 py-2 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              <RefreshCw size={12} className={resetAndRecalculate.isPending ? 'animate-spin' : ''} />
              {resetAndRecalculate.isPending ? 'Procesando...' : '🔄 Reset y recalcular todo'}
            </button>
          </div>
          <p className="text-xs text-text-muted">Usa "Reset y recalcular" si los puntos muestran 0 aunque haya marcador.</p>
          <button
            onClick={() => recalculateStandings.mutate()}
            disabled={recalculateStandings.isPending}
            className="btn-secondary text-xs w-full py-2 flex items-center justify-center gap-1.5"
          >
            <RefreshCw size={12} className={recalculateStandings.isPending ? 'animate-spin' : ''} />
            {recalculateStandings.isPending ? 'Actualizando...' : '📊 Actualizar tabla de grupos'}
          </button>
        </div>
        <div className="glass-card p-4 space-y-2">
          <p className="text-xs text-text-muted font-semibold uppercase tracking-wide">🧪 Simulación de partidos</p>
          <p className="text-xs text-text-muted">Crea 5 partidos finalizados con predicciones automáticas para verificar puntos y tabla de posiciones.</p>
          <div className="flex gap-2">
            <button
              onClick={() => { if (!window.confirm('¿Crear 5 partidos de prueba con predicciones automáticas y calcular puntos?')) return; simulateMatches.mutate(); }}
              disabled={simulateMatches.isPending}
              className="btn-primary text-xs flex-1 py-2"
            >
              {simulateMatches.isPending ? 'Simulando...' : '▶ Ejecutar simulación'}
            </button>
            <button
              onClick={() => { if (!window.confirm('¿Eliminar los partidos de prueba y revertir los puntos?')) return; cleanupSimulation.mutate(); }}
              disabled={cleanupSimulation.isPending}
              className="text-xs px-3 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 font-semibold transition-colors"
            >
              {cleanupSimulation.isPending ? '...' : '🗑 Limpiar'}
            </button>
          </div>
        </div>

        <div className="glass-card px-4 py-3 flex items-center gap-2 flex-wrap gap-y-2">
          <span className="text-xs text-text-muted shrink-0">🗂️ Datos FIFA:</span>
          <button
            onClick={() => {
              if (!window.confirm('¿Actualizar los grupos de todos los equipos con el sorteo oficial FIFA 2026?')) return;
              syncGroups.mutate();
            }}
            disabled={syncGroups.isPending}
            className="btn-secondary text-xs flex items-center gap-1.5 flex-1 justify-center py-2"
          >
            <RefreshCw size={12} className={syncGroups.isPending ? 'animate-spin' : ''} />
            {syncGroups.isPending ? 'Actualizando...' : 'Sincronizar grupos'}
          </button>
          <button
            onClick={() => {
              if (!window.confirm('¿Aplicar las cuotas de campeón a todos los equipos del Mundial 2026?')) return;
              syncOdds.mutate();
            }}
            disabled={syncOdds.isPending}
            className="btn-secondary text-xs flex items-center gap-1.5 flex-1 justify-center py-2"
          >
            <RefreshCw size={12} className={syncOdds.isPending ? 'animate-spin' : ''} />
            {syncOdds.isPending ? 'Actualizando...' : 'Sincronizar cuotas'}
          </button>
        </div>
        {/* Bulk action bar */}
        <div className="glass-card px-4 py-3 flex items-center gap-3">
          <span className="text-xs text-text-muted shrink-0">Marcar todos como:</span>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            className="input-field bg-[#0f1729] text-white text-sm flex-1 min-w-0"
          >
            <option value="SCHEDULED" className="bg-[#0f1729] text-white">Programado</option>
            <option value="LOCKED"    className="bg-[#0f1729] text-white">Cerrado</option>
            <option value="LIVE"      className="bg-[#0f1729] text-white">En Vivo</option>
            <option value="HALFTIME"  className="bg-[#0f1729] text-white">Medio Tiempo</option>
            <option value="FINISHED"  className="bg-[#0f1729] text-white">Finalizado</option>
          </select>
          <button
            onClick={() => {
              if (!window.confirm(`¿Marcar TODOS los partidos como "${bulkStatus}"?`)) return;
              bulkStatusMutation.mutate();
            }}
            disabled={bulkStatusMutation.isPending}
            className="btn-primary text-sm shrink-0 px-4 py-1.5"
          >
            {bulkStatusMutation.isPending ? 'Aplicando...' : 'Aplicar a todos'}
          </button>
        </div>

        <div className="glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5 text-xs text-text-muted grid grid-cols-[1fr_90px_80px_60px_50px] gap-2 font-medium">
            <span>Partido</span>
            <span className="text-center">Marcador</span>
            <span className="text-center">Estado</span>
            <span className="text-center">Preds.</span>
            <span className="text-center">Edit</span>
          </div>
          <div className="divide-y divide-white/5">
            {loadingMatches ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse bg-white/5 m-2 rounded" />
              ))
            ) : matches?.length === 0 ? (
              <div className="p-6 text-center text-text-muted text-sm">
                No hay partidos. Corre el seed de partidos primero.
              </div>
            ) : (
              matches?.map((match: any) => {
                const statusColor: Record<string, string> = {
                  SCHEDULED: 'text-text-muted',
                  LOCKED: 'text-warning',
                  LIVE: 'text-red-400',
                  HALFTIME: 'text-orange-400',
                  FINISHED: 'text-success',
                };
                return (
                  <div key={match.id} className="grid grid-cols-[1fr_90px_80px_60px_50px] gap-2 px-4 py-3 items-center text-sm hover:bg-white/5">
                    <div className="min-w-0">
                      <div className="font-medium text-xs truncate">
                        {match.teamHome.code} vs {match.teamAway.code}
                      </div>
                      <div className="text-xs text-text-muted">
                        {format(new Date(match.dateTime), "d MMM HH:mm", { locale: es })}
                      </div>
                    </div>
                    <div className="text-center font-bold tabular-nums">
                      {match.scoreHome !== null
                        ? `${match.scoreHome} - ${match.scoreAway}`
                        : <span className="text-text-muted">- : -</span>}
                    </div>
                    <div className={clsx('text-center text-xs font-medium', statusColor[match.status] || 'text-text-muted')}>
                      {match.status}
                      {match.status === 'FINISHED' && match.pointsCalculated && ' ✓'}
                    </div>
                    <div className="text-center text-text-muted tabular-nums">
                      {match._count.predictions}
                    </div>
                    <div className="flex justify-center">
                      <button
                        onClick={() => setEditingMatch(match)}
                        className="text-text-muted hover:text-primary-400 transition-colors"
                        title="Gestionar"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        </div>
      )}

      {/* ── TOKENS TAB ── */}
      {tab === 'predicciones' && (
        <div className="space-y-4">

          {/* ── Predecir por usuario ── */}
          <div className="glass-card p-4 space-y-3">
            <p className="font-semibold text-sm">Predecir por usuario</p>
            <p className="text-xs text-text-muted">El admin puede registrar la predicción de un usuario que no tiene acceso.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-muted block mb-1">Usuario</label>
                <select
                  value={proxyUserId}
                  onChange={(e) => setProxyUserId(e.target.value)}
                  className="input-field w-full bg-[#0f1729] text-white text-sm"
                >
                  <option value="">Seleccionar usuario</option>
                  {(users ?? []).filter((u: any) => u.role !== 'ADMIN').sort((a: any, b: any) => a.username.localeCompare(b.username)).map((u: any) => (
                    <option key={u.id} value={u.id}>{u.username}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">Partido</label>
                <select
                  value={proxyMatchId}
                  onChange={(e) => setProxyMatchId(e.target.value)}
                  className="input-field w-full bg-[#0f1729] text-white text-sm"
                >
                  <option value="">Seleccionar partido</option>
                  {(matches ?? [])
                    .filter((m: any) => !m.pointsCalculated && ['SCHEDULED', 'LOCKED'].includes(m.status))
                    .map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {m.teamHome.name} vs {m.teamAway.name} — {format(new Date(m.dateTime), 'dd MMM HH:mm', { locale: es })}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs text-text-muted block mb-1">Goles local</label>
                <input
                  type="number" min="0" max="99"
                  value={proxyHome}
                  onChange={(e) => setProxyHome(e.target.value)}
                  placeholder="0"
                  className="input-field w-full bg-[#0f1729] text-white text-sm text-center"
                />
              </div>
              <span className="text-text-muted pt-5">—</span>
              <div className="flex-1">
                <label className="text-xs text-text-muted block mb-1">Goles visitante</label>
                <input
                  type="number" min="0" max="99"
                  value={proxyAway}
                  onChange={(e) => setProxyAway(e.target.value)}
                  placeholder="0"
                  className="input-field w-full bg-[#0f1729] text-white text-sm text-center"
                />
              </div>
              <button
                onClick={() => predictForUser.mutate()}
                disabled={!proxyUserId || !proxyMatchId || proxyHome === '' || proxyAway === '' || predictForUser.isPending}
                className="btn-primary text-sm px-4 py-2 mt-5 shrink-0 disabled:opacity-40"
              >
                Guardar
              </button>
            </div>
          </div>

          {/* Header con filtro y export */}
          <div className="glass-card p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1 w-full">
              <label className="text-xs text-text-muted block mb-1">Filtrar por partido</label>
              <select
                value={predMatchId}
                onChange={(e) => setPredMatchId(e.target.value)}
                className="input-field w-full bg-[#0f1729] text-white text-sm"
              >
                <option value="">Todos los partidos</option>
                {(matches ?? []).map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.teamHome.name} vs {m.teamAway.name} — {format(new Date(m.dateTime), 'dd MMM', { locale: es })}
                    {m.scoreHome != null ? ` (${m.scoreHome}-${m.scoreAway})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={async () => {
                try {
                  const res = await adminApi.exportPredictions();
                  const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `predicciones_scorecast_${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch { toast.error('Error al exportar'); }
              }}
              className="btn-secondary text-xs px-4 py-2 shrink-0 flex items-center gap-1.5"
            >
              ⬇ Descargar CSV
            </button>
          </div>

          {/* Tabla de predicciones */}
          {loadingPreds ? (
            <div className="text-center text-text-muted py-8">Cargando...</div>
          ) : !allPredictions?.length ? (
            <div className="text-center text-text-muted py-8">No hay predicciones{predMatchId ? ' para este partido' : ''}.</div>
          ) : (
            <div className="glass-card overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-text-muted">
                    <th className="text-left p-3">Jugador</th>
                    <th className="text-left p-3">Partido</th>
                    <th className="text-center p-3">Predicción</th>
                    <th className="text-center p-3">Real</th>
                    <th className="text-center p-3">Pts</th>
                    <th className="text-center p-3">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {allPredictions.map((p: any) => (
                    <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-3 font-medium">{p.user.username}</td>
                      <td className="p-3 text-text-muted">
                        {p.match.teamHome.name} vs {p.match.teamAway.name}
                      </td>
                      <td className="p-3 text-center font-mono font-bold">
                        {p.predictedHome} - {p.predictedAway}
                      </td>
                      <td className="p-3 text-center font-mono">
                        {p.match.scoreHome != null ? `${p.match.scoreHome} - ${p.match.scoreAway}` : '—'}
                      </td>
                      <td className="p-3 text-center">
                        <span className={clsx(
                          'font-bold',
                          p.pointsEarned >= 5 ? 'text-yellow-400' :
                          p.pointsEarned > 0 ? 'text-green-400' : 'text-text-muted'
                        )}>
                          {p.pointsEarned}
                        </span>
                      </td>
                      <td className="p-3 text-center text-text-muted">
                        {p.pointsExact > 0 && <span className="mr-1" title="Marcador exacto">🎯</span>}
                        {p.pointsResult > 0 && <span className="mr-1" title="Resultado correcto">✅</span>}
                        {p.pointsGoals > 0 && <span title="Goles acertados">⚽</span>}
                        {p.pointsEarned === 0 && p.match.scoreHome != null && <span className="text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-2 text-xs text-text-muted border-t border-white/10">
                {allPredictions.length} predicciones
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'tokens' && (
        <div className="space-y-4">
          <div className="glass-card p-4 space-y-3">
            <h3 className="font-semibold text-sm">Crear nuevo token</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                placeholder="Código (auto si vacío)"
                value={newToken.code}
                onChange={(e) => setNewToken((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                className="input-field"
                maxLength={12}
              />
              <input
                type="number"
                placeholder="Usos máx (-1 = ilimitado)"
                value={newToken.maxUses}
                onChange={(e) => setNewToken((p) => ({ ...p, maxUses: parseInt(e.target.value) }))}
                className="input-field"
              />
              <input
                placeholder="Descripción"
                value={newToken.description}
                onChange={(e) => setNewToken((p) => ({ ...p, description: e.target.value }))}
                className="input-field"
              />
            </div>
            <button onClick={() => createToken.mutate()} disabled={createToken.isPending} className="btn-primary">
              Crear token
            </button>
          </div>

          <div className="glass-card overflow-hidden">
            <div className="divide-y divide-white/5">
              {loadingTokens ? (
                <div className="p-4 text-text-muted animate-pulse">Cargando...</div>
              ) : (
                tokens?.map((token: any) => {
                  const registrationUrl = `${window.location.origin}/registro/${token.code}`;
                  return (
                    <div key={token.id} className="px-4 py-3 text-sm space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <code className="text-primary-400 font-bold">{token.code}</code>
                          {token.description && <span className="text-text-muted ml-2 text-xs">({token.description})</span>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-text-muted text-xs">
                            {token.currentUses}/{token.maxUses === -1 ? '∞' : token.maxUses} usos
                          </span>
                          <button
                            onClick={() => toggleToken.mutate({ id: token.id, isActive: !token.isActive })}
                            className={clsx(
                              'px-2 py-1 rounded text-xs font-medium',
                              token.isActive ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
                            )}
                          >
                            {token.isActive ? 'Activo' : 'Inactivo'}
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`¿Eliminar el token "${token.code}"?`)) deleteToken.mutate(token.id);
                            }}
                            className="text-text-muted hover:text-danger transition-colors"
                            title="Eliminar token"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 bg-white/5 rounded px-2 py-1.5">
                        <span className="text-xs text-text-muted font-mono truncate flex-1">{registrationUrl}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(registrationUrl);
                            toast.success('URL copiada');
                          }}
                          className="shrink-0 text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors"
                        >
                          Copiar
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}


      {/* ── MI CUENTA TAB ── */}
      {tab === 'cuenta' && (
        <div className="space-y-4">
          <ChangePasswordAdmin />
          <TwoFactorAdmin />
        </div>
      )}

      {/* ── API TAB ── */}
      {tab === 'api' && apiUsage && (
        <div className="space-y-3">
          <div className="glass-card p-4 flex items-center justify-between">
            <span className="text-text-muted">Solicitudes restantes hoy</span>
            <span className={clsx('text-2xl font-bold', apiUsage.remaining < 20 ? 'text-danger' : 'text-success')}>
              {apiUsage.remaining} / {apiUsage.dailyLimit}
            </span>
          </div>
          <EmailToggleCard />
          <ChampionLockCard />
          <TestNotifyAllButton />
          <TestEmailButton />
          <div className="glass-card overflow-hidden">
            <div className="p-3 border-b border-white/5 text-xs text-text-muted font-medium">Historial de llamadas</div>
            <div className="divide-y divide-white/5">
              {apiUsage.usageLogs
                .filter((l: any) => l.endpoint !== 'DAILY_TOTAL')
                .slice(0, 20)
                .map((log: any, i: number) => (
                  <div key={i} className="flex justify-between px-4 py-2 text-xs">
                    <span className="text-text-muted">{log.endpoint}</span>
                    <span>{log.requestCount} req</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
