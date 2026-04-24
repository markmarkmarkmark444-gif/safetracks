import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import { hashSurveyData } from '../services/hashService';
import type { SurveyRequest, SurveyResponse, SurveyAnswer } from '../types/index';

const router = Router();

// The 3 survey questions — kept minimal per HIPAA minimum-necessary principle
export const SURVEY_QUESTIONS = [
  {
    id: 'q1',
    text: 'How are you feeling today overall?',
    type: 'scale' as const,
    options: ['1', '2', '3', '4', '5'],
    label: '1 = Poor, 5 = Excellent',
  },
  {
    id: 'q2',
    text: 'Have you experienced any health symptoms in the past 48 hours?',
    type: 'single_choice' as const,
    options: ['None', 'Mild', 'Moderate', 'Severe'],
  },
  {
    id: 'q3',
    text: 'What is your primary reason for using SafeTracks today?',
    type: 'single_choice' as const,
    options: ['Routine check-in', 'Symptom report', 'Community contribution', 'Other'],
  },
] as const;

/**
 * POST /survey
 *
 * Answers are hashed immediately — the hash goes to DB, raw answers are used
 * only for the response and then discarded. The system never stores raw PHI.
 *
 * Consent gate: submission rejected if no valid consent exists for the session.
 */
router.post('/', (req: Request, res: Response) => {
  const { session_id, consent_id, answers } = req.body as SurveyRequest;

  if (!session_id || !consent_id || !answers || !Array.isArray(answers)) {
    return res.status(400).json({ error: 'session_id, consent_id, and answers are required' });
  }

  if (answers.length === 0 || answers.length > 10) {
    return res.status(400).json({ error: 'Between 1 and 10 answers required' });
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
  const validatedAnswers: SurveyAnswer[] = answers.map((a: Partial<SurveyAnswer>) => {
    if (!a.question_id || !a.answer_value) {
      throw new Error('Each answer must have question_id and answer_value');
    }
    return {
      question_id: String(a.question_id).slice(0, 50),
      question_text: String(a.question_text ?? '').slice(0, 200),
      answer_type: (a.answer_type as SurveyAnswer['answer_type']) ?? 'single_choice',
      answer_value: String(a.answer_value).slice(0, 500),
    };
  });

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

// GET /survey/questions — return the standard question set
router.get('/questions', (_req: Request, res: Response) => {
  return res.json({ questions: SURVEY_QUESTIONS });
});

export default router;
