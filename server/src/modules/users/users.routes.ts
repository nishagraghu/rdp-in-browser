import { Router } from 'express';
import { getUsers, getUserById, createUser, updateUser, deleteUser } from './users.controller';
import { authenticateJWT, requirePermission, requireRole } from '../../middleware/auth';
import { Permission, UserRole } from '../../shared';

const router = Router();

router.use(authenticateJWT);

router.get('/', requirePermission(Permission.USER_READ), getUsers);
router.get('/:id', requirePermission(Permission.USER_READ), getUserById);
// New accounts may only be created by administrators — no public self-signup
router.post('/', requireRole(UserRole.ADMIN), requirePermission(Permission.USER_CREATE), createUser);
router.put('/:id', requirePermission(Permission.USER_UPDATE), updateUser);
router.delete('/:id', requireRole(UserRole.ADMIN), requirePermission(Permission.USER_DELETE), deleteUser);

export default router;
