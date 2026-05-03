import { RouterProvider } from 'react-router';
import { ThemeToggle } from '@/app/components/ThemeToggle';
import { Toaster } from '@/app/components/ui/sonner';
import { router } from './routes';

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <ThemeToggle />
      <Toaster richColors position="top-center" />
    </>
  );
}