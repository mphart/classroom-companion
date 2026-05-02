import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import logo from '@/imports/classroomcompanion_logo_v4.svg';
import { signup as signupRequest } from '@/app/lib/api';
import { getToken, setSession } from '@/app/lib/authSession';

export function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!getToken()) return;
    navigate('/home', { replace: true });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !username || !password) {
      setError('Please fill in all fields');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      const { token, user } = await signupRequest({
        name: name.trim(),
        username: username.trim(),
        password,
      });
      setSession(token, user);
      navigate('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <div className="w-1/2 flex items-center justify-center p-12" style={{ backgroundColor: 'var(--brand-deep)' }}>
        <div className="text-center">
          <img
            src={logo}
            alt="ClassroomCompanion Logo"
            className="w-96 max-w-full mx-auto"
          />
        </div>
      </div>

      <div className="w-1/2 flex items-center justify-center bg-background">
        <div className="w-full max-w-md px-8">
          <h2 className="text-3xl mb-2">Create your account.</h2>
          <p className="text-muted-foreground mb-8">It only takes a moment.</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-sm mb-2 text-muted-foreground">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full px-4 py-3 rounded-lg border ${
                  error ? 'border-red-500' : 'border-border'
                } bg-input-background focus:outline-none focus:ring-2`}
                style={{ '--tw-ring-color': 'var(--brand)' } as React.CSSProperties}
              />
            </div>

            <div>
              <label htmlFor="username" className="block text-sm mb-2 text-muted-foreground">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={`w-full px-4 py-3 rounded-lg border ${
                  error ? 'border-red-500' : 'border-border'
                } bg-input-background focus:outline-none focus:ring-2`}
                style={{ '--tw-ring-color': 'var(--brand)' } as React.CSSProperties}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm mb-2 text-muted-foreground">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full px-4 py-3 rounded-lg border ${
                  error ? 'border-red-500' : 'border-border'
                } bg-input-background focus:outline-none focus:ring-2`}
                style={{ '--tw-ring-color': 'var(--brand)' } as React.CSSProperties}
              />
            </div>

            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full text-white py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              style={{ backgroundColor: 'var(--brand)' }}
              onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = 'var(--brand-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--brand)')}
            >
              {loading ? (
                <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                'Create Account'
              )}
            </button>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => navigate('/')}
                className="hover:underline"
                style={{ color: 'var(--brand)' }}
              >
                Log in
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
