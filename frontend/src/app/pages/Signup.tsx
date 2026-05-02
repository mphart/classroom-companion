import { useState } from 'react';
import { useNavigate } from 'react-router';

export function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !username || !password) {
      setError('Please fill in all fields');
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
      <div className="w-1/2 flex items-center justify-center p-12" style={{ backgroundColor: 'rgb(30, 58, 42)' }}>
        <div className="text-center">
          <img
            src="/src/imports/classroomcompanion_logo_v4.svg"
            alt="ClassroomCompanion Logo"
            className="w-96 mx-auto"
          />
        </div>
      </div>

      <div className="w-1/2 flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md px-8">
          <h2 className="text-3xl mb-2">Create your account.</h2>
          <p className="text-gray-600 mb-8">It only takes a moment.</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-sm mb-2 text-gray-700">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full px-4 py-3 rounded-lg border ${
                  error ? 'border-red-500' : 'border-gray-300'
                } focus:outline-none focus:ring-2`}
                style={{ '--tw-ring-color': 'rgb(92, 201, 122)' } as React.CSSProperties}
              />
            </div>

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
                style={{ '--tw-ring-color': 'rgb(92, 201, 122)' } as React.CSSProperties}
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
                style={{ '--tw-ring-color': 'rgb(92, 201, 122)' } as React.CSSProperties}
              />
            </div>

            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full text-white py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              style={{ backgroundColor: 'rgb(92, 201, 122)' }}
              onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = 'rgb(72, 181, 102)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgb(92, 201, 122)')}
            >
              {loading ? (
                <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                'Create Account'
              )}
            </button>

            <p className="text-center text-sm text-gray-600">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => navigate('/')}
                className="hover:underline"
                style={{ color: 'rgb(92, 201, 122)' }}
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
