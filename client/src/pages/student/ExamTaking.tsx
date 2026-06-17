import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getExam, startExam, saveAnswers, submitExam } from '../../api';
import type { Exam, Question } from '../../types';

export default function ExamTaking() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [exam, setExam] = useState<Exam | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveIndicator, setSaveIndicator] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  useEffect(() => {
    if (!examId) return;
    (async () => {
      try {
        const examData = await getExam(examId);
        setExam(examData);
        const startData = await startExam(examId);
        setSubmissionId(startData.submissionId);
        setStartedAt(startData.startedAt);
        const ansMap: Record<string, string> = {};
        (startData.answers || []).forEach((a: any) => { ansMap[a.questionId] = a.answerText || ''; });
        setAnswers(ansMap);
        const startTime = new Date(startData.startedAt).getTime();
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const total = examData.duration * 60;
        setTimeLeft(Math.max(0, total - elapsed));
      } catch (err: any) { setError(err.message || 'Failed to start exam'); }
      finally { setLoading(false); }
    })();
  }, [examId]);

  useEffect(() => {
    if (timeLeft === null) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => { if (prev === null || prev <= 0) { if (timerRef.current) clearInterval(timerRef.current); return 0; } return prev - 1; });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timeLeft !== null]);

  useEffect(() => { if (timeLeft === 0 && submissionId) handleSubmitExam(true); }, [timeLeft]);

  useEffect(() => {
    if (!submissionId) return;
    saveTimerRef.current = setInterval(async () => {
      const ansArray = Object.entries(answersRef.current).map(([questionId, answerText]) => ({ questionId, answerText }));
      try { setSaveIndicator('saving'); await saveAnswers(submissionId!, ansArray); setSaveIndicator('saved'); setTimeout(() => setSaveIndicator('idle'), 2000); }
      catch { setSaveIndicator('idle'); }
    }, 10000);
    return () => { if (saveTimerRef.current) clearInterval(saveTimerRef.current); };
  }, [submissionId]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (submissionId && timeLeft && timeLeft > 0) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [submissionId, timeLeft]);

  const handleSubmitExam = useCallback(async (isAuto = false) => {
    if (!submissionId) return;
    try { await submitExam(submissionId); navigate(`/student/result/${submissionId}`); }
    catch (err: any) { if (!isAuto) setError(err.message || 'Failed to submit'); }
  }, [submissionId, navigate]);

  if (loading) return <div className="loading-center"><span className="spinner" /></div>;
  if (!exam) return <div className="error-banner">Exam not found</div>;

  const questions: Question[] = exam.questions || [];
  const q = questions[currentQ];
  const answeredCount = Object.values(answers).filter((v) => v.trim()).length;
  const totalPoints = questions.reduce((s, qe) => s + qe.points, 0);

  const formatTime = (sec: number) => { const m = Math.floor(sec / 60); const s = sec % 60; return `${m}:${s.toString().padStart(2, '0')}`; };
  const progressPct = timeLeft !== null ? ((exam.duration * 60 - timeLeft) / (exam.duration * 60)) * 100 : 0;
  const timerClass = timeLeft !== null && timeLeft < exam.duration * 60 * 0.1 ? 'danger' : timeLeft !== null && timeLeft < exam.duration * 60 * 0.25 ? 'warn' : '';
  const handleAnswerChange = (value: string) => { if (!q) return; setAnswers((prev) => ({ ...prev, [q.id]: value })); };
  const goTo = (idx: number) => { if (idx >= 0 && idx < questions.length) setCurrentQ(idx); };

  return (
    <div className="exam-container">
      <div className="exam-sidebar">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          <img src="/logo.png" alt="Logo" style={{ height: 60, width: 160, maxWidth: '100%' }} />
        </div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{exam.title}</div>
        <div className="text-sm text-secondary">{answeredCount}/{questions.length} answered</div>
        <div className="q-nav">
          {questions.map((qu, i) => (
            <button key={qu.id} className={`q-dot ${answers[qu.id]?.trim() ? 'answered' : ''} ${i === currentQ ? 'current' : ''}`} onClick={() => goTo(i)} aria-label={`Question ${i + 1}`}>{i + 1}</button>
          ))}
        </div>
        <div style={{ marginTop: 'auto' }}>
          <div className="text-sm text-secondary mb-1">Total: {totalPoints} pts</div>
          <button className="btn btn-danger" style={{ width: '100%' }} onClick={() => setConfirmSubmit(true)}>Submit exam</button>
        </div>
      </div>
      <div className="exam-main">
        <div className="exam-topbar">
          <div className="exam-topbar-title">{exam.title}</div>
          <div className="exam-topbar-info">
            {saveIndicator === 'saving' && <span className="text-sm text-secondary">Saving...</span>}
            {saveIndicator === 'saved' && <span className="text-sm" style={{ color: 'var(--teal-600)' }}>Saved</span>}
            <span className={`timer-display ${timerClass}`}>{timeLeft !== null ? formatTime(timeLeft) : '--:--'}</span>
          </div>
        </div>
        <div className="progress-bar"><div className={`progress-fill ${timerClass}`} style={{ width: `${progressPct}%` }} /></div>
        <div className="exam-content">
          {questions.length === 0 ? (
            <div className="empty-state"><p>No questions in this exam.</p></div>
          ) : q ? (
            <div className="exam-question-area">
              <div className="exam-question-number">Question {currentQ + 1} of {questions.length}</div>
              <div className="exam-question-text">{q.text}</div>
              {q.type === 'mcq' && q.options && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {q.options.map((opt, oi) => (
                    <div key={oi} className={`mcq-option ${answers[q.id] === opt ? 'selected' : ''}`} onClick={() => handleAnswerChange(opt)}>
                      <div className="mcq-radio">{answers[q.id] === opt && <div className="mcq-radio-inner" />}</div>
                      <span>{opt}</span>
                    </div>
                  ))}
                </div>
              )}
              {q.type === 'short' && (<textarea className="input" rows={4} value={answers[q.id] || ''} onChange={(e) => handleAnswerChange(e.target.value)} placeholder="Type your answer..." style={{ resize: 'vertical' }} />)}
              {q.type === 'long' && (<textarea className="input" rows={10} value={answers[q.id] || ''} onChange={(e) => handleAnswerChange(e.target.value)} placeholder="Type your answer..." style={{ resize: 'vertical' }} />)}
              <div style={{ marginTop: 8 }}><span className="badge badge-mcq">{q.points} pts</span></div>
              <div className="exam-nav-buttons">
                <button className="btn btn-ghost" onClick={() => goTo(currentQ - 1)} disabled={currentQ === 0}>&larr; Previous</button>
                <button className="btn btn-ghost" onClick={() => goTo(currentQ + 1)} disabled={currentQ === questions.length - 1}>Next &rarr;</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {confirmSubmit && (
        <div className="confirm-overlay" onClick={() => setConfirmSubmit(false)}><div className="confirm-dialog" onClick={(e) => e.stopPropagation()}><h3>Submit Exam</h3><p>You have answered {answeredCount} of {questions.length} questions. Are you sure you want to submit?</p><div className="confirm-actions"><button className="btn btn-ghost" onClick={() => setConfirmSubmit(false)}>Cancel</button><button className="btn btn-primary" onClick={() => handleSubmitExam()}>Submit now</button></div></div></div>
      )}
      {error && (<div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 100 }}><div className="error-banner">{error}</div></div>)}
    </div>
  );
}