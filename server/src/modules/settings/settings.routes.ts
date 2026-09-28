import { Router, Request, Response, NextFunction } from 'express';
import {
  deleteCustomerLogo,
  getLogoSettings,
  getSmtpSettings,
  logoUpload,
  testSmtpSettings,
  updateSmtpSettings,
  uploadCustomerLogo,
} from './settings.controller';
import { authenticateJWT, requireRole } from '../../middleware/auth';
import { UserRole } from '../../shared';

const router = Router();

router.get('/logo', getLogoSettings);

router.post(
  '/logo',
  authenticateJWT,
  requireRole(UserRole.ADMIN),
  (req: Request, res: Response, next: NextFunction) => {
    logoUpload.single('logo')(req, res, (err: unknown) => {
      if (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        res.status(400).json({ success: false, error: message });
        return;
      }
      next();
    });
  },
  uploadCustomerLogo,
);

router.delete('/logo', authenticateJWT, requireRole(UserRole.ADMIN), deleteCustomerLogo);

router.get('/smtp', authenticateJWT, requireRole(UserRole.ADMIN), getSmtpSettings);
router.put('/smtp', authenticateJWT, requireRole(UserRole.ADMIN), updateSmtpSettings);
router.post('/smtp/test', authenticateJWT, requireRole(UserRole.ADMIN), testSmtpSettings);

export default router;
