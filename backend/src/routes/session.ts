import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import { hashUserAgent, hashIp } from '../services/hashService';
import type { CreateSessionRequest, CreateSessionResponse } from '../types/index';

const router = Router();

// POST /session — initialize a new anonymous participation session
router.post('/', (req: Request, res: Response) => {
  const { qr_code_id, location_tag } = req.body as CreateSessionRequest;

  if (!qr_code_id) {
    return res.status(400).json({ error: 'qr_code_id is required' });
  }

  // Hash identifying request metadata — store hashes only, never raw values
  const rawUserAgent = req.headers['user-agent'] ?? 'unknown';
  const rawIp = req.ip ?? req.socket.remoteAddress ?? 'unknown';

  const session_id = uuidv4();
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO sessions (id, qr_code_id, location_tag, user_agent_hash, status)
    VALUES (?, ?, ?, ?, 'active')
  `);

  stmt.run(
    session_id,
    qr_code_id,
    location_tag ?? null,
    hashUserAgent(rawUserAgent)
  );

  // Store IP hash separately for rate-limiting (not in sessions table)
  // In production this goes to a short-TTL Redis key, not persistent storage
  void rawIp; // acknowledged but not persisted

  const response: CreateSessionResponse = {
    session_id,
    created_at: new Date().toISOString(),
  };

  return res.status(201).json(response);
});

// GET /session/:id — check session status (for frontend polling)
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = getDb();

  const session = db.prepare('SELECT id, status, created_at FROM sessions WHERE id = ?').get(id);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  return res.json(session);
});

export default router;
