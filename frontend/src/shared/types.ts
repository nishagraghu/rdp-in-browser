import { UserRole, VmProtocol, AuditAction } from './enums';

export interface UserDto {
  id: string;
  name: string;
  email: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    assignments: number;
  };
}

export interface VmDto {
  id: string;
  name: string;
  description?: string | null;
  protocol: VmProtocol;
  hostname: string;
  port: number;
  connectionTimeout?: number;
  username: string;
  domain?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;

  // Access schedule (times "HH:mm", dates "YYYY-MM-DD")
  allowAccessAfter?: string | null;
  doNotAllowAccessAfter?: string | null;
  enableAccountAfter?: string | null;
  disableAccountAfter?: string | null;
  
  // Device Redirection
  supportAudioInConsole?: boolean;
  disableAudio?: boolean;
  enableAudioInput?: boolean;
  enablePrinting?: boolean;
  printerName?: string | null;
  enableDrive?: boolean;
  driveName?: string | null;
  disableFileDownload?: boolean;
  disableFileUpload?: boolean;
  drivePath?: string | null;
  createDrivePath?: boolean;
  commonDrive?: boolean;
  staticChannelNames?: string | null;

  // Clipboard (Guacamole)
  normalizeClipboard?: string;
  disableCopy?: boolean;
  disablePaste?: boolean;

  // Display (Guacamole RDP)
  displayWidth?: number | null;
  displayHeight?: number | null;
  dpi?: number | null;
  colorDepth?: number;
  forceLossless?: boolean;
  resizeMethod?: string;
  readOnly?: boolean;

  // Performance (Guacamole RDP)
  enableWallpaper?: boolean;
  enableTheming?: boolean;
  enableFontSmoothing?: boolean;
  enableFullWindowDrag?: boolean;
  enableDesktopComposition?: boolean;
  enableMenuAnimations?: boolean;
  disableBitmapCaching?: boolean;
  disableOffscreenCaching?: boolean;
  disableGlyphCaching?: boolean;
  disableGfx?: boolean;

  assignedUsers?: UserDto[];
  _count?: {
    assignments: number;
  };
}

export interface VMUserAssignmentDto {
  id: string;
  vmId: string;
  userId: string;
  createdAt: string;
  vm?: VmDto;
  user?: UserDto;
}

export interface AuditLogDto {
  id: string;
  userId?: string | null;
  userName?: string | null;
  action: AuditAction;
  details?: string | null;
  ipAddress?: string | null;
  createdAt: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

export interface AuthTokens {
  accessToken: string;
}

export interface LoginResponseData {
  user: UserDto;
  accessToken: string;
}

export interface ConnectSessionResponse {
  token: string;
  wsUrl: string;
  vm: {
    id: string;
    name: string;
    protocol: VmProtocol;
    hostname: string;
    connectionTimeout?: number;
  };
}
