import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../store';
import { fetchVms, createVm, updateVm, deleteVm } from '../../store/vmSlice';
import { fetchUsers } from '../../store/userSlice';
import api from '../../api/client';
import { Modal } from '../../components/Modal';
import { Badge } from '../../components/Badge';
import { VmDto, VmProtocol, UserDto } from '@rdp/shared';
import { 
  Search, 
  Plus, 
  Edit2, 
  Trash2, 
  Wifi, 
  Users, 
  Server, 
  Check, 
  AlertCircle, 
  Eye, 
  EyeOff,
  Globe,
  Lock,
  UserCheck
} from 'lucide-react';

interface VmFormState {
  name: string;
  description: string;
  protocol: VmProtocol;
  hostname: string;
  port: string;
  username: string;
  password: string;
  domain: string;
}

export const VmManagement: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { vms, isLoading } = useSelector((state: RootState) => state.vms);
  const { users } = useSelector((state: RootState) => state.users);

  const [searchTerm, setSearchTerm] = useState('');
  const [protocolFilter, setProtocolFilter] = useState<string>('ALL');

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingVm, setEditingVm] = useState<VmDto | null>(null);
  const [assigningVm, setAssigningVm] = useState<VmDto | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Connection test state
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState<string | null>(null);

  // Form states
  const [formData, setFormData] = useState<VmFormState>({
    name: '',
    description: '',
    protocol: VmProtocol.RDP,
    hostname: '',
    port: '3389',
    username: '',
    password: '',
    domain: '',
  });
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchVms());
    dispatch(fetchUsers());
  }, [dispatch]);

  const getDefaultPort = (protocol: VmProtocol): string => {
    switch (protocol) {
      case VmProtocol.RDP:
        return '3389';
      case VmProtocol.VNC:
        return '5900';
      case VmProtocol.SSH:
        return '22';
      default:
        return '3389';
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      protocol: VmProtocol.RDP,
      hostname: '',
      port: '3389',
      username: '',
      password: '',
      domain: '',
    });
    setSelectedUserIds([]);
    setShowPassword(false);
    setModalError(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (vm: VmDto) => {
    setEditingVm(vm);
    setFormData({
      name: vm.name || '',
      description: vm.description || '',
      protocol: vm.protocol || VmProtocol.RDP,
      hostname: vm.hostname || '',
      port: String(vm.port || 3389),
      username: vm.username || '',
      password: '', // Never populate existing encrypted password
      domain: vm.domain || '',
    });
    const assignedIds = vm.assignedUsers?.map((u: UserDto) => u.id) || [];
    setSelectedUserIds(assignedIds);
    setShowPassword(false);
    setModalError(null);
  };

  const handleOpenAssign = (vm: VmDto) => {
    setAssigningVm(vm);
    const assignedIds = vm.assignedUsers?.map((u: UserDto) => u.id) || [];
    setSelectedUserIds(assignedIds);
  };

  const handleProtocolChange = (newProtocol: VmProtocol) => {
    // If current port is one of the standard defaults, auto-switch port
    const currentPort = formData.port;
    if (['3389', '5900', '22', ''].includes(currentPort)) {
      setFormData(prev => ({
        ...prev,
        protocol: newProtocol,
        port: getDefaultPort(newProtocol),
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        protocol: newProtocol,
      }));
    }
  };

  const handleSaveVm = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const parsedPort = parseInt(formData.port, 10) || parseInt(getDefaultPort(formData.protocol), 10);

    if (editingVm) {
      const payload: Record<string, unknown> = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        protocol: formData.protocol,
        hostname: formData.hostname.trim(),
        port: parsedPort,
        username: formData.username.trim(),
        domain: formData.domain.trim() || null,
      };
      if (formData.password) {
        payload.password = formData.password;
      }

      const res = await dispatch(updateVm({ id: editingVm.id, data: payload }));
      if (updateVm.fulfilled.match(res)) {
        // Sync user assignments
        try {
          await api.put(`/vms/${editingVm.id}/users`, { userIds: selectedUserIds });
        } catch {
          // Ignore assignment update error
        }
        dispatch(fetchVms());
        setEditingVm(null);
      } else {
        setModalError((res.payload as string) || 'Failed to update VM');
      }
    } else {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        protocol: formData.protocol,
        hostname: formData.hostname.trim(),
        port: parsedPort,
        username: formData.username.trim(),
        password: formData.password,
        domain: formData.domain.trim() || undefined,
        assignedUserIds: selectedUserIds,
      };
      const res = await dispatch(createVm(payload));
      if (createVm.fulfilled.match(res)) {
        dispatch(fetchVms());
        setIsAddModalOpen(false);
      } else {
        setModalError((res.payload as string) || 'Failed to create VM');
      }
    }
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-5 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">VM Management</h1>
          <p className="text-sm text-slate-400 mt-1">Configure virtual machines, target host RDP settings, and user access control</p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-xl shadow-lg shadow-sky-600/20 flex items-center space-x-2 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add New VM</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, hostname, or description..."
            className="w-full pl-9 pr-4 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-sky-500"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <span className="text-xs text-slate-400">Protocol:</span>
          <select
            value={protocolFilter}
            onChange={(e) => setProtocolFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
          >
            <option value="ALL">All Protocols</option>
            <option value="RDP">RDP</option>
            <option value="VNC">VNC</option>
            <option value="SSH">SSH</option>
          </select>
        </div>
      </div>

      {/* VMs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Loading virtual machines...</div>
        ) : filteredVms.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Server className="w-12 h-12 mx-auto text-slate-600 mb-3" />
            <p className="font-semibold text-slate-400">No virtual machines configured yet</p>
            <p className="text-xs text-slate-500 mt-1">Click "Add New VM" above to create your first remote desktop connection</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs uppercase bg-slate-800/60 text-slate-400 border-b border-slate-700/60">
                <tr>
                  <th className="py-3.5 px-4">VM Name</th>
                  <th className="py-3.5 px-4">Host / Port</th>
                  <th className="py-3.5 px-4">Protocol</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Assigned Users</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredVms.map((vm) => (
                  <tr key={vm.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-xl">
                          <Server className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-semibold text-white">{vm.name}</div>
                          <div className="text-xs text-slate-400">{vm.description || 'No description'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-300">
                      {vm.hostname}:{vm.port}
                      {vm.domain && <span className="block text-[10px] text-slate-500">Domain: {vm.domain}</span>}
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant="info">{vm.protocol}</Badge>
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        onClick={() => handleToggleActive(vm)}
                        className="flex items-center space-x-1.5 focus:outline-none cursor-pointer"
                        title="Click to toggle active status"
                      >
                        <Badge variant={vm.isActive ? 'success' : 'danger'}>
                          {vm.isActive ? 'Active' : 'Disabled'}
                        </Badge>
                      </button>
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        onClick={() => handleOpenAssign(vm)}
                        className="flex items-center space-x-1.5 text-xs text-sky-400 hover:text-sky-300 bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-500/20 cursor-pointer"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>{vm.assignedUsers?.length || 0} Users</span>
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => handleTestConnection(vm)}
                        disabled={isTesting === vm.id}
                        className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors cursor-pointer"
                        title="Test Connection"
                      >
                        <Wifi className={`w-4 h-4 ${isTesting === vm.id ? 'animate-pulse text-emerald-400' : ''}`} />
                      </button>
                      <button
                        onClick={() => handleOpenEdit(vm)}
                        className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 rounded-lg transition-colors cursor-pointer"
                        title="Edit VM"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteVm(vm.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                        title="Delete VM"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Connection Test Toast */}
      {testResult && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-sm ${
          testResult.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
        }`}>
          <div className="flex items-center space-x-2">
            {testResult.success ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span>{testResult.message}</span>
          </div>
          <button onClick={() => setTestResult(null)} className="text-xs underline font-semibold cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* Add / Edit VM Modal */}
      <Modal
        isOpen={isAddModalOpen || !!editingVm}
        onClose={() => { setIsAddModalOpen(false); setEditingVm(null); }}
        title={editingVm ? `Edit VM: ${editingVm.name}` : 'Add New Virtual Machine'}
        maxWidth="xl"
      >
        <form onSubmit={handleSaveVm} className="space-y-4">
          {modalError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{modalError}</span>
            </div>
          )}

          {/* Section 1: General Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                VM DISPLAY NAME <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Windows 11 Workstation"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                PROTOCOL <span className="text-rose-400">*</span>
              </label>
              <select
                value={formData.protocol}
                onChange={(e) => handleProtocolChange(e.target.value as VmProtocol)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              >
                <option value="RDP">RDP (Remote Desktop Protocol)</option>
                <option value="VNC">VNC</option>
                <option value="SSH">SSH</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">DESCRIPTION (OPTIONAL)</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="e.g. Development machine with Visual Studio & Docker"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {/* Section 2: Network / Host */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center space-x-1">
                <Globe className="w-3.5 h-3.5 text-slate-400" />
                <span>HOSTNAME / IP ADDRESS <span className="text-rose-400">*</span></span>
              </label>
              <input
                type="text"
                required
                value={formData.hostname}
                onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
                placeholder="e.g. 192.168.1.100 or host.docker.internal"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                PORT <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                required
                value={formData.port}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  setFormData({ ...formData, port: val });
                }}
                placeholder={getDefaultPort(formData.protocol)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-mono text-xs"
              />
            </div>
          </div>

          {/* Section 3: Credentials */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center space-x-1">
                <span>{formData.protocol} USERNAME <span className="text-rose-400">*</span></span>
              </label>
              <input
                type="text"
                required
                autoComplete="off"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="Administrator"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center space-x-1">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  {editingVm ? `${formData.protocol} PASSWORD (OPTIONAL)` : `${formData.protocol} PASSWORD`}
                  {!editingVm && <span className="text-rose-400"> *</span>}
                </span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required={!editingVm}
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={editingVm ? 'Unchanged' : 'Enter password'}
                  className="w-full pl-3 pr-10 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">DOMAIN (OPTIONAL)</label>
              <input
                type="text"
                value={formData.domain}
                onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                placeholder="WORKGROUP"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          {/* Section 4: Assign Users Directly */}
          <div className="pt-2 border-t border-slate-800">
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center space-x-1.5">
              <UserCheck className="w-3.5 h-3.5 text-sky-400" />
              <span>ASSIGN USERS TO THIS VM (OPTIONAL)</span>
            </label>
            <div className="max-h-36 overflow-y-auto divide-y divide-slate-800/80 border border-slate-700/80 rounded-xl p-2 bg-slate-900/80">
              {users.length === 0 ? (
                <div className="text-xs text-slate-500 p-2">No portal users available</div>
              ) : (
                users.map((u) => {
                  const isChecked = selectedUserIds.includes(u.id);
                  return (
                    <label
                      key={u.id}
                      className="flex items-center justify-between p-2 hover:bg-slate-800/60 rounded-lg cursor-pointer transition-colors"
                    >
                      <div className="flex items-center space-x-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUserIds([...selectedUserIds, u.id]);
                            } else {
                              setSelectedUserIds(selectedUserIds.filter((id) => id !== u.id));
                            }
                          }}
                          className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-sky-600 focus:ring-sky-500 cursor-pointer"
                        />
                        <div>
                          <span className="text-xs font-medium text-white">{u.name}</span>
                          <span className="text-[11px] text-slate-400 ml-1.5">(@{u.username})</span>
                        </div>
                      </div>
                      <Badge variant={u.role === 'ADMIN' ? 'warning' : 'info'}>
                        {u.role}
                      </Badge>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-4 flex justify-end space-x-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => { setIsAddModalOpen(false); setEditingVm(null); }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg text-sm cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg text-sm shadow-lg shadow-sky-600/20 cursor-pointer transition-colors"
            >
              {editingVm ? 'Save Changes' : 'Create VM'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Assign Users Modal */}
      <Modal
        isOpen={!!assigningVm}
        onClose={() => setAssigningVm(null)}
        title={`Assign Users to ${assigningVm?.name}`}
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            Select which portal users are authorized to view and connect to this remote desktop session.
          </p>

          <div className="max-h-60 overflow-y-auto divide-y divide-slate-800 border border-slate-800 rounded-xl p-2 bg-slate-900">
            {users.map((u) => {
              const isChecked = selectedUserIds.includes(u.id);
              return (
                <label key={u.id} className="flex items-center justify-between p-3 hover:bg-slate-800/50 rounded-lg cursor-pointer transition-colors">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedUserIds([...selectedUserIds, u.id]);
                        } else {
                          setSelectedUserIds(selectedUserIds.filter(id => id !== u.id));
                        }
                      }}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-sky-600 focus:ring-sky-500 cursor-pointer"
                    />
                    <div>
                      <div className="text-sm font-medium text-white">{u.name}</div>
                      <div className="text-xs text-slate-400">@{u.username} ({u.role})</div>
                    </div>
                  </div>
                  <Badge variant={u.isActive ? 'success' : 'danger'}>
                    {u.isActive ? 'Active' : 'Disabled'}
                  </Badge>
                </label>
              );
            })}
          </div>

          <div className="pt-4 flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => setAssigningVm(null)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg text-sm cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAssignments}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg text-sm shadow-lg shadow-sky-600/20 cursor-pointer transition-colors"
            >
              Save User Access
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
