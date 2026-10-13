import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../store';
import { fetchVms, startVmConnection } from '../../store/vmSlice';
import { Monitor, Play, Server } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DashboardLocationState } from '@/lib/dashboardNavigation';

export const UserDashboard: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const location = useLocation();
  const { vms, isLoading } = useSelector((state: RootState) => state.vms);
  const { user } = useSelector((state: RootState) => state.auth);

  const showList = (location.state as DashboardLocationState | null)?.showList === true;
  const singleVm = vms.length === 1 ? vms[0] : null;
  const shouldAutoConnect = !isLoading && !!singleVm?.isActive && !showList;

  useEffect(() => {
    dispatch(fetchVms());
  }, [dispatch]);

  useEffect(() => {
    if (!shouldAutoConnect || !singleVm) return;
    dispatch(startVmConnection({ id: singleVm.id, name: singleVm.name }));
    navigate(`/remote/${singleVm.id}`, { replace: true });
  }, [shouldAutoConnect, singleVm, navigate, dispatch]);

  const handleConnect = (vmId: string, vmName: string) => {
    dispatch(startVmConnection({ id: vmId, name: vmName }));
    navigate(`/remote/${vmId}`);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Remote Desktops</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back, <span className="text-primary font-semibold">{user?.name}</span>.
            {shouldAutoConnect
              ? ' Connecting to your remote desktop...'
              : vms.length === 1
                ? ' Your assigned remote desktop. Click Connect to launch a session.'
                : ' Select a virtual machine to launch an RDP session.'}
          </p>
        </div>
      </div>

      {isLoading || shouldAutoConnect ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">
            {shouldAutoConnect && singleVm
              ? `Opening ${singleVm.name}...`
              : 'Loading your remote desktops...'}
          </p>
        </div>
      ) : vms.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center space-y-4">
            <div className="w-16 h-16 bg-muted text-muted-foreground rounded-2xl flex items-center justify-center mx-auto border border-border">
              <Monitor className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold">No Assigned Remote Desktops</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                You currently do not have access to any remote desktop instances. Please contact your system administrator to assign VMs to your account.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vms.map((vm) => (
            <Card key={vm.id} className="flex flex-col justify-between hover:border-primary/50 transition-all duration-200 shadow-sm group hover:shadow-primary/5">
              <CardContent className="p-6 space-y-4 flex flex-col flex-1">
                <div className="flex items-start justify-between">
                  <div className="p-3 bg-primary/10 text-primary rounded-xl group-hover:scale-105 transition-transform">
                    <Server className="w-6 h-6" />
                  </div>
                  <Badge variant={vm.isActive ? 'default' : 'destructive'} className={vm.isActive ? 'bg-emerald-500 hover:bg-emerald-600' : ''}>
                    {vm.isActive ? 'Active' : 'Disabled'}
                  </Badge>
                </div>

                <div className="flex-1">
                  <h3 className="text-lg font-bold group-hover:text-primary transition-colors">
                    {vm.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {vm.description || 'Remote Windows Desktop session'}
                  </p>
                </div>

                <div className="space-y-1.5 pt-4 border-t text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Protocol:</span>
                    <span className="font-mono font-medium text-primary">{vm.protocol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Host:</span>
                    <span className="font-mono">{vm.hostname}:{vm.port}</span>
                  </div>
                </div>

                <div className="pt-4">
                  <Button
                    onClick={() => handleConnect(vm.id, vm.name)}
                    disabled={!vm.isActive}
                    className="w-full font-semibold shadow-lg shadow-primary/20 flex items-center justify-center space-x-2 transition-all group-hover:shadow-primary/30"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>CONNECT</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
