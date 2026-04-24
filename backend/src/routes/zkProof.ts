import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import { generateProof, verifyProof } from '../services/zkService';
import { deriveProofInputHash } from '../services/hashService';
import type { ZKProofRequest, ZKProofResponse, ZKProofInput } from '../types/index';

const router = Router();

/**
 * POST /zk-proof
 *
 * Generates a ZK proof binding the consent artifact, survey hash, and reward token.
 * The proof attests to participation without revealing any of the underlying data.
 *
 * Privacy guarantee:
 *   - consent_artifact, data_hash, reward_token are PRIVATE inputs
 *   - only proof_input_hash and timestamp_commitment are PUBLIC (go on-chain)
 *   - verifier can confirm participation happened without learning anything about it
 */
router.post('/', async (req: Request, res: Response) => {
  const { session_id, consent_id, survey_id, reward_id } = req.body as ZKProofRequest;

  if (!session_id || !consent_id || !survey_id || !reward_id) {
    return res.status(400).json({
      error: 'session_id, consent_id, survey_id, and reward_id are required',
    });
  }

  const db = getDb();

  // Fetch all required artifacts — fail fast if chain is broken
  const consent = db.prepare(`
    SELECT consent_artifact FROM consent_events
    WHERE id = ? AND session_id = ? AND consent_given = 1
  `).get(consent_id, session_id) as { consent_artifact: string } | undefined;

  if (!consent) {
    return res.status(403).json({ error: 'Valid consent not found' });
  }

  const survey = db.prepare(`
    SELECT data_hash FROM surveys WHERE id = ? AND consent_id = ?
  `).get(survey_id, consent_id) as { data_hash: string } | undefined;

  if (!survey) {
    return res.status(404).json({ error: 'Survey not found' });
  }

  const reward = db.prepare(`
    SELECT reward_token FROM rewards WHERE id = ? AND consent_id = ?
  `).get(reward_id, consent_id) as { reward_token: string } | undefined;

  if (!reward) {
    return res.status(404).json({ error: 'Reward not found' });
  }

  // Check for existing proof (idempotency)
  const existingProof = db.prepare(
    'SELECT id, proof_input_hash, public_signals, is_valid, circuit_version FROM zk_proofs WHERE session_id = ? AND consent_id = ?'
  ).get(session_id, consent_id) as {
    id: string; proof_input_hash: string; public_signals: string; is_valid: number; circuit_version: string;
  } | undefined;

  if (existingProof) {
    return res.status(200).json({
      proof_id: existingProof.id,
      proof_input_hash: existingProof.proof_input_hash,
      public_signals: JSON.parse(existingProof.public_signals) as string[],
      is_valid: existingProof.is_valid === 1,
      circuit_version: existingProof.circuit_version,
      message: 'Proof already generated for this session',
    });
  }

  const timestamp = new Date().toISOString();

  const input: ZKProofInput = {
    consent_artifact: consent.consent_artifact,
    data_hash: survey.data_hash,
    reward_token: reward.reward_token,
    timestamp,
  };

  try {
    const proofOutput = await generateProof(input);
    const proof_id = uuidv4();

    db.prepare(`
      INSERT INTO zk_proofs
        (id, session_id, consent_id, proof_input_hash, public_signals, proof_data, verification_key_hash, is_valid, circuit_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      proof_id,
      session_id,
      consent_id,
      proofOutput.proof_input_hash,
      JSON.stringify(proofOutput.public_signals),
      proofOutput.proof_data,
      proofOutput.verification_key_hash,
      proofOutput.is_valid ? 1 : 0,
      proofOutput.circuit_version
    );

    const response: ZKProofResponse = {
      proof_id,
      proof_input_hash: proofOutput.proof_input_hash,
      public_signals: proofOutput.public_signals,
      is_valid: proofOutput.is_valid,
      circuit_version: proofOutput.circuit_version,
    };

    return res.status(201).json(response);
  } catch (err) {
    console.error('[ZKProof] Generation failed:', err);
    return res.status(500).json({ error: 'Proof generation failed' });
  }
});

// POST /zk-proof/verify — standalone proof verification endpoint
router.post('/verify', async (req: Request, res: Response) => {
  const { proof_data, public_signals, verification_key_hash } = req.body as {
    proof_data: string;
    public_signals: string[];
    verification_key_hash: string;
  };

  if (!proof_data || !public_signals || !verification_key_hash) {
    return res.status(400).json({ error: 'proof_data, public_signals, and verification_key_hash are required' });
  }

  try {
    const is_valid = await verifyProof(proof_data, public_signals, verification_key_hash);
    return res.json({ is_valid });
  } catch {
    return res.status(400).json({ error: 'Invalid proof format' });
  }
});

export default router;
