import { NavLink } from 'react-router-dom';
import { Home, Trophy, User, BookOpen } from 'lucide-react';
import { clsx } from 'clsx';

const navItems = [
  { to: '/matches',    icon: Home,     label: 'Partidos' },
  { to: '/leaderboard', icon: Trophy,  label: 'Tabla' },
  { to: '/reglas',     icon: BookOpen, label: 'Reglas' },
  { to: '/profile',    icon: User,     label: 'Perfil' },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background-base/90 backdrop-blur-md border-t border-white/5">
      <div className="flex">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex-1 flex flex-col items-center py-3 gap-1 text-xs transition-colors',
                isActive ? 'text-primary-400' : 'text-text-muted'
              )
            }
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
