import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../store';
import { fetchUsers, createUser, updateUser, deleteUser } from '../../store/userSlice';
import { UserDto, UserRole } from '@rdp/shared';
import {
  Search,
  UserPlus,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  UserX,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';

export const UserManagement: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { users, isLoading } = useSelector((state: RootState) => state.users);
  const currentUser = useSelector((state: RootState) => state.auth.user);

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDto | null>(null);

  // Form states
  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    username: string;
    password: string;
    role: UserRole;
    isActive: boolean;
  }>({
    name: '',
    email: '',
    username: '',
    password: '',
    role: UserRole.USER,
    isActive: true,
  });
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchUsers());
  }, [dispatch]);

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      username: '',
      password: '',
      role: UserRole.USER,
      isActive: true,
    });
    setModalError(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (user: UserDto) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      username: user.username,
      password: '',
      role: user.role,
      isActive: user.isActive,
    });
    setModalError(null);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (editingUser) {
      const payload: Record<string, unknown> = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        isActive: formData.isActive,
      };
      if (formData.password) payload.password = formData.password;

      const res = await dispatch(updateUser({ id: editingUser.id, data: payload }));
      if (updateUser.fulfilled.match(res)) {
        if (editingUser.isActive && !formData.isActive) {
          toast.success(`${editingUser.username} disabled and logged out`);
        } else if (!editingUser.isActive && formData.isActive) {
          toast.success(`${editingUser.username} enabled`);
        }
        setEditingUser(null);
      } else {
        setModalError(res.payload as string);
      }
    } else {
      const res = await dispatch(createUser(formData));
      if (createUser.fulfilled.match(res)) {
        setIsAddModalOpen(false);
      } else {
        setModalError(res.payload as string);
      }
    }
  };

  const handleToggleActive = async (user: UserDto) => {
    if (currentUser?.id === user.id && user.isActive) {
      toast.error('You cannot disable your own account');
      return;
    }

    const nextActive = !user.isActive;
    const res = await dispatch(updateUser({ id: user.id, data: { isActive: nextActive } }));
    if (updateUser.fulfilled.match(res)) {
      toast.success(
        nextActive
          ? `${user.username} has been enabled`
          : `${user.username} has been disabled and logged out`
      );
    } else {
      toast.error((res.payload as string) || 'Failed to update user status');
    }
  };

  const handleToggle2FA = async (user: UserDto) => {
    const nextEnabled = !user.email2faEnabled;
    const res = await dispatch(
      updateUser({ id: user.id, data: { email2faEnabled: nextEnabled } }),
    );
    if (updateUser.fulfilled.match(res)) {
      toast.success(
        nextEnabled
          ? `Two-factor authentication enabled for ${user.username}`
          : `Two-factor authentication disabled for ${user.username}`,
      );
    } else {
      toast.error((res.payload as string) || 'Failed to update 2FA setting');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this user? All assignments will be removed.')) {
      await dispatch(deleteUser(id));
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && user.isActive) ||
      (statusFilter === 'DISABLED' && !user.isActive);
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b pb-5 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage portal users, roles, two-factor authentication, and account access
          </p>
        </div>
        <Button onClick={handleOpenAdd} className="gap-2">
          <UserPlus className="w-4 h-4" />
          Add New User
        </Button>
      </div>

      {/* Filter & Search Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col lg:flex-row items-center justify-between gap-4">
          <div className="relative w-full lg:w-80">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, username, or email..."
              className="pl-9"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Role:</span>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="ALL">All Roles</option>
                <option value="ADMIN">ADMIN</option>
                <option value="USER">USER</option>
              </select>
            </div>
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="DISABLED">Disabled</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading users...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">No users found matching filter criteria.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User Details</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>2FA</TableHead>
                  <TableHead>VM Count</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((u) => {
                  const isSelf = currentUser?.id === u.id;
                  return (
                    <TableRow key={u.id} className={!u.isActive ? 'opacity-70' : undefined}>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center font-bold text-muted-foreground uppercase text-xs">
                            {u.name[0]}
                          </div>
                          <div>
                            <div className="font-semibold">{u.name}</div>
                            <div className="text-xs text-muted-foreground">@{u.username} • {u.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.role === 'ADMIN' ? 'default' : 'secondary'}>
                          {u.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {u.isActive ? (
                          <span className="flex items-center text-emerald-500 text-xs font-semibold">
                            <CheckCircle className="w-4 h-4 mr-1" /> Active
                          </span>
                        ) : (
                          <span className="flex items-center text-destructive text-xs font-semibold">
                            <XCircle className="w-4 h-4 mr-1" /> Disabled
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={Boolean(u.email2faEnabled)}
                            onCheckedChange={() => {
                              void handleToggle2FA(u);
                            }}
                            title={
                              u.email2faEnabled
                                ? 'Disable two-factor authentication'
                                : 'Enable two-factor authentication'
                            }
                          />
                          <span
                            className={`text-xs font-medium ${
                              u.email2faEnabled ? 'text-emerald-600' : 'text-muted-foreground'
                            }`}
                          >
                            {u.email2faEnabled ? 'On' : 'Off'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {u._count?.assignments || 0} VMs assigned
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggleActive(u)}
                            disabled={isSelf && u.isActive}
                            title={
                              isSelf && u.isActive
                                ? 'You cannot disable your own account'
                                : u.isActive
                                  ? 'Disable user'
                                  : 'Enable user'
                            }
                            className={
                              u.isActive
                                ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-500/10'
                                : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10'
                            }
                          >
                            {u.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(u)}
                            title="Edit User"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteUser(u.id)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Delete User"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Add / Edit User Dialog */}
      <Dialog open={isAddModalOpen || !!editingUser} onOpenChange={(open) => { if (!open) { setIsAddModalOpen(false); setEditingUser(null); } }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingUser ? `Edit User: ${editingUser.username}` : 'Add New Portal User'}</DialogTitle>
            <DialogDescription>
              {editingUser
                ? 'Update details or disable this account to block login and end active sessions.'
                : 'Create a new user account.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveUser} className="space-y-4 py-4">
            {modalError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{modalError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Full Name <span className="text-destructive">*</span></Label>
              <Input
                id="name"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="John Doe"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address <span className="text-destructive">*</span></Label>
              <Input
                id="email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="john@company.com"
              />
            </div>

            {!editingUser && (
              <div className="space-y-2">
                <Label htmlFor="username">Username <span className="text-destructive">*</span></Label>
                <Input
                  id="username"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="johndoe"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">
                {editingUser ? 'Reset Password (Optional)' : 'Password'} {!editingUser && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="password"
                type="password"
                required={!editingUser}
                minLength={6}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder={editingUser ? 'Leave blank to keep current password' : '••••••••••••'}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role <span className="text-destructive">*</span></Label>
              <select
                id="role"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="USER">USER (Standard User)</option>
                <option value="ADMIN">ADMIN (Administrator)</option>
              </select>
            </div>

            {editingUser && (
              <div className="space-y-2">
                <Label htmlFor="accountStatus">Account Status</Label>
                <select
                  id="accountStatus"
                  value={formData.isActive ? 'ACTIVE' : 'DISABLED'}
                  disabled={currentUser?.id === editingUser.id}
                  onChange={(e) =>
                    setFormData({ ...formData, isActive: e.target.value === 'ACTIVE' })
                  }
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="ACTIVE">Active — can log in</option>
                  <option value="DISABLED">Disabled — blocked from login</option>
                </select>
                {currentUser?.id === editingUser.id ? (
                  <p className="text-xs text-muted-foreground">You cannot disable your own account.</p>
                ) : !formData.isActive ? (
                  <p className="text-xs text-muted-foreground">
                    Disabled users cannot log in and will be signed out immediately.
                  </p>
                ) : null}
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => { setIsAddModalOpen(false); setEditingUser(null); }}>
                Cancel
              </Button>
              <Button type="submit">
                {editingUser ? 'Save Changes' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
