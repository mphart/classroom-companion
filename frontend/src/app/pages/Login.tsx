import { useState } from 'react';
import { useNavigate } from 'react-router';
import logo from '@/imports/classroomcompanion_logo_v4.svg';

export function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Please enter both username and password');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      navigate('/home');
    }, 500);
  };

  return (
    <div className="min-h-screen flex">
      <div className="w-1/2 flex items-center justify-center p-12" style={{ backgroundColor: 'var(--brand-deep)' }}>
        <div className="text-center">
          <img
            src={logo}
            alt="ClassroomCompanion Logo"
            className="w-96 max-w-full mx-auto"
          />
        </div>
      </div>

      <div className="w-1/2 flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md px-8">
          <h2 className="text-3xl mb-2">Welcome back.</h2>
          <p className="text-gray-600 mb-8">Sign in to your account.</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="username" className="block text-sm mb-2 text-gray-700">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={`w-full px-4 py-3 rounded-lg border ${
                  error ? 'border-red-500' : 'border-gray-300'
                } focus:outline-none focus:ring-2`}
                style={{ '--tw-ring-color': 'var(--brand)' } as React.CSSProperties}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm mb-2 text-gray-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full px-4 py-3 rounded-lg border ${
                  error ? 'border-red-500' : 'border-gray-300'
                } focus:outline-none focus:ring-2`}
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
                'Log In'
              )}
            </button>

            <p className="text-center text-sm text-gray-600">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => navigate('/signup')}
                className="hover:underline"
                style={{ color: 'var(--brand)' }}
              >
                Sign up
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
