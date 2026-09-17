import { Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { hashPassword, comparePassword } from '../../utils/password';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { createAuditLog } from '../../utils/auditLogger';
import { AuthenticatedRequest } from '../../middleware/auth';
import { UserRole, AuditAction, validateEmail, validateUsername, validatePassword } from '../../shared';
import { ensureUserDriveDirectory } from '../../utils/userDrive';

export async function getSetupStatus(_req: Request, res: Response): Promise<void> {
  try {
    const adminCount = await prisma.user.count({
      where: { role: UserRole.ADMIN },
    });
    res.json({
      success: true,
      data: { setupRequired: adminCount === 0 },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to check setup status' });
  }
}

export async function initialSetup(req: Request, res: Response): Promise<void> {
  try {
    const adminCount = await prisma.user.count({
      where: { role: UserRole.ADMIN },
    });

    if (adminCount > 0) {
      res.status(403).json({
        success: false,
        error: 'Initial setup is disabled. An administrator account already exists.',
      });
      return;
    }

    const { name, email, username, password } = req.body;

    if (!name || !email || !username || !password) {
      res.status(400).json({ success: false, error: 'All fields (name, email, username, password) are required' });
      return;
    }

    if (!validateEmail(email)) {
      res.status(400).json({ success: false, error: 'Invalid email address' });
      return;
    }

    if (!validateUsername(username)) {
      res.status(400).json({ success: false, error: 'Username must be at least 3 characters' });
      return;
    }

    if (!validatePassword(password)) {
      res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
      return;
    }

    const passwordHash = await hashPassword(password);

    const admin = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase().trim(),
        username: username.toLowerCase().trim(),
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true,
      },
    });

    ensureUserDriveDirectory(admin.username);

    await createAuditLog({
      userId: admin.id,
      userName: admin.username,
      action: AuditAction.USER_CREATE,
      details: 'Created initial administrator account via setup flow',
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      message: 'First administrator account created successfully',
      data: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        username: admin.username,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({ success: false, error: 'Failed to complete initial setup' });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { usernameOrEmail, password } = req.body;

    if (!usernameOrEmail || !password) {
      res.status(400).json({ success: false, error: 'Username/Email and password are required' });
      return;
    }

    const loginStr = String(usernameOrEmail).toLowerCase().trim();

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: loginStr },
          { email: loginStr },
        ],
      },
    });

    if (!user) {
      await createAuditLog({
        action: AuditAction.AUTH_FAILURE,
        details: `Failed login attempt for nonexistent user: ${loginStr}`,
        ipAddress: req.ip,
      });
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    if (!user.isActive) {
      await createAuditLog({
        userId: user.id,
        userName: user.username,
        action: AuditAction.AUTH_FAILURE,
        details: 'Login attempt for deactivated user account',
        ipAddress: req.ip,
      });
      res.status(403).json({ success: false, error: 'Account is deactivated. Please contact an administrator.' });
      return;
    }

    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
      await createAuditLog({
        userId: user.id,
        userName: user.username,
        action: AuditAction.AUTH_FAILURE,
        details: 'Invalid password provided during login',
        ipAddress: req.ip,
      });
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    const tokenPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Save refresh token in DB
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      },
    });

    await createAuditLog({
      userId: user.id,
      userName: user.username,
      action: AuditAction.LOGIN,
      details: 'User logged in successfully',
      ipAddress: req.ip,
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        },
        accessToken,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed due to server error' });
  }
}

export async function logout(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { token: refreshToken },
      });
    }

    if (req.user) {
      await createAuditLog({
        userId: req.user.userId,
        userName: req.user.username,
        action: AuditAction.LOGOUT,
        details: 'User logged out',
        ipAddress: req.ip,
      });
    }

    res.clearCookie('refreshToken');
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Logout failed' });
  }
}

export async function getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthenticated' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ success: false, error: 'User account not found or inactive' });
      return;
    }

    res.json({
      success: true,
      data: {
        ...user,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch user profile' });
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      res.status(401).json({ success: false, error: 'Refresh token missing' });
      return;
    }

    const payload = verifyRefreshToken(refreshToken);

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      if (storedToken) {
        await prisma.refreshToken.delete({ where: { id: storedToken.id } });
      }
      res.status(401).json({ success: false, error: 'Refresh token expired or invalid' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ success: false, error: 'User account inactive or deleted' });
      return;
    }

    const newPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
    };

    const newAccessToken = generateAccessToken(newPayload);

    res.json({
      success: true,
      data: {
        accessToken: newAccessToken,
      },
    });
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid refresh token' });
  }
}

