import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../../db/prisma';
import { hashPassword, comparePassword } from '../../utils/password';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { createAuditLog } from '../../utils/auditLogger';
import { AuthenticatedRequest } from '../../middleware/auth';
import { UserRole, AuditAction, validateEmail, validateUsername, validatePassword } from '../../shared';
import { ensureUserDriveDirectory } from '../../utils/userDrive';
import { isSmtpConfigured, sendVerificationCodeEmail } from '../../utils/email';

const TWO_FA_TTL_MS = 10 * 60 * 1000; // 10 minutes
const TWO_FA_MAX_ATTEMPTS = 5;
const OTP_LENGTH = 6;

function hashOtp(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function generateOtp(): string {
  const n = crypto.randomInt(0, 10 ** OTP_LENGTH);
  return String(n).padStart(OTP_LENGTH, '0');
}

function emailHint(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

function toUserDto(user: {
  id: string;
  name: string;
  email: string;
  username: string;
  role: string;
  isActive: boolean;
  email2faEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    email2faEnabled: user.email2faEnabled,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

async function issueSessionTokens(
  user: { id: string; username: string; role: string },
  req: Request,
  res: Response,
) {
  const tokenPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
  };

  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt,
    },
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return accessToken;
}

async function createAndSendTwoFactorChallenge(
  user: { id: string; name: string; email: string; username: string },
  req: Request,
): Promise<{ challengeToken: string; emailHint: string; expiresInSeconds: number }> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 'default' } });
  if (!settings || !isSmtpConfigured(settings)) {
    throw new Error('Two-factor authentication is enabled but SMTP is not configured. Contact an administrator.');
  }

  const code = generateOtp();
  const challengeToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TWO_FA_TTL_MS);

  // Invalidate any previous pending challenges for this user
  await prisma.twoFactorCode.deleteMany({ where: { userId: user.id } });

  await prisma.twoFactorCode.create({
    data: {
      userId: user.id,
      codeHash: hashOtp(code),
      challengeToken,
      expiresAt,
    },
  });

  await sendVerificationCodeEmail(user.email, code, user.name);

  await createAuditLog({
    userId: user.id,
    userName: user.username,
    action: AuditAction.TWO_FACTOR_CHALLENGE,
    details: '2FA verification code sent to registered email',
    ipAddress: req.ip,
  });

  return {
    challengeToken,
    emailHint: emailHint(user.email),
    expiresInSeconds: Math.floor(TWO_FA_TTL_MS / 1000),
  };
}

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
        details: 'Login attempt for disabled user account',
        ipAddress: req.ip,
      });
      res.status(403).json({
        success: false,
        error: 'Account is disabled. Please contact an administrator.',
        code: 'ACCOUNT_DISABLED',
      });
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

    // Email 2FA: require OTP before issuing session tokens
    if (user.email2faEnabled) {
      try {
        const challenge = await createAndSendTwoFactorChallenge(user, req);
        res.json({
          success: true,
          data: {
            requires2FA: true,
            challengeToken: challenge.challengeToken,
            emailHint: challenge.emailHint,
            expiresInSeconds: challenge.expiresInSeconds,
          },
        });
      } catch (err) {
        console.error('2FA challenge error:', err);
        const message = err instanceof Error ? err.message : 'Failed to send verification code';
        res.status(503).json({ success: false, error: message });
      }
      return;
    }

    const accessToken = await issueSessionTokens(user, req, res);

    await createAuditLog({
      userId: user.id,
      userName: user.username,
      action: AuditAction.LOGIN,
      details: 'User logged in successfully',
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: {
        user: toUserDto(user),
        accessToken,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed due to server error' });
  }
}

export async function verifyTwoFactor(req: Request, res: Response): Promise<void> {
  try {
    const { challengeToken, code } = req.body as { challengeToken?: string; code?: string };

    if (!challengeToken || !code) {
      res.status(400).json({ success: false, error: 'Verification code and challenge token are required' });
      return;
    }

    const normalizedCode = String(code).trim().replace(/\s+/g, '');
    if (!/^\d{6}$/.test(normalizedCode)) {
      res.status(400).json({ success: false, error: 'Verification code must be 6 digits' });
      return;
    }

    const challenge = await prisma.twoFactorCode.findUnique({
      where: { challengeToken: String(challengeToken) },
      include: { user: true },
    });

    if (!challenge) {
      res.status(401).json({ success: false, error: 'Invalid or expired verification session. Please log in again.' });
      return;
    }

    if (challenge.expiresAt < new Date()) {
      await prisma.twoFactorCode.delete({ where: { id: challenge.id } });
      res.status(401).json({ success: false, error: 'Verification code has expired. Please log in again.' });
      return;
    }

    if (challenge.attempts >= TWO_FA_MAX_ATTEMPTS) {
      await prisma.twoFactorCode.delete({ where: { id: challenge.id } });
      await createAuditLog({
        userId: challenge.userId,
        userName: challenge.user.username,
        action: AuditAction.TWO_FACTOR_FAILURE,
        details: '2FA verification locked after too many attempts',
        ipAddress: req.ip,
      });
      res.status(429).json({
        success: false,
        error: 'Too many invalid attempts. Please log in again.',
      });
      return;
    }

    const user = challenge.user;
    if (!user.isActive || !user.email2faEnabled) {
      await prisma.twoFactorCode.delete({ where: { id: challenge.id } });
      res.status(403).json({
        success: false,
        error: 'Account is not eligible for two-factor verification.',
      });
      return;
    }

    if (hashOtp(normalizedCode) !== challenge.codeHash) {
      await prisma.twoFactorCode.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      await createAuditLog({
        userId: user.id,
        userName: user.username,
        action: AuditAction.TWO_FACTOR_FAILURE,
        details: 'Invalid 2FA verification code provided',
        ipAddress: req.ip,
      });
      const remaining = TWO_FA_MAX_ATTEMPTS - challenge.attempts - 1;
      res.status(401).json({
        success: false,
        error: remaining > 0
          ? `Invalid verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Invalid verification code. Please log in again.',
      });
      return;
    }

    await prisma.twoFactorCode.delete({ where: { id: challenge.id } });

    const accessToken = await issueSessionTokens(user, req, res);

    await createAuditLog({
      userId: user.id,
      userName: user.username,
      action: AuditAction.TWO_FACTOR_SUCCESS,
      details: '2FA verification successful — user logged in',
      ipAddress: req.ip,
    });

    await createAuditLog({
      userId: user.id,
      userName: user.username,
      action: AuditAction.LOGIN,
      details: 'User logged in successfully (with 2FA)',
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: {
        user: toUserDto(user),
        accessToken,
      },
    });
  } catch (error) {
    console.error('verifyTwoFactor error:', error);
    res.status(500).json({ success: false, error: 'Verification failed due to server error' });
  }
}

export async function resendTwoFactor(req: Request, res: Response): Promise<void> {
  try {
    const { challengeToken } = req.body as { challengeToken?: string };

    if (!challengeToken) {
      res.status(400).json({ success: false, error: 'Challenge token is required' });
      return;
    }

    const existing = await prisma.twoFactorCode.findUnique({
      where: { challengeToken: String(challengeToken) },
      include: { user: true },
    });

    if (!existing || !existing.user.isActive || !existing.user.email2faEnabled) {
      res.status(401).json({ success: false, error: 'Invalid or expired verification session. Please log in again.' });
      return;
    }

    // Rate-limit resends: require at least 30s since last code was created
    const ageMs = Date.now() - existing.createdAt.getTime();
    if (ageMs < 30_000) {
      res.status(429).json({
        success: false,
        error: `Please wait ${Math.ceil((30_000 - ageMs) / 1000)} seconds before requesting a new code.`,
      });
      return;
    }

    try {
      const challenge = await createAndSendTwoFactorChallenge(existing.user, req);
      res.json({
        success: true,
        message: 'A new verification code has been sent',
        data: {
          requires2FA: true,
          challengeToken: challenge.challengeToken,
          emailHint: challenge.emailHint,
          expiresInSeconds: challenge.expiresInSeconds,
        },
      });
    } catch (err) {
      console.error('resendTwoFactor send error:', err);
      const message = err instanceof Error ? err.message : 'Failed to resend verification code';
      res.status(503).json({ success: false, error: message });
    }
  } catch (error) {
    console.error('resendTwoFactor error:', error);
    res.status(500).json({ success: false, error: 'Failed to resend verification code' });
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
        email2faEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
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

    res.json({
      success: true,
      data: toUserDto(user),
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
      await prisma.refreshToken.deleteMany({ where: { userId: payload.userId } });
      res.clearCookie('refreshToken');
      res.status(401).json({
        success: false,
        error: 'Account is disabled. Please contact an administrator.',
        code: 'ACCOUNT_DISABLED',
      });
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

