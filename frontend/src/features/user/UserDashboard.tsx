import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../store';
import { fetchVms } from '../../store/vmSlice';
import { Badge } from '../../components/Badge';
import { Monitor, Play, Server } from 'lucide-react';

export const UserDashboard: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { vms, isLoading } = useSelector((state: RootState) => state.vms);
  const { user } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    dispatch(fetchVms());
  }, [dispatch]);

  const handleConnect = (vmId: string) => {
    navigate(`/remote/${vmId}`);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">My Remote Desktops</h1>
          <p className="text-sm text-slate-400 mt-1">
            Welcome back, <span className="text-sky-400 font-semibold">{user?.name}</span>. Select a virtual machine to launch an RDP session.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-slate-900/50 border border-slate-800 rounded-2xl animate-pulse"></div>
          ))}
        </div>
      ) : vms.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center space-y-4">
          <div className="w-16 h-16 bg-slate-800 text-slate-500 rounded-2xl flex items-center justify-center mx-auto border border-slate-700">
            <Monitor className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">No Assigned Remote Desktops</h3>
            <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
              You currently do not have access to any remote desktop instances. Please contact your system administrator to assign VMs to your account.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vms.map((vm) => (
            <div
              key={vm.id}
              className="bg-slate-900 border border-slate-800 hover:border-sky-500/50 transition-all duration-200 rounded-2xl p-6 flex flex-col justify-between shadow-xl group hover:shadow-sky-500/5"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="p-3 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-xl group-hover:scale-105 transition-transform">
                    <Server className="w-6 h-6" />
                  </div>
                  <Badge variant={vm.isActive ? 'success' : 'danger'}>
                    {vm.isActive ? 'Active' : 'Disabled'}
                  </Badge>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-sky-400 transition-colors">
                    {vm.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                    {vm.description || 'Remote Windows Desktop session'}
                  </p>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-800/60 text-xs text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Protocol:</span>
                    <span className="font-mono font-medium text-sky-400">{vm.protocol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Host:</span>
                    <span className="font-mono">{vm.hostname}:{vm.port}</span>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <button
                  onClick={() => handleConnect(vm.id)}
                  disabled={!vm.isActive}
                  className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-xl shadow-lg shadow-sky-600/20 flex items-center justify-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed group-hover:shadow-sky-500/30"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>CONNECT</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
