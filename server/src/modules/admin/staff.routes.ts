import { Router } from 'express';
import { authenticateToken, requireStaffIdentity } from '../../middleware/auth.middleware.js';
import { AdminController as C } from './admin.controller.js';

/** Staff self-service (mounted at /api/v1/staff). Staff identities only: customers are rejected. */
const router = Router();
router.use(authenticateToken, requireStaffIdentity);

router.get('/me', C.staffMe);
router.get('/permissions', C.permissionCatalogue);

export default router;
