import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import authRoutes from './modules/auth/auth.routes.js';
import customerRoutes from './modules/customer/customer.routes.js';
import productRoutes from './modules/product/product.routes.js';
import cartRoutes from './modules/cart/cart.routes.js';
import checkoutRoutes from './modules/checkout/checkout.routes.js';
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
import recipeRoutes from './modules/recipe/recipe.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import staffRoutes from './modules/admin/staff.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import { enforceAllowedOrigin, isAllowedOrigin } from './middleware/origin.middleware.js';
import { generalRateLimiter } from './middleware/rateLimiter.middleware.js';
import { ApiResponse } from './utils/apiResponse.js';

const app: Application = express();

// Security & Utility Middlewares
app.use(helmet());
if (env.TRUST_PROXY) {
  const trust = Number(env.TRUST_PROXY);
  app.set('trust proxy', Number.isNaN(trust) ? env.TRUST_PROXY : trust);
}

// CORS: only configured origins receive CORS headers (credentials included). Requests without an
// Origin header (native mobile, curl, server-to-server) are not browser cross-origin requests and pass.
// A disallowed origin gets no CORS headers (the browser blocks it) - never an error/500.
app.use(cors({
  origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
  credentials: true
}));
app.use(enforceAllowedOrigin);
app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: env.JSON_BODY_LIMIT }));
app.use(cookieParser());

// Base Route Health Check
app.get('/api/v1/health', (_req, res) => {
  return ApiResponse.success(res, { status: 'healthy', timestamp: new Date().toISOString() }, 'Protein Bowl Enterprise Platform API Online');
});

// General API rate limit (health check exempt); registered after /health
app.use('/api/v1', generalRateLimiter);

// API Domain Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/recipes', recipeRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/checkout', checkoutRoutes);
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
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/staff', staffRoutes);

// Global Error Handler
app.use(errorHandler);

export default app;
