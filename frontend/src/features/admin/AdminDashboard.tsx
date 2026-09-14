import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../store';
import { fetchUsers } from '../../store/userSlice';
import { fetchVms } from '../../store/vmSlice';
import api from '../../api/client';
import { Users, Monitor, ShieldCheck, Activity, Clock } from 'lucide-react';
import { AuditLogDto } from '@rdp/shared';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export const AdminDashboard: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { users } = useSelector((state: RootState) => state.users);
  const { vms } = useSelector((state: RootState) => state.vms);
  const [auditLogs, setAuditLogs] = useState<AuditLogDto[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);

  useEffect(() => {
    dispatch(fetchUsers());
    dispatch(fetchVms());

    api.get('/audit-logs')
      .then(res => {
        if (res.data.success) {
          setAuditLogs(res.data.data);
        }
      })
      .catch(err => console.error(err))
      .finally(() => setIsLoadingLogs(false));
  }, [dispatch]);

  const activeUsers = users.filter(u => u.isActive).length;
  const activeVms = vms.filter(v => v.isActive).length;
  const totalAssignments = vms.reduce((acc, vm) => acc + (vm._count?.assignments || vm.assignedUsers?.length || 0), 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight">Admin Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">System telemetry, user stats, virtual machines, and security audit trail</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Users</span>
              <div className="p-2 bg-primary/10 text-primary rounded-xl">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-bold">{users.length}</span>
              <span className="text-xs text-emerald-500 font-semibold">{activeUsers} active</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total VMs</span>
              <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded-xl">
                <Monitor className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-bold">{vms.length}</span>
              <span className="text-xs text-emerald-500 font-semibold">{activeVms} active</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Assignments</span>
              <div className="p-2 bg-purple-500/10 text-purple-500 rounded-xl">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-bold">{totalAssignments}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Audit Events</span>
              <div className="p-2 bg-amber-500/10 text-amber-500 rounded-xl">
                <Activity className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-bold">{auditLogs.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Audit Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Clock className="w-5 h-5 text-primary" />
            <span>Recent Security & Session Audit Trail</span>
          </CardTitle>
          <CardDescription>
            Real-time log of authentication events, admin actions, and VM connection attempts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingLogs ? (
            <div className="p-8 text-center text-muted-foreground">Loading audit logs...</div>
          ) : auditLogs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No audit events recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>IP Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.slice(0, 15).map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-medium">
                        {log.userName || 'System / Guest'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          log.action.includes('FAILURE') ? 'destructive' :
                            log.action.includes('CONNECT') ? 'default' :
                              log.action.includes('CREATE') ? 'secondary' : 'outline'
                        }>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                        {log.details || '-'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {log.ipAddress || '127.0.0.1'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
