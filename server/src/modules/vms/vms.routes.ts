import { Router } from 'express';
import { getVms, getVmById, createVm, updateVm, deleteVm, testVmConnection } from './vms.controller';
import { authenticateJWT, requirePermission } from '../../middleware/auth';
import { Permission } from '../../../../shared/src/index';

const router = Router();

router.use(authenticateJWT);

router.get('/', requirePermission(Permission.VM_VIEW), getVms);
router.get('/:id', requirePermission(Permission.VM_VIEW), getVmById);
router.post('/', requirePermission(Permission.VM_CREATE), createVm);
router.put('/:id', requirePermission(Permission.VM_UPDATE), updateVm);
router.delete('/:id', requirePermission(Permission.VM_DELETE), deleteVm);
router.post('/:id/test-connection', requirePermission(Permission.VM_UPDATE), testVmConnection);

export default router;
