import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Bell, LogOut, Shield, Home, Trophy, BookOpen, User } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/services/api';
import { clsx } from 'clsx';
import { useState } from 'react';

const NAV_LINKS = [
  { to: '/matches',     label: 'Partidos', icon: Home },
  { to: '/leaderboard', label: 'Tabla',    icon: Trophy },
  { to: '/reglas',      label: 'Reglas',   icon: BookOpen },
  { to: '/profile',     label: 'Perfil',   icon: User },
];

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const handleLogout = () => {
    const isAdmin = user?.role === 'ADMIN';
    logout();
    navigate(isAdmin ? '/sc-admin' : '/login');
  };
  const [showNotifs, setShowNotifs] = useState(false);

  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => authApi.notifications().then((r) => r.data),
    refetchInterval: 60_000,
  });

  const markRead = useMutation({
    mutationFn: () => authApi.markNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unreadCount = notifications?.filter((n: any) => !n.isRead).length || 0;

  const handleBell = () => {
    setShowNotifs((v) => !v);
    if (unreadCount > 0) markRead.mutate();
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background-base/80 backdrop-blur-md border-b border-white/5">
      <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 font-black text-xl tracking-tight shrink-0">
          <img src="/favicon.svg" alt="SCORECAST" className="w-8 h-8" />
          <span>
            <span className="text-white">SCORE</span>
            <span className="text-primary-400">CAST</span>
          </span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-500/20 text-primary-400'
                    : 'text-text-muted hover:text-white hover:bg-white/5'
                )
              }
            >
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {user?.role === 'ADMIN' && (
            <Link to="/admin" className="text-text-muted hover:text-white transition-colors p-2" title="Panel Admin">
              <Shield size={18} />
            </Link>
          )}

          {/* Bell + notification dropdown */}
          <div className="relative">
            <button onClick={handleBell} className="relative text-text-muted hover:text-white transition-colors p-2">
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 bg-danger text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifs && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifs(false)} />
                <div className="absolute right-0 top-10 z-50 w-72 bg-[#0f1729] border border-white/10 rounded-xl shadow-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/5 text-sm font-semibold">Notificaciones</div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
                    {!notifications || notifications.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-text-muted">Sin notificaciones</p>
                    ) : (
                      notifications.slice(0, 10).map((n: any) => (
                        <div key={n.id} className={clsx('px-4 py-3', !n.isRead && 'bg-primary-500/5')}>
                          <p className="text-sm font-medium">{n.title}</p>
                          <p className="text-xs text-text-muted mt-0.5">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <span className="text-text-muted text-sm hidden md:block px-1">{user?.username}</span>

          <button onClick={handleLogout} className="text-text-muted hover:text-danger transition-colors p-2" title="Cerrar sesión">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
