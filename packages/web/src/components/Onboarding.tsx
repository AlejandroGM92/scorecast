import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';

const STORAGE_KEY = 'scorecast_onboarding_done';

// ── Preview cards embedded in each step ──────────────────────────────────────

function PreviewPartidos() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden text-left">
      <div className="px-3 py-2 border-b border-white/10 text-xs text-text-muted font-medium">Próximos partidos</div>
      {[
        { home: '🇲🇽 México', away: '🇵🇱 Polonia', time: 'Hoy 15:00' },
        { home: '🇦🇷 Argentina', away: '🇸🇦 Arabia S.', time: 'Hoy 18:00' },
      ].map((m, i) => (
        <div key={i} className="flex items-center justify-between px-3 py-2.5 border-b border-white/5 last:border-0">
          <span className="text-xs font-medium">{m.home}</span>
          <div className="flex items-center gap-1.5">
            <button className="w-5 h-5 rounded bg-white/10 text-xs font-bold">−</button>
            <span className="text-xs font-black w-5 text-center">0</span>
            <span className="text-xs text-text-muted">:</span>
            <span className="text-xs font-black w-5 text-center">0</span>
            <button className="w-5 h-5 rounded bg-white/10 text-xs font-bold">+</button>
          </div>
          <span className="text-xs">{m.away}</span>
        </div>
      ))}
      <div className="px-3 py-1.5 text-[10px] text-text-muted text-center">Toca un partido para ver detalles</div>
    </div>
  );
}

function PreviewReglas() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden text-left">
      <div className="px-3 py-2 border-b border-white/10 text-xs text-text-muted font-medium">Sistema de puntos</div>
      {[
        { icon: '🎯', label: 'Marcador exacto', pts: 3, color: 'text-yellow-400' },
        { icon: '✅', label: 'Resultado correcto', pts: 2, color: 'text-green-400' },
        { icon: '⚽', label: 'Goles de un equipo', pts: 1, color: 'text-blue-400' },
      ].map((r) => (
        <div key={r.label} className="flex items-center gap-2.5 px-3 py-2 border-b border-white/5 last:border-0">
          <span className="text-base">{r.icon}</span>
          <span className="flex-1 text-xs font-medium">{r.label}</span>
          <span className={clsx('font-black text-base', r.color)}>{r.pts}<span className="text-[10px] font-normal text-text-muted ml-0.5">pts</span></span>
        </div>
      ))}
    </div>
  );
}

function PreviewCampeon() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden text-left">
      <div className="px-3 py-2 border-b border-white/10 text-xs text-text-muted font-medium">Elige tu campeón</div>
      <div className="grid grid-cols-2 gap-1.5 p-2">
        {[
          { flag: '🇧🇷', name: 'Brasil', odds: 25 },
          { flag: '🇫🇷', name: 'Francia', odds: 20 },
          { flag: '🇦🇷', name: 'Argentina', odds: 18 },
          { flag: '🇩🇪', name: 'Alemania', odds: 15 },
        ].map((t) => (
          <div key={t.name} className="flex items-center gap-2 bg-white/5 rounded-lg px-2 py-1.5 border border-white/5">
            <span className="text-xl">{t.flag}</span>
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate">{t.name}</p>
              <p className="text-[10px] text-primary-400 font-semibold">x{t.odds} pts</p>
            </div>
          </div>
        ))}
      </div>
      <div className="px-3 py-1.5 text-[10px] text-yellow-400/80 text-center border-t border-white/5">
        ⚠️ Solo puedes elegir una vez
      </div>
    </div>
  );
}

function PreviewTabla() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden text-left">
      <div className="px-3 py-2 border-b border-white/10 text-xs text-text-muted font-medium">Tabla de posiciones</div>
      {[
        { pos: 1, name: 'Carlos M.', pts: 42, medal: '🥇' },
        { pos: 2, name: 'Ana R.',    pts: 38, medal: '🥈' },
        { pos: 3, name: 'Luis G.',   pts: 35, medal: '🥉' },
        { pos: 4, name: 'Tú',        pts: 28, medal: null, isMe: true },
      ].map((p) => (
        <div key={p.pos} className={clsx('flex items-center gap-2.5 px-3 py-2 border-b border-white/5 last:border-0', p.isMe && 'bg-primary-500/10')}>
          <span className="text-sm w-5 text-center">{p.medal || `#${p.pos}`}</span>
          <span className={clsx('flex-1 text-xs font-medium', p.isMe && 'text-primary-400')}>{p.name}</span>
          <span className="text-xs font-black text-green-400">{p.pts} pts</span>
        </div>
      ))}
    </div>
  );
}

// ── Steps definition ──────────────────────────────────────────────────────────

const STEPS = [
  {
    icon: '🏆',
    title: '¡Bienvenido a SCORECAST!',
    description: 'El juego de predicciones del Mundial FIFA 2026. En menos de 1 minuto te explicamos cómo participar y ganar puntos.',
    preview: null,
    action: null,
    actionLabel: null,
    isFinal: false,
  },
  {
    icon: '📅',
    title: 'Predice los partidos',
    description: 'Antes de que empiece cada partido elige el marcador. Usa + y − directamente en la tarjeta.',
    preview: <PreviewPartidos />,
    action: '/matches',
    actionLabel: 'Ver partidos',
    isFinal: false,
  },
  {
    icon: '📋',
    title: 'Reglas y puntos',
    description: 'Cada predicción puede darte hasta 3 puntos. Mientras más exacto, más puntos ganas.',
    preview: <PreviewReglas />,
    action: '/reglas',
    actionLabel: 'Ver reglas completas',
    isFinal: false,
  },
  {
    icon: '🌍',
    title: 'Predicción del campeón',
    description: 'Una vez, antes de que empiece el torneo, elige al campeón. Si aciertas, multiplicas puntos según la cuota.',
    preview: <PreviewCampeon />,
    action: '/reglas',
    actionLabel: 'Elegir mi campeón',
    isFinal: false,
  },
  {
    icon: '📊',
    title: 'Tabla de posiciones',
    description: 'Compite contra todos. El ranking se actualiza en tiempo real después de cada partido.',
    preview: <PreviewTabla />,
    action: '/leaderboard',
    actionLabel: 'Ver tabla',
    isFinal: false,
  },
  {
    icon: '🚀',
    title: '¡Todo listo!',
    description: 'Ya sabes cómo funciona SCORECAST. Ve a predecir tus primeros partidos y empieza a sumar puntos.',
    preview: null,
    action: '/matches',
    actionLabel: '¡Empezar a predecir!',
    isFinal: true,
  },
];

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useOnboarding() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setShow(true);
  }, []);

  const complete = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setShow(false);
  };

  return { show, complete };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const finish = (goTo?: string) => {
    onComplete();
    if (goTo) navigate(goTo);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full sm:max-w-sm bg-[#0f1729] border border-white/10 rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl">
        {/* Progress bar */}
        <div className="h-1 bg-white/10">
          <div
            className="h-1 bg-primary-400 transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="p-5 space-y-4">
          {/* Dots + skip */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  className={clsx(
                    'h-1.5 rounded-full transition-all duration-300',
                    i === step ? 'w-5 bg-primary-400' : i < step ? 'w-1.5 bg-primary-400/40' : 'w-1.5 bg-white/20'
                  )}
                />
              ))}
            </div>
            <button onClick={() => finish()} className="text-xs text-text-muted hover:text-white transition-colors px-2 py-1">
              Saltar
            </button>
          </div>

          {/* Icon + title */}
          <div className="text-center space-y-1">
            <div className="text-4xl">{current.icon}</div>
            <h2 className="text-lg font-bold">{current.title}</h2>
            <p className="text-text-muted text-sm leading-relaxed">{current.description}</p>
          </div>

          {/* Preview card */}
          {current.preview && (
            <div className="mt-1">
              {current.preview}
            </div>
          )}

          {/* Buttons */}
          <div className="space-y-2 pt-1">
            {isLast ? (
              <button onClick={() => finish(current.action ?? '/matches')} className="btn-primary w-full py-3 text-sm font-semibold">
                {current.actionLabel}
              </button>
            ) : (
              <>
                <button onClick={() => setStep((s) => s + 1)} className="btn-primary w-full py-2.5 text-sm font-semibold">
                  Siguiente →
                </button>
                {current.action && (
                  <button onClick={() => finish(current.action!)} className="btn-secondary w-full py-2 text-sm">
                    {current.actionLabel}
                  </button>
                )}
              </>
            )}

            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)} className="w-full py-1.5 text-xs text-text-muted hover:text-white transition-colors">
                ← Volver
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
