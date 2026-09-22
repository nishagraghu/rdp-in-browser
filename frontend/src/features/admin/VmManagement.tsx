import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../store';
import { fetchVms, createVm, updateVm, deleteVm } from '../../store/vmSlice';
import { fetchUsers } from '../../store/userSlice';
import api from '../../api/client';
import { VmDto, VmProtocol, UserDto, DEFAULT_CONNECTION_TIMEOUT_SEC, MIN_CONNECTION_TIMEOUT_SEC, MAX_CONNECTION_TIMEOUT_SEC, clampConnectionTimeout } from '@rdp/shared';
import { 
  Search, Plus, Edit2, Trash2, Wifi, Users, Server, Check, 
  AlertCircle, Eye, EyeOff, Globe, Lock, UserCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { useFormik } from 'formik';
import * as yup from 'yup';

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

  const formik = useFormik({
    initialValues: {
      name: '',
      description: '',
      protocol: VmProtocol.RDP,
      hostname: '',
      port: '3389',
      connectionTimeout: String(DEFAULT_CONNECTION_TIMEOUT_SEC),
      username: '',
      password: '',
      domain: '',
      allowAccessAfter: '',
      doNotAllowAccessAfter: '',
      enableAccountAfter: '',
      disableAccountAfter: '',
      supportAudioInConsole: false,
      disableAudio: false,
      enableAudioInput: false,
      enablePrinting: true,
      printerName: '',
      enableDrive: false,
      driveName: '',
      disableFileDownload: false,
      disableFileUpload: false,
      drivePath: '',
      createDrivePath: false,
      staticChannelNames: '',
      normalizeClipboard: 'preserve',
      disableCopy: false,
      disablePaste: false,
      displayWidth: '',
      displayHeight: '',
      dpi: '',
      colorDepth: '32',
      forceLossless: false,
      resizeMethod: 'display-update',
      readOnly: false,
      enableWallpaper: false,
      enableTheming: false,
      enableFontSmoothing: true,
      enableFullWindowDrag: false,
      enableDesktopComposition: false,
      enableMenuAnimations: false,
      disableBitmapCaching: false,
      disableOffscreenCaching: false,
      disableGlyphCaching: false,
      disableGfx: false,
    },
    validationSchema: yup.object({
      name: yup.string().required('VM Display Name is required'),
      hostname: yup.string().required('Hostname/IP is required'),
      port: yup.number().typeError('Must be a number').min(1).max(65535).required('Port is required'),
      connectionTimeout: yup
        .number()
        .typeError('Must be a number')
        .min(MIN_CONNECTION_TIMEOUT_SEC, `Minimum ${MIN_CONNECTION_TIMEOUT_SEC} seconds`)
        .max(MAX_CONNECTION_TIMEOUT_SEC, `Maximum ${MAX_CONNECTION_TIMEOUT_SEC} seconds`)
        .required('Connection timeout is required'),
      username: yup.string().required('Username is required'),
      password: yup.string().test('is-required', 'Password is required', function(value) {
        if (!editingVm && !value) return false;
        return true;
      }),
    }),
    onSubmit: async (values) => {
      setModalError(null);
      const parsedPort = parseInt(values.port, 10) || parseInt(getDefaultPort(values.protocol), 10);
      const parseOptionalInt = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const n = parseInt(trimmed, 10);
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      
      const payload: Record<string, any> = {
        name: values.name.trim(),
        description: values.description.trim() || undefined,
        protocol: values.protocol,
        hostname: values.hostname.trim(),
        port: parsedPort,
        connectionTimeout: clampConnectionTimeout(values.connectionTimeout),
        username: values.username.trim(),
        domain: values.domain.trim() || undefined,
        allowAccessAfter: values.allowAccessAfter.trim() || null,
        doNotAllowAccessAfter: values.doNotAllowAccessAfter.trim() || null,
        enableAccountAfter: values.enableAccountAfter.trim() || null,
        disableAccountAfter: values.disableAccountAfter.trim() || null,
        supportAudioInConsole: values.supportAudioInConsole,
        disableAudio: values.disableAudio,
        enableAudioInput: values.enableAudioInput,
        enablePrinting: values.enablePrinting,
        printerName: values.printerName.trim() || undefined,
        enableDrive: values.enableDrive,
        driveName: values.driveName.trim() || undefined,
        disableFileDownload: values.disableFileDownload,
        disableFileUpload: values.disableFileUpload,
        drivePath: values.drivePath.trim() || undefined,
        createDrivePath: values.createDrivePath,
        staticChannelNames: values.staticChannelNames.trim() || undefined,
        normalizeClipboard: values.normalizeClipboard,
        disableCopy: values.disableCopy,
        disablePaste: values.disablePaste,
        displayWidth: parseOptionalInt(values.displayWidth),
        displayHeight: parseOptionalInt(values.displayHeight),
        dpi: parseOptionalInt(values.dpi),
        colorDepth: parseInt(values.colorDepth, 10) || 32,
        forceLossless: values.forceLossless,
        resizeMethod: values.resizeMethod,
        readOnly: values.readOnly,
        enableWallpaper: values.enableWallpaper,
        enableTheming: values.enableTheming,
        enableFontSmoothing: values.enableFontSmoothing,
        enableFullWindowDrag: values.enableFullWindowDrag,
        enableDesktopComposition: values.enableDesktopComposition,
        enableMenuAnimations: values.enableMenuAnimations,
        disableBitmapCaching: values.disableBitmapCaching,
        disableOffscreenCaching: values.disableOffscreenCaching,
        disableGlyphCaching: values.disableGlyphCaching,
        disableGfx: values.disableGfx,
      };

      if (values.password) {
        payload.password = values.password;
      }

      if (editingVm) {
        const res = await dispatch(updateVm({ id: editingVm.id, data: payload }));
        if (updateVm.fulfilled.match(res)) {
          try {
            await api.put(`/vms/${editingVm.id}/users`, { userIds: selectedUserIds });
          } catch {}
          dispatch(fetchVms());
          setEditingVm(null);
        } else {
          setModalError((res.payload as string) || 'Failed to update VM');
        }
      } else {
        payload.assignedUserIds = selectedUserIds;
        const res = await dispatch(createVm(payload));
        if (createVm.fulfilled.match(res)) {
          dispatch(fetchVms());
          setIsAddModalOpen(false);
        } else {
          setModalError((res.payload as string) || 'Failed to create VM');
        }
      }
    }
  });

  const resetForm = () => {
    formik.resetForm();
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
    formik.setValues({
      name: vm.name || '',
      description: vm.description || '',
      protocol: vm.protocol || VmProtocol.RDP,
      hostname: vm.hostname || '',
      port: String(vm.port || 3389),
      connectionTimeout: String(clampConnectionTimeout(vm.connectionTimeout)),
      username: vm.username || '',
      password: '',
      domain: vm.domain || '',
      allowAccessAfter: vm.allowAccessAfter || '',
      doNotAllowAccessAfter: vm.doNotAllowAccessAfter || '',
      enableAccountAfter: vm.enableAccountAfter || '',
      disableAccountAfter: vm.disableAccountAfter || '',
      supportAudioInConsole: !!vm.supportAudioInConsole,
      disableAudio: !!vm.disableAudio,
      enableAudioInput: !!vm.enableAudioInput,
      enablePrinting: !!vm.enablePrinting,
      printerName: vm.printerName || '',
      enableDrive: !!vm.enableDrive,
      driveName: vm.driveName || '',
      disableFileDownload: !!vm.disableFileDownload,
      disableFileUpload: !!vm.disableFileUpload,
      drivePath: vm.drivePath || '',
      createDrivePath: !!vm.createDrivePath,
      staticChannelNames: vm.staticChannelNames || '',
      normalizeClipboard:
        vm.normalizeClipboard === 'unix' || vm.normalizeClipboard === 'windows'
          ? vm.normalizeClipboard
          : 'preserve',
      disableCopy: !!vm.disableCopy,
      disablePaste: !!vm.disablePaste,
      displayWidth: vm.displayWidth ? String(vm.displayWidth) : '',
      displayHeight: vm.displayHeight ? String(vm.displayHeight) : '',
      dpi: vm.dpi ? String(vm.dpi) : '',
      colorDepth: String(vm.colorDepth || 32),
      forceLossless: !!vm.forceLossless,
      resizeMethod: vm.resizeMethod === 'reconnect' ? 'reconnect' : 'display-update',
      readOnly: !!vm.readOnly,
      enableWallpaper: !!vm.enableWallpaper,
      enableTheming: !!vm.enableTheming,
      enableFontSmoothing: vm.enableFontSmoothing !== false,
      enableFullWindowDrag: !!vm.enableFullWindowDrag,
      enableDesktopComposition: !!vm.enableDesktopComposition,
      enableMenuAnimations: !!vm.enableMenuAnimations,
      disableBitmapCaching: !!vm.disableBitmapCaching,
      disableOffscreenCaching: !!vm.disableOffscreenCaching,
      disableGlyphCaching: !!vm.disableGlyphCaching,
      disableGfx: !!vm.disableGfx,
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
    const currentPort = formik.values.port;
    if (['3389', '5900', '22', ''].includes(currentPort)) {
      formik.setFieldValue('protocol', newProtocol);
      formik.setFieldValue('port', getDefaultPort(newProtocol));
    } else {
      formik.setFieldValue('protocol', newProtocol);
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

      {/* Add / Edit VM Dialog */}
      <Dialog open={isAddModalOpen || !!editingVm} onOpenChange={(open) => { if(!open){ setIsAddModalOpen(false); setEditingVm(null); }}}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVm ? `Edit VM: ${editingVm.name}` : 'Add New Virtual Machine'}</DialogTitle>
            <DialogDescription>
              Configure the connection details for the remote host.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={formik.handleSubmit} className="space-y-4 py-4">
            {modalError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{modalError}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">VM Display Name <span className="text-destructive">*</span></Label>
                <Input
                  id="name"
                  name="name"
                  value={formik.values.name}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  placeholder="e.g. Windows 11 Workstation"
                  className={formik.touched.name && formik.errors.name ? "border-destructive" : ""}
                />
                {formik.touched.name && formik.errors.name && (
                  <div className="text-xs text-destructive">{formik.errors.name}</div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="protocol">Protocol <span className="text-destructive">*</span></Label>
                <select
                  id="protocol"
                  name="protocol"
                  value={formik.values.protocol}
                  onChange={(e) => handleProtocolChange(e.target.value as VmProtocol)}
                  onBlur={formik.handleBlur}
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="RDP">RDP (Remote Desktop Protocol)</option>
                  <option value="VNC">VNC</option>
                  <option value="SSH">SSH</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Input
                id="description"
                name="description"
                value={formik.values.description}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                placeholder="e.g. Development machine with Visual Studio & Docker"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="hostname" className="flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5" />
                  Hostname / IP <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="hostname"
                  name="hostname"
                  value={formik.values.hostname}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  placeholder="e.g. 192.168.1.100"
                  className={`font-mono text-xs ${formik.touched.hostname && formik.errors.hostname ? "border-destructive" : ""}`}
                />
                {formik.touched.hostname && formik.errors.hostname && (
                  <div className="text-xs text-destructive">{formik.errors.hostname}</div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">Port <span className="text-destructive">*</span></Label>
                <Input
                  id="port"
                  name="port"
                  inputMode="numeric"
                  value={formik.values.port}
                  onChange={(e) => formik.setFieldValue('port', e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={formik.handleBlur}
                  placeholder={getDefaultPort(formik.values.protocol)}
                  className={`font-mono text-xs ${formik.touched.port && formik.errors.port ? "border-destructive" : ""}`}
                />
                {formik.touched.port && formik.errors.port && (
                  <div className="text-xs text-destructive">{formik.errors.port}</div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="connectionTimeout">Connect timeout (sec)</Label>
                <Input
                  id="connectionTimeout"
                  name="connectionTimeout"
                  inputMode="numeric"
                  value={formik.values.connectionTimeout}
                  onChange={(e) => formik.setFieldValue('connectionTimeout', e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={formik.handleBlur}
                  placeholder={String(DEFAULT_CONNECTION_TIMEOUT_SEC)}
                  className={`font-mono text-xs ${formik.touched.connectionTimeout && formik.errors.connectionTimeout ? "border-destructive" : ""}`}
                />
                {formik.touched.connectionTimeout && formik.errors.connectionTimeout && (
                  <div className="text-xs text-destructive">{formik.errors.connectionTimeout}</div>
                )}
                {/* <p className="text-[10px] text-muted-foreground">
                  Fail the RDP session if it does not connect within this time ({MIN_CONNECTION_TIMEOUT_SEC}–{MAX_CONNECTION_TIMEOUT_SEC}s).
                </p> */}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="username">{formik.values.protocol} Username <span className="text-destructive">*</span></Label>
                <Input
                  id="username"
                  name="username"
                  autoComplete="off"
                  value={formik.values.username}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  placeholder="Administrator"
                  className={formik.touched.username && formik.errors.username ? "border-destructive" : ""}
                />
                {formik.touched.username && formik.errors.username && (
                  <div className="text-xs text-destructive">{formik.errors.username}</div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" />
                  Password {!editingVm && <span className="text-destructive">*</span>}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={formik.values.password}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder={editingVm ? 'Unchanged' : 'Enter password'}
                    className={`pr-10 ${formik.touched.password && formik.errors.password ? "border-destructive" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {formik.touched.password && formik.errors.password && (
                  <div className="text-xs text-destructive">{formik.errors.password}</div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="domain">Domain (Optional)</Label>
                <Input
                  id="domain"
                  name="domain"
                  value={formik.values.domain}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  placeholder="WORKGROUP"
                />
              </div>
            </div>

            <div className="pt-4 border-t space-y-4">
              <Label className="flex items-center gap-1.5 mb-2 text-primary font-semibold">
                Access Restrictions
              </Label>
              <div className="space-y-3 bg-muted/20 p-3 rounded-md border">
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <Label htmlFor="allowAccessAfter" className="font-normal text-sm sm:w-48 shrink-0">
                      Allow access after
                    </Label>
                    <Input
                      id="allowAccessAfter"
                      name="allowAccessAfter"
                      type="time"
                      value={formik.values.allowAccessAfter}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      className="flex-1"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <Label htmlFor="doNotAllowAccessAfter" className="font-normal text-sm sm:w-48 shrink-0">
                      Do not allow access after
                    </Label>
                    <Input
                      id="doNotAllowAccessAfter"
                      name="doNotAllowAccessAfter"
                      type="time"
                      value={formik.values.doNotAllowAccessAfter}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      className="flex-1"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <Label htmlFor="enableAccountAfter" className="font-normal text-sm sm:w-48 shrink-0">
                      Enable account after
                    </Label>
                    <Input
                      id="enableAccountAfter"
                      name="enableAccountAfter"
                      type="date"
                      value={formik.values.enableAccountAfter}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      className="flex-1"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <Label htmlFor="disableAccountAfter" className="font-normal text-sm sm:w-48 shrink-0">
                      Disable account after
                    </Label>
                    <Input
                      id="disableAccountAfter"
                      name="disableAccountAfter"
                      type="date"
                      value={formik.values.disableAccountAfter}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      className="flex-1"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Leave blank for no restriction. Daily time window and calendar dates control when users can connect to this VM.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t space-y-4">
              <Label className="flex items-center gap-1.5 mb-2 text-primary font-semibold">
                Display
              </Label>
              <div className="space-y-3 bg-muted/20 p-3 rounded-md border">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="displayWidth" className="text-xs">Width</Label>
                    <Input
                      id="displayWidth"
                      name="displayWidth"
                      inputMode="numeric"
                      value={formik.values.displayWidth}
                      onChange={(e) => formik.setFieldValue('displayWidth', e.target.value.replace(/[^0-9]/g, ''))}
                      onBlur={formik.handleBlur}
                      placeholder="Auto (browser viewport)"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="displayHeight" className="text-xs">Height</Label>
                    <Input
                      id="displayHeight"
                      name="displayHeight"
                      inputMode="numeric"
                      value={formik.values.displayHeight}
                      onChange={(e) => formik.setFieldValue('displayHeight', e.target.value.replace(/[^0-9]/g, ''))}
                      onBlur={formik.handleBlur}
                      placeholder="Auto (browser viewport)"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="dpi" className="text-xs">Resolution (DPI)</Label>
                    <Input
                      id="dpi"
                      name="dpi"
                      inputMode="numeric"
                      value={formik.values.dpi}
                      onChange={(e) => formik.setFieldValue('dpi', e.target.value.replace(/[^0-9]/g, ''))}
                      onBlur={formik.handleBlur}
                      placeholder="96"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="colorDepth" className="text-xs">Color depth</Label>
                    <select
                      id="colorDepth"
                      name="colorDepth"
                      value={formik.values.colorDepth}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      className="flex h-8 w-full items-center rounded-md border border-input bg-background px-3 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="32">True color (32-bit)</option>
                      <option value="24">True color (24-bit)</option>
                      <option value="16">Low color (16-bit)</option>
                      <option value="8">256 colors</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 py-0.5">
                  <Label htmlFor="forceLossless" className="font-normal text-xs">Force lossless compression</Label>
                  <Checkbox id="forceLossless" checked={formik.values.forceLossless} onCheckedChange={c => formik.setFieldValue('forceLossless', !!c)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="resizeMethod" className="text-xs">Resize method</Label>
                  <select
                    id="resizeMethod"
                    name="resizeMethod"
                    value={formik.values.resizeMethod}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    className="flex h-8 w-full items-center rounded-md border border-input bg-background px-3 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="display-update">Display Update virtual channel (RDP 8.1+)</option>
                    <option value="reconnect">Reconnect on resize</option>
                  </select>
                </div>
                <div className="flex items-center justify-between gap-3 py-0.5">
                  <Label htmlFor="readOnly" className="font-normal text-xs">Read-only</Label>
                  <Checkbox id="readOnly" checked={formik.values.readOnly} onCheckedChange={c => formik.setFieldValue('readOnly', !!c)} />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t space-y-4">
              <Label className="flex items-center gap-1.5 mb-2 text-primary font-semibold">
                Clipboard
              </Label>
              <div className="space-y-2 bg-muted/20 p-3 rounded-md border">
                <div className="flex items-center justify-between gap-3 py-0.5">
                  <Label htmlFor="normalizeClipboard" className="font-normal text-xs shrink-0">Line endings</Label>
                  <select
                    id="normalizeClipboard"
                    name="normalizeClipboard"
                    value={formik.values.normalizeClipboard}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    className="flex h-8 w-full max-w-[220px] items-center rounded-md border border-input bg-background px-3 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="preserve">Preserve</option>
                    <option value="unix">Unix (LF)</option>
                    <option value="windows">Windows (CRLF)</option>
                  </select>
                </div>
                <div className="flex items-center justify-between gap-3 py-0.5">
                  <Label htmlFor="disableCopy" className="font-normal text-xs">Disable copying from remote desktop</Label>
                  <Checkbox
                    id="disableCopy"
                    checked={formik.values.disableCopy}
                    onCheckedChange={(c) => formik.setFieldValue('disableCopy', !!c)}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 py-0.5">
                  <Label htmlFor="disablePaste" className="font-normal text-xs">Disable pasting from client</Label>
                  <Checkbox
                    id="disablePaste"
                    checked={formik.values.disablePaste}
                    onCheckedChange={(c) => formik.setFieldValue('disablePaste', !!c)}
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t space-y-4">
              <Label className="flex items-center gap-1.5 mb-2 text-primary font-semibold">
                Performance
              </Label>
              <div className="space-y-2 bg-muted/20 p-3 rounded-md border">
                {[
                  { id: 'enableWallpaper', label: 'Enable wallpaper' },
                  { id: 'enableTheming', label: 'Enable theming' },
                  { id: 'enableFontSmoothing', label: 'Enable font smoothing (ClearType)' },
                  { id: 'enableFullWindowDrag', label: 'Enable full-window drag' },
                  { id: 'enableDesktopComposition', label: 'Enable desktop composition (Aero)' },
                  { id: 'enableMenuAnimations', label: 'Enable menu animations' },
                  { id: 'disableBitmapCaching', label: 'Disable bitmap caching' },
                  { id: 'disableOffscreenCaching', label: 'Disable off-screen caching' },
                  { id: 'disableGlyphCaching', label: 'Disable glyph caching' },
                  { id: 'disableGfx', label: 'Disable Graphics Pipeline Extension' },
                ].map((opt) => (
                  <div key={opt.id} className="flex items-center justify-between gap-3 py-0.5">
                    <Label htmlFor={opt.id} className="font-normal text-xs">{opt.label}</Label>
                    <Checkbox
                      id={opt.id}
                      checked={!!formik.values[opt.id as keyof typeof formik.values]}
                      onCheckedChange={(c) => formik.setFieldValue(opt.id, !!c)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t space-y-4">
              <Label className="flex items-center gap-1.5 mb-2 text-primary font-semibold">
                Device Redirection
              </Label>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Audio */}
                <div className="space-y-2 bg-muted/20 p-3 rounded-md border">
                  <h4 className="text-sm font-medium mb-3">Audio</h4>
                  <div className="flex items-center justify-between gap-3 py-0.5">
                    <Label htmlFor="supportAudioInConsole" className="font-normal text-xs">Support audio in console</Label>
                    <Checkbox id="supportAudioInConsole" checked={formik.values.supportAudioInConsole} onCheckedChange={c => formik.setFieldValue('supportAudioInConsole', !!c)} />
                  </div>
                  <div className="flex items-center justify-between gap-3 py-0.5">
                    <Label htmlFor="disableAudio" className="font-normal text-xs">Disable audio</Label>
                    <Checkbox id="disableAudio" checked={formik.values.disableAudio} onCheckedChange={c => formik.setFieldValue('disableAudio', !!c)} />
                  </div>
                  <div className="flex items-center justify-between gap-3 py-0.5">
                    <Label htmlFor="enableAudioInput" className="font-normal text-xs">Enable audio input (microphone)</Label>
                    <Checkbox id="enableAudioInput" checked={formik.values.enableAudioInput} onCheckedChange={c => formik.setFieldValue('enableAudioInput', !!c)} />
                  </div>
                </div>

                {/* Printing — always redirected to the end-user's local printers */}
                <div className="space-y-2 bg-muted/20 p-3 rounded-md border">
                  <h4 className="text-sm font-medium mb-3">Printing</h4>
                  <p className="text-xs text-muted-foreground mb-2">
                    Print inside the remote desktop is always redirected to the end user&apos;s
                    computer. The system print dialog opens so they can choose a local printer.
                  </p>
                  <div className="space-y-1">
                    <Label htmlFor="printerName" className="text-xs">Printer name (shown inside remote Windows)</Label>
                    <Input id="printerName" name="printerName" value={formik.values.printerName} onChange={formik.handleChange} onBlur={formik.handleBlur} placeholder="Cloudgoo PDF" className="h-7 text-xs" />
                    <p className="text-[10px] text-muted-foreground">
                      User prints to this printer in the remote session → PDF arrives on their PC → they select their real printer.
                    </p>
                  </div>
                </div>
              </div>

              {/* Drive */}
              <div className="space-y-2 bg-muted/20 p-3 rounded-md border">
                <h4 className="text-sm font-medium mb-3">Shared Drive</h4>
                <p className="text-xs text-muted-foreground mb-2">
                  Maps to the host folder (<code className="text-[10px]">DRIVES_PATH/&#123;username&#125;</code>).
                  Files copied in the remote session appear on the host; files placed on the host appear in the session.
                </p>
                <div className="flex items-center justify-between gap-3 py-0.5">
                  <Label htmlFor="enableDrive" className="font-normal text-xs">Enable shared drive</Label>
                  <Checkbox id="enableDrive" checked={formik.values.enableDrive} onCheckedChange={c => formik.setFieldValue('enableDrive', !!c)} />
                </div>
                {formik.values.enableDrive && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="driveName" className="text-xs">Drive name (in remote session)</Label>
                      <Input id="driveName" name="driveName" value={formik.values.driveName} onChange={formik.handleChange} onBlur={formik.handleBlur} placeholder="Shared Drive" className="h-7 text-xs" />
                    </div>
                    <div className="flex flex-col gap-3 col-span-1 sm:col-span-2">
                      <div className="flex items-center justify-between gap-3 py-0.5">
                        <Label htmlFor="disableFileUpload" className="font-normal text-xs">Disable browser upload into shared drive</Label>
                        <Checkbox id="disableFileUpload" checked={formik.values.disableFileUpload} onCheckedChange={c => formik.setFieldValue('disableFileUpload', !!c)} />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Browser downloads are not used — transfer is only via the shared host folder.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Channels */}
              <div className="space-y-2 bg-muted/20 p-3 rounded-md border">
                <Label htmlFor="staticChannelNames" className="text-sm font-medium">Static channel names</Label>
                <Input id="staticChannelNames" name="staticChannelNames" value={formik.values.staticChannelNames} onChange={formik.handleChange} onBlur={formik.handleBlur} className="h-8 text-xs mt-1" />
              </div>
            </div>

            <div className="pt-4 border-t">
              <Label className="flex items-center gap-1.5 mb-2">
                <UserCheck className="w-3.5 h-3.5 text-primary" />
                Assign Users to this VM (Optional)
              </Label>
              <div className="max-h-36 overflow-y-auto divide-y border rounded-md p-1 bg-muted/20">
                {users.length === 0 ? (
                  <div className="text-xs text-muted-foreground p-2">No portal users available</div>
                ) : (
                  users.map((u) => {
                    const isChecked = selectedUserIds.includes(u.id);
                    return (
                      <label key={u.id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md cursor-pointer">
                        <div className="flex items-center gap-3">
                          <Checkbox 
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              if (checked) setSelectedUserIds([...selectedUserIds, u.id]);
                              else setSelectedUserIds(selectedUserIds.filter(id => id !== u.id));
                            }}
                          />
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-medium">{u.name}</span>
                            <span className="text-xs text-muted-foreground">@{u.username}</span>
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">{u.role}</Badge>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => { setIsAddModalOpen(false); setEditingVm(null); }}>
                Cancel
              </Button>
              <Button type="submit">
                {editingVm ? 'Save Changes' : 'Create VM'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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

