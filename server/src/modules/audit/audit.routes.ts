import { Router } from 'express';
import { getAuditLogs } from './audit.controller';
import { authenticateJWT, requireRole } from '../../middleware/auth';
import { UserRole } from '../../../../shared/src/index';

const router = Router();

router.get('/', authenticateJWT, requireRole(UserRole.ADMIN), getAuditLogs);

export default router;
