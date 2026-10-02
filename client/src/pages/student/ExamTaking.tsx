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
  // The real reason the last save failed, shown verbatim to the student. An opaque
  // "we are retrying" is what made a broken backend indistinguishable from a flaky network on
  // exam day — with this, a wrong API host / a 404 / a timeout is visible in one glance.
  const [saveError, setSaveError] = useState('');
  // Informational toast (e.g. "your teacher restarted this exam") — it clears itself so it can
  // never be mistaken for, or mask, a real error.
  const [notice, setNotice] = useState('');
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  // Auto-submit fires exactly once (timeLeft stays at 0), so a network blip at that moment used
  // to leave the exam unsubmitted and the student stuck. This flag keeps retrying until it lands.
  const [retryingSubmit, setRetryingSubmit] = useState(false);
  // True from the moment the student confirms submit until we navigate to the result (or the
  // submit fails). Drives the blocking "Submitting…" overlay so the button always visibly
  // responds: the final save + submit can take a long time on a cold server, and with no
  // feedback students kept clicking a button that looked dead.
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answersRef = useRef(answers);
  const submittedRef = useRef(false);
  const dirtyRef = useRef(false);      // something changed since the last successful save
  const lastSavedJsonRef = useRef(''); // exactly what the server is known to hold
  answersRef.current = answers;

  // Which attempt this tab is answering, and when each answer was last touched (server time).
  const attemptRef = useRef(1);
  const editedAtRef = useRef<Record<string, number>>({});
  // serverNow - clientNow, learned from each start response. Every timestamp we send is converted
  // onto the server's clock, so a skewed device clock can never make one tab's answers look older
  // (or newer) than another's, and the countdown matches the server's real deadline.
  const clockOffsetRef = useRef(0);
  const serverNow = useCallback(() => Date.now() + clockOffsetRef.current, []);

  // Mirror of what is on screen, written to localStorage on every change. Costs nothing and is
  // the only copy that survives a lost connection, a crash or a forced re-login.
  const persistDraft = useCallback((submissionIdValue: string) => {
    if (!examId) return;
    writeDraft(examId, submissionIdValue, attemptRef.current, answersRef.current);
  }, [examId]);

  // Only ever send questions that belong to this exam — a draft left over from an earlier
  // version of the exam must not make the whole save fail (unknown ids would break the FK).
  const questionIdsRef = useRef<Set<string>>(new Set());
  const buildAnswerPayload = () => {
    const ids = questionIdsRef.current;
    return Object.entries(answersRef.current)
      .filter(([questionId]) => ids.size === 0 || ids.has(questionId))
      .map(([questionId, answerText]) => ({ questionId, answerText, editedAt: editedAtRef.current[questionId] }));
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
        // Adopt the server's attempt counter and clock. The attempt is what separates a genuine
        // teacher Reset (which clears answers) from a plain reload, so the draft guard below keys
        // off it — never off started_at, which a reload must never move.
        attemptRef.current = Number(startData.attempt) > 0 ? Number(startData.attempt) : 1;
        if (startData.serverNow) {
          const serverMs = new Date(startData.serverNow).getTime();
          if (Number.isFinite(serverMs)) clockOffsetRef.current = serverMs - Date.now();
        }
        // Parse as UTC — append Z if missing (fixes SQLite timezone issue)
        const startedAtStr = startData.startedAt.endsWith('Z') ? startData.startedAt : startData.startedAt + 'Z';
        const startTime = new Date(startedAtStr).getTime();

        // ── Reconcile the server copy with the local draft ──
        // The draft only counts when it belongs to this same submission AND the same attempt. A
        // teacher Reset bumps the attempt, so a draft from before the reset is correctly ignored,
        // while a plain reload (attempt unchanged) always keeps the local copy.
        const serverMap: Record<string, string> = {};
        const recoveredIds: string[] = [];
        (startData.answers || []).forEach((a: any) => {
          serverMap[a.questionId] = a.answerText || '';
          // Adopt the server's per-answer write time. Untouched answers keep this timestamp, so
          // pushing them back is a no-op unless someone else has since written something newer —
          // in which case the server refuses ours and reports it (see `rejected`).
          const at = Number(a.updatedAt);
          if (Number.isFinite(at) && at > 0) editedAtRef.current[a.questionId] = at;
        });
        const merged: Record<string, string> = { ...serverMap };
        const draft = readDraft(examId);
        let recovered = 0;
        if (draft && draft.submissionId === startData.submissionId && draft.attempt === attemptRef.current) {
          for (const [questionId, answerText] of Object.entries(draft.answers)) {
            if (answerText && answerText.trim() && answerText !== merged[questionId]) {
              merged[questionId] = answerText;
              recoveredIds.push(questionId);
              recovered += 1;
            }
          }
        } else if (draft) {
          // The draft belongs to an earlier attempt (teacher Reset) — drop it so its stale answers
          // can never be resurrected, and send the student back to the first question.
          clearDraft(examId);
          clearPosition(examId);
          setCurrentQ(0);
        }
        // Recovered draft answers are this device's unsaved work: date them by when the draft was
        // written (mapped onto the server clock) rather than "now", so if another device genuinely
        // wrote something later the server still refuses ours and we find out via `rejected`.
        if (draft) {
          const draftAt = draft.savedAt + clockOffsetRef.current;
          for (const questionId of recoveredIds) editedAtRef.current[questionId] = draftAt;
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
        setTimeLeft(Math.max(0, Math.round((end - serverNow()) / 1000)));
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
  }, [examId, navigate, serverNow]);

  useEffect(() => {
    if (endTime === null) return;
    const tick = () => {
      // Compare against the server-aligned clock, not the raw device clock, so a device whose
      // clock is wrong can't submit early or keep working past the real deadline.
      const remaining = Math.max(0, Math.round((endTime - serverNow()) / 1000));
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
  }, [endTime, serverNow]);

  useEffect(() => { if (timeLeft === 0 && submissionId) handleSubmitExam(true); }, [timeLeft]);

  // Re-sync the whole screen from the server. Used when the server is authoritative about
  // something we got wrong: a teacher Reset cleared the answers (the attempt moved on), or
  // another tab/device holds newer answers for some questions.
  const syncFromServer = useCallback(async (opts: { resetPosition?: boolean; message?: string } = {}) => {
    if (!examId || !exam) return;
    try {
      const startData = await startExam(examId);
      attemptRef.current = Number(startData.attempt) > 0 ? Number(startData.attempt) : 1;
      if (startData.serverNow) {
        const serverMs = new Date(startData.serverNow).getTime();
        if (Number.isFinite(serverMs)) clockOffsetRef.current = serverMs - Date.now();
      }
      const serverMap: Record<string, string> = {};
      // Adopt the server's per-answer write times so subsequent pushes stay ordered correctly.
      const nextEditedAt: Record<string, number> = {};
      (startData.answers || []).forEach((a: any) => {
        serverMap[a.questionId] = a.answerText || '';
        const at = Number(a.updatedAt);
        if (Number.isFinite(at) && at > 0) nextEditedAt[a.questionId] = at;
      });
      editedAtRef.current = nextEditedAt;
      // Cancel a pending debounced draft write and update the in-memory mirror right away, so a
      // keystroke that was in flight can never re-persist the answers we are clearing here under
      // the NEW attempt number (which would make them look valid on the next reload).
      if (draftTimerRef.current) { clearTimeout(draftTimerRef.current); draftTimerRef.current = null; }
      answersRef.current = serverMap;
      setAnswers(serverMap);
      lastSavedJsonRef.current = JSON.stringify(serverMap);
      dirtyRef.current = false;
      setRecoveredCount(0);
      setSaveIndicator('idle');
      clearDraft(examId);
      if (opts.resetPosition) {
        clearPosition(examId);
        setCurrentQ(0);
      }
      const startedAtStr = startData.startedAt.endsWith('Z') ? startData.startedAt : startData.startedAt + 'Z';
      const end = new Date(startedAtStr).getTime() + exam.duration * 60 * 1000;
      setEndTime(end);
      setTimeLeft(Math.max(0, Math.round((end - serverNow()) / 1000)));
      if (opts.message) setNotice(opts.message);
    } catch {
      // Best effort — the regular save loop will try again.
    }
  }, [examId, exam, serverNow]);

  // The server has closed this submission: its time ran out and it was auto-submitted, it was
  // already submitted from another tab, or a teacher Reset it. No further save can ever succeed,
  // so finish the exam visibly instead of leaving "we are retrying" on screen for the rest of the
  // lesson — that endless banner is exactly what students (and the teacher watching them) saw at
  // the end of a timed exam whose server clock had already run out.
  const finishClosedSubmission = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setSaveError('');
    setSaveIndicator('idle');
    setRecoveredCount(0);
    // Keep the local draft: it is the only copy of anything typed after the last successful save,
    // and a teacher Reopen still makes it useful. Only the resume position is cleared.
    if (examId) clearPosition(examId);
    try {
      // Idempotent — an already-closed submission answers { already: true }.
      await submitExam(submissionId!);
      navigate(`/student/result/${submissionId}`);
    } catch {
      navigate('/student');
    }
  }, [examId, navigate, submissionId]);

  // One save path for every trigger: the tick, a question change, a blur, tab hide/close.
  const pushAnswers = useCallback(async (): Promise<boolean> => {
    if (!submissionId || submittedRef.current) return true;
    const snapshot = answersRef.current;
    const ansArray = buildAnswerPayload();
    setSaveIndicator('saving');
    try {
      const result = await saveAnswers(submissionId, ansArray, {
        attempt: attemptRef.current,
        clientSavedAt: serverNow(),
      });

      // The teacher Reset this submission while we were answering: the server bumped the attempt
      // and deleted the answers. Adopt that state instead of re-saving work that was cleared, and
      // only report success once the screen matches the server again.
      if (result?.staleAttempt) {
        await syncFromServer({
          resetPosition: true,
          message: 'Your teacher restarted this exam. Your answers were cleared and the timer restarted.',
        });
        return true;
      }

      // Another tab/device wrote newer answers to some questions, so ours were refused. Adopt the
      // server's (newer) values rather than quietly reporting a clean save.
      if (result?.rejected && result.rejected.length > 0) {
        await syncFromServer({ message: 'Newer answers were found for some questions — those were kept.' });
        return true;
      }

      lastSavedJsonRef.current = JSON.stringify(snapshot);
      dirtyRef.current = false;
      setSaveError('');
      setSaveIndicator('saved');
      setRecoveredCount(0); // the recovered answers are safely on the server now
      return true;
    } catch (err: any) {
      const reason = err?.message || 'Unknown error';
      // A definitive "this submission is over" from the server is not a network blip — retrying
      // can never succeed, so close the exam out honestly (and visibly) instead of looping.
      if (/not in progress|already submitted/i.test(reason)) {
        await finishClosedSubmission();
        return true;
      }
      // Never pretend it saved — leave the warning up (now with the actual reason) and retry.
      dirtyRef.current = true;
      setSaveError(reason);
      setSaveIndicator('unsaved');
      return false;
    }
  }, [submissionId, serverNow, syncFromServer, finishClosedSubmission]);

  // Push only when something actually changed. The delay backs off after a failure (3s → 30s) so
  // that ~30 students retrying in lockstep can never turn one slow save into a self-inflicted
  // stampede — the fixed 3s retry was what kept a struggling server down on exam day.
  useEffect(() => {
    if (!submissionId) return;
    let cancelled = false;
    let delay = 0;
    const schedule = (ms: number) => {
      if (cancelled || submittedRef.current) return;
      saveTimerRef.current = setTimeout(run, ms);
    };
    const run = async () => {
      if (cancelled || submittedRef.current) return;
      if (!dirtyRef.current && JSON.stringify(answersRef.current) === lastSavedJsonRef.current) {
        schedule(3000);
        return;
      }
      const ok = await pushAnswers();
      delay = ok ? 3000 : Math.min(delay ? delay * 2 : 6000, 30000);
      schedule(delay);
    };
    schedule(300); // push recovered draft answers straight away
    return () => {
      cancelled = true;
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    };
  }, [submissionId, pushAnswers]);

  // Flush on hide/refresh/close. `keepalive` lets the request finish after the page is gone,
  // and the draft write means even a failed request cannot lose the text.
  const flushSave = useCallback(() => {
    if (!submissionId || submittedRef.current) return;
    persistDraft(submissionId);
    const ansArray = buildAnswerPayload();
    // Carry the attempt so a page unload right after a teacher Reset can't push the cleared
    // answers back, and the server-aligned timestamp so this snapshot is ordered correctly.
    saveAnswersKeepalive(submissionId, ansArray, {
      attempt: attemptRef.current,
      clientSavedAt: serverNow(),
    }).catch(() => { /* best effort — never block unload */ });
  }, [submissionId, persistDraft, serverNow]);

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
    if (!submissionId) return;
    // Give the click an immediate, visible effect BEFORE the network round-trip starts — the
    // final save can block for a long time on a cold server.
    if (!isAuto) setSubmitting(true);
    // An automatic submit is already in flight. It either navigates on success or clears
    // `submitting` (and shows the error) on failure below, so this click is not lost even
    // though nothing new is started.
    if (submittedRef.current) return;
    try {
      // Final best-effort save FIRST. If the server already auto-submitted this submission
      // (lazy expiry) the save is rejected with 409 "not in progress" — that's fine, the submit
      // below is authoritative and succeeds idempotently. If it reports `staleAttempt` instead,
      // a teacher Reset this exam while we were submitting: closing the NEW attempt with this
      // tab's (deleted) answers is exactly the kind of loss we must never cause.
      let staleAttempt = false;
      try {
        const ansArray = buildAnswerPayload();
        const result = await saveAnswers(submissionId, ansArray, {
          attempt: attemptRef.current,
          clientSavedAt: serverNow(),
        });
        staleAttempt = result?.staleAttempt === true;
      } catch { /* ignore — submit below is authoritative */ }

      if (staleAttempt) {
        // Adopt the restart (answers cleared, timer restarted, back to Question 1) and do not
        // submit — the student has to answer the fresh attempt. The save/timer loops keep running.
        await syncFromServer({
          resetPosition: true,
          message: 'Your teacher restarted this exam. Your answers were cleared and the timer restarted.',
        });
        setSubmitting(false); // let the student answer the fresh attempt and submit again
        if (!isAuto) setError('This exam was restarted by your teacher, so it was not submitted. Please answer the questions again.');
        return;
      }

      submittedRef.current = true;
      // Stop auto-save and timer
      if (saveTimerRef.current) { clearInterval(saveTimerRef.current); saveTimerRef.current = null; }
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

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
      setRetryingSubmit(false);
      navigate(`/student/result/${submissionId}`);
    }
    catch (err: any) {
      submittedRef.current = false;
      // Clear the overlay on failure so the error (now readable, the confirm dialog is closed)
      // can be read and the student can retry — a stuck overlay is as confusing as a dead button.
      setSubmitting(false);
      if (isAuto) {
        // Don't silently give up on an automatic submit — tell the student and keep trying
        // (the server also sweeps expired submissions, but this gets the answers in immediately).
        setNotice('We could not reach the server to submit your exam. Retrying automatically…');
        setRetryingSubmit(true);
      } else {
        setError(err.message || 'Failed to submit');
      }
    }
  }, [submissionId, navigate, examId, serverNow, syncFromServer]);

  // Retry an automatic submit every 5s until the server confirms it (submittedRef guards
  // against overlapping attempts, and a success navigates away, unmounting this effect).
  useEffect(() => {
    if (!retryingSubmit || !submissionId) return;
    const id = setInterval(() => { if (!submittedRef.current) handleSubmitExam(true); }, 5000);
    return () => clearInterval(id);
  }, [retryingSubmit, submissionId, handleSubmitExam]);

  // Auto-dismiss the informational toast.
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 8000);
    return () => clearTimeout(id);
  }, [notice]);

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
    // Stamp the change on the server's clock so two tabs/devices are ordered correctly by the
    // server even if their device clocks disagree.
    editedAtRef.current[q.id] = serverNow();
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
          <button className="btn btn-danger" style={{ width: '100%', padding: '8px 16px', fontSize: 13 }} onClick={() => setConfirmSubmit(true)} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit Exam'}</button>
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
      {confirmSubmit && !submitting && (
        <div className="confirm-overlay" onClick={() => setConfirmSubmit(false)}><div className="confirm-dialog" onClick={(e) => e.stopPropagation()}><h3>Submit Exam</h3><p>You have answered {answeredCount} of {questions.length} questions. Are you sure you want to submit?</p><div className="confirm-actions"><button className="btn btn-ghost" onClick={() => setConfirmSubmit(false)}>Cancel</button><button className="btn btn-primary" onClick={() => { setConfirmSubmit(false); handleSubmitExam(); }}>Submit now</button></div></div></div>
      )}
      {submitting && (
        <div className="confirm-overlay" style={{ zIndex: 1100 }}>
          <div className="card" style={{ padding: '2rem 2.5rem', textAlign: 'center', maxWidth: 380 }}>
            <span className="spinner" />
            <h3 style={{ margin: '1rem 0 0.5rem', fontSize: 18, fontWeight: 700 }}>Submitting your exam…</h3>
            <p className="text-sm text-secondary" style={{ margin: 0 }}>Please keep this page open. Do not close or refresh.</p>
          </div>
        </div>
      )}
      {recoveredCount > 0 && (
        <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 100 }}>
          <div className="error-banner" style={{ background: '#0d9488', color: '#fff' }}>
            ✓ Recovered {recoveredCount} unsaved answer{recoveredCount === 1 ? '' : 's'} from this device — saving…</div>
        </div>
      )}
      {saveIndicator === 'unsaved' && recoveredCount === 0 && (
        <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1200 }}>
          <div className="error-banner" role="alert">
            Your answers are not saved yet{saveError ? ` (${saveError})` : ''}. Keep this page open — we are retrying.
          </div>
        </div>
      )}
      {notice && (
        <div style={{ position: 'fixed', bottom: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 100 }}>
          <div className="error-banner" role="status" style={{ background: '#1e3a8a', color: '#fff' }}>{notice}</div>
        </div>
      )}
      {error && (<div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1200 }}><div className="error-banner" role="alert">{error}</div></div>)}
    </div>
  );
}