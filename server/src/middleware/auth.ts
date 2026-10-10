import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma';
import { verifyAccessToken, TokenPayload } from '../utils/jwt';
import { hasPermission, PermissionType, UserRole } from '../shared';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

export async function authenticateJWT(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    res.status(401).json({ success: false, error: 'Authentication token missing' });
    return;
  }

  try {
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, username: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      if (user && !user.isActive) {
        await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
      }
      res.status(401).json({
        success: false,
        error: 'Account is disabled. Please contact an administrator.',
        code: 'ACCOUNT_DISABLED',
      });
      return;
    }

    req.user = {
      userId: user.id,
      username: user.username,
      role: user.role,
    };
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired access token' });
  }
}

export function requireRole(role: UserRole) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthenticated' });
      return;
    }
    if (req.user.role !== role) {
      res.status(403).json({ success: false, error: 'Forbidden: Insufficient privileges' });
      return;
    }
    next();
  };
}

export function requirePermission(permission: PermissionType) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthenticated' });
      return;
    }
    const userRole = req.user.role as UserRole;
    if (!hasPermission(userRole, permission)) {
      res.status(403).json({ success: false, error: `Forbidden: Missing required permission ${permission}` });
      return;
    }
    next();
  };
}
