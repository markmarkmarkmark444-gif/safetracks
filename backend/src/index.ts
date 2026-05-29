import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getDb } from './db/database';
import { hipaaLogger, stripPotentialPhi } from './middleware/hipaaLogger';
import sessionRouter from './routes/session';
import consentRouter from './routes/consent';
import surveyRouter from './routes/survey';
import rewardRouter from './routes/reward';
import zkProofRouter from './routes/zkProof';
import anchorRouter from './routes/anchor';
import suppliesRouter from './routes/supplies';
import { isHederaConfigured } from './services/hederaService';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

// --- Middleware ---
app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(hipaaLogger);
app.use(stripPotentialPhi);

// --- Routes ---
app.use('/session', sessionRouter);
app.use('/consent', consentRouter);
app.use('/survey', surveyRouter);
app.use('/reward', rewardRouter);
app.use('/zk-proof', zkProofRouter);
app.use('/anchor', anchorRouter);
app.use('/supplies', suppliesRouter);

// Health check (no auth required)
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'SafeTracks API',
    version: '1.0.0',
    hedera_configured: isHederaConfigured(),
    zk_mode: 'mock-groth16',
  });
});

// Survey questions (convenience endpoint mirrored from survey router)
app.get('/questions', (_req, res) => {
  res.redirect('/survey/questions');
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Start ---
// Initialize DB on startup
getDb();

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║        SafeTracks API Server           ║
╠════════════════════════════════════════╣
║  Port  : ${PORT}                           ║
║  Mode  : ${process.env.NODE_ENV ?? 'development'}                  ║
║  ZK    : mock-groth16 (Circom-ready)   ║
║  Chain : Hedera ${process.env.HEDERA_TOPIC_ID ? 'LIVE' : 'SIMULATED'}               ║
╚════════════════════════════════════════╝
  `);
});

export default app;
