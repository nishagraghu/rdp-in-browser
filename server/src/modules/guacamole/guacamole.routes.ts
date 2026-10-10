import { Router } from 'express';
import { connectVmSession, listVmSessions } from './guacamole.controller';
import { authenticateJWT, requirePermission } from '../../middleware/auth';
import { Permission } from '../../shared';

const router = Router();

router.post('/vms/:id/connect', authenticateJWT, requirePermission(Permission.VM_CONNECT), connectVmSession);
router.get('/vms/:id/sessions', authenticateJWT, requirePermission(Permission.VM_CONNECT), listVmSessions);

export default router;

