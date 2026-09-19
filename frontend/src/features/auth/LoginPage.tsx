import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../store';
import { loginUser } from '../../store/authSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCustomerLogo } from '../../hooks/useCustomerLogo';

export const LoginPage: React.FC = () => {
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-muted/20 px-4">
      <Card className="relative w-full max-w-sm border-border/60 shadow-sm">
        {isLoggingIn && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 rounded-lg bg-background/90 backdrop-blur-sm">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm font-medium text-muted-foreground">Signing in...</p>
          </div>
        )}
        <CardHeader className="space-y-2 text-center pb-6">
          <div className="flex justify-center mb-2">
            <img src={logoSrc} alt="Customer logo" className="h-16 w-auto max-w-[220px] object-contain" />
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight">Welcome back</CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            Please sign in to your account
          </CardDescription>
        </CardHeader>

        <CardContent>
          {successMessage && (
            <Alert variant="default" className="bg-emerald-50 text-emerald-700 border-emerald-200 mb-4 py-3">
              <AlertDescription className="text-xs">{successMessage}</AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive" className="mb-4 py-3">
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                id="email"
                type="text"
                placeholder="Email address"
                required
                disabled={isLoggingIn}
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Input
                id="password"
                type="password"
                placeholder="Password"
                required
                disabled={isLoggingIn}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="flex justify-end mt-1">
                <Link
                  to="#"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={isLoggingIn}>
              {isLoggingIn ? 'Signing In...' : 'Sign in'}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/60" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">
                or continue with
              </span>
            </div>
          </div>

       
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Created and designed by{' '}
        <a
          href="https://cloudgoo.in/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground underline-offset-2 hover:underline"
        >
          Cloudgoo
        </a>
      </p>
    </div>
  );
};
