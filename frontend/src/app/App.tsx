import { RouterProvider } from 'react-router';
import { ThemeToggle } from '@/app/components/ThemeToggle';
import { router } from './routes';

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <ThemeToggle />
    </>
  );
}