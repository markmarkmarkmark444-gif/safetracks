import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import type { SubmitSuppliesRequest, SubmitSuppliesResponse } from '../types/index';

const router = Router();

// Available kits — mirrors the Spur Wink form exactly
export const AVAILABLE_ITEMS = [
  'NARCAN',
  'BASIC FIRST AID KIT',
  'WOUND CARE KIT',
  'SAFER USE SUPPLIES',
  'BASIC HYGIENE KIT',
  'SAFE SEX SUPPLIES',
] as const;

// Available services — mirrors the Spur Wink form exactly
export const AVAILABLE_SERVICES = [
  'Substance Use Counseling',
  'Food Assistance',
  'Housing Assistance',
  'Peer Support',
  'Health Insurance',
  'Overdose Aftercare',
  'General Assistance',
  'Case Management',
  'Education Support',
  'Legal Assistance',
  'Narcan Education',
  'Transportation',
  'Financial Education',
  'Intimate Partner Violence',
  'Recovery Services',
  'Daycare / Child Support',
  'Dental',
] as const;

/**
 * POST /supplies
 *
 * Records what kits and services a participant requests during their exchange visit.
 * Unlike survey answers, supply requests are stored as readable JSON (not hashed)
 * so harm reduction staff can see and fulfill them in real-time.
 *
 * Privacy model: linked to consent_id only — no PII, no user identity.
 *
 * Consent gate: same pattern as /survey.
 */
router.post('/', (req: Request, res: Response) => {
  const { session_id, consent_id, items, services } = req.body as SubmitSuppliesRequest;

  if (!session_id || !consent_id) {
    return res.status(400).json({ error: 'session_id and consent_id are required' });
  }

  // items and services are optional arrays — empty arrays are valid (participant skipped)
  const safeItems = Array.isArray(items) ? items : [];
  const safeServices = Array.isArray(services) ? services : [];

  // Whitelist validation — only accept known kit/service names
  const validItems = safeItems.filter(i =>
    (AVAILABLE_ITEMS as readonly string[]).includes(i)
  );
  const validServices = safeServices.filter(s =>
    (AVAILABLE_SERVICES as readonly string[]).includes(s)
  );

  const db = getDb();

  // CONSENT GATE
  const consent = db.prepare(`
    SELECT id FROM consent_events
    WHERE id = ? AND session_id = ? AND consent_given = 1
  `).get(consent_id, session_id);

  if (!consent) {
    return res.status(403).json({
      error: 'No valid consent found. Consent is required before recording supply requests.',
    });
  }

  // Idempotency: one supply record per session
  const existing = db.prepare(
    'SELECT id FROM supply_requests WHERE session_id = ? AND consent_id = ?'
  ).get(session_id, consent_id) as { id: string } | undefined;

  if (existing) {
    return res.status(200).json({
      supply_id: existing.id,
      message: 'Supply request already recorded for this session',
    });
  }

  const supply_id = uuidv4();

  db.prepare(`
    INSERT INTO supply_requests (id, session_id, consent_id, items_json, services_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(supply_id, session_id, consent_id, JSON.stringify(validItems), JSON.stringify(validServices));

  const response: SubmitSuppliesResponse = {
    supply_id,
    message: `Supply request recorded. Items: ${validItems.length}, Services: ${validServices.length}.`,
  };

  return res.status(201).json(response);
});

/**
 * GET /supplies/:session_id
 *
 * Staff-facing endpoint: look up what a participant requested during their session.
 * Used by harm reduction workers to prepare kits before the participant leaves.
 */
router.get('/:session_id', (req: Request, res: Response) => {
  const { session_id } = req.params;
  const db = getDb();

  const record = db.prepare(`
    SELECT id, consent_id, items_json, services_json, submitted_at
    FROM supply_requests WHERE session_id = ?
    ORDER BY submitted_at DESC LIMIT 1
  `).get(session_id) as {
    id: string;
    consent_id: string;
    items_json: string;
    services_json: string;
    submitted_at: string;
  } | undefined;

  if (!record) {
    return res.status(404).json({ error: 'No supply request found for this session' });
  }

  return res.json({
    supply_id: record.id,
    session_id,
    consent_id: record.consent_id,
    items: JSON.parse(record.items_json) as string[],
    services: JSON.parse(record.services_json) as string[],
    submitted_at: record.submitted_at,
  });
});

// GET /supplies/options — return available kits and services for the frontend
router.get('/options', (_req: Request, res: Response) => {
  return res.json({
    items: AVAILABLE_ITEMS,
    services: AVAILABLE_SERVICES,
  });
});

export default router;
