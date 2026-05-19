import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { authApi } from '@/services/api';
import { clsx } from 'clsx';
import type { TokenValidation } from '../../../shared/types';

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

export default function TokenPage() {
  const { code } = useParams<{ code: string }>();
  const [accepted, setAccepted] = useState(false);

  const { data, isLoading, isError } = useQuery<TokenValidation>({
    queryKey: ['token', code],
    queryFn: () => authApi.validateToken(code!).then((r) => r.data),
    enabled: !!code,
  });

  if (isLoading) {
    return (
      <div className="glass-card p-8 text-center">
        <div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-text-muted text-sm">Validando invitación...</p>
      </div>
    );
  }

  if (isError || !data?.valid) {
    return (
      <div className="glass-card p-6 text-center space-y-3">
        <div className="text-5xl">❌</div>
        <h2 className="text-xl font-bold text-danger">Invitación inválida</h2>
        <p className="text-text-muted text-sm">
          {data?.message || 'Este link de invitación no existe, expiró o ya fue usado.'}
        </p>
        <a href="/login" className="btn-secondary inline-block mt-2">
          Ir al login
        </a>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 space-y-5">
      <div className="text-center space-y-2">
        <div className="text-5xl">🎫</div>
        <h2 className="text-2xl font-bold">¡Estás invitado!</h2>
        <p className="text-text-muted text-sm">
          Regístrate con tu cuenta de Google para unirte a SCORECAST
        </p>
        {data.token?.usesRemaining !== undefined && (
          <span className="inline-block text-xs bg-white/5 text-text-muted px-2 py-1 rounded-full">
            {data.token.usesRemaining === 'Ilimitado'
              ? 'Invitación abierta'
              : `${data.token.usesRemaining} uso(s) restante(s)`}
          </span>
        )}
      </div>

      {/* Data authorization checkbox */}
      <div className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-3">
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
          Autorización de datos personales
        </p>
        <p className="text-xs text-text-muted leading-relaxed">
          Al registrarte, autorizas a <strong className="text-white">SCORECAST</strong> a
          recopilar y utilizar tu nombre, correo electrónico y foto de perfil de Google
          con el único propósito de gestionar tu participación en el torneo de predicciones.
          Tus datos no serán compartidos con terceros ni usados con fines comerciales.
        </p>
        <label className="flex items-start gap-3 cursor-pointer group">
          <div className="relative mt-0.5 shrink-0">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="sr-only"
            />
            <div className={clsx(
              'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
              accepted
                ? 'bg-primary-500 border-primary-500'
                : 'border-white/30 bg-white/5 group-hover:border-white/50'
            )}>
              {accepted && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </div>
          <span className="text-sm text-text-muted group-hover:text-white transition-colors">
            He leído y acepto el uso de mis datos personales para participar en SCORECAST
          </span>
        </label>
      </div>

      {/* Google OAuth button */}
      <div className="space-y-2">
        <a
          href={accepted ? `${import.meta.env.VITE_API_URL || ''}/api/auth/google?token=${code}` : '#'}
          onClick={!accepted ? (e) => e.preventDefault() : undefined}
          className={clsx(
            'flex items-center justify-center gap-3 w-full py-3 px-4 rounded-lg font-semibold transition-all',
            accepted
              ? 'bg-white text-gray-800 hover:bg-gray-100'
              : 'bg-white/20 text-white/40 cursor-not-allowed'
          )}
        >
          <GoogleIcon />
          Registrarme con Google
        </a>
        {!accepted && (
          <p className="text-center text-xs text-text-muted/60">
            Acepta la autorización de datos para continuar
          </p>
        )}
      </div>

      <p className="text-center text-xs text-text-muted">
        ¿Ya tienes cuenta?{' '}
        <a href="/login" className="text-primary-400 hover:underline">
          Inicia sesión aquí
        </a>
      </p>
    </div>
  );
}
