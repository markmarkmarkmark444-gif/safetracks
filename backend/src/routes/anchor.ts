import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import { anchor } from '../services/hederaService';
import type { AnchorRequest, AnchorResponse } from '../types/index';

const router = Router();

/**
 * POST /anchor
 *
 * Anchors a ZK proof hash to Hedera Consensus Service (HCS).
 * What goes on-chain:
 *   - proof_input_hash (a SHA-256 hash — no sensitive data)
 *   - public_signals (also hashes — no sensitive data)
 *   - circuit_version, session_id (for auditability)
 *
 * What NEVER goes on-chain:
 *   - consent_artifact (private ZK input)
 *   - survey answers or data_hash (private ZK input)
 *   - reward_token (private ZK input)
 *   - any PII or PHI
 *
 * Returns the Hedera transaction ID and consensus timestamp — tamper-evident proof
 * that the participation event was registered at a specific point in time.
 */
router.post('/', async (req: Request, res: Response) => {
  const { session_id, zk_proof_id } = req.body as AnchorRequest;

  if (!session_id || !zk_proof_id) {
    return res.status(400).json({ error: 'session_id and zk_proof_id are required' });
  }

  const db = getDb();

  // Verify the proof exists and is valid
  const proof = db.prepare(`
    SELECT id, proof_input_hash, public_signals, circuit_version, is_valid
    FROM zk_proofs WHERE id = ? AND session_id = ?
  `).get(zk_proof_id, session_id) as {
    id: string;
    proof_input_hash: string;
    public_signals: string;
    circuit_version: string;
    is_valid: number;
  } | undefined;

  if (!proof) {
    return res.status(404).json({ error: 'ZK proof not found' });
  }

  if (proof.is_valid !== 1) {
    return res.status(400).json({ error: 'Cannot anchor an invalid proof' });
  }

  // Idempotency: check if already anchored
  const existingAnchor = db.prepare(
    'SELECT id, hedera_transaction_id, consensus_timestamp, anchored_hash FROM anchor_logs WHERE zk_proof_id = ?'
  ).get(zk_proof_id) as {
    id: string;
    hedera_transaction_id: string;
    consensus_timestamp: string;
    anchored_hash: string;
  } | undefined;

  if (existingAnchor) {
    return res.status(200).json({
      anchor_id: existingAnchor.id,
      hedera_transaction_id: existingAnchor.hedera_transaction_id,
      consensus_timestamp: existingAnchor.consensus_timestamp,
      anchored_hash: existingAnchor.anchored_hash,
      message: 'Already anchored',
    });
  }

  const publicSignals = JSON.parse(proof.public_signals) as string[];

  try {
    const result = await anchor(
      proof.proof_input_hash,
      publicSignals,
      proof.circuit_version,
      session_id
    );

    const anchor_id = uuidv4();
    const topicId = result.hedera_topic_id;

    db.prepare(`
      INSERT INTO anchor_logs
        (id, session_id, zk_proof_id, anchored_hash, hedera_topic_id, hedera_transaction_id, consensus_timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      anchor_id,
      session_id,
      zk_proof_id,
      proof.proof_input_hash,
      topicId,
      result.hedera_transaction_id,
      result.consensus_timestamp
    );

    // Update billing events with anchor reference
    db.prepare(`
      UPDATE billing_events SET anchor_log_id = ? WHERE session_id = ? AND anchor_log_id IS NULL
    `).run(anchor_id, session_id);

    const response: AnchorResponse = {
      anchor_id,
      hedera_transaction_id: result.hedera_transaction_id,
      consensus_timestamp: result.consensus_timestamp,
      anchored_hash: proof.proof_input_hash,
    };

    return res.status(201).json(response);
  } catch (err) {
    console.error('[Anchor] Failed:', err);
    return res.status(500).json({
      error: 'Anchoring failed',
      detail: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

// GET /anchor/:session_id — look up anchor status for a session
router.get('/:session_id', (req: Request, res: Response) => {
  const { session_id } = req.params;
  const db = getDb();

  const log = db.prepare(`
    SELECT al.id, al.anchored_hash, al.hedera_topic_id, al.hedera_transaction_id,
           al.consensus_timestamp, al.anchored_at, zp.circuit_version
    FROM anchor_logs al
    JOIN zk_proofs zp ON al.zk_proof_id = zp.id
    WHERE al.session_id = ?
    ORDER BY al.anchored_at DESC
    LIMIT 1
  `).get(session_id);

  if (!log) {
    return res.status(404).json({ error: 'No anchor found for this session' });
  }

  return res.json(log);
});

export default router;
