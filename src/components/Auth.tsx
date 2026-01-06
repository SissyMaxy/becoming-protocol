import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Sparkles, Mail, Lock, Loader2, ArrowRight } from 'lucide-react';

type AuthMode = 'signin' | 'signup';

export function Auth() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'signup') {
        const { error } = await signUp(email, password);
        if (error) {
          setError(error.message);
        } else {
          setMessage('Check your email to confirm your account');
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) {
          setError(error.message);
        }
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-protocol-bg flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8 animate-slide-up">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="w-20 h-20 mx-auto bg-protocol-surface rounded-full flex items-center justify-center border border-protocol-border">
            <Sparkles className="w-10 h-10 text-protocol-accent" />
          </div>
          <h1 className="text-2xl font-semibold text-protocol-text">
            Becoming Protocol
          </h1>
          <p className="text-protocol-text-muted text-sm">
            {mode === 'signin' ? 'Welcome back' : 'Begin your journey'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="space-y-2">
            <label className="text-sm text-protocol-text-muted">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-protocol-text-muted" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-11 pr-4 py-3 bg-protocol-surface border border-protocol-border rounded-lg
                  text-protocol-text placeholder:text-protocol-text-muted/50
                  focus:outline-none focus:border-protocol-accent focus:ring-1 focus:ring-protocol-accent
                  transition-colors"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-2">
            <label className="text-sm text-protocol-text-muted">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-protocol-text-muted" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-11 pr-4 py-3 bg-protocol-surface border border-protocol-border rounded-lg
                  text-protocol-text placeholder:text-protocol-text-muted/50
                  focus:outline-none focus:border-protocol-accent focus:ring-1 focus:ring-protocol-accent
                  transition-colors"
              />
            </div>
          </div>

          {/* Confirm Password (signup only) */}
          {mode === 'signup' && (
            <div className="space-y-2">
              <label className="text-sm text-protocol-text-muted">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-protocol-text-muted" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-4 py-3 bg-protocol-surface border border-protocol-border rounded-lg
                    text-protocol-text placeholder:text-protocol-text-muted/50
                    focus:outline-none focus:border-protocol-accent focus:ring-1 focus:ring-protocol-accent
                    transition-colors"
                />
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="p-3 rounded-lg bg-protocol-danger/10 border border-protocol-danger/30">
              <p className="text-sm text-protocol-danger">{error}</p>
            </div>
          )}

          {/* Success message */}
          {message && (
            <div className="p-3 rounded-lg bg-protocol-success/10 border border-protocol-success/30">
              <p className="text-sm text-protocol-success">{message}</p>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 rounded-lg font-medium flex items-center justify-center gap-2
              bg-protocol-accent hover:bg-protocol-accent-soft text-white transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                {mode === 'signin' ? 'Sign In' : 'Create Account'}
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        {/* Toggle mode */}
        <p className="text-center text-sm text-protocol-text-muted">
          {mode === 'signin' ? (
            <>
              Don't have an account?{' '}
              <button
                onClick={() => {
                  setMode('signup');
                  setError(null);
                  setMessage(null);
                }}
                className="text-protocol-accent hover:text-protocol-accent-soft transition-colors"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => {
                  setMode('signin');
                  setError(null);
                  setMessage(null);
                }}
                className="text-protocol-accent hover:text-protocol-accent-soft transition-colors"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
