import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../../store';
import { fetchCurrentUser } from '../../store/authSlice';
import api from '../../api/client';
import { User, Mail, Key, Save } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

export const ProfilePage: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch<AppDispatch>();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setStatus(null);
    setIsSaving(true);

    try {
      const payload: Record<string, unknown> = { name, email };
      if (password) payload.password = password;

      const res = await api.put(`/users/${user.id}`, payload);
      if (res.data.success) {
        setStatus({ type: 'success', message: 'Profile updated successfully!' });
        setPassword('');
        dispatch(fetchCurrentUser());
      }
    } catch (err: unknown) {
      const errorResponse = err as { response?: { data?: { error?: string } } };
      setStatus({ type: 'error', message: errorResponse.response?.data?.error || 'Failed to update profile' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight">Account Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account information and password</p>
      </div>

      {status && (
        <Alert variant={status.type === 'success' ? 'default' : 'destructive'} className={status.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : ''}>
          <AlertDescription>
            {status.message}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="flex items-center space-x-4 pb-6 border-b border-border">
            <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center font-bold text-primary-foreground text-2xl uppercase">
              {user?.name?.[0] || 'U'}
            </div>
            <div>
              <h2 className="text-lg font-bold">{user?.name}</h2>
              <p className="text-xs text-muted-foreground">@{user?.username}</p>
              <Badge variant="secondary" className="mt-2 text-[10px] px-2 py-0.5 uppercase tracking-wider">
                {user?.role}
              </Badge>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase">FULL NAME</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase">EMAIL ADDRESS</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase">CHANGE PASSWORD (OPTIONAL)</Label>
              <div className="relative">
                <Key className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank to keep current password"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="pt-4">
              <Button
                type="submit"
                disabled={isSaving}
                className="w-full sm:w-auto flex items-center space-x-2"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving...' : 'Save Profile Changes'}</span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
