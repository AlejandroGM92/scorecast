import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import toast from 'react-hot-toast';

const IDLE_TIMEOUT = 20 * 60 * 1000; // 20 minutes
const WARN_BEFORE  =  2 * 60 * 1000; // warn at 18 minutes

const EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const;

export function useIdleLogout() {
  const { isAuthenticated, logout, user } = useAuthStore();
  const navigate = useNavigate();
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnToastId = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    const clearTimers = () => {
      if (logoutTimer.current) clearTimeout(logoutTimer.current);
      if (warnTimer.current)   clearTimeout(warnTimer.current);
      if (warnToastId.current) toast.dismiss(warnToastId.current);
      warnToastId.current = null;
    };

    const reset = () => {
      clearTimers();

      warnTimer.current = setTimeout(() => {
        warnToastId.current = toast('Tu sesión cerrará en 2 minutos por inactividad', {
          duration: WARN_BEFORE,
          icon: '⏱️',
        });
      }, IDLE_TIMEOUT - WARN_BEFORE);

      logoutTimer.current = setTimeout(() => {
        clearTimers();
        const isAdmin = user?.role === 'ADMIN';
        logout();
        navigate(isAdmin ? '/sc-admin' : '/login', { replace: true });
        toast.error('Sesión cerrada por inactividad');
      }, IDLE_TIMEOUT);
    };

    EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      clearTimers();
      EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [isAuthenticated]);
}
