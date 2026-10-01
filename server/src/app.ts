import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import authRoutes from './modules/auth/auth.routes.js';
import customerRoutes from './modules/customer/customer.routes.js';
import productRoutes from './modules/product/product.routes.js';
import orderRoutes from './modules/order/order.routes.js';
import messRoutes from './modules/mess/mess.routes.js';
import dietRoutes from './modules/diet/diet.routes.js';
import kdsRoutes from './modules/kds/kds.routes.js';
import procurementRoutes from './modules/procurement/procurement.routes.js';
import deliveryRoutes from './modules/delivery/delivery.routes.js';
import posRoutes from './modules/pos/pos.routes.js';
import fmcgRoutes from './modules/fmcg/fmcg.routes.js';
import tepacheRoutes from './modules/tepache/tepache.routes.js';
import mdRoutes from './modules/md/md.routes.js';
import hrmRoutes from './modules/hrm/hrm.routes.js';
import financeRoutes from './modules/finance/finance.routes.js';
import cmsRoutes from './modules/cms/cms.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import { ApiResponse } from './utils/apiResponse.js';

const app: Application = express();

// Security & Utility Middlewares
app.use(helmet());
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Base Route Health Check
app.get('/api/v1/health', (_req, res) => {
  return ApiResponse.success(res, { status: 'healthy', timestamp: new Date().toISOString() }, 'Protein Bowl Enterprise Platform API Online');
});

// API Domain Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/mess', messRoutes);
app.use('/api/v1/diets', dietRoutes);
app.use('/api/v1/kds', kdsRoutes);
app.use('/api/v1/procurement', procurementRoutes);
app.use('/api/v1/delivery', deliveryRoutes);
app.use('/api/v1/pos', posRoutes);
app.use('/api/v1/fmcg', fmcgRoutes);
app.use('/api/v1/tepache', tepacheRoutes);
app.use('/api/v1/md', mdRoutes);
app.use('/api/v1/hrm', hrmRoutes);
app.use('/api/v1/finance', financeRoutes);
app.use('/api/v1/cms', cmsRoutes);

// Global Error Handler
app.use(errorHandler);

export default app;
