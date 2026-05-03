import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion, useReducedMotion } from 'motion/react';
import logo from '@/imports/classroomcompanion_logo_v4.svg';
import { login as loginRequest } from '@/app/lib/api';
import { getToken, setSession } from '@/app/lib/authSession';
import { PageAmbientDecor } from '@/app/components/PageAmbientDecor';
import '@/styles/brand-ambient.css';

export function Login() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const formVariants = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: reduceMotion ? 0 : 0.08,
        delayChildren: reduceMotion ? 0 : 0.06,
      },
    },
  };

  const fieldVariants = {
    hidden: { opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 22 },
    show: {
      opacity: 1,
      y: 0,
      transition: reduceMotion
        ? { duration: 0 }
        : { type: 'spring' as const, stiffness: 380, damping: 26 },
    },
  };

  useEffect(() => {
    if (!getToken()) return;
    navigate('/home', { replace: true });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Please enter both username and password');
      return;
    }

    setLoading(true);
    try {
      const { token, user } = await loginRequest({ username: username.trim(), password });
      setSession(token, user);
      navigate('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <div
          className="brand-ambient-blob-a absolute -left-[18%] top-[-12%] h-[min(62vmin,30rem)] w-[min(62vmin,30rem)] rounded-full bg-[var(--brand)] opacity-[0.13] blur-[4rem]"
          style={{ animationDelay: '-3s' }}
        />
        <div
          className="brand-ambient-blob-b absolute -right-[12%] bottom-[-25%] h-[min(56vmin,28rem)] w-[min(56vmin,28rem)] rounded-full bg-[var(--brand-deep)] opacity-[0.11] blur-[3.5rem]"
          style={{ animationDelay: '-7s' }}
        />
        <div
          className="brand-ambient-blob-c absolute left-[25%] top-[40%] h-[min(48vmin,22rem)] w-[min(48vmin,22rem)] rounded-full bg-[var(--brand)] opacity-[0.1] blur-[4rem]"
          style={{ animationDelay: '-1.5s' }}
        />
        <PageAmbientDecor />
      </div>

      <motion.div
        className="relative z-10 flex w-1/2 items-center justify-center overflow-hidden p-12"
        style={{ backgroundColor: 'var(--brand-deep)' }}
        initial={reduceMotion ? false : { opacity: 0, x: -52 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.78, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div
            className="brand-ambient-blob-a absolute -left-[35%] top-[5%] h-[min(95%,34rem)] w-[min(95%,34rem)] rounded-full bg-[var(--brand)] opacity-[0.38] blur-[3rem]"
            style={{ animationDelay: '-4s' }}
          />
          <div
            className="brand-ambient-blob-b absolute -right-[30%] -bottom-[25%] h-[78%] w-[78%] max-w-2xl rounded-full bg-white opacity-[0.16] blur-[2.5rem]"
            style={{ animationDelay: '-9s' }}
          />
        </div>
        <div className="relative text-center">
          <motion.img
            src={logo}
            alt="ClassroomCompanion Logo"
            className="mx-auto w-96 max-w-full drop-shadow-xl"
            animate={reduceMotion ? undefined : { y: [0, -5, 0] }}
            transition={
              reduceMotion
                ? undefined
                : { duration: 5.5, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.5 }
            }
          />
        </div>
      </motion.div>

      <motion.div
        className="relative z-10 flex w-1/2 items-center justify-center bg-background"
        initial={reduceMotion ? false : { opacity: 0, x: 52 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.78, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div
            className="brand-ambient-blob-c absolute -right-[5%] top-[12%] h-[min(46vw,21rem)] w-[min(46vw,21rem)] rounded-full bg-[var(--brand)] opacity-[0.13] blur-[3rem]"
            style={{ animationDelay: '-5s' }}
          />
        </div>

        <motion.div
          className="relative w-full max-w-md px-8"
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: reduceMotion ? 0 : 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.h2
            className="mb-2 text-3xl"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: reduceMotion ? 0 : 0.2 }}
          >
            Welcome back.
          </motion.h2>
          <motion.p
            className="mb-8 text-muted-foreground"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: reduceMotion ? 0 : 0.26 }}
          >
            Sign in to your account.
          </motion.p>

          <motion.form
            onSubmit={handleSubmit}
            className="space-y-6"
            variants={formVariants}
            initial="hidden"
            animate="show"
          >
            <motion.div variants={fieldVariants}>
              <label htmlFor="username" className="mb-2 block text-sm text-muted-foreground">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={`w-full rounded-lg border px-4 py-3 transition-shadow duration-300 focus:shadow-md focus:outline-none focus:ring-2 ${
                  error ? 'border-red-500' : 'border-border'
                } bg-input-background`}
                style={{ '--tw-ring-color': 'var(--brand)' } as React.CSSProperties}
              />
            </motion.div>

            <motion.div variants={fieldVariants}>
              <label htmlFor="password" className="mb-2 block text-sm text-muted-foreground">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full rounded-lg border px-4 py-3 transition-shadow duration-300 focus:shadow-md focus:outline-none focus:ring-2 ${
                  error ? 'border-red-500' : 'border-border'
                } bg-input-background`}
                style={{ '--tw-ring-color': 'var(--brand)' } as React.CSSProperties}
              />
            </motion.div>

            {error ? (
              <motion.p
                className="text-sm text-red-500"
                initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              >
                {error}
              </motion.p>
            ) : null}

            <motion.div variants={fieldVariants}>
              <motion.button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-lg py-3 text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand)' }}
                onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = 'var(--brand-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--brand)')}
                whileTap={reduceMotion || loading ? undefined : { scale: 0.98 }}
              >
                {loading ? (
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  'Log In'
                )}
              </motion.button>
            </motion.div>

            <motion.p
              className="text-center text-sm text-muted-foreground"
              variants={fieldVariants}
            >
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => navigate('/signup')}
                className="transition-opacity hover:underline hover:opacity-90"
                style={{ color: 'var(--brand)' }}
              >
                Sign up
              </button>
            </motion.p>
          </motion.form>
        </motion.div>
      </motion.div>
    </div>
  );
}
