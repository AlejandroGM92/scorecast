import { useNavigate } from 'react-router-dom';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh bg-gradient-primary flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        <div className="text-8xl font-black text-primary-800">404</div>
        <h1 className="text-2xl font-bold">Página no encontrada</h1>
        <p className="text-text-muted">Esta página no existe o fue movida</p>
        <button onClick={() => navigate('/')} className="btn-primary">
          Volver al inicio
        </button>
      </div>
    </div>
  );
}
