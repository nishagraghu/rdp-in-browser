import { Router } from 'express';
import { getVmUsers, assignUserToVm, removeUserFromVm, bulkUpdateVmAssignments, getUserVms } from './assignments.controller';
import { authenticateJWT, requirePermission } from '../../middleware/auth';
import { Permission } from '../../../../shared/src/index';

const router = Router();

router.use(authenticateJWT);

router.get('/vms/:id/users', requirePermission(Permission.VM_VIEW), getVmUsers);
router.post('/vms/:id/users/:userId', requirePermission(Permission.VM_ASSIGN_USER), assignUserToVm);
router.delete('/vms/:id/users/:userId', requirePermission(Permission.VM_ASSIGN_USER), removeUserFromVm);
router.put('/vms/:id/users', requirePermission(Permission.VM_ASSIGN_USER), bulkUpdateVmAssignments);
router.get('/users/:userId/vms', requirePermission(Permission.VM_VIEW), getUserVms);

export default router;
