import { Router } from 'express';
import { CMSController } from './cms.controller.js';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware.js';
import { RoleEnum } from '@prisma/client';

const router = Router();

router.get('/banners', CMSController.getBanners);
router.get('/media', CMSController.getMedia);
router.post('/banners', authenticateToken, requireRole([RoleEnum.SUPER_ADMIN, RoleEnum.MD]), CMSController.createBanner);

export default router;
