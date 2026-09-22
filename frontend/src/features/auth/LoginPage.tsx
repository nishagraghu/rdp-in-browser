import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../store';
import { loginUser } from '../../store/authSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCustomerLogo } from '../../hooks/useCustomerLogo';
import staticLogo from '../../logo.png';
import {
  ArrowRight,
  CloudUpload,
  Eye,
  EyeOff,
  Gauge,
  Lock,
  ShieldCheck,
  User,
} from 'lucide-react';

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Secure by Design',
    description: 'Data encryption and multi-factor authentication are standard.',
  },
  {
    icon: Gauge,
    title: 'Lightning Fast',
    description: 'Optimized global content delivery for rapid access.',
  },
  {
    icon: CloudUpload,
    title: 'Scale with Ease',
    description: 'Expand your storage as your needs grow, without complexity.',
  },
] as const;

export const LoginPage: React.FC = () => {
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const location = useLocation();
  const { logoSrc } = useCustomerLogo();

  const { isLoggingIn, error } = useSelector((state: RootState) => state.auth);
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
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      {/* Left panel — static branding */}
      <aside className="relative flex flex-col justify-center overflow-hidden bg-[#e8f3fb] px-8 py-10 sm:px-12 lg:w-1/2 lg:px-16 lg:py-14">
        <div
          className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#cfe6f7]/40"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-[#cfe6f7]/50"
          aria-hidden
        />

        <div className="relative z-10 max-w-lg">
          <img
            src={staticLogo}
            alt="Cloudgoo"
            className="mb-6 h-16 w-auto max-w-[260px] object-contain sm:mb-8 sm:h-20"
          />

          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.75rem] lg:leading-tight">
            Unlock the Cloud
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
            Get started in seconds. Securely manage and access your files from anywhere,
            built on modern technology.
          </p>

          <ul className="mt-10 space-y-6">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#d6ebf8] text-[#1e4a7a]">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900 sm:text-base">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500 sm:text-sm">
                    {description}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-12 hidden lg:block">
            <div className="mb-3 h-px w-10 bg-slate-300" />
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
              Elevating your digital footprint
            </p>
          </div>
        </div>
      </aside>

      {/* Right panel — login form */}
      <section className="relative flex flex-1 flex-col items-center justify-center bg-[#eef4f9] px-4 py-12 sm:px-8 lg:w-1/2 lg:py-14">
        <div className="relative w-full max-w-[400px]">
          <div className="relative rounded-2xl border border-white/80 bg-white px-6 py-8 shadow-[0_8px_40px_rgba(15,40,80,0.08)] sm:px-8 sm:py-10">
            {isLoggingIn && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/90 backdrop-blur-sm">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#1a3358] border-t-transparent" />
                <p className="text-sm font-medium text-slate-500">Signing in...</p>
              </div>
            )}

            <div className="mb-6 flex flex-col items-center text-center">
              <img
                src={logoSrc}
                alt="Customer logo"
                className="mb-5 h-20 w-auto max-w-[260px] object-contain sm:h-24"
              />
              <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                Log in to your account
              </h2>
            </div>

            {successMessage && (
              <Alert
                variant="default"
                className="mb-4 border-emerald-200 bg-emerald-50 py-3 text-emerald-700"
              >
                <AlertDescription className="text-xs">{successMessage}</AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive" className="mb-4 py-3">
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="email"
                  type="text"
                  placeholder="User Name"
                  required
                  disabled={isLoggingIn}
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  className="h-11 rounded-lg border-slate-200 bg-white pl-10 text-sm placeholder:text-slate-400 focus-visible:ring-[#1a3358]/30"
                />
              </div>

              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  required
                  disabled={isLoggingIn}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 rounded-lg border-slate-200 bg-white pl-10 pr-10 text-sm placeholder:text-slate-400 focus-visible:ring-[#1a3358]/30"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                >
                  {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>

              <Button
                type="submit"
                disabled={isLoggingIn}
                className="mt-2 h-11 w-full rounded-lg bg-[#1a3358] text-sm font-semibold text-white hover:bg-[#152a4a]"
              >
                {isLoggingIn ? (
                  'Signing In...'
                ) : (
                  <>
                    Log In
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            {/* <p className="mt-5 text-center text-xs leading-relaxed text-slate-400">
              New accounts can only be created by an administrator.
              Self-signup is not available.
            </p> */}
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-slate-400">
          Created and designed by{' '}
          <a
            href="https://cloudgoo.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-600 underline-offset-2 hover:underline"
          >
            Cloudgoo
          </a>
        </p>
      </section>
    </div>
  );
};
