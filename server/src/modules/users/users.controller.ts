import { Response } from 'express';
import { prisma } from '../../db/prisma';
import { hashPassword } from '../../utils/password';
import { createAuditLog } from '../../utils/auditLogger';
import { AuthenticatedRequest } from '../../middleware/auth';
import { UserRole, AuditAction, validateEmail, validateUsername, validatePassword } from '../../../../shared/src/index';

export async function getUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;

    const whereClause: Record<string, unknown> = {};

    if (search) {
      whereClause.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { username: { contains: search } },
      ];
    }

    if (role && Object.values(UserRole).includes(role as UserRole)) {
      whereClause.role = role;
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { assignments: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = users.map(u => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    }));

    res.json({ success: true, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
}

export async function getUserById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        assignments: {
          include: {
            vm: {
              select: {
                id: true,
                name: true,
                hostname: true,
                protocol: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.json({
      success: true,
      data: {
        ...user,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        assignedVms: user.assignments.map(a => a.vm),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch user details' });
  }
}

export async function createUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { name, email, username, password, role } = req.body;

    if (!name || !email || !username || !password) {
      res.status(400).json({ success: false, error: 'Name, email, username, and password are required' });
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

    const assignedRole = role === UserRole.ADMIN ? UserRole.ADMIN : UserRole.USER;

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username: username.toLowerCase().trim() },
          { email: email.toLowerCase().trim() },
        ],
      },
    });

    if (existingUser) {
      res.status(400).json({ success: false, error: 'A user with that username or email already exists' });
      return;
    }

    const passwordHash = await hashPassword(password);

    const newUser = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        username: username.toLowerCase().trim(),
        passwordHash,
        role: assignedRole,
        isActive: true,
      },
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

    await createAuditLog({
      userId: req.user?.userId,
      userName: req.user?.username,
      action: AuditAction.USER_CREATE,
      details: `Created user ${newUser.username} (${newUser.role})`,
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: {
        ...newUser,
        createdAt: newUser.createdAt.toISOString(),
        updatedAt: newUser.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ success: false, error: 'Failed to create user' });
  }
}

export async function updateUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { name, email, role, isActive, password } = req.body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const updateData: Record<string, unknown> = {};

    if (name) updateData.name = String(name).trim();
    if (email) {
      if (!validateEmail(email)) {
        res.status(400).json({ success: false, error: 'Invalid email format' });
        return;
      }
      updateData.email = String(email).toLowerCase().trim();
    }
    if (role && Object.values(UserRole).includes(role as UserRole)) {
      updateData.role = role;
    }
    if (typeof isActive === 'boolean') {
      updateData.isActive = isActive;
    }
    if (password) {
      if (!validatePassword(password)) {
        res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
        return;
      }
      updateData.passwordHash = await hashPassword(password);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
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

    await createAuditLog({
      userId: req.user?.userId,
      userName: req.user?.username,
      action: AuditAction.USER_UPDATE,
      details: `Updated user profile for ${updated.username}`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update user' });
  }
}

export async function deleteUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    if (req.user?.userId === id) {
      res.status(400).json({ success: false, error: 'You cannot delete or deactivate your own account' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    await prisma.user.delete({ where: { id } });

    await createAuditLog({
      userId: req.user?.userId,
      userName: req.user?.username,
      action: AuditAction.USER_DELETE,
      details: `Deleted user ${user.username}`,
      ipAddress: req.ip,
    });

    res.json({ success: true, message: `User ${user.username} deleted successfully` });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete user' });
  }
}
