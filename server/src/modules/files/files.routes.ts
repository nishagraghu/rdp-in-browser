import { Router } from 'express';
import { authenticateJWT } from '../../middleware/auth';
import { upload, uploadFile, listFiles, downloadFile } from './files.controller';
import { AuthenticatedRequest } from '../../middleware/auth';

const router = Router();

router.use(authenticateJWT);

router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next();
  });
}, (req, res) => uploadFile(req as AuthenticatedRequest, res));

router.get('/', listFiles);
// Nested paths: /files/download?path=Download/report.pdf
router.get('/download', downloadFile);
router.get('/download/:filename', downloadFile);


export default router;
