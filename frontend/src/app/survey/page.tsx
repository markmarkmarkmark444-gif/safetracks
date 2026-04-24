'use client';

/**
 * Survey Page — 2-3 question anonymous health report
 * Answers are hashed on the backend; raw data is never persisted.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getQuestions, submitSurvey } from '@/lib/api';

interface Question {
  id: string;
  text: string;
  type: string;
  options: string[];
  label?: string;
}

export default function SurveyPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [consentId, setConsentId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentQ, setCurrentQ] = useState(0);

  const loadQuestions = useCallback(async () => {
    try {
      const data = await getQuestions();
      setQuestions(data.questions as Question[]);
    } catch {
      setError('Failed to load survey questions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const sid = sessionStorage.getItem('safetracks_session_id');
    const cid = sessionStorage.getItem('safetracks_consent_id');

    if (!sid || !cid) {
      router.replace('/');
      return;
    }

    setSessionId(sid);
    setConsentId(cid);
    loadQuestions();
  }, [router, loadQuestions]);

  function selectAnswer(questionId: string, value: string) {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  }

  function canProgress(): boolean {
    if (!questions[currentQ]) return false;
    return !!answers[questions[currentQ].id];
  }

  function handleNext() {
    if (currentQ < questions.length - 1) {
      setCurrentQ(q => q + 1);
    }
  }

  function handleBack() {
    if (currentQ > 0) setCurrentQ(q => q - 1);
  }

  async function handleSubmit() {
    if (!sessionId || !consentId) return;
    setSubmitting(true);
    setError(null);

    try {
      const formattedAnswers = questions.map(q => ({
        question_id: q.id,
        question_text: q.text,
        answer_type: q.type,
        answer_value: answers[q.id] ?? '',
      }));

      const result = await submitSurvey(sessionId, consentId, formattedAnswers);
      sessionStorage.setItem('safetracks_survey_id', result.survey_id);
      sessionStorage.setItem('safetracks_data_hash', result.data_hash);
      router.push('/reward');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
      setSubmitting(false);
    }
  }

  const progress = questions.length > 0 ? ((currentQ + 1) / questions.length) * 100 : 0;
  const allAnswered = questions.every(q => !!answers[q.id]);
  const isLastQuestion = currentQ === questions.length - 1;

  if (loading) {
    return (
      <main className="screen">
        <div className="container-sm flex flex-col items-center gap-4 mt-20">
          <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          <p className="text-slate-500">Loading questions...</p>
        </div>
      </main>
    );
  }

  const q = questions[currentQ];

  return (
    <main className="screen">
      <div className="container-sm flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={handleBack} disabled={currentQ === 0} className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center disabled:opacity-30">
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <p className="text-xs text-slate-500">Question {currentQ + 1} of {questions.length}</p>
            <h1 className="text-lg font-bold text-slate-900">Anonymous Survey</h1>
          </div>
        </div>

        {/* Progress */}
        <div className="w-full h-1.5 bg-slate-100 rounded-full">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-300"
            style={{ width: `${(2 / 3) + (progress / 3)}%` }}
          />
        </div>

        {/* Privacy badge */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
          Your answers are hashed — raw data is never stored
        </div>

        {/* Question card */}
        {q && (
          <div className="card flex flex-col gap-5 animate-slide-up">
            <div>
              <div className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 text-xs font-medium px-3 py-1 rounded-full mb-3">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Anonymous
              </div>
              <h2 className="text-xl font-semibold text-slate-900 leading-snug">
                {q.text}
              </h2>
              {q.label && (
                <p className="text-sm text-slate-400 mt-1">{q.label}</p>
              )}
            </div>

            {/* Scale question */}
            {q.type === 'scale' && (
              <div className="flex gap-2 justify-between">
                {q.options.map(opt => (
                  <button
                    key={opt}
                    onClick={() => selectAnswer(q.id, opt)}
                    className={`flex-1 h-14 rounded-2xl text-lg font-bold transition-all duration-200 border-2 ${
                      answers[q.id] === opt
                        ? 'bg-brand-600 border-brand-600 text-white shadow-lg scale-105'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {/* Choice question */}
            {(q.type === 'single_choice' || q.type === 'multi_choice') && (
              <div className="flex flex-col gap-2">
                {q.options.map(opt => (
                  <button
                    key={opt}
                    onClick={() => selectAnswer(q.id, opt)}
                    className={`w-full p-4 rounded-2xl text-left font-medium text-sm transition-all duration-200 border-2 ${
                      answers[q.id] === opt
                        ? 'bg-brand-50 border-brand-500 text-brand-800'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-brand-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        answers[q.id] === opt
                          ? 'border-brand-500 bg-brand-500'
                          : 'border-slate-300'
                      }`}>
                        {answers[q.id] === opt && (
                          <div className="w-2 h-2 rounded-full bg-white" />
                        )}
                      </div>
                      {opt}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <p className="text-red-700 text-sm text-center">{error}</p>
          </div>
        )}

        {/* Navigation */}
        {submitting ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
            <p className="text-slate-500 text-sm">Securing your response...</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {isLastQuestion ? (
              <button
                className="btn-primary disabled:opacity-40"
                disabled={!allAnswered}
                onClick={handleSubmit}
              >
                Submit Report →
              </button>
            ) : (
              <button
                className="btn-primary disabled:opacity-40"
                disabled={!canProgress()}
                onClick={handleNext}
              >
                Next Question →
              </button>
            )}
          </div>
        )}

        {/* Quick answer dots */}
        <div className="flex justify-center gap-2">
          {questions.map((q2, i) => (
            <div
              key={q2.id}
              className={`w-2 h-2 rounded-full transition-all ${
                i === currentQ ? 'bg-brand-600 w-6' :
                answers[q2.id] ? 'bg-brand-300' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
