import { Router } from 'express';
import { authenticateJWT, requirePermission } from '../../middleware/auth';
import { Permission } from '../../shared';
import { listActiveSessions, terminateSession } from './sessions.controller';

const router = Router();

router.use(authenticateJWT);

router.get('/', requirePermission(Permission.SESSION_VIEW), listActiveSessions);
router.post('/:sessionId/logout', requirePermission(Permission.SESSION_TERMINATE), terminateSession);

export default router;
