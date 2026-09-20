import { Router } from 'express';
import { getVmUsers, assignUserToVm, removeUserFromVm, bulkUpdateVmAssignments, getUserVms } from './assignments.controller';
import { authenticateJWT, requirePermission } from '../../middleware/auth';
import { Permission } from '../../shared';

const router = Router();

// Auth per-route only — this router is also mounted at `/api`, so a blanket
// `router.use(authenticateJWT)` would 401 every unmatched public API path
// (e.g. GET /api/settings/logo for the login page).
router.get('/vms/:id/users', authenticateJWT, requirePermission(Permission.VM_VIEW), getVmUsers);
router.post('/vms/:id/users/:userId', authenticateJWT, requirePermission(Permission.VM_ASSIGN_USER), assignUserToVm);
router.delete('/vms/:id/users/:userId', authenticateJWT, requirePermission(Permission.VM_ASSIGN_USER), removeUserFromVm);
router.put('/vms/:id/users', authenticateJWT, requirePermission(Permission.VM_ASSIGN_USER), bulkUpdateVmAssignments);
router.get('/users/:userId/vms', authenticateJWT, requirePermission(Permission.VM_VIEW), getUserVms);

export default router;

