export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export enum VmProtocol {
  RDP = 'RDP',
  VNC = 'VNC',
  SSH = 'SSH',
}

export enum AuditAction {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  AUTH_FAILURE = 'AUTH_FAILURE',
  USER_CREATE = 'USER_CREATE',
  USER_UPDATE = 'USER_UPDATE',
  USER_DELETE = 'USER_DELETE',
  VM_CREATE = 'VM_CREATE',
  VM_UPDATE = 'VM_UPDATE',
  VM_DELETE = 'VM_DELETE',
  VM_ASSIGN = 'VM_ASSIGN',
  VM_UNASSIGN = 'VM_UNASSIGN',
  VM_CONNECT = 'VM_CONNECT',
}
