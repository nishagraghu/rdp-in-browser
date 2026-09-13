import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../store';
import { loginUser } from '../../store/authSlice';
import { Monitor, Lock, User, ArrowRight, ShieldCheck, UserCheck } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const location = useLocation();

  const { isLoading, error } = useSelector((state: RootState) => state.auth);
  const successMessage = (location.state as { message?: string })?.message;

  const handleLogin = async (u: string, p: string) => {
    const result = await dispatch(loginUser({ usernameOrEmail: u, password: p }));
    if (loginUser.fulfilled.match(result)) {
      const user = result.payload;
      if (user.role === 'ADMIN') {
        navigate('/admin/dashboard');
      } else {
        navigate('/dashboard');
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLogin(usernameOrEmail, password);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-xl flex items-center justify-center">
            <Monitor className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome Back</h1>
          <p className="text-sm text-slate-400">Sign in to your Remote Desktop Portal</p>
        </div>

        {successMessage && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm">
            {successMessage}
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-sm">
            {error}
          </div>
        )}

        {/* Quick Demo Access Box */}
        <div className="p-4 bg-slate-800/60 border border-slate-700/60 rounded-xl space-y-3">
          <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider text-center">
            Quick One-Click Demo Access
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setUsernameOrEmail('admin');
                setPassword('admin123');
                handleLogin('admin', 'admin123');
              }}
              className="py-2.5 px-3 bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/30 text-sky-300 rounded-lg text-xs font-medium flex items-center justify-center space-x-1.5 transition-all"
            >
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              <span>Login Admin</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setUsernameOrEmail('guest');
                setPassword('guest123');
                handleLogin('guest', 'guest123');
              }}
              className="py-2.5 px-3 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 rounded-lg text-xs font-medium flex items-center justify-center space-x-1.5 transition-all"
            >
              <UserCheck className="w-4 h-4 text-indigo-400" />
              <span>Login Guest</span>
            </button>
          </div>
          <div className="text-[11px] text-slate-400 text-center space-y-0.5 pt-1 border-t border-slate-700/40">
            <div>🔑 Admin: <span className="font-mono text-white">admin</span> / <span className="font-mono text-white">admin123</span></div>
            <div>👤 Guest: <span className="font-mono text-white">guest</span> / <span className="font-mono text-white">guest123</span></div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">USERNAME OR EMAIL</label>
            <div className="relative">
              <User className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                type="text"
                required
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                placeholder="username or email@company.com"
                className="w-full pl-9 pr-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">PASSWORD</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-9 pr-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg shadow-lg shadow-sky-600/30 flex items-center justify-center space-x-2 transition-all disabled:opacity-50 mt-6"
          >
            <span>{isLoading ? 'Signing In...' : 'Sign In'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
