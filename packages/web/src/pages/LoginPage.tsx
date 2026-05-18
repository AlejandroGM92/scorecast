import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authApi } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

export default function LoginPage() {
  const [showAdmin, setShowAdmin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const loginMutation = useMutation({
    mutationFn: () => authApi.login(email, password, requires2FA ? totpCode : undefined),
    onSuccess: ({ data }) => {
      if (data.requires2FA) {
        setRequires2FA(true);
        return;
      }
      setAuth(data.user, data.token);
      navigate('/');
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || 'Credenciales incorrectas';
      toast.error(msg);
      if (requires2FA && msg.includes('2FA')) {
        setTotpCode('');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate();
  };

  return (
    <div className="space-y-4">
      {/* Google login card */}
      <div className="glass-card p-6 space-y-5">
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold">Iniciar sesión</h2>
          <p className="text-text-muted text-sm">Usa tu cuenta de Google para entrar</p>
        </div>

        <a
          href="/api/auth/google/login"
          className="flex items-center justify-center gap-3 w-full py-3 px-4 bg-white text-gray-800 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
        >
          <GoogleIcon />
          Continuar con Google
        </a>

        <p className="text-center text-xs text-text-muted">
          ¿No tienes cuenta?{' '}
          <span className="text-primary-400">Solicita un link de invitación al administrador</span>
        </p>
      </div>

      {/* Admin login (collapsible) */}
      <div className="glass-card overflow-hidden">
        <button
          onClick={() => setShowAdmin(!showAdmin)}
          className="w-full px-4 py-3 text-sm text-text-muted hover:text-white flex items-center justify-between transition-colors"
        >
          <span>Acceso administrador</span>
          <span className="text-xs">{showAdmin ? '▲' : '▼'}</span>
        </button>

        {showAdmin && (
          <form
            onSubmit={handleSubmit}
            className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3"
          >
            {!requires2FA ? (
              <>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="input-field w-full" placeholder="Email" required
                />
                <input
                  type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  className="input-field w-full" placeholder="Contraseña" required
                />
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-center text-text-muted">
                  🔐 Ingresa el código de <strong className="text-white">Google Authenticator</strong>
                </p>
                <input
                  type="text" inputMode="numeric" maxLength={6}
                  value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  className="input-field w-full text-center text-2xl tracking-widest font-mono"
                  placeholder="000000" autoFocus
                />
                <button
                  type="button"
                  onClick={() => { setRequires2FA(false); setTotpCode(''); }}
                  className="text-xs text-text-muted hover:text-white w-full text-center transition-colors"
                >
                  ← Volver
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loginMutation.isPending || (requires2FA && totpCode.length !== 6)}
              className="btn-primary w-full"
            >
              {loginMutation.isPending
                ? 'Verificando...'
                : requires2FA
                ? 'Confirmar código'
                : 'Ingresar como admin'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
