import { Router } from 'express';
import { getSetupStatus, initialSetup, login, logout, getMe, refresh } from './auth.controller';
import { authenticateJWT } from '../../middleware/auth';
import { authRateLimiter } from '../../middleware/rateLimiter';

const router = Router();

router.get('/setup-status', getSetupStatus);
router.post('/setup', initialSetup);
router.post('/login', authRateLimiter, login);
router.post('/logout', authenticateJWT, logout);
router.get('/me', authenticateJWT, getMe);
router.post('/refresh', refresh);

export default router;
