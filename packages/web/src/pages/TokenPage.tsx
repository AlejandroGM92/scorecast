import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { authApi } from '@/services/api';
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

      <a
        href={`/api/auth/google?token=${code}`}
        className="flex items-center justify-center gap-3 w-full py-3 px-4 bg-white text-gray-800 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
      >
        <GoogleIcon />
        Registrarme con Google
      </a>

      <p className="text-center text-xs text-text-muted">
        ¿Ya tienes cuenta?{' '}
        <a href="/login" className="text-primary-400 hover:underline">
          Inicia sesión aquí
        </a>
      </p>
    </div>
  );
}
