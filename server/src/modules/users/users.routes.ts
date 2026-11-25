import { Router } from 'express';
import { getUsers, getUserById, createUser, updateUser, deleteUser } from './users.controller';
import { authenticateJWT, requirePermission, requireRole, AuthenticatedRequest } from '../../middleware/auth';
import { Permission, UserRole } from '../../shared';

const router = Router();

router.use(authenticateJWT);

router.get('/', requirePermission(Permission.USER_READ), getUsers);
router.get('/:id', (req: AuthenticatedRequest, res, next) => {
  if (req.user?.userId === req.params.id) {
    return next();
  }
  return requirePermission(Permission.USER_READ)(req, res, next);
}, getUserById);
// New accounts may only be created by administrators — no public self-signup
router.post('/', requireRole(UserRole.ADMIN), requirePermission(Permission.USER_CREATE), createUser);
router.put('/:id', (req: AuthenticatedRequest, res, next) => {
  // Allow any authenticated user to update their own profile and reset password,
  // or require USER_UPDATE permission when modifying other accounts.
  if (req.user?.userId === req.params.id) {
    return next();
  }
  return requirePermission(Permission.USER_UPDATE)(req, res, next);
}, updateUser);
router.delete('/:id', requireRole(UserRole.ADMIN), requirePermission(Permission.USER_DELETE), deleteUser);

export default router;
