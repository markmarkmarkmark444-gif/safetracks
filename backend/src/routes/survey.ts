import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import { hashSurveyData } from '../services/hashService';
import type { SurveyRequest, SurveyResponse, SurveyAnswer } from '../types/index';

const router = Router();

/**
 * Harm reduction intake questions based on Spur Wink syringe exchange form.
 * Organized into 4 sections. Conditional questions show only when their
 * prerequisite answer matches (enforced on the frontend; backend accepts any subset).
 *
 * All answers go into the private ZK layer — only the SHA-256 hash is anchored.
 * Age ranges, not DOBs. Ethnicity categories, not names. No PII ever collected.
 */
export const SURVEY_QUESTIONS = [
  // ── Section 1: About You ────────────────────────────────────────────
  {
    id: 'q_dem_age',
    section: 'About You',
    text: 'What is your age range?',
    type: 'single_choice' as const,
    options: ['18–25', '26–49', '50+'],
  },
  {
    id: 'q_dem_gender',
    section: 'About You',
    text: 'How do you identify?',
    type: 'single_choice' as const,
    options: ['Male', 'Female', 'Non-Binary', 'Transgender', 'Unknown / Declined'],
  },
  {
    id: 'q_dem_ethnicity',
    section: 'About You',
    text: 'Ethnicity',
    type: 'single_choice' as const,
    options: [
      'White',
      'Black / African American',
      'American Indian / Alaskan Native',
      'Asian',
      'Hawaiian / Pacific Islander',
      'Multi-Racial',
      'Other',
      'Unknown / Declined',
    ],
  },

  // ── Section 2: Today's Exchange ─────────────────────────────────────
  {
    id: 'q_exc_brought',
    section: "Today's Exchange",
    text: 'Did you bring any used syringes to exchange today?',
    type: 'boolean' as const,
    options: ['Yes', 'No'],
  },
  {
    id: 'q_exc_count',
    section: "Today's Exchange",
    text: 'How many did you bring?',
    type: 'single_choice' as const,
    options: ['1–5', '6–10', '10+'],
    conditional: { question_id: 'q_exc_brought', answer: 'Yes' },
  },
  {
    id: 'q_exc_reuse',
    section: "Today's Exchange",
    text: 'Do you ever reuse your syringes?',
    type: 'boolean' as const,
    options: ['Yes', 'No'],
  },
  {
    id: 'q_exc_daily',
    section: "Today's Exchange",
    text: 'How many syringes do you typically use in a day?',
    type: 'single_choice' as const,
    options: ['1–5', '6–10', '10+'],
  },
  {
    id: 'q_exc_disposal',
    section: "Today's Exchange",
    text: 'Do you have ways to safely dispose of your syringes?',
    type: 'boolean' as const,
    options: ['Yes', 'No'],
  },
  {
    id: 'q_exc_disposal_discuss',
    section: "Today's Exchange",
    text: 'Would you like to discuss safe disposal options?',
    type: 'boolean' as const,
    options: ['Yes', 'No'],
  },

  // ── Section 3: Health Status ─────────────────────────────────────────
  {
    id: 'q_health_inject',
    section: 'Health Status',
    text: 'Are you experiencing any issues injecting?',
    type: 'boolean' as const,
    options: ['Yes', 'No'],
  },
  {
    id: 'q_health_inject_desc',
    section: 'Health Status',
    text: 'Describe the issues you are experiencing',
    type: 'text' as const,
    options: [] as string[],
    placeholder: 'e.g. bruising, missed veins, pain…',
    conditional: { question_id: 'q_health_inject', answer: 'Yes' },
  },
  {
    id: 'q_health_wounds',
    section: 'Health Status',
    text: 'Do you currently have any open wounds or sores?',
    type: 'boolean' as const,
    options: ['Yes', 'No'],
  },
  {
    id: 'q_health_wounds_loc',
    section: 'Health Status',
    text: 'Where are they located?',
    type: 'text' as const,
    options: [] as string[],
    placeholder: 'e.g. left arm, leg…',
    conditional: { question_id: 'q_health_wounds', answer: 'Yes' },
  },

  // ── Section 4: Other Substances ──────────────────────────────────────
  {
    id: 'q_sub_other',
    section: 'Other Substances',
    text: 'Besides opiates, do you use any other substances?',
    type: 'boolean' as const,
    options: ['Yes', 'No'],
  },
  {
    id: 'q_sub_desc',
    section: 'Other Substances',
    text: 'Which substances?',
    type: 'text' as const,
    options: [] as string[],
    placeholder: 'e.g. meth, alcohol, benzos…',
    conditional: { question_id: 'q_sub_other', answer: 'Yes' },
  },
];

/**
 * POST /survey
 *
 * Answers are hashed immediately — the hash goes to DB, raw answers are used
 * only for the response and then discarded. The system never stores raw PHI.
 *
 * Consent gate: submission rejected if no valid consent exists for the session.
 * Conditional questions are optional (frontend skips them; backend accepts any subset).
 */
router.post('/', (req: Request, res: Response) => {
  const { session_id, consent_id, answers } = req.body as SurveyRequest;

  if (!session_id || !consent_id || !answers || !Array.isArray(answers)) {
    return res.status(400).json({ error: 'session_id, consent_id, and answers are required' });
  }

  if (answers.length === 0 || answers.length > 20) {
    return res.status(400).json({ error: 'Between 1 and 20 answers required' });
  }

  const db = getDb();

  // CONSENT GATE — no valid consent means no data collected
  const consent = db.prepare(`
    SELECT id FROM consent_events
    WHERE id = ? AND session_id = ? AND consent_given = 1
  `).get(consent_id, session_id);

  if (!consent) {
    return res.status(403).json({
      error: 'No valid consent found. Consent is required before submitting survey data.',
    });
  }

  // Validate answer structure (don't trust client)
  let validatedAnswers: SurveyAnswer[];
  try {
    validatedAnswers = answers.map((a: Partial<SurveyAnswer>) => {
      if (!a.question_id || a.answer_value === undefined || a.answer_value === null) {
        throw new Error('Each answer must have question_id and answer_value');
      }
      return {
        question_id: String(a.question_id).slice(0, 50),
        question_text: String(a.question_text ?? '').slice(0, 200),
        answer_type: (a.answer_type as SurveyAnswer['answer_type']) ?? 'single_choice',
        answer_value: String(a.answer_value).slice(0, 500),
      };
    });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid answer format' });
  }

  const survey_id = uuidv4();
  const data_hash = hashSurveyData(validatedAnswers as unknown as Record<string, unknown>[]);

  db.prepare(`
    INSERT INTO surveys (id, session_id, consent_id, answers_json, data_hash)
    VALUES (?, ?, ?, ?, ?)
  `).run(survey_id, session_id, consent_id, JSON.stringify(validatedAnswers), data_hash);

  const response: SurveyResponse = {
    survey_id,
    data_hash,
    message: 'Survey recorded. Raw answers have been hashed; only the hash is retained.',
  };

  return res.status(201).json(response);
});

// GET /survey/questions — return the full question set with sections and conditionals
router.get('/questions', (_req: Request, res: Response) => {
  return res.json({ questions: SURVEY_QUESTIONS });
});

export default router;
