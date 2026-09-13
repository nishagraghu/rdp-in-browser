import { Router } from 'express';
import { getUsers, getUserById, createUser, updateUser, deleteUser } from './users.controller';
import { authenticateJWT, requirePermission } from '../../middleware/auth';
import { Permission } from '../../../../shared/src/index';

const router = Router();

router.use(authenticateJWT);

router.get('/', requirePermission(Permission.USER_READ), getUsers);
router.get('/:id', requirePermission(Permission.USER_READ), getUserById);
router.post('/', requirePermission(Permission.USER_CREATE), createUser);
router.put('/:id', requirePermission(Permission.USER_UPDATE), updateUser);
router.delete('/:id', requirePermission(Permission.USER_DELETE), deleteUser);

export default router;
