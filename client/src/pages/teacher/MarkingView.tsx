import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getSubmission, finalizeMarking } from '../../api';
import type { FinalizeMarkingBody } from '../../types';
import TeacherSidebar from '../../components/TeacherSidebar';

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value.endsWith('Z') ? value : value + 'Z');
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatTook(startedAt: string | null | undefined, submittedAt: string | null | undefined): string | null {
  if (!startedAt || !submittedAt) return null;
  const start = new Date(startedAt.endsWith('Z') ? startedAt : startedAt + 'Z').getTime();
  const end = new Date(submittedAt.endsWith('Z') ? submittedAt : submittedAt + 'Z').getTime();
  if (isNaN(start) || isNaN(end) || end < start) return null;
  const mins = Math.round((end - start) / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

interface AnswerDetail {
  id: string;
  questionId: string;
  questionText: string;
  questionType: string;
  maxPoints: number;
  answerText: string;
  awardedPoints: number | null;
  feedback: string;
  correct: string;
}

export default function MarkingView() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [grades, setGrades] = useState<Record<string, { awardedPoints: number; feedback: string }>>({});
  const [confirmFinalize, setConfirmFinalize] = useState(false);

  useEffect(() => {
    if (!id) return;
    getSubmission(id).then((d) => {
      setSub(d);
      const g: Record<string, any> = {};
      (d.answers || []).forEach((a: any) => {
        g[a.questionId] = { awardedPoints: a.awardedPoints ?? 0, feedback: a.feedback || '' };
      });
      setGrades(g);
    }).catch((e) => setError(e.message || 'Failed to load submission')).finally(() => setLoading(false));
  }, [id]);

  const running = () => Object.values(grades).reduce((s, g) => s + (g.awardedPoints || 0), 0);
  const totalMax = () => sub?.answers ? sub.answers.reduce((s: number, a: any) => s + a.maxPoints, 0) : 0;

  const setPts = (qid: string, v: number) => setGrades((p) => ({ ...p, [qid]: { ...p[qid], awardedPoints: v } }));
  const setFb = (qid: string, v: string) => setGrades((p) => ({ ...p, [qid]: { ...p[qid], feedback: v } }));

  const doFinalize = async (skipZeroCheck = false) => {
    if (saving) return;
    if (!skipZeroCheck) {
      const hasZero = sub.answers.some((a: any) => a.questionType !== 'mcq' && (grades[a.questionId]?.awardedPoints ?? 0) === 0);
      if (hasZero && !confirmFinalize) {
        setConfirmFinalize(true);
        return;
      }
    }
    setSaving(true);
    setConfirmFinalize(false);
    setError('');
    try {
      const b: FinalizeMarkingBody = {
        answers: sub.answers.map((a: any) => ({
          questionId: a.questionId,
          awardedPoints: grades[a.questionId]?.awardedPoints ?? a.awardedPoints ?? 0,
          feedback: grades[a.questionId]?.feedback ?? a.feedback ?? ''
        }))
      };
      await finalizeMarking(sub.id, b);
      navigate('/teacher/submissions');
    } catch (err: any) {
      setError(err.message || 'Failed to save marks');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-center"><span className="spinner" /></div>;
  if (!sub) return <div className="error-banner">Submission not found</div>;
  const tm = totalMax();
  const rs = running();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <TeacherSidebar />
      <main className="main-content" style={{ maxWidth: 1000 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border-subtle)' }}>
          <img src="/logo.png" alt="Logo" style={{ height: 50, width: 140, maxWidth: '100%', objectFit: 'contain' }} />
        </div>
        <button className="btn btn-ghost btn-sm mb-2" style={{ border: '1px solid var(--border-medium)' }} onClick={() => navigate('/teacher/submissions')}>&larr; Back to Submissions</button>
        {error && <div className="error-banner">{error}</div>}
        
        <div className="marking-header">
          <div className="marking-student-info">
            <h2>{sub.student?.name} {sub.student?.surname}</h2>
            <p className="text-secondary" style={{ marginTop: 4, fontWeight: 500 }}>
              {sub.student?.studentId ? <>ID / Passport: {sub.student.studentId} &middot; </> : null}Exam: {sub.examTitle}
            </p>
            <div className="text-sm" style={{ marginTop: 10, display: 'flex', gap: 16, flexWrap: 'wrap', color: 'var(--text-hint)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                ▶ Started: <strong style={{ color: 'var(--text-secondary)' }}>{formatDateTime(sub.startedAt)}</strong>
              </span>
              {sub.submittedAt && (
                <>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    ✔ Submitted: <strong style={{ color: 'var(--text-secondary)' }}>{formatDateTime(sub.submittedAt)}</strong>
                  </span>
                  {formatTook(sub.startedAt, sub.submittedAt) && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--teal-800)' }}>
                      ⏱️ Took: <strong>{formatTook(sub.startedAt, sub.submittedAt)}</strong>
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div className="marking-score-display">
              <div className="marking-score-value">
                {rs}<span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-hint)' }}> / {tm}</span>
              </div>
              <div className="marking-score-label">Running Score</div>
            </div>
            <button className="btn btn-primary" onClick={() => doFinalize()} disabled={saving}>
              {saving ? <span className="spinner" /> : 'Finalize Grade'}
            </button>
          </div>
        </div>
        
        <div className="progress-bar" style={{ marginBottom: '2rem' }}>
          <div className="progress-fill" style={{ width: `${tm ? (rs / tm) * 100 : 0}%` }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {(sub.answers || []).map((a: AnswerDetail, index: number) => {
            const isMCQ = a.questionType === 'mcq';
            const correct = isMCQ && a.answerText === a.correct;
            const g = grades[a.questionId] || { awardedPoints: 0, feedback: '' };
            return (
              <div key={a.questionId} className="card marking-question" style={{ margin: 0 }}>
                <div className="marking-q-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={`badge ${a.questionType === 'mcq' ? 'badge-mcq' : a.questionType === 'short' ? 'badge-short' : 'badge-long'}`}>{a.questionType.toUpperCase()}</span>
                    <span className="text-sm text-secondary" style={{ fontWeight: 600 }}>Question {index + 1} &middot; {a.maxPoints} pts max</span>
                  </div>
                  <div className="marking-q-points-input">
                    <label className="label" style={{ margin: 0, fontWeight: 600 }}>Award Points:</label>
                    <input className="input" type="number" min={0} max={a.maxPoints} value={g.awardedPoints} onChange={(e) => setPts(a.questionId, Number(e.target.value))} disabled={isMCQ} style={{ maxWidth: 80, minHeight: 38 }} />
                    <span className="text-sm text-secondary" style={{ fontWeight: 500 }}>/ {a.maxPoints}</span>
                  </div>
                </div>
                
                <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>{a.questionText}</p>
                
                <div className="answer-box" style={isMCQ ? (correct ? { borderColor: 'rgba(16, 185, 129, 0.3)', background: 'var(--teal-50)' } : { borderColor: 'rgba(239, 68, 68, 0.3)', background: 'var(--red-50)' }) : {}}>
                  {isMCQ && (
                    <span style={{ marginRight: 8, fontWeight: 700, color: correct ? 'var(--teal-800)' : 'var(--red-800)' }}>
                      {correct ? '✓ Correct Answer' : '✗ Incorrect Answer'}
                    </span>
                  )}
                  {isMCQ ? <p style={{ marginTop: 4 }}>{a.answerText || <em className="text-hint">No answer</em>}</p> : (a.answerText || <em className="text-hint">No answer provided</em>)}
                </div>

                {isMCQ && !correct && (
                  <p className="text-sm" style={{ color: 'var(--teal-800)', fontWeight: 600, marginTop: 8 }}>
                    ✓ Correct Option: {a.correct}
                  </p>
                )}
                
                {!isMCQ && (
                  <div className="marking-q-feedback" style={{ marginTop: 16 }}>
                    <label className="label">Add Grading Feedback</label>
                    <textarea className="input" rows={2} value={g.feedback} onChange={(e) => setFb(a.questionId, e.target.value)} placeholder="Type feedback comments for this question..." style={{ resize: 'vertical' }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem' }}>
          <button className="btn btn-primary" onClick={() => doFinalize()} disabled={saving}>
            {saving ? <span className="spinner" /> : 'Finalize Grade & Submit'}
          </button>
        </div>

        {confirmFinalize && (
          <div className="confirm-overlay" onClick={() => setConfirmFinalize(false)}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>Confirm Zero-Point Grades</h3>
              <p>One or more written answers currently have 0 points assigned. Would you like to proceed anyway?</p>
              <div className="confirm-actions">
                <button className="btn btn-ghost" onClick={() => setConfirmFinalize(false)}>Go Back</button>
                <button className="btn btn-primary" onClick={() => doFinalize(true)}>Yes, Finalize</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}