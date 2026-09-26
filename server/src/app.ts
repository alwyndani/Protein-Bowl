import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import authRoutes from './modules/auth/auth.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import { ApiResponse } from './utils/apiResponse.js';

const app: Application = express();

// Security & Utility Middlewares
app.use(helmet());
app.use(cors({
  origin: env.CLIENT_URL,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Base Route Health Check
app.get('/api/v1/health', (_req, res) => {
  return ApiResponse.success(res, { status: 'healthy', timestamp: new Date().toISOString() }, 'Protein Bowl API Service Online');
});

// API Routes
app.use('/api/v1/auth', authRoutes);

// Global Error Handler
app.use(errorHandler);

export default app;
