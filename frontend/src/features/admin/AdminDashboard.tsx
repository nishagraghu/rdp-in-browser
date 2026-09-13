import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../store';
import { fetchUsers } from '../../store/userSlice';
import { fetchVms } from '../../store/vmSlice';
import api from '../../api/client';
import { Badge } from '../../components/Badge';
import { Users, Monitor, ShieldCheck, Activity, Clock } from 'lucide-react';
import { AuditLogDto } from '@rdp/shared';

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
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-2xl font-bold text-white tracking-tight">Admin Overview</h1>
        <p className="text-sm text-slate-400 mt-1">System telemetry, user stats, virtual machines, and security audit trail</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Users</span>
            <div className="p-2 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-bold text-white">{users.length}</span>
            <span className="text-xs text-emerald-400 font-semibold">{activeUsers} active</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total VMs</span>
            <div className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl">
              <Monitor className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-bold text-white">{vms.length}</span>
            <span className="text-xs text-emerald-400 font-semibold">{activeVms} active</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Assignments</span>
            <div className="p-2 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-xl">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white">{totalAssignments}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Audit Events</span>
            <div className="p-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white">{auditLogs.length}</div>
        </div>
      </div>

      {/* Recent Audit Logs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center space-x-2">
              <Clock className="w-5 h-5 text-sky-400" />
              <span>Recent Security & Session Audit Trail</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">Real-time log of authentication events, admin actions, and VM connection attempts</p>
          </div>
        </div>

        {isLoadingLogs ? (
          <div className="p-8 text-center text-slate-500">Loading audit logs...</div>
        ) : auditLogs.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No audit events recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs uppercase bg-slate-800/60 text-slate-400 border-b border-slate-700/60">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Details</th>
                  <th className="py-3 px-4">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {auditLogs.slice(0, 15).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-slate-400">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-medium text-white">
                      {log.userName || 'System / Guest'}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={
                        log.action.includes('FAILURE') ? 'danger' :
                        log.action.includes('CONNECT') ? 'info' :
                        log.action.includes('CREATE') ? 'success' : 'neutral'
                      }>
                        {log.action}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-300 max-w-md truncate">
                      {log.details || '-'}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500">
                      {log.ipAddress || '127.0.0.1'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
