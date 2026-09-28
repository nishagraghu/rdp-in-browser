import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { toast } from 'sonner';
import {
  AlertCircle, ArrowLeft, Eye, EyeOff, Globe, Lock, Server, UserCheck, Users,
} from 'lucide-react';
import { AppDispatch, RootState } from '../../store';
import { fetchVms, fetchVmById, createVm, updateVm } from '../../store/vmSlice';
import { fetchUsers } from '../../store/userSlice';
import api from '../../api/client';
import {
  VmDto, VmProtocol, UserDto,
  DEFAULT_CONNECTION_TIMEOUT_SEC, MIN_CONNECTION_TIMEOUT_SEC, MAX_CONNECTION_TIMEOUT_SEC,
  MAX_CONNECTION_LIMIT, clampConnectionTimeout, clampConnectionLimit,
} from '@rdp/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';

const getDefaultPort = (protocol: VmProtocol): string => {
  switch (protocol) {
    case VmProtocol.VNC:
      return '5900';
    case VmProtocol.SSH:
      return '22';
    case VmProtocol.RDP:
    default:
      return '3389';
  }
};

const digitsOnly = (value: string) => value.replace(/[^0-9]/g, '');

const emptyValues = {
  name: '',
  description: '',
  protocol: VmProtocol.RDP,
  hostname: '',
  port: '3389',
  connectionTimeout: String(DEFAULT_CONNECTION_TIMEOUT_SEC),
  maxConnections: '0',
  maxConnectionsPerUser: '0',
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
  commonDrive: false,
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
};

type VmFormValues = typeof emptyValues;

function valuesFromVm(vm: VmDto): VmFormValues {
  return {
    name: vm.name || '',
    description: vm.description || '',
    protocol: vm.protocol || VmProtocol.RDP,
    hostname: vm.hostname || '',
    port: String(vm.port || 3389),
    connectionTimeout: String(clampConnectionTimeout(vm.connectionTimeout)),
    maxConnections: String(clampConnectionLimit(vm.maxConnections)),
    maxConnectionsPerUser: String(clampConnectionLimit(vm.maxConnectionsPerUser)),
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
    commonDrive: !!vm.commonDrive,
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
  };
}

const Section: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <Card>
    <CardHeader className="pb-4">
      <CardTitle className="text-base">{title}</CardTitle>
      {description && <CardDescription>{description}</CardDescription>}
    </CardHeader>
    <CardContent className="space-y-4">{children}</CardContent>
  </Card>
);

export const VmFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { vms, currentVm } = useSelector((state: RootState) => state.vms);
  const { users } = useSelector((state: RootState) => state.users);

  const [showPassword, setShowPassword] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadingVm, setLoadingVm] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);

  const editingVm: VmDto | null = useMemo(() => {
    if (!isEdit) return null;
    if (currentVm && currentVm.id === id) return currentVm;
    return vms.find((v) => v.id === id) || null;
  }, [isEdit, id, currentVm, vms]);

  useEffect(() => {
    dispatch(fetchUsers());
  }, [dispatch]);

  useEffect(() => {
    if (!isEdit || !id) return;
    let cancelled = false;
    setLoadingVm(true);
    setLoadError(null);
    dispatch(fetchVmById(id)).then((res) => {
      if (cancelled) return;
      if (!fetchVmById.fulfilled.match(res)) {
        setLoadError('This VM could not be loaded. It may have been deleted.');
      }
      setLoadingVm(false);
    });
    return () => {
      cancelled = true;
    };
  }, [dispatch, id, isEdit]);

  const formik = useFormik<VmFormValues>({
    initialValues: emptyValues,
    enableReinitialize: false,
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
      maxConnections: yup
        .number()
        .typeError('Must be a number')
        .integer('Must be a whole number')
        .min(0, 'Use 0 for unlimited')
        .max(MAX_CONNECTION_LIMIT, `Maximum ${MAX_CONNECTION_LIMIT}`)
        .required('Required (0 = unlimited)'),
      maxConnectionsPerUser: yup
        .number()
        .typeError('Must be a number')
        .integer('Must be a whole number')
        .min(0, 'Use 0 for unlimited')
        .max(MAX_CONNECTION_LIMIT, `Maximum ${MAX_CONNECTION_LIMIT}`)
        .required('Required (0 = unlimited)')
        .test('per-user-within-total', 'Cannot exceed the maximum connections', function (value) {
          const total = Number(this.parent.maxConnections);
          if (!total || !value) return true;
          return value <= total;
        }),
      username: yup.string().required('Username is required'),
      password: yup.string().test('is-required', 'Password is required', function (value) {
        if (!isEdit && !value) return false;
        return true;
      }),
      drivePath: yup.string().test('common-folder', 'Enter the common folder name', function (value) {
        if (!this.parent.enableDrive || !this.parent.commonDrive) return true;
        return !!String(value || '').trim();
      }),
    }),
    onSubmit: async (values) => {
      setFormError(null);
      const parsedPort = parseInt(values.port, 10) || parseInt(getDefaultPort(values.protocol), 10);
      const parseOptionalInt = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const n = parseInt(trimmed, 10);
        return Number.isFinite(n) && n > 0 ? n : null;
      };

      const payload: Record<string, unknown> = {
        name: values.name.trim(),
        description: values.description.trim() || undefined,
        protocol: values.protocol,
        hostname: values.hostname.trim(),
        port: parsedPort,
        connectionTimeout: clampConnectionTimeout(values.connectionTimeout),
        maxConnections: clampConnectionLimit(values.maxConnections),
        maxConnectionsPerUser: clampConnectionLimit(values.maxConnectionsPerUser),
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
        drivePath: values.commonDrive ? values.drivePath.trim() : values.drivePath.trim() || undefined,
        createDrivePath: values.commonDrive ? false : values.createDrivePath,
        commonDrive: values.commonDrive,
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

      if (isEdit && id) {
        const res = await dispatch(updateVm({ id, data: payload }));
        if (updateVm.fulfilled.match(res)) {
          try {
            await api.put(`/vms/${id}/users`, { userIds: selectedUserIds });
          } catch {
            toast.error('VM saved, but user assignments could not be updated');
          }
          dispatch(fetchVms());
          toast.success('VM updated');
          navigate('/admin/vms');
        } else {
          setFormError((res.payload as string) || 'Failed to update VM');
        }
      } else {
        payload.assignedUserIds = selectedUserIds;
        const res = await dispatch(createVm(payload));
        if (createVm.fulfilled.match(res)) {
          dispatch(fetchVms());
          toast.success('VM created');
          navigate('/admin/vms');
        } else {
          setFormError((res.payload as string) || 'Failed to create VM');
        }
      }
    },
  });

  // Prefill once the VM arrives (from cache or from the fetch).
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  useEffect(() => {
    if (!isEdit || !editingVm || prefilledFor === editingVm.id) return;
    formik.setValues(valuesFromVm(editingVm));
    setSelectedUserIds(editingVm.assignedUsers?.map((u: UserDto) => u.id) || []);
    setPrefilledFor(editingVm.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, editingVm, prefilledFor]);

  const handleProtocolChange = (newProtocol: VmProtocol) => {
    const currentPort = formik.values.port;
    formik.setFieldValue('protocol', newProtocol);
    if (['3389', '5900', '22', ''].includes(currentPort)) {
      formik.setFieldValue('port', getDefaultPort(newProtocol));
    }
  };

  const fieldError = (name: keyof VmFormValues) =>
    formik.touched[name] && formik.errors[name] ? (
      <div className="text-xs text-destructive">{String(formik.errors[name])}</div>
    ) : null;

  const errorClass = (name: keyof VmFormValues) =>
    formik.touched[name] && formik.errors[name] ? 'border-destructive' : '';

  const title = isEdit ? (editingVm ? `Edit VM: ${editingVm.name}` : 'Edit VM') : 'Add New Virtual Machine';

  if (isEdit && loadingVm && !editingVm) {
    return (
      <div className="p-8 text-center text-muted-foreground">Loading virtual machine...</div>
    );
  }

  if (isEdit && loadError && !editingVm) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/admin/vms')} className="gap-2 -ml-2">
          <ArrowLeft className="w-4 h-4" /> Back to VM Management
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <form onSubmit={formik.handleSubmit} className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b pb-5 gap-4">
        <div className="flex items-start gap-3">
          <Button type="button" variant="ghost" size="icon" onClick={() => navigate('/admin/vms')} title="Back to VM Management">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Server className="w-6 h-6 text-primary" />
              {title}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure the connection details, limits, and options for the remote host.
            </p>
          </div>
        </div>
      </div>

      {formError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Section title="Connection" description="Where and how the remote host is reached.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name" className="flex h-5 items-center">
                  VM Display Name <span className="text-destructive ml-0.5">*</span>
                </Label>
                <Input
                  id="name"
                  name="name"
                  value={formik.values.name}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  placeholder="e.g. Windows 11 Workstation"
                  className={errorClass('name')}
                />
                {fieldError('name')}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="protocol" className="flex h-5 items-center">
                  Protocol <span className="text-destructive ml-0.5">*</span>
                </Label>
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

            <div className="flex flex-col gap-2">
              <Label htmlFor="description" className="flex h-5 items-center">
                Description (Optional)
              </Label>
              <Input
                id="description"
                name="description"
                value={formik.values.description}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                placeholder="e.g. Development machine with Visual Studio & Docker"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
              <div className="sm:col-span-6 flex flex-col gap-2">
                <Label htmlFor="hostname" className="flex h-5 items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Hostname / IP <span className="text-destructive">*</span>
                  </span>
                </Label>
                <Input
                  id="hostname"
                  name="hostname"
                  value={formik.values.hostname}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  placeholder="e.g. 192.168.1.100"
                  className={`font-mono text-xs ${errorClass('hostname')}`}
                />
                {fieldError('hostname')}
              </div>
              <div className="sm:col-span-3 flex flex-col gap-2">
                <Label htmlFor="port" className="flex h-5 items-center">
                  Port <span className="text-destructive ml-0.5">*</span>
                </Label>
                <Input
                  id="port"
                  name="port"
                  inputMode="numeric"
                  value={formik.values.port}
                  onChange={(e) => formik.setFieldValue('port', digitsOnly(e.target.value))}
                  onBlur={formik.handleBlur}
                  placeholder={getDefaultPort(formik.values.protocol)}
                  className={`font-mono text-xs ${errorClass('port')}`}
                />
                {fieldError('port')}
              </div>
              <div className="sm:col-span-3 flex flex-col gap-2">
                <Label htmlFor="connectionTimeout" className="flex h-5 items-center">
                  Connect timeout
                </Label>
                <Input
                  id="connectionTimeout"
                  name="connectionTimeout"
                  inputMode="numeric"
                  value={formik.values.connectionTimeout}
                  onChange={(e) => formik.setFieldValue('connectionTimeout', digitsOnly(e.target.value))}
                  onBlur={formik.handleBlur}
                  placeholder={String(DEFAULT_CONNECTION_TIMEOUT_SEC)}
                  className={`font-mono text-xs ${errorClass('connectionTimeout')}`}
                />
                {fieldError('connectionTimeout')}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
              <div className="flex flex-col gap-2">
                <Label htmlFor="username" className="flex h-5 items-center">
                  {formik.values.protocol} Username <span className="text-destructive ml-0.5">*</span>
                </Label>
                <Input
                  id="username"
                  name="username"
                  autoComplete="off"
                  value={formik.values.username}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  placeholder="Administrator"
                  className={errorClass('username')}
                />
                {fieldError('username')}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password" className="flex h-5 items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Password {!isEdit && <span className="text-destructive">*</span>}
                  </span>
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
                    placeholder={isEdit ? 'Unchanged' : 'Enter password'}
                    className={`pr-10 ${errorClass('password')}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldError('password')}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="domain" className="flex h-5 items-center">
                  Domain (Optional)
                </Label>
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
          </Section>

          <Section
            title="Access Restrictions"
            description="Leave blank for no restriction. Daily time window and calendar dates control when users can connect."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="allowAccessAfter" className="font-normal text-sm">Allow access after</Label>
                <Input id="allowAccessAfter" name="allowAccessAfter" type="time" value={formik.values.allowAccessAfter} onChange={formik.handleChange} onBlur={formik.handleBlur} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="doNotAllowAccessAfter" className="font-normal text-sm">Do not allow access after</Label>
                <Input id="doNotAllowAccessAfter" name="doNotAllowAccessAfter" type="time" value={formik.values.doNotAllowAccessAfter} onChange={formik.handleChange} onBlur={formik.handleBlur} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="enableAccountAfter" className="font-normal text-sm">Enable account after</Label>
                <Input id="enableAccountAfter" name="enableAccountAfter" type="date" value={formik.values.enableAccountAfter} onChange={formik.handleChange} onBlur={formik.handleBlur} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="disableAccountAfter" className="font-normal text-sm">Disable account after</Label>
                <Input id="disableAccountAfter" name="disableAccountAfter" type="date" value={formik.values.disableAccountAfter} onChange={formik.handleChange} onBlur={formik.handleBlur} />
              </div>
            </div>
          </Section>

          <Section
            title="Connection limit"
            description="Cap how many sessions can be open on this desktop at the same time. New connections are refused once a limit is reached. 0 = unlimited."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxConnections" className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Maximum connections
                </Label>
                <Input
                  id="maxConnections"
                  name="maxConnections"
                  inputMode="numeric"
                  value={formik.values.maxConnections}
                  onChange={(e) => formik.setFieldValue('maxConnections', digitsOnly(e.target.value))}
                  onBlur={formik.handleBlur}
                  placeholder="0"
                  className={`font-mono text-xs ${errorClass('maxConnections')}`}
                />
                <p className="text-[11px] text-muted-foreground">Total simultaneous sessions across all users. 0 = unlimited (max {MAX_CONNECTION_LIMIT}).</p>
                {fieldError('maxConnections')}
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxConnectionsPerUser" className="flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" />
                  Maximum connections per user
                </Label>
                <Input
                  id="maxConnectionsPerUser"
                  name="maxConnectionsPerUser"
                  inputMode="numeric"
                  value={formik.values.maxConnectionsPerUser}
                  onChange={(e) => formik.setFieldValue('maxConnectionsPerUser', digitsOnly(e.target.value))}
                  onBlur={formik.handleBlur}
                  placeholder="0"
                  className={`font-mono text-xs ${errorClass('maxConnectionsPerUser')}`}
                />
                <p className="text-[11px] text-muted-foreground">Simultaneous sessions a single user may open on this desktop. 0 = unlimited.</p>
                {fieldError('maxConnectionsPerUser')}
              </div>
            </div>
          </Section>

          <Section title="Assign Users" description="Select which portal users are authorized to view and connect to this remote desktop.">
            <div className="max-h-64 overflow-y-auto divide-y border rounded-md p-1 bg-muted/20">
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
                            else setSelectedUserIds(selectedUserIds.filter((uid) => uid !== u.id));
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
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Display">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="displayWidth" className="text-xs">Width</Label>
                <Input id="displayWidth" name="displayWidth" inputMode="numeric" value={formik.values.displayWidth} onChange={(e) => formik.setFieldValue('displayWidth', digitsOnly(e.target.value))} onBlur={formik.handleBlur} placeholder="Auto (browser viewport)" className="h-8 text-xs font-mono" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="displayHeight" className="text-xs">Height</Label>
                <Input id="displayHeight" name="displayHeight" inputMode="numeric" value={formik.values.displayHeight} onChange={(e) => formik.setFieldValue('displayHeight', digitsOnly(e.target.value))} onBlur={formik.handleBlur} placeholder="Auto (browser viewport)" className="h-8 text-xs font-mono" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dpi" className="text-xs">Resolution (DPI)</Label>
                <Input id="dpi" name="dpi" inputMode="numeric" value={formik.values.dpi} onChange={(e) => formik.setFieldValue('dpi', digitsOnly(e.target.value))} onBlur={formik.handleBlur} placeholder="96" className="h-8 text-xs font-mono" />
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
              <Label htmlFor="forceLossless" className="font-normal text-xs">Force lossless compression</Label>
              <Checkbox id="forceLossless" checked={formik.values.forceLossless} onCheckedChange={(c) => formik.setFieldValue('forceLossless', !!c)} />
            </div>
            <div className="flex items-center justify-between gap-3 py-0.5">
              <Label htmlFor="readOnly" className="font-normal text-xs">Read-only</Label>
              <Checkbox id="readOnly" checked={formik.values.readOnly} onCheckedChange={(c) => formik.setFieldValue('readOnly', !!c)} />
            </div>
          </Section>

          <Section title="Clipboard">
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
              <Checkbox id="disableCopy" checked={formik.values.disableCopy} onCheckedChange={(c) => formik.setFieldValue('disableCopy', !!c)} />
            </div>
            <div className="flex items-center justify-between gap-3 py-0.5">
              <Label htmlFor="disablePaste" className="font-normal text-xs">Disable pasting from client</Label>
              <Checkbox id="disablePaste" checked={formik.values.disablePaste} onCheckedChange={(c) => formik.setFieldValue('disablePaste', !!c)} />
            </div>
          </Section>

          <Section title="Performance">
            <div className="space-y-2">
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
                    checked={!!formik.values[opt.id as keyof VmFormValues]}
                    onCheckedChange={(c) => formik.setFieldValue(opt.id, !!c)}
                  />
                </div>
              ))}
            </div>
          </Section>

          <Section title="Device Redirection">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 bg-muted/20 p-3 rounded-md border">
                <h4 className="text-sm font-medium mb-3">Audio</h4>
                <div className="flex items-center justify-between gap-3 py-0.5">
                  <Label htmlFor="supportAudioInConsole" className="font-normal text-xs">Support audio in console</Label>
                  <Checkbox id="supportAudioInConsole" checked={formik.values.supportAudioInConsole} onCheckedChange={(c) => formik.setFieldValue('supportAudioInConsole', !!c)} />
                </div>
                <div className="flex items-center justify-between gap-3 py-0.5">
                  <Label htmlFor="disableAudio" className="font-normal text-xs">Disable audio</Label>
                  <Checkbox id="disableAudio" checked={formik.values.disableAudio} onCheckedChange={(c) => formik.setFieldValue('disableAudio', !!c)} />
                </div>
                <div className="flex items-center justify-between gap-3 py-0.5">
                  <Label htmlFor="enableAudioInput" className="font-normal text-xs">Enable audio input (microphone)</Label>
                  <Checkbox id="enableAudioInput" checked={formik.values.enableAudioInput} onCheckedChange={(c) => formik.setFieldValue('enableAudioInput', !!c)} />
                </div>
              </div>

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

            <div className="space-y-2 bg-muted/20 p-3 rounded-md border">
              <h4 className="text-sm font-medium mb-3">Shared Drive</h4>
              <p className="text-xs text-muted-foreground mb-2">
                {formik.values.commonDrive
                  ? 'Everyone uses one existing folder. This app does not create it.'
                  : <>Each user gets a folder (<code className="text-[10px]">DRIVES_PATH/&#123;username&#125;</code>), created automatically.</>}
              </p>
              <div className="flex items-center justify-between gap-3 py-0.5">
                <Label htmlFor="enableDrive" className="font-normal text-xs">Enable shared drive</Label>
                <Checkbox id="enableDrive" checked={formik.values.enableDrive} onCheckedChange={(c) => formik.setFieldValue('enableDrive', !!c)} />
              </div>
              {formik.values.enableDrive && (
                <div className="grid grid-cols-1 gap-4 mt-4">
                  <div className="space-y-1">
                    <Label htmlFor="driveName" className="text-xs">Drive name (in remote session)</Label>
                    <Input id="driveName" name="driveName" value={formik.values.driveName} onChange={formik.handleChange} onBlur={formik.handleBlur} placeholder="Shared Drive" className="h-7 text-xs" />
                  </div>
                  <div className="flex items-center justify-between gap-3 py-0.5">
                    <div>
                      <Label htmlFor="commonDrive" className="font-normal text-xs">Common folder</Label>
                      <p className="text-[11px] text-muted-foreground">
                        On: one folder for everyone. Off: a separate folder per user.
                      </p>
                    </div>
                    <Switch
                      id="commonDrive"
                      checked={formik.values.commonDrive}
                      onCheckedChange={(checked) => formik.setFieldValue('commonDrive', checked)}
                    />
                  </div>
                  {formik.values.commonDrive && (
                    <div className="space-y-1">
                      <Label htmlFor="drivePath" className="text-xs">Folder name</Label>
                      <Input
                        id="drivePath"
                        name="drivePath"
                        value={formik.values.drivePath}
                        onChange={formik.handleChange}
                        onBlur={formik.handleBlur}
                        placeholder="common"
                        className="h-7 text-xs"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Folder that already exists under DRIVES_PATH. Example: common is DRIVES_PATH/common.
                        Create it on the host before saving. Everyone can see files in it, add files, and remove files.
                      </p>
                      {formik.touched.drivePath && formik.errors.drivePath && (
                        <p className="text-[10px] text-destructive">{formik.errors.drivePath}</p>
                      )}
                    </div>
                  )}
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3 py-0.5">
                      <Label htmlFor="disableFileUpload" className="font-normal text-xs">Disable browser upload into shared drive</Label>
                      <Checkbox id="disableFileUpload" checked={formik.values.disableFileUpload} onCheckedChange={(c) => formik.setFieldValue('disableFileUpload', !!c)} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Browser downloads are not used — transfer is only via the shared host folder.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 bg-muted/20 p-3 rounded-md border">
              <Label htmlFor="staticChannelNames" className="text-sm font-medium">Static channel names</Label>
              <Input id="staticChannelNames" name="staticChannelNames" value={formik.values.staticChannelNames} onChange={formik.handleChange} onBlur={formik.handleBlur} className="h-8 text-xs mt-1" />
            </div>
          </Section>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 right-0 left-0 md:left-64 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center justify-end gap-3 px-6 py-3">
          {Object.keys(formik.errors).length > 0 && formik.submitCount > 0 && (
            <span className="text-xs text-destructive mr-auto flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              Fix the highlighted fields before saving.
            </span>
          )}
          <Button type="button" variant="outline" onClick={() => navigate('/admin/vms')} disabled={formik.isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={formik.isSubmitting}>
            {formik.isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create VM'}
          </Button>
        </div>
      </div>
    </form>
  );
};
