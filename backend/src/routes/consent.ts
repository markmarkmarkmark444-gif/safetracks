import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import { deriveConsentArtifact, hashIp } from '../services/hashService';
import type { ConsentRequest, ConsentResponse } from '../types/index';

const router = Router();

/**
 * POST /consent
 *
 * Consent is a cryptographic primitive here, not just a checkbox.
 * The consent_artifact is a hash that seeds all downstream operations.
 * No consent = no data collection. This is enforced at every downstream endpoint.
 *
 * HIPAA note: The consent record stores NO identifying information.
 * consent_artifact = SHA-256(session_id || consent_version || timestamp)
 */
router.post('/', (req: Request, res: Response) => {
  const { session_id, consent_given, consent_version } = req.body as ConsentRequest;

  if (!session_id || consent_given === undefined || !consent_version) {
    return res.status(400).json({ error: 'session_id, consent_given, and consent_version are required' });
  }

  // Refused consent: acknowledge and stop — no data is collected
  if (!consent_given) {
    return res.status(200).json({
      message: 'Consent declined. No data has been collected. Thank you.',
      consent_given: false,
    });
  }

  const db = getDb();

  // Verify the session exists and is active
  const session = db.prepare(
    "SELECT id, status FROM sessions WHERE id = ? AND status = 'active'"
  ).get(session_id);

  if (!session) {
    return res.status(404).json({ error: 'Active session not found' });
  }

  // Check for existing consent on this session (idempotency)
  const existing = db.prepare(
    'SELECT id, consent_artifact FROM consent_events WHERE session_id = ?'
  ).get(session_id) as { id: string; consent_artifact: string } | undefined;

  if (existing) {
    return res.status(200).json({
      consent_id: existing.id,
      consent_artifact: existing.consent_artifact,
      message: 'Consent already recorded for this session',
    });
  }

  const consent_id = uuidv4();
  const consent_timestamp = new Date().toISOString();
  const ip_hash = hashIp(req.ip ?? req.socket.remoteAddress ?? 'unknown');

  // Derive the cryptographic consent artifact — this is what gets anchored
  const consent_artifact = deriveConsentArtifact(session_id, consent_version, consent_timestamp);

  db.prepare(`
    INSERT INTO consent_events
      (id, session_id, consent_version, consent_given, consent_timestamp, consent_artifact, ip_hash)
    VALUES (?, ?, ?, 1, ?, ?, ?)
  `).run(consent_id, session_id, consent_version, consent_timestamp, consent_artifact, ip_hash);

  const response: ConsentResponse = {
    consent_id,
    consent_artifact,
    message: 'Consent recorded. Your cryptographic consent artifact has been generated.',
  };

  return res.status(201).json(response);
});

// GET /consent/:session_id — verify consent exists before allowing survey submission
router.get('/:session_id', (req: Request, res: Response) => {
  const { session_id } = req.params;
  const db = getDb();

  const consent = db.prepare(`
    SELECT id, consent_version, consent_given, consent_timestamp, consent_artifact
    FROM consent_events WHERE session_id = ?
  `).get(session_id) as Record<string, unknown> | undefined;

  if (!consent || !consent['consent_given']) {
    return res.status(404).json({ error: 'Valid consent not found for this session' });
  }

  return res.json(consent);
});

export default router;
