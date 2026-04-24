/**
 * REWARD SERVICE — Huberman-model variable reward system
 *
 * Implements unpredictable, non-linear reward distribution to maximize
 * participation motivation. Based on variable-ratio reinforcement schedules
 * (Skinner, 1938) as discussed by Andrew Huberman's neuroscience work on dopamine.
 *
 * REWARD STRUCTURE:
 *   Base:       $2.00 – $5.00  (always given)
 *   Bonus:      $0.00 – $10.00 (random, weighted toward lower values)
 *   Spike:      $0.00 – $25.00 (rare, ~8% chance — creates the "lottery" effect)
 *
 * Monthly accumulation target: ~$99/month at regular participation frequency.
 *
 * PRIVACY NOTE:
 *   Rewards are tied to consent_id (a hash), never to user identity.
 *   The reward_token is an opaque redemption code with no preimage vulnerability.
 */

import { randomBytes } from 'crypto';
import type { Reward } from '../types/index';

export interface RewardBreakdown {
  base: number;
  bonus: number;
  spike: number;
  total: number;
  reward_token: string;
  tier: 'standard' | 'bonus' | 'spike';
}

// Configurable reward parameters
const REWARD_CONFIG = {
  base: { min: 2.0, max: 5.0 },
  bonus: {
    min: 0.0,
    max: 10.0,
    weight_curve: 2.5,   // higher = more weight toward lower values (log-normal feel)
  },
  spike: {
    probability: 0.08,   // 8% chance of spike reward
    min: 5.0,
    max: 25.0,
    rare_probability: 0.01, // 1% chance of max spike
  },
  monthly_target_cents: 9900,  // $99.00
} as const;

/**
 * Generate a variable reward using a non-linear distribution.
 * Each call is cryptographically seeded for unpredictability.
 */
export function calculateReward(): RewardBreakdown {
  // Use crypto random for true unpredictability (not Math.random)
  const seed = randomBytes(4).readUInt32BE(0) / 0xFFFFFFFF; // [0, 1)
  const bonusSeed = randomBytes(4).readUInt32BE(0) / 0xFFFFFFFF;
  const spikeSeed = randomBytes(4).readUInt32BE(0) / 0xFFFFFFFF;
  const rareSeed = randomBytes(4).readUInt32BE(0) / 0xFFFFFFFF;

  // Base: uniform between min and max
  const base = lerp(REWARD_CONFIG.base.min, REWARD_CONFIG.base.max, seed);

  // Bonus: log-normal-like distribution — most bonuses are small, occasional large ones
  const bonusNormalized = Math.pow(bonusSeed, REWARD_CONFIG.bonus.weight_curve);
  const bonus = lerp(REWARD_CONFIG.bonus.min, REWARD_CONFIG.bonus.max, bonusNormalized);

  // Spike: rare large reward — creates the Huberman dopamine anticipation effect
  let spike = 0;
  let tier: RewardBreakdown['tier'] = 'standard';

  if (spikeSeed < REWARD_CONFIG.spike.rare_probability) {
    // Rare max spike
    spike = REWARD_CONFIG.spike.max;
    tier = 'spike';
  } else if (spikeSeed < REWARD_CONFIG.spike.probability) {
    // Regular spike — random within spike range
    spike = lerp(REWARD_CONFIG.spike.min, REWARD_CONFIG.spike.max, rareSeed);
    tier = 'spike';
  } else if (bonus > 5.0) {
    tier = 'bonus';
  }

  const total = round2(base + bonus + spike);

  return {
    base: round2(base),
    bonus: round2(bonus),
    spike: round2(spike),
    total,
    reward_token: generateRewardToken(),
    tier,
  };
}

/**
 * Calculate monthly accumulation for a given set of billing events.
 * Target: ~$99/month at 2–3 participations per week.
 */
export function calculateMonthlyAccumulation(
  amountsCents: number[]
): {
  total_cents: number;
  total_dollars: number;
  event_count: number;
  toward_target_percent: number;
} {
  const total_cents = amountsCents.reduce((sum, c) => sum + c, 0);
  return {
    total_cents,
    total_dollars: total_cents / 100,
    event_count: amountsCents.length,
    toward_target_percent: Math.min(
      100,
      Math.round((total_cents / REWARD_CONFIG.monthly_target_cents) * 100)
    ),
  };
}

/**
 * Convert a reward breakdown to billable cents (rounded to nearest cent).
 */
export function rewardToCents(reward: Pick<Reward, 'total_amount'>): number {
  return Math.round(reward.total_amount * 100);
}

// Private helpers

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function generateRewardToken(): string {
  // Format: ST-XXXX-XXXX-XXXX where X is hex — opaque, not guessable
  const parts = Array.from({ length: 3 }, () =>
    randomBytes(2).toString('hex').toUpperCase()
  );
  return `ST-${parts.join('-')}`;
}
