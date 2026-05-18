import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="min-h-dvh bg-gradient-primary flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black tracking-tight">
            <span className="text-white">SCORE</span>
            <span className="text-primary-400">CAST</span>
          </h1>
          <p className="text-text-muted mt-2 text-sm">Mundial FIFA 2026 · Predicciones</p>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
