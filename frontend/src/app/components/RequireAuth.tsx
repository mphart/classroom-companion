import { Navigate, Outlet } from 'react-router';
import { getToken } from '@/app/lib/authSession';

export function RequireAuthLayout() {
  if (!getToken()) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
