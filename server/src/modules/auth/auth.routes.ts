import { Router } from 'express';
import {
  getSetupStatus,
  initialSetup,
  login,
  logout,
  getMe,
  refresh,
  verifyTwoFactor,
  resendTwoFactor,
} from './auth.controller';
import { authenticateJWT } from '../../middleware/auth';
import { authRateLimiter } from '../../middleware/rateLimiter';

const router = Router();

router.get('/setup-status', getSetupStatus);
router.post('/setup', initialSetup);
router.post('/login', authRateLimiter, login);
router.post('/verify-2fa', authRateLimiter, verifyTwoFactor);
router.post('/resend-2fa', authRateLimiter, resendTwoFactor);
router.post('/logout', authenticateJWT, logout);
router.get('/me', authenticateJWT, getMe);
router.post('/refresh', refresh);

export default router;
