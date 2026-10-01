import { Router } from 'express';
import { ProductController } from './product.controller.js';

const router = Router();

router.get('/categories', ProductController.getCategories);
router.get('/', ProductController.getProducts);
router.get('/:slug', ProductController.getProductBySlug);

export default router;
