import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';
import { AlertCircle, Lock, Mail } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const authError = searchParams.get('error');

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  const handleGoogleLogin = () => {

    window.location.href = `${API_BASE_URL}/auth/google`;
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/30">

      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800/90 rounded-2xl p-8 shadow-2xl backdrop-blur-xl flex flex-col gap-6">

        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-2">
            <Mail className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Login</h1>
          <p className="text-xs text-slate-400">
            Sign in to access your cold outreach & email scheduler workspace
          </p>
        </div>

        {authError && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2.5 text-xs text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Authentication failed or was cancelled. Please try again.</span>
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full py-3 px-4 rounded-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-medium text-sm transition-all duration-150 shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-3 cursor-pointer"
          >

            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Login with Google</span>
          </button>
        </div>

        <div className="relative flex items-center justify-center">
          <div className="border-t border-slate-800 w-full" />
          <span className="bg-slate-900 px-3 text-xs uppercase tracking-wider text-slate-500 shrink-0 font-medium">
            or
          </span>
        </div>

        <form onSubmit={(e) => e.preventDefault()} className="space-y-4 opacity-60">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
              <span>Email address</span>
              <span className="text-[10px] text-slate-500 font-normal">(Mock only)</span>
            </label>
            <div className="relative">
              <input
                type="email"
                disabled
                placeholder="name@company.com"
                className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-400 placeholder-slate-600 cursor-not-allowed focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
              <span>Password</span>
              <span className="text-[10px] text-slate-500 font-normal">(Mock only)</span>
            </label>
            <div className="relative">
              <input
                type="password"
                disabled
                placeholder="••••••••••••"
                className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-400 placeholder-slate-600 cursor-not-allowed focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled
            className="w-full py-2.5 px-4 rounded-lg bg-slate-800 text-slate-500 font-medium text-xs cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Sign in with Email</span>
          </button>
        </form>

        <p className="text-[11px] text-center text-slate-500">
          Protected by Google OAuth 2.0 with secure httpOnly cookies.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
