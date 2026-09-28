import React, { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { AppDispatch, RootState } from '../../store';
import { fetchVms, updateVm, deleteVm } from '../../store/vmSlice';
import { fetchUsers } from '../../store/userSlice';
import api from '../../api/client';
import { VmDto, UserDto, Permission, hasPermission } from '@rdp/shared';
import { toast } from 'sonner';
import { 
  Search, Plus, Edit2, Trash2, Wifi, Users, Server, Check, 
  AlertCircle, LogOut, Monitor
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';

interface ActiveSession {
  sessionId: string;
  username: string;
  vmId: string;
  vmName: string;
  status: string;
  connectedAt: string;
}

export const VmManagement: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { vms, isLoading } = useSelector((state: RootState) => state.vms);
  const { users } = useSelector((state: RootState) => state.users);
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const canViewSessions = !!currentUser && hasPermission(currentUser.role, Permission.SESSION_VIEW);
  const canTerminateSessions = !!currentUser && hasPermission(currentUser.role, Permission.SESSION_TERMINATE);

  const [searchTerm, setSearchTerm] = useState('');
  const [protocolFilter, setProtocolFilter] = useState<string>('ALL');

  const [assigningVm, setAssigningVm] = useState<VmDto | null>(null);

  // Connection test state
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState<string | null>(null);

  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [loggingOutId, setLoggingOutId] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchVms());
    dispatch(fetchUsers());
  }, [dispatch]);

  const loadSessions = useCallback(async () => {
    if (!canViewSessions) return;
    try {
      const res = await api.get('/sessions');
      setActiveSessions(res.data?.data?.sessions || []);
      setSessionsError(null);
    } catch {
      setSessionsError('Could not load active sessions.');
    }
  }, [canViewSessions]);

  useEffect(() => {
    if (!canViewSessions) return;
    loadSessions();
    const timer = setInterval(loadSessions, 5000);
    return () => clearInterval(timer);
  }, [canViewSessions, loadSessions]);

  const handleForceLogout = async (session: ActiveSession) => {
    const ok = window.confirm(
      `Log ${session.username} out of ${session.vmName}? Their remote desktop will disconnect immediately.`,
    );
    if (!ok) return;
    setLoggingOutId(session.sessionId);
    try {
      await api.post(`/sessions/${session.sessionId}/logout`);
      toast.success(`${session.username} was logged out of ${session.vmName}.`);
      await loadSessions();
    } catch (err: unknown) {
      const errorResponse = err as { response?: { data?: { error?: string } } };
      toast.error(errorResponse.response?.data?.error || 'Could not log out that session.');
    } finally {
      setLoggingOutId(null);
    }
  };

  const handleOpenAdd = () => navigate('/admin/vms/new');
  const handleOpenEdit = (vm: VmDto) => navigate(`/admin/vms/${vm.id}/edit`);

  const handleOpenAssign = (vm: VmDto) => {
    setAssigningVm(vm);
    const assignedIds = vm.assignedUsers?.map((u: UserDto) => u.id) || [];
    setSelectedUserIds(assignedIds);
  };

  const handleSaveAssignments = async () => {
    if (!assigningVm) return;
    try {
      await api.put(`/vms/${assigningVm.id}/users`, { userIds: selectedUserIds });
      dispatch(fetchVms());
      setAssigningVm(null);
    } catch {
      alert('Failed to update assignments');
    }
  };

  const handleTestConnection = async (vm: VmDto) => {
    setIsTesting(vm.id);
    setTestResult(null);
    try {
      const res = await api.post(`/vms/${vm.id}/test-connection`);
      setTestResult({
        id: vm.id,
        success: res.data.success,
        message: res.data.message || 'Host is reachable!',
      });
    } catch (err: unknown) {
      const errorResponse = err as { response?: { data?: { error?: string } } };
      setTestResult({
        id: vm.id,
        success: false,
        message: errorResponse.response?.data?.error || 'Connection test failed',
      });
    } finally {
      setIsTesting(null);
    }
  };

  const handleDeleteVm = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this VM configuration?')) {
      await dispatch(deleteVm(id));
    }
  };

  const handleToggleActive = async (vm: VmDto) => {
    await dispatch(updateVm({ id: vm.id, data: { isActive: !vm.isActive } }));
  };

  const filteredVms = vms.filter((vm) => {
    const matchesSearch =
      vm.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vm.hostname.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (vm.description && vm.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesProtocol = protocolFilter === 'ALL' || vm.protocol === protocolFilter;
    return matchesSearch && matchesProtocol;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b pb-5 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">VM Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure virtual machines, target host RDP settings, and user access control</p>
        </div>
        <Button onClick={handleOpenAdd} className="gap-2">
          <Plus className="w-4 h-4" />
          Add New VM
        </Button>
      </div>

      {/* Filter & Search Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, hostname..."
              className="pl-9"
            />
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Protocol:</span>
            <select
              value={protocolFilter}
              onChange={(e) => setProtocolFilter(e.target.value)}
              className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="ALL">All Protocols</option>
              <option value="RDP">RDP</option>
              <option value="VNC">VNC</option>
              <option value="SSH">SSH</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Connection Test Toast */}
      {testResult && (
        <Alert variant={testResult.success ? 'default' : 'destructive'} className={testResult.success ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/10' : ''}>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center space-x-2">
              {testResult.success ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <AlertDescription>{testResult.message}</AlertDescription>
            </div>
            <Button variant="link" size="sm" onClick={() => setTestResult(null)} className="h-auto p-0">Dismiss</Button>
          </div>
        </Alert>
      )}

      {canViewSessions && (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-primary" />
                  Active sessions
                  <Badge variant="secondary">{activeSessions.length}</Badge>
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  People currently connected to a remote desktop. This list refreshes every few seconds.
                </p>
              </div>
            </div>
            {sessionsError ? (
              <div className="p-6 text-sm text-destructive">{sessionsError}</div>
            ) : activeSessions.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No one is connected right now.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Desktop</TableHead>
                      <TableHead>Connected since</TableHead>
                      {canTerminateSessions && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeSessions.map((session) => (
                      <TableRow key={session.sessionId}>
                        <TableCell className="font-medium">{session.username}</TableCell>
                        <TableCell>{session.vmName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(session.connectedAt).toLocaleString()}
                        </TableCell>
                        {canTerminateSessions && (
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1.5 text-destructive hover:text-destructive"
                              disabled={loggingOutId === session.sessionId}
                              onClick={() => handleForceLogout(session)}
                            >
                              <LogOut className="w-3.5 h-3.5" />
                              {loggingOutId === session.sessionId ? 'Logging out...' : 'Log out'}
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* VMs Table */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading virtual machines...</div>
        ) : filteredVms.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
            <Server className="w-12 h-12 mb-3 text-muted-foreground/50" />
            <p className="font-semibold">No virtual machines configured yet</p>
            <p className="text-sm mt-1">Click "Add New VM" above to create your first remote desktop connection</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>VM Name</TableHead>
                  <TableHead>Host / Port</TableHead>
                  <TableHead>Protocol</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned Users</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVms.map((vm) => (
                  <TableRow key={vm.id}>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-primary/10 text-primary rounded-md">
                          <Server className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-semibold">{vm.name}</div>
                          <div className="text-xs text-muted-foreground">{vm.description || 'No description'}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {vm.hostname}:{vm.port}
                      {vm.domain && <span className="block text-[10px] text-muted-foreground mt-0.5">Domain: {vm.domain}</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{vm.protocol}</Badge>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => handleToggleActive(vm)}
                        className="flex items-center focus:outline-none cursor-pointer"
                        title="Click to toggle active status"
                      >
                        <Badge variant={vm.isActive ? 'default' : 'secondary'} className={vm.isActive ? 'bg-emerald-500 hover:bg-emerald-600' : ''}>
                          {vm.isActive ? 'Active' : 'Disabled'}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenAssign(vm)}
                        className="h-8 text-xs gap-1.5"
                      >
                        <Users className="w-3.5 h-3.5" />
                        {vm.assignedUsers?.length || 0} Users
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleTestConnection(vm)}
                          disabled={isTesting === vm.id}
                          title="Test Connection"
                        >
                          <Wifi className={`w-4 h-4 ${isTesting === vm.id ? 'animate-pulse text-emerald-500' : ''}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEdit(vm)}
                          title="Edit VM"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteVm(vm.id)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Delete VM"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Assign Users Dialog */}
      <Dialog open={!!assigningVm} onOpenChange={(open) => { if(!open) setAssigningVm(null); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Assign Users to {assigningVm?.name}</DialogTitle>
            <DialogDescription>
              Select which portal users are authorized to view and connect to this remote desktop session.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="max-h-60 overflow-y-auto divide-y border rounded-md p-1 bg-muted/20">
              {users.map((u) => {
                const isChecked = selectedUserIds.includes(u.id);
                return (
                  <label key={u.id} className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-md cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Checkbox 
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedUserIds([...selectedUserIds, u.id]);
                          else setSelectedUserIds(selectedUserIds.filter(id => id !== u.id));
                        }}
                      />
                      <div>
                        <div className="text-sm font-medium">{u.name}</div>
                        <div className="text-xs text-muted-foreground">@{u.username} ({u.role})</div>
                      </div>
                    </div>
                    <Badge variant={u.isActive ? 'default' : 'secondary'} className={u.isActive ? 'bg-emerald-500 hover:bg-emerald-600' : ''}>
                      {u.isActive ? 'Active' : 'Disabled'}
                    </Badge>
                  </label>
                );
              })}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssigningVm(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAssignments}>
              Save User Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

