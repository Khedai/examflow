import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getExam, startExam, saveAnswers, saveAnswersKeepalive, submitExam } from '../../api';
import { readDraft, writeDraft, clearDraft, readPosition, writePosition, clearPosition } from '../../examDraft';
import type { Exam, Question } from '../../types';
import BrandBar from '../../components/BrandBar';

export default function ExamTaking() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [exam, setExam] = useState<Exam | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // 'unsaved' stays on screen until a save actually succeeds — a silent failure is what cost
  // students their work, so the state is now visible and the loop keeps retrying.
  const [saveIndicator, setSaveIndicator] = useState<'idle' | 'saving' | 'saved' | 'unsaved'>('idle');
  const [recoveredCount, setRecoveredCount] = useState(0);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answersRef = useRef(answers);
  const submittedRef = useRef(false);
  const dirtyRef = useRef(false);      // something changed since the last successful save
  const lastSavedJsonRef = useRef(''); // exactly what the server is known to hold
  answersRef.current = answers;

  // Mirror of what is on screen, written to localStorage on every change. Costs nothing and is
  // the only copy that survives a lost connection, a crash or a forced re-login.
  const persistDraft = useCallback((submissionIdValue: string) => {
    if (!examId) return;
    writeDraft(examId, submissionIdValue, answersRef.current);
  }, [examId]);

  // Only ever send questions that belong to this exam — a draft left over from an earlier
  // version of the exam must not make the whole save fail (unknown ids would break the FK).
  const questionIdsRef = useRef<Set<string>>(new Set());
  const buildAnswerPayload = () => {
    const ids = questionIdsRef.current;
    return Object.entries(answersRef.current)
      .filter(([questionId]) => ids.size === 0 || ids.has(questionId))
      .map(([questionId, answerText]) => ({ questionId, answerText }));
  };

  useEffect(() => {
    if (!examId) return;
    (async () => {
      try {
        const examData = await getExam(examId);
        setExam(examData);
        questionIdsRef.current = new Set((examData.questions || []).map((qq) => qq.id));
        // Resume on the question she was last on (survives a hard refresh / crash)
        const maxIdx = Math.max(0, (examData.questions?.length || 1) - 1);
        setCurrentQ(Math.min(readPosition(examId), maxIdx));
        const startData = await startExam(examId);
        setSubmissionId(startData.submissionId);
        setStartedAt(startData.startedAt);
        // Parse as UTC — append Z if missing (fixes SQLite timezone issue)
        const startedAtStr = startData.startedAt.endsWith('Z') ? startData.startedAt : startData.startedAt + 'Z';
        const startTime = new Date(startedAtStr).getTime();

        // ── Reconcile the server copy with the local draft ──
        // The draft only counts when it belongs to this same attempt and was written after the
        // server's startedAt — which is how a stale draft from before a teacher Reset is ignored.
        const serverMap: Record<string, string> = {};
        (startData.answers || []).forEach((a: any) => { serverMap[a.questionId] = a.answerText || ''; });
        const merged: Record<string, string> = { ...serverMap };
        const draft = readDraft(examId);
        let recovered = 0;
        if (draft && draft.submissionId === startData.submissionId && draft.savedAt >= startTime) {
          for (const [questionId, answerText] of Object.entries(draft.answers)) {
            if (answerText && answerText.trim() && answerText !== merged[questionId]) {
              merged[questionId] = answerText;
              recovered += 1;
            }
          }
        }
        setAnswers(merged);
        lastSavedJsonRef.current = JSON.stringify(serverMap);
        dirtyRef.current = JSON.stringify(merged) !== JSON.stringify(serverMap);
        if (recovered > 0) {
          setRecoveredCount(recovered);
          setSaveIndicator('unsaved'); // genuinely unsaved until the loop pushes it (~3s)
        }
        // Use an absolute end-time so the countdown can't drift or freeze when the tab is backgrounded
        const end = startTime + examData.duration * 60 * 1000;
        setEndTime(end);
        setTimeLeft(Math.max(0, Math.round((end - Date.now()) / 1000)));
      } catch (err: any) {
        // Submission already finished server-side (auto-expired / duplicate submit) —
        // drop the student on the dashboard instead of a dead-end error.
        if (/already submitted|not in progress/i.test(err?.message || '')) {
          // Keep the local draft: if a teacher later reopens this submission it is the only
          // copy of anything typed after the last successful save.
          clearPosition(examId);
          navigate('/student');
          return;
        }
        setError(err.message || 'Failed to start exam');
      }
      finally { setLoading(false); }
    })();
  }, [examId, navigate]);

  useEffect(() => {
    if (endTime === null) return;
    const tick = () => {
      const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0 && timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    // Re-sync immediately when the tab regains focus — intervals are throttled in the
    // background, so without this the countdown can freeze and the student keeps working
    // past the real deadline (then hitting the server-side lazy-expiry 409 on submit).
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [endTime]);

  useEffect(() => { if (timeLeft === 0 && submissionId) handleSubmitExam(true); }, [timeLeft]);

  // One save path for every trigger: the tick, a question change, a blur, tab hide/close.
  const pushAnswers = useCallback(async (): Promise<boolean> => {
    if (!submissionId || submittedRef.current) return true;
    const snapshot = answersRef.current;
    const ansArray = buildAnswerPayload();
    setSaveIndicator('saving');
    try {
      await saveAnswers(submissionId, ansArray);
      lastSavedJsonRef.current = JSON.stringify(snapshot);
      dirtyRef.current = false;
      setSaveIndicator('saved');
      setRecoveredCount(0); // the recovered answers are safely on the server now
      return true;
    } catch {
      // Never pretend it saved — leave the warning up and let the next tick retry.
      dirtyRef.current = true;
      setSaveIndicator('unsaved');
      return false;
    }
  }, [submissionId]);

  // Push only when something actually changed, every 3s. Cheap for 30 students, and it shrinks
  // the window between screen and server to a few seconds (was 10s, and failures were silent).
  useEffect(() => {
    if (!submissionId) return;
    const tick = () => {
      if (submittedRef.current) return;
      if (!dirtyRef.current && JSON.stringify(answersRef.current) === lastSavedJsonRef.current) return;
      pushAnswers();
    };
    saveTimerRef.current = setInterval(tick, 3000);
    const healDraft = setTimeout(tick, 300); // push recovered draft answers straight away
    return () => {
      if (saveTimerRef.current) clearInterval(saveTimerRef.current);
      clearTimeout(healDraft);
    };
  }, [submissionId, pushAnswers]);

  // Flush on hide/refresh/close. `keepalive` lets the request finish after the page is gone,
  // and the draft write means even a failed request cannot lose the text.
  const flushSave = useCallback(() => {
    if (!submissionId || submittedRef.current) return;
    persistDraft(submissionId);
    const ansArray = buildAnswerPayload();
    saveAnswersKeepalive(submissionId, ansArray).catch(() => { /* best effort — never block unload */ });
  }, [submissionId, persistDraft]);

  useEffect(() => {
    if (!submissionId) return;
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') flushSave(); };
    const onPageHide = () => flushSave();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [submissionId, flushSave]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (submissionId && timeLeft && timeLeft > 0) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [submissionId, timeLeft]);

  const handleSubmitExam = useCallback(async (isAuto = false) => {
    if (!submissionId || submittedRef.current) return;
    submittedRef.current = true;
    // Stop auto-save and timer
    if (saveTimerRef.current) { clearInterval(saveTimerRef.current); saveTimerRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try {
      // Final best-effort save. If the server already auto-submitted this submission
      // (lazy expiry) the save is rejected with 409 "not in progress" — that's fine,
      // the submit below is authoritative and will succeed idempotently.
      try {
        const ansArray = buildAnswerPayload();
        await saveAnswers(submissionId, ansArray);
      } catch { /* ignore — submit below is authoritative */ }

      try {
        await submitExam(submissionId);
      } catch (err: any) {
        // Already finished server-side (auto-expired / duplicate submit) → not an error.
        if (!/already submitted|not in progress/i.test(err?.message || '')) throw err;
      }

      if (examId) {
        clearPosition(examId);
        clearDraft(examId); // everything is on the server now
      }
      navigate(`/student/result/${submissionId}`);
    }
    catch (err: any) { submittedRef.current = false; if (!isAuto) setError(err.message || 'Failed to submit'); }
  }, [submissionId, navigate, examId]);

  if (loading) return <div className="loading-center"><span className="spinner" /></div>;
  if (!exam) return <div className="error-banner">Exam not found</div>;

  const questions: Question[] = exam.questions || [];
  const q = questions[currentQ];
  const answeredCount = Object.values(answers).filter((v) => v.trim()).length;
  const totalPoints = questions.reduce((s, qe) => s + qe.points, 0);

  const formatTime = (sec: number) => { const m = Math.floor(sec / 60); const s = sec % 60; return `${m}:${s.toString().padStart(2, '0')}`; };
  const progressPct = timeLeft !== null ? ((exam.duration * 60 - timeLeft) / (exam.duration * 60)) * 100 : 0;
  const timerClass = timeLeft !== null && timeLeft < exam.duration * 60 * 0.1 ? 'danger' : timeLeft !== null && timeLeft < exam.duration * 60 * 0.25 ? 'warn' : '';
  const handleAnswerChange = (value: string) => {
    if (!q) return;
    setAnswers((prev) => ({ ...prev, [q.id]: value }));
    dirtyRef.current = true;
    // Mirror to localStorage (debounced) so a crash or reload cannot lose the typing.
    if (submissionId) {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = setTimeout(() => persistDraft(submissionId), 300);
    }
  };
  const goTo = (idx: number) => {
    if (idx < 0 || idx >= questions.length) return;
    flushSave(); // she has stopped typing — push now instead of waiting for the 3s tick
    setCurrentQ(idx);
    if (examId) writePosition(examId, idx);
  };

  return (
    <div className="exam-container">
      <div className="exam-sidebar">
        <BrandBar />
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 15, color: 'var(--text-primary)' }}>{exam.title}</div>
        <div className="text-sm text-secondary" style={{ marginBottom: 16 }}>{answeredCount} of {questions.length} answered</div>
        <div className="q-nav" style={{ marginBottom: 20 }}>
          {questions.map((qu, i) => (
            <button key={qu.id} className={`q-dot ${answers[qu.id]?.trim() ? 'answered' : ''} ${i === currentQ ? 'current' : ''}`} onClick={() => goTo(i)} aria-label={`Question ${i + 1}`}>{i + 1}</button>
          ))}
        </div>
        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
          <div className="text-sm text-secondary" style={{ marginBottom: 10, fontWeight: 600 }}>Total Points: {totalPoints} pts</div>
          <button className="btn btn-danger" style={{ width: '100%', padding: '8px 16px', fontSize: 13 }} onClick={() => setConfirmSubmit(true)}>Submit Exam</button>
        </div>
      </div>
      <div className="exam-main">
        <div className="exam-topbar">
          <div className="exam-topbar-title">{exam.title}</div>
          <div className="exam-topbar-info">
            {saveIndicator === 'saving' && <span className="text-sm text-secondary">Saving…</span>}
            {saveIndicator === 'saved' && <span className="text-sm" style={{ color: 'var(--teal-600)' }}>✓ Saved</span>}
            {saveIndicator === 'unsaved' && <span className="text-sm" style={{ color: '#dc2626', fontWeight: 700 }}>Not saved yet — do not close this page</span>}
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                  {q.options.map((opt, oi) => (
                    <div key={oi} className={`mcq-option ${answers[q.id] === opt ? 'selected' : ''}`} onClick={() => handleAnswerChange(opt)}>
                      <div className="mcq-radio">{answers[q.id] === opt && <div className="mcq-radio-inner" />}</div>
                      <span>{opt}</span>
                    </div>
                  ))}
                </div>
              )}
              {q.type === 'short' && (<textarea className="input" rows={4} value={answers[q.id] || ''} onChange={(e) => handleAnswerChange(e.target.value)} onBlur={() => flushSave()} placeholder="Type your answer..." style={{ resize: 'vertical', marginBottom: 16 }} />)}
              {q.type === 'long' && (<textarea className="input" rows={8} value={answers[q.id] || ''} onChange={(e) => handleAnswerChange(e.target.value)} onBlur={() => flushSave()} placeholder="Type your answer..." style={{ resize: 'vertical', marginBottom: 16 }} />)}
              <div style={{ marginBottom: 16 }}><span className="badge badge-mcq">{q.points} Points</span></div>
              <div className="exam-nav-buttons">
                <button className="btn btn-ghost" style={{ border: '1px solid var(--border-medium)' }} onClick={() => goTo(currentQ - 1)} disabled={currentQ === 0}>&larr; Previous</button>
                <button className="btn btn-ghost" style={{ border: '1px solid var(--border-medium)' }} onClick={() => goTo(currentQ + 1)} disabled={currentQ === questions.length - 1}>Next &rarr;</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {confirmSubmit && (
        <div className="confirm-overlay" onClick={() => setConfirmSubmit(false)}><div className="confirm-dialog" onClick={(e) => e.stopPropagation()}><h3>Submit Exam</h3><p>You have answered {answeredCount} of {questions.length} questions. Are you sure you want to submit?</p><div className="confirm-actions"><button className="btn btn-ghost" onClick={() => setConfirmSubmit(false)}>Cancel</button><button className="btn btn-primary" onClick={() => handleSubmitExam()}>Submit now</button></div></div></div>
      )}
      {recoveredCount > 0 && (
        <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 100 }}>
          <div className="error-banner" style={{ background: '#0d9488', color: '#fff' }}>
            ✓ Recovered {recoveredCount} unsaved answer{recoveredCount === 1 ? '' : 's'} from this device — saving…</div>
        </div>
      )}
      {saveIndicator === 'unsaved' && recoveredCount === 0 && (
        <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 100 }}>
          <div className="error-banner" role="alert">Your answers are not saved yet. Keep this page open — we are retrying.</div>
        </div>
      )}
      {error && (<div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 100 }}><div className="error-banner">{error}</div></div>)}
    </div>
  );
}