import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../../store';
import { fetchCurrentUser } from '../../store/authSlice';
import api from '../../api/client';
import { User, Mail, Key, Lock, Eye, EyeOff, Save, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export const ProfilePage: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch<AppDispatch>();

  // Profile details state
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [profileStatus, setProfileStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Reset password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Populate user data once loaded
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
    }
  }, [user]);

  // Handle Profile Details update
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setProfileStatus(null);
    setIsSavingProfile(true);

    try {
      const payload: { name: string; email: string } = {
        name: name.trim(),
        email: email.trim(),
      };

      const res = await api.put(`/users/${user.id}`, payload);
      if (res.data.success) {
        setProfileStatus({ type: 'success', message: 'Profile updated successfully!' });
        toast.success('Profile details updated successfully');
        dispatch(fetchCurrentUser());
      }
    } catch (err: unknown) {
      const errorResponse = err as { response?: { data?: { error?: string } } };
      const msg = errorResponse.response?.data?.error || 'Failed to update profile';
      setProfileStatus({ type: 'error', message: msg });
      toast.error(msg);
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Handle Reset Password
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setPasswordStatus(null);

    if (!newPassword) {
      setPasswordStatus({ type: 'error', message: 'Please enter a new password' });
      return;
    }

    if (newPassword.length < 6) {
      setPasswordStatus({ type: 'error', message: 'Password must be at least 6 characters long' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: 'error', message: 'Passwords do not match' });
      return;
    }

    setIsResettingPassword(true);

    try {
      const res = await api.put(`/users/${user.id}`, { password: newPassword });
      if (res.data.success) {
        setPasswordStatus({ type: 'success', message: 'Password has been reset successfully!' });
        toast.success('Your password has been reset successfully!');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err: unknown) {
      const errorResponse = err as { response?: { data?: { error?: string } } };
      const msg = errorResponse.response?.data?.error || 'Failed to reset password';
      setPasswordStatus({ type: 'error', message: msg });
      toast.error(msg);
    } finally {
      setIsResettingPassword(false);
    }
  };

  const isPasswordValidLength = newPassword.length >= 6;
  const doPasswordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight">Account Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account information and reset your password</p>
      </div>

      {/* User Information Banner Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center space-x-4">
            <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center font-bold text-primary-foreground text-2xl uppercase shadow-sm">
              {user?.name?.[0] || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold truncate">{user?.name}</h2>
                <Badge variant="secondary" className="text-[10px] px-2 py-0.5 uppercase tracking-wider">
                  {user?.role}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">@{user?.username}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profile Details Card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            Profile Details
          </CardTitle>
          <CardDescription className="text-xs">
            Update your public display name and contact email address
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {profileStatus && (
            <Alert
              variant={profileStatus.type === 'success' ? 'default' : 'destructive'}
              className={profileStatus.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' : ''}
            >
              <AlertDescription className="text-xs font-medium">
                {profileStatus.message}
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase">FULL NAME</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase">EMAIL ADDRESS</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={isSavingProfile}
                className="w-full sm:w-auto flex items-center space-x-2 text-xs font-semibold"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSavingProfile ? 'Saving...' : 'Save Profile Details'}</span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Reset Password Card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" />
            Reset Password
          </CardTitle>
          <CardDescription className="text-xs">
            Enter a new password for your account. Must be at least 6 characters long.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {passwordStatus && (
            <Alert
              variant={passwordStatus.type === 'success' ? 'default' : 'destructive'}
              className={passwordStatus.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' : ''}
            >
              <AlertDescription className="text-xs font-medium">
                {passwordStatus.message}
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handlePasswordReset} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase">NEW PASSWORD</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min. 6 characters)"
                  className="pl-9 pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase">CONFIRM NEW PASSWORD</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password to confirm"
                  className="pl-9 pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Password Validation Hints */}
            {newPassword.length > 0 && (
              <div className="rounded-lg bg-muted/60 p-3 space-y-1.5 text-xs border border-border">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className={`w-3.5 h-3.5 ${isPasswordValidLength ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                  <span className={isPasswordValidLength ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                    At least 6 characters
                  </span>
                </div>
                {confirmPassword.length > 0 && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`w-3.5 h-3.5 ${doPasswordsMatch ? 'text-emerald-500' : 'text-destructive'}`} />
                    <span className={doPasswordsMatch ? 'text-foreground font-medium' : 'text-destructive font-medium'}>
                      {doPasswordsMatch ? 'Passwords match' : 'Passwords do not match'}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="pt-2">
              <Button
                type="submit"
                disabled={isResettingPassword || !isPasswordValidLength || !doPasswordsMatch}
                className="w-full sm:w-auto flex items-center space-x-2 text-xs font-semibold"
              >
                <Key className="w-3.5 h-3.5" />
                <span>{isResettingPassword ? 'Resetting Password...' : 'Reset Password'}</span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
