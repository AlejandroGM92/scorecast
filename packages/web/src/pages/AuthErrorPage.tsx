import { useNavigate } from 'react-router-dom';

export default function AuthErrorPage() {
  const navigate = useNavigate();

  return (
    <div className="glass-card p-6 text-center space-y-4">
      <div className="text-5xl">⚠️</div>
      <h2 className="text-xl font-bold text-danger">Error de autenticación</h2>
      <p className="text-text-muted text-sm">
        No pudimos iniciar sesión con Google. Puede que no tengas cuenta o que el link de invitación haya expirado.
      </p>
      <div className="flex gap-3 justify-center">
        <button onClick={() => navigate('/login')} className="btn-primary">
          Ir al login
        </button>
      </div>
    </div>
  );
}
