import 'dotenv/config';
import 'express-async-errors';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { jobsRouter } from './routes/jobs';
import { uploadsRouter } from './routes/uploads';
import { moistureRouter } from './routes/moisture';
import { equipmentRouter } from './routes/equipment';
import { reportsRouter } from './routes/reports';
import { auditRouter } from './routes/audit';
import { qrRouter } from './routes/qr';
import { errorHandler } from './middleware/error';
import { logger } from './utils/logger';

const app = express();
const PORT = process.env['PORT'] ?? 4000;

// ─── Security middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env['CORS_ORIGINS']?.split(',') ?? ['http://localhost:3000'],
  credentials: true,
}));

// ─── Rate limiting ────────────────────────────────────────────────────────────
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));

// Stricter limits on upload endpoints
app.use('/api/uploads', rateLimit({
  windowMs: 60 * 1000,
  max: 30,
}));

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/jobs', jobsRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/moisture', moistureRouter);
app.use('/api/equipment', equipmentRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/qr', qrRouter);

// ─── Error handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`SafeTracks API listening on port ${PORT}`);
  logger.info(`Network: ${process.env['HEDERA_NETWORK'] ?? 'testnet'}`);
});

export { app };
