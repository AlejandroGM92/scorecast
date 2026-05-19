import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import BottomNav from './BottomNav';
import Onboarding, { useOnboarding } from '@/components/Onboarding';
import { useIdleLogout } from '@/hooks/useIdleLogout';

export default function Layout() {
  const { show, complete } = useOnboarding();
  useIdleLogout();

  return (
    <div className="min-h-dvh bg-gradient-primary">
      <Navbar />
      <main className="pt-16">
        <Outlet />
      </main>
      <BottomNav />
      {show && <Onboarding onComplete={complete} />}
    </div>
  );
}
