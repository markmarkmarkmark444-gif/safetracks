'use client';

/**
 * Survey Page — harm reduction intake based on Spur Wink exchange form.
 * Sections: About You, Today's Exchange, Health Status, Other Substances.
 * Conditional questions are shown/hidden based on previous answers.
 * All answers are hashed on the backend — raw data never persisted.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getQuestions, submitSurvey } from '@/lib/api';

interface Question {
  id: string;
  section: string;
  text: string;
  type: 'single_choice' | 'boolean' | 'text' | 'scale' | 'multi_choice';
  options: string[];
  label?: string;
  placeholder?: string;
  conditional?: { question_id: string; answer: string };
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
    if (!sid || !cid) { router.replace('/'); return; }
    setSessionId(sid);
    setConsentId(cid);
    loadQuestions();
  }, [router, loadQuestions]);

  // Returns only questions whose conditional (if any) is currently satisfied
  function activeQuestions(): Question[] {
    return questions.filter(q => {
      if (!q.conditional) return true;
      return answers[q.conditional.question_id] === q.conditional.answer;
    });
  }

  function selectAnswer(questionId: string, value: string) {
    setAnswers(prev => {
      const next = { ...prev, [questionId]: value };
      // Clear conditional follow-ups when the gate answer changes
      questions.forEach(q => {
        if (q.conditional?.question_id === questionId && value !== q.conditional.answer) {
          delete next[q.id];
        }
      });
      return next;
    });
  }

  function canProgress(): boolean {
    const active = activeQuestions();
    if (!active[currentQ]) return false;
    const q = active[currentQ];
    // Text questions are optional — conditional follow-ups the participant may leave blank
    if (q.type === 'text') return true;
    return !!answers[q.id];
  }

  function handleNext() {
    const active = activeQuestions();
    if (currentQ < active.length - 1) setCurrentQ(n => n + 1);
  }

  function handleBack() {
    if (currentQ > 0) setCurrentQ(n => n - 1);
  }

  async function handleSubmit() {
    if (!sessionId || !consentId) return;
    setSubmitting(true);
    setError(null);

    try {
      const active = activeQuestions();
      const formattedAnswers = active
        .filter(q => answers[q.id] !== undefined)
        .map(q => ({
          question_id: q.id,
          question_text: q.text,
          answer_type: q.type,
          answer_value: answers[q.id] ?? '',
        }));

      const result = await submitSurvey(sessionId, consentId, formattedAnswers);
      sessionStorage.setItem('safetracks_survey_id', result.survey_id);
      sessionStorage.setItem('safetracks_data_hash', result.data_hash);
      router.push('/survey/supplies');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="screen">
        <div className="container-sm flex flex-col items-center gap-4 mt-20">
          <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          <p className="text-slate-500">Loading questions…</p>
        </div>
      </main>
    );
  }

  const active = activeQuestions();
  const q = active[currentQ];
  const isLastQuestion = currentQ === active.length - 1;

  // Section progress metadata
  const sections = Array.from(new Set(questions.map(q2 => q2.section)));
  const currentSection = q?.section ?? '';
  const sectionIndex = sections.indexOf(currentSection);
  const questionsInSection = active.filter(q2 => q2.section === currentSection);
  const posInSection = questionsInSection.indexOf(q) + 1;

  return (
    <main className="screen">
      <div className="container-sm flex flex-col gap-5">
        {/* Header with section progress */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            disabled={currentQ === 0}
            className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center disabled:opacity-30 flex-shrink-0"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-brand-600">{currentSection}</span>
              <span className="text-xs text-slate-400">· {posInSection} of {questionsInSection.length}</span>
            </div>
            {/* Section bar — one segment per section */}
            <div className="flex gap-1">
              {sections.map((s, i) => (
                <div
                  key={s}
                  title={s}
                  className={`h-1 rounded-full flex-1 transition-all duration-300 ${
                    i < sectionIndex ? 'bg-brand-500' :
                    i === sectionIndex ? 'bg-brand-400' : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>
          </div>
          <span className="text-xs text-slate-400 flex-shrink-0">{currentQ + 1}/{active.length}</span>
        </div>

        {/* Privacy badge */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="w-2 h-2 rounded-full bg-brand-500" />
          Answers are hashed — raw data is never stored
        </div>

        {/* Question card */}
        {q && (
          <div className="card flex flex-col gap-5 animate-slide-up" key={q.id}>
            <h2 className="text-xl font-semibold text-slate-900 leading-snug">{q.text}</h2>

            {/* Boolean: Yes / No */}
            {q.type === 'boolean' && (
              <div className="grid grid-cols-2 gap-3">
                {(['Yes', 'No'] as const).map(opt => (
                  <button
                    key={opt}
                    onClick={() => selectAnswer(q.id, opt)}
                    className={`py-5 rounded-2xl text-lg font-bold transition-all duration-200 border-2 ${
                      answers[q.id] === opt
                        ? opt === 'Yes'
                          ? 'bg-brand-600 border-brand-600 text-white shadow-lg'
                          : 'bg-slate-700 border-slate-700 text-white shadow-lg'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {/* Scale: numeric row */}
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

            {/* Single choice: radio-style stacked */}
            {q.type === 'single_choice' && (
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
                        answers[q.id] === opt ? 'border-brand-500 bg-brand-500' : 'border-slate-300'
                      }`}>
                        {answers[q.id] === opt && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      {opt}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Text: open-ended input */}
            {q.type === 'text' && (
              <div>
                <input
                  type="text"
                  value={answers[q.id] ?? ''}
                  onChange={e => selectAnswer(q.id, e.target.value)}
                  placeholder={q.placeholder ?? 'Type your answer…'}
                  className="w-full px-4 py-4 rounded-2xl border-2 border-slate-200 text-slate-800 text-sm
                             focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100
                             placeholder:text-slate-400 transition-all"
                  maxLength={500}
                />
                <p className="text-xs text-slate-400 mt-1.5 text-right">
                  {(answers[q.id] ?? '').length}/500
                </p>
              </div>
            )}

            {q.label && <p className="text-sm text-slate-400 -mt-2">{q.label}</p>}
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
            <p className="text-slate-500 text-sm">Securing your responses…</p>
          </div>
        ) : (
          <button
            className="btn-primary disabled:opacity-40"
            disabled={!canProgress()}
            onClick={isLastQuestion ? handleSubmit : handleNext}
          >
            {isLastQuestion ? 'Continue to Supplies →' : 'Next →'}
          </button>
        )}

        {/* Dot progress */}
        <div className="flex justify-center gap-1.5">
          {active.map((q2, i) => (
            <div
              key={q2.id}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === currentQ ? 'w-6 bg-brand-600' :
                answers[q2.id] !== undefined ? 'w-1.5 bg-brand-300' : 'w-1.5 bg-slate-200'
              }`}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
