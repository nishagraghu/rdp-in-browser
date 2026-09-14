import { Router } from 'express';
import { connectVmSession } from './guacamole.controller';
import { authenticateJWT, requirePermission } from '../../middleware/auth';
import { Permission } from '../../shared';

const router = Router();

router.post('/vms/:id/connect', authenticateJWT, requirePermission(Permission.VM_CONNECT), connectVmSession);

export default router;

