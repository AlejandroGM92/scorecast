import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authApi } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';

export default function AdminLoginPage() {
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
      navigate('/admin');
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || 'Credenciales incorrectas';
      toast.error(msg);
      if (requires2FA) setTotpCode('');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate();
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-6 space-y-5">
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold">Acceso administrador</h2>
          <p className="text-text-muted text-sm">Solo para uso interno</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {!requires2FA ? (
            <>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="input-field w-full" placeholder="Email" required autoFocus
              />
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="input-field w-full" placeholder="Contraseña" required
              />
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-center text-text-muted">
                Ingresa el código de <strong className="text-white">Google Authenticator</strong>
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
              : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
