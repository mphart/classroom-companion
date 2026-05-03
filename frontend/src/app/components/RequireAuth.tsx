import { Navigate, Outlet } from 'react-router';
import { ThemeToggle } from '@/app/components/ThemeToggle';
import { getToken } from '@/app/lib/authSession';

export function RequireAuthLayout() {
  if (!getToken()) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <Outlet />
      <ThemeToggle />
    </>
  );
}
