import { useState } from 'react';
import type { ConnectParams } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Monitor, MonitorPlay, ChevronDown, ChevronUp } from 'lucide-react';
import { useFormik } from 'formik';
import * as yup from 'yup';

interface Props {
  onConnect: (params: ConnectParams) => void;
}

const DEFAULTS: ConnectParams = {
  host: '',
  port: 3389,
  username: '',
  password: '',
  domain: '',
  width: 1920,
  height: 1080,
  colorDepth: 32,
  security: 'any',
  ignoreCert: true,
  label: '',
  enableWallpaper: true,
  enableTheming: true,
  enableFontSmoothing: true,
  enableDesktopComposition: true,
  enableFullWindowDrag: false,
  enableMenuAnimations: false,
  disableBitmapCaching: false,
  disableAudio: true,
  supportAudioInConsole: false,
  enableAudioInput: false,
  enablePrinting: false,
  printerName: '',
  enableDrive: false,
  driveName: '',
  disableFileDownload: false,
  disableFileUpload: false,
  drivePath: '',
  createDrivePath: false,
  staticChannelNames: '',
};

const SAVED_KEY = 'rdp-saved-connections';

function loadSaved(): ConnectParams[] {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]'); }
  catch { return []; }
}
function saveTo(list: ConnectParams[]) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(list));
}

export default function ConnectForm({ onConnect }: Props) {
  const [saved, setSaved]       = useState<ConnectParams[]>(loadSaved);
  const [advanced, setAdvanced] = useState(false);

  const formik = useFormik({
    initialValues: DEFAULTS,
    validationSchema: yup.object({
      host: yup.string().required('Host / IP is required'),
      port: yup.number().required('Port is required').min(1).max(65535),
      width: yup.number().required().min(800),
      height: yup.number().required().min(600),
    }),
    onSubmit: (values) => {
      if (!values.host.trim()) return;
      const params = { ...values, label: values.label || values.host };
      const updated = [params, ...saved.filter(s => s.host !== params.host)].slice(0, 10);
      setSaved(updated); saveTo(updated);
      onConnect(params);
    }
  });

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      <div className="flex items-center justify-center space-x-2 text-primary pb-4">
        <Monitor className="w-8 h-8" />
        <h1 className="text-2xl font-bold tracking-tight">RDP in Browser</h1>
      </div>

      {saved.length > 0 && (
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Recent Connections</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {saved.map((s, i) => (
              <Button 
                key={i} 
                variant="outline" 
                className="w-full justify-start text-left h-auto py-3 border-border/50 hover:bg-secondary/50" 
                onClick={() => formik.setValues(s)}
              >
                <MonitorPlay className="w-4 h-4 mr-3 text-muted-foreground" />
                <div className="flex flex-col overflow-hidden">
                  <span className="font-medium truncate">{s.label || s.host}</span>
                  <span className="text-xs text-muted-foreground truncate">{s.username}@{s.host}:{s.port}</span>
                </div>
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="border-border shadow-sm">
        <form onSubmit={formik.handleSubmit}>
          <CardHeader>
            <CardTitle>New Connection</CardTitle>
            <CardDescription>Enter details to connect to a remote desktop.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="label">Friendly Name <span className="text-muted-foreground font-normal">(Optional)</span></Label>
              <Input id="label" name="label" value={formik.values.label ?? ''} placeholder="e.g. My Server" onChange={formik.handleChange} onBlur={formik.handleBlur} />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="host">Host / IP</Label>
                <Input id="host" name="host" value={formik.values.host} placeholder="192.168.1.100" onChange={formik.handleChange} onBlur={formik.handleBlur} className={formik.touched.host && formik.errors.host ? "border-destructive" : ""} />
                {formik.touched.host && formik.errors.host && <div className="text-xs text-destructive">{formik.errors.host}</div>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
                <Input id="port" name="port" type="number" value={formik.values.port} onChange={formik.handleChange} onBlur={formik.handleBlur} className={formik.touched.port && formik.errors.port ? "border-destructive" : ""} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" name="username" value={formik.values.username} onChange={formik.handleChange} onBlur={formik.handleBlur} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" value={formik.values.password} onChange={formik.handleChange} onBlur={formik.handleBlur} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="domain">Domain <span className="text-muted-foreground font-normal">(Optional)</span></Label>
              <Input id="domain" name="domain" value={formik.values.domain} onChange={formik.handleChange} onBlur={formik.handleBlur} />
            </div>

            <Button 
              type="button" 
              variant="ghost" 
              className="w-full text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setAdvanced(p => !p)}
            >
              {advanced ? <><ChevronUp className="w-3 h-3 mr-1"/> Hide Advanced</> : <><ChevronDown className="w-3 h-3 mr-1"/> Show Advanced</>}
            </Button>

            {advanced && (
              <div className="space-y-6 pt-4 border-t border-border">
                
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-foreground">Resolution & Color</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Width</Label>
                      <Input type="number" name="width" value={formik.values.width} onChange={formik.handleChange} onBlur={formik.handleBlur} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Height</Label>
                      <Input type="number" name="height" value={formik.values.height} onChange={formik.handleChange} onBlur={formik.handleBlur} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Color Depth</Label>
                    <Select value={String(formik.values.colorDepth)} onValueChange={v => formik.setFieldValue('colorDepth', parseInt(v, 10))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="8">8-bit</SelectItem>
                        <SelectItem value="16">16-bit</SelectItem>
                        <SelectItem value="24">24-bit</SelectItem>
                        <SelectItem value="32">32-bit (Best)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-foreground">Visual Quality</h4>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                    {[
                      { id: 'enableWallpaper', label: 'Wallpaper' },
                      { id: 'enableTheming', label: 'Theming' },
                      { id: 'enableFontSmoothing', label: 'Font smoothing' },
                      { id: 'enableDesktopComposition', label: 'Desktop composition' },
                      { id: 'enableFullWindowDrag', label: 'Full window drag' },
                      { id: 'enableMenuAnimations', label: 'Menu animations' },
                      { id: 'disableBitmapCaching', label: 'Disable bitmap caching' },
                    ].map(opt => (
                      <div key={opt.id} className="flex items-center space-x-2">
                        <Checkbox 
                          id={opt.id} 
                          checked={Boolean(formik.values[opt.id as keyof ConnectParams])} 
                          onCheckedChange={c => formik.setFieldValue(opt.id, Boolean(c))} 
                        />
                        <label htmlFor={opt.id} className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{opt.label}</label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-foreground">Connection</h4>
                  <div className="space-y-2">
                    <Label className="text-xs">Security</Label>
                    <Select value={formik.values.security} onValueChange={v => formik.setFieldValue('security', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any (Auto)</SelectItem>
                        <SelectItem value="nla">NLA</SelectItem>
                        <SelectItem value="tls">TLS</SelectItem>
                        <SelectItem value="rdp">RDP (Classic)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3 pt-2">
                     <div className="flex items-center space-x-2">
                        <Checkbox id="ignoreCert" checked={formik.values.ignoreCert} onCheckedChange={c => formik.setFieldValue('ignoreCert', Boolean(c))} />
                        <label htmlFor="ignoreCert" className="text-xs font-medium leading-none">Ignore certificate errors</label>
                      </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-foreground">Device Redirection</h4>
                  
                  {/* Audio */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Audio</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4">
                      <div className="flex items-center space-x-2">
                         <Checkbox id="disableAudio" checked={formik.values.disableAudio} onCheckedChange={c => formik.setFieldValue('disableAudio', Boolean(c))} />
                         <label htmlFor="disableAudio" className="text-xs font-medium leading-none">Disable audio</label>
                      </div>
                      <div className="flex items-center space-x-2">
                         <Checkbox id="supportAudioInConsole" checked={formik.values.supportAudioInConsole} onCheckedChange={c => formik.setFieldValue('supportAudioInConsole', Boolean(c))} />
                         <label htmlFor="supportAudioInConsole" className="text-xs font-medium leading-none">Support audio in console</label>
                      </div>
                      <div className="flex items-center space-x-2">
                         <Checkbox id="enableAudioInput" checked={formik.values.enableAudioInput} onCheckedChange={c => formik.setFieldValue('enableAudioInput', Boolean(c))} />
                         <label htmlFor="enableAudioInput" className="text-xs font-medium leading-none">Enable audio input</label>
                      </div>
                    </div>
                  </div>

                  {/* Printing */}
                  <div className="space-y-2 pt-2 border-t border-border">
                    <Label className="text-xs font-semibold">Printing</Label>
                    <div className="flex flex-col space-y-3">
                      <div className="flex items-center space-x-2">
                         <Checkbox id="enablePrinting" checked={formik.values.enablePrinting} onCheckedChange={c => formik.setFieldValue('enablePrinting', Boolean(c))} />
                         <label htmlFor="enablePrinting" className="text-xs font-medium leading-none">Enable printing</label>
                      </div>
                      {formik.values.enablePrinting && (
                        <div className="pl-6">
                          <Label htmlFor="printerName" className="text-xs">Redirected printer name</Label>
                          <Input id="printerName" name="printerName" value={formik.values.printerName} onChange={formik.handleChange} onBlur={formik.handleBlur} placeholder="Cloudgoo PDF" className="h-7 text-xs mt-1" />
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Print jobs download as PDF and open the print dialog on this computer.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Shared Drive */}
                  <div className="space-y-2 pt-2 border-t border-border">
                    <Label className="text-xs font-semibold">Shared Drive</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Uses the host shared folder per username. No separate browser download.
                    </p>
                    <div className="flex items-center space-x-2">
                       <Checkbox id="enableDrive" checked={formik.values.enableDrive} onCheckedChange={c => formik.setFieldValue('enableDrive', Boolean(c))} />
                       <label htmlFor="enableDrive" className="text-xs font-medium leading-none">Enable shared drive</label>
                    </div>
                    {formik.values.enableDrive && (
                      <div className="pl-6 space-y-3 mt-2">
                        <div>
                          <Label htmlFor="driveName" className="text-xs">Drive name</Label>
                          <Input id="driveName" name="driveName" value={formik.values.driveName} onChange={formik.handleChange} onBlur={formik.handleBlur} placeholder="Shared Drive" className="h-7 text-xs mt-1" />
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="disableFileUpload" checked={formik.values.disableFileUpload} onCheckedChange={c => formik.setFieldValue('disableFileUpload', Boolean(c))} />
                          <Label htmlFor="disableFileUpload" className="font-normal text-xs">Disable browser upload</Label>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Channels */}
                  <div className="space-y-2 pt-2 border-t border-border">
                    <Label htmlFor="staticChannelNames" className="text-xs font-semibold">Static channel names</Label>
                    <Input id="staticChannelNames" name="staticChannelNames" value={formik.values.staticChannelNames} onChange={formik.handleChange} onBlur={formik.handleBlur} className="h-7 text-xs" />
                  </div>
                </div>

              </div>
            )}
            
            <Button type="submit" className="w-full mt-4">Connect</Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
