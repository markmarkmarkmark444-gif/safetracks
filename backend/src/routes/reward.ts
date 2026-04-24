import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import { calculateReward, rewardToCents } from '../services/rewardService';
import type { RewardRequest, RewardResponse } from '../types/index';

const router = Router();

/**
 * POST /reward
 *
 * Issues a variable reward after successful survey submission.
 * Reward is tied to consent_id (not user identity) for HIPAA compliance.
 * Billing event is created atomically with reward issuance.
 */
router.post('/', (req: Request, res: Response) => {
  const { session_id, consent_id, survey_id } = req.body as RewardRequest;

  if (!session_id || !consent_id || !survey_id) {
    return res.status(400).json({ error: 'session_id, consent_id, and survey_id are required' });
  }

  const db = getDb();

  // Validate consent + survey chain
  const consent = db.prepare(`
    SELECT id FROM consent_events WHERE id = ? AND session_id = ? AND consent_given = 1
  `).get(consent_id, session_id);

  if (!consent) {
    return res.status(403).json({ error: 'Valid consent not found' });
  }

  const survey = db.prepare(`
    SELECT id FROM surveys WHERE id = ? AND session_id = ? AND consent_id = ?
  `).get(survey_id, session_id, consent_id);

  if (!survey) {
    return res.status(404).json({ error: 'Survey not found or does not match consent' });
  }

  // Idempotency: don't issue duplicate rewards
  const existingReward = db.prepare(
    'SELECT id, total_amount, reward_token FROM rewards WHERE session_id = ? AND consent_id = ?'
  ).get(session_id, consent_id) as { id: string; total_amount: number; reward_token: string } | undefined;

  if (existingReward) {
    return res.status(200).json({
      reward_id: existingReward.id,
      total_amount: existingReward.total_amount,
      breakdown: { base: 0, bonus: 0, spike: 0 },
      reward_token: existingReward.reward_token,
      message: 'Reward already issued for this session',
    });
  }

  // Calculate variable reward
  const breakdown = calculateReward();
  const reward_id = uuidv4();
  const billing_period = new Date().toISOString().slice(0, 7); // YYYY-MM

  // Use a transaction to atomically create reward + billing event
  const insertRewardAndBilling = db.transaction(() => {
    db.prepare(`
      INSERT INTO rewards (id, session_id, consent_id, base_amount, bonus_amount, spike_bonus, total_amount, reward_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reward_id,
      session_id,
      consent_id,
      breakdown.base,
      breakdown.bonus,
      breakdown.spike,
      breakdown.total,
      breakdown.reward_token
    );

    // Base participation billing event
    db.prepare(`
      INSERT INTO billing_events (id, consent_id, session_id, event_type, amount_cents, billing_period)
      VALUES (?, ?, ?, 'participation', ?, ?)
    `).run(uuidv4(), consent_id, session_id, rewardToCents({ total_amount: breakdown.base }), billing_period);

    // Bonus billing event (if any bonus was awarded)
    if (breakdown.bonus > 0) {
      db.prepare(`
        INSERT INTO billing_events (id, consent_id, session_id, event_type, amount_cents, billing_period)
        VALUES (?, ?, ?, 'bonus', ?, ?)
      `).run(uuidv4(), consent_id, session_id, rewardToCents({ total_amount: breakdown.bonus }), billing_period);
    }

    // Spike billing event (if spike was triggered)
    if (breakdown.spike > 0) {
      db.prepare(`
        INSERT INTO billing_events (id, consent_id, session_id, event_type, amount_cents, billing_period)
        VALUES (?, ?, ?, 'spike', ?, ?)
      `).run(uuidv4(), consent_id, session_id, rewardToCents({ total_amount: breakdown.spike }), billing_period);
    }
  });

  insertRewardAndBilling();

  // Update session status
  db.prepare("UPDATE sessions SET status = 'completed' WHERE id = ?").run(session_id);

  const response: RewardResponse = {
    reward_id,
    total_amount: breakdown.total,
    breakdown: {
      base: breakdown.base,
      bonus: breakdown.bonus,
      spike: breakdown.spike,
    },
    reward_token: breakdown.reward_token,
  };

  return res.status(201).json(response);
});

// GET /reward/billing/:period — monthly accumulation summary (YYYY-MM)
router.get('/billing/:period', (req: Request, res: Response) => {
  const { period } = req.params;

  if (!/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: 'Period must be in YYYY-MM format' });
  }

  const db = getDb();

  const events = db.prepare(`
    SELECT event_type, SUM(amount_cents) as total_cents, COUNT(*) as event_count
    FROM billing_events
    WHERE billing_period = ?
    GROUP BY event_type
  `).all(period) as { event_type: string; total_cents: number; event_count: number }[];

  const grand_total_cents = events.reduce((sum, e) => sum + e.total_cents, 0);
  const grand_total_events = events.reduce((sum, e) => sum + e.event_count, 0);

  return res.json({
    billing_period: period,
    grand_total_cents,
    grand_total_dollars: (grand_total_cents / 100).toFixed(2),
    toward_target_percent: Math.min(100, Math.round((grand_total_cents / 9900) * 100)),
    event_count: grand_total_events,
    breakdown: events,
  });
});

export default router;
