import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../store';
import { fetchUsers } from '../../store/userSlice';
import { fetchVms } from '../../store/vmSlice';
import api from '../../api/client';
import { UserDto } from '@rdp/shared';
import { Check, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
      <div className="border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight">VM-User Access Matrix</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Interactive permission matrix for instantly assigning and revoking user access across virtual machines
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {vms.length === 0 || users.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              Please create at least one VM and one User to view the assignment matrix.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">User</TableHead>
                    {vms.map(vm => (
                      <TableHead key={vm.id} className="text-center min-w-[140px]">
                        <div className="font-semibold text-primary truncate max-w-[140px]">{vm.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{vm.hostname}</div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="font-semibold">{user.name}</div>
                        <div className="text-xs text-muted-foreground">@{user.username}</div>
                      </TableCell>

                      {vms.map((vm) => {
                        const isAssigned = vm.assignedUsers?.some((u: UserDto) => u.id === user.id) || false;
                        const key = `${vm.id}-${user.id}`;
                        const isLoading = loadingMap[key];

                        return (
                          <TableCell key={vm.id} className="text-center">
                            <button
                              onClick={() => toggleAssignment(vm.id, user.id, isAssigned)}
                              disabled={isLoading}
                              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                                isAssigned
                                  ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40 hover:bg-emerald-500/30'
                                  : 'bg-muted text-muted-foreground border-border hover:text-foreground hover:border-foreground/50'
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
                          </TableCell>
                        );
                      })}
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
