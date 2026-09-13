import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../store';
import { fetchUsers } from '../../store/userSlice';
import { fetchVms } from '../../store/vmSlice';
import api from '../../api/client';
import { UserDto } from '@rdp/shared';
import { Check, X } from 'lucide-react';

export const AssignmentsPage: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { users } = useSelector((state: RootState) => state.users);
  const { vms } = useSelector((state: RootState) => state.vms);
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    dispatch(fetchUsers());
    dispatch(fetchVms());
  }, [dispatch]);

  const toggleAssignment = async (vmId: string, userId: string, isCurrentlyAssigned: boolean) => {
    const key = `${vmId}-${userId}`;
    setLoadingMap(prev => ({ ...prev, [key]: true }));

    try {
      if (isCurrentlyAssigned) {
        await api.delete(`/vms/${vmId}/users/${userId}`);
      } else {
        await api.post(`/vms/${vmId}/users/${userId}`);
      }
      await dispatch(fetchVms());
    } catch (err) {
      console.error('Failed to toggle assignment:', err);
    } finally {
      setLoadingMap(prev => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-2xl font-bold text-white tracking-tight">VM-User Access Matrix</h1>
        <p className="text-sm text-slate-400 mt-1">
          Interactive permission matrix for instantly assigning and revoking user access across virtual machines
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl p-6">
        {vms.length === 0 || users.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            Please create at least one VM and one User to view the assignment matrix.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs uppercase bg-slate-800/60 text-slate-400 border-b border-slate-700/60">
                <tr>
                  <th className="py-3.5 px-4 font-bold text-white min-w-[200px]">User</th>
                  {vms.map(vm => (
                    <th key={vm.id} className="py-3.5 px-4 text-center min-w-[140px]">
                      <div className="font-semibold text-sky-400 truncate max-w-[140px]">{vm.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{vm.hostname}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">{user.name}</div>
                      <div className="text-xs text-slate-400">@{user.username}</div>
                    </td>

                    {vms.map((vm) => {
                      const isAssigned = vm.assignedUsers?.some((u: UserDto) => u.id === user.id) || false;
                      const key = `${vm.id}-${user.id}`;
                      const isLoading = loadingMap[key];

                      return (
                        <td key={vm.id} className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => toggleAssignment(vm.id, user.id, isAssigned)}
                            disabled={isLoading}
                            className={`p-2 rounded-xl border transition-all ${
                              isAssigned
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                                : 'bg-slate-800/40 text-slate-600 border-slate-700/60 hover:text-slate-300 hover:border-slate-600'
                            }`}
                          >
                            {isLoading ? (
                              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                            ) : isAssigned ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <X className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                      );
                    })}
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
