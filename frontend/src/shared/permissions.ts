import { UserRole } from './enums';

export const Permission = {
  USER_CREATE: 'USER_CREATE',
  USER_READ: 'USER_READ',
  USER_UPDATE: 'USER_UPDATE',
  USER_DELETE: 'USER_DELETE',
  VM_CREATE: 'VM_CREATE',
  VM_READ: 'VM_READ',
  VM_UPDATE: 'VM_UPDATE',
  VM_DELETE: 'VM_DELETE',
  VM_VIEW: 'VM_VIEW',
  VM_CONNECT: 'VM_CONNECT',
  VM_ASSIGN_USER: 'VM_ASSIGN_USER',
  SESSION_VIEW: 'SESSION_VIEW',
  SESSION_TERMINATE: 'SESSION_TERMINATE',
} as const;

export type PermissionType = typeof Permission[keyof typeof Permission];

export const RolePermissions: Record<UserRole, PermissionType[]> = {
  [UserRole.ADMIN]: [
    Permission.USER_CREATE,
    Permission.USER_READ,
    Permission.USER_UPDATE,
    Permission.USER_DELETE,
    Permission.VM_CREATE,
    Permission.VM_READ,
    Permission.VM_UPDATE,
    Permission.VM_DELETE,
    Permission.VM_VIEW,
    Permission.VM_CONNECT,
    Permission.VM_ASSIGN_USER,
    Permission.SESSION_VIEW,
    Permission.SESSION_TERMINATE,
  ],
  [UserRole.USER]: [
    Permission.VM_VIEW,
    Permission.VM_CONNECT,
  ],
};

export function hasPermission(role: UserRole, permission: PermissionType): boolean {
  const perms = RolePermissions[role] || [];
  return perms.includes(permission);
}
